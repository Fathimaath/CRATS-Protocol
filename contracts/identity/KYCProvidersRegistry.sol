// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/identity/IKYCProvidersRegistry.sol";

/**
 * @title KYCProvidersRegistry
 * @dev This contract manages the registration and status of KYC providers.
 * It implements the IKYCProvidersRegistry interface.
 * Only the owner of this contract can manage provider statuses.
 */
contract KYCProvidersRegistry is Ownable, IKYCProvidersRegistry {

    // Mapping from a provider's address to their detailed information.
    mapping(address => Provider) public providers;

    // Array to keep track of all registered provider addresses.
    address[] private _providerAddresses;

    constructor() Ownable(msg.sender) {}

    /**
     * @dev See {IKYCProvidersRegistry-isProviderApproved}.
     */
    function isProviderApproved(address providerAddress) public view override returns (bool) {
        return providers[providerAddress].status == ProviderStatus.Approved;
    }

    /**
     * @dev See {IKYCProvidersRegistry-getProviderInfo}.
     */
    function getProviderInfo(address providerAddress) public view override returns (Provider memory) {
        return providers[providerAddress];
    }

    /**
     * @dev See {IKYCProvidersRegistry-getApprovedProviders}.
     * Note: This function can be gas-intensive if there are many providers.
     */
    function getApprovedProviders() public view override returns (address[] memory) {
        uint256 approvedCount = 0;
        for (uint i = 0; i < _providerAddresses.length; i++) {
            if (providers[_providerAddresses[i]].status == ProviderStatus.Approved) {
                approvedCount++;
            }
        }

        address[] memory approvedProvidersList = new address[](approvedCount);
        uint256 currentIndex = 0;
        for (uint i = 0; i < _providerAddresses.length; i++) {
            if (providers[_providerAddresses[i]].status == ProviderStatus.Approved) {
                approvedProvidersList[currentIndex] = _providerAddresses[i];
                currentIndex++;
            }
        }

        return approvedProvidersList;
    }

    /**
     * @dev See {IKYCProvidersRegistry-registerProvider}.
     * Can only be called by the contract owner.
     */
    function registerProvider(address providerAddress, string memory name) public override onlyOwner {
        require(providerAddress != address(0), "Provider address cannot be zero");
        require(providers[providerAddress].status == ProviderStatus.None, "Provider already registered");

        providers[providerAddress] = Provider({
            providerAddress: providerAddress,
            name: name,
            status: ProviderStatus.Pending,
            registeredAt: uint64(block.timestamp),
            lastActive: uint64(block.timestamp)
        });

        _providerAddresses.push(providerAddress);
        emit ProviderRegistered(providerAddress, name);
    }

    /**
     * @dev See {IKYCProvidersRegistry-approveProvider}.
     * Can only be called by the contract owner.
     */
    function approveProvider(address providerAddress) public override onlyOwner {
        require(providers[providerAddress].status == ProviderStatus.Pending, "Provider is not in a pending state");
        providers[providerAddress].status = ProviderStatus.Approved;
        providers[providerAddress].lastActive = uint64(block.timestamp);
        emit ProviderStatusChanged(providerAddress, ProviderStatus.Approved);
    }

    /**
     * @dev See {IKYCProvidersRegistry-suspendProvider}.
     * Can only be called by the contract owner.
     */
    function suspendProvider(address providerAddress) public override onlyOwner {
        require(providers[providerAddress].status == ProviderStatus.Approved, "Provider is not approved");
        providers[providerAddress].status = ProviderStatus.Suspended;
        providers[providerAddress].lastActive = uint64(block.timestamp);
        emit ProviderStatusChanged(providerAddress, ProviderStatus.Suspended);
    }

    /**
     * @dev See {IKYCProvidersRegistry-revokeProvider}.
     * Can only be called by the contract owner.
     */
    function revokeProvider(address providerAddress) public override onlyOwner {
        require(providers[providerAddress].status != ProviderStatus.None, "Provider is not registered");
        providers[providerAddress].status = ProviderStatus.Revoked;
        providers[providerAddress].lastActive = uint64(block.timestamp);
        emit ProviderStatusChanged(providerAddress, ProviderStatus.Revoked);
    }
}
