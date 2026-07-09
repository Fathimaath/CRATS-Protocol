// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "../interfaces/asset/IAssetRegistry.sol";
import "../interfaces/asset/IOwnershipSync.sol";

/**
 * @title BaseVault
 * @dev Abstract base for RWA vaults with Beneficial Owner Registry (BOR) syncing.
 * Inherited by SyncVault and AsyncVault.
 */
abstract contract BaseVault is Initializable, ERC20Upgradeable {
    // L2 AssetToken this vault holds
    address public assetToken;

    // L2 AssetRegistry — receives configuration queries
    IAssetRegistry public assetRegistry;

    // L3 OwnershipSyncManager — receives sync calls
    IOwnershipSync public syncManager;

    // --- Events ---
    event YieldSyncRequired(
        address indexed assetToken,
        address indexed vault,
        uint256 totalAssets,
        uint256 timestamp
    );

    // --- Initializer ---
    function __BaseVault_init(
        address _assetToken,
        address _assetRegistry,
        address _syncManager
    ) internal onlyInitializing {
        assetToken = _assetToken;
        assetRegistry = IAssetRegistry(_assetRegistry);
        syncManager = IOwnershipSync(_syncManager);
    }

    /**
     * @dev Internal update hook (OpenZeppelin 5.x replacement for _afterTokenTransfer).
     * Handles sync for: mints, burns, and transfers.
     */
    function _update(
        address from,
        address to,
        uint256 value
    ) internal virtual override {
        super._update(from, to, value);

        if (address(syncManager) != address(0)) {
            // Sync the sender (if not mint)
            if (from != address(0) && from != address(1)) {
                try syncManager.updateBeneficialOwnership(
                    assetToken,
                    address(this),
                    from,
                    balanceOf(from)
                ) {} catch {}
            }

            // Sync the receiver (if not burn)
            if (to != address(0) && to != address(1)) {
                try syncManager.updateBeneficialOwnership(
                    assetToken,
                    address(this),
                    to,
                    balanceOf(to)
                ) {} catch {}
            }
        }
    }

    /**
     * @notice Handles yield distribution syncing.
     * For vaults with > 200 holders, emits an event for off-chain sync.
     */
    function _afterYieldDistribution() internal virtual {
        if (address(syncManager) != address(0)) {
            uint256 holderCount = _getHolderCount();

            if (holderCount <= 200) {
                (address[] memory holders, uint256[] memory shares) = _getAllHolders();
                try syncManager.updateBeneficialOwnershipBatch(assetToken, address(this), holders, shares) {} catch {}
            } else {
                emit YieldSyncRequired(
                    assetToken,
                    address(this),
                    totalAssets(),
                    block.timestamp
                );
            }
        }
    }

    // --- Abstract Helpers ---
    function totalAssets() public view virtual returns (uint256);
    function _getHolderCount() internal view virtual returns (uint256);
    function _getAllHolders() internal view virtual returns (address[] memory, uint256[] memory);
}
