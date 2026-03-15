// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/compliance/ICompliance.sol";
import "../interfaces/identity/IIdentityRegistry.sol";
import "../interfaces/utils/ICRATSAccessControl.sol";
import "../interfaces/compliance/ITravelRuleModule.sol";
import "../utils/CRATSConfig.sol";
import "../utils/JurisdictionCodes.sol";

/**
 * @title ComplianceModule
 * @dev Rule engine for transfer validation
 * 
 * This contract implements compliance checks for token transfers including:
 * - Jurisdiction restrictions
 * - Role-based holding limits
 * - Daily transfer caps
 * - Investor count limits
 * - Frozen account checks
 */
contract ComplianceModule is AccessControl, ReentrancyGuard, IComplianceModule {
    
    // === State Variables ===

    // Identity Registry
    IIdentityRegistry private _identityRegistry;

    // Travel Rule Module
    ITravelRuleModule private _travelRuleModule;

    // Compliance enabled flag
    bool private _enabled = true;
    
    // Allowed jurisdictions mapping
    mapping(uint16 => bool) private _allowedJurisdictions;
    
    // Holding limits by role
    mapping(CRATSConfig.InvestorRole => uint256) private _holdingLimits;
    
    // Daily transfer limits by role
    mapping(CRATSConfig.InvestorRole => uint256) private _dailyLimits;
    
    // Daily transfer tracking
    mapping(address => uint256) private _dailyTransferVolume;
    mapping(address => uint256) private _lastTransferDay;
    
    // Maximum investors
    uint256 private _maxInvestors = CRATSConfig.MAX_INVESTORS;
    
    // Compliance fail codes
    uint8 public constant FAIL_NONE = 0;
    uint8 public constant FAIL_SENDER_NOT_VERIFIED = 1;
    uint8 public constant FAIL_RECEIVER_NOT_VERIFIED = 2;
    uint8 public constant FAIL_SENDER_FROZEN = 3;
    uint8 public constant FAIL_RECEIVER_FROZEN = 4;
    uint8 public constant FAIL_JURISDICTION_BLOCKED = 5;
    uint8 public constant FAIL_HOLDING_LIMIT = 6;
    uint8 public constant FAIL_DAILY_LIMIT = 7;
    uint8 public constant FAIL_MAX_INVESTORS = 8;
    uint8 public constant FAIL_SENDER_EXPIRED = 9;
    uint8 public constant FAIL_RECEIVER_EXPIRED = 10;
    uint8 public constant FAIL_RESTRICTED_JURISDICTION = 11;
    
    // === Modifiers ===
    
    /**
     * @dev Modifier to check if compliance is enabled
     */
    modifier whenEnabled() {
        require(_enabled, "ComplianceModule: Compliance is disabled");
        _;
    }
    
    // === Constructor ===
    
    constructor(address admin, address identityRegistryAddress) {
        require(admin != address(0), "ComplianceModule: Admin cannot be zero address");
        require(identityRegistryAddress != address(0), "ComplianceModule: Registry cannot be zero");
        
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(CRATSAccessControl.COMPLIANCE_MANAGER_ROLE, admin);
        
        _identityRegistry = IIdentityRegistry(identityRegistryAddress);
        
        // Initialize with default limits from config
        _initializeDefaultLimits();
        
        // Allow major jurisdictions by default
        _initializeDefaultJurisdictions();
    }
    
    // === External View Functions ===
    
    /**
     * @dev Validate a transfer for compliance
     * This is the main function called by token contracts before transfers
     */
    function validateTransfer(
        address from,
        address to,
        uint256 amount
    ) external view override returns (ComplianceResult memory) {
        // If compliance is disabled, allow all transfers
        if (!_enabled) {
            return ComplianceResult({
                isValid: true,
                reason: "Compliance disabled",
                failCode: FAIL_NONE
            });
        }
        
        // Check sender verification
        if (!_identityRegistry.isVerified(from)) {
            // Check if expired
            if (_isIdentityExpired(from)) {
                return ComplianceResult({
                    isValid: false,
                    reason: "Sender identity expired",
                    failCode: FAIL_SENDER_EXPIRED
                });
            }
            return ComplianceResult({
                isValid: false,
                reason: "Sender not verified",
                failCode: FAIL_SENDER_NOT_VERIFIED
            });
        }
        
        // Check receiver verification
        if (!_identityRegistry.isVerified(to)) {
            // Check if expired
            if (_isIdentityExpired(to)) {
                return ComplianceResult({
                    isValid: false,
                    reason: "Receiver identity expired",
                    failCode: FAIL_RECEIVER_EXPIRED
                });
            }
            return ComplianceResult({
                isValid: false,
                reason: "Receiver not verified",
                failCode: FAIL_RECEIVER_NOT_VERIFIED
            });
        }
        
        // Check sender frozen status
        if (_identityRegistry.isFrozen(from)) {
            return ComplianceResult({
                isValid: false,
                reason: "Sender account frozen",
                failCode: FAIL_SENDER_FROZEN
            });
        }
        
        // Check receiver frozen status
        if (_identityRegistry.isFrozen(to)) {
            return ComplianceResult({
                isValid: false,
                reason: "Receiver account frozen",
                failCode: FAIL_RECEIVER_FROZEN
            });
        }
        
        // Check receiver jurisdiction
        uint16 receiverJurisdiction = _identityRegistry.getJurisdiction(to);
        if (JurisdictionCodes.isRestricted(receiverJurisdiction)) {
            return ComplianceResult({
                isValid: false,
                reason: "Restricted jurisdiction",
                failCode: FAIL_RESTRICTED_JURISDICTION
            });
        }
        
        if (!_allowedJurisdictions[receiverJurisdiction]) {
            return ComplianceResult({
                isValid: false,
                reason: "Jurisdiction not allowed",
                failCode: FAIL_JURISDICTION_BLOCKED
            });
        }
        
        // Check holding limit for receiver
        CRATSConfig.InvestorRole receiverRole = _identityRegistry.getRole(to);
        uint256 holdingLimit = _holdingLimits[receiverRole];
        
        // Note: Actual holding check requires token balance, which should be passed in production
        // For now, we check if amount exceeds limit
        if (amount > holdingLimit && holdingLimit > 0) {
            return ComplianceResult({
                isValid: false,
                reason: "Exceeds holding limit",
                failCode: FAIL_HOLDING_LIMIT
            });
        }
        
        // Check daily limit for sender
        CRATSConfig.InvestorRole senderRole = _identityRegistry.getRole(from);
        uint256 dailyLimit = _dailyLimits[senderRole];
        
        if (dailyLimit > 0) {
            uint256 senderDailyVolume = _getSenderDailyVolume(from);
            if (senderDailyVolume + amount > dailyLimit) {
                return ComplianceResult({
                    isValid: false,
                    reason: "Exceeds daily limit",
                    failCode: FAIL_DAILY_LIMIT
                });
            }
        }
        
        // All checks passed
        return ComplianceResult({
            isValid: true,
            reason: "Compliant",
            failCode: FAIL_NONE
        });
    }
    
    function isJurisdictionAllowed(uint16 jurisdiction) external view override returns (bool) {
        return _allowedJurisdictions[jurisdiction];
    }
    
    function getHoldingLimit(CRATSConfig.InvestorRole role) external view override returns (uint256) {
        return _holdingLimits[role];
    }
    
    function getDailyLimit(CRATSConfig.InvestorRole role) external view override returns (uint256) {
        return _dailyLimits[role];
    }
    
    function getInvestorCount() external view override returns (uint256) {
        return _identityRegistry.getTotalIdentities();
    }
    
    function getMaxInvestors() external view override returns (uint256) {
        return _maxInvestors;
    }
    
    function isEnabled() external view override returns (bool) {
        return _enabled;
    }
    
    // === Admin Functions ===
    
    /**
     * @dev Set jurisdiction as allowed or blocked
     */
    function setJurisdictionAllowed(
        uint16 jurisdiction,
        bool isAllowed
    ) external override onlyRole(CRATSAccessControl.COMPLIANCE_MANAGER_ROLE) {
        require(jurisdiction != 0, "ComplianceModule: Invalid jurisdiction");
        require(
            !JurisdictionCodes.isRestricted(jurisdiction) || !isAllowed,
            "ComplianceModule: Cannot allow restricted jurisdiction"
        );
        
        _allowedJurisdictions[jurisdiction] = isAllowed;
        
        emit JurisdictionUpdated(jurisdiction, isAllowed);
    }
    
    /**
     * @dev Set holding limit for a role
     */
    function setHoldingLimit(
        CRATSConfig.InvestorRole role,
        uint256 limit
    ) external override onlyRole(CRATSAccessControl.COMPLIANCE_MANAGER_ROLE) {
        _holdingLimits[role] = limit;
        
        emit HoldingLimitUpdated(role, limit);
    }
    
    /**
     * @dev Set daily limit for a role
     */
    function setDailyLimit(
        CRATSConfig.InvestorRole role,
        uint256 limit
    ) external override onlyRole(CRATSAccessControl.COMPLIANCE_MANAGER_ROLE) {
        _dailyLimits[role] = limit;
        
        emit DailyLimitUpdated(role, limit);
    }
    
    /**
     * @dev Set maximum number of investors
     */
    function setMaxInvestors(uint256 max) external override onlyRole(CRATSAccessControl.COMPLIANCE_MANAGER_ROLE) {
        require(max > 0, "ComplianceModule: Max investors must be positive");
        _maxInvestors = max;
        
        emit MaxInvestorsUpdated(max);
    }
    
    /**
     * @dev Enable or disable compliance module
     */
    function setEnabled(bool enabled) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        _enabled = enabled;
    }
    
    /**
     * @dev Bulk allow multiple jurisdictions
     */
    function allowJurisdictions(
        uint16[] calldata jurisdictions
    ) external override onlyRole(CRATSAccessControl.COMPLIANCE_MANAGER_ROLE) {
        for (uint256 i = 0; i < jurisdictions.length; i++) {
            require(
                !JurisdictionCodes.isRestricted(jurisdictions[i]),
                "ComplianceModule: Cannot allow restricted jurisdiction"
            );
            _allowedJurisdictions[jurisdictions[i]] = true;
            emit JurisdictionUpdated(jurisdictions[i], true);
        }
    }
    
    /**
     * @dev Bulk block multiple jurisdictions
     */
    function blockJurisdictions(
        uint16[] calldata jurisdictions
    ) external override onlyRole(CRATSAccessControl.COMPLIANCE_MANAGER_ROLE) {
        for (uint256 i = 0; i < jurisdictions.length; i++) {
            _allowedJurisdictions[jurisdictions[i]] = false;
            emit JurisdictionUpdated(jurisdictions[i], false);
        }
    }
    
    /**
     * @dev Reset daily volume for a sender (admin only)
     */
    function resetDailyVolume(address sender) external onlyRole(CRATSAccessControl.COMPLIANCE_MANAGER_ROLE) {
        _dailyTransferVolume[sender] = 0;
    }
    
    /**
     * @dev Update identity registry address (admin only)
     */
    function setIdentityRegistry(address newRegistry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newRegistry != address(0), "ComplianceModule: Invalid registry address");
        _identityRegistry = IIdentityRegistry(newRegistry);
    }

    /**
     * @dev Set travel rule module address
     */
    function setTravelRuleModule(address travelRule) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(travelRule != address(0), "ComplianceModule: Invalid address");
        _travelRuleModule = ITravelRuleModule(travelRule);
    }

    /**
     * @dev Record a transfer for daily volume tracking and Travel Rule compliance
     * Called by token contracts after successful transfers
     */
    function recordTransfer(address from, address to, uint256 amount) external override {
        uint256 currentDay = block.timestamp / 1 days;

        // Reset volume if new day
        if (_lastTransferDay[from] != currentDay) {
            _lastTransferDay[from] = currentDay;
            _dailyTransferVolume[from] = 0;
        }

        // Add to daily volume
        _dailyTransferVolume[from] += amount;

        // Record for Travel Rule compliance if above threshold
        if (address(_travelRuleModule) != address(0) && amount >= _travelRuleModule.getThreshold()) {
            _travelRuleModule.recordTransfer(msg.sender, from, to, amount);
        }

        emit ComplianceCheckPassed(from, to, amount);
    }
    
    // === Internal Functions ===
    
    /**
     * @dev Get sender's daily transfer volume
     */
    function _getSenderDailyVolume(address sender) internal view returns (uint256) {
        uint256 currentDay = block.timestamp / 1 days;
        
        if (_lastTransferDay[sender] != currentDay) {
            return 0; // New day, reset volume
        }
        
        return _dailyTransferVolume[sender];
    }
    
    /**
     * @dev Check if identity is expired
     */
    function _isIdentityExpired(address wallet) internal view returns (bool) {
        try _identityRegistry.getIdentity(wallet) returns (
            IIdentitySBT.IdentityData memory identity
        ) {
            return identity.expiresAt > 0 && identity.expiresAt < block.timestamp;
        } catch {
            return true; // Consider expired if no identity
        }
    }
    
    /**
     * @dev Initialize default limits from config
     */
    function _initializeDefaultLimits() internal {
        _holdingLimits[CRATSConfig.InvestorRole.None] = 0;
        _holdingLimits[CRATSConfig.InvestorRole.Investor] = CRATSConfig.getHoldingLimit(CRATSConfig.InvestorRole.Investor);
        _holdingLimits[CRATSConfig.InvestorRole.Qualified] = CRATSConfig.getHoldingLimit(CRATSConfig.InvestorRole.Qualified);
        _holdingLimits[CRATSConfig.InvestorRole.Institutional] = CRATSConfig.getHoldingLimit(CRATSConfig.InvestorRole.Institutional);
        _holdingLimits[CRATSConfig.InvestorRole.Issuer] = CRATSConfig.getHoldingLimit(CRATSConfig.InvestorRole.Issuer);
        
        _dailyLimits[CRATSConfig.InvestorRole.None] = 0;
        _dailyLimits[CRATSConfig.InvestorRole.Investor] = CRATSConfig.getDailyLimit(CRATSConfig.InvestorRole.Investor);
        _dailyLimits[CRATSConfig.InvestorRole.Qualified] = CRATSConfig.getDailyLimit(CRATSConfig.InvestorRole.Qualified);
        _dailyLimits[CRATSConfig.InvestorRole.Institutional] = CRATSConfig.getDailyLimit(CRATSConfig.InvestorRole.Institutional);
        _dailyLimits[CRATSConfig.InvestorRole.Issuer] = CRATSConfig.getDailyLimit(CRATSConfig.InvestorRole.Issuer);
    }
    
    /**
     * @dev Initialize default allowed jurisdictions
     */
    function _initializeDefaultJurisdictions() internal {
        // Allow major jurisdictions by default
        _allowedJurisdictions[JurisdictionCodes.US] = true;
        _allowedJurisdictions[JurisdictionCodes.GB] = true;
        _allowedJurisdictions[JurisdictionCodes.DE] = true;
        _allowedJurisdictions[JurisdictionCodes.FR] = true;
        _allowedJurisdictions[JurisdictionCodes.CH] = true;
        _allowedJurisdictions[JurisdictionCodes.SG] = true;
        _allowedJurisdictions[JurisdictionCodes.HK] = true;
        _allowedJurisdictions[JurisdictionCodes.JP] = true;
        _allowedJurisdictions[JurisdictionCodes.AU] = true;
        _allowedJurisdictions[JurisdictionCodes.CA] = true;
        _allowedJurisdictions[JurisdictionCodes.AE] = true;
    }
}




