// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IMatchingEngine {
    function setComplianceConfig(address _ir, address _cm) external;
    function setOrderBook(address _ob) external;
    function setAMMPool(address _ap) external;
    function matchOrder(bytes32 orderId, uint256 amount) external;
    function swapOnAMM(uint256 amount0Out, uint256 amount1Out, address to) external;
    function identityRegistry() external view returns (address);
    function complianceModule() external view returns (address);
}
