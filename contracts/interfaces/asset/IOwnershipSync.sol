// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title IOwnershipSync
 * @dev Mandatory interface for contracts and modules initiating Beneficial Ownership Register (BOR) sync.
 */
interface IOwnershipSync {
    function updateBeneficialOwnership(
        address asset,
        address vault,
        address investor,
        uint256 balance
    ) external;

    function updateBeneficialOwnershipBatch(
        address asset,
        address vault,
        address[] calldata investors,
        uint256[] calldata balances
    ) external;

    event BeneficialOwnershipUpdated(
        address indexed asset,
        address indexed vault,
        address indexed investor,
        uint256 newBalance,
        uint256 timestamp
    );
}
