// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/compliance/ICompliance.sol";
import "../interfaces/identity/IIdentityRegistry.sol";
import "../interfaces/identity/IIdentitySBT.sol";
import "../utils/CRATSConfig.sol";

/**
 * @title Compliance
 * @dev Implements regulatory transfer rules for CRATS Protocol assets.
 * // Source: ERC-3643 T-REX Compliance implementation
 */
contract Compliance is
    Initializable,
    AccessControlUpgradeable,
    UUPSUpgradeable,
    ICompliance
{
    using SafeERC20 for IERC20;

    IIdentityRegistry public identityRegistry;

    // Rules
    mapping(uint16 => bool) public blockedJurisdictions;
    mapping(uint16 => bool) public allowedJurisdictions;
    bool public useAllowlist;
    mapping(address => uint256) public maxInvestorCount;
    mapping(address => uint256) public currentInvestorCount;

    // NEW: Role-based holding limits
    mapping(uint8 => uint256) private _roleLimits;

    // ─── Compliance Setup Fee (§2.1) ─────
    IERC20 public usdc;
    address public protocolTreasury;
    uint256 public complianceSetupFee;

    event JurisdictionBlocked(uint16 indexed jurisdiction, bool blocked);
    event JurisdictionAllowed(uint16 indexed jurisdiction, bool allowed);
    event MaxInvestorCountSet(address indexed token, uint256 maxCount);
    event RoleLimitSet(uint8 indexed role, uint256 limit);
    event AllowlistModeUpdated(bool enabled);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address admin,
        address identityRegistry_
    ) public initializer {
        __AccessControl_init();
        __UUPSUpgradeable_init();

        identityRegistry = IIdentityRegistry(identityRegistry_);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(CRATSConfig.COMPLIANCE_ROLE, admin);
    }

    // === Admin Functions ===

    function setJurisdictionBlocked(uint16 jurisdiction, bool blocked)
        external
        onlyRole(CRATSConfig.COMPLIANCE_ROLE)
    {
        blockedJurisdictions[jurisdiction] = blocked;
        emit JurisdictionBlocked(jurisdiction, blocked);
    }

    function setJurisdictionAllowed(uint16 jurisdiction, bool allowed)
        external
        onlyRole(CRATSConfig.COMPLIANCE_ROLE)
    {
        allowedJurisdictions[jurisdiction] = allowed;
        emit JurisdictionAllowed(jurisdiction, allowed);
    }

    function setMaxInvestorCount(address token, uint256 maxCount)
        external
        onlyRole(CRATSConfig.COMPLIANCE_ROLE)
    {
        maxInvestorCount[token] = maxCount;
        emit MaxInvestorCountSet(token, maxCount);
    }

    // ============================================================
    // COMPLIANCE SETUP FEE
    // ============================================================

    function setComplianceSetupFee(address _usdc, address _treasury, uint256 _fee)
        external onlyRole(DEFAULT_ADMIN_ROLE)
    {
        usdc = IERC20(_usdc);
        protocolTreasury = _treasury;
        complianceSetupFee = _fee;
    }

    /// @notice Batch-setup compliance rules for a token and collect setup fee (§2.1)
    function setupRuleset(
        address token,
        uint16[] calldata blockJurisdictions,
        uint16[] calldata allowJurisdictions,
        uint256 maxInvestors
    ) external onlyRole(CRATSConfig.COMPLIANCE_ROLE) {
        if (complianceSetupFee > 0 && address(usdc) != address(0) && protocolTreasury != address(0)) {
            usdc.safeTransferFrom(_msgSender(), protocolTreasury, complianceSetupFee);
        }
        for (uint256 i = 0; i < blockJurisdictions.length; i++) {
            blockedJurisdictions[blockJurisdictions[i]] = true;
        }
        for (uint256 i = 0; i < allowJurisdictions.length; i++) {
            allowedJurisdictions[allowJurisdictions[i]] = true;
        }
        if (maxInvestors > 0) {
            maxInvestorCount[token] = maxInvestors;
        }
    }

    // ============================================================
    // NEW: Role-Based Limits (Investor Type Holding Limits)
    // ============================================================

    /**
     * @notice Set role-based holding limits.
     * @dev Different investor roles can have different maximum holding amounts.
     *      Example: ROLE_INVESTOR = 1000 tokens, ROLE_INSTITUTIONAL = unlimited
     */
    function setRoleLimit(uint8 role, uint256 limit) external override onlyRole(CRATSConfig.COMPLIANCE_ROLE) {
        _roleLimits[role] = limit;
        emit RoleLimitSet(role, limit);
    }

    /**
     * @notice Get role-based holding limit.
     * @dev Returns 0 if no limit is set for this role.
     */
    function getRoleLimit(uint8 role) external view override returns (uint256) {
        return _roleLimits[role];
    }

    // ============================================================
    // NEW: Allowlist Mode (Strict Jurisdiction Control)
    // ============================================================

    /**
     * @notice Enable or disable jurisdiction allowlist mode.
     * @dev When enabled, ONLY addresses from allowed jurisdictions can receive tokens.
     *      When disabled, uses blocklist mode (all except blocked jurisdictions).
     */
    function setUseAllowlist(bool enabled) external override onlyRole(CRATSConfig.COMPLIANCE_ROLE) {
        useAllowlist = enabled;
        emit AllowlistModeUpdated(enabled);
    }

    // === Compliance Check ===

    /**
     * @dev Checks if a transfer is valid under current regulations.
     * // Source: ERC-3643 Compliance Pattern
     */
    function checkTransfer(
        address from,
        address to,
        uint256 /* amount */,
        address tokenContract
    ) external view override returns (TransferCheckResult memory) {
        // 1. Verification Check
        if (!identityRegistry.isVerified(from)) {
            return TransferCheckResult(false, "Compliance: sender not verified");
        }
        if (!identityRegistry.isVerified(to)) {
            return TransferCheckResult(false, "Compliance: recipient not verified");
        }

        // 1.5 Restriction Check
        if (isInvestorRestricted(tokenContract, from)) {
            return TransferCheckResult(false, "Compliance: sender restricted");
        }
        if (isInvestorRestricted(tokenContract, to)) {
            return TransferCheckResult(false, "Compliance: recipient restricted");
        }

        // 2. Jurisdiction Check
        IIdentitySBT.IdentityData memory toData = identityRegistry.getIdentity(to);
        if (blockedJurisdictions[toData.jurisdiction]) {
            return TransferCheckResult(false, "Compliance: jurisdiction blocked");
        }
        if (useAllowlist && !allowedJurisdictions[toData.jurisdiction]) {
            return TransferCheckResult(false, "Compliance: jurisdiction not in allowlist");
        }

        // 3. Role-Based Holding Limits (NEW)
        if (_roleLimits[toData.role] > 0) {
            // Would need balance tracking to fully implement
            // This is a placeholder for future enhancement
        }

        // 4. Investor Count Limits
        if (maxInvestorCount[tokenContract] > 0 && currentInvestorCount[tokenContract] >= maxInvestorCount[tokenContract]) {
            return TransferCheckResult(false, "Compliance: max investor count reached");
        }

        return TransferCheckResult(true, "");
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}

    // === Investor Restrictions ===
    struct RestrictionRecord {
        address investor;
        bytes32 reasonCode;
        address authority;
        uint256 startTime;
        uint256 endTime;
        bool active;
        bytes32 evidenceHash;
    }

    // assetToken => investor => RestrictionRecord
    mapping(address => mapping(address => RestrictionRecord)) public investorRestrictions;

    function restrictHolder(
        address token,
        address investor,
        bytes32 reasonCode,
        uint256 duration,
        bytes32 evidenceHash
    ) external override onlyRole(CRATSConfig.COMPLIANCE_ROLE) {
        require(duration > 0 && duration <= 180 days, "Compliance: invalid duration");
        require(evidenceHash != bytes32(0), "Compliance: evidence hash required");

        investorRestrictions[token][investor] = RestrictionRecord({
            investor: investor,
            reasonCode: reasonCode,
            authority: msg.sender,
            startTime: block.timestamp,
            endTime: block.timestamp + duration,
            active: true,
            evidenceHash: evidenceHash
        });

        emit HolderRestricted(token, investor, reasonCode, block.timestamp + duration, evidenceHash);
    }

    function removeRestriction(
        address token,
        address investor,
        string calldata justification
    ) external override {
        require(
            hasRole(CRATSConfig.COMPLIANCE_ROLE, msg.sender) || hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Compliance: unauthorized"
        );
        require(investorRestrictions[token][investor].active, "Compliance: not restricted");
        require(bytes(justification).length > 0, "Compliance: justification required");

        investorRestrictions[token][investor].active = false;

        emit HolderRestrictionRemoved(token, investor, justification);
    }

    function isInvestorRestricted(address token, address investor) public view override returns (bool) {
        RestrictionRecord memory record = investorRestrictions[token][investor];
        if (!record.active) {
            return false;
        }
        if (block.timestamp > record.endTime) {
            return false;
        }
        return true;
    }
}
