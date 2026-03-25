// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "../interfaces/compliance/ITravelRuleModule.sol";
import "../interfaces/identity/IIdentityRegistry.sol";
import "../utils/CRATSConfig.sol";

/**
 * @title TravelRuleModule
 * @dev Records identity hashes for transactions to comply with FATF R.16.
 * // Source: FATF Recommendation 16 (Travel Rule) implementation
 */
contract TravelRuleModule is
    Initializable,
    AccessControlUpgradeable,
    UUPSUpgradeable,
    ITravelRuleModule
{
    IIdentityRegistry public identityRegistry;

    mapping(bytes32 => TransferRecord) private _records;

    // NEW: Wallet to transaction history mapping
    mapping(address => bytes32[]) private _walletTransfers;

    // NEW: Threshold for Travel Rule reporting
    uint256 private _threshold;

    // NEW: Count of reported transfers
    uint256 private _reportedCount;

    event TransferRecorded(
        bytes32 indexed txHash,
        address indexed tokenContract,
        address indexed fromWallet,
        address toWallet,
        uint256 amount
    );

    event ThresholdUpdated(uint256 oldThreshold, uint256 newThreshold);
    event ReportedToAuthority(bytes32 indexed txHash, bytes32 authorityHash, uint64 timestamp);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address admin,
        address identityRegistry_,
        uint256 threshold_
    ) public initializer {
        __AccessControl_init();
        __UUPSUpgradeable_init();

        identityRegistry = IIdentityRegistry(identityRegistry_);
        _threshold = threshold_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(CRATSConfig.COMPLIANCE_ROLE, admin);
        _grantRole(CRATSConfig.REGULATOR_ROLE, admin);
    }

    /**
     * @dev Records a transfer for Travel Rule compliance.
     * Use identity hashes only, no PII on chain.
     */
    function recordTransfer(
        bytes32 txHash,
        address tokenContract,
        uint256 amount,
        address fromWallet,
        address toWallet,
        bytes32 originatorIdentityHash,
        bytes32 beneficiaryIdentityHash,
        bytes32 originatorAccountIdHash,
        bytes32 beneficiaryAccountIdHash,
        uint8 riskScore,
        bool requiresReview
    ) external override onlyRole(CRATSConfig.COMPLIANCE_ROLE) {
        require(_records[txHash].timestamp == 0, "TravelRule: tx already recorded");

        _records[txHash] = TransferRecord({
            txHash: txHash,
            tokenContract: tokenContract,
            amount: amount,
            timestamp: uint64(block.timestamp),
            originatorIdentityHash: originatorIdentityHash,
            beneficiaryIdentityHash: beneficiaryIdentityHash,
            originatorAccountIdHash: originatorAccountIdHash,
            beneficiaryAccountIdHash: beneficiaryAccountIdHash,
            riskScore: riskScore,
            requiresReview: requiresReview,
            isReported: false
        });

        // NEW: Track transfers for each wallet
        _walletTransfers[fromWallet].push(txHash);
        if (toWallet != fromWallet) {
            _walletTransfers[toWallet].push(txHash);
        }

        emit TransferRecorded(txHash, tokenContract, fromWallet, toWallet, amount);
    }

    function getTransfer(bytes32 txHash) external view override returns (TransferRecord memory) {
        return _records[txHash];
    }

    /**
     * @dev Mark a transaction as reported to regulators.
     */
    function markReported(bytes32 txHash) external onlyRole(CRATSConfig.REGULATOR_ROLE) {
        _records[txHash].isReported = true;
    }

    // ============================================================
    // NEW: Travel Rule Threshold Functions (FATF R.16 Compliance)
    // ============================================================

    /**
     * @notice Set the Travel Rule threshold amount.
     * @dev Only callable by admin. Threshold determines minimum amount for reporting.
     *      FATF default: 1000 USD equivalent (adjust for token decimals)
     */
    function setThreshold(uint256 threshold_) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 oldThreshold = _threshold;
        _threshold = threshold_;
        emit ThresholdUpdated(oldThreshold, threshold_);
    }

    /**
     * @notice Get the current Travel Rule threshold.
     */
    function threshold() external view override returns (uint256) {
        return _threshold;
    }

    // ============================================================
    // NEW: Transfer History Lookup (Regulatory Audit Requirement)
    // ============================================================

    /**
     * @notice Get transfer history for a wallet address.
     * @dev Returns array of transaction hashes for the given wallet.
     *      Useful for regulatory audits and compliance checks.
     */
    function getTransferHistory(address wallet) external view override returns (bytes32[] memory) {
        return _walletTransfers[wallet];
    }

    /**
     * @notice Get the number of transfers for a wallet.
     */
    function getTransferCount(address wallet) external view returns (uint256) {
        return _walletTransfers[wallet].length;
    }

    // ============================================================
    // NEW: Regulatory Reporting (FATF R.16 Enforcement)
    // ============================================================

    /**
     * @notice Mark transfer as reported to regulatory authority.
     * @dev Only callable by regulator role. Records which authority was notified.
     */
    function reportToAuthority(
        bytes32 txHash,
        bytes32 authorityHash
    ) external override onlyRole(CRATSConfig.REGULATOR_ROLE) {
        require(_records[txHash].timestamp != 0, "TravelRule: tx not found");
        require(!_records[txHash].isReported, "TravelRule: already reported");

        _records[txHash].isReported = true;
        _reportedCount++;

        emit ReportedToAuthority(txHash, authorityHash, uint64(block.timestamp));
    }

    /**
     * @notice Get count of transfers reported to authorities.
     */
    function getReportedCount() external view override returns (uint256) {
        return _reportedCount;
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
