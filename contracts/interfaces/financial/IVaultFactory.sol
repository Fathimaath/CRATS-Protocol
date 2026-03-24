// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

/**
 * @title IVaultFactory
 * @dev Interface for VaultFactory contract
 */
interface IVaultFactory {
    // ========== Events ==========

    event VaultCreated(
        address indexed vault,
        address indexed asset,
        bytes32 indexed category,
        uint256 vaultType,
        address creator,
        uint256 createdAt
    );

    event VaultTemplateSet(
        uint256 vaultType,
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

    // ========== Vault Creation ==========

    function createSyncVault(
        address asset,
        string calldata name,
        string calldata symbol,
        bytes32 category
    ) external returns (address vault);

    function createAsyncVault(
        address asset,
        string calldata name,
        string calldata symbol,
        bytes32 category,
        uint256 depositSettlement,
        uint256 redeemSettlement
    ) external returns (address vault);

    // ========== Template Management ==========

    function setSyncVaultTemplate(address template) external;

    function setAsyncVaultTemplate(address template) external;

    // ========== Configuration ==========

    function setIdentityRegistry(address registry) external;

    function setComplianceModule(address compliance) external;

    function setCircuitBreakerModule(address cb) external;

    function setYieldDistributor(address yd) external;

    function setRedemptionManager(address rm) external;

    // ========== View Functions ==========

    function vaultRegistry(address vault) external view returns (
        address vaultAddr,
        address asset,
        bytes32 category,
        uint256 vaultType,
        address creator,
        uint256 createdAt,
        bool active,
        string memory name,
        string memory symbol
    );

    function vaultsByCategory(bytes32 category, uint256 index) external view returns (address);

    function allVaults(uint256 index) external view returns (address);

    function vaultCount() external view returns (uint256);

    function syncVaultTemplate() external view returns (address);

    function asyncVaultTemplate() external view returns (address);
}
