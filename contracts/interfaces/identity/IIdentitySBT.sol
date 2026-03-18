// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "../../utils/CRATSConfig.sol";

/**
 * @title IIdentitySBT
 * @dev Interface for the IdentitySBT (Soulbound Token) contract
 * Based on ERC-5192 (Minimal Soulbound) and ERC-3643 (Identity)
 * // Source: ERC-5192 Minimal Soulbound Token Standard
 * // Source: ERC-3643 T-REX Identity Pattern
 */
interface IIdentitySBT {
    
    /**
     * @dev Struct containing chain address information
     */
    struct ChainAddress {
        uint256 chainId;
        address wallet;
        bool isActive;
        uint64 addedAt;
    }
    
    /**
     * @dev Struct containing complete identity data
     */
    struct IdentityData {
        ChainAddress[] chainAddresses;
        bytes32 didHash;      // IPFS CID of DID Doc
        string did;           // DID string (did:crats:...)
        uint8 role;           // CRATSConfig.ROLE_*
        uint8 status;         // CRATSConfig.STATUS_*
        uint16 jurisdiction;  // ISO 3166-1 numeric
        bool isAccredited;
        uint8 riskLevel;
        uint64 verifiedAt;
        uint64 expiresAt;
        uint64 updatedAt;
        bool isFrozen;
    }
    
    // === ERC-5192 Events ===
    event Locked(uint256 tokenId);
    event Unlocked(uint256 tokenId);

    // === T-REX Events ===
    event IdentityMinted(uint256 indexed tokenId, address indexed primaryWallet, uint8 role, uint16 jurisdiction);
    event ChainAddressAdded(uint256 indexed tokenId, uint256 chainId, address wallet);
    event StatusChanged(uint256 indexed tokenId, uint8 newStatus);
    event FrozenStateChanged(uint256 indexed tokenId, bool isFrozen);
    
    // === View Functions ===
    function locked(uint256 tokenId) external view returns (bool);
    function tokenIdOf(address wallet) external view returns (uint256);
    function getIdentity(uint256 tokenId) external view returns (IdentityData memory);
    function isVerified(address wallet) external view returns (bool);
    function getTotalIdentities() external view returns (uint256);
    
    // === Write Functions (Minter/Admin only) ===
    function registerIdentity(
        address primaryWallet,
        uint8 role,
        uint16 jurisdiction,
        bytes32 didHash,
        string calldata did,
        uint64 expiresAt
    ) external returns (uint256 tokenId);
    
    function addChainAddress(uint256 tokenId, uint256 chainId, address wallet) external;
    function updateRole(uint256 tokenId, uint8 newRole) external;
    function updateJurisdiction(uint256 tokenId, uint16 newJurisdiction) external;
    function updateStatus(uint256 tokenId, uint8 newStatus) external;
    function updateExpiry(uint256 tokenId, uint64 newExpiresAt) external;
    function updateDidHash(uint256 tokenId, bytes32 newDidHash, string calldata newDid) external;
    function updateAccreditation(uint256 tokenId, bool isAccredited) external;
    function updateRiskLevel(uint256 tokenId, uint8 riskLevel) external;
    function freeze(uint256 tokenId) external;
    function unfreeze(uint256 tokenId) external;
}
