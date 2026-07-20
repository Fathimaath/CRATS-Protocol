// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockVault
 * @dev Mock vault for testing. Supports ERC-4626-like interface:
 *      asset(), balanceOf(), totalSupply(), burnShares().
 *      Also allows test setup via setAsset() and setTotalSupply().
 */
contract MockVault is ERC20 {
    address private _asset;
    uint256 private _overrideTotalSupply;
    bool    private _useTotalSupplyOverride;

    constructor() ERC20("Mock Vault", "mVT") {}

    // ── Test setup helpers ──────────────────────────────────────────────────

    function setAsset(address asset_) external {
        _asset = asset_;
    }

    /// @notice Override totalSupply() to simulate a larger pool without minting all shares.
    function setTotalSupply(uint256 supply) external {
        _overrideTotalSupply = supply;
        _useTotalSupplyOverride = true;
    }

    // ── ERC-4626-like interface ─────────────────────────────────────────────

    function asset() external view returns (address) {
        return _asset;
    }

    function totalSupply() public view override returns (uint256) {
        if (_useTotalSupplyOverride) return _overrideTotalSupply;
        return super.totalSupply();
    }

    /// @notice Called by CarbonRetirementManager.confirmRetirement()
    function burnShares(address account, uint256 amount) external {
        _burn(account, amount);
    }

    // ── Standard mint for test setup ───────────────────────────────────────

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
