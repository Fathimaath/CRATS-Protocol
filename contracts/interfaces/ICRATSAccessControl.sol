// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title CRATSAccessControl
 * @dev Library for CRATS access control roles
 * Defines role-based permissions for the protocol
 */
library CRATSAccessControl {
    // === Role Identifiers ===
    
    /**
     * @dev Role for KYC providers - can register and update identities
     */
    bytes32 public constant KYC_PROVIDER_ROLE = keccak256("KYC_PROVIDER_ROLE");
    
    /**
     * @dev Role for regulators - can freeze/unfreeze and revoke identities
     */
    bytes32 public constant REGULATOR_ROLE = keccak256("REGULATOR_ROLE");
    
    /**
     * @dev Role for compliance managers - can update compliance rules
     */
    bytes32 public constant COMPLIANCE_MANAGER_ROLE = keccak256("COMPLIANCE_MANAGER_ROLE");
    
    /**
     * @dev Role for issuers - can mint tokens and manage their offerings
     */
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");
    
    /**
     * @dev Role for identity managers - can update identity data
     */
    bytes32 public constant IDENTITY_MANAGER_ROLE = keccak256("IDENTITY_MANAGER_ROLE");
}
