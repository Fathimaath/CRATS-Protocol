// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "../../utils/CRATSConfig.sol";

/**
 * @title IIdentitySBT
 * @dev Interface for the IdentitySBT (Soulbound Token) contract
 * ERC-721 based non-transferable identity token
 */
interface IIdentitySBT {
    
    /**
     * @dev Struct containing chain address information
     */
    struct ChainAddress {
        uint256 chainId;      // Chain ID (1=Ethereum, 137=Polygon, etc.)
        address wallet;       // Wallet address on that chain
        bool isActive;        // Whether this address is active
        uint64 addedAt;       // When this address was added
    }
    
    /**
     * @dev Struct containing complete identity data
     */
    struct IdentityData {
        // Multi-Chain Addresses
        ChainAddress[] chainAddresses;
        
        // DID & Metadata
        bytes32 didHash;      // IPFS CID hash of DID document
        string did;           // DID string (did:crats:...)
        
        // User Classification
        CRATSConfig.InvestorRole role;
        
        // Compliance Data
        CRATSConfig.VerificationStatus status;
        uint16 jurisdiction;  // ISO 3166-1 numeric code
        bool isAccredited;    // US accredited investor status
        uint8 riskLevel;      // 0-5 risk level
        
        // Timestamps
        uint64 verifiedAt;    // When verified
        uint64 expiresAt;     // KYC expiry timestamp
        uint64 updatedAt;     // Last update time
        
        // Control Flags
        bool isFrozen;        // Account frozen status
    }
    
    // === Events ===
    
    /**
     * @dev Emitted when a new identity SBT is minted
     */
    event IdentityMinted(
        address indexed owner,
        uint256 indexed tokenId,
        bytes32 didHash,
        CRATSConfig.InvestorRole role
    );
    
    /**
     * @dev Emitted when a chain address is added to identity
     */
    event ChainAddressAdded(
        uint256 indexed tokenId,
        uint256 chainId,
        address wallet
    );
    
    /**
     * @dev Emitted when chain address is deactivated
     */
    event ChainAddressDeactivated(
        uint256 indexed tokenId,
        uint256 chainId,
        address wallet
    );
    
    /**
     * @dev Emitted when identity role is updated
     */
    event RoleUpdated(
        uint256 indexed tokenId,
        CRATSConfig.InvestorRole oldRole,
        CRATSConfig.InvestorRole newRole
    );
    
    /**
     * @dev Emitted when jurisdiction is updated
     */
    event JurisdictionUpdated(
        uint256 indexed tokenId,
        uint16 oldJurisdiction,
        uint16 newJurisdiction
    );
    
    /**
     * @dev Emitted when accreditation status is updated
     */
    event AccreditationUpdated(
        uint256 indexed tokenId,
        bool isAccredited
    );

    /**
     * @dev Emitted when risk level is updated
     */
    event RiskLevelUpdated(
        uint256 indexed tokenId,
        uint8 oldRiskLevel,
        uint8 newRiskLevel
    );
    
    /**
     * @dev Emitted when DID hash is updated
     */
    event DIDHashUpdated(
        uint256 indexed tokenId,
        bytes32 oldHash,
        bytes32 newHash
    );
    
    /**
     * @dev Emitted when verification status is updated
     */
    event StatusUpdated(
        uint256 indexed tokenId,
        CRATSConfig.VerificationStatus oldStatus,
        CRATSConfig.VerificationStatus newStatus
    );
    
    /**
     * @dev Emitted when identity is frozen
     */
    event IdentityFrozen(uint256 indexed tokenId);
    
    /**
     * @dev Emitted when identity is unfrozen
     */
    event IdentityUnfrozen(uint256 indexed tokenId);
    
    /**
     * @dev Emitted when identity is revoked (SBT burned)
     */
    event IdentityRevoked(uint256 indexed tokenId);
    
    /**
     * @dev Emitted when expiry is extended
     */
    event ExpiryExtended(
        uint256 indexed tokenId,
        uint64 oldExpiry,
        uint64 newExpiry
    );
    
    // === View Functions ===
    
    /**
     * @notice Get complete identity data for a token ID
     * @param tokenId Token ID
     * @return IdentityData struct with all identity information
     */
    function getIdentityData(uint256 tokenId) external view returns (IdentityData memory);
    
    /**
     * @notice Get identity data by wallet address
     * @param wallet Wallet address
     * @return IdentityData struct (empty if not found)
     * @return tokenId Token ID (0 if not found)
     */
    function getIdentityByWallet(address wallet) external view returns (IdentityData memory, uint256);
    
