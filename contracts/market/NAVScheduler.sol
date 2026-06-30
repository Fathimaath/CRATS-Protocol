// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

// ─── External Interface ───────────────────────────────────────────────────────

interface INavOracleScheduler {
    enum NAVState { FRESH, WARNING, CRITICAL, STALE }

    struct NAVSubmission {
        uint256 assetValue;
        uint256 valuationDate;
        uint256 submittedAt;
        bytes32 documentHash;
        address submitter;
        uint8   confidenceScore;
        bool    disputed;
    }

    struct AssetClassSchedule {
        uint32 maxValuationInterval; // in days
        uint32 warningThreshold;     // days before max to warn
        bool   isActive;
    }

    function getNAVState(bytes32 assetId)                    external view returns (NAVState);
    function activeSubmission(bytes32 assetId)               external view returns (NAVSubmission memory);
    function classSchedules(bytes32 assetClass)              external view returns (AssetClassSchedule memory);
    function assetClassForId(bytes32 assetId)                external view returns (bytes32);
    function enforceStalenessCircuitBreaker(bytes32 assetId) external;
    function setAssetClassSchedule(bytes32 assetClass, AssetClassSchedule calldata schedule) external;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * @title NAVScheduler
 * @notice v1.0.0 — Keeper contract enforcing per-asset-class NAV update frequency.
 *
 * Implements Chainlink Automation compatible interface for automatic upkeep.
 *
 * Default Schedule Table:
 * ┌─────────────────┬────────────────┬───────────────┐
 * │ Asset Class     │ Max Interval   │ Valuation     │
 * ├─────────────────┼────────────────┼───────────────┤
 * │ REAL_ESTATE     │ 90 days        │ Appraisal     │
 * │ CORPORATE_BOND  │ 1 day          │ Price Update  │
 * │ PRIVATE_CREDIT  │ 30 days        │ DCF Model     │
 * │ FINE_ART        │ 365 days       │ Appraisal     │
 * └─────────────────┴────────────────┴───────────────┘
 *
 * NAVState Gate:
 *   FRESH    (<7d)   → no action
 *   WARNING  (7-14d) → emit NAVWarningEmitted
 *   CRITICAL (14-30d)→ emit NAVWarningEmitted (deposits already blocked by NAVOracle)
 *   STALE    (>30d)  → emit CircuitBreakerEnforced + call enforceStalenessCircuitBreaker
 *
 * To register with Chainlink Automation (Sepolia):
 *   1. Deploy this contract
 *   2. Go to automation.chain.link → Register new upkeep → Custom Logic
 *   3. Set target = this contract address
 *   4. Fund with LINK on Sepolia
 *   5. Call registerAsset(bytes32) for each asset to monitor
 */
contract NAVScheduler is
    Initializable,
    UUPSUpgradeable,
    AccessControlUpgradeable
{
    string public constant VERSION = "1.0.0";

    // ─── Roles ───────────────────────────────────────────────
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // ─── State ───────────────────────────────────────────────
    address public navOracle;

    bytes32[] public registeredAssets;
    mapping(bytes32 => bool) public isRegistered;

    // ─── Events ──────────────────────────────────────────────
    event ScheduleViolation(
        bytes32 indexed assetId,
        bytes32 indexed assetClass,
        uint256 daysSinceLastValuation,
        uint256 maxAllowedDays
    );
    event NAVWarningEmitted(
        bytes32 indexed assetId,
        INavOracleScheduler.NAVState state,
        uint256 daysSinceLastValuation
    );
    event CircuitBreakerEnforced(bytes32 indexed assetId);
    event AssetRegistered(bytes32 indexed assetId);
    event AssetDeregistered(bytes32 indexed assetId);
    event SchedulesInitialized();

    // ─── Initialize ──────────────────────────────────────────
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _navOracle,
        address _admin
    ) public initializer {
        require(_navOracle != address(0), "NAVScheduler: zero navOracle");
        require(_admin != address(0),     "NAVScheduler: zero admin");

        __UUPSUpgradeable_init();
        __AccessControl_init();

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(OPERATOR_ROLE,      _admin);
        _grantRole(UPGRADER_ROLE,      _admin);

        navOracle = _navOracle;
    }

    // ═══════════════════════════════════════════════════════════
    // SECTION 1: CHAINLINK AUTOMATION INTERFACE
    // ═══════════════════════════════════════════════════════════

