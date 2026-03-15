// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title ICircuitBreakerModule
 * @dev Interface for Circuit Breaker - Trading halts and limit up/down
 */
interface ICircuitBreakerModule {

    // === Events ===

    event MarketHaltActivated(uint256 timestamp, bytes32 reason, uint256 expiry);
    event MarketHaltDeactivated(uint256 timestamp);
    event AssetHaltActivated(address indexed asset, uint256 timestamp, bytes32 reason, uint256 expiry);
    event AssetHaltDeactivated(address indexed asset, uint256 timestamp);
    event AssetLimitsSet(address indexed asset, uint256 limitUpBps, uint256 limitDownBps, uint256 priceBandPeriod);
    event ReferencePriceUpdated(address indexed asset, uint256 oldPrice, uint256 newPrice);

    // === Structs ===

    struct HaltRecord {
        bool isHalted;
        bytes32 reason;
        uint256 timestamp;
        address initiator;
        uint256 expiry;
    }

    struct LimitConfig {
        uint256 limitUpBps;
        uint256 limitDownBps;
        uint256 referencePrice;
        uint256 lastUpdateTime;
        uint256 priceBandPeriod;
    }

    // === View Functions ===

    function version() external view returns (string memory);
    function marketWideHalt() external view returns (bool);
    function haltReason() external view returns (bytes32);
    function haltExpiry() external view returns (uint256);
    function haltInitiator() external view returns (address);
    function assetHalted(address asset) external view returns (bool);
    function checkTradingAllowed(address asset) external view returns (bool);
    function checkPriceLimits(address asset, uint256 proposedPrice) external view returns (bool, string memory);
    function isOperator(address account) external view returns (bool);
    function isRegulator(address account) external view returns (bool);

    // === Market-Wide Halts ===

    function activateMarketHalt(bytes32 reason, uint256 duration) external;
    function deactivateMarketHalt() external;

    // === Asset-Specific Halts ===

    function activateAssetHalt(address asset, bytes32 reason, uint256 duration) external;
    function deactivateAssetHalt(address asset) external;

    // === Price Limits ===

    function setAssetLimits(
        address asset,
        uint256 limitUpBps,
        uint256 limitDownBps,
        uint256 priceBandPeriod
    ) external;

    function updateReferencePrice(address asset, uint256 newPrice) external;

    // === Operator Management ===

    function addOperator(address operator) external;
    function removeOperator(address operator) external;
}
