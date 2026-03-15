// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "../../utils/CRATSConfig.sol";
import "./IIdentitySBT.sol";

/**
 * @title IIdentityRegistry
 * @dev Interface for the IdentityRegistry contract
 * Maps wallet addresses to Identity SBT tokens
 */
interface IIdentityRegistry {
    
    // === Events ===
    
    /**
     * @dev Emitted when a new identity is registered
     */
    event IdentityRegistered(
        address indexed wallet,
        uint256 indexed tokenId,
        bytes32 didHash
    );
    
    /**
     * @dev Emitted when a chain address is linked to identity
     */
    event ChainAddressLinked(
        address indexed wallet,
        uint256 indexed tokenId,
        uint256 chainId
    );
    
    /**
     * @dev Emitted when identity verification status changes
     */
    event VerificationStatusChanged(
        address indexed wallet,
        CRATSConfig.VerificationStatus status
    );
    
    /**
     * @dev Emitted when account is frozen
     */
    event AccountFrozen(address indexed wallet, uint256 indexed tokenId);
    
    /**
     * @dev Emitted when account is unfrozen
     */
    event AccountUnfrozen(address indexed wallet, uint256 indexed tokenId);
    
    // === View Functions ===
    
    /**
     * @notice Check if a wallet has a verified identity
     * @param wallet Wallet address
     * @return bool True if verified
     */
    function isVerified(address wallet) external view returns (bool);
    
    /**
     * @notice Get token ID for a wallet
     * @param wallet Wallet address
     * @return uint256 Token ID (0 if not found)
     */
    function getTokenId(address wallet) external view returns (uint256);
    
    /**
     * @notice Get complete identity data for a wallet
     * @param wallet Wallet address
     * @return IdentityData struct
     */
    function getIdentity(address wallet) external view returns (IIdentitySBT.IdentityData memory);
    
    /**
     * @notice Check if wallet is frozen
     * @param wallet Wallet address
     * @return bool True if frozen
     */
    function isFrozen(address wallet) external view returns (bool);
    
    /**
     * @notice Get investor role for wallet
     * @param wallet Wallet address
     * @return InvestorRole
     */
    function getRole(address wallet) external view returns (CRATSConfig.InvestorRole);
    
    /**
     * @notice Get jurisdiction for wallet
     * @param wallet Wallet address
     * @return Jurisdiction code
     */
    function getJurisdiction(address wallet) external view returns (uint16);
    
    /**
     * @notice Check if wallet is accredited
     * @param wallet Wallet address
     * @return bool True if accredited
     */
    function isAccredited(address wallet) external view returns (bool);
    
    /**
     * @notice Get total registered identities
     * @return uint256 Total count
     */
    function getTotalIdentities() external view returns (uint256);
    
    // === Registration Functions ===
    
    /**
     * @notice Register a new identity
     * @param wallet Primary wallet address
     * @param didHash IPFS CID hash
     * @param did DID string
     * @param chainAddresses Array of chain addresses
     * @param role Investor role
     * @param jurisdiction Jurisdiction code
     * @param isAccredited Accreditation status
     * @return tokenId Minted token ID
     */
    function registerIdentity(
        address wallet,
        bytes32 didHash,
        string memory did,
        IIdentitySBT.ChainAddress[] memory chainAddresses,
        CRATSConfig.InvestorRole role,
        uint16 jurisdiction,
        bool isAccredited
    ) external returns (uint256 tokenId);
    
    /**
     * @notice Add a chain address to existing identity
     * @param wallet Primary wallet address (identity owner)
     * @param chainId Chain ID
     * @param newWalletAddress Wallet address on the new chain
     * @param signature Signature from newWalletAddress proving ownership
     */
    function addChainAddress(
        address wallet,
        uint256 chainId,
        address newWalletAddress,
        bytes memory signature
    ) external;
    
    /**
     * @notice Update investor role
     * @param wallet Wallet address
     * @param newRole New role
     */
    function updateRole(
        address wallet,
        CRATSConfig.InvestorRole newRole
    ) external;
    
    /**
     * @notice Update jurisdiction
     * @param wallet Wallet address
     * @param newJurisdiction New jurisdiction code
     */
    function updateJurisdiction(
        address wallet,
        uint16 newJurisdiction
    ) external;
    
    /**
     * @notice Update accreditation status
     * @param wallet Wallet address
     * @param isAccredited New status
     */
    function updateAccreditation(
        address wallet,
        bool isAccredited
    ) external;
    
    /**
     * @notice Update DID hash
     * @param wallet Wallet address
     * @param newDidHash New IPFS CID hash
     */
    function updateDIDHash(
        address wallet,
        bytes32 newDidHash
    ) external;
    
    /**
     * @notice Update verification status
     * @param wallet Wallet address
     * @param newStatus New status
     */
    function updateStatus(
        address wallet,
        CRATSConfig.VerificationStatus newStatus
    ) external;
    
    /**
     * @notice Freeze an account
     * @param wallet Wallet address
     */
    function freezeAccount(address wallet) external;
    
    /**
     * @notice Unfreeze an account
     * @param wallet Wallet address
     */
    function unfreezeAccount(address wallet) external;
    
    /**
     * @notice Revoke an identity
     * @param wallet Wallet address
     */
    function revokeIdentity(address wallet) external;
    
    /**
     * @notice Extend KYC expiry
     * @param wallet Wallet address
     * @param newExpiry New expiry timestamp
     */
    function extendExpiry(
        address wallet,
        uint64 newExpiry
    ) external;
}

