// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IBestExecution
 * @dev Interface for MiFID II Article 27 best execution
 */
interface IBestExecution {
    // ============ Structs ============
    struct ExecutionPolicy {
        uint256 priceWeight;
        uint256 speedWeight;
        uint256 likelihoodWeight;
        uint256 costWeight;
        uint256 minQualityScore;
    }

    struct ExecutionReport {
        bytes32 reportId;
        address asset;
        uint256 amount;
        uint256 price;
        bool isBuy;
        address venue;
        address executor;
        uint256 timestamp;
        uint256 executionTime;
        uint256 fees;
        uint256 slippage;
        uint256 qualityScore;
    }

    struct VenueStats {
        uint256 totalExecutions;
        uint256 successfulExecutions;
        uint256 fillRate;
        uint256 avgExecutionTime;
        uint256 avgTotalCost;
        uint256 lastQualityScore;
    }

    // ============ Events ============
    event ExecutionPolicySet(address indexed asset, ExecutionPolicy policy);
    event ExecutionReported(bytes32 indexed reportId, address indexed asset, uint256 price);
    event VenueAdded(address indexed venue);
    event VenueRemoved(address indexed venue);
    event BestExecutionFailed(address indexed asset, string reason);

    // ============ Execution Functions ============
    function checkBestExecution(
        address asset,
        uint256 amount,
        bool isBuy,
        address venue
    ) external view returns (bool isBest, uint256 qualityScore);

    function reportExecution(
        address asset,
        uint256 amount,
        uint256 price,
        bool isBuy,
        address venue,
        uint256 executionTime,
        uint256 fees
    ) external returns (bytes32 reportId);

    // ============ Venue Management ============
    function addVenue(address venue) external;

    function removeVenue(address venue) external;

    function getVenues() external view returns (address[] memory);

    function getActiveVenuesCount() external view returns (uint256);

    // ============ View Functions ============
    function getExecutionReport(bytes32 reportId) external view returns (ExecutionReport memory);

    function getVenueStats(address venue) external view returns (VenueStats memory);

    function getExecutionPolicy(address asset) external view returns (ExecutionPolicy memory);

    function getExecutionQuality(address asset, uint256 window)
        external
        view
        returns (
            uint256 avgPrice,
            uint256 avgSlippage,
            uint256 fillRate,
            uint256 avgExecutionTime
        );

    // ============ Constants ============
    function WINDOW_SIZE() external view returns (uint256);

    function MAX_SLIPPAGE_BPS() external view returns (uint256);

    function MIN_FILL_RATE_BPS() external view returns (uint256);

    function MAX_EXECUTION_TIME() external view returns (uint256);
}
