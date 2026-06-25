// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../interfaces/financial/IFeeEngine.sol";
import "../interfaces/vault/ISyncVault.sol";

interface IAssetFactoryWithAssets {
    function assets(address token) external view returns (address, address, bytes32, uint256);
}

contract NAVOracle is
    Initializable,
    UUPSUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable
{
    using ECDSA for bytes32;
    using SafeCast for uint256;
    using SafeERC20 for IERC20;

    bytes32 public constant VALUER_ROLE   = keccak256("VALUER_ROLE");
    bytes32 public constant RESOLVER_ROLE = keccak256("RESOLVER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    uint256 public constant BPS_DENOMINATOR         = 10_000;
    uint256 public constant DEVIATION_THRESHOLD_BPS  = 1500;
    uint256 public constant CHALLENGE_DEADLINE       = 7 days;
    uint256 public constant FRESH_THRESHOLD          = 7 days;
    uint256 public constant WARNING_THRESHOLD        = 14 days;
    uint256 public constant CRITICAL_THRESHOLD       = 30 days;

    // ─── Enums ───────────────────────────────────────────────
    enum ValuationMethod {
        FULL_APPRAISAL, DESKTOP_APPRAISAL, DCF_MODEL,
        MARKET_COMPARABLE, AUDIT_VERIFIED, INCOME_STATEMENT
    }
    enum NAVState { FRESH, WARNING, CRITICAL, STALE }
    enum DisputeStatus { NONE, OPEN, RESOLVED, EXPIRED }

    // ─── Structs ────────────────────────────────────────────
    struct NAVSubmission {
        uint256        assetValue;
        uint256        valuationDate;
        uint256        submittedAt;
        bytes32        documentHash;
        address        submitter;
        ValuationMethod method;
        uint8          confidenceScore;
        bool           disputed;
    }

    struct WeightConfig {
        uint16 appraisalWeight; uint16 dcfWeight;
        uint16 incomeWeight; uint16 compWeight;
        uint32 appraisalMaxAge; uint32 dcfMaxAge;
        uint32 incomeMaxAge; uint32 compMaxAge;
    }

    struct DisputeRecord {
        uint256        submissionIndex;
        uint256        openedAt;
        uint256        deadline;
        uint256        challengerValue;
        bytes32        challengerEvidence;
        address        challenger;
        DisputeStatus  status;
    }

    struct ChallengeStake {
        address challenger;
        uint256 amount;
        bool    refunded;
    }

    struct AssetClassSchedule {
        uint32 maxValuationInterval;
        uint32 warningThreshold;
        bool   isActive;
    }

    // ─── State ───────────────────────────────────────────────
    address public feeEngine;
    IERC20 public usdc;
    address public protocolTreasury;
    address public insuranceReserve;
    address public assetFactory;

    uint256 public challengeStakeAmount;

    mapping(bytes32 => NAVSubmission)               public activeSubmission;
    mapping(bytes32 => NAVSubmission[])             public submissionHistory;
    mapping(bytes32 => mapping(ValuationMethod => NAVSubmission)) public latestByMethod;
    mapping(bytes32 => mapping(ValuationMethod => bool))         public hasSubmission;

    mapping(bytes32 => WeightConfig)                public weightConfigs;
    mapping(bytes32 => address)                      public vaultAddress;
    mapping(bytes32 => bytes32)                      public assetToVaultId;
    mapping(bytes32 => bytes32)                      public vaultIdToAsset;

    mapping(bytes32 => DisputeRecord)               public disputes;
    mapping(bytes32 => ChallengeStake)              public challengeStakes;
    mapping(bytes32 => bool)                        public activeDispute;

    mapping(bytes32 => uint256)                     public pendingRedemptions;

    mapping(bytes32 => AssetClassSchedule)          public classSchedules;
    mapping(bytes32 => bytes32)                      public assetClassForId;

    // ─── Initialize ──────────────────────────────────────────
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _feeEngine, address _admin)
        public
        initializer
    {
        __UUPSUpgradeable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(VALUER_ROLE, _admin);
        _grantRole(RESOLVER_ROLE, _admin);
        _grantRole(UPGRADER_ROLE, _admin);

        feeEngine = _feeEngine;
    }

    function _authorizeUpgrade(address)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}

    // ═══════════════════════════════════════════════════════════
    // SECTION 1: NAV SUBMISSION
    // ═══════════════════════════════════════════════════════════

    function submitNAV(
        bytes32 assetId,
        uint256 assetValue,
        uint256 valuationDate,
        bytes32 documentHash,
        ValuationMethod method
    ) external onlyRole(VALUER_ROLE) whenNotPaused {
        if (activeSubmission[assetId].assetValue > 0) {
            uint256 deviation = Math.max(assetValue, activeSubmission[assetId].assetValue)
                - Math.min(assetValue, activeSubmission[assetId].assetValue);
            deviation = deviation * BPS_DENOMINATOR / activeSubmission[assetId].assetValue;
            if (deviation > DEVIATION_THRESHOLD_BPS) {
                emit SubmissionFlaggedForReview(
                    assetId,
                    submissionHistory[assetId].length,
                    deviation
                );
            }
        }

        NAVSubmission memory sub = NAVSubmission({
            assetValue:      assetValue,
            valuationDate:   valuationDate,
            submittedAt:     block.timestamp,
            documentHash:    documentHash,
            submitter:       msg.sender,
            method:          method,
            confidenceScore: _confidenceByMethod(method),
            disputed:        false
        });

        submissionHistory[assetId].push(sub);
        latestByMethod[assetId][method] = sub;
        hasSubmission[assetId][method]  = true;
        activeSubmission[assetId]       = sub;

        emit NAVSubmitted(assetId, assetValue, method, msg.sender, false);
    }

    // ═══════════════════════════════════════════════════════════
    // SECTION 2: WEIGHTED NAV AGGREGATION
    // ═══════════════════════════════════════════════════════════

    function getWeightedNAV(bytes32 assetId)
        public
        view
        returns (uint256)
    {
        WeightConfig storage cfg = weightConfigs[assetId];
        uint256 weightedSum;
        uint256 totalWeight;

        if (_getSourceAge(assetId, ValuationMethod.FULL_APPRAISAL) <= cfg.appraisalMaxAge) {
            weightedSum += _getSourceValue(assetId, ValuationMethod.FULL_APPRAISAL) * cfg.appraisalWeight;
            totalWeight += cfg.appraisalWeight;
        } else {
            revert("Appraisal stale - trading halted");
        }

        uint256 dcfAge = _getSourceAge(assetId, ValuationMethod.DCF_MODEL);
        if (dcfAge <= cfg.dcfMaxAge) {
            uint256 w = dcfAge > cfg.dcfMaxAge / 2 ? cfg.dcfWeight / 2 : cfg.dcfWeight;
            weightedSum += _getSourceValue(assetId, ValuationMethod.DCF_MODEL) * w;
            totalWeight += w;
        }

        uint256 incomeAge = _getSourceAge(assetId, ValuationMethod.INCOME_STATEMENT);
        if (incomeAge <= cfg.incomeMaxAge) {
            uint256 w = incomeAge > cfg.incomeMaxAge / 2 ? cfg.incomeWeight / 2 : cfg.incomeWeight;
            weightedSum += _getSourceValue(assetId, ValuationMethod.INCOME_STATEMENT) * w;
            totalWeight += w;
        }

        uint256 compAge = _getSourceAge(assetId, ValuationMethod.MARKET_COMPARABLE);
        if (compAge <= cfg.compMaxAge) {
            uint256 w = compAge > cfg.compMaxAge / 2 ? cfg.compWeight / 2 : cfg.compWeight;
            weightedSum += _getSourceValue(assetId, ValuationMethod.MARKET_COMPARABLE) * w;
            totalWeight += w;
        }

        require(totalWeight > 0, "No valid NAV sources");
        return weightedSum / totalWeight;
    }

    // ═══════════════════════════════════════════════════════════
    // SECTION 3: COMPLETE NAV FORMULA
    // ═══════════════════════════════════════════════════════════

    function calculateNAV(bytes32 vaultId)
        external
        view
        returns (
            uint256 navPerShare,
            uint256 totalAssets,
            uint256 totalLiabilities,
            NAVState state
        )
    {
        address vault = vaultAddress[vaultId];
        require(vault != address(0), "Vault not registered");

        bytes32 assetId = vaultIdToAsset[vaultId];

        uint256 rwaValue = ISyncVault(vault).totalAssets() * getWeightedNAV(assetId) / 1e18;
        uint256 usdcBal = usdc.balanceOf(vault);
        totalAssets = rwaValue + usdcBal;

        uint256 totalSupply = IERC20(vault).totalSupply();
        uint256 mgmtFee = IFeeEngine(feeEngine).accruedManagementFee(vault);
        uint256 navPerShareRaw = totalAssets * 1e18 / totalSupply;
        uint256 perfFee = IFeeEngine(feeEngine).calculatePerformanceFee(
            vault,
            uint256(navPerShareRaw.toUint128()),
            totalSupply
        );
        uint256 redemptionReserve = pendingRedemptions[assetId];
        totalLiabilities = mgmtFee + perfFee + redemptionReserve;

        uint256 netNAV = totalAssets > totalLiabilities
            ? totalAssets - totalLiabilities
            : 0;

        navPerShare = totalSupply > 0
            ? netNAV * 1e18 / totalSupply
            : 0;

        state = getNAVState(assetId);
    }

    // ═══════════════════════════════════════════════════════════
    // SECTION 4: STALENESS DETECTION
    // ═══════════════════════════════════════════════════════════

    function getNAVState(bytes32 assetId)
        public
        view
        returns (NAVState)
    {
        if (activeSubmission[assetId].submittedAt == 0) return NAVState.STALE;

        uint256 age = block.timestamp - activeSubmission[assetId].submittedAt;

        if (age < FRESH_THRESHOLD)    return NAVState.FRESH;
        if (age < WARNING_THRESHOLD)  return NAVState.WARNING;
        if (age < CRITICAL_THRESHOLD) return NAVState.CRITICAL;

        return NAVState.STALE;
    }

    function assertDepositAllowed(bytes32 assetId)
        external
        view
    {
        NAVState state = getNAVState(assetId);
        require(
            state == NAVState.FRESH || state == NAVState.WARNING,
            "Deposits restricted: NAV not current"
        );
        require(!activeDispute[assetId], "Deposits restricted: NAV under dispute");

        (bool compliant, ) = checkScheduleCompliance(assetId);
        require(compliant, "Deposits restricted: Valuation schedule exceeded");
    }

    function assertRedemptionAllowed(bytes32)
        external
        pure
    {}

    function enforceStalenessCircuitBreaker(bytes32 assetId)
        external
    {
        bytes32 vaultId = assetToVaultId[assetId];
        require(vaultAddress[vaultId] != address(0), "Asset not registered");
        require(activeSubmission[assetId].submittedAt != 0, "No submission exists");

        if (getNAVState(assetId) == NAVState.STALE) {
            _pause();
            emit CircuitBreakerTriggered(assetId);
        }
    }

    function getNAVStateWithWarning(bytes32 assetId)
        external
        view
        returns (NAVState state, bool shouldWarn)
    {
        state = getNAVState(assetId);
        shouldWarn = (state == NAVState.WARNING
            || state == NAVState.CRITICAL
            || state == NAVState.STALE);
    }

    // ═══════════════════════════════════════════════════════════
    // SECTION 5: DISPUTE RESOLUTION
    // ═══════════════════════════════════════════════════════════

    function fileChallenge(
        bytes32 assetId,
        uint256 challengerValue,
        bytes32 evidenceHash,
        bytes calldata signature
    ) external whenNotPaused {
        require(!activeDispute[assetId], "Dispute already open");
        require(challengeStakeAmount > 0, "Stake not configured");

        address signer = MessageHashUtils.toEthSignedMessageHash(evidenceHash).recover(signature);
        require(signer == msg.sender, "Invalid evidence sig");

        usdc.safeTransferFrom(msg.sender, address(this), challengeStakeAmount);

        disputes[assetId] = DisputeRecord({
            challenger:         msg.sender,
            challengerValue:    challengerValue,
            challengerEvidence: evidenceHash,
            openedAt:           block.timestamp,
            deadline:           block.timestamp + CHALLENGE_DEADLINE,
            submissionIndex:    submissionHistory[assetId].length - 1,
            status:             DisputeStatus.OPEN
        });

        challengeStakes[assetId] = ChallengeStake({
            challenger: msg.sender,
            amount:     challengeStakeAmount,
            refunded:   false
        });

        activeDispute[assetId] = true;
        activeSubmission[assetId].disputed = true;

        emit DisputeOpened(assetId, msg.sender, challengerValue);
    }

    function resolveDispute(
        bytes32 assetId,
        uint256 resolvedValue,
        bytes32
    ) external onlyRole(RESOLVER_ROLE) whenNotPaused {
        DisputeRecord storage d = disputes[assetId];
        ChallengeStake storage stake = challengeStakes[assetId];

        require(block.timestamp <= d.deadline, "Dispute expired");
        require(!stake.refunded, "Stake already processed");

        activeSubmission[assetId].assetValue = resolvedValue;
        activeSubmission[assetId].disputed = false;
        activeDispute[assetId] = false;

        if (resolvedValue == d.challengerValue) {
            usdc.safeTransfer(stake.challenger, stake.amount);
        } else if (insuranceReserve != address(0)) {
            usdc.safeTransfer(insuranceReserve, stake.amount);
        }

        stake.refunded = true;
        d.status = DisputeStatus.RESOLVED;

        emit DisputeResolved(assetId, resolvedValue, DisputeStatus.RESOLVED);
    }

    function expireDispute(bytes32 assetId) external {
        DisputeRecord storage d = disputes[assetId];
        ChallengeStake storage stake = challengeStakes[assetId];

        require(d.status == DisputeStatus.OPEN, "No open dispute");
        require(block.timestamp > d.deadline, "Deadline not passed");
        require(!stake.refunded, "Stake already processed");

        activeDispute[assetId] = false;
        stake.refunded = true;
        d.status = DisputeStatus.EXPIRED;

        usdc.safeTransfer(stake.challenger, stake.amount);

        emit DisputeExpired(assetId, stake.amount);
    }

    // ═══════════════════════════════════════════════════════════
    // SECTION 6: ASSET CLASS SCHEDULE ENFORCEMENT
    // ═══════════════════════════════════════════════════════════

    function setAssetClassSchedule(
        bytes32 assetClass,
        AssetClassSchedule calldata schedule
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        classSchedules[assetClass] = schedule;
        emit ScheduleUpdated(assetClass);
    }

    function setAssetClass(bytes32 assetId, bytes32 assetClass)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        assetClassForId[assetId] = assetClass;
    }

    function setAssetFactory(address _assetFactory)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        assetFactory = _assetFactory;
    }

    function checkScheduleCompliance(bytes32 assetId)
        public
        view
        returns (bool compliant, uint256 daysRemaining)
    {
        bytes32 cls = assetClassForId[assetId];
        if (cls == bytes32(0) && assetFactory != address(0)) {
            address tokenAddr = address(uint160(uint256(assetId)));
            try IAssetFactoryWithAssets(assetFactory).assets(tokenAddr) returns (address, address, bytes32 category, uint256) {
                cls = category;
            } catch {}
        }
        AssetClassSchedule storage sched = classSchedules[cls];

        if (!sched.isActive) return (true, type(uint32).max);

        uint256 ageInDays = (block.timestamp - activeSubmission[assetId].submittedAt) / 1 days;
        uint256 remaining = sched.maxValuationInterval > ageInDays
            ? sched.maxValuationInterval - ageInDays
            : 0;

        return (remaining > 0, remaining);
    }

    // ═══════════════════════════════════════════════════════════
    // SECTION 7: CONFIGURATION
    // ═══════════════════════════════════════════════════════════

    function setWeightConfig(bytes32 assetId, WeightConfig calldata cfg)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        uint256 totalWeight = uint256(cfg.appraisalWeight)
            + uint256(cfg.dcfWeight)
            + uint256(cfg.incomeWeight)
            + uint256(cfg.compWeight);

        require(totalWeight > 0, "Total weight must be > 0");
        require(cfg.appraisalWeight > 0, "Appraisal weight must be > 0");
        require(cfg.appraisalMaxAge > 0, "Appraisal max age must be > 0");

        weightConfigs[assetId] = cfg;
        emit WeightConfigSet(assetId);
    }

    function registerVault(
        bytes32 vaultId,
        address vault,
        bytes32 assetId,
        WeightConfig calldata cfg
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(vault != address(0), "Invalid vault address");

        vaultAddress[vaultId] = vault;
        assetToVaultId[assetId] = vaultId;
        vaultIdToAsset[vaultId] = assetId;

        uint256 totalWeight = uint256(cfg.appraisalWeight)
            + uint256(cfg.dcfWeight)
            + uint256(cfg.incomeWeight)
            + uint256(cfg.compWeight);
        require(totalWeight > 0, "Total weight must be > 0");
        require(cfg.appraisalWeight > 0, "Appraisal weight must be > 0");
        require(cfg.appraisalMaxAge > 0, "Appraisal max age must be > 0");

        weightConfigs[assetId] = cfg;

        emit VaultRegistered(vaultId, vault, assetId);
    }

    function setUSDC(address _usdc)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        usdc = IERC20(_usdc);
    }

    function unpause()
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        _unpause();
    }

    function setProtocolTreasury(address _treasury)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        protocolTreasury = _treasury;
    }

    function setInsuranceReserve(address _reserve)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        insuranceReserve = _reserve;
    }

    function setChallengeStakeAmount(uint256 _amount)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        challengeStakeAmount = _amount;
    }

    function setPendingRedemption(bytes32 assetId, uint256 amount)
        external
    {
        bytes32 vaultId = assetToVaultId[assetId];
        require(
            msg.sender == vaultAddress[vaultId]
            || hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Unauthorized"
        );
        pendingRedemptions[assetId] = amount;
    }

    // ═══════════════════════════════════════════════════════════
    // SECTION 8: INTERNAL HELPERS
    // ═══════════════════════════════════════════════════════════

    function _getSourceAge(bytes32 assetId, ValuationMethod method)
        internal
        view
        returns (uint256)
    {
        return block.timestamp - latestByMethod[assetId][method].submittedAt;
    }

    function _getSourceValue(bytes32 assetId, ValuationMethod method)
        internal
        view
        returns (uint256)
    {
        return latestByMethod[assetId][method].assetValue;
    }

    function _confidenceByMethod(ValuationMethod method)
        internal
        pure
        returns (uint8)
    {
        if (method == ValuationMethod.AUDIT_VERIFIED)    return 98;
        if (method == ValuationMethod.FULL_APPRAISAL)     return 95;
        if (method == ValuationMethod.DESKTOP_APPRAISAL)  return 85;
        if (method == ValuationMethod.DCF_MODEL)          return 75;
        if (method == ValuationMethod.MARKET_COMPARABLE)  return 70;
        if (method == ValuationMethod.INCOME_STATEMENT)   return 60;
        return 50;
    }

    // ─── Events ──────────────────────────────────────────────
    event NAVSubmitted(
        bytes32 indexed assetId, uint256 assetValue,
        ValuationMethod method, address submitter, bool autoFlagged
    );
    event SubmissionFlaggedForReview(
        bytes32 indexed assetId, uint256 submissionIndex, uint256 deviationBPS
    );
    event DisputeOpened(
        bytes32 indexed assetId, address challenger, uint256 challengerValue
    );
    event DisputeResolved(
        bytes32 indexed assetId, uint256 resolvedValue, DisputeStatus status
    );
    event DisputeExpired(bytes32 indexed assetId, uint256 stakeReturned);
    event WeightConfigSet(bytes32 indexed assetId);
    event VaultRegistered(bytes32 indexed vaultId, address vault, bytes32 assetId);
    event CircuitBreakerTriggered(bytes32 indexed assetId);
    event NAVWarning(bytes32 indexed assetId);
    event ScheduleUpdated(bytes32 indexed assetClass);

    // ─── Errors ──────────────────────────────────────────────
    error AppraisalStale(bytes32 assetId);
    error NoValidNAVSources(bytes32 assetId);

    // ─── OZ Storage Gap ─────────────────────────────────────
    uint256[50] private __gap;
}
