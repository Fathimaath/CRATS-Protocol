// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/governance/TimelockControllerUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "../interfaces/vault/ISyncVault.sol";
import "../interfaces/financial/IFeeEngine.sol";

contract FeeEngine is
    Initializable,
    UUPSUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable
{
    using SafeERC20 for IERC20;

    bytes32 public constant FEE_MANAGER_ROLE  = keccak256("FEE_MANAGER_ROLE");
    bytes32 public constant CHECKPOINT_ROLE   = keccak256("CHECKPOINT_ROLE");
    bytes32 public constant DISTRIBUTOR_ROLE  = keccak256("DISTRIBUTOR_ROLE");
    bytes32 public constant UPGRADER_ROLE     = keccak256("UPGRADER_ROLE");

    uint256 public constant BPS_DENOMINATOR   = 10_000;
    uint256 public constant SECONDS_PER_YEAR  = 31_536_000;

    TimelockControllerUpgradeable public timelock;
    IERC20 public usdc;

    mapping(address => IFeeEngine.FeeConfig)      public feeConfigs;
    mapping(address => IFeeEngine.PendingConfig)  public pendingConfigs;
    mapping(address => IFeeEngine.HWMRecord)      public hwmRecords;
    mapping(address => IFeeEngine.FeeAllocation)  public allocations;
    mapping(address => uint256)                    public pendingMgmtFees;
    mapping(address => uint256)                    public pendingPerfFees;
    mapping(address => uint256)                    public feeRevenue;

    mapping(address => uint8)                      public investorTierLevel;
    mapping(uint8 => IFeeEngine.InvestorTier)      public tierConfigs;
    uint8                                           public tierCount;

    // ─── Initialize ──────────────────────────────────────────
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _timelock,
        address _usdc,
        address _admin
    ) public initializer {
        __UUPSUpgradeable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(FEE_MANAGER_ROLE, _timelock);
        _grantRole(CHECKPOINT_ROLE, _timelock);
        _grantRole(DISTRIBUTOR_ROLE, _timelock);
        _grantRole(UPGRADER_ROLE, _admin);

        timelock = TimelockControllerUpgradeable(payable(_timelock));
        usdc = IERC20(_usdc);
    }

    function _authorizeUpgrade(address)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}

    // ═══════════════════════════════════════════════════════════
    // SECTION 1: FEE CONFIGURATION (TIMELOCKED VIA OZ)
    // ═══════════════════════════════════════════════════════════

    function proposeFeeConfig(address vault, IFeeEngine.FeeConfig calldata config)
        external
        onlyRole(FEE_MANAGER_ROLE)
    {
        require(config.mgmtFeeBPS <= 300, "Hard cap: 3%");
        require(config.perfFeeBPS <= 2000, "Hard cap: 20%");
        require(config.entryFeeBPS <= 500, "Hard cap: 5%");
        require(config.exitFeeBPS <= 500, "Hard cap: 5%");
        require(config.tradingFeeBPS <= 300, "Hard cap: 3%");
        pendingConfigs[vault] = IFeeEngine.PendingConfig({
            config: config,
            executeAt: uint64(block.timestamp + 48 hours)
        });
        emit IFeeEngine.FeeConfigProposed(vault, pendingConfigs[vault].executeAt, config);
    }

    function executeFeeConfig(address vault)
        external
        whenNotPaused
    {
        require(
            block.timestamp >= pendingConfigs[vault].executeAt,
            "Timelock active"
        );
        _checkpoint(vault);
        feeConfigs[vault] = pendingConfigs[vault].config;
        delete pendingConfigs[vault];
    }

    // ═══════════════════════════════════════════════════════════
    // SECTION 2: MANAGEMENT FEE ACCRUAL
    // ═══════════════════════════════════════════════════════════

    function accruedManagementFee(address vault)
        public
        view
        returns (uint256)
    {
        IFeeEngine.FeeConfig storage cfg = feeConfigs[vault];
        uint256 elapsed = block.timestamp - cfg.lastAccrualTs;
        uint256 currentAUM = ISyncVault(vault).totalAssets();
        return (currentAUM * cfg.mgmtFeeBPS * elapsed)
            / (BPS_DENOMINATOR * SECONDS_PER_YEAR);
    }

    function checkpoint(address vault)
        external
        onlyRole(CHECKPOINT_ROLE)
        whenNotPaused
    {
        uint256 fee = accruedManagementFee(vault);
        pendingMgmtFees[vault] += fee;
        feeConfigs[vault].lastAccrualTs = uint32(block.timestamp);
        emit IFeeEngine.Checkpoint(vault, fee);
    }

    function _checkpoint(address vault) internal {
        uint256 fee = accruedManagementFee(vault);
        pendingMgmtFees[vault] += fee;
        feeConfigs[vault].lastAccrualTs = uint32(block.timestamp);
    }

    // ═══════════════════════════════════════════════════════════
    // SECTION 3: PERFORMANCE FEE (HIGH WATER MARK)
    // ═══════════════════════════════════════════════════════════

    function calculatePerformanceFee(
        address vault,
        uint256 navPerShare,
        uint256 totalSupply
    ) public view returns (uint256) {
        IFeeEngine.HWMRecord storage hwm = hwmRecords[vault];
        IFeeEngine.FeeConfig storage cfg = feeConfigs[vault];

        uint256 benchmark = cfg.useHWM
            ? hwm.highWaterMarkNAV
            : hwm.highWaterMarkNAV
            + (hwm.highWaterMarkNAV * cfg.hurdleRateBPS / BPS_DENOMINATOR);

        if (navPerShare <= benchmark) return 0;

        uint256 gainPerShare = navPerShare - benchmark;
        return ((gainPerShare * totalSupply / 1e18) * cfg.perfFeeBPS) / BPS_DENOMINATOR;
    }

    function updateHWM(address vault, uint128 newHWM)
        external
        onlyRole(FEE_MANAGER_ROLE)
    {
        hwmRecords[vault] = IFeeEngine.HWMRecord({
            highWaterMarkNAV: newHWM,
            lastUpdated: uint32(block.timestamp)
        });
        emit IFeeEngine.HWMUpdated(vault, newHWM);
    }

    // ═══════════════════════════════════════════════════════════
    // SECTION 4: ENTRY / EXIT / TRADING FEES
    // ═══════════════════════════════════════════════════════════

    function calculateEntryFee(
        address vault,
        uint256 amount,
        address investor
    ) public view returns (uint256) {
        IFeeEngine.InvestorTier storage tier = tierConfigs[investorTierLevel[investor]];
        if (tier.entryWaived) return 0;
        return amount * feeConfigs[vault].entryFeeBPS / BPS_DENOMINATOR;
    }

    function calculateExitFee(
        address vault,
        uint256 amount,
        address /* investor */
    ) public view returns (uint256) {
        return amount * feeConfigs[vault].exitFeeBPS / BPS_DENOMINATOR;
    }

    function calculateTradingFee(address vault, uint256 amount)
        public
        view
        returns (uint256)
    {
        return amount * feeConfigs[vault].tradingFeeBPS / BPS_DENOMINATOR;
    }

    // ═══════════════════════════════════════════════════════════
    // SECTION 5: FEE DISTRIBUTION
    // ═══════════════════════════════════════════════════════════

    function distributeFees(address vault)
        external
        nonReentrant
        whenNotPaused
        onlyRole(DISTRIBUTOR_ROLE)
    {
        uint256 mgmtPending = pendingMgmtFees[vault];
        uint256 perfPending = pendingPerfFees[vault];
        uint256 totalPending = mgmtPending + perfPending;
        if (totalPending == 0) return;

        uint256 available = feeRevenue[vault];
        uint256 toDistribute = Math.min(totalPending, available);
        if (toDistribute == 0) return;

        IFeeEngine.FeeAllocation storage alloc = allocations[vault];

        uint256 treasuryShare   = toDistribute * alloc.protocolBPS  / BPS_DENOMINATOR;
        uint256 issuerShare     = toDistribute * alloc.issuerBPS    / BPS_DENOMINATOR;
        uint256 complianceShare = toDistribute * alloc.complianceBPS / BPS_DENOMINATOR;
        uint256 insuranceShare  = toDistribute * alloc.insuranceBPS / BPS_DENOMINATOR;
        uint256 dust = toDistribute - treasuryShare - issuerShare - complianceShare - insuranceShare;
        insuranceShare += dust;

        pendingMgmtFees[vault] -= (toDistribute * mgmtPending) / totalPending;
        pendingPerfFees[vault]  -= (toDistribute * perfPending) / totalPending;
        feeRevenue[vault]        -= toDistribute;

        usdc.safeTransfer(alloc.protocolTreasury, treasuryShare);
        usdc.safeTransfer(alloc.issuerWallet, issuerShare);
        usdc.safeTransfer(alloc.complianceFund, complianceShare);
        usdc.safeTransfer(alloc.insuranceReserve, insuranceShare);

        emit IFeeEngine.FeesDistributed(vault, toDistribute, treasuryShare, issuerShare, complianceShare, insuranceShare);
    }

    // ═══════════════════════════════════════════════════════════
    // SECTION 6: ALLOCATION MANAGEMENT
    // ═══════════════════════════════════════════════════════════

    function setAllocation(address vault, IFeeEngine.FeeAllocation calldata alloc)
        external
        onlyRole(FEE_MANAGER_ROLE)
    {
        allocations[vault] = alloc;
        emit IFeeEngine.AllocationSet(vault);
    }

    // ═══════════════════════════════════════════════════════════
    // SECTION 7: TIER CONFIGURATION
    // ═══════════════════════════════════════════════════════════

    function setTierConfig(uint8 level, IFeeEngine.InvestorTier calldata tier)
        external
        onlyRole(FEE_MANAGER_ROLE)
    {
        tierConfigs[level] = tier;
        if (level > tierCount) tierCount = level;
        emit IFeeEngine.TierConfigured(level);
    }

    function setInvestorTier(address investor, uint8 level)
        external
        onlyRole(FEE_MANAGER_ROLE)
    {
        investorTierLevel[investor] = level;
        emit IFeeEngine.InvestorTierSet(investor, level);
    }

    // ═══════════════════════════════════════════════════════════
    // SECTION 8: VAULT REGISTRATION
    // ═══════════════════════════════════════════════════════════

    function registerVault(
        address vault,
        IFeeEngine.FeeConfig calldata config,
        IFeeEngine.FeeAllocation calldata alloc
    ) external onlyRole(FEE_MANAGER_ROLE) {
        require(config.mgmtFeeBPS <= 300, "Hard cap: 3%");
        require(config.perfFeeBPS <= 2000, "Hard cap: 20%");
        require(config.entryFeeBPS <= 500, "Hard cap: 5%");
        require(config.exitFeeBPS <= 500, "Hard cap: 5%");
        require(config.tradingFeeBPS <= 300, "Hard cap: 3%");

        feeConfigs[vault] = config;
        allocations[vault] = alloc;
        hwmRecords[vault] = IFeeEngine.HWMRecord({
            highWaterMarkNAV: 0,
            lastUpdated: uint32(block.timestamp)
        });

        _grantRole(CHECKPOINT_ROLE, vault);

        emit IFeeEngine.VaultRegistered(vault);
    }

    // ═══════════════════════════════════════════════════════════
    // SECTION 9: ADMIN
    // ═══════════════════════════════════════════════════════════

    function setUSDC(address _usdc)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        usdc = IERC20(_usdc);
    }

    function cancelFeeConfig(address vault)
        external
        onlyRole(FEE_MANAGER_ROLE)
    {
        delete pendingConfigs[vault];
        emit IFeeEngine.FeeConfigCancelled(vault);
    }

    function receiveFee(address vault, uint256 amount)
        external
        onlyRole(CHECKPOINT_ROLE)
    {
        feeRevenue[vault] += amount;
        emit IFeeEngine.FeeReceived(vault, amount, msg.sender);
    }

    // ─── OZ Storage Gap ─────────────────────────────────────
    uint256[50] private __gap;
}
