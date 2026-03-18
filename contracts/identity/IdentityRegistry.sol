// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "../interfaces/identity/IIdentitySBT.sol";
import "../interfaces/identity/IKYCProvidersRegistry.sol";
import "../utils/CRATSConfig.sol";

/**
 * @title IdentityRegistry
 * @dev Central registry for identity verification lookups
 * // Source: ERC-3643 T-REX IdentityRegistry Pattern
 */
interface IIdentityRegistry {
    function isVerified(address wallet) external view returns (bool);
    function getIdentity(address wallet) external view returns (IIdentitySBT.IdentityData memory);
}

contract IdentityRegistry is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable,
    IIdentityRegistry
{
    IIdentitySBT public identitySBT;
    IKYCProvidersRegistry public kycProvidersRegistry;

    event IdentityRegistered(
        address indexed wallet,
        uint256 indexed tokenId,
        uint8 role,
        uint16 jurisdiction
    );
    event IdentityUpdated(address indexed wallet, uint256 indexed tokenId);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address admin,
        address identitySBT_,
        address kycProvidersRegistry_
    ) public initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        identitySBT = IIdentitySBT(identitySBT_);
        kycProvidersRegistry = IKYCProvidersRegistry(kycProvidersRegistry_);

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(CRATSConfig.KYC_PROVIDER_ROLE, admin);
        _grantRole(CRATSConfig.COMPLIANCE_ROLE, admin);
    }

    // === Views ===

    /**
     * @dev Check if a wallet is verified and eligible for transfers
     * // Source: ERC-3643 isVerified logic
     */
    function isVerified(address wallet) external view override returns (bool) {
        return identitySBT.isVerified(wallet);
    }

    /**
     * @dev Retrieve identity data for a wallet
     */
    function getIdentity(address wallet) external view override returns (IIdentitySBT.IdentityData memory) {
        uint256 tokenId = identitySBT.tokenIdOf(wallet);
        require(tokenId != 0, "IdentityRegistry: wallet not registered");
        return identitySBT.getIdentity(tokenId);
    }

    // === Management (only KYC Providers) ===

    function registerIdentity(
        address primaryWallet,
        uint8 role,
        uint16 jurisdiction,
        bytes32 didHash,
        string calldata did,
        uint64 expiresAt
    ) external onlyRole(CRATSConfig.KYC_PROVIDER_ROLE) returns (uint256) {
        // Cross-check with KYC provider registry if needed
        require(kycProvidersRegistry.isProviderApproved(msg.sender), "IdentityRegistry: unauthorized provider");

        uint256 tokenId = identitySBT.registerIdentity(
            primaryWallet,
            role,
            jurisdiction,
            didHash,
            did,
            expiresAt
        );

        emit IdentityRegistered(primaryWallet, tokenId, role, jurisdiction);
        return tokenId;
    }

    function addChainAddress(
        address wallet,
        uint256 chainId,
        address newWallet
    ) external onlyRole(CRATSConfig.KYC_PROVIDER_ROLE) {
        uint256 tokenId = identitySBT.tokenIdOf(wallet);
        identitySBT.addChainAddress(tokenId, chainId, newWallet);
        emit IdentityUpdated(wallet, tokenId);
    }

    function updateRole(address wallet, uint8 newRole) external onlyRole(CRATSConfig.KYC_PROVIDER_ROLE) {
        uint256 tokenId = identitySBT.tokenIdOf(wallet);
        identitySBT.updateRole(tokenId, newRole);
        emit IdentityUpdated(wallet, tokenId);
    }

    function updateJurisdiction(address wallet, uint16 newJurisdiction)
        external
        onlyRole(CRATSConfig.KYC_PROVIDER_ROLE)
    {
        uint256 tokenId = identitySBT.tokenIdOf(wallet);
        identitySBT.updateJurisdiction(tokenId, newJurisdiction);
        emit IdentityUpdated(wallet, tokenId);
    }

    function updateStatus(address wallet, uint8 newStatus) external onlyRole(CRATSConfig.KYC_PROVIDER_ROLE) {
        uint256 tokenId = identitySBT.tokenIdOf(wallet);
        identitySBT.updateStatus(tokenId, newStatus);
        emit IdentityUpdated(wallet, tokenId);
    }

    function updateExpiry(address wallet, uint64 newExpiresAt) external onlyRole(CRATSConfig.KYC_PROVIDER_ROLE) {
        uint256 tokenId = identitySBT.tokenIdOf(wallet);
        identitySBT.updateExpiry(tokenId, newExpiresAt);
        emit IdentityUpdated(wallet, tokenId);
    }

    // === Regulatory Functions (only Regulators) ===

    function freeze(address wallet) external onlyRole(CRATSConfig.REGULATOR_ROLE) {
        uint256 tokenId = identitySBT.tokenIdOf(wallet);
        identitySBT.freeze(tokenId);
    }

    function unfreeze(address wallet) external onlyRole(CRATSConfig.REGULATOR_ROLE) {
        uint256 tokenId = identitySBT.tokenIdOf(wallet);
        identitySBT.unfreeze(tokenId);
    }

    function revoke(address wallet) external onlyRole(CRATSConfig.REGULATOR_ROLE) {
        uint256 tokenId = identitySBT.tokenIdOf(wallet);
        identitySBT.updateStatus(tokenId, CRATSConfig.STATUS_REVOKED);
    }

    // === Admin ===

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}

    function setIdentitySBT(address newSBT) external onlyRole(DEFAULT_ADMIN_ROLE) {
        identitySBT = IIdentitySBT(newSBT);
    }

    function setKYCRegistry(address newKYC) external onlyRole(DEFAULT_ADMIN_ROLE) {
        kycProvidersRegistry = IKYCProvidersRegistry(newKYC);
    }
}
