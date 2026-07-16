// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/Ownable.sol";

contract CarbonBatchManager is Ownable {
    struct Batch {
        uint256 id;
        uint256 totalCredits;
        uint256 availableCredits;
        uint16 vintage;
        string serialStart;
        string serialEnd;
        bool isActive;
    }

    // assetToken => list of batches
    mapping(address => Batch[]) private _batches;
    // assetToken => number of batches
    mapping(address => uint256) private _batchCount;

    // Authorized operators (like CarbonRetirementManager)
    mapping(address => bool) public isOperator;

    event BatchAdded(address indexed assetToken, uint256 indexed batchId, uint256 totalCredits, uint16 vintage, string serialStart, string serialEnd);
    event CreditsAllocated(address indexed assetToken, uint256 amount, uint256 startIndex, uint256 endIndex);
    event OperatorStatusChanged(address indexed operator, bool status);

    modifier onlyOperator() {
        require(isOperator[msg.sender] || msg.sender == owner(), "BatchManager: unauthorized");
        _;
    }

    constructor(address initialOwner) Ownable(initialOwner) {
        isOperator[initialOwner] = true;
    }

    function setOperator(address operator, bool status) external onlyOwner {
        isOperator[operator] = status;
        emit OperatorStatusChanged(operator, status);
    }

    function addBatch(
        address assetToken,
        uint256 totalCredits,
        uint16 vintage,
        string calldata serialStart,
        string calldata serialEnd
    ) external onlyOperator {
        require(assetToken != address(0), "BatchManager: invalid token");
        require(totalCredits > 0, "BatchManager: zero credits");

        uint256 batchId = _batchCount[assetToken];
        _batches[assetToken].push(Batch({
            id: batchId,
            totalCredits: totalCredits,
            availableCredits: totalCredits,
            vintage: vintage,
            serialStart: serialStart,
            serialEnd: serialEnd,
            isActive: true
        }));
        _batchCount[assetToken]++;

        emit BatchAdded(assetToken, batchId, totalCredits, vintage, serialStart, serialEnd);
    }

    function getBatchCount(address assetToken) external view returns (uint256) {
        return _batchCount[assetToken];
    }

    function getBatch(address assetToken, uint256 batchId) external view returns (Batch memory) {
        require(batchId < _batchCount[assetToken], "BatchManager: invalid batchId");
        return _batches[assetToken][batchId];
    }

    /**
     * @dev Allocates amount of credits FIFO (from oldest vintage/earliest batch).
     * Returns string representation of allocated serial range or ranges.
     */
    function allocateCredits(
        address assetToken,
        uint256 amount
    ) external onlyOperator returns (
        uint256 startBatchId,
        uint256 endBatchId,
        string memory serialStart,
        string memory serialEnd
    ) {
        require(_batchCount[assetToken] > 0, "BatchManager: no batches registered");
        
        uint256 remaining = amount;
        bool foundStart = false;
        
        for (uint256 i = 0; i < _batchCount[assetToken]; i++) {
            Batch storage batch = _batches[assetToken][i];
            if (batch.availableCredits == 0) continue;

            if (!foundStart) {
                startBatchId = i;
                serialStart = batch.serialStart; // Simplified range start
                foundStart = true;
            }

            if (batch.availableCredits >= remaining) {
                batch.availableCredits -= remaining;
                endBatchId = i;
                serialEnd = batch.serialEnd; // Simplified range end
                remaining = 0;
                break;
            } else {
                remaining -= batch.availableCredits;
                batch.availableCredits = 0;
            }
        }

        require(remaining == 0, "BatchManager: insufficient available credits across batches");
        emit CreditsAllocated(assetToken, amount, startBatchId, endBatchId);
    }

    /**
     * @dev Reverts credit allocation on failure.
     */
    function releaseCredits(
        address assetToken,
        uint256 startBatchId,
        uint256 endBatchId,
        uint256 amount
    ) external onlyOperator {
        uint256 remaining = amount;
        for (uint256 i = startBatchId; i <= endBatchId; i++) {
            Batch storage batch = _batches[assetToken][i];
            uint256 space = batch.totalCredits - batch.availableCredits;
            if (space >= remaining) {
                batch.availableCredits += remaining;
                remaining = 0;
                break;
            } else {
                remaining -= space;
                batch.availableCredits = batch.totalCredits;
            }
        }
    }
}
