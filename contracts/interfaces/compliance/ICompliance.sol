// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "../../utils/CRATSConfig.sol";

/**
 * @title IComplianceModule
 * @dev Interface for the ComplianceModule contract
 * Validates transfers against compliance rules
 */
interface IComplianceModule {
    
    /**
     * @dev Result of compliance validation
     */
    struct ComplianceResult {
        bool isValid;           // Whether transfer is compliant
        string reason;          // Reason code if not valid
        uint8 failCode;         // Numeric fail code for gas efficiency
    }
    
    /**
     * @dev Compliance rule configuration
     */
    struct ComplianceRule {
        bool isEnabled;                     // Whether rule is active
        mapping(uint16 => bool) allowedJurisdictions;  // Allowed jurisdiction codes
        mapping(CRATSConfig.InvestorRole => uint256) maxHoldings;  // Max holdings by role
        mapping(CRATSConfig.InvestorRole => uint256) dailyLimits;  // Daily limits by role
        uint256 maxInvestors;               // Maximum investor count
    }
    
    // === Events ===
    
    /**
     * @dev Emitted when a jurisdiction is allowed/blocked
     */
    event JurisdictionUpdated(
        uint16 indexed jurisdiction,
        bool isAllowed
    );
    
    /**
     * @dev Emitted when holding limit is updated
     */
    event HoldingLimitUpdated(
        CRATSConfig.InvestorRole indexed role,
        uint256 newLimit
    );
    
    /**
     * @dev Emitted when daily limit is updated
     */
    event DailyLimitUpdated(
        CRATSConfig.InvestorRole indexed role,
        uint256 newLimit
    );
    
    /**
     * @dev Emitted when max investors is updated
     */
    event MaxInvestorsUpdated(uint256 newMax);
    
    /**
     * @dev Emitted when compliance check fails
     */
    event ComplianceCheckFailed(
        address indexed from,
        address indexed to,
        uint256 amount,
        uint8 failCode,
        string reason
    );
    
    /**
     * @dev Emitted when compliance check passes
     */
    event ComplianceCheckPassed(
        address indexed from,
        address indexed to,
        uint256 amount
    );
    
    // === View Functions ===
    
    /**
     * @notice Validate a transfer for compliance
     * @param from Sender address
     * @param to Receiver address
     * @param amount Transfer amount
     * @return ComplianceResult with validation result
     */
    function validateTransfer(
        address from,
        address to,
        uint256 amount
    ) external view returns (ComplianceResult memory);
    
    /**
     * @notice Check if jurisdiction is allowed
     * @param jurisdiction Jurisdiction code
     * @return bool True if allowed
     */
    function isJurisdictionAllowed(uint16 jurisdiction) external view returns (bool);
    
    /**
     * @notice Get holding limit for a role
     * @param role Investor role
     * @return uint256 Holding limit
     */
    function getHoldingLimit(CRATSConfig.InvestorRole role) external view returns (uint256);
    
    /**
     * @notice Get daily limit for a role
     * @param role Investor role
     * @return uint256 Daily limit
     */
    function getDailyLimit(CRATSConfig.InvestorRole role) external view returns (uint256);
    
    /**
     * @notice Get current investor count
     * @return uint256 Number of investors
     */
    function getInvestorCount() external view returns (uint256);
    
    /**
     * @notice Get max investors
     * @return uint256 Maximum allowed
     */
    function getMaxInvestors() external view returns (uint256);
    
    /**
     * @notice Check if compliance module is enabled
     * @return bool True if enabled
     */
    function isEnabled() external view returns (bool);
    
    // === Admin Functions ===
    
    /**
     * @notice Set jurisdiction as allowed or blocked
     * @param jurisdiction Jurisdiction code
     * @param isAllowed True to allow, false to block
     */
    function setJurisdictionAllowed(
        uint16 jurisdiction,
        bool isAllowed
    ) external;
    
    /**
     * @notice Set holding limit for a role
     * @param role Investor role
     * @param limit New limit
     */
    function setHoldingLimit(
        CRATSConfig.InvestorRole role,
        uint256 limit
    ) external;
    
    /**
     * @notice Set daily limit for a role
     * @param role Investor role
     * @param limit New limit
     */
    function setDailyLimit(
        CRATSConfig.InvestorRole role,
        uint256 limit
    ) external;
    
    /**
     * @notice Set maximum number of investors
     * @param max New maximum
     */
    function setMaxInvestors(uint256 max) external;
    
    /**
     * @notice Enable or disable compliance module
     * @param enabled True to enable
     */
    function setEnabled(bool enabled) external;
    
    /**
     * @notice Bulk allow multiple jurisdictions
     * @param jurisdictions Array of jurisdiction codes
     */
    function allowJurisdictions(uint16[] calldata jurisdictions) external;
    
    /**
     * @notice Bulk block multiple jurisdictions
     * @param jurisdictions Array of jurisdiction codes
     */
    function blockJurisdictions(uint16[] calldata jurisdictions) external;

    /**
     * @notice Record a transfer for daily volume tracking
     * @param from Sender address
     * @param to Receiver address
     * @param amount Transfer amount
     */
    function recordTransfer(address from, address to, uint256 amount) external;
}

