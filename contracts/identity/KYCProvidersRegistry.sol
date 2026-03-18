// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "../interfaces/identity/IKYCProvidersRegistry.sol";
import "../utils/CRATSConfig.sol";

/**
 * @title KYCProvidersRegistry
 * @dev Manages authorized KYC providers for the CRATS Protocol.
 * // Source: OpenZeppelin AccessControlUpgradeable
 */
contract KYCProvidersRegistry is 
    Initializable, 
    AccessControlUpgradeable, 
    UUPSUpgradeable, 
    IKYCProvidersRegistry 
{
    // Mapping from a provider's address to their detailed information.
    mapping(address => Provider) public providers;

    // Array to keep track of all registered provider addresses.
    address[] private _providerAddresses;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address admin) public initializer {
        __AccessControl_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /**
     * @dev Checks if a provider is approved.
     */
    function isProviderApproved(address providerAddress) public view override returns (bool) {
        return providers[providerAddress].status == 2; // Approved
    }

    /**
     * @dev Retrieves provider info.
     */
    function getProviderInfo(address providerAddress) public view override returns (Provider memory) {
        return providers[providerAddress];
    }

    /**
     * @dev Gets a list of approved providers.
     */
    function getApprovedProviders() public view override returns (address[] memory) {
        uint256 approvedCount = 0;
        for (uint i = 0; i < _providerAddresses.length; i++) {
            if (providers[_providerAddresses[i]].status == 2) {
                approvedCount++;
            }
        }

        address[] memory approvedProvidersList = new address[](approvedCount);
        uint256 currentIndex = 0;
        for (uint i = 0; i < _providerAddresses.length; i++) {
            if (providers[_providerAddresses[i]].status == 2) {
                approvedProvidersList[currentIndex] = _providerAddresses[i];
                currentIndex++;
            }
        }

        return approvedProvidersList;
    }

    // --- Admin Functions ---

    function registerProvider(address providerAddress, string memory name) public override onlyRole(DEFAULT_ADMIN_ROLE) {
        require(providerAddress != address(0), "Provider address zero");
        require(providers[providerAddress].status == 0, "Already registered");

        providers[providerAddress] = Provider({
            providerAddress: providerAddress,
            name: name,
            status: 1, // Pending
            registeredAt: uint64(block.timestamp),
            lastActive: uint64(block.timestamp)
        });

        _providerAddresses.push(providerAddress);
        emit ProviderRegistered(providerAddress, name);
    }

    function approveProvider(address providerAddress) public override onlyRole(DEFAULT_ADMIN_ROLE) {
        require(providers[providerAddress].status == 1, "Not pending");
        providers[providerAddress].status = 2; // Approved
        providers[providerAddress].lastActive = uint64(block.timestamp);
        emit ProviderStatusChanged(providerAddress, 2);
    }

    function suspendProvider(address providerAddress) public override onlyRole(DEFAULT_ADMIN_ROLE) {
        require(providers[providerAddress].status == 2, "Not approved");
        providers[providerAddress].status = 3; // Suspended
        providers[providerAddress].lastActive = uint64(block.timestamp);
        emit ProviderStatusChanged(providerAddress, 3);
    }

    function revokeProvider(address providerAddress) public override onlyRole(DEFAULT_ADMIN_ROLE) {
        require(providers[providerAddress].status != 0, "Not registered");
        providers[providerAddress].status = 4; // Revoked
        providers[providerAddress].lastActive = uint64(block.timestamp);
        emit ProviderStatusChanged(providerAddress, 4);
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
