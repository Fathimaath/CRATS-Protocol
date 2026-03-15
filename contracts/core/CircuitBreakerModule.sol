// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/ICircuitBreakerModule.sol";
import "../interfaces/ICRATSAccessControl.sol";
import "../config/AssetConfig.sol";

/**
 * @title CircuitBreakerModule
 * @dev Circuit breaker for trading halts and limit up/down controls
 * NEW in Layer 2 v3.0
 */
contract CircuitBreakerModule is AccessControl, ReentrancyGuard, ICircuitBreakerModule {

    // === State Variables ===

    // Market-wide halt state
    bool public marketWideHalt;
    bytes32 public haltReason;
    uint256 public haltExpiry;
    address public haltInitiator;

    // Per-asset halt state
    mapping(address => bool) public assetHalted;
    mapping(address => HaltRecord) public assetHaltRecords;

    // Per-asset price limits
    mapping(address => LimitConfig) public assetLimits;

    // Operators
    mapping(address => bool) public isOperator;

    // === Modifiers ===

    modifier onlyOperator() {
        require(isOperator[msg.sender], "CircuitBreaker: Caller is not operator");
        _;
    }

    modifier onlyRegulator() {
        require(
            hasRole(CRATSAccessControl.REGULATOR_ROLE, msg.sender),
            "CircuitBreaker: Caller is not regulator"
        );
        _;
    }

    // === Constructor ===

    constructor(address admin) {
        require(admin != address(0), "CircuitBreaker: Admin cannot be zero address");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        isOperator[admin] = true;
    }

    // === External View Functions ===

    function version() external pure override returns (string memory) {
        return AssetConfig.VERSION;
    }

    function isRegulator(address account) external view override returns (bool) {
        return hasRole(CRATSAccessControl.REGULATOR_ROLE, account);
    }

    function checkTradingAllowed(address asset) external view override returns (bool) {
        // Check market-wide halt
        if (marketWideHalt && block.timestamp < haltExpiry) {
            return false;
        }

        // Check asset-specific halt
        if (assetHalted[asset]) {
            HaltRecord memory record = assetHaltRecords[asset];
            if (record.expiry == 0 || block.timestamp < record.expiry) {
                return false;
            }
        }

        return true;
    }

    function checkPriceLimits(
        address asset,
        uint256 proposedPrice
    ) external view override returns (bool, string memory) {
        LimitConfig memory config = assetLimits[asset];

        // No reference price set yet
        if (config.referencePrice == 0) {
            return (true, "No reference price set");
        }

        // Price band period expired - allow update
        if (block.timestamp >= config.lastUpdateTime + config.priceBandPeriod) {
            return (true, "Price band period expired");
        }

        // Calculate limits
        uint256 upperLimit = (config.referencePrice * (AssetConfig.BASIS_POINTS + config.limitUpBps)) / AssetConfig.BASIS_POINTS;
        uint256 lowerLimit = (config.referencePrice * (AssetConfig.BASIS_POINTS - config.limitDownBps)) / AssetConfig.BASIS_POINTS;

        if (proposedPrice > upperLimit) {
            return (false, "Price exceeds limit up threshold");
        }

        if (proposedPrice < lowerLimit) {
            return (false, "Price below limit down threshold");
        }

        return (true, "Within limits");
    }

    // === Market-Wide Halts ===

    function activateMarketHalt(
        bytes32 reason,
        uint256 duration
    ) external override onlyRegulator {
        require(duration > 0, "CircuitBreaker: Duration must be positive");

        marketWideHalt = true;
        haltReason = reason;
        haltExpiry = block.timestamp + duration;
        haltInitiator = msg.sender;

        emit MarketHaltActivated(block.timestamp, reason, haltExpiry);
    }

    function deactivateMarketHalt() external override onlyRegulator {
        marketWideHalt = false;
        haltReason = bytes32(0);
        haltExpiry = 0;

        emit MarketHaltDeactivated(block.timestamp);
    }

    // === Asset-Specific Halts ===

    function activateAssetHalt(
        address asset,
        bytes32 reason,
        uint256 duration
    ) external override onlyRegulator {
        require(asset != address(0), "CircuitBreaker: Asset cannot be zero address");
        require(duration > 0, "CircuitBreaker: Duration must be positive");

        assetHalted[asset] = true;
        assetHaltRecords[asset] = HaltRecord({
            isHalted: true,
            reason: reason,
            timestamp: block.timestamp,
            initiator: msg.sender,
            expiry: block.timestamp + duration
        });

        emit AssetHaltActivated(asset, block.timestamp, reason, block.timestamp + duration);
    }

    function deactivateAssetHalt(address asset) external override onlyRegulator {
        require(asset != address(0), "CircuitBreaker: Asset cannot be zero address");

        assetHalted[asset] = false;
        HaltRecord storage record = assetHaltRecords[asset];
        record.isHalted = false;
        record.expiry = block.timestamp;

        emit AssetHaltDeactivated(asset, block.timestamp);
    }

    // === Price Limits ===

    function setAssetLimits(
        address asset,
        uint256 limitUpBps,
        uint256 limitDownBps,
        uint256 priceBandPeriod
    ) external override onlyOperator {
        require(asset != address(0), "CircuitBreaker: Asset cannot be zero address");
        require(limitUpBps <= 5000, "CircuitBreaker: Limit up too high"); // Max 50%
        require(limitDownBps <= 5000, "CircuitBreaker: Limit down too high"); // Max 50%
        require(priceBandPeriod >= 1 hours, "CircuitBreaker: Period too short");

        assetLimits[asset] = LimitConfig({
            limitUpBps: limitUpBps,
            limitDownBps: limitDownBps,
            referencePrice: 0,
            lastUpdateTime: 0,
            priceBandPeriod: priceBandPeriod
        });

        emit AssetLimitsSet(asset, limitUpBps, limitDownBps, priceBandPeriod);
    }

    function updateReferencePrice(
        address asset,
        uint256 newPrice
    ) external override onlyOperator {
        require(asset != address(0), "CircuitBreaker: Asset cannot be zero address");
        require(newPrice > 0, "CircuitBreaker: Price must be positive");

        LimitConfig storage config = assetLimits[asset];
        uint256 oldPrice = config.referencePrice;

        config.referencePrice = newPrice;
        config.lastUpdateTime = block.timestamp;

        emit ReferencePriceUpdated(asset, oldPrice, newPrice);
    }

    // === Operator Management ===

    function addOperator(address operator) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        require(operator != address(0), "CircuitBreaker: Operator cannot be zero address");
        isOperator[operator] = true;
    }

    function removeOperator(address operator) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        isOperator[operator] = false;
    }
}
