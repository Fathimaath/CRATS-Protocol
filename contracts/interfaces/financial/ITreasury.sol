// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface ITreasury {
    function receiveFromVault() external;
    function confirmSettlementAvailable(address vault, uint256 amount) external view returns (bool);
    function disburseFunds(address investor, uint256 amount) external;
}
