// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "../interfaces/IIdentityRegistry.sol";
import "../interfaces/IIdentitySBT.sol";
import "../interfaces/IKYCProvidersRegistry.sol";
import "../interfaces/ICRATSAccessControl.sol";
import "../config/CRATSConfig.sol";

/**
 * @title IdentityRegistry
 * @dev Maps wallet addresses to Identity SBT tokens
 *
 * This contract serves as the lookup layer between wallet addresses
 * and SBT tokens, providing quick verification functions for Layer 2 tokens.
 */
contract IdentityRegistry is AccessControl, ReentrancyGuard, IIdentityRegistry {
    
    // === State Variables ===
    
    // Identity SBT contract
    IIdentitySBT private _identitySBT;
    
    // KYC Providers Registry
    IKYCProvidersRegistry private _kycRegistry;
    
    // Mapping from wallet address to token ID
    mapping(address => uint256) private _walletToTokenId;
    
    // Total registered identities
    uint256 private _totalIdentities;
    
    // === Modifiers ===
    
    /**
     * @dev Modifier to check if caller is approved KYC provider
     */
    modifier onlyKYCProvider() {
        require(
            _kycRegistry.isProviderApproved(msg.sender),
            "IdentityRegistry: Caller is not approved KYC provider"
        );
        _;
    }
    
    /**
     * @dev Modifier to check if wallet has identity
     */
    modifier walletHasIdentity(address wallet) {
        require(
            _walletToTokenId[wallet] != 0,
            "IdentityRegistry: Wallet has no identity"
        );
        _;
    }
    
    // === Constructor ===
    
    constructor(
        address admin,
        address identitySBTAddress,
        address kycRegistryAddress
    ) {
        require(admin != address(0), "IdentityRegistry: Admin cannot be zero address");
        require(identitySBTAddress != address(0), "IdentityRegistry: SBT address cannot be zero");
        require(kycRegistryAddress != address(0), "IdentityRegistry: KYC registry cannot be zero");

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(CRATSAccessControl.KYC_PROVIDER_ROLE, admin);
        _grantRole(CRATSAccessControl.REGULATOR_ROLE, admin);

        _identitySBT = IIdentitySBT(identitySBTAddress);
        _kycRegistry = IKYCProvidersRegistry(kycRegistryAddress);
    }
    
    // === External View Functions ===
    
    function isVerified(address wallet) external view override returns (bool) {
        uint256 tokenId = _walletToTokenId[wallet];
        if (tokenId == 0) {
            return false;
        }
        return _identitySBT.isVerified(tokenId);
    }
    
    function getTokenId(address wallet) external view override returns (uint256) {
        return _walletToTokenId[wallet];
    }
    
    function getIdentity(address wallet) 
        external 
        view 
        override 
        returns (IIdentitySBT.IdentityData memory) 
    {
        uint256 tokenId = _walletToTokenId[wallet];
        require(tokenId != 0, "IdentityRegistry: Wallet has no identity");
        return _identitySBT.getIdentityData(tokenId);
    }
    
    function isFrozen(address wallet) external view override returns (bool) {
        uint256 tokenId = _walletToTokenId[wallet];
        if (tokenId == 0) {
            return false;
        }
        IIdentitySBT.IdentityData memory identity = _identitySBT.getIdentityData(tokenId);
        return identity.isFrozen;
    }
    
    function getRole(address wallet) 
        external 
        view 
        override 
        returns (CRATSConfig.InvestorRole) 
    {
        uint256 tokenId = _walletToTokenId[wallet];
        require(tokenId != 0, "IdentityRegistry: Wallet has no identity");
        IIdentitySBT.IdentityData memory identity = _identitySBT.getIdentityData(tokenId);
        return identity.role;
    }
    
    function getJurisdiction(address wallet) external view override returns (uint16) {
        uint256 tokenId = _walletToTokenId[wallet];
        require(tokenId != 0, "IdentityRegistry: Wallet has no identity");
        IIdentitySBT.IdentityData memory identity = _identitySBT.getIdentityData(tokenId);
        return identity.jurisdiction;
    }
    
    function isAccredited(address wallet) external view override returns (bool) {
        uint256 tokenId = _walletToTokenId[wallet];
        require(tokenId != 0, "IdentityRegistry: Wallet has no identity");
        IIdentitySBT.IdentityData memory identity = _identitySBT.getIdentityData(tokenId);
        return identity.isAccredited;
    }
    
    function getTotalIdentities() external view override returns (uint256) {
        return _totalIdentities;
    }
    
    // === Registration Functions ===
    
    /**
     * @dev Register a new identity
     * Only callable by approved KYC providers
     */
    function registerIdentity(
        address wallet,
        bytes32 didHash,
        string memory did,
        IIdentitySBT.ChainAddress[] memory chainAddresses,
        CRATSConfig.InvestorRole role,
        uint16 jurisdiction,
        bool accredited
    ) external override onlyKYCProvider returns (uint256) {
        require(wallet != address(0), "IdentityRegistry: Wallet cannot be zero address");
        require(
            _walletToTokenId[wallet] == 0,
            "IdentityRegistry: Wallet already registered"
        );

        // Mint identity through SBT contract
        uint256 tokenId = _identitySBT.mintIdentity(
            wallet,
            didHash,
            did,
            chainAddresses,
            role,
            jurisdiction,
            accredited
        );
        
        // Update mapping
        _walletToTokenId[wallet] = tokenId;
        _totalIdentities++;
        
        // Map all chain addresses
        for (uint256 i = 0; i < chainAddresses.length; i++) {
            if (chainAddresses[i].isActive) {
                _walletToTokenId[chainAddresses[i].wallet] = tokenId;
            }
        }
        
        // Emit event
        emit IdentityRegistered(wallet, tokenId, didHash);
        
        return tokenId;
    }
    
    /**
     * @dev Add a chain address to existing identity
     * Requires signature from newWalletAddress to prove ownership
     */
    function addChainAddress(
        address wallet,
        uint256 chainId,
        address newWalletAddress,
        bytes memory signature
    ) external override onlyKYCProvider walletHasIdentity(wallet) {
        uint256 tokenId = _walletToTokenId[wallet];

        require(newWalletAddress != address(0), "IdentityRegistry: Invalid wallet address");
        require(newWalletAddress != wallet, "IdentityRegistry: New wallet must be different");

        // Verify signature from new wallet address
        // Message format: "CRATS:LinkWallet:<chainId>:<newWalletAddress>:<tokenId>"
        bytes32 messageHash = keccak256(
            abi.encodePacked("CRATS:LinkWallet:", chainId, newWalletAddress, tokenId)
        );
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(messageHash);
        address signer = ECDSA.recover(ethSignedHash, signature);

        require(signer == newWalletAddress, "IdentityRegistry: Invalid signature");

        // Add chain address through SBT contract
        _identitySBT.addChainAddress(tokenId, chainId, newWalletAddress);

        // Update mapping
        _walletToTokenId[newWalletAddress] = tokenId;

        // Emit event
        emit ChainAddressLinked(newWalletAddress, tokenId, chainId);
    }
    
    /**
     * @dev Update investor role
     */
    function updateRole(
        address wallet,
        CRATSConfig.InvestorRole newRole
    ) external override onlyKYCProvider walletHasIdentity(wallet) {
        uint256 tokenId = _walletToTokenId[wallet];
        _identitySBT.updateRole(tokenId, newRole);
    }
    
    /**
     * @dev Update jurisdiction
     */
    function updateJurisdiction(
        address wallet,
        uint16 newJurisdiction
    ) external override onlyKYCProvider walletHasIdentity(wallet) {
        uint256 tokenId = _walletToTokenId[wallet];
        _identitySBT.updateJurisdiction(tokenId, newJurisdiction);
    }
    
    /**
     * @dev Update accreditation status
     */
    function updateAccreditation(
        address wallet,
        bool accredited
    ) external override onlyKYCProvider walletHasIdentity(wallet) {
        uint256 tokenId = _walletToTokenId[wallet];
        _identitySBT.updateAccreditation(tokenId, accredited);
    }
    
    /**
     * @dev Update DID hash
     */
    function updateDIDHash(
        address wallet,
        bytes32 newDidHash
    ) external override onlyKYCProvider walletHasIdentity(wallet) {
        uint256 tokenId = _walletToTokenId[wallet];
        _identitySBT.updateDIDHash(tokenId, newDidHash);
    }
    
    /**
     * @dev Update verification status
     */
    function updateStatus(
        address wallet,
        CRATSConfig.VerificationStatus newStatus
    ) external override onlyKYCProvider walletHasIdentity(wallet) {
        uint256 tokenId = _walletToTokenId[wallet];
        _identitySBT.updateStatus(tokenId, newStatus);
        
        // Emit verification status event
        emit VerificationStatusChanged(wallet, newStatus);
    }
    
    /**
     * @dev Freeze an account
     * Only callable by regulators
     */
    function freezeAccount(address wallet) 
        external 
        override 
        onlyRole(CRATSAccessControl.REGULATOR_ROLE) 
        walletHasIdentity(wallet) 
    {
        uint256 tokenId = _walletToTokenId[wallet];
        _identitySBT.freezeIdentity(tokenId);
        
        emit AccountFrozen(wallet, tokenId);
    }
    
    /**
     * @dev Unfreeze an account
     * Only callable by regulators
     */
    function unfreezeAccount(address wallet) 
        external 
        override 
        onlyRole(CRATSAccessControl.REGULATOR_ROLE) 
        walletHasIdentity(wallet) 
    {
        uint256 tokenId = _walletToTokenId[wallet];
        _identitySBT.unfreezeIdentity(tokenId);
        
        emit AccountUnfrozen(wallet, tokenId);
    }
    
    /**
     * @dev Revoke an identity
     * Only callable by regulators
     */
    function revokeIdentity(address wallet) 
        external 
        override 
        onlyRole(CRATSAccessControl.REGULATOR_ROLE) 
        walletHasIdentity(wallet) 
    {
        uint256 tokenId = _walletToTokenId[wallet];
        
        // Revoke through SBT contract
        _identitySBT.revokeIdentity(tokenId);
        
        // Update total count
        _totalIdentities--;
        
        // Clear wallet mapping
        delete _walletToTokenId[wallet];
    }
    
    /**
     * @dev Extend KYC expiry
     */
    function extendExpiry(
        address wallet,
        uint64 newExpiry
    ) external override onlyKYCProvider walletHasIdentity(wallet) {
        uint256 tokenId = _walletToTokenId[wallet];
        _identitySBT.extendExpiry(tokenId, newExpiry);
    }
    
    /**
     * @dev Update identity SBT address (admin only)
     */
    function setIdentitySBT(address newSBTAddress) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newSBTAddress != address(0), "IdentityRegistry: Invalid SBT address");
        _identitySBT = IIdentitySBT(newSBTAddress);
    }
    
    /**
     * @dev Update KYC registry address (admin only)
     */
    function setKYCRegistry(address newRegistry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newRegistry != address(0), "IdentityRegistry: Invalid registry address");
        _kycRegistry = IKYCProvidersRegistry(newRegistry);
    }
}
