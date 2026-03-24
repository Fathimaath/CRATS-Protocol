// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IAMMPool
 * @dev Interface for Automated Market Maker Pool
 */
interface IAMMPool {
    // ============ Events ============
    event Mint(address indexed sender, uint256 amount0, uint256 amount1);
    event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to);
    event Swap(
        address indexed sender,
        uint256 amount0In,
        uint256 amount1In,
        uint256 amount0Out,
        uint256 amount1Out,
        address indexed to
    );
    event Sync(uint256 reserve0, uint256 reserve1);
    event NAVOracleConfigured(address indexed oracle, uint256 maxDeviationBps);

    // ============ Liquidity Functions ============
    function mint(address to) external returns (uint256 liquidity);

    function burn(address to) external returns (uint256 amount0, uint256 amount1);

    function swap(
        uint256 amount0Out,
        uint256 amount1Out,
        address to,
        bytes calldata data
    ) external;

    // ============ View Functions ============
    function token0() external view returns (address);

    function token1() external view returns (address);

    function reserve0() external view returns (uint256);

    function reserve1() external view returns (uint256);

    function getReserves() external view returns (uint256 reserve0_, uint256 reserve1_);

    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) external pure returns (uint256 amountOut);

    function getPrice() external view returns (uint256);

    function totalSupply() external view returns (uint256);

    function balanceOf(address account) external view returns (uint256);

    // ============ Configuration ============
    function setNAVOracle(address _navOracle, uint256 _maxDeviationBps) external;

    function setIdentityRegistry(address _identityRegistry) external;

    function setSwapFee(uint256 _swapFeeBps) external;

    // ============ View Configuration ============
    function navOracle() external view returns (address);

    function maxDeviationBps() external view returns (uint256);

    function navAnchoringEnabled() external view returns (bool);

    function identityRegistry() external view returns (address);

    function swapFeeBps() external view returns (uint256);
}
