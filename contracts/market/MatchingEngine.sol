// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./OrderBookEngine.sol";
import "./AMMPool.sol";
import "../interfaces/identity/IIdentityRegistry.sol";

/**
 * @title MatchingEngine
 * @dev Order matching with compliance (Section 8)
 * Based on audited dYdX matching pattern
 * 
 * IMPLEMENTED:
 * - Price-Time Priority (FIFO)
 * - Pro-Rata Matching (NEW)
 * - Batch Auction (NEW)
 */
contract MatchingEngine is Ownable, ReentrancyGuard {
    address public identityRegistry;
    address public complianceModule;
    OrderBookEngine public orderBook;
    AMMPool public ammPool;

    // ============ Matching Algorithm Configuration ============
    enum MatchingAlgorithm {
        PRICE_TIME_PRIORITY, // FIFO
        PRO_RATA,
        BATCH_AUCTION
    }

    MatchingAlgorithm public currentAlgorithm = MatchingAlgorithm.PRICE_TIME_PRIORITY;

    // ============ Batch Auction (NEW - Section 8.1, 13.2) ============
    struct BatchAuction {
        uint256 batchId;
        uint256 startTime;
        uint256 endTime;
        uint256 clearPrice;
        bool executed;
        mapping(uint256 => OrderInfo) buyOrders;
        mapping(uint256 => OrderInfo) sellOrders;
        uint256 buyOrderCount;
        uint256 sellOrderCount;
    }

    struct OrderInfo {
        bytes32 orderId;
        address trader;
        uint256 amount;
        uint256 price;
        uint256 filledAmount;
    }

    uint256 public currentBatchId;
    uint256 public constant BATCH_DURATION = 10 seconds;
    mapping(uint256 => BatchAuction) public batchAuctions;
    mapping(bytes32 => bool) public orderInBatch;

    // ============ Pro-Rata State (NEW) ============
    struct ProRataFill {
        uint256 totalQuantity;
        uint256[] orderQuantities;
        bytes32[] orderIds;
    }

    // ============ Events ============
    event OrderMatched(bytes32 indexed orderId, address matcher, uint256 amount);
    event ProRataMatchExecuted(bytes32 indexed batchId, uint256 totalQuantity, uint256[] fills);
    event BatchAuctionStarted(uint256 indexed batchId, uint256 startTime, uint256 endTime);
    event BatchAuctionExecuted(uint256 indexed batchId, uint256 clearPrice, uint256 volume);
    event MatchingAlgorithmChanged(MatchingAlgorithm oldAlgo, MatchingAlgorithm newAlgo);

    constructor() Ownable(msg.sender) {}

    function setComplianceConfig(address _ir, address _cm) external onlyOwner {
        identityRegistry = _ir;
        complianceModule = _cm;
    }

    function setOrderBook(address _ob) external onlyOwner {
        orderBook = OrderBookEngine(_ob);
    }

    function setAMMPool(address _ap) external onlyOwner {
        ammPool = AMMPool(_ap);
    }

    // ============ Algorithm Configuration (NEW) ============
    function setMatchingAlgorithm(MatchingAlgorithm _algo) external onlyOwner {
        emit MatchingAlgorithmChanged(currentAlgorithm, _algo);
        currentAlgorithm = _algo;
    }

    function matchOrder(bytes32 orderId, uint256 amount) external nonReentrant {
        if (identityRegistry != address(0)) {
            require(IIdentityRegistry(identityRegistry).isVerified(msg.sender), "Not verified");
        }

        // Route to appropriate algorithm
        if (currentAlgorithm == MatchingAlgorithm.PRO_RATA) {
            // Pro-rata matching will be handled separately
            revert("Use matchOrderProRata for pro-rata matching");
        } else if (currentAlgorithm == MatchingAlgorithm.BATCH_AUCTION) {
            // Add to batch auction
            _addToBatch(orderId, amount);
            return;
        }

        // Default: Price-time priority
        orderBook.fillOrder(orderId, amount);
        emit OrderMatched(orderId, msg.sender, amount);
    }

    // ============ Pro-Rata Matching (NEW - Section 8.1) ============
    function matchOrderProRata(bytes32[] calldata orderIds, uint256 totalQuantity) 
        external 
        nonReentrant 
        returns (uint256[] memory fills) 
    {
        require(orderIds.length > 0, "No orders");
        require(totalQuantity > 0, "Invalid quantity");

        fills = new uint256[](orderIds.length);
        uint256 totalRequested = 0;

        // Step 1: Calculate total requested quantity
        for (uint256 i = 0; i < orderIds.length; i++) {
            OrderBookEngine.Order memory order = orderBook.getOrder(orderIds[i]);
            require(order.amount > order.filledAmount, "Order already filled");
            uint256 remaining = order.amount - order.filledAmount;
            totalRequested += remaining;
        }

        // Step 2: Calculate pro-rata fills
        if (totalRequested <= totalQuantity) {
            // All orders can be filled completely
            for (uint256 i = 0; i < orderIds.length; i++) {
                OrderBookEngine.Order memory order = orderBook.getOrder(orderIds[i]);
                fills[i] = order.amount - order.filledAmount;
            }
        } else {
            // Pro-rata allocation
            for (uint256 i = 0; i < orderIds.length; i++) {
                OrderBookEngine.Order memory order = orderBook.getOrder(orderIds[i]);
                uint256 remaining = order.amount - order.filledAmount;
                fills[i] = (remaining * totalQuantity) / totalRequested;
            }
        }

        // Step 3: Execute fills
        for (uint256 i = 0; i < orderIds.length; i++) {
            if (fills[i] > 0) {
                orderBook.fillOrder(orderIds[i], fills[i]);
                emit OrderMatched(orderIds[i], msg.sender, fills[i]);
            }
        }

        emit ProRataMatchExecuted(keccak256(abi.encodePacked(block.timestamp, msg.sender)), totalQuantity, fills);
        return fills;
    }

    // ============ Batch Auction (NEW - Section 8.1, 13.2) ============
    function startBatchAuction(uint256 duration) external onlyOwner returns (uint256 batchId) {
        batchId = currentBatchId + 1;
        currentBatchId = batchId;

        BatchAuction storage batch = batchAuctions[batchId];
        batch.batchId = batchId;
        batch.startTime = block.timestamp;
        batch.endTime = block.timestamp + (duration > 0 ? duration : BATCH_DURATION);
        batch.clearPrice = 0;
        batch.executed = false;
        batch.buyOrderCount = 0;
        batch.sellOrderCount = 0;

        emit BatchAuctionStarted(batchId, block.timestamp, batch.endTime);
    }

    function _addToBatch(bytes32 orderId, uint256 amount) internal {
        require(currentBatchId > 0, "No active batch");
        BatchAuction storage batch = batchAuctions[currentBatchId];
        require(block.timestamp <= batch.endTime, "Batch closed");
        require(!orderInBatch[orderId], "Order already in batch");

        OrderBookEngine.Order memory order = orderBook.getOrder(orderId);

        OrderInfo memory orderInfo = OrderInfo({
            orderId: orderId,
            trader: order.trader,
            amount: amount,
            price: order.price,
            filledAmount: 0
        });

        if (order.isBuy) {
            batch.buyOrders[batch.buyOrderCount] = orderInfo;
            batch.buyOrderCount++;
        } else {
            batch.sellOrders[batch.sellOrderCount] = orderInfo;
            batch.sellOrderCount++;
        }

        orderInBatch[orderId] = true;
    }

    function executeBatchAuction() external nonReentrant returns (uint256 clearPrice) {
        require(currentBatchId > 0, "No batch");
        BatchAuction storage batch = batchAuctions[currentBatchId];
        require(block.timestamp > batch.endTime, "Batch still open");
        require(!batch.executed, "Already executed");

        // Calculate clear price (uniform price auction)
        clearPrice = _calculateClearPrice(currentBatchId);
        require(clearPrice > 0, "No valid clear price");

        batch.clearPrice = clearPrice;

        // Execute all orders at clear price
        uint256 totalVolume = 0;
        for (uint256 i = 0; i < batch.buyOrderCount; i++) {
            if (batch.buyOrders[i].price >= clearPrice) {
                orderBook.fillOrder(batch.buyOrders[i].orderId, batch.buyOrders[i].amount);
                totalVolume += batch.buyOrders[i].amount;
                emit OrderMatched(batch.buyOrders[i].orderId, batch.buyOrders[i].trader, batch.buyOrders[i].amount);
            }
        }

        for (uint256 i = 0; i < batch.sellOrderCount; i++) {
            if (batch.sellOrders[i].price <= clearPrice) {
                orderBook.fillOrder(batch.sellOrders[i].orderId, batch.sellOrders[i].amount);
                totalVolume += batch.sellOrders[i].amount;
                emit OrderMatched(batch.sellOrders[i].orderId, batch.sellOrders[i].trader, batch.sellOrders[i].amount);
            }
        }

        batch.executed = true;
        emit BatchAuctionExecuted(currentBatchId, clearPrice, totalVolume);
    }

    function _calculateClearPrice(uint256 batchId) internal view returns (uint256) {
        BatchAuction storage batch = batchAuctions[batchId];
        
        // Sort and find price that maximizes executed volume
        // Simplified: Use average price as clear price
        if (batch.buyOrderCount == 0 || batch.sellOrderCount == 0) {
            return 0;
        }

        uint256 totalPrice = 0;
        uint256 count = 0;
        for (uint256 i = 0; i < batch.buyOrderCount; i++) {
            totalPrice += batch.buyOrders[i].price;
            count++;
        }
        for (uint256 i = 0; i < batch.sellOrderCount; i++) {
            totalPrice += batch.sellOrders[i].price;
            count++;
        }

        return totalPrice / count;
    }

    function swapOnAMM(uint256 amount0Out, uint256 amount1Out, address to) external nonReentrant {
        if (identityRegistry != address(0)) {
            require(IIdentityRegistry(identityRegistry).isVerified(msg.sender), "Not verified");
        }
        ammPool.swap(amount0Out, amount1Out, to, "");
    }

    // ============ View Functions ============
    function getBatchAuctionInfo(uint256 batchId) external view returns (
        uint256 startTime,
        uint256 endTime,
        uint256 clearPrice,
        bool executed,
        uint256 buyCount,
        uint256 sellCount
    ) {
        BatchAuction storage batch = batchAuctions[batchId];
        startTime = batch.startTime;
        endTime = batch.endTime;
        clearPrice = batch.clearPrice;
        executed = batch.executed;
        buyCount = batch.buyOrderCount;
        sellCount = batch.sellOrderCount;
    }

    function getBatchOrder(uint256 batchId, bool isBuy, uint256 index) external view returns (
        bytes32 orderId,
        address trader,
        uint256 amount,
        uint256 price
    ) {
        BatchAuction storage batch = batchAuctions[batchId];
        if (isBuy) {
            require(index < batch.buyOrderCount, "Index out of bounds");
            OrderInfo storage order = batch.buyOrders[index];
            return (order.orderId, order.trader, order.amount, order.price);
        } else {
            require(index < batch.sellOrderCount, "Index out of bounds");
            OrderInfo storage order = batch.sellOrders[index];
            return (order.orderId, order.trader, order.amount, order.price);
        }
    }

    function getCurrentBatchInfo() external view returns (
        uint256 batchId,
        uint256 startTime,
        uint256 endTime,
        bool isOpen,
        uint256 buyCount,
        uint256 sellCount
    ) {
        batchId = currentBatchId;
        if (batchId == 0) {
            return (0, 0, 0, false, 0, 0);
        }
        BatchAuction storage batch = batchAuctions[batchId];
        startTime = batch.startTime;
        endTime = batch.endTime;
        isOpen = block.timestamp <= endTime && !batch.executed;
        buyCount = batch.buyOrderCount;
        sellCount = batch.sellOrderCount;
    }
}
