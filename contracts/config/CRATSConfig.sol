// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title CRATSConfig
 * @dev Protocol constants and configuration for CRATS Layer 1
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
    
    // Maximum number of investors
    uint256 public constant MAX_INVESTORS = 100000;
    
    /**
     * @dev Investor roles in the protocol
     */
    enum InvestorRole {
        None,           // 0: Not assigned
        Investor,       // 1: Standard retail investor
        Qualified,      // 2: Qualified investor (higher limits)
        Institutional,  // 3: Institutional investor
        Issuer          // 4: SPV / Token Issuer
    }
    
    /**
     * @dev Verification status of an identity
     */
    enum VerificationStatus {
        None,       // 0: Not registered
        Pending,    // 1: KYC in progress
        Verified,   // 2: Fully verified
        Suspended,  // 3: Temporarily suspended
        Revoked     // 4: Permanently revoked
    }
    
    /**
     * @dev Risk levels for compliance
     */
    enum RiskLevel {
        Lowest,     // 0: Lowest risk
        Low,        // 1: Low risk
        Medium,     // 2: Medium risk
        High,       // 3: High risk
        VeryHigh,   // 4: Very high risk
        Extreme     // 5: Extreme risk (blocked)
    }
    
    /**
     * @dev Get holding limit for a role
     * @param role Investor role
     * @return uint256 Holding limit
     */
    function getHoldingLimit(InvestorRole role) internal pure returns (uint256) {
        if (role == InvestorRole.None) return 0;
        if (role == InvestorRole.Investor) return 10000 * 10**18;      // 10,000 tokens
        if (role == InvestorRole.Qualified) return 100000 * 10**18;    // 100,000 tokens
        if (role == InvestorRole.Institutional) return 1000000 * 10**18; // 1,000,000 tokens
        if (role == InvestorRole.Issuer) return type(uint256).max;      // Unlimited
        return 0;
    }
    
    /**
     * @dev Get daily transfer limit for a role
     * @param role Investor role
     * @return uint256 Daily limit
     */
    function getDailyLimit(InvestorRole role) internal pure returns (uint256) {
        if (role == InvestorRole.None) return 0;
        if (role == InvestorRole.Investor) return 1000 * 10**18;       // 1,000 tokens/day
        if (role == InvestorRole.Qualified) return 10000 * 10**18;     // 10,000 tokens/day
        if (role == InvestorRole.Institutional) return 100000 * 10**18; // 100,000 tokens/day
        if (role == InvestorRole.Issuer) return type(uint256).max;      // Unlimited
        return 0;
    }
}
