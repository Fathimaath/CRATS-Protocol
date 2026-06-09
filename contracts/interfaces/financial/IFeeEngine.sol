// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title IFeeEngine
/// @notice Interface for FeeEngine contract
interface IFeeEngine {
    // ─── Structs ────────────────────────────────────────────
    struct FeeConfig {
        uint96  mgmtFeeBPS;
        uint32  lastAccrualTs;
        uint16  perfFeeBPS;
        uint16  entryFeeBPS;
        uint16  exitFeeBPS;
        uint16  tradingFeeBPS;
        uint16  hurdleRateBPS;
        bool    useHWM;
    }

    struct HWMRecord {
        uint128 highWaterMarkNAV;
        uint32  lastUpdated;
    }

    struct InvestorTier {
        uint128 aumThreshold;
        uint16  mgmtDiscountBPS;
        uint16  perfDiscountBPS;
        bool    entryWaived;
        bool    requiresApproval;
        bool    approved;
    }

    struct PendingConfig {
        FeeConfig config;
        uint64    executeAt;
    }

    struct FeeAllocation {
        address protocolTreasury;
        address issuerWallet;
        address complianceFund;
        address insuranceReserve;
        uint16  protocolBPS;
        uint16  issuerBPS;
        uint16  complianceBPS;
        uint16  insuranceBPS;
    }

    // ─── Events ────────────────────────────────────────────
    event FeeConfigProposed(address indexed vault, uint64 executeAt, FeeConfig config);
    event FeeConfigExecuted(address indexed vault, FeeConfig config);
    event FeeConfigCancelled(address indexed vault);
    event Checkpoint(address indexed vault, uint256 mgmtFeeAccrued);
    event HWMUpdated(address indexed vault, uint128 newHWM);
    event FeesDistributed(
        address indexed vault,
        uint256 totalDistributed,
        uint256 protocolShare,
        uint256 issuerShare,
        uint256 complianceShare,
        uint256 insuranceShare
    );
    event FeeReceived(address indexed vault, uint256 amount, address from);
    event AllocationSet(address indexed vault);
    event TierConfigured(uint8 indexed tierLevel);
    event InvestorTierSet(address indexed investor, uint8 tierLevel);
    event VaultRegistered(address indexed vault);

    // ─── Errors ────────────────────────────────────────────
    error FeeCapExceeded(string field, uint256 proposed, uint256 max);
    error TimelockActive(uint256 executeAt);
    error NoPendingConfig(address vault);
    error AllocationBPSMismatch(uint256 total);
    error InvalidTierLevel(uint8 level);
    error ZeroAmount();
    error InvalidAddress();
    error Unauthorized();
    error NothingToDistribute();

    // ─── Fee Configuration ─────────────────────────────────
    function proposeFeeConfig(address vault, FeeConfig calldata config) external;
    function executeFeeConfig(address vault) external;
    function cancelFeeConfig(address vault) external;

    // ─── Fee Calculation ───────────────────────────────────
    function accruedManagementFee(address vault) external view returns (uint256);
    function checkpoint(address vault) external;
    function calculatePerformanceFee(address vault, uint256 navPerShare, uint256 totalSupply) external view returns (uint256);
    function updateHWM(address vault, uint128 newHWM) external;
    function calculateEntryFee(address vault, uint256 amount, address investor) external view returns (uint256);
    function calculateExitFee(address vault, uint256 amount, address investor) external view returns (uint256);
    function calculateTradingFee(address vault, uint256 amount) external view returns (uint256);

    // ─── Fee Distribution ──────────────────────────────────
    function receiveFee(address vault, uint256 amount) external;
    function distributeFees(address vault) external;

    // ─── Management ────────────────────────────────────────
    function setAllocation(address vault, FeeAllocation calldata alloc) external;
    function setTierConfig(uint8 level, InvestorTier calldata tier) external;
    function setInvestorTier(address investor, uint8 level) external;
    function registerVault(address vault, FeeConfig calldata config, FeeAllocation calldata alloc) external;
    function setUSDC(address _usdc) external;

    // ─── View ──────────────────────────────────────────────
    function usdc() external view returns (IERC20);
    function feeConfigs(address vault) external view returns (FeeConfig memory);
    function pendingConfigs(address vault) external view returns (PendingConfig memory);
    function hwmRecords(address vault) external view returns (HWMRecord memory);
    function allocations(address vault) external view returns (FeeAllocation memory);
    function pendingMgmtFees(address vault) external view returns (uint256);
    function pendingPerfFees(address vault) external view returns (uint256);
    function feeRevenue(address vault) external view returns (uint256);
    function investorTierLevel(address investor) external view returns (uint8);
    function tierConfigs(uint8 level) external view returns (InvestorTier memory);
    function tierCount() external view returns (uint8);
}