    /**
     * @notice Get all chain addresses for a token
     * @param tokenId Token ID
     * @return ChainAddress[] Array of chain addresses
     */
    function getChainAddresses(uint256 tokenId) external view returns (ChainAddress[] memory);
    
    /**
     * @notice Check if a wallet is linked to any identity
     * @param wallet Wallet address to check
     * @return bool True if wallet is linked
     */
    function isWalletLinked(address wallet) external view returns (bool);
    
    /**
     * @notice Get wallet address for a specific chain
     * @param tokenId Token ID
     * @param chainId Chain ID to look up
     * @return wallet Wallet address on that chain
     * @return isActive Whether the address is active
     */
    function getWalletForChain(uint256 tokenId, uint256 chainId) 
        external view returns (address wallet, bool isActive);
    
    /**
     * @notice Check if identity is verified and not frozen/expired
     * @param tokenId Token ID
     * @return bool True if verified
     */
    function isVerified(uint256 tokenId) external view returns (bool);
    
    /**
     * @notice Get total number of identities
     * @return uint256 Total supply
     */
    function getTotalIdentities() external view returns (uint256);
    
    // === Admin/KYC Provider Functions ===
    
    /**
     * @notice Mint a new identity SBT
     * @param to Owner address
     * @param didHash IPFS CID hash
     * @param did DID string
     * @param chainAddresses Array of chain addresses
     * @param role Investor role
     * @param jurisdiction Jurisdiction code
     * @param isAccredited Accreditation status
     * @return tokenId Minted token ID
     */
    function mintIdentity(
        address to,
        bytes32 didHash,
        string memory did,
        ChainAddress[] memory chainAddresses,
        CRATSConfig.InvestorRole role,
        uint16 jurisdiction,
        bool isAccredited
    ) external returns (uint256 tokenId);
    
    /**
     * @notice Add a chain address to existing identity
     * @param tokenId Token ID
     * @param chainId Chain ID
     * @param wallet Wallet address
     */
    function addChainAddress(
        uint256 tokenId,
        uint256 chainId,
        address wallet
    ) external;
    
    /**
     * @notice Deactivate a chain address
     * @param tokenId Token ID
     * @param chainId Chain ID to deactivate
     */
    function deactivateChainAddress(
        uint256 tokenId,
        uint256 chainId
    ) external;
    
    /**
     * @notice Update investor role
     * @param tokenId Token ID
     * @param newRole New role
     */
    function updateRole(
        uint256 tokenId,
        CRATSConfig.InvestorRole newRole
    ) external;
    
    /**
     * @notice Update jurisdiction
     * @param tokenId Token ID
     * @param newJurisdiction New jurisdiction code
     */
    function updateJurisdiction(
        uint256 tokenId,
        uint16 newJurisdiction
    ) external;
    
    /**
     * @notice Update accreditation status
     * @param tokenId Token ID
     * @param isAccredited New accreditation status
     */
    function updateAccreditation(
        uint256 tokenId,
        bool isAccredited
    ) external;

    /**
     * @notice Update risk level
     * @param tokenId Token ID
     * @param newRiskLevel New risk level (0-5)
     */
    function updateRiskLevel(
        uint256 tokenId,
        uint8 newRiskLevel
    ) external;
    
    /**
     * @notice Update DID hash
     * @param tokenId Token ID
     * @param newDidHash New IPFS CID hash
     */
    function updateDIDHash(
        uint256 tokenId,
        bytes32 newDidHash
    ) external;
    
    /**
     * @notice Update verification status
     * @param tokenId Token ID
     * @param newStatus New status
     */
    function updateStatus(
        uint256 tokenId,
        CRATSConfig.VerificationStatus newStatus
    ) external;
    
    /**
     * @notice Freeze an identity (prevent all transfers)
     * @param tokenId Token ID
     */
    function freezeIdentity(uint256 tokenId) external;
    
    /**
     * @notice Unfreeze an identity
     * @param tokenId Token ID
     */
    function unfreezeIdentity(uint256 tokenId) external;
    
    /**
     * @notice Extend KYC expiry
     * @param tokenId Token ID
     * @param newExpiry New expiry timestamp
     */
    function extendExpiry(
        uint256 tokenId,
        uint64 newExpiry
    ) external;
    
    /**
     * @notice Revoke identity (burn SBT)
     * @param tokenId Token ID
     */
    function revokeIdentity(uint256 tokenId) external;
}

