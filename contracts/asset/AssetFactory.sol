// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import "../interfaces/asset/IAssetFactory.sol";
import "../interfaces/asset/IAssetPlugin.sol";
import "../interfaces/asset/IAssetToken.sol";
import "../interfaces/asset/IAssetRegistry.sol";
import "../utils/AssetConfig.sol";
import "../utils/CRATSConfig.sol";

/**
 * @title AssetFactory
 * @dev Factory for deploying and managing RWA asset tokens.
 * // Source: Audited Asset Factory Architecture
 */
contract AssetFactory is 
    Initializable, 
    AccessControlUpgradeable, 
    ReentrancyGuardUpgradeable, 
    UUPSUpgradeable, 
    IAssetFactory 
{
    // === State ===
    address public assetTokenImplementation;
    address public identityRegistry;
    address public complianceModule;
    address public circuitBreakerModule;
    address public assetRegistry;

    bytes32 public constant VAULT_FACTORY_ROLE = AssetConfig.VAULT_FACTORY_ROLE;

    mapping(bytes32 => address) public plugins;
    mapping(address => bool) public isIssuerApproved;

    struct AssetInfo {
        address token;
        address issuer;
        bytes32 category;
        uint256 timestamp;
    }

    mapping(address => AssetInfo) public assets;
    address[] public allAssets;

    event AssetDeployed(address indexed token, address indexed issuer, bytes32 category);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address admin,
        address implementation,
        address identityRegistry_,
        address complianceModule_,
        address circuitBreaker_
    ) public initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        assetTokenImplementation = implementation;
        identityRegistry = identityRegistry_;
        complianceModule = complianceModule_;
        circuitBreakerModule = circuitBreaker_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(CRATSConfig.COMPLIANCE_ROLE, admin);
    }

    // === Issuer Management ===

    function approveIssuer(address issuer) external onlyRole(DEFAULT_ADMIN_ROLE) {
        isIssuerApproved[issuer] = true;
        emit IssuerApproved(issuer);
    }

    function revokeIssuer(address issuer) external onlyRole(DEFAULT_ADMIN_ROLE) {
        isIssuerApproved[issuer] = false;
        emit IssuerRevoked(issuer);
    }

    // === Plugin Management ===

    function registerPlugin(bytes32 category, address plugin) external onlyRole(DEFAULT_ADMIN_ROLE) {
        plugins[category] = plugin;
        emit PluginRegistered(category, plugin);
    }

    function upgradePlugin(bytes32 category, address newPlugin) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        plugins[category] = newPlugin;
        emit PluginUpgraded(category, newPlugin);
    }

    function isPluginRegistered(bytes32 category) external view override returns (bool) {
        return plugins[category] != address(0);
    }

    // === Asset Deployment ===

    function deployAsset(
        string memory name,
        string memory symbol,
        uint256 initialSupply,
        bytes32 category
    ) external nonReentrant returns (address) {
        require(isIssuerApproved[_msgSender()], "AssetFactory: issuer not approved");
        require(plugins[category] != address(0), "AssetFactory: category plugin not found");

        IAssetPlugin.AssetParams memory params = IAssetPlugin.AssetParams({
            name: name,
            symbol: symbol,
            initialSupply: initialSupply,
            categoryId: category
        });
        require(IAssetPlugin(plugins[category]).validateCreation(_msgSender(), params), "AssetFactory: plugin validation failed");

        bytes memory initData = abi.encodeWithSelector(
            IAssetToken.initialize.selector,
            name,
            symbol,
            _msgSender(),
            identityRegistry,
            complianceModule,
            circuitBreakerModule
        );

        ERC1967Proxy proxy = new ERC1967Proxy(assetTokenImplementation, initData);
        address token = address(proxy);

        IAssetToken(token).mint(_msgSender(), initialSupply);

        assets[token] = AssetInfo({
            token: token,
            issuer: _msgSender(),
            category: category,
            timestamp: block.timestamp
        });
        allAssets.push(token);

        emit AssetDeployed(token, _msgSender(), category);
        return token;
    }

    // === Logic Overrides (Compatibility with IAssetFactory) ===

    function version() external pure override returns (string memory) { return AssetConfig.VERSION; }
    function assetCount() external view override returns (uint256) { return allAssets.length; }
    function getAssetId(uint256 index) external view override returns (bytes32) { return bytes32(uint256(uint160(allAssets[index]))); }
    function getAssetByToken(address token) external view override returns (bytes32) { return bytes32(uint256(uint160(token))); }
    function getPlugin(bytes32 category) external view override returns (address) { return plugins[category]; }
    function getRequestCount() external pure override returns (uint256) { return 0; } 
    function submitCreationRequest(bytes32, string calldata, string calldata, uint256, uint256, bytes calldata) external pure override returns (bytes32) { return bytes32(0); }
    function approveCreationRequest(bytes32) external override {}
    function rejectCreationRequest(bytes32, string calldata) external override {}
    
    function setCircuitBreakerModule(address module) external override onlyRole(DEFAULT_ADMIN_ROLE) { 
        circuitBreakerModule = module; 
        emit CircuitBreakerConfigured(address(0), module);
    }
    function setIdentityRegistry(address registry) external override onlyRole(DEFAULT_ADMIN_ROLE) { identityRegistry = registry; }
    function setComplianceModule(address module) external override onlyRole(DEFAULT_ADMIN_ROLE) { complianceModule = module; }
    function setAssetRegistry(address registry) external onlyRole(DEFAULT_ADMIN_ROLE) { 
        assetRegistry = registry; 
    }
    
    function onVaultDeployed(
        address assetToken,
        address vault,
        uint8 /* vaultType */
    ) external override onlyRole(VAULT_FACTORY_ROLE) {
        require(assetRegistry != address(0), "AssetFactory: registry not set");
        IAssetRegistry(assetRegistry).registerVault(assetToken, vault);
    }

    function deployAsset(bytes32) external override {}

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
