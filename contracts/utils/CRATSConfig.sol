// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title CRATSConfig
 * @dev Protocol constants and configuration for CRATS Layer 1
 * // Source: ERC-3643 T-REX Protocol Standards
 */
library CRATSConfig {
    // Protocol version
    string public constant VERSION = "1.0.0";
    bytes32 public constant PROTOCOL_NAME = "CRATS Protocol Layer 1";
    
    // DID prefix
    string public constant DID_PREFIX = "did:crats:";
    
    // Max chain addresses per identity
    uint8 public constant MAX_CHAIN_ADDRESSES = 20;
    
    // Default KYC expiry (2 years in seconds)
    uint64 public constant DEFAULT_KYC_EXPIRY = 63072000;
    
    /**
     * @dev Investor roles in the protocol (aligned with T-REX)
     */
    uint8 public constant ROLE_NONE = 0;
    uint8 public constant ROLE_INVESTOR = 1;
    uint8 public constant ROLE_QUALIFIED = 2;
    uint8 public constant ROLE_INSTITUTIONAL = 3;
    uint8 public constant ROLE_ISSUER = 4;
    uint8 public constant ROLE_REGULATOR = 5;
    uint8 public constant ROLE_KYC_PROVIDER = 6;
    
    /**
     * @dev Verification status of an identity (aligned with T-REX)
     */
    uint8 public constant STATUS_NONE = 0;
    uint8 public constant STATUS_PENDING = 1;
    uint8 public constant STATUS_VERIFIED = 2;
    uint8 public constant STATUS_SUSPENDED = 3;
    uint8 public constant STATUS_REVOKED = 4;
    
    /**
     * @dev Access control roles (hashed for efficiency)
     * // Source: OpenZeppelin AccessControl patterns
     */
    bytes32 public constant KYC_PROVIDER_ROLE = keccak256("KYC_PROVIDER_ROLE");
    bytes32 public constant COMPLIANCE_ROLE = keccak256("COMPLIANCE_ROLE");
    bytes32 public constant REGULATOR_ROLE = keccak256("REGULATOR_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
}
