// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IMarketSurveillance
 * @dev Interface for market surveillance and manipulation detection
 */
interface IMarketSurveillance {
    // ============ Enums ============
    enum AlertType {
        WASH_TRADING,
        SPOOFING,
        LAYERING,
        FRONT_RUNNING,
        PRICE_MANIPULATION,
        VOLUME_MANIPULATION,
        OTHER
    }

    // ============ Structs ============
    struct TradeRecord {
        bytes32 tradeId;
        address buyer;
        address seller;
        address asset;
        uint256 amount;
        uint256 price;
        uint256 timestamp;
        bool monitored;
    }

    struct TradeActivity {
        uint256 totalTrades;
        uint256 buyTrades;
        uint256 sellTrades;
        uint256 totalVolume;
        uint256 buyVolume;
        uint256 sellVolume;
        uint256 totalOrders;
        uint256 filledOrders;
        uint256 cancelledOrders;
        uint256 priceLevelsUsed;
        uint256 lastTradeTime;
        TradeRecord[] recentTrades;
    }

    struct Alert {
        uint256 alertId;
        address user;
        AlertType alertType;
        uint256 severity;
        uint256 timestamp;
        bool resolved;
    }

    // ============ Events ============
    event TradeRecorded(bytes32 indexed tradeId, address buyer, address seller, uint256 timestamp);
    event AlertGenerated(address indexed user, AlertType alertType, uint256 severity);
    event UserRestricted(address indexed user, string reason);
    event UserUnrestricted(address indexed user);
    event SuspiciousPatternDetected(address indexed user, string pattern);

    // ============ Trade Recording ============
    function recordTrade(
        bytes32 tradeId,
        address buyer,
        address seller,
        address asset,
        uint256 amount,
        uint256 price
    ) external;

    // ============ Order Tracking ============
    function recordOrderPlaced(address user, address asset, uint256 price) external;

    function recordOrderCancelled(address user, address asset) external;

    function recordOrderFilled(address user, address asset, uint256 amount) external;

    // ============ User Management ============
    function restrictUser(address user, string calldata reason) external;

    function unrestrictUser(address user) external;

    function isUserRestricted(address user) external view returns (bool);

    // ============ Alert Management ============
    function resolveAlert(address user, uint256 alertId) external;

    function getUserAlerts(address user) external view returns (Alert[] memory);

    function getUnresolvedAlerts(address user) external view returns (Alert[] memory);

    // ============ View Functions ============
    function getTradeRecord(bytes32 tradeId) external view returns (TradeRecord memory);

    function getUserActivity(address user, address asset) external view returns (TradeActivity memory);

    function getTotalTradesMonitored() external view returns (uint256);

    function getSurveillanceStats() external view returns (
        uint256 totalTrades,
        uint256 totalAlerts,
        uint256 restrictedUsersCount,
        uint256 avgSeverity
    );

    // ============ Constants ============
    function SURVEILLANCE_WINDOW() external view returns (uint256);

    function WASH_TRADE_THRESHOLD() external view returns (uint256);

    function SPOOFING_THRESHOLD() external view returns (uint256);

    function LAYERING_THRESHOLD() external view returns (uint256);

    function MAX_ORDER_CANCEL_RATIO() external view returns (uint256);

    function MIN_TIME_BETWEEN_TRADES() external view returns (uint256);

    function MAX_SELF_TRADE_RATIO() external view returns (uint256);
}
