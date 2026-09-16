// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title IRedemptionManager
 * @dev Interface for RedemptionManager contract
 *
 * Audit additions (copym audit):
 *  Q1 — setOwnershipSyncManager / OwnershipSyncManagerUpdated
 *  Q2 — governanceCancelRequest (now accepts expired READY), governanceReleaseExpiredToVault
 *  Q3 — setNavOracle, setSettlementVarianceBPS, getWeightedNAV
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

    /// @dev Q1 — emitted when ownershipSyncManager is configured
    event OwnershipSyncManagerUpdated(address indexed syncManager);

    /// @dev Q2 — emitted when an expired READY request is released to the vault
    event RedemptionExpired(address indexed vault, uint256 indexed requestId, address indexed investor);

    /// @dev Q3 — emitted when navOracle or varianceBPS is updated
    event NavOracleUpdated(address indexed oracle);
    event SettlementVarianceUpdated(uint256 varianceBPS);

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

    // ========== Governance Controls (Q2) ==========

    function freezeRequest(address vault, uint256 requestId) external;

    /// @dev Cancel a PENDING, FROZEN, or expired-READY request; returns shares + fee to investor
    function governanceCancelRequest(address vault, uint256 requestId) external;

    /// @dev For off-chain Treasury settlements: burns/releases escrowed shares to vault, marks EXPIRED
    function governanceReleaseExpiredToVault(address vault, uint256 requestId) external;

    function cancelFrozenRequest(address vault, uint256 requestId) external;

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

    /// @dev Q3 — returns NAV per share (1e18-scaled) for a vault using the configured oracle
    function getWeightedNAV(address vault) external view returns (uint256);

    // ========== Configuration ==========

    function setVaultRegistry(address registry) external;
    function setIdentityRegistry(address registry) external;
    function setAssetRegistry(address registry) external;

    /// @dev Q1 — set ownership sync manager for BOR updates after redemption
    function setOwnershipSyncManager(address syncManager) external;

    /// @dev Q3 — configure the NAV oracle and settlement variance tolerance
    function setNavOracle(address oracle) external;
    function setSettlementVarianceBPS(uint256 bps) external;

    // ========== State Readers ==========

    function vaultRegistry() external view returns (address);
    function identityRegistry() external view returns (address);
    function ownershipSyncManager() external view returns (address);
    function navOracle() external view returns (address);
    function settlementVarianceBPS() external view returns (uint256);

    // ========== Constants ==========

    function BASIS_POINTS() external view returns (uint256);
    function DEFAULT_GATE_PERCENTAGE() external view returns (uint256);
    function DEFAULT_PERIOD_DURATION() external view returns (uint256);
    function DEFAULT_CLAIM_PERIOD() external view returns (uint256);

    // ========== Exit Management ==========

    function lockVaultForExit(address vault) external;
    function markDisbursed(address vault, uint256 requestId, bytes32 txRef) external;
}
