// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title IKYCProvidersRegistry
 * @dev Interface for the KYCProvidersRegistry contract.
 * This interface defines the functions and events that other contracts can interact with.
 */
interface IKYCProvidersRegistry {

    /**
     * @dev Represents the status of a KYC provider in the registry.
     */
    enum ProviderStatus {
        None,       // 0: Not registered
        Pending,    // 1: Registered but not yet approved
        Approved,   // 2: Approved and can perform KYC
        Suspended,  // 3: Temporarily suspended
        Revoked     // 4: Permanently revoked
    }

    /**
     * @dev Struct containing detailed information about a provider.
     */
    struct Provider {
        address providerAddress;
        string name;
        ProviderStatus status;
        uint64 registeredAt;
        uint64 lastActive;
    }

    // --- Events ---

    /**
     * @dev Emitted when a new provider is registered.
     */
    event ProviderRegistered(address indexed providerAddress, string name);

    /**
     * @dev Emitted when a provider's status is changed (e.g., approved, suspended).
     */
    event ProviderStatusChanged(address indexed providerAddress, ProviderStatus newStatus);

    // --- View Functions ---

    /**
     * @notice Checks if a provider is approved to perform KYC.
     * @param providerAddress The address of the KYC provider to check.
     * @return bool True if the provider is approved, false otherwise.
     */
    function isProviderApproved(address providerAddress) external view returns (bool);

    /**
     * @notice Retrieves all information about a specific provider.
     * @param providerAddress The address of the KYC provider.
     * @return Provider A struct containing the provider's details.
     */
    function getProviderInfo(address providerAddress) external view returns (Provider memory);

    /**
     * @notice Gets a list of all currently approved provider addresses.
     * @return address[] An array of approved provider addresses.
     */
    function getApprovedProviders() external view returns (address[] memory);

    // --- Admin Functions ---

    /**
     * @notice Registers a new provider with a 'Pending' status.
     * @param providerAddress The address of the provider to register.
     * @param name The name of the provider.
     */
    function registerProvider(address providerAddress, string memory name) external;

    /**
     * @notice Approves a pending provider, allowing them to perform KYC.
     * @param providerAddress The address of the provider to approve.
     */
    function approveProvider(address providerAddress) external;

    /**
     * @notice Suspends an approved provider, temporarily revoking their KYC privileges.
     * @param providerAddress The address of the provider to suspend.
     */
    function suspendProvider(address providerAddress) external;

    /**
     * @notice Revokes a provider's status permanently.
     * @param providerAddress The address of the provider to revoke.
     */
    function revokeProvider(address providerAddress) external;
}