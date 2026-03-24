// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

/**
 * @title IAsyncVault
 * @dev Interface for AsyncVault (ERC-7540) contract
 */
interface IAsyncVault {
    // ========== ERC-4626 View Functions ==========

    function asset() external view returns (address);

    function totalAssets() external view returns (uint256);

    function convertToShares(uint256 assets) external view returns (uint256);

    function convertToAssets(uint256 shares) external view returns (uint256);

    function maxDeposit(address receiver) external view returns (uint256);

    function maxMint(address receiver) external view returns (uint256);

    function maxWithdraw(address owner) external view returns (uint256);

    function maxRedeem(address owner) external view returns (uint256);

    // ========== ERC-7540 Async Deposit Functions ==========

    function requestDeposit(uint256 assets, address controller, address owner)
        external
        returns (uint256 requestId);

    function pendingDepositRequest(uint256 requestId, address controller)
        external
        view
        returns (uint256 pendingAssets);

    function claimableDepositRequest(uint256 requestId, address controller)
        external
        view
        returns (uint256 claimableAssets);

    function nextDepositRequestId(address controller) external view returns (uint256);

    // ========== ERC-7540 Async Redeem Functions ==========

    function requestRedeem(uint256 shares, address controller, address owner)
        external
        returns (uint256 requestId);

    function pendingRedeemRequest(uint256 requestId, address controller)
        external
        view
        returns (uint256 pendingShares);

    function claimableRedeemRequest(uint256 requestId, address controller)
        external
        view
        returns (uint256 claimableShares);

    function nextRedeemRequestId(address controller) external view returns (uint256);

    // ========== ERC-7540 Claim Functions ==========

    function deposit(uint256 assets, address receiver, address controller)
        external
        returns (uint256 shares);

    function mint(uint256 shares, address receiver, address controller)
        external
        returns (uint256 assets);

    function withdraw(uint256 assets, address receiver, address controller)
        external
        returns (uint256 shares);

    function redeem(uint256 shares, address receiver, address controller)
        external
        returns (uint256 assets);

    // ========== Configuration ==========

    function setIdentityRegistry(address registry) external;

    function setComplianceModule(address compliance) external;

    function setCategory(bytes32 category_) external;

    function setSettlementPeriod(uint256 period) external;

    // ========== View Functions ==========

    function identityRegistry() external view returns (address);

    function complianceModule() external view returns (address);

    function category() external view returns (bytes32);

    function settlementPeriod() external view returns (uint256);

    function version() external pure returns (string memory);
}
