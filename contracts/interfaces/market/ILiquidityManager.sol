// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ILiquidityManager {
    struct Pool {
        uint256 lastRewardBlock;
        uint256 accRewardPerShare;
    }

    struct User {
        uint256 amount;
        uint256 rewardDebt;
        uint256 pendingRewards;
    }

    function rewardToken() external view returns (address);
    function rewardPerBlock() external view returns (uint256);
    function pools(address _lpToken) external view returns (Pool memory);
    function users(address _lpToken, address _user) external view returns (User memory);
    function lpTokens(uint256 index) external view returns (address);
    
    function addPool(address _lpToken) external;
    function deposit(address _lpToken, uint256 _amount) external;
    function withdraw(address _lpToken, uint256 _amount) external;
    function claimRewards(address _lpToken) external;
    function pendingReward(address _lpToken, address _user) external view returns (uint256);
}
