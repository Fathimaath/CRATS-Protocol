// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "../interfaces/asset/IAssetRegistry.sol";

/**
 * @title BaseVault
 * @dev Abstract base for RWA vaults with Beneficial Owner Registry (BOR) syncing.
 * Inherited by SyncVault and AsyncVault.
 */
abstract contract BaseVault is Initializable, ERC20Upgradeable {
    // L2 AssetToken this vault holds
    address public assetToken;

    // L2 AssetRegistry — receives sync calls
    IAssetRegistry public assetRegistry;

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
        address _assetRegistry
    ) internal onlyInitializing {
        assetToken = _assetToken;
        assetRegistry = IAssetRegistry(_assetRegistry);
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

        // Sync the sender (if not mint)
        if (from != address(0) && from != address(1)) {
            try assetRegistry.syncOwner(
                assetToken,
                from,
                balanceOf(from)
            ) {} catch {}
        }

        // Sync the receiver (if not burn)
        if (to != address(0) && to != address(1)) {
            try assetRegistry.syncOwner(
                assetToken,
                to,
                balanceOf(to)
            ) {} catch {}
        }
    }

    /**
     * @notice Handles yield distribution syncing.
     * For vaults with > 200 holders, emits an event for off-chain sync.
     */
    function _afterYieldDistribution() internal virtual {
        uint256 holderCount = _getHolderCount();

        if (holderCount <= 200) {
            (address[] memory holders, uint256[] memory shares) = _getAllHolders();
            assetRegistry.syncOwnerBatch(assetToken, holders, shares);
        } else {
            emit YieldSyncRequired(
                assetToken,
                address(this),
                totalAssets(),
                block.timestamp
            );
        }
    }

    // --- Abstract Helpers ---
    function totalAssets() public view virtual returns (uint256);
    function _getHolderCount() internal view virtual returns (uint256);
    function _getAllHolders() internal view virtual returns (address[] memory, uint256[] memory);
}
