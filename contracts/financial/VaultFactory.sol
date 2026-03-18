// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "../utils/AssetConfig.sol";
import "../vault/SyncVault.sol";
import "../vault/AsyncVault.sol";

/**
 * @title VaultFactory
 * @dev Factory for creating and managing ERC-4626/ERC-7540 vaults
 * 
 * Features:
 * - Deploy SyncVault (ERC-4626) for liquid assets
 * - Deploy AsyncVault (ERC-7540) for RWA
 * - Vault registry and tracking
 * - Template-based deployment (gas efficient)
 * - Layer 1 compliance integration
 * 
 * @dev Uses Clones for gas-efficient deployments
 */
contract VaultFactory is AccessControl, ReentrancyGuard {
    using Clones for address;

    // ========== State Variables ==========

    /// @dev Vault templates
    address public syncVaultTemplate;
    address public asyncVaultTemplate;

    /// @dev Vault registry: vault address => VaultInfo
    mapping(address => VaultInfo) public vaultRegistry;

    /// @dev Vault addresses by category
    mapping(bytes32 => address[]) public vaultsByCategory;

    /// @dev All vault addresses
    address[] public allVaults;

    /// @dev Vault count
    uint256 public vaultCount;

    /// @dev Layer 1 dependencies
    address public identityRegistry;
    address public complianceModule;
    address public circuitBreakerModule;
    address public yieldDistributor;
    address public redemptionManager;

    /// @dev Category plugins
    mapping(bytes32 => address) public categoryPlugins;

    // ========== Structs ==========

    /**
     * @dev Vault information
     */
    struct VaultInfo {
        address vault;            // Vault address
        address asset;            // Underlying asset
        bytes32 category;         // Vault category
        VaultType vaultType;      // Sync or Async
        address creator;          // Creator address
        uint256 createdAt;        // Creation timestamp
        bool active;              // Vault active status
        string name;              // Vault name
        string symbol;            // Vault symbol
    }

    /**
     * @dev Vault type
     */
    enum VaultType {
        SYNC,     // ERC-4626 (atomic)
        ASYNC     // ERC-7540 (request/claim)
    }

    /**
     * @dev Vault creation parameters
     */
    struct VaultParams {
        address asset;            // Underlying asset
        string name;              // Vault name
        string symbol;            // Vault symbol
        bytes32 category;         // Vault category
        VaultType vaultType;      // Sync or Async
        uint256 depositSettlement; // Deposit settlement period (async only)
        uint256 redeemSettlement;  // Redemption settlement period (async only)
    }

    // ========== Events ==========

    event VaultCreated(
        address indexed vault,
        address indexed asset,
        bytes32 indexed category,
        VaultType vaultType,
        address creator,
        uint256 createdAt
    );

    event VaultTemplateSet(
        VaultType vaultType,
        address template
    );

    event Layer1Configured(
        string component,
        address addr
    );

    event CategoryPluginRegistered(
        bytes32 indexed category,
        address indexed plugin
    );

    // ========== Roles ==========

    bytes32 public constant VAULT_CREATOR_ROLE = keccak256("VAULT_CREATOR_ROLE");
    bytes32 public constant CATEGORY_MANAGER_ROLE = keccak256("CATEGORY_MANAGER_ROLE");

    // ========== Constructor ==========

    constructor(address admin) {
        require(admin != address(0), "VaultFactory: Admin cannot be zero");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(VAULT_CREATOR_ROLE, admin);
        _grantRole(CATEGORY_MANAGER_ROLE, admin);
    }

    // ========== Template Management ==========

    /**
     * @dev Set SyncVault template
     */
    function setSyncVaultTemplate(address template) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(template != address(0), "VaultFactory: Invalid template");
        syncVaultTemplate = template;
        emit VaultTemplateSet(VaultType.SYNC, template);
    }

    /**
     * @dev Set AsyncVault template
     */
    function setAsyncVaultTemplate(address template) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(template != address(0), "VaultFactory: Invalid template");
        asyncVaultTemplate = template;
        emit VaultTemplateSet(VaultType.ASYNC, template);
    }

    // ========== Vault Creation ==========

    /**
     * @dev Create a new vault
     */
    function createVault(VaultParams memory params)
        public
        onlyRole(VAULT_CREATOR_ROLE)
        nonReentrant
        returns (address vault)
    {
        require(params.asset != address(0), "VaultFactory: Invalid asset");
        require(bytes(params.name).length > 0, "VaultFactory: Name required");
        require(bytes(params.symbol).length > 0, "VaultFactory: Symbol required");

        // Validate template
        address template = params.vaultType == VaultType.SYNC
            ? syncVaultTemplate
            : asyncVaultTemplate;
        require(template != address(0), "VaultFactory: Template not set");

        // Deploy clone
        vault = template.clone();

        // Initialize vault
        if (params.vaultType == VaultType.SYNC) {
            // Initialize SyncVault - set category (creator already has OPERATOR_ROLE from template)
            SyncVault(vault).setCategory(params.category);
        } else {
            // Initialize AsyncVault - set category and settlement period
            AsyncVault(vault).setCategory(params.category);
            AsyncVault(vault).setSettlementPeriod(params.redeemSettlement);
        }

        // Register vault
        _registerVault(vault, params);

        emit VaultCreated(
            vault,
            params.asset,
            params.category,
            params.vaultType,
            msg.sender,
            block.timestamp
        );
    }

    /**
     * @dev Create a sync vault (ERC-4626)
     */
    function createSyncVault(
        address asset,
        string calldata name,
        string calldata symbol,
        bytes32 category
    ) external returns (address vault) {
        return createVault(VaultParams({
            asset: asset,
            name: name,
            symbol: symbol,
            category: category,
            vaultType: VaultType.SYNC,
            depositSettlement: 0,
            redeemSettlement: 0
        }));
    }

    /**
     * @dev Create an async vault (ERC-7540)
     */
    function createAsyncVault(
        address asset,
        string calldata name,
        string calldata symbol,
        bytes32 category,
        uint256 depositSettlement,
        uint256 redeemSettlement
    ) external returns (address vault) {
        return createVault(VaultParams({
            asset: asset,
            name: name,
            symbol: symbol,
            category: category,
            vaultType: VaultType.ASYNC,
            depositSettlement: depositSettlement,
            redeemSettlement: redeemSettlement
        }));
    }

    // ========== Category Plugin Management ==========

    /**
     * @dev Register a category plugin
     */
    function registerCategoryPlugin(
        bytes32 category,
        address plugin
    ) external onlyRole(CATEGORY_MANAGER_ROLE) {
        require(plugin != address(0), "VaultFactory: Invalid plugin");
        categoryPlugins[category] = plugin;
        emit CategoryPluginRegistered(category, plugin);
    }

    /**
     * @dev Get category plugin
     */
    function getCategoryPlugin(bytes32 category) external view returns (address) {
        return categoryPlugins[category];
    }

    // ========== Layer 1 Configuration ==========

    /**
     * @dev Set Layer 1 Identity Registry
     */
    function setIdentityRegistry(address registry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(registry != address(0), "VaultFactory: Invalid registry");
        identityRegistry = registry;
        emit Layer1Configured("IdentityRegistry", registry);
    }

    /**
     * @dev Set Layer 1 Compliance Module
     */
    function setComplianceModule(address compliance) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(compliance != address(0), "VaultFactory: Invalid compliance");
        complianceModule = compliance;
        emit Layer1Configured("ComplianceModule", compliance);
    }

    /**
     * @dev Set Circuit Breaker Module
     */
    function setCircuitBreakerModule(address cb) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(cb != address(0), "VaultFactory: Invalid circuit breaker");
        circuitBreakerModule = cb;
        emit Layer1Configured("CircuitBreakerModule", cb);
    }

    /**
     * @dev Set Yield Distributor
     */
    function setYieldDistributor(address yd) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(yd != address(0), "VaultFactory: Invalid yield distributor");
        yieldDistributor = yd;
        emit Layer1Configured("YieldDistributor", yd);
    }

    /**
     * @dev Set Redemption Manager
     */
    function setRedemptionManager(address rm) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(rm != address(0), "VaultFactory: Invalid redemption manager");
        redemptionManager = rm;
        emit Layer1Configured("RedemptionManager", rm);
    }

    // ========== View Functions ==========

    /**
     * @dev Get vault info
     */
    function getVaultInfo(address vault) external view returns (VaultInfo memory) {
        return vaultRegistry[vault];
    }

    /**
     * @dev Get vaults by category
     */
    function getVaultsByCategory(bytes32 category) external view returns (address[] memory) {
        return vaultsByCategory[category];
    }

    /**
     * @dev Get all vaults
     */
    function getAllVaults() external view returns (address[] memory) {
        return allVaults;
    }

    /**
     * @dev Get vault count
     */
    function getVaultCount() external view returns (uint256) {
        return vaultCount;
    }

    // ========== Internal Functions ==========

    /**
     * @dev Register vault in registry
     */
    function _registerVault(address vault, VaultParams memory params) internal {
        vaultRegistry[vault] = VaultInfo({
            vault: vault,
            asset: params.asset,
            category: params.category,
            vaultType: params.vaultType,
            creator: msg.sender,
            createdAt: block.timestamp,
            active: true,
            name: params.name,
            symbol: params.symbol
        });

        vaultsByCategory[params.category].push(vault);
        allVaults.push(vault);
        vaultCount++;
    }

    // ========== Version ==========

    function version() external pure virtual returns (string memory) {
        return AssetConfig.VERSION;
    }
}
