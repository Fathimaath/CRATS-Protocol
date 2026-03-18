// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title IKYCProvidersRegistry
 * @dev Interface for the KYCProvidersRegistry contract.
 * Based on T-REX Operator/Provider patterns.
 */
interface IKYCProvidersRegistry {

    /**
     * @dev Struct containing detailed information about a provider.
     */
    struct Provider {
        address providerAddress;
        string name;
        uint8 status;        // 0: None, 1: Pending, 2: Approved, 3: Suspended, 4: Revoked
        uint64 registeredAt;
        uint64 lastActive;
    }

    // --- Events ---
    event ProviderRegistered(address indexed providerAddress, string name);
    event ProviderStatusChanged(address indexed providerAddress, uint8 newStatus);

    // --- View Functions ---
    function isProviderApproved(address providerAddress) external view returns (bool);
    function getProviderInfo(address providerAddress) external view returns (Provider memory);
    function getApprovedProviders() external view returns (address[] memory);

    // --- Admin Functions ---
    function registerProvider(address providerAddress, string memory name) external;
    function approveProvider(address providerAddress) external;
    function suspendProvider(address providerAddress) external;
    function revokeProvider(address providerAddress) external;
}