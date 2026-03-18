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
    
    event IdentityRegistered(
        address indexed wallet,
        uint256 indexed tokenId,
        bytes32 didHash
    );
    
    event ChainAddressLinked(
        address indexed wallet,
        uint256 indexed tokenId,
        uint256 chainId
    );
    
    event VerificationStatusChanged(
        address indexed wallet,
        uint8 status
    );
    
    event AccountFrozen(address indexed wallet, uint256 indexed tokenId);
    event AccountUnfrozen(address indexed wallet, uint256 indexed tokenId);
    
    // === View Functions ===
    
    function isVerified(address wallet) external view returns (bool);
    function getTokenId(address wallet) external view returns (uint256);
    function getIdentity(address wallet) external view returns (IIdentitySBT.IdentityData memory);
    function isFrozen(address wallet) external view returns (bool);
    function getRole(address wallet) external view returns (uint8);
    function getJurisdiction(address wallet) external view returns (uint16);
    function isAccredited(address wallet) external view returns (bool);
    function getTotalIdentities() external view returns (uint256);
    
    // === Registration Functions ===
    
    function registerIdentity(
        address wallet,
        bytes32 didHash,
        string memory did,
        IIdentitySBT.ChainAddress[] memory chainAddresses,
        uint8 role,
        uint16 jurisdiction,
        bool isAccredited
    ) external returns (uint256 tokenId);
    
    function addChainAddress(
        address wallet,
        uint256 chainId,
        address newWalletAddress,
        bytes memory signature
    ) external;
    
    function updateRole(
        address wallet,
        uint8 newRole
    ) external;
    
    function updateJurisdiction(
        address wallet,
        uint16 newJurisdiction
    ) external;
    
    function updateAccreditation(
        address wallet,
        bool isAccredited
    ) external;
    
    function updateDIDHash(
        address wallet,
        bytes32 newDidHash
    ) external;
    
    function updateStatus(
        address wallet,
        uint8 newStatus
    ) external;
    
    function freezeAccount(address wallet) external;
    function unfreezeAccount(address wallet) external;
    function revokeIdentity(address wallet) external;
    
    function extendExpiry(
        address wallet,
        uint64 newExpiry
    ) external;
}
