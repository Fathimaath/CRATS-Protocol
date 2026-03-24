// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ISettlementEngine
 * @dev Interface for DvP and DvD Settlement Engine
 */
interface ISettlementEngine {
    // ============ Structs ============
    struct Settlement {
        bytes32 id;
        address from;
        address to;
        address assetToken;
        address paymentToken;
        uint256 assetAmount;
        uint256 paymentAmount;
        uint256 timestamp;
        uint256 expiry;
        bool completed;
        bool cancelled;
    }

    // ============ Events ============
    event SettlementInitiated(
        bytes32 indexed id,
        address indexed from,
        address indexed to,
        address assetToken,
        address paymentToken,
        uint256 assetAmount,
        uint256 paymentAmount
    );
    event SettlementCompleted(bytes32 indexed id);
    event SettlementFailed(bytes32 indexed id, string reason);
    event SettlementCancelled(bytes32 indexed id);

    // ============ Settlement Functions ============
    function initiateSettlement(
        address to,
        address assetToken,
        address paymentToken,
        uint256 assetAmount,
        uint256 paymentAmount,
        uint256 expiry
    ) external returns (bytes32 settlementId);

    function executeSettlement(bytes32 settlementId) external;

    function cancelSettlement(bytes32 settlementId) external;

    function initiateDvDSwap(
        address counterparty,
        address tokenYouSend,
        address tokenYouReceive,
        uint256 amountYouSend,
        uint256 amountYouReceive,
        uint256 expiry
    ) external returns (bytes32 swapId);

    // ============ View Functions ============
    function getSettlement(bytes32 settlementId) external view returns (Settlement memory);

    function getUserSettlements(address user, uint256 offset, uint256 limit) external view returns (bytes32[] memory);

    function getActiveSettlementsCount(address user) external view returns (uint256 count);

    function settlements(bytes32 settlementId) external view returns (
        bytes32 id,
        address from,
        address to,
        address assetToken,
        address paymentToken,
        uint256 assetAmount,
        uint256 paymentAmount,
        uint256 timestamp,
        uint256 expiry,
        bool completed,
        bool cancelled
    );

    // ============ Configuration ============
    function setComplianceConfig(address _identityRegistry, address _complianceModule) external;

    function authorizeSettler(address settler) external;

    function deauthorizeSettler(address settler) external;

    function setSettlementTimeout(uint256 timeout) external;

    // ============ View Configuration ============
    function identityRegistry() external view returns (address);

    function complianceModule() external view returns (address);

    function authorizedSettlers(address settler) external view returns (bool);

    function settlementTimeout() external view returns (uint256);
}
