# TECHNICAL SPECIFICATION
# CRATS PROTOCOL: Architecture Specification
## Section A: Tokenomics & Fee Structure
## Section B: NAV Calculation Methodology

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
   - 2.7 New Smart Contracts Required (Section A)
3. [Section B: NAV Calculation Methodology](#section-b---nav-calculation-methodology)
   - 3.1 Gap Analysis: Current vs. Required
   - 3.2 Verification Formula Definition
   - 3.3 Off-Chain to On-Chain Valuation Bridge (`ValuationRegistry.sol`)
   - 3.4 Multi-Source Weighted NAV Aggregation
   - 3.5 Staleness Detection & Trading Restrictions
   - 3.6 NAV Dispute Resolution Process (`DisputeResolver.sol`)
   - 3.7 NAV Update Frequency Schedule by Asset Class
   - 3.8 New Smart Contracts Required (Section B)
4. [Implementation Plan](#implementation-plan)
   - 4.1 Strict Build Sequence & Dependencies
   - 4.2 Mainnet Deployment Gates Checklist

---

## 1. Executive Summary

This specification defines two missing financial architecture layers for the CRATS Protocol. Neither layer exists in the current codebase. Both are greenfield developments required to comply with regulatory mandates and secure commitments from institutional investors.

| Section | Topic | Missing Components | Risk if Not Built |
| :--- | :--- | :--- | :--- |
| **A** | Tokenomics & Fee Structure | `FeeRegistry`, `FeeAccrualEngine`, `HighWaterMark`, `FeeDistributor` | No protocol revenue model. NAV quotes are overstated. LP due diligence checks fail. |
| **B** | NAV Calculation Methodology | `NAVEngine`, `ValuationRegistry`, `DisputeResolver`, `NAVScheduler` | Stale/incorrect asset pricing. Regulatory misrepresentation. Investor capital losses. |

> [!WARNING]  
> **Critical Development Sequence Gate:**  
> These specifications represent greenfield contracts. Do not begin development on Section B (NAV Calculation) until Section A (Fee Accrual) is fully compiled and tested. The `NAVEngine` depends directly on output from the `FeeAccrualEngine` and `HighWaterMark` to calculate accurate, net-of-fee NAV figures.

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
To align with institutional ERC-4626 specifications, management fees accrue per second. This prevents "fee arbitrage" where users enter and exit vaults right around fee collection dates.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

// Code Interface inside FeeAccrualEngine.sol
contract FeeAccrualEngine {
    uint256 public constant SECONDS_PER_YEAR = 31_536_000;
    uint256 public constant BPS_DENOMINATOR  = 10_000;

    struct VaultFeeConfig {
        address vault;
        uint256 mgmtFeeBPS;             // e.g., 200 BPS = 2%
        uint256 lastAccrualTimestamp;
    }

    mapping(bytes32 => VaultFeeConfig) private _configs;
    mapping(bytes32 => uint256) private _pendingFees;

    event FeeAccrued(bytes32 indexed vaultId, uint256 amount, uint256 timestamp);

    /**
     * @notice Calculate accrued management fee for a vault since its last checkpoint
     */
    function accruedManagementFee(bytes32 vaultId) public view returns (uint256 feeAmount) {
        VaultFeeConfig memory cfg = _configs[vaultId];
        if (cfg.lastAccrualTimestamp == 0) return 0;
        
        uint256 elapsed = block.timestamp - cfg.lastAccrualTimestamp;
        uint256 currentAUM = ISyncVault(cfg.vault).totalAssets();

        feeAmount = (currentAUM * cfg.mgmtFeeBPS * elapsed) 
                    / (BPS_DENOMINATOR * SECONDS_PER_YEAR);
    }

    /**
     * @notice Checkpoint updates the pending fee pool and resets the clock.
     * Must be called by vaults before minting, burning, depositing, or distributing yield.
     */
    function checkpoint(bytes32 vaultId) external {
        uint256 fee = accruedManagementFee(vaultId);
        _pendingFees[vaultId] += fee;
        _configs[vaultId].lastAccrualTimestamp = block.timestamp;
        emit FeeAccrued(vaultId, fee, block.timestamp);
    }
}
```

#### 2.2.2 High-Water Mark Performance Fee Model
Performance fees are subject to a strict High-Water Mark (HWM). Fees can only be assessed on gains above the absolute highest NAV per share ever recorded by the vault.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

contract HighWaterMark {
    uint256 public constant BPS_DENOMINATOR = 10_000;

    struct HWMRecord {
        uint256 highWaterMarkNAV;   // Highest NAV per share (18 decimal precision)
        uint256 lastUpdated;
        uint256 performanceFeeBPS;  // e.g., 2000 = 20%
        uint256 hurdleRateBPS;      // e.g., 800 = 8%
    }

    mapping(bytes32 => HWMRecord) private _hwm;

    event HWMUpdated(bytes32 indexed vaultId, uint256 newNAV);

    /**
     * @notice Calculate performance fee carry based on gain above high-water mark
     */
    function calculatePerformanceFee(
        bytes32 vaultId,
        uint256 currentNAVPerShare,
        uint256 totalSupply
    ) external view returns (uint256 feeAmount) {
        HWMRecord memory rec = _hwm[vaultId];
        
        // Return 0 if NAV has not exceeded historical high-water mark
        if (currentNAVPerShare <= rec.highWaterMarkNAV) return 0;

        uint256 gainPerShare = currentNAVPerShare - rec.highWaterMarkNAV;
        uint256 totalGain = (gainPerShare * totalSupply) / 1e18;

        feeAmount = (totalGain * rec.performanceFeeBPS) / BPS_DENOMINATOR;
    }

    /**
     * @notice Reset the high-water mark peak after carry distribution is processed
     */
    function updateHWM(bytes32 vaultId, uint256 newNAV) external {
        if (newNAV > _hwm[vaultId].highWaterMarkNAV) {
            _hwm[vaultId].highWaterMarkNAV = newNAV;
            _hwm[vaultId].lastUpdated = block.timestamp;
            emit HWMUpdated(vaultId, newNAV);
        }
    }
}
```

#### A.2.3 Hurdle Rate Logic
When `hurdleRateBPS` is defined (e.g. 800 BPS = 8% annual hurdle), the performance fee is *only* assessed on gains that exceed this hurdle rate.
*   **Real Estate Vaults:** Default to standard **HWM Model** (captures raw real-estate price appreciation).
*   **Credit & Bond Vaults:** Default to **Hurdle Rate Model** (ensures investors receive fixed-income floor yields before carry is charged).

#### A.2.4 Fee in NAV - Collection Models
*   **Method A (Share Minting):** The vault mints new shares directly to the platform's fee address. This dilutes existing shareholders proportionally. *Used exclusively for Performance Fees.*
*   **Method B (Asset Deduction):** Fees are deducted directly from the vault’s underlying assets (`totalAssets`). This lowers the NAV per share directly. *Used as the default for Management Fees.*

### 2.3 Fee Distribution Mechanics

All collected fees are processed by `FeeDistributor.sol` and routed across four recipients:

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

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ISyncVault {
    function deductFees(uint256 amount) external;
}

contract FeeDistributor {
    uint256 public constant BPS_DENOMINATOR = 10_000;
    address public usdc;
    address public feeAccrualEngine;

    struct FeeAllocation {
        address protocolTreasury;
        address issuerWallet;
        address complianceReserve;
        address insuranceReserve;
        uint256 protocolBPS;     // 4000 = 40%
        uint256 issuerBPS;       // 4000 = 40%
        uint256 complianceBPS;   // 1000 = 10%
        uint256 insuranceBPS;    // 1000 = 10%
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

    modifier onlyFeeAccrualEngine() {
        require(msg.sender == feeAccrualEngine, "FeeDistributor: only accrual engine");
        _;
    }

    function distributeFees(bytes32 vaultId, address vault, uint256 feeAmount) external onlyFeeAccrualEngine {
        FeeAllocation memory alloc = _allocations[vaultId];

        uint256 toProtocol   = (feeAmount * alloc.protocolBPS)   / BPS_DENOMINATOR;
        uint256 toIssuer     = (feeAmount * alloc.issuerBPS)     / BPS_DENOMINATOR;
        uint256 toCompliance = (feeAmount * alloc.complianceBPS) / BPS_DENOMINATOR;
        uint256 toInsurance  = (feeAmount * alloc.insuranceBPS)  / BPS_DENOMINATOR;

        // Route USDC out of vault
        IERC20(usdc).transferFrom(vault, alloc.protocolTreasury,   toProtocol);
        IERC20(usdc).transferFrom(vault, alloc.issuerWallet,       toIssuer);
        IERC20(usdc).transferFrom(vault, alloc.complianceReserve,  toCompliance);
        IERC20(usdc).transferFrom(vault, alloc.insuranceReserve,   toInsurance);

        // Adjust Vault AUM State (Method B Deduction)
        ISyncVault(vault).deductFees(feeAmount);

        emit FeesDistributed(vaultId, feeAmount, toProtocol, toIssuer, toCompliance, toInsurance, block.timestamp);
    }
}
```

### 2.4 Fee Governance & Hard Caps
Protocol-level hard caps are strictly hardcoded as immutable values in the contracts:

| Fee Type | Hard Cap (Max) | Governance Rule | Min Timelock Period |
| :--- | :--- | :--- | :--- |
| **Management Fee** | 300 BPS annual (3.0%) | Multi-sig (3-of-5) + Timelock | 90 Days after setting |
| **Performance Fee** | 2500 BPS (25.0%) | Multi-sig (3-of-5) + Timelock | 90 Days after setting |
| **Entry Fee** | 200 BPS (2.0%) | Multi-sig (3-of-5) + Timelock | 30 Days after setting |
| **Exit Fee** | 100 BPS (1.0%) | Multi-sig (3-of-5) + Timelock | 30 Days after setting |
| **Trading Fee** | 50 BPS (0.5%) | Multi-sig (3-of-5) + Timelock | 7 Days after setting |

### 2.5 Investor Tier & Fee Discount Structure
Fee discounts are applied dynamically in `FeeRegistry.sol` using checking logic linked to the user's Layer 1 Identity SBT (accreditation and verification status).

*   **Retail Tier (< $100K AUM):** Charged the standard, baseline vault fee rates.
*   **Professional Tier ($100K–$1M AUM):** Receives an automatic 10% discount on management fees; entry fees are waived.
*   **Institutional Tier (> $1M AUM):** Custom negotiated rates. Requires manual admin approval and database whitelist mapping.

### 2.6 LP Fee Transparency & Dashboard Requirements
The user interface must query contract states to surface the following transparent metrics:
*   *Per-Vault View:* Display Annualized Management Fee, Performance Fee Model (HWM/Hurdle BPS), Entry/Exit Fees, Lifetime fees collected, and targeted checkpoint dates.
*   *Per-Investor View:* Effective rate (with tier discounts), unpaid accrued management/performance fees, total fees paid to date, and gross vs. net returns.

### 2.7 New Smart Contracts Required (Section A)
1.  **`FeeRegistry.sol`:** Stores configs, manages tier discounts, verifies SBT status.
2.  **`FeeAccrualEngine.sol`:** Calculates and checkpoints per-block management fees.
3.  **`HighWaterMark.sol`:** Tracks HWM peaks and calculates performance carry.
4.  **`FeeDistributor.sol`:** Splits and transfers collected fees to allocations.

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

### 3.3 Off-Chain to On-Chain Valuation Bridge

The `ValuationRegistry` contract bridges audited, off-chain appraisals to the blockchain. Submissions must reference supporting document hashes hosted on IPFS.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

contract ValuationRegistry {
    enum ValuationMethod {
        FULL_APPRAISAL,     // Licensed appraiser (highest weight)
        DESKTOP_APPRAISAL,  // Remote assessment
        DCF_MODEL,          // Discounted Cash Flow
        MARKET_COMPARABLE,  // Relative sales comparison
        AUDIT_VERIFIED,     // Financial statement auditing
        INCOME_STATEMENT    // Yield statements
    }

    struct NAVSubmission {
        uint256 assetValue;       // USD value scaled to 18 decimals
        uint256 valuationDate;    // Timestamp of valuation date
        uint256 submittedAt;      // block.timestamp
        bytes32 documentHash;     // IPFS hash of appraisal document
        address submitter;        // Authorized appraiser address
        ValuationMethod method;
        uint8 confidenceScore;    // 0 - 100 rating
        bool disputed;            // Flagged for dispute
    }

    // Historical records
    mapping(bytes32 => NAVSubmission[]) public submissionHistory;
    // Active validated valuation
    mapping(bytes32 => NAVSubmission) public activeSubmission;

    event NAVSubmitted(bytes32 indexed assetId, uint256 assetValue, ValuationMethod method, bytes32 documentHash);

    function submitNAV(
        bytes32 assetId,
        uint256 assetValue,
        uint256 valuationDate,
        bytes32 documentHash,
        ValuationMethod method
    ) external {
        // Validation logic
        NAVSubmission memory sub = NAVSubmission({
            assetValue: assetValue,
            valuationDate: valuationDate,
            submittedAt: block.timestamp,
            documentHash: documentHash,
            submitter: msg.sender,
            method: method,
            confidenceScore: _confidenceByMethod(method),
            disputed: false
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
}
```

### 3.4 Multi-Source Weighted NAV Aggregation
The registry calculates the active asset valuation by aggregating multiple inputs, applying weightings and age-based penalty factors:

*   **Full Appraisal (40% base weight):** Max age of 90 days. If expired, weight is dropped to 0% and trading is halted.
*   **DCF Model (25% base weight):** Max age of 30 days. Weight is halved if aged between 15–30 days.
*   **Rental Yield (20% base weight):** Max age of 30 days. Weight is halved if aged between 15–30 days.
*   **Market Comparables (15% base weight):** Max age of 14 days. Excluded if stale.

### 3.5 Staleness Detection & Trading Restrictions
The `NAVEngine` evaluates valuation timestamps dynamically before authorizing deposits or redemptions:

```
[ Valuation Age ] ──► < 7 Days: FRESH ────────► Normal operations
                  ──► 7-14 Days: WARNING ─────► Warn dashboard, restrict deposits
                  ──► 14-30 Days: CRITICAL ───► Block deposits, allow redemptions
                  ──► > 30 Days: STALE ───────► HALT TRADING (Circuit Breaker)
```

```solidity
enum NAVState { FRESH, WARNING, CRITICAL, STALE }

function getNAVState(bytes32 assetId, uint256 lastUpdate) public view returns (NAVState) {
    uint256 age = block.timestamp - lastUpdate;
    if (age < 7 days) return NAVState.FRESH;
    if (age < 14 days) return NAVState.WARNING;
    if (age < 30 days) return NAVState.CRITICAL;
    return NAVState.STALE;
}
```

*   *Note:* Redemptions are always prioritized and allowed under Warning/Critical states to protect liquidity provider capital.

### 3.6 NAV Dispute Resolution Process
To prevent market manipulation, a 4-stage on-chain dispute system is enforced:

*   **Stage 1: Anomaly Flagging:** Submissions deviating $>15\%$ from the active valuation are flagged as `Under Review`. The value is held in escrow, and a 48-hour review window begins.
*   **Stage 2: Challenge Filing:** Authorized valuers or investors holding $>5\%$ shares can challenge the flagged NAV by posting a stake and uploading alternative appraisal documents to IPFS.
*   **Stage 3: Multi-Sig Resolution:** The governance multi-sig resolves the dispute within 7 days. If the timeline is breached, the circuit breaker halts trading automatically.
*   **Stage 4: Execution:** The winning value is committed to the registry. The losing challenger's stake is slashed and sent to the *Insurance Reserve*.

### 3.7 NAV Update Frequency Schedule by Asset Class
*   **Commercial Real Estate:** Full Appraisal: *Quarterly*, DCF: *Monthly*, Yield: *Daily*.
*   **Corporate Bonds:** Price Feed: *Daily*, Yield: *Daily*.
*   **Private Credit:** Appraisal: *Monthly*, DCF: *Monthly*, Yield: *Monthly*.
*   **Fine Art:** Appraisal: *Annually*, Comparables: *Event-Driven*.

### 3.8 New Smart Contracts Required (Section B)
1.  **`NAVEngine.sol`:** Compiles the final formula subtracting liabilities and fees.
2.  **`ValuationRegistry.sol`:** Stores historical submissions and performs weighted aggregation.
3.  **`DisputeResolver.sol`:** Processes challenges, locks stakes, and slashes losers.
4.  **`NAVScheduler.sol`:** Validates timelines and triggers alerts when schedules expire.

---

## 4. Implementation Plan

### 4.1 Strict Build Sequence

```
[FeeRegistry.sol] ──► [FeeAccrualEngine.sol] ──► [HighWaterMark.sol] ──► [FeeDistributor.sol]
                                                                                │
[ValuationRegistry.sol] ◄───────────────────────────────────────────────────────┘
  │
  ▼
[NAVEngine.sol] ──► [DisputeResolver.sol] ──► [NAVScheduler.sol] ──► [E2E Testing] ──► [Audit]
```

### 4.2 Mainnet Deployment Gates Checklist
1.  [ ] `FeeAccrualEngine` calculations match manual math for 3 distinct test vaults.
2.  [ ] `HighWaterMark` resets peak limits correctly after performance fee collection.
3.  [ ] `NAVEngine` produces values that match manual valuations:
    $$\text{NAV} = \frac{\text{Appraisal} + \text{USDC} - \text{Accrued Fees}}{\text{Total Supply}}$$
4.  [ ] Stale valuations ($>7$ days) block deposits but allow redemptions.
5.  [ ] Stale valuations ($>30$ days) automatically trigger circuit breaker halts.
6.  [ ] Deviations $>15\%$ automatically flag submissions as `Under Review`.
7.  [ ] Dispute resolutions update active registry values correctly.
8.  [ ] `FeeDistributor` splits fees exactly as allocated: 40/40/10/10.
9.  [ ] All 8 new smart contracts pass external audits.
10. [ ] `validateInvariant` checks run successfully on all test vaults post fee deductions.
