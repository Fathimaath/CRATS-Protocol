// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "../interfaces/asset/IOwnershipSync.sol";
import "../interfaces/asset/IAssetRegistry.sol";

/**
 * @title OwnershipSyncManager
 * @dev Single middleware gateway orchestrating Beneficial Ownership Register (BOR) updates.
 * Emits enriched SyncRouted events containing module identity and reason codes.
 */
contract OwnershipSyncManager is IOwnershipSync, AccessControl {
    address public immutable assetRegistry;

    // Caller => is authorized module
    mapping(address => bool) public authorizedModules;
    // Caller => reason code
    mapping(address => bytes32) public callerReasonCodes;

    event SyncRouted(
        address indexed caller,
        address indexed asset,
        address indexed vault,
        address investor,
        uint256 balance,
        bytes32 reasonCode
    );

    event ModuleAuthorized(address indexed module, bytes32 reasonCode);
    event ModuleRevoked(address indexed module);

    constructor(address admin, address _assetRegistry) {
        require(admin != address(0), "OwnershipSyncManager: admin is zero address");
        require(_assetRegistry != address(0), "OwnershipSyncManager: assetRegistry is zero address");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        assetRegistry = _assetRegistry;
    }

    modifier onlyAuthorized(address asset, address vault) {
        require(
            (msg.sender == vault && IAssetRegistry(assetRegistry).isVaultRegistered(asset, vault)) ||
            authorizedModules[msg.sender],
            "OwnershipSyncManager: unauthorized caller"
        );
        _;
    }

    function authorizeModule(address module, bytes32 reasonCode) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(module != address(0), "OwnershipSyncManager: invalid module");
        authorizedModules[module] = true;
        callerReasonCodes[module] = reasonCode;
        emit ModuleAuthorized(module, reasonCode);
    }

    function revokeModule(address module) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(module != address(0), "OwnershipSyncManager: invalid module");
        authorizedModules[module] = false;
        delete callerReasonCodes[module];
        emit ModuleRevoked(module);
    }

    function updateBeneficialOwnership(
        address asset,
        address vault,
        address investor,
        uint256 balance
    ) external override onlyAuthorized(asset, vault) {
        bytes32 reason = callerReasonCodes[msg.sender];
        if (reason == bytes32(0)) {
            reason = keccak256("VAULT_TRANSFER"); // Default fallback for vaults
        }

        emit BeneficialOwnershipUpdated(asset, vault, investor, balance, block.timestamp);
        emit SyncRouted(msg.sender, asset, vault, investor, balance, reason);

        IAssetRegistry(assetRegistry).updateBeneficialOwnership(
            asset,
            vault,
            investor,
            balance
        );
    }

    function updateBeneficialOwnershipBatch(
        address asset,
        address vault,
        address[] calldata investors,
        uint256[] calldata balances
    ) external override onlyAuthorized(asset, vault) {
        bytes32 reason = callerReasonCodes[msg.sender];
        if (reason == bytes32(0)) {
            reason = keccak256("VAULT_TRANSFER");
        }

        require(investors.length == balances.length, "OwnershipSyncManager: length mismatch");

        for (uint256 i = 0; i < investors.length; i++) {
            emit BeneficialOwnershipUpdated(asset, vault, investors[i], balances[i], block.timestamp);
            emit SyncRouted(msg.sender, asset, vault, investors[i], balances[i], reason);
        }

        IAssetRegistry(assetRegistry).updateBeneficialOwnershipBatch(
            asset,
            vault,
            investors,
            balances
        );
    }
}
