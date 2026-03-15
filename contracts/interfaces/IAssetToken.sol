// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title IAssetToken
 * @dev Interface for CRATS Asset Token (ERC-20F)
 * ERC-20 compliant token with force transfer and circuit breaker
 */
interface IAssetToken is IERC20 {

    // === Events ===

    event TokensMinted(address indexed to, uint256 amount);
    event TokensBurned(address indexed from, uint256 amount);
    event ForceTransferred(address indexed from, address indexed to, uint256 amount, bytes32 reason);
    event AddressFrozen(address indexed account, bool isFrozen);
    event TradingHalted(uint256 timestamp, address initiator, bytes32 reason);
    event TradingResumed(uint256 timestamp, address initiator);
    event PriceLimitsSet(uint256 limitUpBps, uint256 limitDownBps);

    // === View Functions ===

    function version() external view returns (string memory);
    function isVerified(address account) external view returns (bool);
    function isFrozen(address account) external view returns (bool);
    function isTradingHalted() external view returns (bool);
    function complianceModule() external view returns (address);
    function identityRegistry() external view returns (address);
    function circuitBreaker() external view returns (address);
    function totalMinted() external view returns (uint256);
    function totalBurned() external view returns (uint256);

    // === Mint/Burn Functions ===

    function mint(address to, uint256 amount) external returns (bool);
    function burn(uint256 amount) external;
    function burnFrom(address account, uint256 amount) external;

    // === Force Transfer (ERC-7518) ===

    function forceTransfer(
        address from,
        address to,
        uint256 amount,
        bytes32 reasonCode,
        bytes calldata evidence
    ) external;

    function getForceTransferCount() external view returns (uint256);
    
    function getForceTransfer(uint256 index) external view returns (
        address from,
        address to,
        uint256 amount,
        address executor,
        bytes32 reasonCode,
        uint256 timestamp,
        bytes32 evidenceHash
    );

    // === Freeze/Unfreeze ===

    function freezeAddress(address account) external;
    function unfreezeAddress(address account) external;

    // === Circuit Breaker ===

    function haltTrading(bytes32 reason) external;
    function resumeTrading() external;
    function setPriceLimits(uint256 limitUpBps, uint256 limitDownBps) external;

    // === Configuration ===

    function setComplianceModule(address newModule) external;
    function setIdentityRegistry(address newRegistry) external;
    function setCircuitBreaker(address newCircuitBreaker) external;
}
