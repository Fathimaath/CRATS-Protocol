// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title AssetConfig
 * @dev Configuration constants for Layer 2
 */
library AssetConfig {
    // Version
    string public constant VERSION = "3.0.0";

    // === Asset Categories ===
    bytes32 public constant REAL_ESTATE = keccak256("REAL_ESTATE");
    bytes32 public constant FINE_ART = keccak256("FINE_ART");
    bytes32 public constant CARBON_CREDIT = keccak256("CARBON_CREDIT");

    // === Force Transfer Reason Codes ===
    bytes32 public constant REASON_SANCTION = keccak256("SANCTION");
    bytes32 public constant REASON_COURT_ORDER = keccak256("COURT_ORDER");
    bytes32 public constant REASON_FRAUD_RECOVERY = keccak256("FRAUD_RECOVERY");
    bytes32 public constant REASON_BANKRUPTCY = keccak256("BANKRUPTCY");

    // === Circuit Breaker Defaults ===
    uint256 public constant DEFAULT_LIMIT_UP_BPS = 1000; // 10%
    uint256 public constant DEFAULT_LIMIT_DOWN_BPS = 1000; // 10%
    uint256 public constant DEFAULT_PRICE_BAND_PERIOD = 1 days;
    uint256 public constant DEFAULT_HALT_DURATION = 1 days;

    // === Oracle Defaults ===
    uint256 public constant REQUIRED_APPROVALS = 2;
    uint256 public constant UPDATE_DELAY = 24 hours;
    uint256 public constant DEFAULT_RESERVE_RATIO = 10000; // 100% in basis points

    // === Roles ===
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant COMPLIANCE_ROLE = keccak256("COMPLIANCE_ROLE");
    bytes32 public constant VAULT_ROLE = keccak256("VAULT_ROLE");
    bytes32 public constant VAULT_FACTORY_ROLE = keccak256("VAULT_FACTORY_ROLE");

    // === Basis Points ===
    uint256 public constant BASIS_POINTS = 10000;

    /**
     * @dev Check if category is valid
     */
    function isValidCategory(bytes32 category) internal pure returns (bool) {
        return category == REAL_ESTATE || 
               category == FINE_ART || 
               category == CARBON_CREDIT;
    }

    /**
     * @dev Check if reason code is valid
     */
    function isValidReasonCode(bytes32 reasonCode) internal pure returns (bool) {
        return reasonCode == REASON_SANCTION ||
               reasonCode == REASON_COURT_ORDER ||
               reasonCode == REASON_FRAUD_RECOVERY ||
               reasonCode == REASON_BANKRUPTCY;
    }
}
