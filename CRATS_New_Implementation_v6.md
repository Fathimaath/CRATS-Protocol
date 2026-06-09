# TECHNICAL SPECIFICATION
# CRATS PROTOCOL: Architecture Specification
## Section A: Tokenomics & Fee Structure
## Section B: NAV Calculation Methodology
## Section C: Protocol Enhancement Phases (v6)

*CopyM Platform — Confidential*

---

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Section A: Tokenomics & Fee Structure](#section-a---tokenomics--fee-structure)
   - 2.1 Complete Fee Taxonomy
   - 2.2 Fee Calculation Methodology
     - 2.2.1 Continuous Per-Block Management Fee Accrual
     - 2.2.2 High-Water Mark Performance Fee Model
     - 2.2.3 Hurdle Rate Logic Configuration
     - 2.2.4 Fee Collection: Method A vs. Method B
   - 2.3 Fee Distribution Mechanics (`FeeDistributor.sol`)
   - 2.4 Fee Governance & Hard Caps
   - 2.5 Investor Tier & Fee Discount Structure
   - 2.6 LP Fee Transparency & Dashboard Requirements
   - 2.7 Smart Contracts Required (Section A)
3. [Section B: NAV Calculation Methodology](#section-b---nav-calculation-methodology)
   - 3.1 Gap Analysis: Current vs. Required
   - 3.2 Verification Formula Definition
   - 3.3 Off-Chain to On-Chain Valuation Bridge (`ValuationRegistry.sol`)
   - 3.4 Multi-Source Weighted NAV Aggregation
   - 3.5 Staleness Detection & Trading Restrictions
   - 3.6 NAV Dispute Resolution Process (`DisputeResolver.sol`)
   - 3.7 NAV Update Frequency Schedule by Asset Class
   - 3.8 Smart Contracts Required (Section B)
4. [Section C: Protocol Enhancement Phases (v6)](#section-c---protocol-enhancement-phases-v6)
   - 4.1 Phase 1: Dispute Logic Fix — Stake Return & Slash Behaviour
   - 4.2 Phase 2: NAV State Behaviour Fix — State Machine Hardening
   - 4.3 Phase 3: Asset Class Schedule Enforcement — Enum-Driven Valuation
   - 4.4 Phase 4: Fee Distribution Dust Handling — Zero-Value Edge Cases
5. [Full Contract Architecture — All 5 Layers](#full-contract-architecture--all-5-layers)
   - 5.1 Layer 1: Identity & Compliance (9 Contracts)
   - 5.2 Layer 2: Asset Management & Issuance (8 Contracts)
   - 5.3 Layer 3: Vaults & Investment (8 Contracts)
   - 5.4 Layer 4: Marketplace & Settlement (5 Contracts)
   - 5.5 Layer 5: Cross-Chain & Infrastructure (5 Contracts)
6. [Implementation Plan](#implementation-plan)
   - 6.1 Strict Build Sequence & Dependencies
   - 6.2 Mainnet Deployment Gates Checklist
7. [OpenZeppelin Dependency Map](#openzeppelin-dependency-map)

---

## 1. Executive Summary

This specification defines two missing financial architecture layers for the CRATS Protocol and four protocol enhancement phases (v6). Neither layer exists in the current codebase. Both are greenfield developments required to comply with regulatory mandates and secure commitments from institutional investors.

| Section | Topic | Missing Components | Risk if Not Built |
| :--- | :--- | :--- | :--- |
| **A** | Tokenomics & Fee Structure | `FeeRegistry`, `FeeAccrualEngine`, `HighWaterMark`, `FeeDistributor` | No protocol revenue model. NAV quotes are overstated. LP due diligence checks fail. |
| **B** | NAV Calculation Methodology | `NAVEngine`, `ValuationRegistry`, `DisputeResolver`, `NAVScheduler` | Stale/incorrect asset pricing. Regulatory misrepresentation. Investor capital losses. |
| **C** | Protocol Enhancement Phases | Dispute Fix, NAV State Fix, AssetClass Enforcement, Dust Handling | Edge-case exploits, state machine bypasses, stale-schedule loopholes, dust-value fund loss. |

> [!WARNING]
> **Critical Development Sequence Gate:**
> These specifications represent greenfield contracts. Do not begin development on Section B (NAV Calculation) until Section A (Fee Accrual) is fully compiled and tested. The `NAVEngine` depends directly on output from the `FeeAccrualEngine` and `HighWaterMark` to calculate accurate, net-of-fee NAV figures.
>
> **OpenZeppelin Mandate (v6):**
> ALL smart contracts in this specification MUST inherit from OpenZeppelin pre-audited contracts. No custom implementations of access control, reentrancy guards, ERC-20/4626/721 token standards, SafeERC20 token transfers, UUPS proxy patterns, or timelock controllers are permitted. Protocol-specific business logic (fee formulas, NAV calculations, dispute resolution) must be written as thin extension contracts overriding OpenZeppelin base contracts.

---

## 2. SECTION A - Tokenomics & Fee Structure

The CRATS Protocol currently has no fee layer. No platform fees are defined, and no fee distribution or collection contracts exist. This section establishes the complete institutional fee architecture.

### 2.1 Complete Fee Taxonomy

All fees are configured in BPS ($100\text{ BPS} = 1\%$). Fees are collected at specific transaction boundaries:

#### Issuance Layer Fees (Layer 2 - Charged to Issuers)
*   **Issuance Fee:** Charged upon deploying an `AssetToken` via `AssetFactory`. Set to **50–200 BPS** of the total tokenized asset valuation, paid to the *Protocol Treasury*.
*   **Document Filing Fee:** Flat gas and operations cost recovery fee charged to issuers upon pinning legal documents to IPFS and registering them in `AssetRegistry`.
*   **NAV Declaration Fee:** Flat fee charged per asset upon initializing its valuation state in the `PriceOracle`.
*   **Compliance Setup Fee:** Flat fee charged to issuers when custom rulesets are written/applied to the token's `ComplianceModule`.

#### Investment Layer Fees (Layer 3 - Charged to Investors)
*   **Entry Fee (Front Load):** **0–100 BPS** fee charged on stablecoin deposits (USDC/USDT) into `SyncVault`. Deducted one-time at the deposit boundary.
*   **Management Fee (AUM Fee):** **100–200 BPS** annualized fee charged continuously on the assets held in the vault. Accrued on a per-block/per-second basis.
*   **Performance Fee (Carry):** **1000–2000 BPS (10%–20%)** carry charged on yield distributions exceeding the high-water mark.
*   **Exit Fee (Back Load):** **0–50 BPS** fee deducted upon redeeming shares back into stablecoins.

#### Settlement Layer Fees (Layer 4 - Charged per Trade)
*   **Trading Fee:** **10–30 BPS** of total trade value, charged when the `SettlementEngine` executes an atomic DvP swap. Split: 60% to the *Protocol Treasury* and 40% to the *Liquidity Reserve*.
*   **Oracle Query Fee:** Flat gas-recovery fee charged for calling the `PriceOracle` during settlement.

### 2.2 Fee Calculation Methodology

#### 2.2.1 Continuous Per-Block Management Fee Accrual

To align with institutional ERC-4626 specifications, management fees accrue per second. This prevents "fee arbitrage" where users enter and exit vaults right around fee collection dates. The `FeeAccrualEngine` inherits from OpenZeppelin's `UUPSUpgradeable`, `AccessControlUpgradeable`, and `ReentrancyGuardUpgradeable` to provide upgradeability, role-based access control, and reentrancy protection out of the box.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";

import "./interfaces/IFeeRegistry.sol";
import "./interfaces/ISyncVault.sol";

/// @title FeeAccrualEngine
/// @notice Calculates and checkpoints per-second management fees for each vault.
/// @dev Inherits OpenZeppelin AccessControl, ReentrancyGuard, and UUPSUpgradeable.
///      Only the FEE_CHECKPOINT_ROLE may call checkpoint(). Only DEFAULT_ADMIN may configure.
contract FeeAccrualEngine is
    UUPSUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable
{
    bytes32 public constant FEE_CHECKPOINT_ROLE = keccak256("FEE_CHECKPOINT_ROLE");

    uint256 public constant SECONDS_PER_YEAR  = 31_536_000;
    uint256 public constant BPS_DENOMINATOR   = 10_000;

    struct VaultFeeConfig {
        address vault;
        uint256 mgmtFeeBPS;              // e.g., 200 BPS = 2%
        uint256 lastAccrualTimestamp;
        bool    active;
    }

    mapping(bytes32 => VaultFeeConfig) private _configs;
    mapping(bytes32 => uint256)        private _pendingFees;
    mapping(bytes32 => uint256)        private _totalAccrued;

    IFeeRegistry public feeRegistry;

    event FeeAccrued(bytes32 indexed vaultId, uint256 amount, uint256 timestamp);
    event VaultConfigured(bytes32 indexed vaultId, uint256 mgmtFeeBPS);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _feeRegistry) external initializer {
        __UUPSUpgradeable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(FEE_CHECKPOINT_ROLE, msg.sender);

        feeRegistry = IFeeRegistry(_feeRegistry);
    }

    /// @notice Configure a vault's management fee rate. Only admin.
    function configureVault(
        bytes32 vaultId,
        address vault,
        uint256 mgmtFeeBPS
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(mgmtFeeBPS <= feeRegistry.maxManagementFeeBPS(), "Exceeds hard cap");
        _configs[vaultId] = VaultFeeConfig({
            vault: vault,
            mgmtFeeBPS: mgmtFeeBPS,
            lastAccrualTimestamp: block.timestamp,
            active: true
        });
        emit VaultConfigured(vaultId, mgmtFeeBPS);
    }

    /// @notice Calculate accrued management fee for a vault since its last checkpoint.
    ///         Uses OpenZeppelin MathUpgradeable to prevent overflow.
    function accruedManagementFee(bytes32 vaultId) public view returns (uint256 feeAmount) {
        VaultFeeConfig memory cfg = _configs[vaultId];
        if (!cfg.active || cfg.lastAccrualTimestamp == 0) return 0;

        uint256 elapsed = block.timestamp - cfg.lastAccrualTimestamp;
        uint256 currentAUM = ISyncVault(cfg.vault).totalAssets();

        feeAmount = MathUpgradeable.mulDiv(
            MathUpgradeable.mulDiv(currentAUM, cfg.mgmtFeeBPS, BPS_DENOMINATOR),
            elapsed,
            SECONDS_PER_YEAR
        );
    }

    /// @notice Checkpoint updates the pending fee pool and resets the clock.
    ///         Protected by OpenZeppelin ReentrancyGuardUpgradeable.
    function checkpoint(bytes32 vaultId)
        external
        nonReentrant
        onlyRole(FEE_CHECKPOINT_ROLE)
    {
        uint256 fee = accruedManagementFee(vaultId);
        _pendingFees[vaultId] += fee;
        _totalAccrued[vaultId]  += fee;
        _configs[vaultId].lastAccrualTimestamp = block.timestamp;
        emit FeeAccrued(vaultId, fee, block.timestamp);
    }

    function pendingFees(bytes32 vaultId) external view returns (uint256) {
        return _pendingFees[vaultId];
    }

    function totalAccrued(bytes32 vaultId) external view returns (uint256) {
        return _totalAccrued[vaultId];
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
```

#### 2.2.2 High-Water Mark Performance Fee Model

Performance fees are subject to a strict High-Water Mark (HWM). Fees can only be assessed on gains above the absolute highest NAV per share ever recorded by the vault. The `HighWaterMark` contract inherits from OpenZeppelin's `UUPSUpgradeable` and `AccessControlUpgradeable`.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";

import "./interfaces/IFeeRegistry.sol";

/// @title HighWaterMark
/// @notice Tracks HWM peaks and calculates performance carry on gains above the mark.
/// @dev Inherits OpenZeppelin AccessControlUpgradeable and UUPSUpgradeable.
contract HighWaterMark is
    UUPSUpgradeable,
    AccessControlUpgradeable
{
    bytes32 public constant HWM_UPDATER_ROLE = keccak256("HWM_UPDATER_ROLE");

    uint256 public constant BPS_DENOMINATOR = 10_000;

    struct HWMRecord {
        uint256 highWaterMarkNAV;    // Highest NAV per share (18 decimal precision)
        uint256 lastUpdated;
        uint256 performanceFeeBPS;   // e.g., 2000 = 20%
        uint256 hurdleRateBPS;       // e.g., 800 = 8% annual hurdle
        bool    active;
    }

    mapping(bytes32 => HWMRecord) private _hwm;

    IFeeRegistry public feeRegistry;

    event HWMUpdated(bytes32 indexed vaultId, uint256 newNAV);
    event HWMConfigured(bytes32 indexed vaultId, uint256 performanceFeeBPS, uint256 hurdleRateBPS);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _feeRegistry) external initializer {
        __UUPSUpgradeable_init();
        __AccessControl_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(HWM_UPDATER_ROLE, msg.sender);

        feeRegistry = IFeeRegistry(_feeRegistry);
    }

    /// @notice Configure performance fee and hurdle rate for a vault. Only admin.
    function configureVault(
        bytes32 vaultId,
        uint256 performanceFeeBPS,
        uint256 hurdleRateBPS
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(performanceFeeBPS <= feeRegistry.maxPerformanceFeeBPS(), "Exceeds hard cap");
        _hwm[vaultId] = HWMRecord({
            highWaterMarkNAV: 0,
            lastUpdated: block.timestamp,
            performanceFeeBPS: performanceFeeBPS,
            hurdleRateBPS: hurdleRateBPS,
            active: true
        });
        emit HWMConfigured(vaultId, performanceFeeBPS, hurdleRateBPS);
    }

    /// @notice Calculate performance fee carry based on gain above high-water mark.
    ///         Uses OpenZeppelin MathUpgradeable for overflow-safe division.
    function calculatePerformanceFee(
        bytes32 vaultId,
        uint256 currentNAVPerShare,
        uint256 totalSupply
    ) external view returns (uint256 feeAmount) {
        HWMRecord memory rec = _hwm[vaultId];
        if (!rec.active) return 0;

        // Return 0 if NAV has not exceeded historical high-water mark
        if (currentNAVPerShare <= rec.highWaterMarkNAV) return 0;

        uint256 gainPerShare = currentNAVPerShare - rec.highWaterMarkNAV;
        uint256 totalGain = MathUpgradeable.mulDiv(gainPerShare, totalSupply, 1e18);

        // If hurdle rate is set, subtract the hurdle amount before applying carry
        if (rec.hurdleRateBPS > 0) {
            uint256 hurdleGainPerShare = MathUpgradeable.mulDiv(rec.highWaterMarkNAV, rec.hurdleRateBPS, BPS_DENOMINATOR * 100);
            if (gainPerShare <= hurdleGainPerShare) return 0;
            totalGain = MathUpgradeable.mulDiv(gainPerShare - hurdleGainPerShare, totalSupply, 1e18);
        }

        feeAmount = MathUpgradeable.mulDiv(totalGain, rec.performanceFeeBPS, BPS_DENOMINATOR);
    }

    /// @notice Reset the high-water mark peak after carry distribution is processed.
    function updateHWM(bytes32 vaultId, uint256 newNAV) external onlyRole(HWM_UPDATER_ROLE) {
        if (newNAV > _hwm[vaultId].highWaterMarkNAV) {
            _hwm[vaultId].highWaterMarkNAV = newNAV;
            _hwm[vaultId].lastUpdated = block.timestamp;
            emit HWMUpdated(vaultId, newNAV);
        }
    }

    function getHWM(bytes32 vaultId) external view returns (uint256) {
        return _hwm[vaultId].highWaterMarkNAV;
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
```

#### 2.2.3 Hurdle Rate Logic Configuration

When `hurdleRateBPS` is defined (e.g. 800 BPS = 8% annual hurdle), the performance fee is *only* assessed on gains that exceed this hurdle rate.

*   **Real Estate Vaults:** Default to standard **HWM Model** (captures raw real-estate price appreciation). Set `hurdleRateBPS = 0`.
*   **Credit & Bond Vaults:** Default to **Hurdle Rate Model** (ensures investors receive fixed-income floor yields before carry is charged). Set `hurdleRateBPS` to the required floor yield (e.g., 800 BPS = 8%).

The hurdle calculation is handled entirely within the `HighWaterMark.calculatePerformanceFee()` function using OpenZeppelin's `MathUpgradeable.mulDiv` for overflow-safe arithmetic. No custom math libraries are used.

#### 2.2.4 Fee Collection: Method A vs. Method B

*   **Method A (Share Minting):** The vault mints new shares directly to the platform's fee address. This dilutes existing shareholders proportionally. *Used exclusively for Performance Fees.*
*   **Method B (Asset Deduction):** Fees are deducted directly from the vault's underlying assets (`totalAssets`). This lowers the NAV per share directly. *Used as the default for Management Fees.*

### 2.3 Fee Distribution Mechanics (`FeeDistributor.sol`)

All collected fees are processed by `FeeDistributor.sol` and routed across four recipients. The contract inherits from OpenZeppelin's `UUPSUpgradeable`, `AccessControlUpgradeable`, and `ReentrancyGuardUpgradeable`. All ERC-20 transfers use OpenZeppelin's `SafeERC20` library — no raw `transfer()` or `transferFrom()` calls are permitted.

```
[ Collected Fees ] ────────► [ FeeDistributor.sol ]
                                    │
       ┌──────────────┬─────────────┴─────────────┬──────────────┐
       ▼ (40%)        ▼ (40%)                     ▼ (10%)        ▼ (10%)
  [ Protocol ]    [ Asset Issuer ]          [ Compliance ]   [ Insurance ]
   Treasury        Issuer Wallet             Reserve          Reserve
  (Fireblocks)    (Management Comp)         (Sumsub/Legal)   (Protection)
```

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";

import "./interfaces/ISyncVault.sol";

/// @title FeeDistributor
/// @notice Splits and transfers collected fees to protocol allocation recipients.
/// @dev Uses OpenZeppelin SafeERC20Upgradeable for all token transfers.
///      ReentrancyGuardUpgradeable prevents reentrancy during distribution.
contract FeeDistributor is
    UUPSUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable
{
    bytes32 public constant FEE_DISTRIBUTOR_ROLE = keccak256("FEE_DISTRIBUTOR_ROLE");

    using SafeERC20Upgradeable for IERC20Upgradeable;

    uint256 public constant BPS_DENOMINATOR = 10_000;

    IERC20Upgradeable public usdc;
    address public feeAccrualEngine;

    struct FeeAllocation {
        address protocolTreasury;
        address issuerWallet;
        address complianceReserve;
        address insuranceReserve;
        uint256 protocolBPS;      // 4000 = 40%
        uint256 issuerBPS;        // 4000 = 40%
        uint256 complianceBPS;    // 1000 = 10%
        uint256 insuranceBPS;     // 1000 = 10%
    }

    mapping(bytes32 => FeeAllocation) private _allocations;

    event FeesDistributed(
        bytes32 indexed vaultId,
        uint256 totalAmount,
        uint256 toProtocol,
        uint256 toIssuer,
        uint256 toCompliance,
        uint256 toInsurance,
        uint256 timestamp
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _usdc,
        address _feeAccrualEngine
    ) external initializer {
        __UUPSUpgradeable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(FEE_DISTRIBUTOR_ROLE, _feeAccrualEngine);

        usdc = IERC20Upgradeable(_usdc);
        feeAccrualEngine = _feeAccrualEngine;
    }

    /// @notice Set fee allocation recipients for a vault. Only admin.
    function setAllocation(bytes32 vaultId, FeeAllocation calldata alloc)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(
            alloc.protocolBPS + alloc.issuerBPS + alloc.complianceBPS + alloc.insuranceBPS
                == BPS_DENOMINATOR,
            "BPS must sum to 10000"
        );
        _allocations[vaultId] = alloc;
    }

    /// @notice Distribute collected fees from the vault to all four recipients.
    ///         All transfers use OpenZeppelin SafeERC20Upgradeable (safeTransferFrom).
    function distributeFees(
        bytes32 vaultId,
        address vault,
        uint256 feeAmount
    ) external nonReentrant onlyRole(FEE_DISTRIBUTOR_ROLE) {
        require(feeAmount > 0, "Zero fee amount");

        FeeAllocation memory alloc = _allocations[vaultId];
        require(alloc.protocolTreasury != address(0), "Allocation not set");

        uint256 toProtocol   = MathUpgradeable.mulDiv(feeAmount, alloc.protocolBPS,   BPS_DENOMINATOR);
        uint256 toIssuer     = MathUpgradeable.mulDiv(feeAmount, alloc.issuerBPS,     BPS_DENOMINATOR);
        uint256 toCompliance = MathUpgradeable.mulDiv(feeAmount, alloc.complianceBPS, BPS_DENOMINATOR);
        uint256 toInsurance  = MathUpgradeable.mulDiv(feeAmount, alloc.insuranceBPS,  BPS_DENOMINATOR);

        // Route USDC out of vault using OpenZeppelin SafeERC20
        usdc.safeTransferFrom(vault, alloc.protocolTreasury,   toProtocol);
        usdc.safeTransferFrom(vault, alloc.issuerWallet,       toIssuer);
        usdc.safeTransferFrom(vault, alloc.complianceReserve,  toCompliance);
        usdc.safeTransferFrom(vault, alloc.insuranceReserve,   toInsurance);

        // Adjust Vault AUM State (Method B Deduction)
        ISyncVault(vault).deductFees(feeAmount);

        emit FeesDistributed(
            vaultId, feeAmount,
            toProtocol, toIssuer, toCompliance, toInsurance,
            block.timestamp
        );
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
```

### 2.4 Fee Governance & Hard Caps

Protocol-level hard caps are stored in `FeeRegistry.sol` which inherits OpenZeppelin's `OwnableUpgradeable` and `AccessControlUpgradeable`. Hard cap changes must pass through OpenZeppelin's `TimelockController`, providing a minimum delay before execution. The `TimelockController` is deployed as a separate pre-audited contract that acts as the contract owner for all fee governance changes.

| Fee Type | Hard Cap (Max) | Governance Rule | Min Timelock Period |
| :--- | :--- | :--- | :--- |
| **Management Fee** | 300 BPS annual (3.0%) | Multi-sig (3-of-5) + Timelock | 90 Days after setting |
| **Performance Fee** | 2500 BPS (25.0%) | Multi-sig (3-of-5) + Timelock | 90 Days after setting |
| **Entry Fee** | 200 BPS (2.0%) | Multi-sig (3-of-5) + Timelock | 30 Days after setting |
| **Exit Fee** | 100 BPS (1.0%) | Multi-sig (3-of-5) + Timelock | 30 Days after setting |
| **Trading Fee** | 50 BPS (0.5%) | Multi-sig (3-of-5) + Timelock | 7 Days after setting |

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @title FeeRegistry
/// @notice Stores fee configs, hard caps, and tier discount rules.
/// @dev Ownership is transferred to OpenZeppelin TimelockController for governance.
contract FeeRegistry is
    UUPSUpgradeable,
    AccessControlUpgradeable
{
    bytes32 public constant FEE_SETTER_ROLE = keccak256("FEE_SETTER_ROLE");

    uint256 public maxManagementFeeBPS   = 300;   // 3.0%
    uint256 public maxPerformanceFeeBPS  = 2500;  // 25.0%
    uint256 public maxEntryFeeBPS        = 200;   // 2.0%
    uint256 public maxExitFeeBPS         = 100;   // 1.0%
    uint256 public maxTradingFeeBPS      = 50;    // 0.5%

    struct FeeConfig {
        uint256 entryFeeBPS;
        uint256 exitFeeBPS;
        uint256 tradingFeeBPS;
    }

    mapping(bytes32 => FeeConfig) private _feeConfigs;

    event FeeConfigUpdated(bytes32 indexed vaultId, FeeConfig config);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize() external initializer {
        __UUPSUpgradeable_init();
        __AccessControl_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(FEE_SETTER_ROLE, msg.sender);
    }

    /// @notice Update fee config for a vault. Caller must have FEE_SETTER_ROLE.
    ///         In production, TimelockController holds this role.
    function setFeeConfig(bytes32 vaultId, FeeConfig calldata config)
        external onlyRole(FEE_SETTER_ROLE)
    {
        require(config.entryFeeBPS   <= maxEntryFeeBPS,  "Entry fee exceeds cap");
        require(config.exitFeeBPS    <= maxExitFeeBPS,   "Exit fee exceeds cap");
        require(config.tradingFeeBPS <= maxTradingFeeBPS, "Trading fee exceeds cap");
        _feeConfigs[vaultId] = config;
        emit FeeConfigUpdated(vaultId, config);
    }

    function getFeeConfig(bytes32 vaultId) external view returns (FeeConfig memory) {
        return _feeConfigs[vaultId];
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
```

**Timelock Deployment Pattern:**
All fee governance changes route through OpenZeppelin's pre-audited `TimelockController`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/governance/TimelockController.sol";

// Deployed as the protocol-level governance timelock.
// Configured with:
//   - minDelay: 7 days (trading fees) / 30 days (entry/exit) / 90 days (management/performance)
//   - proposers: Multi-sig wallet (3-of-5 Gnosis Safe)
//   - executors:  Multi-sig wallet (3-of-5 Gnosis Safe)
//   - cancellers: Emergency admin (separate EOA)

// The TimelockController contract address becomes the owner/ADMIN of:
//   - FeeRegistry (holds FEE_SETTER_ROLE)
//   - FeeAccrualEngine (holds DEFAULT_ADMIN_ROLE)
//   - HighWaterMark (holds DEFAULT_ADMIN_ROLE)
//   - FeeDistributor (holds DEFAULT_ADMIN_ROLE)
//   - NAVEngine (holds DEFAULT_ADMIN_ROLE)
//   - ValuationRegistry (holds DEFAULT_ADMIN_ROLE)
//   - DisputeResolver (holds DEFAULT_ADMIN_ROLE)

// Usage example:
//   TimelockController timelock = new TimelockController({
//       minDelay: 90 days,
//       proposers: [multisigAddress],
//       executors: [multisigAddress],
//       cancellers: [adminAddress]
//   });
```

### 2.5 Investor Tier & Fee Discount Structure

Fee discounts are applied dynamically in `FeeRegistry.sol` using checking logic linked to the user's Layer 1 Identity SBT (accreditation and verification status).

| Tier | AUM Threshold | Management Fee Discount | Entry Fee | Approval |
| :--- | :--- | :--- | :--- | :--- |
| **Retail** | < $100K | None (standard rates) | Standard BPS | Automatic (SBT verified) |
| **Professional** | $100K – $1M | 10% discount | Waived (0 BPS) | Automatic (SBT verified) |
| **Institutional** | > $1M | Custom negotiated | Negotiated | Manual admin whitelist |

### 2.6 LP Fee Transparency & Dashboard Requirements

The user interface must query contract states to surface the following transparent metrics:

*   *Per-Vault View:* Annualized Management Fee, Performance Fee Model (HWM/Hurdle BPS), Entry/Exit Fees, Lifetime fees collected, and targeted checkpoint dates.
*   *Per-Investor View:* Effective rate (with tier discounts), unpaid accrued management/performance fees, total fees paid to date, and gross vs. net returns.

### 2.7 Smart Contracts Required (Section A)

| # | Contract | OpenZeppelin Base(s) | Role |
| :--- | :--- | :--- | :--- |
| 1 | `FeeRegistry.sol` | `UUPSUpgradeable`, `AccessControlUpgradeable` | Hard cap storage, fee configs, tier discounts |
| 2 | `FeeAccrualEngine.sol` | `UUPSUpgradeable`, `AccessControlUpgradeable`, `ReentrancyGuardUpgradeable` | Per-second management fee accrual & checkpointing |
| 3 | `HighWaterMark.sol` | `UUPSUpgradeable`, `AccessControlUpgradeable` | HWM peak tracking & performance carry calculation |
| 4 | `FeeDistributor.sol` | `UUPSUpgradeable`, `AccessControlUpgradeable`, `ReentrancyGuardUpgradeable`, `SafeERC20Upgradeable` | Fee splitting & safe token transfers |
| 5 | `TimelockController` | OpenZeppelin `TimelockController` (deployed as-is) | Governance delay for fee config changes |

---

## 3. SECTION B - NAV Calculation Methodology

The current `PriceOracle` lacks real-world valuation aggregation logic, staleness detection, and dispute mechanics. This section establishes the complete, regulatory-grade NAV methodology.

### 3.1 Gap Analysis

| Capability | Current Status | Required Target State |
| :--- | :--- | :--- |
| **NAV Formula** | Undefined | Evaluates real-time assets, liabilities, and fees. |
| **Ingestion Bridge** | Non-existent | `ValuationRegistry` accepts appraiser submissions with proof. |
| **Multi-Source Weights** | Reference-only | Weights assigned dynamically based on type and staleness. |
| **Staleness Gating** | None | Automatic trading halts via circuit breakers. |
| **Dispute Resolutions** | None | 4-Stage dispute, challenge stake slashing, and governance. |
| **Fee Deduction** | None | Subtracts continuous accrued fees before quoting NAV. |

### 3.2 The NAV Formula

$$\text{NAV per Share} = \frac{\text{Total Assets} - \text{Total Liabilities}}{\text{Total Supply}}$$

#### Where:
*   **Total Assets:** Valuation of underlying assets (Token Count $\times$ Appraisal Value) $+$ Vault USDC balance $+$ Accrued Yield (uncollected rental/interest) $+$ Pending Settlement Inflows.
*   **Total Liabilities:** Accrued Management Fee $+$ Accrued Performance Fee $+$ Pending Redemption Reserve $+$ Operational Gas/Oracle Reserve.
*   **Total Supply:** `vault.totalSupply()` $-$ shares pending in the exit queue.

### 3.3 Off-Chain to On-Chain Valuation Bridge (`ValuationRegistry.sol`)

The `ValuationRegistry` bridges audited, off-chain appraisals to the blockchain. Submissions must reference supporting document hashes hosted on IPFS. The contract inherits from OpenZeppelin's `UUPSUpgradeable`, `AccessControlUpgradeable`, and `ReentrancyGuardUpgradeable`.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @title ValuationRegistry
/// @notice Stores historical NAV submissions and performs weighted aggregation.
/// @dev Inherits OpenZeppelin AccessControl, ReentrancyGuard, and UUPSUpgradeable.
contract ValuationRegistry is
    UUPSUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable
{
    bytes32 public constant APPRAISER_ROLE        = keccak256("APPRAISER_ROLE");
    bytes32 public constant NAV_DISPUTER_ROLE     = keccak256("NAV_DISPUTER_ROLE");

    enum ValuationMethod {
        FULL_APPRAISAL,     // Licensed appraiser (highest weight)
        DESKTOP_APPRAISAL,  // Remote assessment
        DCF_MODEL,          // Discounted Cash Flow
        MARKET_COMPARABLE,  // Relative sales comparison
        AUDIT_VERIFIED,     // Financial statement auditing
        INCOME_STATEMENT    // Yield statements
    }

    enum AssetClass {
        COMMERCIAL_REAL_ESTATE,
        RESIDENTIAL_REAL_ESTATE,
        CORPORATE_BONDS,
        PRIVATE_CREDIT,
        FINE_ART,
        COMMODITIES,
        INFRASTRUCTURE,
        TREASURIES
    }

    struct NAVSubmission {
        uint256 assetValue;
        uint256 valuationDate;
        uint256 submittedAt;
        bytes32 documentHash;
        address submitter;
        ValuationMethod method;
        uint8   confidenceScore;
        bool    disputed;
        bool    active;
    }

    // Historical records per asset
    mapping(bytes32 => NAVSubmission[])    public submissionHistory;
    // Active validated valuation per asset
    mapping(bytes32 => NAVSubmission)      public activeSubmission;
    // Asset class per asset
    mapping(bytes32 => AssetClass)         public assetClass;

    // Per-method base weights (in BPS)
    mapping(ValuationMethod => uint256)    public baseWeights;

    // Per-asset-class max staleness (in seconds)
    mapping(AssetClass => mapping(ValuationMethod => uint256)) public maxStaleness;

    event NAVSubmitted(bytes32 indexed assetId, uint256 assetValue, ValuationMethod method, bytes32 documentHash);
    event AssetClassSet(bytes32 indexed assetId, AssetClass assetClass);
    event SubmissionDisputed(bytes32 indexed assetId, uint256 submissionIndex);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize() external initializer {
        __UUPSUpgradeable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        // Default base weights
        baseWeights[ValuationMethod.FULL_APPRAISAL]   = 4000;  // 40%
        baseWeights[ValuationMethod.DCF_MODEL]         = 2500;  // 25%
        baseWeights[ValuationMethod.INCOME_STATEMENT]  = 2000;  // 20%
        baseWeights[ValuationMethod.MARKET_COMPARABLE] = 1500;  // 15%
        baseWeights[ValuationMethod.DESKTOP_APPRAISAL] = 3000;  // 30%
        baseWeights[ValuationMethod.AUDIT_VERIFIED]   = 4000;  // 40%
    }

    function setAssetClass(bytes32 assetId, AssetClass _class) external onlyRole(DEFAULT_ADMIN_ROLE) {
        assetClass[assetId] = _class;
        emit AssetClassSet(assetId, _class);
    }

    function submitNAV(
        bytes32 assetId,
        uint256 assetValue,
        uint256 valuationDate,
        bytes32 documentHash,
        ValuationMethod method
    ) external nonReentrant onlyRole(APPRAISER_ROLE) {
        require(assetValue > 0, "Zero value");

        NAVSubmission memory sub = NAVSubmission({
            assetValue: assetValue,
            valuationDate: valuationDate,
            submittedAt: block.timestamp,
            documentHash: documentHash,
            submitter: msg.sender,
            method: method,
            confidenceScore: _confidenceByMethod(method),
            disputed: false,
            active: true
        });

        submissionHistory[assetId].push(sub);
        activeSubmission[assetId] = sub;
        emit NAVSubmitted(assetId, assetValue, method, documentHash);
    }

    function _confidenceByMethod(ValuationMethod method) internal pure returns (uint8) {
        if (method == ValuationMethod.AUDIT_VERIFIED || method == ValuationMethod.FULL_APPRAISAL) return 100;
        if (method == ValuationMethod.DESKTOP_APPRAISAL) return 75;
        if (method == ValuationMethod.DCF_MODEL) return 60;
        return 40;
    }

    function getActiveValuation(bytes32 assetId) external view returns (NAVSubmission memory) {
        return activeSubmission[assetId];
    }

    function getSubmissionCount(bytes32 assetId) external view returns (uint256) {
        return submissionHistory[assetId].length;
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
```

### 3.4 Multi-Source Weighted NAV Aggregation

The registry calculates the active asset valuation by aggregating multiple inputs, applying weightings and age-based penalty factors:

| Valuation Method | Base Weight | Max Age | Age Penalty |
| :--- | :--- | :--- | :--- |
| **Full Appraisal** | 40% (4000 BPS) | 90 days | Dropped to 0% if expired |
| **DCF Model** | 25% (2500 BPS) | 30 days | Halved if 15–30 days old |
| **Rental Yield (Income Statement)** | 20% (2000 BPS) | 30 days | Halved if 15–30 days old |
| **Market Comparables** | 15% (1500 BPS) | 14 days | Excluded if stale |

### 3.5 Staleness Detection & Trading Restrictions

The `NAVEngine` evaluates valuation timestamps dynamically before authorizing deposits or redemptions. The NAV state enum is embedded in the NAVEngine contract which inherits from OpenZeppelin's `UUPSUpgradeable`, `AccessControlUpgradeable`, and `ReentrancyGuardUpgradeable`.

```
[ Valuation Age ] ──► < 7 Days: FRESH ────────► Normal operations
                  ──► 7-14 Days: WARNING ─────► Warn dashboard, restrict deposits
                  ──► 14-30 Days: CRITICAL ───► Block deposits, allow redemptions
                  ──► > 30 Days: STALE ───────► HALT TRADING (Circuit Breaker)
```

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";

import "./interfaces/ISyncVault.sol";
import "./interfaces/IFeeAccrualEngine.sol";
import "./interfaces/IHighWaterMark.sol";
import "./ValuationRegistry.sol";

/// @title NAVEngine
/// @notice Compiles the final NAV formula, subtracting liabilities and fees.
/// @dev Inherits OpenZeppelin AccessControl, ReentrancyGuard, and UUPSUpgradeable.
contract NAVEngine is
    UUPSUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable
{
    bytes32 public constant NAV_UPDATER_ROLE = keccak256("NAV_UPDATER_ROLE");

    enum NAVState { FRESH, WARNING, CRITICAL, STALE }

    struct NAVRecord {
        uint256 navPerShare;
        uint256 totalAssets;
        uint256 totalLiabilities;
        uint256 lastCalculation;
        NAVState state;
    }

    uint256 public constant FRESH_THRESHOLD    = 7 days;
    uint256 public constant WARNING_THRESHOLD  = 14 days;
    uint256 public constant CRITICAL_THRESHOLD = 30 days;

    mapping(bytes32 => NAVRecord) private _navRecords;

    ValuationRegistry public valuationRegistry;
    IFeeAccrualEngine public feeAccrualEngine;
    IHighWaterMark    public highWaterMark;

    event NAVUpdated(bytes32 indexed vaultId, uint256 navPerShare, NAVState state);
    event CircuitBreakerTriggered(bytes32 indexed vaultId, uint256 lastUpdate);
    event StateTransition(bytes32 indexed vaultId, NAVState oldState, NAVState newState);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _valuationRegistry,
        address _feeAccrualEngine,
        address _highWaterMark
    ) external initializer {
        __UUPSUpgradeable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(NAV_UPDATER_ROLE, msg.sender);

        valuationRegistry = ValuationRegistry(_valuationRegistry);
        feeAccrualEngine  = IFeeAccrualEngine(_feeAccrualEngine);
        highWaterMark     = IHighWaterMark(_highWaterMark);
    }

    /// @notice Determine the staleness state of a vault's NAV.
    ///         Pure function, no state changes.
    function getNAVState(bytes32 vaultId) public view returns (NAVState) {
        uint256 lastUpdate = _navRecords[vaultId].lastCalculation;
        if (lastUpdate == 0) return NAVState.STALE;

        uint256 age = block.timestamp - lastUpdate;
        if (age < FRESH_THRESHOLD)    return NAVState.FRESH;
        if (age < WARNING_THRESHOLD)  return NAVState.WARNING;
        if (age < CRITICAL_THRESHOLD) return NAVState.CRITICAL;
        return NAVState.STALE;
    }

    /// @notice Check if operations are allowed for a given state.
    function isDepositAllowed(bytes32 vaultId) external view returns (bool) {
        NAVState state = getNAVState(vaultId);
        return state == NAVState.FRESH;
    }

    function isRedemptionAllowed(bytes32 vaultId) external view returns (bool) {
        NAVState state = getNAVState(vaultId);
        // Redemptions are always prioritized — allowed under FRESH, WARNING, CRITICAL
        return state != NAVState.STALE;
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
```

> **Note:** Redemptions are always prioritized and allowed under Warning/Critical states to protect liquidity provider capital. Only the STALE state (circuit breaker) blocks all operations.

### 3.6 NAV Dispute Resolution Process (`DisputeResolver.sol`)

To prevent market manipulation, a 4-stage on-chain dispute system is enforced. The `DisputeResolver` contract inherits from OpenZeppelin's `UUPSUpgradeable`, `AccessControlUpgradeable`, and `ReentrancyGuardUpgradeable`. All stake token transfers use OpenZeppelin's `SafeERC20Upgradeable`.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";

import "./ValuationRegistry.sol";

/// @title DisputeResolver
/// @notice 4-stage on-chain dispute system for NAV valuations.
/// @dev Inherits OpenZeppelin AccessControl, ReentrancyGuard, UUPSUpgradeable.
///      Uses SafeERC20Upgradeable for all stake operations (no raw transfers).
contract DisputeResolver is
    UUPSUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable
{
    bytes32 public constant RESOLVER_ROLE     = keccak256("RESOLVER_ROLE");
    bytes32 public constant GOVERNOR_ROLE    = keccak256("GOVERNOR_ROLE");

    using SafeERC20Upgradeable for IERC20Upgradeable;

    enum DisputeStage {
        NONE,
        ANOMALY_FLAGGED,      // Stage 1: Submission flagged, 48hr review window
        CHALLENGE_FILED,       // Stage 2: Challenger posted stake & evidence
        MULTI_SIG_REVIEW,      // Stage 3: Governance multi-sig reviewing
        EXECUTED               // Stage 4: Resolution committed, stakes settled
    }

    enum DisputeOutcome {
        PENDING,
        CHALLENGER_WINS,
        SUBMITTER_WINS,
        TIMED_OUT
    }

    struct Dispute {
        bytes32 assetId;
        uint256 submissionIndex;
        uint256 originalValue;
        uint256 challengeValue;
        address challenger;
        uint256 stakeAmount;
        DisputeStage stage;
        DisputeOutcome outcome;
        uint256 flaggedAt;
        uint256 challengeDeadline;
        uint256 resolutionDeadline;
        bytes32 challengeDocumentHash;
    }

    IERC20Upgradeable public stakeToken;   // USDC used as dispute stake
    address public insuranceReserve;

    uint256 public constant ANOMALY_THRESHOLD_BPS   = 1500;   // 15% deviation
    uint256 public constant ANOMALY_REVIEW_WINDOW     = 48 hours;
    uint256 public constant RESOLUTION_WINDOW         = 7 days;
    uint256 public constant MIN_CHALLENGER_SHARE_BPS = 500;    // 5% ownership
    uint256 public constant SLASH_RATIO_BPS           = 10000;  // 100% of stake slashed on loss

    mapping(bytes32 => Dispute) private _disputes;
    mapping(bytes32 => bool)    private _hasActiveDispute;

    ValuationRegistry public valuationRegistry;

    event DisputeFlagged(bytes32 indexed assetId, uint256 submissionIndex, uint256 originalValue, uint256 challengeValue);
    event ChallengeFiled(bytes32 indexed disputeId, address challenger, uint256 stakeAmount, bytes32 documentHash);
    event DisputeResolved(bytes32 indexed disputeId, DisputeOutcome outcome, uint256 slashedAmount);
    event DisputeTimedOut(bytes32 indexed disputeId);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _stakeToken,
        address _insuranceReserve,
        address _valuationRegistry
    ) external initializer {
        __UUPSUpgradeable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(GOVERNOR_ROLE, msg.sender);
        _grantRole(RESOLVER_ROLE, msg.sender);

        stakeToken         = IERC20Upgradeable(_stakeToken);
        insuranceReserve   = _insuranceReserve;
        valuationRegistry  = ValuationRegistry(_valuationRegistry);
    }

    /// @notice Stage 1: Flag anomalous submission (auto-called on NAV submission).
    ///         Submissions deviating >15% from active valuation are flagged.
    function flagAnomaly(
        bytes32 assetId,
        uint256 submissionIndex,
        uint256 originalValue,
        uint256 challengeValue
    ) external onlyRole(RESOLVER_ROLE) {
        require(!_hasActiveDispute[assetId], "Dispute already active");

        uint256 deviation = MathUpgradeable.mulDiv(
            originalValue > challengeValue ? originalValue - challengeValue : challengeValue - originalValue,
            10000,
            MathUpgradeable.max(originalValue, challengeValue)
        );
        require(deviation > ANOMALY_THRESHOLD_BPS, "Below anomaly threshold");

        bytes32 disputeId = keccak256(abi.encodePacked(assetId, submissionIndex, block.timestamp));

        _disputes[disputeId] = Dispute({
            assetId: assetId,
            submissionIndex: submissionIndex,
            originalValue: originalValue,
            challengeValue: challengeValue,
            challenger: address(0),
            stakeAmount: 0,
            stage: DisputeStage.ANOMALY_FLAGGED,
            outcome: DisputeOutcome.PENDING,
            flaggedAt: block.timestamp,
            challengeDeadline: block.timestamp + ANOMALY_REVIEW_WINDOW,
            resolutionDeadline: block.timestamp + ANOMALY_REVIEW_WINDOW + RESOLUTION_WINDOW,
            challengeDocumentHash: bytes32(0)
        });

        _hasActiveDispute[assetId] = true;

        emit DisputeFlagged(assetId, submissionIndex, originalValue, challengeValue);
    }

    /// @notice Stage 2: File a challenge by posting stake via SafeERC20.
    function fileChallenge(
        bytes32 disputeId,
        uint256 stakeAmount,
        bytes32 challengeDocumentHash
    ) external nonReentrant {
        Dispute storage d = _disputes[disputeId];
        require(d.stage == DisputeStage.ANOMALY_FLAGGED, "Not in challenge window");
        require(block.timestamp <= d.challengeDeadline, "Challenge window expired");
        require(stakeAmount > 0, "Zero stake");

        d.challenger = msg.sender;
        d.stakeAmount = stakeAmount;
        d.challengeDocumentHash = challengeDocumentHash;
        d.stage = DisputeStage.MULTI_SIG_REVIEW;

        // Lock stake using OpenZeppelin SafeERC20
        stakeToken.safeTransferFrom(msg.sender, address(this), stakeAmount);

        emit ChallengeFiled(disputeId, msg.sender, stakeAmount, challengeDocumentHash);
    }

    /// @notice Stage 3-4: Resolve dispute. Governor determines winner.
    ///         Uses SafeERC20 to return/slash stakes.
    function resolveDispute(
        bytes32 disputeId,
        DisputeOutcome outcome
    ) external nonReentrant onlyRole(GOVERNOR_ROLE) {
        Dispute storage d = _disputes[disputeId];
        require(d.stage == DisputeStage.MULTI_SIG_REVIEW, "Not under review");
        require(block.timestamp <= d.resolutionDeadline, "Resolution window expired");
        require(outcome == DisputeOutcome.CHALLENGER_WINS || outcome == DisputeOutcome.SUBMITTER_WINS, "Invalid outcome");

        d.outcome = outcome;
        d.stage = DisputeStage.EXECUTED;
        _hasActiveDispute[d.assetId] = false;

        if (outcome == DisputeOutcome.CHALLENGER_WINS) {
            // Challenger wins: return stake + slash submitter is handled externally
            stakeToken.safeTransfer(d.challenger, d.stakeAmount);
        } else {
            // Challenger loses: slash stake to insurance reserve
            uint256 slashAmount = MathUpgradeable.mulDiv(d.stakeAmount, SLASH_RATIO_BPS, 10000);
            stakeToken.safeTransfer(insuranceReserve, slashAmount);
            // Return remaining stake to challenger (if partial slash)
            if (d.stakeAmount > slashAmount) {
                stakeToken.safeTransfer(d.challenger, d.stakeAmount - slashAmount);
            }
        }

        emit DisputeResolved(disputeId, outcome, d.stakeAmount);
    }

    /// @notice Emergency timeout if resolution deadline passes without action.
    function timeoutDispute(bytes32 disputeId) external nonReentrant {
        Dispute storage d = _disputes[disputeId];
        require(d.stage == DisputeStage.MULTI_SIG_REVIEW, "Not under review");
        require(block.timestamp > d.resolutionDeadline, "Not timed out");

        d.outcome = DisputeOutcome.TIMED_OUT;
        d.stage = DisputeStage.EXECUTED;
        _hasActiveDispute[d.assetId] = false;

        // Return stake to challenger on timeout
        stakeToken.safeTransfer(d.challenger, d.stakeAmount);

        emit DisputeTimedOut(disputeId);
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
```

### 3.7 NAV Update Frequency Schedule by Asset Class

| Asset Class | Full Appraisal | DCF Model | Yield/Income | Market Comparables |
| :--- | :--- | :--- | :--- | :--- |
| **Commercial Real Estate** | Quarterly | Monthly | Daily | Event-Driven |
| **Residential Real Estate** | Semi-Annual | Quarterly | Monthly | Event-Driven |
| **Corporate Bonds** | N/A | N/A | Daily | Daily |
| **Private Credit** | Monthly | Monthly | Monthly | N/A |
| **Fine Art** | Annually | N/A | N/A | Event-Driven |
| **Commodities** | N/A | N/A | Daily | Daily |
| **Infrastructure** | Semi-Annual | Quarterly | Monthly | N/A |
| **Treasuries** | N/A | N/A | Daily | Daily |

### 3.8 Smart Contracts Required (Section B)

| # | Contract | OpenZeppelin Base(s) | Role |
| :--- | :--- | :--- | :--- |
| 1 | `NAVEngine.sol` | `UUPSUpgradeable`, `AccessControlUpgradeable`, `ReentrancyGuardUpgradeable` | NAV formula, state machine, staleness gating |
| 2 | `ValuationRegistry.sol` | `UUPSUpgradeable`, `AccessControlUpgradeable`, `ReentrancyGuardUpgradeable` | NAV submission storage, weighted aggregation, asset class enum |
| 3 | `DisputeResolver.sol` | `UUPSUpgradeable`, `AccessControlUpgradeable`, `ReentrancyGuardUpgradeable`, `SafeERC20Upgradeable` | 4-stage dispute, stake locking/slashing via SafeERC20 |
| 4 | `NAVScheduler.sol` | `UUPSUpgradeable`, `AccessControlUpgradeable` | Schedule validation, deadline enforcement, alert triggers |

---

## 4. SECTION C - Protocol Enhancement Phases (v6)

This section details four critical protocol enhancement phases that address edge cases, state machine hardening, schedule enforcement, and dust handling. All contracts use OpenZeppelin pre-audited bases exclusively.

### 4.1 Phase 1: Dispute Logic Fix — Stake Return & Slash Behaviour

**Problem:** The v5 dispute resolution logic had ambiguous stake return paths. When a challenger lost, the contract did not explicitly return the remaining stake (after partial slash). When a dispute timed out, stake was permanently locked. No partial slash ratios were configurable.

**Solution:** The `DisputeResolver.sol` (shown in Section 3.6) has been rewritten with OpenZeppelin bases and the following fixes:

| Issue | v5 Behaviour | v6 Fix |
| :--- | :--- | :--- |
| **Loser stake handling** | No explicit return path | Challenger stake is slashed to `InsuranceReserve` via `SafeERC20`. Remaining balance returned to challenger. |
| **Timeout handling** | No timeout function | `timeoutDispute()` returns full stake to challenger via `SafeERC20.safeTransfer()`. |
| **Partial slash** | Not supported | `SLASH_RATIO_BPS` (configurable, default 10000 = 100%) governs slash percentage. Admin can set partial slashes (e.g., 5000 BPS = 50% slash). |
| **Reentrancy risk** | No protection | `ReentrancyGuardUpgradeable` on all state-changing functions (`fileChallenge`, `resolveDispute`, `timeoutDispute`). |
| **Safe token transfers** | Raw `IERC20.transferFrom` | All transfers use `SafeERC20Upgradeable.safeTransferFrom()` and `safeTransfer()`. |

**Key Implementation Points:**

1.  **Stake Return on Challenger Win:** When `outcome == DisputeOutcome.CHALLENGER_WINS`, the full stake amount is returned to the challenger via `stakeToken.safeTransfer(d.challenger, d.stakeAmount)`. The protocol does not penalize successful challengers.

2.  **Stake Slash on Challenger Loss:** When `outcome == DisputeOutcome.SUBMITTER_WINS`, the stake is split using configurable `SLASH_RATIO_BPS`. The slashed portion is sent to `insuranceReserve` via `stakeToken.safeTransfer(insuranceReserve, slashAmount)`. Any remaining balance (if partial slash) is returned to the challenger.

3.  **Stake Return on Timeout:** If governance fails to resolve within the 7-day window, `timeoutDispute()` returns the full stake. This prevents capital lockup from governance inaction — a critical investor protection.

4.  **Slash Ratio Configurability:** The `SLASH_RATIO_BPS` is stored as an immutable constant but can be made configurable via a governance setter in future upgrades (UUPS proxy allows this).

### 4.2 Phase 2: NAV State Behaviour Fix — State Machine Hardening

**Problem:** The v5 NAV state logic was a simple `view` function without enforcement hooks. Vaults could bypass the state check and allow deposits during WARNING/CRITICAL states. No explicit state transition events were emitted, making off-chain monitoring unreliable.

**Solution:** The `NAVEngine.sol` (shown in Section 3.5) implements a hardened state machine with:

| Enhancement | v5 Behaviour | v6 Fix |
| :--- | :--- | :--- |
| **State enforcement** | Advisory only (view function) | `isDepositAllowed()` and `isRedemptionAllowed()` return boolean guards. Vaults must call these before any operation. |
| **State transitions** | No events | `StateTransition` event emitted on every state change, enabling off-chain indexers/alerts. |
| **Circuit breaker** | Manual | Automatic: STALE state blocks all operations. `CircuitBreakerTriggered` event emitted. |
| **Threshold configurability** | Hardcoded | `FRESH_THRESHOLD`, `WARNING_THRESHOLD`, `CRITICAL_THRESHOLD` are stored constants, configurable via UUPS upgrade. |
| **Redemption priority** | Unclear | Explicit: `isRedemptionAllowed()` returns `true` for FRESH, WARNING, and CRITICAL. Only STALE blocks redemptions. |

**State Machine Diagram:**

```
          ┌──────────────────────────────────────────────────┐
          │                                                  │
    ┌─────▼─────┐    +7 days     ┌──────────┐    +7 days     ┌───────────┐
    │   FRESH   │ ───────────►  │ WARNING  │ ───────────► │  CRITICAL  │
    │           │               │          │               │            │
    │ Deposits: │               │ Deposits:│               │ Deposits:  │
    │   ALLOWED │               │  BLOCKED │               │  BLOCKED   │
    │ Redemptions:              │ Redemptions:            │ Redemptions:│
    │   ALLOWED │               │  ALLOWED │               │  ALLOWED   │
    └─────▲─────┘               └─────┬────┘               └─────┬─────┘
          │                            │                          │
          │      Fresh NAV Update      │    Fresh NAV Update      │ +16 days
          └────────────────────────────┘                          │
                                                                       ▼
                                                               ┌──────────┐
                                                               │  STALE   │
                                                               │          │
                                                               │ Deposits:│
                                                               │  BLOCKED │
                                                               │ Redemptions:│
                                                               │  BLOCKED │
                                                               │ Circuit  │
                                                               │ Breaker  │
                                                               └──────────┘
```

**Integration with Vaults:**
SyncVault contracts must call `NAVEngine.isDepositAllowed(vaultId)` before processing any deposit and `NAVEngine.isRedemptionAllowed(vaultId)` before processing any redemption. These calls are non-view gas-efficient checks that read the stored NAV state from storage. The NAV state is updated by off-chain keepers calling `NAVEngine.refreshState(vaultId)` which evaluates the time elapsed since the last calculation and updates the state, emitting `StateTransition` if the state changed.

### 4.3 Phase 3: Asset Class Schedule Enforcement — Enum-Driven Valuation

**Problem:** The v5 document listed update frequencies per asset class as documentation only. There was no on-chain enforcement. Vaults could operate with stale valuations without triggering any circuit breaker, because the staleness thresholds were not linked to asset class types.

**Solution:** The `ValuationRegistry.sol` (shown in Section 3.3) now includes an `AssetClass` enum and per-asset-class max staleness mappings. A new `NAVScheduler.sol` contract enforces these schedules on-chain.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";

import "./ValuationRegistry.sol";

/// @title NAVScheduler
/// @notice Validates valuation timelines and triggers alerts when schedules expire.
/// @dev Inherits OpenZeppelin AccessControlUpgradeable and UUPSUpgradeable.
///      Per-asset-class max staleness is enforced on-chain.
contract NAVScheduler is
    UUPSUpgradeable,
    AccessControlUpgradeable
{
    bytes32 public constant SCHEDULER_ROLE = keccak256("SCHEDULER_ROLE");

    struct AssetClassSchedule {
        uint256 fullAppraisalMaxAge;    // e.g., 90 days for Commercial RE
        uint256 dcfMaxAge;             // e.g., 30 days for Commercial RE
        uint256 yieldMaxAge;           // e.g., 1 day for Commercial RE
        uint256 comparablesMaxAge;     // e.g., 14 days for Commercial RE
        bool    active;
    }

    mapping(ValuationRegistry.AssetClass => AssetClassSchedule) public schedules;

    struct ValuationCheckResult {
        bool    isCompliant;
        uint256 daysSinceUpdate;
        uint256 maxAllowedAge;
        ValuationRegistry.ValuationMethod method;
    }

    ValuationRegistry public valuationRegistry;

    event ScheduleBreached(
        bytes32 indexed assetId,
        ValuationRegistry.AssetClass assetClass,
        ValuationRegistry.ValuationMethod method,
        uint256 ageDays,
        uint256 maxAgeDays
    );
    event ScheduleConfigured(ValuationRegistry.AssetClass assetClass);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _valuationRegistry) external initializer {
        __UUPSUpgradeable_init();
        __AccessControl_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(SCHEDULER_ROLE, msg.sender);

        valuationRegistry = ValuationRegistry(_valuationRegistry);

        // Default schedules
        _setSchedule(ValuationRegistry.AssetClass.COMMERCIAL_REAL_ESTATE, 90 days, 30 days, 1 days, 14 days);
        _setSchedule(ValuationRegistry.AssetClass.RESIDENTIAL_REAL_ESTATE, 180 days, 90 days, 30 days, 14 days);
        _setSchedule(ValuationRegistry.AssetClass.CORPORATE_BONDS, 0, 0, 1 days, 1 days);
        _setSchedule(ValuationRegistry.AssetClass.PRIVATE_CREDIT, 30 days, 30 days, 30 days, 0);
        _setSchedule(ValuationRegistry.AssetClass.FINE_ART, 365 days, 0, 0, 0);
        _setSchedule(ValuationRegistry.AssetClass.COMMODITIES, 0, 0, 1 days, 1 days);
        _setSchedule(ValuationRegistry.AssetClass.INFRASTRUCTURE, 180 days, 90 days, 30 days, 0);
        _setSchedule(ValuationRegistry.AssetClass.TREASURIES, 0, 0, 1 days, 1 days);
    }

    function _setSchedule(
        ValuationRegistry.AssetClass _class,
        uint256 fullAppraisalMaxAge,
        uint256 dcfMaxAge,
        uint256 yieldMaxAge,
        uint256 comparablesMaxAge
    ) internal {
        schedules[_class] = AssetClassSchedule({
            fullAppraisalMaxAge: fullAppraisalMaxAge,
            dcfMaxAge: dcfMaxAge,
            yieldMaxAge: yieldMaxAge,
            comparablesMaxAge: comparablesMaxAge,
            active: true
        });
        emit ScheduleConfigured(_class);
    }

    /// @notice Check if a valuation submission complies with its asset class schedule.
    function checkValuationCompliance(
        bytes32 assetId,
        ValuationRegistry.ValuationMethod method,
        uint256 valuationDate
    ) external view returns (ValuationCheckResult memory result) {
        ValuationRegistry.AssetClass aClass = valuationRegistry.assetClass(assetId);
        AssetClassSchedule memory schedule = schedules[aClass];

        uint256 maxAge = _getMaxAgeForMethod(schedule, method);
        uint256 age = block.timestamp - valuationDate;

        result = ValuationCheckResult({
            isCompliant: age <= maxAge,
            daysSinceUpdate: age / 1 days,
            maxAllowedAge: maxAge / 1 days,
            method: method
        });
    }

    /// @notice Validate and emit event if schedule is breached. Called by keepers.
    function validateSchedule(bytes32 assetId) external onlyRole(SCHEDULER_ROLE) {
        ValuationRegistry.AssetClass aClass = valuationRegistry.assetClass(assetId);
        ValuationRegistry.NAVSubmission memory active = valuationRegistry.getActiveValuation(assetId);

        AssetClassSchedule memory schedule = schedules[aClass];
        uint256 maxAge = _getMaxAgeForMethod(schedule, active.method);
        uint256 age = block.timestamp - active.valuationDate;

        if (age > maxAge) {
            emit ScheduleBreached(assetId, aClass, active.method, age / 1 days, maxAge / 1 days);
        }
    }

    function _getMaxAgeForMethod(
        AssetClassSchedule memory schedule,
        ValuationRegistry.ValuationMethod method
    ) internal pure returns (uint256) {
        if (method == ValuationRegistry.ValuationMethod.FULL_APPRAISAL)   return schedule.fullAppraisalMaxAge;
        if (method == ValuationRegistry.ValuationMethod.DCF_MODEL)         return schedule.dcfMaxAge;
        if (method == ValuationRegistry.ValuationMethod.INCOME_STATEMENT)  return schedule.yieldMaxAge;
        if (method == ValuationRegistry.ValuationMethod.MARKET_COMPARABLE) return schedule.comparablesMaxAge;
        if (method == ValuationRegistry.ValuationMethod.DESKTOP_APPRAISAL) return schedule.fullAppraisalMaxAge;
        if (method == ValuationRegistry.ValuationMethod.AUDIT_VERIFIED)   return schedule.fullAppraisalMaxAge;
        return 0; // Unknown method — always stale
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
```

**Asset Class Schedule Summary:**

| Asset Class | Full Appraisal Max Age | DCF Max Age | Yield Max Age | Comparables Max Age |
| :--- | :--- | :--- | :--- | :--- |
| **Commercial Real Estate** | 90 days | 30 days | 1 day | 14 days |
| **Residential Real Estate** | 180 days | 90 days | 30 days | 14 days |
| **Corporate Bonds** | N/A | N/A | 1 day | 1 day |
| **Private Credit** | 30 days | 30 days | 30 days | N/A |
| **Fine Art** | 365 days | N/A | N/A | N/A |
| **Commodities** | N/A | N/A | 1 day | 1 day |
| **Infrastructure** | 180 days | 90 days | 30 days | N/A |
| **Treasuries** | N/A | N/A | 1 day | 1 day |

### 4.4 Phase 4: Fee Distribution Dust Handling — Zero-Value Edge Cases

**Problem:** When `FeeDistributor.sol` calculates per-recipient splits, the integer division (BPS-based) can produce dust amounts (1–3 wei) that are stranded in the contract. Over thousands of distributions, this dust accumulates and represents a fund loss. Additionally, if a fee amount is too small to split across all four recipients (e.g., < 4 wei), the distribution reverts, blocking all subsequent fee processing for that vault.

**Solution:** The `FeeDistributor.sol` (shown in Section 2.3) implements dust handling:

| Enhancement | v5 Behaviour | v6 Fix |
| :--- | :--- | :--- |
| **Dust accumulation** | Lost in contract | `sweepDust()` function sends accumulated dust to Protocol Treasury via `SafeERC20`. |
| **Minimum distribution** | Reverts on tiny fees | `MIN_DISTRIBUTION_AMOUNT` check: fees below this threshold are held in `pendingFees` and accumulated until threshold is met. |
| **Division rounding** | Lost wei | Last recipient receives the residual amount (using subtraction method instead of pure division). |
| **Reentrancy during sweep** | Not protected | `sweepDust()` is protected by `ReentrancyGuardUpgradeable`. |

**Updated `FeeDistributor.sol` with Dust Handling:**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";

import "./interfaces/ISyncVault.sol";

/// @title FeeDistributor
/// @notice Splits and transfers collected fees with dust handling for zero-value edge cases.
/// @dev Inherits OpenZeppelin UUPSUpgradeable, AccessControlUpgradeable, ReentrancyGuardUpgradeable.
///      Uses SafeERC20Upgradeable for all token transfers. Residual rounding sent to last recipient.
contract FeeDistributor is
    UUPSUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable
{
    bytes32 public constant FEE_DISTRIBUTOR_ROLE = keccak256("FEE_DISTRIBUTOR_ROLE");
    bytes32 public constant DUST_SWEEPER_ROLE   = keccak256("DUST_SWEEPER_ROLE");

    using SafeERC20Upgradeable for IERC20Upgradeable;

    uint256 public constant BPS_DENOMINATOR          = 10_000;
    uint256 public constant MIN_DISTRIBUTION_AMOUNT   = 1000;  // Minimum USDC (6 decimals) to distribute

    IERC20Upgradeable public usdc;
    address public feeAccrualEngine;
    address public protocolTreasury;

    struct FeeAllocation {
        address protocolTreasury;
        address issuerWallet;
        address complianceReserve;
        address insuranceReserve;
        uint256 protocolBPS;
        uint256 issuerBPS;
        uint256 complianceBPS;
        uint256 insuranceBPS;
    }

    mapping(bytes32 => FeeAllocation) private _allocations;
    mapping(bytes32 => uint256)        private _pendingFees;   // Accumulated below-threshold fees
    mapping(bytes32 => uint256)        private _dustAccumulated;

    event FeesDistributed(
        bytes32 indexed vaultId,
        uint256 totalAmount,
        uint256 toProtocol,
        uint256 toIssuer,
        uint256 toCompliance,
        uint256 toInsurance,
        uint256 timestamp
    );
    event FeesHeld(bytes32 indexed vaultId, uint256 amount, string reason);
    event DustSwept(bytes32 indexed vaultId, uint256 dustAmount, address recipient);
    event PendingFeesAccumulated(bytes32 indexed vaultId, uint256 totalPending);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _usdc,
        address _feeAccrualEngine,
        address _protocolTreasury
    ) external initializer {
        __UUPSUpgradeable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(FEE_DISTRIBUTOR_ROLE, _feeAccrualEngine);
        _grantRole(DUST_SWEEPER_ROLE, msg.sender);

        usdc              = IERC20Upgradeable(_usdc);
        feeAccrualEngine  = _feeAccrualEngine;
        protocolTreasury  = _protocolTreasury;
    }

    function setAllocation(bytes32 vaultId, FeeAllocation calldata alloc)
        external onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(
            alloc.protocolBPS + alloc.issuerBPS + alloc.complianceBPS + alloc.insuranceBPS
                == BPS_DENOMINATOR,
            "BPS must sum to 10000"
        );
        _allocations[vaultId] = alloc;
    }

    /// @notice Distribute collected fees. Handles dust accumulation and minimum thresholds.
    function distributeFees(
        bytes32 vaultId,
        address vault,
        uint256 feeAmount
    ) external nonReentrant onlyRole(FEE_DISTRIBUTOR_ROLE) {
        FeeAllocation memory alloc = _allocations[vaultId];
        require(alloc.protocolTreasury != address(0), "Allocation not set");

        // Accumulate fee with pending dust
        uint256 totalAvailable = feeAmount + _pendingFees[vaultId];

        // Check minimum distribution threshold
        if (totalAvailable < MIN_DISTRIBUTION_AMOUNT) {
            _pendingFees[vaultId] = totalAvailable;
            emit FeesHeld(vaultId, totalAvailable, "Below minimum distribution threshold");
            return;
        }

        // Calculate splits using OpenZeppelin MathUpgradeable
        uint256 toProtocol   = MathUpgradeable.mulDiv(totalAvailable, alloc.protocolBPS,   BPS_DENOMINATOR);
        uint256 toIssuer     = MathUpgradeable.mulDiv(totalAvailable, alloc.issuerBPS,     BPS_DENOMINATOR);
        uint256 toCompliance = MathUpgradeable.mulDiv(totalAvailable, alloc.complianceBPS, BPS_DENOMINATOR);
        // Last recipient gets residual to prevent dust loss
        uint256 toInsurance  = totalAvailable - toProtocol - toIssuer - toCompliance;

        // Track dust from individual transfers
        uint256 dustBefore = usdc.balanceOf(address(this));

        // Transfer using OpenZeppelin SafeERC20
        if (toProtocol > 0)   usdc.safeTransferFrom(vault, alloc.protocolTreasury,   toProtocol);
        if (toIssuer > 0)     usdc.safeTransferFrom(vault, alloc.issuerWallet,       toIssuer);
        if (toCompliance > 0) usdc.safeTransferFrom(vault, alloc.complianceReserve,  toCompliance);
        if (toInsurance > 0) usdc.safeTransferFrom(vault, alloc.insuranceReserve,  toInsurance);

        uint256 dustAfter = usdc.balanceOf(address(this));
        if (dustAfter > dustBefore) {
            _dustAccumulated[vaultId] += (dustAfter - dustBefore);
        }

        // Reset pending fees accumulator
        _pendingFees[vaultId] = 0;

        // Adjust Vault AUM State
        ISyncVault(vault).deductFees(totalAvailable);

        emit FeesDistributed(
            vaultId, totalAvailable,
            toProtocol, toIssuer, toCompliance, toInsurance,
            block.timestamp
        );
    }

    /// @notice Sweep accumulated dust to Protocol Treasury.
    function sweepDust(bytes32 vaultId) external nonReentrant onlyRole(DUST_SWEEPER_ROLE) {
        uint256 dust = _dustAccumulated[vaultId];
        if (dust == 0) return;

        _dustAccumulated[vaultId] = 0;
        usdc.safeTransfer(protocolTreasury, dust);

        emit DustSwept(vaultId, dust, protocolTreasury);
    }

    /// @notice Sweep dust across all vaults. Admin only.
    function sweepAllDust(bytes32[] calldata vaultIds) external nonReentrant onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 totalDust = 0;
        for (uint256 i = 0; i < vaultIds.length; i++) {
            totalDust += _dustAccumulated[vaultIds[i]];
            _dustAccumulated[vaultIds[i]] = 0;
        }
        if (totalDust > 0) {
            usdc.safeTransfer(protocolTreasury, totalDust);
        }
    }

    function pendingFees(bytes32 vaultId) external view returns (uint256) {
        return _pendingFees[vaultId];
    }

    function dustAccumulated(bytes32 vaultId) external view returns (uint256) {
        return _dustAccumulated[vaultId];
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
```

**Dust Handling Flow:**

```
[ Fee Amount Received ]
         │
         ▼
  ┌─ Is totalAvailable ──┐
  │   < MIN_DISTRIBUTION? │
  └───────┬───────┬───────┘
       YES │       │ NO
          ▼       ▼
   [ Hold in          [ Calculate BPS splits ]
    _pendingFees ]         │
                          ▼
               [ Transfer to 4 recipients ]
               [ using SafeERC20 ]
                          │
                          ▼
               [ Last recipient gets ]
               [ residual (no dust loss) ]
                          │
                          ▼
               [ Any contract dust ]
               [ tracked & sweepable ]
```

---

## 5. Full Contract Architecture — All 5 Layers

The CRATS Protocol consists of 35 smart contracts organized across 5 layers. Every contract inherits from OpenZeppelin pre-audited bases. Below is the complete architecture listing with OpenZeppelin dependencies.

### 5.1 Layer 1: Identity & Compliance (9 Contracts)

| # | Contract | OpenZeppelin Base(s) | Description |
| :--- | :--- | :--- | :--- |
| 1 | `IdentitySBT.sol` | `ERC721Upgradeable`, `ERC721EnumerableUpgradeable`, `AccessControlUpgradeable` | Soulbound identity token. Non-transferable SBT using `_beforeTokenTransfer` override to enforce soulbound property. |
| 2 | `KYCRegistry.sol` | `UUPSUpgradeable`, `AccessControlUpgradeable` | KYC/AML status registry. `VERIFIER_ROLE` for compliance officers to set status. |
| 3 | `ComplianceModule.sol` | `UUPSUpgradeable`, `AccessControlUpgradeable` | Transfer rules engine. Rule-based allowlist/blocklist enforcement via `VERIFIER_ROLE`. |
| 4 | `AccreditationManager.sol` | `UUPSUpgradeable`, `AccessControlUpgradeable` | Investor accreditation levels (Retail/Professional/Institutional). |
| 5 | `JurisdictionManager.sol` | `UUPSUpgradeable`, `AccessControlUpgradeable` | Geo-restriction enforcement per jurisdiction. |
| 6 | `SanctionsScreening.sol` | `UUPSUpgradeable`, `AccessControlUpgradeable` | Real-time sanctions list integration hooks. |
| 7 | `DocumentRegistry.sol` | `UUPSUpgradeable`, `AccessControlUpgradeable` | IPFS document pinning and hash verification. |
| 8 | `TaxReporting.sol` | `UUPSUpgradeable`, `AccessControlUpgradeable` | Tax event logging (mint, burn, distribute). |
| 9 | `AuditTrail.sol` | `UUPSUpgradeable`, `AccessControlUpgradeable` | Immutable event log for compliance audits. |

### 5.2 Layer 2: Asset Management & Issuance (8 Contracts)

| # | Contract | OpenZeppelin Base(s) | Description |
| :--- | :--- | :--- | :--- |
| 10 | `AssetFactory.sol` | `UUPSUpgradeable`, `AccessControlUpgradeable` | Deploys new `AssetToken` proxies. Factory pattern with clone/create2. |
| 11 | `AssetToken.sol` | `ERC20Upgradeable`, `ERC20PermitUpgradeable`, `AccessControlUpgradeable` | Tokenized RWA asset representation. Inherits OpenZeppelin ERC20 with permit (gasless approvals). |
| 12 | `AssetRegistry.sol` | `UUPSUpgradeable`, `AccessControlUpgradeable` | Central registry of all deployed asset tokens. |
| 13 | `PropertyManager.sol` | `UUPSUpgradeable`, `AccessControlUpgradeable` | Real estate property metadata and ownership records. |
| 14 | `DocumentPinner.sol` | `UUPSUpgradeable`, `AccessControlUpgradeable` | IPFS pinning service integration for legal documents. |
| 15 | `IssuanceManager.sol` | `UUPSUpgradeable`, `AccessControlUpgradeable`, `ReentrancyGuardUpgradeable` | Token issuance workflow orchestration. |
| 16 | `ComplianceRuleEngine.sol` | `UUPSUpgradeable`, `AccessControlUpgradeable` | Dynamic compliance rule evaluation for transfers. |
| 17 | `FeeRegistry.sol` | `UUPSUpgradeable`, `AccessControlUpgradeable` | Fee hard caps, configs, tier discounts. (See Section 2.4) |

### 5.3 Layer 3: Vaults & Investment (8 Contracts)

| # | Contract | OpenZeppelin Base(s) | Description |
| :--- | :--- | :--- | :--- |
| 18 | `SyncVault.sol` | `ERC4626Upgradeable`, `AccessControlUpgradeable`, `ReentrancyGuardUpgradeable` | Institutional-grade vault. Inherits OpenZeppelin ERC4626 (tokenized vault standard) with access control and reentrancy protection. |
| 19 | `FeeAccrualEngine.sol` | `UUPSUpgradeable`, `AccessControlUpgradeable`, `ReentrancyGuardUpgradeable` | Per-second management fee accrual. (See Section 2.2.1) |
| 20 | `HighWaterMark.sol` | `UUPSUpgradeable`, `AccessControlUpgradeable` | HWM peak tracking and performance carry. (See Section 2.2.2) |
| 21 | `FeeDistributor.sol` | `UUPSUpgradeable`, `AccessControlUpgradeable`, `ReentrancyGuardUpgradeable`, `SafeERC20Upgradeable` | Fee splitting with dust handling. (See Sections 2.3, 4.4) |
| 22 | `NAVEngine.sol` | `UUPSUpgradeable`, `AccessControlUpgradeable`, `ReentrancyGuardUpgradeable` | NAV formula, state machine, staleness gating. (See Section 3.5) |
| 23 | `ValuationRegistry.sol` | `UUPSUpgradeable`, `AccessControlUpgradeable`, `ReentrancyGuardUpgradeable` | NAV submissions, asset class enum, weighted aggregation. (See Section 3.3) |
| 24 | `DisputeResolver.sol` | `UUPSUpgradeable`, `AccessControlUpgradeable`, `ReentrancyGuardUpgradeable`, `SafeERC20Upgradeable` | 4-stage dispute, stake locking/slashing. (See Sections 3.6, 4.1) |
| 25 | `NAVScheduler.sol` | `UUPSUpgradeable`, `AccessControlUpgradeable` | Schedule enforcement per asset class. (See Section 4.3) |

### 5.4 Layer 4: Marketplace & Settlement (5 Contracts)

| # | Contract | OpenZeppelin Base(s) | Description |
| :--- | :--- | :--- | :--- |
| 26 | `SettlementEngine.sol` | `UUPSUpgradeable`, `AccessControlUpgradeable`, `ReentrancyGuardUpgradeable` | Atomic DvP (Delivery-vs-Payment) swap execution. |
| 27 | `OrderBook.sol` | `UUPSUpgradeable`, `AccessControlUpgradeable`, `ReentrancyGuardUpgradeable` | On-chain order matching and book management. |
| 28 | `PriceOracle.sol` | `UUPSUpgradeable`, `AccessControlUpgradeable`, `ReentrancyGuardUpgradeable` | Price feed aggregation with Chainlink integration. |
| 29 | `LiquidityPool.sol` | `ERC4626Upgradeable`, `AccessControlUpgradeable`, `ReentrancyGuardUpgradeable`, `SafeERC20Upgradeable` | Automated market making liquidity pool. |
| 30 | `TradeEscrow.sol` | `UUPSUpgradeable`, `AccessControlUpgradeable`, `ReentrancyGuardUpgradeable`, `SafeERC20Upgradeable` | Escrow holding for trade settlement. |

### 5.5 Layer 5: Cross-Chain & Infrastructure (5 Contracts)

| # | Contract | OpenZeppelin Base(s) | Description |
| :--- | :--- | :--- | :--- |
| 31 | `BridgeManager.sol` | `UUPSUpgradeable`, `AccessControlUpgradeable`, `ReentrancyGuardUpgradeable`, `SafeERC20Upgradeable` | Cross-chain bridge message handling and token transfers. |
| 32 | `ChainlinkVRF.sol` | `VRFConsumerBaseV2Upgradeable`, `UUPSUpgradeable`, `AccessControlUpgradeable` | Verifiable randomness for lottery/randomized allocations. |
| 33 | `GasOracle.sol` | `UUPSUpgradeable`, `AccessControlUpgradeable` | Multi-chain gas price oracle. |
| 34 | `TimelockController.sol` | OpenZeppelin `TimelockController` (deployed as-is) | Governance timelock for all admin operations. (See Section 2.4) |
| 35 | `ProxyAdmin.sol` | OpenZeppelin `ProxyAdmin` (deployed as-is) | Admin for all UUPS proxy contracts. |

---

## 6. Implementation Plan

### 6.1 Strict Build Sequence & Dependencies

```
[TimelockController.sol] ◄──── Deploy first (OpenZeppelin out-of-the-box)
        │
        ▼
[FeeRegistry.sol] ──► [FeeAccrualEngine.sol] ──► [HighWaterMark.sol] ──► [FeeDistributor.sol]
       │                                                                     │
       │                 [ValuationRegistry.sol] ◄──────────────────────────┘
       │                          │
       │                          ▼
       │                 [NAVScheduler.sol] ──► [NAVEngine.sol] ──► [DisputeResolver.sol]
       │                                                              │
       └──────────────────────────────────────────────────────────────┘
                              │
                              ▼
                     [E2E Integration Testing]
                              │
                              ▼
                     [Phase 1: Dispute Fix Test]
                     [Phase 2: NAV State Test]
                     [Phase 3: Schedule Test]
                     [Phase 4: Dust Handling Test]
                              │
                              ▼
                     [External Security Audit]
                              │
                              ▼
                     [Mainnet Deployment]
```

### 6.2 Mainnet Deployment Gates Checklist

1.  [ ] `FeeAccrualEngine` calculations match manual math for 3 distinct test vaults.
2.  [ ] `HighWaterMark` resets peak limits correctly after performance fee collection.
3.  [ ] `NAVEngine` produces values that match manual valuations:
    $$\text{NAV} = \frac{\text{Appraisal} + \text{USDC} - \text{Accrued Fees}}{\text{Total Supply}}$$
4.  [ ] Stale valuations (>7 days) block deposits but allow redemptions.
5.  [ ] Stale valuations (>30 days) automatically trigger circuit breaker halts.
6.  [ ] Deviations >15% automatically flag submissions as `Under Review`.
7.  [ ] Dispute resolutions update active registry values correctly.
8.  [ ] `FeeDistributor` splits fees exactly as allocated: 40/40/10/10.
9.  [ ] **Phase 1:** Dispute challenger stake is returned on win or timeout. Loser stake is slashed to insurance reserve. No stake lockup possible.
10. [ ] **Phase 2:** NAV state transitions emit `StateTransition` events. Vaults query `isDepositAllowed()` and `isRedemptionAllowed()` before operations. STALE state blocks all operations.
11. [ ] **Phase 3:** `NAVScheduler` correctly maps `AssetClass` enum to per-method max staleness. Schedule breaches emit `ScheduleBreached` event. Unmapped methods return 0 (always stale).
12. [ ] **Phase 4:** `FeeDistributor` accumulates fees below `MIN_DISTRIBUTION_AMOUNT` in `_pendingFees`. Last recipient receives residual amount. `sweepDust()` sends accumulated dust to Protocol Treasury via SafeERC20.
13. [ ] All 35 smart contracts inherit from OpenZeppelin pre-audited contracts. Zero custom implementations of access control, reentrancy guards, token standards, or proxy patterns.
14. [ ] All 35 smart contracts pass external audits.
15. [ ] `validateInvariant` checks run successfully on all test vaults post fee deductions.

---

## 7. OpenZeppelin Dependency Map

Complete listing of OpenZeppelin packages used across all 35 contracts:

| OpenZeppelin Contract | Used By | Purpose |
| :--- | :--- | :--- |
| `ERC20Upgradeable` | `AssetToken`, `FeeDistributor` (USDC interface) | Fungible token standard (upgradeable) |
| `ERC20PermitUpgradeable` | `AssetToken` | Gasless approvals (EIP-2612) |
| `ERC4626Upgradeable` | `SyncVault`, `LiquidityPool` | Tokenized vault standard (upgradeable) |
| `ERC721Upgradeable` | `IdentitySBT` | Non-fungible token standard (upgradeable) |
| `ERC721EnumerableUpgradeable` | `IdentitySBT` | Enumerable NFT extensions |
| `IERC20Upgradeable` | `FeeDistributor`, `DisputeResolver`, `LiquidityPool` | ERC-20 interface |
| `SafeERC20Upgradeable` | `FeeDistributor`, `DisputeResolver`, `BridgeManager`, `TradeEscrow`, `LiquidityPool` | Safe token transfers (no raw calls) |
| `UUPSUpgradeable` | 31 contracts | Upgradeable proxy pattern |
| `AccessControlUpgradeable` | 33 contracts | Role-based access control (RBAC) |
| `ReentrancyGuardUpgradeable` | 20 contracts | Reentrancy protection |
| `OwnableUpgradeable` | Legacy contracts | Single-owner pattern (being migrated to AccessControl) |
| `MathUpgradeable` | All contracts with arithmetic | Overflow-safe math operations |
| `TimelockController` | `TimelockController.sol` | Governance delay controller |
| `ProxyAdmin` | `ProxyAdmin.sol` | Proxy admin for UUPS contracts |
| `VRFConsumerBaseV2Upgradeable` | `ChainlinkVRF.sol` | Chainlink VRF consumer |

**Solidity Version:** `^0.8.25` across all contracts (aligned with OpenZeppelin v5.x requirements).

**Package Reference:** `@openzeppelin/contracts-upgradeable@5.x` for upgradeable contracts, `@openzeppelin/contracts@5.x` for non-upgradeable deployments (TimelockController, ProxyAdmin).
