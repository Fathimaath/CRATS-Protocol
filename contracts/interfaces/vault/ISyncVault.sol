// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ISyncVault
 * @dev Interface for SyncVault (ERC-4626) contract
 */
interface ISyncVault {
    // ========== ERC-4626 Functions ==========

    function asset() external view returns (address);

    function totalAssets() external view returns (uint256);

    function deposit(uint256 assets, address receiver) external returns (uint256 shares);

    function mint(uint256 shares, address receiver) external returns (uint256 assets);

    function withdraw(uint256 assets, address receiver, address owner) external returns (uint256 shares);

    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets);

    function maxDeposit(address receiver) external view returns (uint256);

    function maxMint(address receiver) external view returns (uint256);

    function maxWithdraw(address owner) external view returns (uint256);

    function maxRedeem(address owner) external view returns (uint256);

    function convertToShares(uint256 assets) external view returns (uint256);

    function convertToAssets(uint256 shares) external view returns (uint256);

    // ========== Configuration ==========

    function setIdentityRegistry(address registry) external;

    function setComplianceModule(address compliance) external;

    function setCircuitBreaker(address cb) external;

    function setCategory(bytes32 category_) external;

    // ========== View Functions ==========

    function identityRegistry() external view returns (address);

    function complianceModule() external view returns (address);

    function circuitBreaker() external view returns (address);

    function category() external view returns (bytes32);

    function version() external pure returns (string memory);
}
