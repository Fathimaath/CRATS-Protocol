// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title IAssetFactory
 * @dev Interface for Asset Factory - Asset deployment with plugin system
 */
interface IAssetFactory {

    // === Events ===

    event AssetCreated(
        bytes32 indexed assetId,
        address indexed token,
        address indexed oracle,
        address registry,
        address issuer,
        bytes32 category
    );

    event PluginRegistered(bytes32 indexed category, address indexed plugin);
    event PluginUpgraded(bytes32 indexed category, address indexed newPlugin);
    event IssuerApproved(address indexed issuer);
    event IssuerRevoked(address indexed issuer);
    event CreationRequestSubmitted(bytes32 indexed requestId, address indexed issuer);
    event CreationRequestApproved(bytes32 indexed requestId);
    event CreationRequestRejected(bytes32 indexed requestId, string reason);
    event CircuitBreakerConfigured(address indexed asset, address circuitBreaker);

    // === Structs ===

    struct AssetContracts {
        address token;
        address oracle;
        address registry;
        address circuitBreaker;
        bytes32 category;
        address issuer;
        bool active;
        uint256 createdAt;
    }

    struct CreationRequest {
        address issuer;
        bytes32 category;
        string name;
        string symbol;
        uint256 initialSupply;
        uint256 initialNAV;
        bytes categoryData;
        bool approved;
        bool rejected;
        string rejectReason;
    }

    // === View Functions ===

    function version() external view returns (string memory);
    function assetCount() external view returns (uint256);
    function getAssetId(uint256 index) external view returns (bytes32);
    function getAssetByToken(address token) external view returns (bytes32);
    function isIssuerApproved(address issuer) external view returns (bool);
    function isPluginRegistered(bytes32 category) external view returns (bool);
    function getPlugin(bytes32 category) external view returns (address);
    function getRequestCount() external view returns (uint256);
    function circuitBreakerModule() external view returns (address);
    function identityRegistry() external view returns (address);
    function complianceModule() external view returns (address);
    function assetRegistry() external view returns (address);

    // === Asset Creation ===

    function submitCreationRequest(
        bytes32 category,
        string calldata name,
        string calldata symbol,
        uint256 initialSupply,
        uint256 initialNAV,
        bytes calldata categoryData
    ) external returns (bytes32);

    function approveCreationRequest(bytes32 requestId) external;
    function rejectCreationRequest(bytes32 requestId, string calldata reason) external;
    function deployAsset(bytes32 requestId) external;

    // === Plugin Management ===

    function registerPlugin(bytes32 category, address plugin) external;
    function upgradePlugin(bytes32 category, address newPlugin) external;

    // === Issuer Management ===

    function approveIssuer(address issuer) external;
    function revokeIssuer(address issuer) external;

    // === Configuration ===

    function setCircuitBreakerModule(address circuitBreaker) external;
    function setIdentityRegistry(address identityRegistry) external;
    function setComplianceModule(address complianceModule) external;

    // === Vault Integration ===

    function onVaultDeployed(
        address assetToken,
        address vault,
        uint8 vaultType
    ) external;
}
