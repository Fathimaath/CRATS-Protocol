// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./OrderBookEngine.sol";
import "./AMMPool.sol";
import "../interfaces/market/IMarketplaceFactory.sol";

/**
 * @title MarketplaceFactory
 * @dev Factory for deploying Layer 4 marketplace components
 * Based on audited factory patterns (Uniswap V2 Factory style)
 */
contract MarketplaceFactory is Ownable, IMarketplaceFactory {
    mapping(address => mapping(address => address)) public override orderBooks;
    mapping(address => mapping(address => address)) public override ammPools;
    address[] public override allOrderBooks;
    address[] public override allAMMPools;

    constructor() Ownable(msg.sender) {}

    function createOrderBook(address baseToken, address quoteToken) external override onlyOwner returns (address orderBook) {
        require(baseToken != quoteToken && orderBooks[baseToken][quoteToken] == address(0), "Invalid");
        orderBook = address(new OrderBookEngine());
        orderBooks[baseToken][quoteToken] = orderBook;
        allOrderBooks.push(orderBook);
        emit OrderBookCreated(orderBook, baseToken, quoteToken);
    }

    function createAMMPool(address token0, address token1) external override onlyOwner returns (address pool) {
        require(token0 != token1 && ammPools[token0][token1] == address(0), "Invalid");
        pool = address(new AMMPool(token0, token1));
        ammPools[token0][token1] = pool;
        ammPools[token1][token0] = pool;
        allAMMPools.push(pool);
        emit AMMPoolCreated(pool, token0, token1);
    }

    function getOrderBookCount() external view override returns (uint256) { return allOrderBooks.length; }
    function getAMMPoolCount() external view override returns (uint256) { return allAMMPools.length; }
    function getAllOrderBooks() external view returns (address[] memory) { return allOrderBooks; }
    function getAllAMMPools() external view returns (address[] memory) { return allAMMPools; }
}
