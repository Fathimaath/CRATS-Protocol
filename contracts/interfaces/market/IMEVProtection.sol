// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IMEVProtection
 * @dev Interface for MEV protection with batch auctions
 */
interface IMEVProtection {
    // ============ Structs ============
    struct OrderData {
        address baseToken;
        address quoteToken;
        uint256 amount;
        uint256 price;
        bool isBuy;
        uint256 expiry;
    }

    struct Commitment {
        bytes32 commitmentHash;
        address user;
        uint256 batchId;
        uint256 deposit;
        bool submitted;
        bool revealed;
        uint256 timestamp;
    }

    struct Batch {
        uint256 batchId;
        OrderData[] orders;
        bytes32[] orderCommitments;
        uint256 clearPrice;
        uint256 executionTime;
        bool executed;
    }

    // ============ Events ============
    event CommitmentSubmitted(bytes32 indexed commitmentHash, address indexed user, uint256 batchId);
    event OrderRevealed(bytes32 indexed commitmentHash, OrderData orderData);
    event BatchExecuted(uint256 indexed batchId, uint256 clearPrice, uint256 timestamp);
    event BatchClosed(uint256 indexed batchId);
    event FrontRunDetected(address indexed user, bytes32 commitmentHash);

    // ============ Commit/Reveal Functions ============
    function submitCommitment(bytes32 commitmentHash, uint256 deposit)
        external
        payable
        returns (bool);

    function revealOrder(
        bytes32 commitmentHash,
        OrderData calldata orderData,
        bytes calldata signature
    ) external returns (bool);

    // ============ Batch Functions ============
    function executeBatch() external returns (uint256 clearPrice);

    function closeBatch() external;

    // ============ View Functions ============
    function getCommitment(bytes32 commitmentHash) external view returns (Commitment memory);

    function getBatch(uint256 batchId) external view returns (Batch memory);

    function getUserCommitments(address user) external view returns (bytes32[] memory);

    function getCurrentBatchInfo() external view returns (
        uint256 batchId,
        uint256 startTime,
        uint256 endTime,
        bool isOpen,
        uint256 orderCount
    );

    function isRevealed(bytes32 commitmentHash) external view returns (bool);

    function getRevealTimestamp(bytes32 commitmentHash) external view returns (uint256);

    function detectFrontRun(bytes32 commitmentHash1, bytes32 commitmentHash2)
        external
        view
        returns (bool isFrontRun, string memory reason);

    // ============ Constants ============
    function BATCH_DURATION() external view returns (uint256);

    function REVEAL_PERIOD() external view returns (uint256);

    function MIN_COMMITMENT_AMOUNT() external view returns (uint256);

    function currentBatchId() external view returns (uint256);

    function batchOpen() external view returns (bool);
}