    /**
     * @notice Called off-chain by Chainlink nodes every block to check if upkeep is needed.
     * @param checkData  Empty bytes for full batch scan, or abi.encode(bytes32 assetId) for single.
     * @return upkeepNeeded True when at least one asset needs flagging.
     * @return performData  ABI-encoded bytes32[] of asset IDs that need action.
     */
    function checkUpkeep(bytes calldata checkData)
        external
        view
        returns (bool upkeepNeeded, bytes memory performData)
    {
        bytes32[] memory needsAction = new bytes32[](registeredAssets.length);
        uint256 count;

        if (checkData.length == 32) {
            bytes32 singleId = abi.decode(checkData, (bytes32));
            if (_needsAction(singleId)) {
                needsAction[0] = singleId;
                count = 1;
            }
        } else {
            for (uint256 i = 0; i < registeredAssets.length; i++) {
                if (_needsAction(registeredAssets[i])) {
                    needsAction[count] = registeredAssets[i];
                    count++;
                }
            }
        }

        if (count > 0) {
            bytes32[] memory trimmed = new bytes32[](count);
            for (uint256 i = 0; i < count; i++) {
                trimmed[i] = needsAction[i];
            }
            upkeepNeeded = true;
            performData  = abi.encode(trimmed);
        }
    }

