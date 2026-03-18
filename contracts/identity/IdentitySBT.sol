// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "../interfaces/identity/IIdentitySBT.sol";
import "../utils/CRATSConfig.sol";

/**
 * @title IdentitySBT
 * @dev ERC-721 Soulbound Token for identity management
 * // Source: OpenZeppelin ERC721Upgradeable
 * // Source: ERC-5192 Minimal Soulbound Token Standard
 * // Source: ERC-3643 T-REX Identity Pattern
 */
contract IdentitySBT is 
    Initializable, 
    ERC721Upgradeable, 
    AccessControlUpgradeable, 
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable, 
    IIdentitySBT 
{
    // === State Variables ===
    
    uint256 private _tokenIdCounter;
    
    // tokenId => IdentityData
    mapping(uint256 => IdentityData) private _identities;
    
    // wallet => tokenId
    mapping(address => uint256) private _walletToTokenId;
    
    // Roles
    bytes32 public constant IDENTITY_MANAGER_ROLE = keccak256("IDENTITY_MANAGER_ROLE");

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        string memory name,
        string memory symbol,
        address admin
    ) public initializer {
        __ERC721_init(name, symbol);
        __AccessControl_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(IDENTITY_MANAGER_ROLE, admin);
    }

    // === ERC-5192 View ===
    
    function locked(uint256 tokenId) external view override returns (bool) {
        require(_exists(tokenId), "IdentitySBT: nonexistent token");
        return true; // All tokens are permanently soulbound
    }

    // === T-REX Views ===

    function tokenIdOf(address wallet) external view override returns (uint256) {
        return _walletToTokenId[wallet];
    }

    function getIdentity(uint256 tokenId) external view override returns (IdentityData memory) {
        require(_exists(tokenId), "IdentitySBT: nonexistent token");
        return _identities[tokenId];
    }

    function isVerified(address wallet) external view override returns (bool) {
        uint256 tokenId = _walletToTokenId[wallet];
        if (tokenId == 0) return false;
        IdentityData storage id = _identities[tokenId];
        return
            id.status == CRATSConfig.STATUS_VERIFIED &&
            !id.isFrozen &&
            (id.expiresAt == 0 || id.expiresAt >= block.timestamp);
    }

    function getTotalIdentities() external view override returns (uint256) {
        return _tokenIdCounter;
    }

    // === Minting & Management (only IdentityManager) ===

    function registerIdentity(
        address primaryWallet,
        uint8 role,
        uint16 jurisdiction,
        bytes32 didHash,
        string calldata did,
        uint64 expiresAt
    ) external override onlyRole(IDENTITY_MANAGER_ROLE) returns (uint256) {
        require(primaryWallet != address(0), "IdentitySBT: zero primary wallet");
        require(_walletToTokenId[primaryWallet] == 0, "IdentitySBT: wallet already has identity");

        uint256 tokenId = ++_tokenIdCounter;
        _safeMint(primaryWallet, tokenId);

        IdentityData storage id = _identities[tokenId];
        id.didHash = didHash;
        id.did = did;
        id.role = role;
        id.status = CRATSConfig.STATUS_VERIFIED;
        id.jurisdiction = jurisdiction;
        id.verifiedAt = uint64(block.timestamp);
        id.expiresAt = expiresAt;
        id.updatedAt = uint64(block.timestamp);
        id.isFrozen = false;

        // Add primary chain address (1 = Ethereum)
        id.chainAddresses.push(ChainAddress({
            chainId: 1,
            wallet: primaryWallet,
            isActive: true,
            addedAt: uint64(block.timestamp)
        }));

        _walletToTokenId[primaryWallet] = tokenId;

        emit IdentityMinted(tokenId, primaryWallet, role, jurisdiction);
        emit StatusChanged(tokenId, CRATSConfig.STATUS_VERIFIED);
        emit Locked(tokenId); // ERC-5192 enforcement

        return tokenId;
    }

    function addChainAddress(
        uint256 tokenId,
        uint256 chainId,
        address wallet
    ) external override onlyRole(IDENTITY_MANAGER_ROLE) {
        require(_exists(tokenId), "IdentitySBT: nonexistent token");
        require(wallet != address(0), "IdentitySBT: zero wallet");
        require(_walletToTokenId[wallet] == 0, "IdentitySBT: wallet already linked");

        IdentityData storage id = _identities[tokenId];
        id.chainAddresses.push(ChainAddress({
            chainId: chainId,
            wallet: wallet,
            isActive: true,
            addedAt: uint64(block.timestamp)
        }));

        _walletToTokenId[wallet] = tokenId;
        emit ChainAddressAdded(tokenId, chainId, wallet);
    }

    function updateRole(uint256 tokenId, uint8 newRole) external override onlyRole(IDENTITY_MANAGER_ROLE) {
        require(_exists(tokenId), "IdentitySBT: nonexistent token");
        _identities[tokenId].role = newRole;
        _identities[tokenId].updatedAt = uint64(block.timestamp);
    }

    function updateJurisdiction(uint256 tokenId, uint16 newJurisdiction) external override onlyRole(IDENTITY_MANAGER_ROLE) {
        require(_exists(tokenId), "IdentitySBT: nonexistent token");
        _identities[tokenId].jurisdiction = newJurisdiction;
        _identities[tokenId].updatedAt = uint64(block.timestamp);
    }

    function updateStatus(uint256 tokenId, uint8 newStatus) external override onlyRole(IDENTITY_MANAGER_ROLE) {
        require(_exists(tokenId), "IdentitySBT: nonexistent token");
        _identities[tokenId].status = newStatus;
        _identities[tokenId].updatedAt = uint64(block.timestamp);
        emit StatusChanged(tokenId, newStatus);
    }

    function updateExpiry(uint256 tokenId, uint64 newExpiresAt) external override onlyRole(IDENTITY_MANAGER_ROLE) {
        require(_exists(tokenId), "IdentitySBT: nonexistent token");
        _identities[tokenId].expiresAt = newExpiresAt;
        _identities[tokenId].updatedAt = uint64(block.timestamp);
    }

    function updateDidHash(uint256 tokenId, bytes32 newDidHash, string calldata newDid) external override onlyRole(IDENTITY_MANAGER_ROLE) {
        require(_exists(tokenId), "IdentitySBT: nonexistent token");
        _identities[tokenId].didHash = newDidHash;
        _identities[tokenId].did = newDid;
        _identities[tokenId].updatedAt = uint64(block.timestamp);
    }

    function updateAccreditation(uint256 tokenId, bool isAccredited) external override onlyRole(IDENTITY_MANAGER_ROLE) {
        require(_exists(tokenId), "IdentitySBT: nonexistent token");
        _identities[tokenId].isAccredited = isAccredited;
        _identities[tokenId].updatedAt = uint64(block.timestamp);
    }

    function updateRiskLevel(uint256 tokenId, uint8 riskLevel) external override onlyRole(IDENTITY_MANAGER_ROLE) {
        require(_exists(tokenId), "IdentitySBT: nonexistent token");
        _identities[tokenId].riskLevel = riskLevel;
        _identities[tokenId].updatedAt = uint64(block.timestamp);
    }

    // === Regulatory Functions ===

    function freeze(uint256 tokenId) external override onlyRole(CRATSConfig.REGULATOR_ROLE) {
        require(_exists(tokenId), "IdentitySBT: nonexistent token");
        _identities[tokenId].isFrozen = true;
        _identities[tokenId].updatedAt = uint64(block.timestamp);
        emit FrozenStateChanged(tokenId, true);
    }

    function unfreeze(uint256 tokenId) external override onlyRole(CRATSConfig.REGULATOR_ROLE) {
        require(_exists(tokenId), "IdentitySBT: nonexistent token");
        _identities[tokenId].isFrozen = false;
        _identities[tokenId].updatedAt = uint64(block.timestamp);
        emit FrozenStateChanged(tokenId, false);
    }

    // === Soulbound Implementation ===

    function _update(address to, uint256 tokenId, address auth) 
        internal 
        override 
        returns (address) 
    {
        address from = _ownerOf(tokenId);
        
        // Allow minting (from is zero)
        if (from == address(0)) {
            return super._update(to, tokenId, auth);
        }
        
        // Allow burning (to is zero)
        if (to == address(0)) {
            return super._update(to, tokenId, auth);
        }
        
        // Prevent all transfers
        revert("IdentitySBT: soulbound, non-transferable");
    }

    // === Internal Functions ===

    function _exists(uint256 tokenId) internal view returns (bool) {
        return tokenId > 0 && tokenId <= _tokenIdCounter && _ownerOf(tokenId) != address(0);
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Upgradeable, AccessControlUpgradeable)
        returns (bool)
    {
        return interfaceId == 0x51920000 || // ERC-5192 interfaceId
               interfaceId == type(IIdentitySBT).interfaceId ||
               super.supportsInterface(interfaceId);
    }
}
