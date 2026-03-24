// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title IRedemptionManager
 * @dev Interface for RedemptionManager contract
 */
interface IRedemptionManager {
    // ========== Events ==========

    event RedemptionRequested(
        address indexed vault,
        uint256 indexed requestId,
        address indexed investor,
        uint256 shares,
        uint256 requestTime
    );

    event RedemptionProcessed(
        address indexed vault,
        uint256 indexed requestId,
        uint256 assets,
        address indexed processor
    );

    event RedemptionClaimed(
        address indexed vault,
        uint256 indexed requestId,
        address indexed investor,
        uint256 assets
    );

    event RedemptionCancelled(
        address indexed vault,
        uint256 indexed requestId,
        address indexed investor
    );

    event RedemptionQueueCreated(
        address indexed vault,
        bytes32 indexed queueId,
        uint256 totalShares,
        uint256 totalAssets
    );

    event RedemptionGateSet(
        address indexed vault,
        uint256 gatePercentage,
        uint256 periodDuration
    );

    // ========== Redemption Request Flow ==========

    function requestRedemption(
        address vault,
        uint256 shares
    ) external returns (uint256 requestId);

    function processRedemption(
        address vault,
        uint256 requestId,
        uint256 assets
    ) external;

    function processBatchRedemptions(
        address vault,
        uint256[] calldata requestIds,
        uint256 totalAssets
    ) external;

    function claimRedemption(
        address vault,
        uint256 requestId
    ) external;

    function cancelRedemption(
        address vault,
        uint256 requestId
    ) external;

    // ========== Redemption Queue Management ==========

    function createRedemptionQueue(
        address vault,
        uint256 totalShares,
        uint256 totalAssets
    ) external returns (bytes32 queueId);

    function closeRedemptionQueue(
        address vault,
        bytes32 queueId
    ) external;

    function settleRedemptionQueue(
        address vault,
        bytes32 queueId
    ) external;

    // ========== Redemption Gates ==========

    function setRedemptionGate(
        address vault,
        uint256 gatePercentage,
        uint256 periodDuration
    ) external;

    function disableRedemptionGate(address vault) external;

    // ========== View Functions ==========

    function getRedemptionRequest(address vault, uint256 requestId)
        external
        view
        returns (
            address investor,
            uint256 shares,
            uint256 assets,
            uint256 requestTime,
            uint256 settleTime,
            uint256 status,
            address processor
        );

    function getRedemptionQueue(address vault, bytes32 queueId)
        external
        view
        returns (
            bytes32 queueId_,
            uint256 totalShares,
            uint256 totalAssets,
            uint256 createdAt,
            uint256 processedAt,
            uint256 status,
            uint256 requestCount
        );

    function getVaultRequestIds(address vault)
        external
        view
        returns (uint256[] memory);

    function getPendingRequestsCount(address vault)
        external
        view
        returns (uint256 count);

    function getReadyRequestsCount(address vault)
        external
        view
        returns (uint256 count);

    function nextRequestId(address vault) external view returns (uint256);

    function redemptionGates(address vault)
        external
        view
        returns (
            uint256 gatePercentage,
            uint256 periodDuration,
            uint256 lastPeriodStart,
            bool active
        );

    // ========== Configuration ==========

    function setVaultRegistry(address registry) external;

    function setIdentityRegistry(address registry) external;

    function vaultRegistry() external view returns (address);

    function identityRegistry() external view returns (address);

    // ========== Constants ==========

    function BASIS_POINTS() external view returns (uint256);

    function DEFAULT_GATE_PERCENTAGE() external view returns (uint256);

    function DEFAULT_PERIOD_DURATION() external view returns (uint256);

    function DEFAULT_CLAIM_PERIOD() external view returns (uint256);
}
