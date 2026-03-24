// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IOrderBookEngine
 * @dev Interface for Central Limit Order Book Engine
 */
interface IOrderBookEngine {
    // ============ Structs ============
    struct Order {
        bytes32 id;
        address trader;
        address baseToken;
        address quoteToken;
        uint256 amount;
        uint256 price;
        bool isBuy;
        uint256 timestamp;
        uint256 expiry;
        bool filled;
        uint256 filledAmount;
    }

    // ============ Events ============
    event OrderPlaced(bytes32 indexed orderId, address indexed trader, bool isBuy, uint256 amount, uint256 price);
    event OrderFilled(bytes32 indexed orderId, address indexed filler, uint256 amount, uint256 price, uint256 fee);
    event OrderCancelled(bytes32 indexed orderId);
    event TradingHalted(address indexed token);
    event TradingResumed(address indexed token);

    // ============ Order Functions ============
    function placeOrder(
        address baseToken,
        address quoteToken,
        uint256 amount,
        uint256 price,
        bool isBuy,
        uint256 expiry
    ) external returns (bytes32 orderId);

    function fillOrder(bytes32 orderId, uint256 fillAmount) external;

    function cancelOrder(bytes32 orderId) external;

    // ============ View Functions ============
    function getOrder(bytes32 orderId) external view returns (Order memory);

    function getUserOrders(address user, uint256 offset, uint256 limit) external view returns (bytes32[] memory);

    function getOrdersAtPrice(address baseToken, uint256 price, bool isBuy) external view returns (bytes32[] memory);

    function orders(bytes32 orderId) external view returns (
        bytes32 id,
        address trader,
        address baseToken,
        address quoteToken,
        uint256 amount,
        uint256 price,
        bool isBuy,
        uint256 timestamp,
        uint256 expiry,
        bool filled,
        uint256 filledAmount
    );

    // ============ Configuration ============
    function setComplianceConfig(address _identityRegistry, address _complianceModule) external;

    function setFees(uint256 _makerFee, uint256 _takerFee) external;

    function haltTrading(address token) external;

    function resumeTrading(address token) external;

    // ============ View Configuration ============
    function makerFee() external view returns (uint256);

    function takerFee() external view returns (uint256);

    function tradingHalted(address token) external view returns (bool);

    function identityRegistry() external view returns (address);

    function complianceModule() external view returns (address);
}
