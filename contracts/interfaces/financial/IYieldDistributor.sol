// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title IYieldDistributor
 * @dev Interface for YieldDistributor contract
 */
interface IYieldDistributor {
    // ========== Events ==========

    event YieldScheduleCreated(
        address indexed vault,
        bytes32 indexed scheduleId,
        string name,
        uint256 yieldType,
        uint256 amount,
        uint256 frequency
    );

    event YieldDistributed(
        address indexed vault,
        bytes32 indexed scheduleId,
        uint256 amount,
        address indexed distributor,
        uint256 yieldType
    );

    event YieldClaimed(
        address indexed vault,
        uint256 amount,
        address indexed claimer
    );

    event YieldScheduleUpdated(
        address indexed vault,
        bytes32 indexed scheduleId,
        uint256 amount,
        uint256 frequency
    );

    event YieldScheduleDeactivated(
        address indexed vault,
        bytes32 indexed scheduleId
    );

    // ========== Yield Schedule Management ==========

    function createYieldSchedule(
        address vault,
        string calldata name,
        IERC20 yieldToken,
        uint256 amount,
        uint256 frequency,
        uint256 yieldType
    ) external returns (bytes32 scheduleId);

    function updateYieldSchedule(
        address vault,
        bytes32 scheduleId,
        uint256 newAmount,
        uint256 newFrequency
    ) external;

    function deactivateYieldSchedule(
        address vault,
        bytes32 scheduleId
    ) external;

    // ========== Yield Distribution ==========

    function distributeYield(
        address vault,
        uint256 amount,
        bytes32 scheduleId
    ) external returns (bool);

    function distributeYieldToVault(
        address vault,
        uint256 amount,
        bytes32 scheduleId
    ) external returns (bool);

    // ========== View Functions ==========

    function getYieldSchedule(address vault, bytes32 scheduleId)
        external
        view
        returns (
            string memory name,
            IERC20 yieldToken,
            uint256 amount,
            uint256 frequency,
            uint256 lastDistribution,
            uint256 nextDue,
            bool active,
            uint256 yieldType
        );

    function getYieldHistory(address vault, bytes32 scheduleId)
        external
        view
        returns (
            uint256 amount,
            uint256 timestamp,
            address distributor,
            uint256 yieldType,
            bytes32 scheduleId_
        );

    function getVaultScheduleIds(address vault)
        external
        view
        returns (bytes32[] memory);

    function isYieldDue(address vault, bytes32 scheduleId)
        external
        view
        returns (bool);

    function getPendingYield(address vault) external view returns (uint256);

    function getTotalDistributed(address vault) external view returns (uint256);

    // ========== Configuration ==========

    function setVaultRegistry(address registry) external;

    function setInvestorRightsRegistry(address registry) external;

    function vaultRegistry() external view returns (address);

    function investorRightsRegistry() external view returns (address);
}
