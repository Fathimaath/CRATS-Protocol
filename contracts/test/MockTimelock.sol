// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/governance/TimelockController.sol";

/**
 * @title MockTimelock
 * @dev Mock wrapper around OpenZeppelin TimelockController for local testing
 */
contract MockTimelock is TimelockController {
    constructor(
        uint256 minDelay,
        address[] memory proposers,
        address[] memory executors,
        address admin
    ) TimelockController(minDelay, proposers, executors, admin) {}
}
