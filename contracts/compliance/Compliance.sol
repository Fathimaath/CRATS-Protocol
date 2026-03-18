// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "../interfaces/compliance/ICompliance.sol";
import "../interfaces/identity/IIdentityRegistry.sol";
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
    IIdentityRegistry public identityRegistry;

    // Rules
    mapping(uint16 => bool) public blockedJurisdictions;
    mapping(uint16 => bool) public allowedJurisdictions;
    bool public useAllowlist;
    mapping(address => uint256) public maxInvestorCount;
    mapping(address => uint256) public currentInvestorCount;

    event JurisdictionBlocked(uint16 indexed jurisdiction, bool blocked);
    event JurisdictionAllowed(uint16 indexed jurisdiction, bool allowed);
    event MaxInvestorCountSet(address indexed token, uint256 maxCount);

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

    // === Compliance Check ===

    /**
     * @dev Checks if a transfer is valid under current regulations.
     * // Source: ERC-3643 Compliance Pattern
     */
    function checkTransfer(
        address from,
        address to,
        uint256 /*amount*/,
        address /*tokenContract*/
    ) external view override returns (TransferCheckResult memory) {
        // 1. Verification Check
        if (!identityRegistry.isVerified(from)) {
            return TransferCheckResult(false, "Compliance: sender not verified");
        }
        if (!identityRegistry.isVerified(to)) {
            return TransferCheckResult(false, "Compliance: recipient not verified");
        }

        // 2. Jurisdiction Check
        IIdentitySBT.IdentityData memory toData = identityRegistry.getIdentity(to);
        if (blockedJurisdictions[toData.jurisdiction]) {
            return TransferCheckResult(false, "Compliance: jurisdiction blocked");
        }
        if (useAllowlist && !allowedJurisdictions[toData.jurisdiction]) {
            return TransferCheckResult(false, "Compliance: jurisdiction not in allowlist");
        }

        // 3. Investor Limits (simplified logic for pattern demonstration)
        // In a real implementation, we would track unique holders per asset token.

        return TransferCheckResult(true, "");
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
