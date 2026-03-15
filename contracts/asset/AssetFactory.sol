// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "../interfaces/asset/IAssetFactory.sol";
import "../interfaces/asset/plugins/IAssetPlugin.sol";
import "../interfaces/asset/IAssetToken.sol";
import "../interfaces/asset/IAssetOracle.sol";
import "../interfaces/asset/IAssetRegistry.sol";
import "../interfaces/compliance/ICircuitBreakerModule.sol";
import "../interfaces/utils/ICRATSAccessControl.sol";
import "../utils/AssetConfig.sol";

/**
 * @title AssetFactory
 * @dev Factory contract for deploying asset tokenization contracts
 * Singleton contract that creates isolated contract triads per asset
 */
contract AssetFactory is AccessControl, ReentrancyGuard, IAssetFactory {

    // === State Variables ===

    // Asset tracking
    bytes32[] private _assetIds;
    mapping(bytes32 => AssetContracts) public assetContracts;
    mapping(address => bytes32) private _tokenToAssetId;

    // Plugin system
    mapping(bytes32 => address) public plugins;
    mapping(bytes32 => bool) public isPluginRegistered;

    // Issuer management
    mapping(address => bool) public isIssuerApproved;

    // Creation requests
    mapping(bytes32 => CreationRequest) public creationRequests;
    bytes32[] private _requestIds;

    // Layer 1 dependencies
    address public identityRegistry;
    address public complianceModule;
    address public circuitBreakerModule;

    // Template addresses
    address public assetTokenTemplate;
    address public assetOracleTemplate;
    address public assetRegistryTemplate;

    // Counters
    uint256 private _assetCounter;
    uint256 private _requestCounter;

    // === Modifiers ===

    modifier onlyApprovedIssuer() {
        require(isIssuerApproved[msg.sender], "AssetFactory: Issuer not approved");
        _;
    }

    modifier onlyOperator() {
        require(hasRole(AssetConfig.OPERATOR_ROLE, msg.sender), "AssetFactory: Caller is not operator");
        _;
    }

    modifier requestExists(bytes32 requestId) {
        require(creationRequests[requestId].issuer != address(0), "AssetFactory: Request not found");
        _;
    }

    modifier requestNotProcessed(bytes32 requestId) {
        CreationRequest storage request = creationRequests[requestId];
        require(!request.approved && !request.rejected, "AssetFactory: Request already processed");
        _;
    }

    // === Constructor ===

    constructor(address admin) {
        require(admin != address(0), "AssetFactory: Admin cannot be zero address");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(AssetConfig.OPERATOR_ROLE, admin);
        isIssuerApproved[admin] = true;
    }

    // === External View Functions ===

    function version() external pure override returns (string memory) {
        return AssetConfig.VERSION;
    }

    function assetCount() external view override returns (uint256) {
        return _assetIds.length;
    }

    function getAssetId(uint256 index) external view override returns (bytes32) {
        require(index < _assetIds.length, "AssetFactory: Index out of bounds");
        return _assetIds[index];
    }

    function getAssetByToken(address token) external view override returns (bytes32) {
        return _tokenToAssetId[token];
    }

    function getPlugin(bytes32 category) external view override returns (address) {
        require(isPluginRegistered[category], "AssetFactory: Plugin not registered");
        return plugins[category];
    }

    function getRequestCount() external view override returns (uint256) {
        return _requestIds.length;
    }

    // === Asset Creation Flow ===

    /**
     * @dev Step 1: Issuer submits creation request
     */
    function submitCreationRequest(
        bytes32 category,
        string calldata name,
        string calldata symbol,
        uint256 initialSupply,
        uint256 initialNAV,
        bytes calldata categoryData
    ) external override onlyApprovedIssuer returns (bytes32) {
        require(initialSupply > 0, "AssetFactory: Initial supply must be positive");
        require(bytes(name).length > 0, "AssetFactory: Name required");
        require(bytes(symbol).length > 0, "AssetFactory: Symbol required");
        require(isPluginRegistered[category], "AssetFactory: Category plugin not registered");

        // Validate with plugin
        address plugin = plugins[category];
        (bool valid, string memory reason) = IAssetPlugin(plugin).validateCreation(
            msg.sender,
            categoryData
        );
        require(valid, string(abi.encodePacked("AssetFactory: ", reason)));

        // Create request
        bytes32 requestId = keccak256(abi.encodePacked(msg.sender, block.timestamp, _requestCounter++));
        
        creationRequests[requestId] = CreationRequest({
            issuer: msg.sender,
            category: category,
            name: name,
            symbol: symbol,
            initialSupply: initialSupply,
            initialNAV: initialNAV,
            categoryData: categoryData,
            approved: false,
            rejected: false,
            rejectReason: ""
        });

        _requestIds.push(requestId);

        emit CreationRequestSubmitted(requestId, msg.sender);

        return requestId;
    }

    /**
     * @dev Step 2: Admin approves request
     */
    function approveCreationRequest(
        bytes32 requestId
    ) external override onlyOperator requestExists(requestId) requestNotProcessed(requestId) {
        creationRequests[requestId].approved = true;
        emit CreationRequestApproved(requestId);
    }

    /**
     * @dev Step 2b: Admin rejects request
     */
    function rejectCreationRequest(
        bytes32 requestId,
        string calldata reason
    ) external override onlyOperator requestExists(requestId) requestNotProcessed(requestId) {
        creationRequests[requestId].rejected = true;
        creationRequests[requestId].rejectReason = reason;
        emit CreationRequestRejected(requestId, reason);
    }

    /**
     * @dev Step 3: Deploy asset contracts
     */
    function deployAsset(
        bytes32 requestId
    ) external override onlyOperator requestExists(requestId) {
        CreationRequest storage request = creationRequests[requestId];
        require(request.approved, "AssetFactory: Request not approved");
        require(assetContracts[requestId].token == address(0), "AssetFactory: Already deployed");

        // Require templates to be set
        require(assetTokenTemplate != address(0), "AssetFactory: Token template not set");
        require(assetOracleTemplate != address(0), "AssetFactory: Oracle template not set");
        require(assetRegistryTemplate != address(0), "AssetFactory: Registry template not set");

        // Generate asset ID
        bytes32 assetId = keccak256(abi.encodePacked(requestId, block.timestamp, _assetCounter++));

        // Deploy AssetToken (clone)
        address token = Clones.clone(assetTokenTemplate);
        
        // Deploy AssetOracle (clone)
        address oracle = Clones.clone(assetOracleTemplate);
        
        // Deploy AssetRegistry (clone)
        address registry = Clones.clone(assetRegistryTemplate);

        // Initialize contracts
        _initializeAssetContracts(
            assetId,
            token,
            oracle,
            registry,
            request
        );

        // Store asset contracts
        assetContracts[assetId] = AssetContracts({
            token: token,
            oracle: oracle,
            registry: registry,
            circuitBreaker: circuitBreakerModule,
            category: request.category,
            issuer: request.issuer,
            active: true,
            createdAt: block.timestamp
        });

        _tokenToAssetId[token] = assetId;
        _assetIds.push(assetId);

        // Configure circuit breaker for this asset
        if (circuitBreakerModule != address(0)) {
            ICircuitBreakerModule(circuitBreakerModule).setAssetLimits(
                token,
                AssetConfig.DEFAULT_LIMIT_UP_BPS,
                AssetConfig.DEFAULT_LIMIT_DOWN_BPS,
                AssetConfig.DEFAULT_PRICE_BAND_PERIOD
            );
        }

        emit AssetCreated(assetId, token, oracle, registry, request.issuer, request.category);
    }

    // === Plugin Management ===

    function registerPlugin(
        bytes32 category,
        address plugin
    ) external override onlyOperator {
        require(plugin != address(0), "AssetFactory: Plugin cannot be zero address");
        require(!isPluginRegistered[category], "AssetFactory: Plugin already registered");

        plugins[category] = plugin;
        isPluginRegistered[category] = true;

        emit PluginRegistered(category, plugin);
    }

    function upgradePlugin(
        bytes32 category,
        address newPlugin
    ) external override onlyOperator {
        require(newPlugin != address(0), "AssetFactory: Plugin cannot be zero address");
        require(isPluginRegistered[category], "AssetFactory: Plugin not registered");

        plugins[category] = newPlugin;

        emit PluginUpgraded(category, newPlugin);
    }

    // === Issuer Management ===

    function approveIssuer(address issuer) external override onlyOperator {
        require(issuer != address(0), "AssetFactory: Issuer cannot be zero address");
        isIssuerApproved[issuer] = true;
        emit IssuerApproved(issuer);
    }

    function revokeIssuer(address issuer) external override onlyOperator {
        isIssuerApproved[issuer] = false;
        emit IssuerRevoked(issuer);
    }

    // === Template Configuration ===

    function setTemplates(
        address tokenTemplate,
        address oracleTemplate,
        address registryTemplate
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(tokenTemplate != address(0), "AssetFactory: Token template cannot be zero");
        require(oracleTemplate != address(0), "AssetFactory: Oracle template cannot be zero");
        require(registryTemplate != address(0), "AssetFactory: Registry template cannot be zero");

        assetTokenTemplate = tokenTemplate;
        assetOracleTemplate = oracleTemplate;
        assetRegistryTemplate = registryTemplate;
    }

    // === Layer 1 Configuration ===

    function setCircuitBreakerModule(
        address circuitBreaker
    ) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        require(circuitBreaker != address(0), "AssetFactory: Circuit breaker cannot be zero");
        circuitBreakerModule = circuitBreaker;
        emit CircuitBreakerConfigured(address(this), circuitBreaker);
    }

    function setIdentityRegistry(
        address identityRegistry_
    ) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        require(identityRegistry_ != address(0), "AssetFactory: Identity registry cannot be zero");
        identityRegistry = identityRegistry_;
    }

    function setComplianceModule(
        address complianceModule_
    ) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        require(complianceModule_ != address(0), "AssetFactory: Compliance module cannot be zero");
        complianceModule = complianceModule_;
    }

    // === Internal Functions ===

    function _initializeAssetContracts(
        bytes32 /* assetId */,
        address token,
        address oracle,
        address registry,
        CreationRequest storage request
    ) internal {
        // Initialize AssetToken
        IAssetToken(token).setIdentityRegistry(identityRegistry);
        IAssetToken(token).setComplianceModule(complianceModule);
        IAssetToken(token).setCircuitBreaker(circuitBreakerModule);

        // Initialize AssetOracle
        IAssetOracle(oracle).addSigner(msg.sender);
        IAssetOracle(oracle).addSigner(request.issuer);

        // Initialize AssetRegistry
        IAssetRegistry(registry).addOperator(msg.sender);
        IAssetRegistry(registry).addOperator(request.issuer);
    }
}




