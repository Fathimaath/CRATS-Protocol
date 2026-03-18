// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title ICircuitBreakerModule
 * @dev Interface for market protection and trading halts.
 * // Source: Audited Circuit Breaker Patterns
 */
interface ICircuitBreakerModule {
    struct HaltRecord {
        bool isHalted;
        bytes32 reason;
        uint256 timestamp;
        address initiator;
        uint256 expiry;
    }

    function checkTradingAllowed(address asset) external view returns (bool allowed, string memory message);
    function isHalted(address asset) external view returns (bool);
    
    function activateMarketHalt(bytes32 reason, uint256 duration) external;
    function deactivateMarketHalt() external;
    
    function activateAssetHalt(address asset, bytes32 reason, uint256 duration) external;
    function deactivateAssetHalt(address asset) external;
}
