// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IPriceOracle
 * @dev Interface for multi-source price aggregation
 */
interface IPriceOracle {
    // ============ Enums ============
    enum PriceSource {
        ORDER_BOOK,
        NAV_ORACLE,
        AMM,
        EXTERNAL,
        BLENDED,
        MANUAL,
        HALTED
    }

    enum LiquidityState {
        HIGH,
        MEDIUM,
        LOW
    }

    struct PriceFeed {
        address aggregator;
        uint256 decimals;
        bool active;
        uint256 weight;
    }

    struct PriceHistory {
        uint256[] prices;
        uint256[] timestamps;
    }

    // ============ Events ============
    event PriceFeedAdded(address indexed token, address indexed aggregator, uint256 weight);
    event PriceUpdated(address indexed token, uint256 price, PriceSource source);
    event TWAPUpdated(address indexed token, uint256 twap);
    event PriceDeviationDetected(address indexed token, uint256 deviation);

    // ============ Price Functions ============
    function getAggregatedPrice(address asset)
        external
        view
        returns (uint256 price, uint256 confidence, PriceSource primarySource);

    function getTWAPPrice(address token, uint256 period) external view returns (uint256 price);

    function getLatestPrice(address token) external view returns (uint256 price);

    function checkPriceDeviation(address token, uint256 newPrice)
        external
        view
        returns (bool withinBounds, uint256 deviationBps);

    // ============ Configuration ============
    function addPriceFeed(
        address token,
        address aggregator,
        uint256 decimals,
        uint256 weight
    ) external;

    function setPriceFeedWeight(address token, uint256 weight) external;

    function deactivatePriceFeed(address token) external;

    // ============ View Functions ============
    function getPriceFeed(address token) external view returns (PriceFeed memory);

    function getLastUpdate(address token) external view returns (uint256);

    function isPriceStale(address token) external view returns (bool);

    function priceFeeds(address token)
        external
        view
        returns (
            address aggregator,
            uint256 decimals,
            bool active,
            uint256 weight
        );

    function lastPrices(address token) external view returns (uint256);

    function lastUpdates(address token) external view returns (uint256);

    function WEIGHT_DENOMINATOR() external view returns (uint256);

    function MAX_DEVIATION_BPS() external view returns (uint256);

    function STALE_PRICE_THRESHOLD() external view returns (uint256);

    function TWAP_PERIOD() external view returns (uint256);
}
