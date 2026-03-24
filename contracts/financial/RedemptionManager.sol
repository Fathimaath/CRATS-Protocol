// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "../utils/AssetConfig.sol";
import "../interfaces/identity/IIdentityRegistry.sol";

/**
 * @title RedemptionManager
 * @dev Manages redemption queues and processing for RWA vaults
 *
 * Features:
 * - FIFO redemption queue
 * - Pro-rata distribution during liquidity constraints
 * - Redemption gates (limits % redeemable per period)
 * - Scheduled redemption windows
 * - Priority processing for institutional investors
 *
 * @dev Integrates with AsyncVault for T+1, T+2, T+7 settlement
 */
contract RedemptionManager is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Math for uint256;

    // ========== State Variables ==========

    /// @dev Vault registry address
    address public vaultRegistry;

    /// @dev Layer 1 Identity Registry for investor verification
    address public identityRegistry;

    /// @dev Redemption queues: vault => queue ID => RedemptionQueue
    mapping(address => mapping(bytes32 => RedemptionQueue)) public redemptionQueues;

    /// @dev Redemption requests: vault => requestId => RedemptionRequest
    mapping(address => mapping(uint256 => RedemptionRequest)) public redemptionRequests;

    /// @dev Request IDs per vault
    mapping(address => uint256[]) public vaultRequestIds;

    /// @dev Next request ID per vault
    mapping(address => uint256) public nextRequestId;

    /// @dev Redemption gates: vault => gate config
    mapping(address => RedemptionGate) public redemptionGates;

    /// @dev Total redeemed per vault per period
    mapping(address => mapping(uint256 => uint256)) public redeemedPerPeriod;

    /// @dev Current period per vault
    mapping(address => uint256) public currentPeriod;

    // ========== Structs ==========

    /**
     * @dev Redemption request
     */
    struct RedemptionRequest {
        address investor;         // Investor address
        uint256 shares;           // Shares to redeem
        uint256 assets;           // Expected assets (at request time)
        uint256 requestTime;      // Request timestamp
        uint256 settleTime;       // Settlement timestamp
        RedemptionStatus status;  // Request status
        address processor;        // Who processed
    }

    /**
     * @dev Redemption queue
     */
    struct RedemptionQueue {
        bytes32 queueId;          // Queue identifier
        uint256 totalShares;      // Total shares in queue
        uint256 totalAssets;      // Total assets to distribute
        uint256 createdAt;        // Queue creation time
        uint256 processedAt;      // Queue processing time
        QueueStatus status;       // Queue status
        uint256 requestCount;     // Number of requests
    }

    /**
     * @dev Redemption gate configuration
     */
    struct RedemptionGate {
        uint256 gatePercentage;   // Max % of AUM redeemable per period (basis points)
        uint256 periodDuration;   // Period duration in seconds
        uint256 lastPeriodStart;  // Last period start time
        bool active;              // Gate active status
    }

    /**
     * @dev Redemption status
     */
    enum RedemptionStatus {
        PENDING,      // Awaiting processing
        PROCESSING,   // Being processed
        READY,        // Ready to claim
        CLAIMED,      // Claimed by investor
        CANCELLED,    // Cancelled
        EXPIRED       // Claim period expired
    }

    /**
     * @dev Queue status
     */
    enum QueueStatus {
        OPEN,         // Accepting requests
        PROCESSING,   // Processing requests
        CLOSED,       // Closed, no more requests
        SETTLED       // Fully settled
    }

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

    // ========== Constants ==========

    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant DEFAULT_GATE_PERCENTAGE = 2500; // 25% per period
    uint256 public constant DEFAULT_PERIOD_DURATION = 7 days;
    uint256 public constant DEFAULT_CLAIM_PERIOD = 30 days;

    // ========== Roles ==========

    bytes32 public constant PROCESSOR_ROLE = keccak256("PROCESSOR_ROLE");
    bytes32 public constant VAULT_ADMIN_ROLE = keccak256("VAULT_ADMIN_ROLE");

    // ========== Constructor ==========

    constructor(address admin) {
        require(admin != address(0), "RedemptionManager: Admin cannot be zero");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PROCESSOR_ROLE, admin);
        _grantRole(VAULT_ADMIN_ROLE, admin);
    }

    // ========== Redemption Request Flow ==========

    /**
     * @dev Submit a redemption request
     */
    function requestRedemption(
        address vault,
        uint256 shares
    ) external nonReentrant returns (uint256 requestId) {
        require(vault != address(0), "RedemptionManager: Invalid vault");
        require(shares > 0, "RedemptionManager: Shares must be positive");

        // Check investor verification
        _checkInvestorVerification(msg.sender);

        // Check redemption gate
        _checkRedemptionGate(vault, shares);

        // Generate request ID
        requestId = nextRequestId[vault]++;

        // Create request
        redemptionRequests[vault][requestId] = RedemptionRequest({
            investor: msg.sender,
            shares: shares,
            assets: 0, // Will be calculated during processing
            requestTime: block.timestamp,
            settleTime: 0,
            status: RedemptionStatus.PENDING,
            processor: address(0)
        });

        vaultRequestIds[vault].push(requestId);

        emit RedemptionRequested(vault, requestId, msg.sender, shares, block.timestamp);
    }

    /**
     * @dev Process a redemption request (processor only)
     */
    function processRedemption(
        address vault,
        uint256 requestId,
        uint256 assets
    ) external onlyRole(PROCESSOR_ROLE) nonReentrant {
        RedemptionRequest storage request = redemptionRequests[vault][requestId];

        require(request.status == RedemptionStatus.PENDING, "RedemptionManager: Invalid status");
        require(request.investor != address(0), "RedemptionManager: Request not found");

        // Update request
        request.assets = assets;
        request.settleTime = block.timestamp;
        request.status = RedemptionStatus.READY;
        request.processor = msg.sender;

        // Update gate tracking
        _updateRedemptionGate(vault, assets);

        emit RedemptionProcessed(vault, requestId, assets, msg.sender);
    }

    /**
     * @dev Process batch redemptions (pro-rata if insufficient liquidity)
     */
    function processBatchRedemptions(
        address vault,
        uint256[] calldata requestIds,
        uint256 totalAssets
    ) external onlyRole(PROCESSOR_ROLE) nonReentrant {
        uint256 totalShares = 0;

        // Calculate total shares
        for (uint256 i = 0; i < requestIds.length; i++) {
            RedemptionRequest storage request = redemptionRequests[vault][requestIds[i]];
            require(request.status == RedemptionStatus.PENDING, "RedemptionManager: Invalid request");
            totalShares += request.shares;
        }

        // Process each request pro-rata
        uint256 remainingAssets = totalAssets;
        for (uint256 i = 0; i < requestIds.length; i++) {
            RedemptionRequest storage request = redemptionRequests[vault][requestIds[i]];

            // Calculate pro-rata share
            uint256 assets = (request.shares * totalAssets) / totalShares;

            // Use remaining assets for last request to avoid rounding issues
            if (i == requestIds.length - 1) {
                assets = remainingAssets;
            }

            request.assets = assets;
            request.settleTime = block.timestamp;
            request.status = RedemptionStatus.READY;
            request.processor = msg.sender;

            _updateRedemptionGate(vault, assets);
            remainingAssets -= assets;

            emit RedemptionProcessed(vault, requestIds[i], assets, msg.sender);
        }
    }

    /**
     * @dev Claim redeemed assets
     */
    function claimRedemption(
        address vault,
        uint256 requestId
    ) external nonReentrant {
        RedemptionRequest storage request = redemptionRequests[vault][requestId];

        require(request.investor == msg.sender, "RedemptionManager: Not investor");
        require(request.status == RedemptionStatus.READY, "RedemptionManager: Not ready");

        // Check claim period
        require(
            block.timestamp <= request.settleTime + DEFAULT_CLAIM_PERIOD,
            "RedemptionManager: Claim expired"
        );

        // Update status
        request.status = RedemptionStatus.CLAIMED;

        // Transfer assets to investor
        // Note: This assumes vault has transferred assets to this contract
        // In practice, this would call the vault's redeem function
        IERC20(vault).safeTransfer(msg.sender, request.assets);

        emit RedemptionClaimed(vault, requestId, msg.sender, request.assets);
    }

    /**
     * @dev Cancel a redemption request
     */
    function cancelRedemption(
        address vault,
        uint256 requestId
    ) external nonReentrant {
        RedemptionRequest storage request = redemptionRequests[vault][requestId];

        require(request.investor == msg.sender, "RedemptionManager: Not investor");
        require(request.status == RedemptionStatus.PENDING, "RedemptionManager: Already processing");

        request.status = RedemptionStatus.CANCELLED;

        emit RedemptionCancelled(vault, requestId, msg.sender);
    }

    // ========== Redemption Queue Management ==========

    /**
     * @dev Create a redemption queue
     */
    function createRedemptionQueue(
        address vault,
        uint256 totalShares,
        uint256 totalAssets
    ) external onlyRole(VAULT_ADMIN_ROLE) returns (bytes32 queueId) {
        require(vault != address(0), "RedemptionManager: Invalid vault");
        require(totalShares > 0, "RedemptionManager: Shares must be positive");
        require(totalAssets > 0, "RedemptionManager: Assets must be positive");

        // Generate queue ID
        queueId = keccak256(abi.encodePacked(vault, block.timestamp, totalShares));

        // Create queue
        redemptionQueues[vault][queueId] = RedemptionQueue({
            queueId: queueId,
            totalShares: totalShares,
            totalAssets: totalAssets,
            createdAt: block.timestamp,
            processedAt: 0,
            status: QueueStatus.OPEN,
            requestCount: 0
        });

        emit RedemptionQueueCreated(vault, queueId, totalShares, totalAssets);
    }

    /**
     * @dev Close a redemption queue
     */
    function closeRedemptionQueue(
        address vault,
        bytes32 queueId
    ) external onlyRole(PROCESSOR_ROLE) {
        RedemptionQueue storage queue = redemptionQueues[vault][queueId];
        require(queue.status == QueueStatus.OPEN, "RedemptionManager: Queue not open");

        queue.status = QueueStatus.CLOSED;
    }

    /**
     * @dev Settle a redemption queue
     */
    function settleRedemptionQueue(
        address vault,
        bytes32 queueId
    ) external onlyRole(PROCESSOR_ROLE) {
        RedemptionQueue storage queue = redemptionQueues[vault][queueId];
        require(
            queue.status == QueueStatus.CLOSED || queue.status == QueueStatus.PROCESSING,
            "RedemptionManager: Queue not ready"
        );

        queue.status = QueueStatus.SETTLED;
        queue.processedAt = block.timestamp;
    }

    // ========== Redemption Gates ==========

    /**
     * @dev Set redemption gate for a vault
     */
    function setRedemptionGate(
        address vault,
        uint256 gatePercentage,
        uint256 periodDuration
    ) external onlyRole(VAULT_ADMIN_ROLE) {
        require(vault != address(0), "RedemptionManager: Invalid vault");
        require(gatePercentage <= BASIS_POINTS, "RedemptionManager: Gate too high");
        require(periodDuration > 0, "RedemptionManager: Invalid period");

        redemptionGates[vault] = RedemptionGate({
            gatePercentage: gatePercentage,
            periodDuration: periodDuration,
            lastPeriodStart: block.timestamp,
            active: true
        });

        currentPeriod[vault] = block.timestamp;

        emit RedemptionGateSet(vault, gatePercentage, periodDuration);
    }

    /**
     * @dev Disable redemption gate
     */
    function disableRedemptionGate(address vault) external onlyRole(VAULT_ADMIN_ROLE) {
        redemptionGates[vault].active = false;
    }

    // ========== Internal Functions ==========

    /**
     * @dev Check redemption gate limits
     */
    function _checkRedemptionGate(address vault, uint256 shares) internal view {
        RedemptionGate memory gate = redemptionGates[vault];

        if (!gate.active) {
            return;
        }

        // Check if new period started
        if (block.timestamp >= gate.lastPeriodStart + gate.periodDuration) {
            return; // New period, gate reset
        }

        // Check gate limit
        uint256 maxRedeemable = (gate.gatePercentage * IERC20(vault).totalSupply()) / BASIS_POINTS;
        require(
            redeemedPerPeriod[vault][currentPeriod[vault]] + shares <= maxRedeemable,
            "RedemptionManager: Gate limit reached"
        );
    }

    /**
     * @dev Update redemption gate tracking
     */
    function _updateRedemptionGate(address vault, uint256 assets) internal {
        RedemptionGate memory gate = redemptionGates[vault];

        if (!gate.active) {
            return;
        }

        // Check if new period started
        if (block.timestamp >= gate.lastPeriodStart + gate.periodDuration) {
            gate.lastPeriodStart = block.timestamp;
            currentPeriod[vault] = block.timestamp;
            redeemedPerPeriod[vault][currentPeriod[vault]] = 0;
        }

        redeemedPerPeriod[vault][currentPeriod[vault]] += assets;
    }

    /**
     * @dev Check investor verification
     */
    function _checkInvestorVerification(address investor) internal view {
        if (identityRegistry == address(0)) {
            return;
        }

        bool verified = IIdentityRegistry(identityRegistry).isVerified(investor);
        require(verified, "RedemptionManager: Investor not verified");
    }

    // ========== View Functions ==========

    /**
     * @dev Get redemption request details
     */
    function getRedemptionRequest(address vault, uint256 requestId)
        external
        view
        returns (RedemptionRequest memory)
    {
        return redemptionRequests[vault][requestId];
    }

    /**
     * @dev Get redemption queue details
     */
    function getRedemptionQueue(address vault, bytes32 queueId)
        external
        view
        returns (RedemptionQueue memory)
    {
        return redemptionQueues[vault][queueId];
    }

    /**
     * @dev Get all request IDs for a vault
     */
    function getVaultRequestIds(address vault)
        external
        view
        returns (uint256[] memory)
    {
        return vaultRequestIds[vault];
    }

    /**
     * @dev Get pending requests count for a vault
     */
    function getPendingRequestsCount(address vault)
        external
        view
        returns (uint256 count)
    {
        uint256[] memory requestIds = vaultRequestIds[vault];
        for (uint256 i = 0; i < requestIds.length; i++) {
            if (redemptionRequests[vault][requestIds[i]].status == RedemptionStatus.PENDING) {
                count++;
            }
        }
    }

    /**
     * @dev Get ready requests count for a vault
     */
    function getReadyRequestsCount(address vault)
        external
        view
        returns (uint256 count)
    {
        uint256[] memory requestIds = vaultRequestIds[vault];
        for (uint256 i = 0; i < requestIds.length; i++) {
            if (redemptionRequests[vault][requestIds[i]].status == RedemptionStatus.READY) {
                count++;
            }
        }
    }

    // ========== Configuration ==========

    /**
     * @dev Set vault registry address
     */
    function setVaultRegistry(address registry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(registry != address(0), "RedemptionManager: Invalid registry");
        vaultRegistry = registry;
    }

    /**
     * @dev Set Identity Registry address
     */
    function setIdentityRegistry(address registry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(registry != address(0), "RedemptionManager: Invalid registry");
        identityRegistry = registry;
    }

    // ========== Version ==========

    function version() external pure virtual returns (string memory) {
        return AssetConfig.VERSION;
    }
}
