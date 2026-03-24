// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IMarketplaceFactory
 * @dev Factory interface for Layer 4 marketplace deployment
 */
interface IMarketplaceFactory {
    event OrderBookCreated(address indexed orderBook, address indexed baseToken, address indexed quoteToken);
    event AMMPoolCreated(address indexed pool, address indexed token0, address indexed token1);

    function createOrderBook(address baseToken, address quoteToken) external returns (address orderBook);
    function createAMMPool(address token0, address token1) external returns (address pool);
    
    function orderBooks(address baseToken, address quoteToken) external view returns (address);
    function ammPools(address token0, address token1) external view returns (address);
    function allOrderBooks(uint256 index) external view returns (address);
    function allAMMPools(uint256 index) external view returns (address);
    
    function getOrderBookCount() external view returns (uint256);
    function getAMMPoolCount() external view returns (uint256);
}
