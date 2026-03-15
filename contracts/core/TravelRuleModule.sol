// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/ITravelRuleModule.sol";
import "../interfaces/IIdentityRegistry.sol";
import "../interfaces/IIdentitySBT.sol";
import "../interfaces/ICRATSAccessControl.sol";
import "../config/CRATSConfig.sol";
import "../libraries/JurisdictionCodes.sol";

/**
 * @title TravelRuleModule
 * @dev Implements FATF Recommendation 16 (Travel Rule) compliance
 * 
 * Records originator and beneficiary information for transfers above threshold.
 * Required for regulatory approval in most jurisdictions.
 * 
 * FATF Travel Rule Thresholds:
 * - FATF Global: USD 1,000 / EUR 1,000
 * - United States: USD 3,000 (FinCEN)
 * - European Union: EUR 1,000 (MiCA)
 * - Singapore: SGD 1,500 (MAS)
 */
contract TravelRuleModule is AccessControl, ReentrancyGuard, ITravelRuleModule {

    // === State Variables ===

    // Identity Registry
    IIdentityRegistry private _identityRegistry;

    // Compliance Module
    address private _complianceModule;

    // Travel Rule threshold (default: 1000 * 10^18 = 1000 tokens)
    uint256 private _threshold = 1000 * 10**18;

    // Transfer records
    mapping(bytes32 => TravelRuleData) private _transfers;

    // Transfer history per address
    mapping(address => bytes32[]) private _addressHistory;

    // Transfer count per address
    mapping(address => uint256) private _transferCount;

    // Risk score thresholds
    uint8 public constant LOW_RISK_THRESHOLD = 30;
    uint8 public constant MEDIUM_RISK_THRESHOLD = 60;
    uint8 public constant HIGH_RISK_THRESHOLD = 80;

    // Roles
    bytes32 public constant REPORTER_ROLE = keccak256("REPORTER_ROLE");
    bytes32 public constant COMPLIANCE_ROLE = keccak256("COMPLIANCE_ROLE");

    // === Modifiers ===

    /**
     * @dev Modifier to check if caller is compliance module or has COMPLIANCE_ROLE
     */
    modifier onlyComplianceModule() {
        require(
            msg.sender == _complianceModule || hasRole(COMPLIANCE_ROLE, msg.sender),
            "TravelRuleModule: Caller is not compliance module"
        );
        _;
    }

    // === Constructor ===

    constructor(
        address admin,
        address identityRegistryAddress,
        address complianceModuleAddress,
        uint256 threshold
    ) {
        require(admin != address(0), "TravelRuleModule: Admin cannot be zero");
        require(identityRegistryAddress != address(0), "TravelRuleModule: Registry cannot be zero");
        require(complianceModuleAddress != address(0), "TravelRuleModule: Compliance cannot be zero");

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REPORTER_ROLE, admin);

        _identityRegistry = IIdentityRegistry(identityRegistryAddress);
        _complianceModule = complianceModuleAddress;
        _threshold = threshold;
    }

    // === External View Functions ===

    function getTransferData(bytes32 txHash) 
        external 
        view 
        override 
        returns (TravelRuleData memory) 
    {
        return _transfers[txHash];
    }

    function getOriginator(bytes32 txHash)
        external
        view
        override
        returns (uint256 tokenId, address wallet, bytes32 nameHash, string memory country)
    {
        TravelRuleData memory data = _transfers[txHash];
        return (data.originatorTokenId, data.originatorWallet, data.originatorNameHash, data.originatorCountry);
    }

    function getBeneficiary(bytes32 txHash)
        external
        view
        override
        returns (uint256 tokenId, address wallet, bytes32 nameHash, string memory country)
    {
        TravelRuleData memory data = _transfers[txHash];
        return (data.beneficiaryTokenId, data.beneficiaryWallet, data.beneficiaryNameHash, data.beneficiaryCountry);
    }

    function getTransferHistory(address wallet, uint256 limit) 
        external 
        view 
        override 
        returns (bytes32[] memory) 
    {
        uint256 count = _transferCount[wallet];
        if (limit == 0 || limit > count) {
            limit = count;
        }

        bytes32[] memory history = new bytes32[](limit);
        for (uint256 i = 0; i < limit; i++) {
            history[i] = _addressHistory[wallet][i];
        }

        return history;
    }

    function getThreshold() external view override returns (uint256) {
        return _threshold;
    }

    function requiresReview(bytes32 txHash) external view override returns (bool) {
        return _transfers[txHash].requiresReview;
    }

    function getTransferCount(address wallet) external view override returns (uint256) {
        return _transferCount[wallet];
    }

    // === Core Functions ===

    /**
     * @dev Record a transfer for Travel Rule compliance
     * Only called by compliance module for transfers above threshold
     */
    function recordTransfer(
        address tokenContract,
        address from,
        address to,
        uint256 amount
    ) external override onlyComplianceModule returns (bytes32) {
        // Generate unique txHash
        bytes32 txHash = keccak256(
            abi.encodePacked(
                tokenContract,
                from,
                to,
                amount,
                block.timestamp,
                block.number
            )
        );

        // Get originator identity data
        uint256 originatorTokenId = _identityRegistry.getTokenId(from);
        IIdentitySBT.IdentityData memory originatorData = _identityRegistry.getIdentity(from);

        // Get beneficiary identity data
        uint256 beneficiaryTokenId = _identityRegistry.getTokenId(to);
        IIdentitySBT.IdentityData memory beneficiaryData = _identityRegistry.getIdentity(to);

        // Create transfer record
        TravelRuleData storage transfer = _transfers[txHash];

        transfer.txHash = txHash;
        transfer.tokenContract = tokenContract;
        transfer.amount = amount;
        transfer.timestamp = uint64(block.timestamp);

        // Originator info - HASH NAME FOR PRIVACY (GDPR compliance)
        transfer.originatorTokenId = originatorTokenId;
        transfer.originatorWallet = from;
        string memory originatorName = _getInvestorName(originatorTokenId);
        transfer.originatorNameHash = keccak256(bytes(originatorName));  // ✅ HASHED
        transfer.originatorCountry = _jurisdictionToCountryCode(originatorData.jurisdiction);
        transfer.originatorAccountId = bytes32(uint256(uint160(from)));

        // Beneficiary info - HASH NAME FOR PRIVACY (GDPR compliance)
        transfer.beneficiaryTokenId = beneficiaryTokenId;
        transfer.beneficiaryWallet = to;
        string memory beneficiaryName = _getInvestorName(beneficiaryTokenId);
        transfer.beneficiaryNameHash = keccak256(bytes(beneficiaryName));  // ✅ HASHED
        transfer.beneficiaryCountry = _jurisdictionToCountryCode(beneficiaryData.jurisdiction);
        transfer.beneficiaryAccountId = bytes32(uint256(uint160(to)));

        // Calculate risk score
        transfer.riskScore = _calculateRiskScore(originatorData, beneficiaryData, amount);

        // Flag for review if high risk
        transfer.requiresReview = transfer.riskScore >= MEDIUM_RISK_THRESHOLD;

        // Update history
        _addressHistory[from].push(txHash);
        _addressHistory[to].push(txHash);
        _transferCount[from]++;
        _transferCount[to]++;

        // Emit events
        emit TransferRecorded(txHash, from, to, amount, transfer.riskScore);

        if (transfer.requiresReview) {
            emit TransferFlaggedForReview(
                txHash,
                from,
                to,
                amount,
                "Medium/High risk score"
            );
        }

        return txHash;
    }

    /**
     * @dev Set Travel Rule threshold
     */
    function setThreshold(uint256 threshold) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        require(threshold > 0, "TravelRuleModule: Threshold must be positive");
        _threshold = threshold;
        emit ThresholdUpdated(threshold);
    }

    /**
     * @dev Report transfer to regulatory authority
     */
    function reportToAuthority(bytes32 txHash) external override onlyRole(REPORTER_ROLE) {
        require(_transfers[txHash].txHash != bytes32(0), "TravelRuleModule: Transfer not found");
        _transfers[txHash].isReported = true;
        emit TransferReported(txHash, msg.sender, uint64(block.timestamp));
    }

    /**
     * @dev Mark transfer as reviewed
     */
    function markReviewed(bytes32 txHash, bool approved) external override onlyRole(REPORTER_ROLE) {
        require(_transfers[txHash].txHash != bytes32(0), "TravelRuleModule: Transfer not found");
        _transfers[txHash].requiresReview = !approved;
        emit TransferReviewed(txHash, approved, msg.sender);
    }

    // === Internal Functions ===

    /**
     * @dev Calculate risk score for a transfer
     * Risk factors: jurisdiction, amount, investor type, transaction patterns
     */
    function _calculateRiskScore(
        IIdentitySBT.IdentityData memory originator,
        IIdentitySBT.IdentityData memory beneficiary,
        uint256 amount
    ) internal pure returns (uint8) {
        uint8 riskScore = 0;

        // Factor 1: High-risk jurisdiction (+20 points)
        if (originator.jurisdiction == JurisdictionCodes.CN || 
            originator.jurisdiction == JurisdictionCodes.RU ||
            beneficiary.jurisdiction == JurisdictionCodes.CN ||
            beneficiary.jurisdiction == JurisdictionCodes.RU) {
            riskScore += 20;
        }

        // Factor 2: Large amount (+10-30 points based on size)
        if (amount > 10000 * 10**18) {
            riskScore += 10;
        }
        if (amount > 100000 * 10**18) {
            riskScore += 10;
        }
        if (amount > 1000000 * 10**18) {
            riskScore += 10;
        }

        // Factor 3: Different jurisdictions (+15 points)
        if (originator.jurisdiction != beneficiary.jurisdiction) {
            riskScore += 15;
        }

        // Factor 4: Non-accredited investor (+10 points)
        if (!originator.isAccredited || !beneficiary.isAccredited) {
            riskScore += 10;
        }

        // Factor 5: Retail investor (+10 points)
        if (originator.role == CRATSConfig.InvestorRole.Investor ||
            beneficiary.role == CRATSConfig.InvestorRole.Investor) {
            riskScore += 10;
        }

        // Cap at 100
        if (riskScore > 100) {
            riskScore = 100;
        }

        return riskScore;
    }

    /**
     * @dev Get investor name from token ID
     * In production, this would query an identity oracle or DID document
     */
    function _getInvestorName(uint256 tokenId) internal pure returns (string memory) {
        // Placeholder - in production, fetch from identity data or oracle
        return string(abi.encodePacked("Investor-", _uint256ToString(tokenId)));
    }

    /**
     * @dev Convert jurisdiction code to ISO 3166-1 alpha-2 country code
     */
    function _jurisdictionToCountryCode(uint16 jurisdiction) internal pure returns (string memory) {
        if (jurisdiction == JurisdictionCodes.US) return "US";
        if (jurisdiction == JurisdictionCodes.GB) return "GB";
        if (jurisdiction == JurisdictionCodes.DE) return "DE";
        if (jurisdiction == JurisdictionCodes.FR) return "FR";
        if (jurisdiction == JurisdictionCodes.CH) return "CH";
        if (jurisdiction == JurisdictionCodes.SG) return "SG";
        if (jurisdiction == JurisdictionCodes.HK) return "HK";
        if (jurisdiction == JurisdictionCodes.JP) return "JP";
        if (jurisdiction == JurisdictionCodes.AU) return "AU";
        if (jurisdiction == JurisdictionCodes.CA) return "CA";
        if (jurisdiction == JurisdictionCodes.AE) return "AE";
        if (jurisdiction == JurisdictionCodes.CN) return "CN";
        if (jurisdiction == JurisdictionCodes.KR) return "KR";
        if (jurisdiction == JurisdictionCodes.IN) return "IN";
        if (jurisdiction == JurisdictionCodes.BR) return "BR";
        if (jurisdiction == JurisdictionCodes.RU) return "RU";
        
        return "XX"; // Unknown
    }

    /**
     * @dev Convert uint256 to string
     */
    function _uint256ToString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }

    /**
     * @dev Update compliance module address
     */
    function setComplianceModule(address newCompliance) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newCompliance != address(0), "TravelRuleModule: Invalid address");
        _complianceModule = newCompliance;
    }

    // === PII Verification Functions (GDPR Compliance) ===

    /**
     * @dev Verify originator name against stored hash
     * Only callable by regulators
     */
    function verifyOriginatorName(
        bytes32 txHash,
        string calldata name
    ) external override view onlyRole(REPORTER_ROLE) returns (bool) {
        bytes32 nameHash = keccak256(bytes(name));
        return _transfers[txHash].originatorNameHash == nameHash;
    }

    /**
     * @dev Verify beneficiary name against stored hash
     * Only callable by regulators
     */
    function verifyBeneficiaryName(
        bytes32 txHash,
        string calldata name
    ) external override view onlyRole(REPORTER_ROLE) returns (bool) {
        bytes32 nameHash = keccak256(bytes(name));
        return _transfers[txHash].beneficiaryNameHash == nameHash;
    }

    /**
     * @dev Get originator name hash (regulator only)
     */
    function getOriginatorNameHash(bytes32 txHash) external override view onlyRole(REPORTER_ROLE) returns (bytes32) {
        return _transfers[txHash].originatorNameHash;
    }

    /**
     * @dev Get beneficiary name hash (regulator only)
     */
    function getBeneficiaryNameHash(bytes32 txHash) external override view onlyRole(REPORTER_ROLE) returns (bytes32) {
        return _transfers[txHash].beneficiaryNameHash;
    }
}
