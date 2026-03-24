// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IClearingHouse
 * @dev Interface for trade clearing, netting, and default management
 */
interface IClearingHouse {
    // ============ Structs ============
    struct Trade {
        bytes32 tradeId;
        address buyer;
        address seller;
        address assetToken;
        address paymentToken;
        uint256 amount;
        uint256 price;
        uint256 timestamp;
        bool cleared;
        bool settled;
    }

    struct Position {
        uint256 requiredMargin;
        uint256 lastUpdate;
        bool marginCallActive;
    }

    // ============ Events ============
    event TradeCleared(bytes32 indexed tradeId, address buyer, address seller, uint256 amount);
    event NettingExecuted(address member, int256 netAmount);
    event MarginCalled(address member, uint256 required, uint256 current);
    event PositionLiquidated(address member, bytes32 tradeId, uint256 amount);
    event DefaultFundContribution(address member, uint256 amount);
    event DefaultFundUsed(uint256 amount);

    // ============ Clearing Functions ============
    function clearTrade(
        bytes32 tradeId,
        address buyer,
        address seller,
        address assetToken,
        address paymentToken,
        uint256 amount,
        uint256 price
    ) external returns (bool);

    function executeNetting(address member, address token) external returns (int256 netAmount);

    function batchNetting(address[] calldata members, address[] calldata tokens)
        external
        returns (int256[] memory netAmounts);

    // ============ Margin Functions ============
    function depositMargin(address token, uint256 amount) external;

    function withdrawMargin(address token, uint256 amount) external;

    function checkMarginHealth(address member) external view returns (bool healthy, uint256 ratio);

    function liquidatePosition(address member, bytes32 tradeId) external;

    // ============ Default Fund Functions ============
    function contributeToDefaultFund(uint256 amount) external;

    function useDefaultFund(uint256 amount, address recipient) external;

    // ============ View Functions ============
    function getTrade(bytes32 tradeId) external view returns (Trade memory);

    function getNetObligation(address member, address token) external view returns (int256);

    function getPosition(address member) external view returns (Position memory);

    function getMarginBalance(address member) external view returns (uint256);

    function getDefaultFundSize() external view returns (uint256);

    function getMemberContribution(address member) external view returns (uint256);

    function settlementEngine() external view returns (address);

    function orderBookEngine() external view returns (address);
}
