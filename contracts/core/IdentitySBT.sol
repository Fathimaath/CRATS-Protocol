// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IIdentitySBT.sol";
import "../interfaces/IKYCProvidersRegistry.sol";
import "../config/CRATSConfig.sol";

/**
 * @title IdentitySBT
 * @dev ERC-721 Soulbound Token for identity management
 * 
 * Key Features:
 * - Non-transferable (soulbound)
 * - One token per wallet
 * - Multi-chain wallet support
 * - Updatable identity data
 * - Role-based access control
 */
contract IdentitySBT is ERC721, AccessControl, ReentrancyGuard, IIdentitySBT {
    
    // === State Variables ===
    
    // Token ID counter
    uint256 private _tokenIdCounter;
    
    // Mapping from token ID to identity data
    mapping(uint256 => IdentityData) private _identities;
    
    // Mapping from wallet address to token ID
    mapping(address => uint256) private _walletToTokenId;
    
    // KYC Providers Registry
    IKYCProvidersRegistry private _kycRegistry;
    
    // Roles
    bytes32 public constant IDENTITY_MANAGER_ROLE = keccak256("IDENTITY_MANAGER_ROLE");
    
    // === Modifiers ===
    
    /**
     * @dev Modifier to check if caller is authorized KYC provider
     */
    modifier onlyKYCProvider() {
        require(
            _kycRegistry.isProviderApproved(msg.sender),
            "IdentitySBT: Caller is not approved KYC provider"
        );
        _;
    }
    
    /**
     * @dev Modifier to check if caller is identity manager or KYC provider
     */
    modifier onlyIdentityManager() {
        require(
            hasRole(IDENTITY_MANAGER_ROLE, msg.sender) || 
            _kycRegistry.isProviderApproved(msg.sender),
            "IdentitySBT: Caller is not authorized"
        );
        _;
    }
    
    /**
     * @dev Modifier to check if token exists
     */
    modifier tokenExists(uint256 tokenId) {
        require(_exists(tokenId), "IdentitySBT: Token does not exist");
        _;
    }
    
    // === Constructor ===

    constructor(address admin, address kycRegistryAddress) ERC721("CRATS Identity", "CRATS-ID") {
        require(admin != address(0), "IdentitySBT: Admin cannot be zero address");
        require(kycRegistryAddress != address(0), "IdentitySBT: KYC registry cannot be zero address");

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(IDENTITY_MANAGER_ROLE, admin);
        // Grant IDENTITY_MANAGER_ROLE to KYC registry so it can mint identities
        _grantRole(IDENTITY_MANAGER_ROLE, kycRegistryAddress);

        _kycRegistry = IKYCProvidersRegistry(kycRegistryAddress);
    }
    
    // === External View Functions ===

    function getIdentityData(uint256 tokenId) 
        external 
        view 
        override 
        tokenExists(tokenId)
        returns (IdentityData memory) 
    {
        return _identities[tokenId];
    }

    function getTokenId(address wallet) 
        external 
        view 
        returns (uint256) 
    {
        return _walletToTokenId[wallet];
    }

    function getIdentityByWallet(address wallet)
        external 
        view 
        override 
        returns (IdentityData memory, uint256) 
    {
        uint256 tokenId = _walletToTokenId[wallet];
        if (tokenId == 0) {
            return (_identities[0], 0);
        }
        return (_identities[tokenId], tokenId);
    }
    
    function getChainAddresses(uint256 tokenId) 
        external 
        view 
        override 
        tokenExists(tokenId)
        returns (ChainAddress[] memory) 
    {
        return _identities[tokenId].chainAddresses;
    }
    
    function isWalletLinked(address wallet) 
        external 
        view 
        override 
        returns (bool) 
    {
        return _walletToTokenId[wallet] != 0;
    }
    
    function getWalletForChain(uint256 tokenId, uint256 chainId) 
        external 
        view 
        override 
        tokenExists(tokenId)
        returns (address wallet, bool isActive) 
    {
        ChainAddress[] memory addresses = _identities[tokenId].chainAddresses;
        for (uint256 i = 0; i < addresses.length; i++) {
            if (addresses[i].chainId == chainId) {
                return (addresses[i].wallet, addresses[i].isActive);
            }
        }
        return (address(0), false);
    }
    
    function isVerified(uint256 tokenId) 
        external 
        view 
        override 
        tokenExists(tokenId)
        returns (bool) 
    {
        IdentityData memory identity = _identities[tokenId];
        return identity.status == CRATSConfig.VerificationStatus.Verified &&
               !identity.isFrozen &&
               (identity.expiresAt == 0 || identity.expiresAt > block.timestamp);
    }
    
    function getTotalIdentities() external view override returns (uint256) {
        return _tokenIdCounter;
    }
    
    /**
     * @dev Override supportsInterface to support both ERC721 and AccessControl
     */
    function supportsInterface(bytes4 interfaceId) 
        public 
        view 
        override(ERC721, AccessControl) 
        returns (bool) 
    {
        return interfaceId == type(IIdentitySBT).interfaceId ||
               super.supportsInterface(interfaceId);
    }
    
    // === Core Functions ===
    
    /**
     * @dev Mint a new identity SBT
     * Only callable by approved KYC providers or IdentityRegistry
     */
    function mintIdentity(
        address to,
        bytes32 didHash,
        string memory did,
        ChainAddress[] memory chainAddresses,
        CRATSConfig.InvestorRole role,
        uint16 jurisdiction,
        bool isAccredited
    ) external override onlyIdentityManager returns (uint256) {
        require(to != address(0), "IdentitySBT: Cannot mint to zero address");
        require(_walletToTokenId[to] == 0, "IdentitySBT: Wallet already has identity");
        require(chainAddresses.length > 0, "IdentitySBT: Must have at least one chain address");
        require(jurisdiction != 0, "IdentitySBT: Invalid jurisdiction");
        
        uint256 tokenId = ++_tokenIdCounter;

        // Create identity data
        IdentityData storage identity = _identities[tokenId];

        // Set chain addresses (push individually - Solidity doesn't support direct array copy)
        for (uint256 i = 0; i < chainAddresses.length; i++) {
            identity.chainAddresses.push(chainAddresses[i]);
        }

        // Set DID
        identity.didHash = didHash;
        identity.did = did;

        // Set role
        identity.role = role;

        // Set compliance data
        identity.status = CRATSConfig.VerificationStatus.Verified;
        identity.jurisdiction = jurisdiction;
        identity.isAccredited = isAccredited;
        identity.riskLevel = 0;

        // Set timestamps
        identity.verifiedAt = uint64(block.timestamp);
        identity.expiresAt = uint64(block.timestamp) + CRATSConfig.DEFAULT_KYC_EXPIRY;
        identity.updatedAt = uint64(block.timestamp);

        // Set control flags
        identity.isFrozen = false;

        // Mint token
        _safeMint(to, tokenId);
        _walletToTokenId[to] = tokenId;

        // Emit event
        emit IdentityMinted(to, tokenId, didHash, role);

        return tokenId;
    }
    
    /**
     * @dev Add a chain address to existing identity
     */
    function addChainAddress(
        uint256 tokenId,
        uint256 chainId,
        address wallet
    ) external override onlyIdentityManager tokenExists(tokenId) {
        require(wallet != address(0), "IdentitySBT: Wallet cannot be zero address");
        require(chainId != 0, "IdentitySBT: Invalid chain ID");
        
        IdentityData storage identity = _identities[tokenId];
        
        // Check max chain addresses
        require(
            identity.chainAddresses.length < CRATSConfig.MAX_CHAIN_ADDRESSES,
            "IdentitySBT: Max chain addresses reached"
        );
        
        // Check if chain already exists
        for (uint256 i = 0; i < identity.chainAddresses.length; i++) {
            require(
                identity.chainAddresses[i].chainId != chainId,
                "IdentitySBT: Chain already exists"
            );
        }
        
        // Add new chain address
        identity.chainAddresses.push(ChainAddress({
            chainId: chainId,
            wallet: wallet,
            isActive: true,
            addedAt: uint64(block.timestamp)
        }));
        
        // Map wallet to token ID
        _walletToTokenId[wallet] = tokenId;
        
        // Update timestamp
        identity.updatedAt = uint64(block.timestamp);
        
        emit ChainAddressAdded(tokenId, chainId, wallet);
    }
    
    /**
     * @dev Deactivate a chain address
     */
    function deactivateChainAddress(
        uint256 tokenId,
        uint256 chainId
    ) external override onlyIdentityManager tokenExists(tokenId) {
        IdentityData storage identity = _identities[tokenId];
        
        for (uint256 i = 0; i < identity.chainAddresses.length; i++) {
            if (identity.chainAddresses[i].chainId == chainId) {
                require(
                    identity.chainAddresses.length > 1,
                    "IdentitySBT: Cannot deactivate last chain address"
                );
                
                address deactivatedWallet = identity.chainAddresses[i].wallet;
                
                // Deactivate (don't remove to maintain history)
                identity.chainAddresses[i].isActive = false;
                
                // Remove wallet mapping
                delete _walletToTokenId[deactivatedWallet];
                
                identity.updatedAt = uint64(block.timestamp);
                
                emit ChainAddressDeactivated(tokenId, chainId, deactivatedWallet);
                return;
            }
        }
        
        revert("IdentitySBT: Chain not found");
    }
    
    /**
     * @dev Update investor role
     */
    function updateRole(
        uint256 tokenId,
        CRATSConfig.InvestorRole newRole
    ) external override onlyIdentityManager tokenExists(tokenId) {
        IdentityData storage identity = _identities[tokenId];
        CRATSConfig.InvestorRole oldRole = identity.role;
        
        identity.role = newRole;
        identity.updatedAt = uint64(block.timestamp);
        
        emit RoleUpdated(tokenId, oldRole, newRole);
    }
    
    /**
     * @dev Update jurisdiction
     */
    function updateJurisdiction(
        uint256 tokenId,
        uint16 newJurisdiction
    ) external override onlyIdentityManager tokenExists(tokenId) {
        require(newJurisdiction != 0, "IdentitySBT: Invalid jurisdiction");
        
        IdentityData storage identity = _identities[tokenId];
        uint16 oldJurisdiction = identity.jurisdiction;
        
        identity.jurisdiction = newJurisdiction;
        identity.updatedAt = uint64(block.timestamp);
        
        emit JurisdictionUpdated(tokenId, oldJurisdiction, newJurisdiction);
    }
    
    /**
     * @dev Update accreditation status
     */
    function updateAccreditation(
        uint256 tokenId,
        bool isAccredited
    ) external override onlyIdentityManager tokenExists(tokenId) {
        IdentityData storage identity = _identities[tokenId];

        identity.isAccredited = isAccredited;
        identity.updatedAt = uint64(block.timestamp);

        emit AccreditationUpdated(tokenId, isAccredited);
    }

    /**
     * @dev Update risk level
     */
    function updateRiskLevel(
        uint256 tokenId,
        uint8 newRiskLevel
    ) external override onlyIdentityManager tokenExists(tokenId) {
        require(newRiskLevel <= 5, "IdentitySBT: Risk level must be 0-5");

        IdentityData storage identity = _identities[tokenId];
        uint8 oldRiskLevel = identity.riskLevel;

        identity.riskLevel = newRiskLevel;
        identity.updatedAt = uint64(block.timestamp);

        emit RiskLevelUpdated(tokenId, oldRiskLevel, newRiskLevel);
    }
    
    /**
     * @dev Update DID hash
     */
    function updateDIDHash(
        uint256 tokenId,
        bytes32 newDidHash
    ) external override onlyIdentityManager tokenExists(tokenId) {
        IdentityData storage identity = _identities[tokenId];
        bytes32 oldHash = identity.didHash;
        
        identity.didHash = newDidHash;
        identity.updatedAt = uint64(block.timestamp);
        
        emit DIDHashUpdated(tokenId, oldHash, newDidHash);
    }
    
    /**
     * @dev Update verification status
     */
    function updateStatus(
        uint256 tokenId,
        CRATSConfig.VerificationStatus newStatus
    ) external override onlyIdentityManager tokenExists(tokenId) {
        IdentityData storage identity = _identities[tokenId];
        CRATSConfig.VerificationStatus oldStatus = identity.status;
        
        identity.status = newStatus;
        identity.updatedAt = uint64(block.timestamp);
        
        emit StatusUpdated(tokenId, oldStatus, newStatus);
    }
    
    /**
     * @dev Freeze an identity
     */
    function freezeIdentity(uint256 tokenId) 
        external 
        override 
        onlyIdentityManager 
        tokenExists(tokenId) 
    {
        IdentityData storage identity = _identities[tokenId];
        
        require(!identity.isFrozen, "IdentitySBT: Already frozen");
        
        identity.isFrozen = true;
        identity.updatedAt = uint64(block.timestamp);
        
        emit IdentityFrozen(tokenId);
    }
    
    /**
     * @dev Unfreeze an identity
     */
    function unfreezeIdentity(uint256 tokenId) 
        external 
        override 
        onlyIdentityManager 
        tokenExists(tokenId) 
    {
        IdentityData storage identity = _identities[tokenId];
        
        require(identity.isFrozen, "IdentitySBT: Not frozen");
        
        identity.isFrozen = false;
        identity.updatedAt = uint64(block.timestamp);
        
        emit IdentityUnfrozen(tokenId);
    }
    
    /**
     * @dev Extend KYC expiry
     */
    function extendExpiry(
        uint256 tokenId,
        uint64 newExpiry
    ) external override onlyIdentityManager tokenExists(tokenId) {
        IdentityData storage identity = _identities[tokenId];
        uint64 oldExpiry = identity.expiresAt;
        
        require(newExpiry > oldExpiry, "IdentitySBT: New expiry must be greater");
        
        identity.expiresAt = newExpiry;
        identity.updatedAt = uint64(block.timestamp);
        
        emit ExpiryExtended(tokenId, oldExpiry, newExpiry);
    }
    
    /**
     * @dev Revoke identity (burn SBT)
     */
    function revokeIdentity(uint256 tokenId)
        external
        override
        onlyIdentityManager
        tokenExists(tokenId)
    {
        // Update status to revoked
        _identities[tokenId].status = CRATSConfig.VerificationStatus.Revoked;

        // Deactivate all chain addresses
        ChainAddress[] memory addresses = _identities[tokenId].chainAddresses;
        for (uint256 i = 0; i < addresses.length; i++) {
            if (addresses[i].isActive) {
                delete _walletToTokenId[addresses[i].wallet];
            }
        }

        // Burn token
        _burn(tokenId);
        
        emit IdentityRevoked(tokenId);
    }

    // === Soulbound Implementation ===
    // Override _update to prevent transfers (minting and burning still allowed)

    /**
     * @dev Override _update to prevent transfers
     */
    function _update(address to, uint256 tokenId, address auth) 
        internal 
        override 
        returns (address) 
    {
        address from = _ownerOf(tokenId);
        
        // Allow minting (from is address(0))
        if (from == address(0)) {
            return super._update(to, tokenId, auth);
        }
        
        // Allow burning (to is address(0))
        if (to == address(0)) {
            return super._update(to, tokenId, auth);
        }
        
        // Prevent all transfers
        revert("IdentitySBT: Transfers not allowed (soulbound)");
    }

    // === Internal Functions ===

    /**
     * @dev Internal function to check if token exists
     */
    function _exists(uint256 tokenId) internal view returns (bool) {
        return tokenId > 0 && tokenId <= _tokenIdCounter;
    }

    /**
     * @dev Update KYC registry address (admin only)
     */
    function setKYCRegistry(address newRegistry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newRegistry != address(0), "IdentitySBT: Invalid registry address");
        _kycRegistry = IKYCProvidersRegistry(newRegistry);
    }
}
