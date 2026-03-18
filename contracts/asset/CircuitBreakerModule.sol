// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "../interfaces/asset/ICircuitBreakerModule.sol";
import "../utils/CRATSConfig.sol";

/**
 * @title CircuitBreakerModule
 * @dev Provides market-wide and per-asset trading halts.
 * // Source: Audited Circuit Breaker Patterns
 */
contract CircuitBreakerModule is
    Initializable,
    AccessControlUpgradeable,
    UUPSUpgradeable,
    ICircuitBreakerModule
{
    // === State ===
    bool public marketWideHalt;
    bytes32 public haltReason;
    uint256 public haltExpiry;
    address public haltInitiator;
    
    mapping(address => HaltRecord) public assetHaltRecords;

    // === Events ===
    event MarketHaltActivated(uint256 timestamp, bytes32 reason, uint256 expiry);
    event MarketHaltDeactivated(uint256 timestamp);
    event AssetHaltActivated(address indexed asset, uint256 timestamp, bytes32 reason);
    event AssetHaltDeactivated(address indexed asset, uint256 timestamp);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address admin) public initializer {
        __AccessControl_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(CRATSConfig.REGULATOR_ROLE, admin);
        _grantRole(CRATSConfig.COMPLIANCE_ROLE, admin);
    }

    // === Market Halt Functions ===

    function activateMarketHalt(
        bytes32 reason,
        uint256 duration
    ) external override onlyRole(CRATSConfig.REGULATOR_ROLE) {
        marketWideHalt = true;
        haltReason = reason;
        haltExpiry = block.timestamp + duration;
        haltInitiator = msg.sender;
        
        emit MarketHaltActivated(block.timestamp, reason, haltExpiry);
    }

    function deactivateMarketHalt() external override onlyRole(CRATSConfig.REGULATOR_ROLE) {
        marketWideHalt = false;
        haltReason = bytes32(0);
        haltExpiry = 0;
        
        emit MarketHaltDeactivated(block.timestamp);
    }

    // === Asset Halt Functions ===

    function activateAssetHalt(
        address asset,
        bytes32 reason,
        uint256 duration
    ) external override onlyRole(CRATSConfig.REGULATOR_ROLE) {
        assetHaltRecords[asset] = HaltRecord({
            isHalted: true,
            reason: reason,
            timestamp: block.timestamp,
            initiator: msg.sender,
            expiry: block.timestamp + duration
        });
        
        emit AssetHaltActivated(asset, block.timestamp, reason);
    }

    function deactivateAssetHalt(address asset) external override onlyRole(CRATSConfig.REGULATOR_ROLE) {
        assetHaltRecords[asset].isHalted = false;
        
        emit AssetHaltDeactivated(asset, block.timestamp);
    }

    // === Views ===

    function checkTradingAllowed(address asset) external view override returns (bool allowed, string memory message) {
        // Market-wide check
        if (marketWideHalt && (haltExpiry == 0 || block.timestamp < haltExpiry)) {
            return (false, "CircuitBreaker: Market-wide halt in effect");
        }
        
        // Asset-specific check
        HaltRecord memory record = assetHaltRecords[asset];
        if (record.isHalted && (record.expiry == 0 || block.timestamp < record.expiry)) {
            return (false, "CircuitBreaker: Asset trading halted");
        }
        
        return (true, "");
    }

    function isHalted(address asset) external view override returns (bool) {
        if (marketWideHalt && (haltExpiry == 0 || block.timestamp < haltExpiry)) {
            return true;
        }
        HaltRecord memory record = assetHaltRecords[asset];
        return record.isHalted && (record.expiry == 0 || block.timestamp < record.expiry);
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
