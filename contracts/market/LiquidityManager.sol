// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title LiquidityManager
 * @dev Liquidity staking for rewards with comprehensive metrics (Section 10)
 * Based on audited MasterChef pattern
 * 
 * IMPLEMENTED:
 * - Liquidity staking with rewards
 * - Liquidity metrics (bid-ask spread, depth, fill rate, price impact)
 * - Pool statistics tracking
 */
contract LiquidityManager is Ownable {
    using SafeERC20 for IERC20;

    struct Pool {
        uint256 lastRewardBlock;
        uint256 accRewardPerShare;
        uint256 totalStaked;
        uint256 totalRewardsPaid;
        uint256 aprBps; // APR in basis points
    }

    struct User {
        uint256 amount;
        uint256 rewardDebt;
        uint256 pendingRewards;
    }

    // ============ Liquidity Metrics (NEW - Section 10.1) ============
    struct LiquidityMetrics {
        uint256 bidAskSpreadBps; // Current spread in basis points
        uint256 marketDepth; // Total liquidity at top 5 levels
        uint256 fillRateBps; // Fill rate in basis points (9000 = 90%)
        uint256 priceImpactBps; // Price impact per unit traded
        uint256 totalVolume24h;
        uint256 totalTrades24h;
        uint256 avgTradeSize;
        uint256 lastUpdate;
    }

    struct PoolStats {
        uint256 totalDeposits;
        uint256 totalWithdrawals;
        uint256 depositCount;
        uint256 withdrawalCount;
        uint256 lastUpdate;
    }

    IERC20 public rewardToken;
    uint256 public rewardPerBlock;
    mapping(address => Pool) public pools;
    mapping(address => mapping(address => User)) public users;
    mapping(address => PoolStats) public poolStats;
    mapping(address => LiquidityMetrics) public liquidityMetrics;
    address[] public lpTokens;

    // ============ Events ============
    event Deposit(address indexed user, address indexed lpToken, uint256 amount);
    event Withdraw(address indexed user, address indexed lpToken, uint256 amount);
    event RewardPaid(address indexed user, address indexed lpToken, uint256 amount);
    event MetricsUpdated(address indexed lpToken, uint256 spreadBps, uint256 depth, uint256 fillRateBps);
    event PoolStatsUpdated(address indexed lpToken, uint256 totalDeposits, uint256 totalWithdrawals);

    constructor(address _rewardToken, uint256 _rewardPerBlock) Ownable(msg.sender) {
        rewardToken = IERC20(_rewardToken);
        rewardPerBlock = _rewardPerBlock;
    }

    function addPool(address _lpToken) external onlyOwner {
        require(pools[_lpToken].lastRewardBlock == 0, "Exists");
        lpTokens.push(_lpToken);
        pools[_lpToken].lastRewardBlock = block.number;
        
        // Initialize metrics
        liquidityMetrics[_lpToken].lastUpdate = block.timestamp;
        poolStats[_lpToken].lastUpdate = block.timestamp;
    }

    // ============ Liquidity Metrics Update (NEW - Section 10.1) ============
    function updateLiquidityMetrics(
        address lpToken,
        uint256 bidAskSpreadBps,
        uint256 marketDepth,
        uint256 fillRateBps,
        uint256 priceImpactBps,
        uint256 volume24h,
        uint256 trades24h
    ) external onlyOwner {
        require(lpToken != address(0), "Invalid token");
        
        LiquidityMetrics storage metrics = liquidityMetrics[lpToken];
        metrics.bidAskSpreadBps = bidAskSpreadBps;
        metrics.marketDepth = marketDepth;
        metrics.fillRateBps = fillRateBps;
        metrics.priceImpactBps = priceImpactBps;
        metrics.totalVolume24h = volume24h;
        metrics.totalTrades24h = trades24h;
        metrics.avgTradeSize = trades24h > 0 ? volume24h / trades24h : 0;
        metrics.lastUpdate = block.timestamp;

        emit MetricsUpdated(lpToken, bidAskSpreadBps, marketDepth, fillRateBps);
    }

    function getLiquidityMetrics(address lpToken) external view returns (LiquidityMetrics memory) {
        return liquidityMetrics[lpToken];
    }

    function getPoolStats(address lpToken) external view returns (PoolStats memory) {
        return poolStats[lpToken];
    }

    // ============ Core Staking Functions ============
    function deposit(address _lpToken, uint256 _amount) external {
        require(_amount > 0, "Invalid amount");
        _updatePool(_lpToken);
        User storage user = users[_lpToken][msg.sender];
        IERC20(_lpToken).safeTransferFrom(msg.sender, address(this), _amount);
        if (user.amount > 0) {
            user.pendingRewards += (user.amount * pools[_lpToken].accRewardPerShare) / 1e4 - user.rewardDebt;
        }
        user.amount += _amount;
        user.rewardDebt = (user.amount * pools[_lpToken].accRewardPerShare) / 1e4;
        
        // Update pool stats
        poolStats[_lpToken].totalDeposits += _amount;
        poolStats[_lpToken].depositCount++;
        poolStats[_lpToken].lastUpdate = block.timestamp;
        pools[_lpToken].totalStaked += _amount;
        
        emit Deposit(msg.sender, _lpToken, _amount);
    }

    function withdraw(address _lpToken, uint256 _amount) external {
        require(_amount > 0, "Invalid amount");
        _updatePool(_lpToken);
        User storage user = users[_lpToken][msg.sender];
        uint256 pending = (user.amount * pools[_lpToken].accRewardPerShare) / 1e4 - user.rewardDebt;
        user.pendingRewards += pending;
        user.amount -= _amount;
        user.rewardDebt = (user.amount * pools[_lpToken].accRewardPerShare) / 1e4;
        IERC20(_lpToken).safeTransfer(msg.sender, _amount);
        
        // Update pool stats
        poolStats[_lpToken].totalWithdrawals += _amount;
        poolStats[_lpToken].withdrawalCount++;
        poolStats[_lpToken].lastUpdate = block.timestamp;
        pools[_lpToken].totalStaked -= _amount;
        
        emit Withdraw(msg.sender, _lpToken, _amount);
    }

    function claimRewards(address _lpToken) external {
        _updatePool(_lpToken);
        User storage user = users[_lpToken][msg.sender];
        uint256 total = user.pendingRewards + ((user.amount * pools[_lpToken].accRewardPerShare) / 1e4 - user.rewardDebt);
        user.pendingRewards = 0;
        user.rewardDebt = (user.amount * pools[_lpToken].accRewardPerShare) / 1e4;
        rewardToken.safeTransfer(msg.sender, total);
        
        pools[_lpToken].totalRewardsPaid += total;
        emit RewardPaid(msg.sender, _lpToken, total);
    }

    function _updatePool(address _lpToken) internal {
        Pool storage pool = pools[_lpToken];
        if (block.number <= pool.lastRewardBlock) return;
        uint256 total = pool.totalStaked;
        if (total == 0) {
            pool.lastRewardBlock = block.number;
            return;
        }
        uint256 multiplier = block.number - pool.lastRewardBlock;
        uint256 rewards = (multiplier * rewardPerBlock) / lpTokens.length;
        pool.accRewardPerShare += (rewards * 1e4) / total;
        pool.lastRewardBlock = block.number;
    }

    function pendingReward(address _lpToken, address _user) external view returns (uint256) {
        User storage user = users[_lpToken][_user];
        return user.pendingRewards + ((user.amount * pools[_lpToken].accRewardPerShare) / 1e4 - user.rewardDebt);
    }

    // ============ View Functions ============
    function getPoolInfo(address _lpToken) external view returns (
        uint256 totalStaked,
        uint256 accRewardPerShare,
        uint256 aprBps,
        uint256 totalRewardsPaid
    ) {
        Pool storage pool = pools[_lpToken];
        return (pool.totalStaked, pool.accRewardPerShare, pool.aprBps, pool.totalRewardsPaid);
    }

    function getUserInfo(address _lpToken, address _user) external view returns (
        uint256 staked,
        uint256 pendingRewards,
        uint256 totalEarned
    ) {
        User storage user = users[_lpToken][_user];
        uint256 pending = user.pendingRewards + ((user.amount * pools[_lpToken].accRewardPerShare) / 1e4 - user.rewardDebt);
        return (user.amount, pending, user.pendingRewards);
    }

    function getLpTokenCount() external view returns (uint256) {
        return lpTokens.length;
    }

    function getAllLpTokens() external view returns (address[] memory) {
        return lpTokens;
    }
}