    /**
     * @notice Called on-chain by Chainlink nodes when checkUpkeep returns true.
     * @param performData ABI-encoded bytes32[] of asset IDs to process.
     */
    function performUpkeep(bytes calldata performData) external {
        bytes32[] memory assetIds = abi.decode(performData, (bytes32[]));
        for (uint256 i = 0; i < assetIds.length; i++) {
            _checkAndFlag(assetIds[i]);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // SECTION 2: MANUAL CHECK (callable by anyone)
    // ═══════════════════════════════════════════════════════════

    /// @notice Manually check and flag a single asset. Anyone can call this.
    function checkAndFlag(bytes32 assetId) external {
        _checkAndFlag(assetId);
    }

    /// @notice Batch check multiple assets manually.
    function batchCheck(bytes32[] calldata assetIds) external {
        for (uint256 i = 0; i < assetIds.length; i++) {
            _checkAndFlag(assetIds[i]);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // SECTION 3: INTERNAL LOGIC
    // ═══════════════════════════════════════════════════════════

    function _needsAction(bytes32 assetId) internal view returns (bool) {
        INavOracleScheduler oracle = INavOracleScheduler(navOracle);
        INavOracleScheduler.NAVSubmission memory sub = oracle.activeSubmission(assetId);
        if (sub.submittedAt == 0) return false;

        INavOracleScheduler.NAVState state = oracle.getNAVState(assetId);
        if (state != INavOracleScheduler.NAVState.FRESH) return true;

        bytes32 assetClass = oracle.assetClassForId(assetId);
        if (assetClass == bytes32(0)) return false;

        INavOracleScheduler.AssetClassSchedule memory sched = oracle.classSchedules(assetClass);
        if (!sched.isActive) return false;

        uint256 daysSince = (block.timestamp - sub.submittedAt) / 1 days;
        return daysSince >= uint256(sched.maxValuationInterval);
    }

    function _checkAndFlag(bytes32 assetId) internal {
        INavOracleScheduler oracle = INavOracleScheduler(navOracle);
        INavOracleScheduler.NAVSubmission memory sub = oracle.activeSubmission(assetId);
        if (sub.submittedAt == 0) return;

        uint256 daysSince = (block.timestamp - sub.submittedAt) / 1 days;
        INavOracleScheduler.NAVState state = oracle.getNAVState(assetId);

        // NAVState gate
        if (state == INavOracleScheduler.NAVState.WARNING ||
            state == INavOracleScheduler.NAVState.CRITICAL)
        {
            emit NAVWarningEmitted(assetId, state, daysSince);
        }

        if (state == INavOracleScheduler.NAVState.STALE) {
            try oracle.enforceStalenessCircuitBreaker(assetId) {
                emit CircuitBreakerEnforced(assetId);
            } catch {
                emit CircuitBreakerEnforced(assetId);
            }
        }

        // Schedule violation check
        bytes32 assetClass = oracle.assetClassForId(assetId);
        if (assetClass == bytes32(0)) return;

        INavOracleScheduler.AssetClassSchedule memory sched = oracle.classSchedules(assetClass);
        if (!sched.isActive) return;

        uint256 maxDays = uint256(sched.maxValuationInterval);
        if (daysSince >= maxDays) {
            emit ScheduleViolation(assetId, assetClass, daysSince, maxDays);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // SECTION 4: ASSET REGISTRY
    // ═══════════════════════════════════════════════════════════

    function registerAsset(bytes32 assetId) external onlyRole(OPERATOR_ROLE) {
        require(!isRegistered[assetId], "NAVScheduler: already registered");
        isRegistered[assetId] = true;
        registeredAssets.push(assetId);
        emit AssetRegistered(assetId);
    }

    function registerAssetBatch(bytes32[] calldata assetIds) external onlyRole(OPERATOR_ROLE) {
        for (uint256 i = 0; i < assetIds.length; i++) {
            if (!isRegistered[assetIds[i]]) {
                isRegistered[assetIds[i]] = true;
                registeredAssets.push(assetIds[i]);
                emit AssetRegistered(assetIds[i]);
            }
        }
    }

    function deregisterAsset(bytes32 assetId) external onlyRole(OPERATOR_ROLE) {
        require(isRegistered[assetId], "NAVScheduler: not registered");
        isRegistered[assetId] = false;
        uint256 len = registeredAssets.length;
        for (uint256 i = 0; i < len; i++) {
            if (registeredAssets[i] == assetId) {
                registeredAssets[i] = registeredAssets[len - 1];
                registeredAssets.pop();
                break;
            }
        }
        emit AssetDeregistered(assetId);
    }

    // ═══════════════════════════════════════════════════════════
    // SECTION 5: SCHEDULE INITIALIZATION HELPER
    // ═══════════════════════════════════════════════════════════

    /**
     * @notice Push default schedules for all 4 asset classes into NAVOracle.
     *         Requires this contract to have DEFAULT_ADMIN_ROLE on NAVOracle.
     *
     *   REAL_ESTATE     → 90 days,  warn at 75d
     *   CORPORATE_BOND  → 1 day,    warn at 1d
     *   PRIVATE_CREDIT  → 30 days,  warn at 25d
     *   FINE_ART        → 365 days, warn at 330d
     */
    function initializeDefaultSchedules() external onlyRole(DEFAULT_ADMIN_ROLE) {
        INavOracleScheduler oracle = INavOracleScheduler(navOracle);

        oracle.setAssetClassSchedule(
            keccak256("REAL_ESTATE"),
            INavOracleScheduler.AssetClassSchedule({
                maxValuationInterval: 90,
                warningThreshold:     75,
                isActive:             true
            })
        );

        oracle.setAssetClassSchedule(
            keccak256("CORPORATE_BOND"),
            INavOracleScheduler.AssetClassSchedule({
                maxValuationInterval: 1,
                warningThreshold:     1,
                isActive:             true
            })
        );

        oracle.setAssetClassSchedule(
            keccak256("PRIVATE_CREDIT"),
            INavOracleScheduler.AssetClassSchedule({
                maxValuationInterval: 30,
                warningThreshold:     25,
                isActive:             true
            })
        );

        oracle.setAssetClassSchedule(
            keccak256("FINE_ART"),
            INavOracleScheduler.AssetClassSchedule({
                maxValuationInterval: 365,
                warningThreshold:     330,
                isActive:             true
            })
        );

        emit SchedulesInitialized();
    }

    // ═══════════════════════════════════════════════════════════
    // SECTION 6: VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════

    function getAssetScheduleStatus(bytes32 assetId)
        external
        view
        returns (
            INavOracleScheduler.NAVState navState,
            bytes32 assetClass,
            uint256 daysSinceLastValuation,
            uint256 maxIntervalDays,
            bool    scheduleViolated,
            bool    circuitBreakerNeeded
        )
    {
        INavOracleScheduler oracle = INavOracleScheduler(navOracle);
        INavOracleScheduler.NAVSubmission memory sub = oracle.activeSubmission(assetId);

        navState   = oracle.getNAVState(assetId);
        assetClass = oracle.assetClassForId(assetId);

        if (sub.submittedAt > 0) {
            daysSinceLastValuation = (block.timestamp - sub.submittedAt) / 1 days;
        }

        if (assetClass != bytes32(0)) {
            INavOracleScheduler.AssetClassSchedule memory sched = oracle.classSchedules(assetClass);
            maxIntervalDays  = uint256(sched.maxValuationInterval);
            scheduleViolated = sched.isActive && daysSinceLastValuation >= maxIntervalDays;
        }

        circuitBreakerNeeded = (navState == INavOracleScheduler.NAVState.STALE);
    }

    function getRegisteredAssets() external view returns (bytes32[] memory) {
        return registeredAssets;
    }

    function _authorizeUpgrade(address) internal override onlyRole(UPGRADER_ROLE) {}

    // ─── Storage Gap ─────────────────────────────────────────
    uint256[50] private __gap;
}
