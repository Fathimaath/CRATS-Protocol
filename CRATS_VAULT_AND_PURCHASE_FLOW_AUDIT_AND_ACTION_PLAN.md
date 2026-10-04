# CRATS-EVM & CopyM Platform: Vault Architecture & Purchase Flow
## Comprehensive Codebase Audit, Generic Update Gap Analysis & Technical Perfection Roadmap

**Target Repositories:**
- Smart Contracts: [`CRATS-EVM`](file:///c:/Users/anask/Desktop/CPM/CRATS-EVM)
- Platform Orchestration & UI: [`copym-platform`](file:///c:/Users/anask/Desktop/CPM/copym-platform)
**Date:** October 2026  
**Status:** In-Depth Architecture Review & Concrete Remediation Plan

---

## 1. Executive Summary & Objective

The CopyM ecosystem spans two primary repositories:
1. **`CRATS-EVM`**: The institutional smart contract layer implementing ERC-3643 (regulated RWA tokens), ERC-4626 / ERC-7540 (fractional vaults), multi-source valuation (`NAVOracle`), Beneficial Ownership Register (`OwnershipSyncManager`), and lifecycle managers.
2. **`copym-platform`**: The web applications (`apps/investor-web`, `apps/issuer-web`) and Node.js backend orchestration engine integrating Fireblocks MPC custodial vaults, Sumsub KYC identity verification, and settlement pipelines.

Recently, generic architectural specifications (such as `update_v10.md`) were drafted outlining high-level principles:
- **Separation of Custody & Accounting**: Fireblocks holds 100% of USDC cash and 100% of ERC-3643 asset tokens; vaults only mint/burn fractional shares.
- **USDC Never Touches the Vault**: Investors send USDC to the platform Treasury; Treasury transfers RWA tokens into the vault; vault mints shares to the investor.
- **NAV-Based Pricing & Variance Protection**: The vault does not quote price; `NAVOracle` acts as the single source of truth, and the vault asserts that deposits match the fresh NAV within 5%.
- **Multi-Category Asset Archetypes**: Synchronous vaults (`SyncVault`) for liquid/yield-bearing assets; Asynchronous vaults (`AsyncVault`) for illiquid assets.

### The Objective of This Document
Generic architecture documents often describe ideal state without verifying what is actually running in the repository. This document conducts an **uncompromising, code-level audit** of:
1. What smart contracts and logic currently exist in `CRATS-EVM` (SyncVault, AsyncVault, BaseVault, Factory, Oracle, FeeEngine).
2. What the actual purchase and settlement flow executes in `copym-platform` (`TokenDetailView.jsx` -> `/marketplace/purchase` -> `tokenPurchaseService.js` -> Fireblocks).
3. The exact gaps, mismatches, and **critical showstopper bugs** between the generic specification, the EVM contracts, and the backend orchestrator.
4. The exact, step-by-step code and contract changes required to make the entire system robust, secure, and production-ready.

---

## 2. As-Is Codebase Inventory: What We Actually Have

### 2.1 `CRATS-EVM` Smart Contract Layer

```
                        ┌────────────────────────────────────────┐
                        │             BaseVault.sol              │
                        │  (BOR Sync via OwnershipSyncManager)   │
                        └───────────────────┬────────────────────┘
                                            │ inherits
                    ┌───────────────────────┴───────────────────────┐
                    ▼                                               ▼
      ┌───────────────────────────┐                   ┌───────────────────────────┐
      │      SyncVault.sol        │                   │      AsyncVault.sol       │
      │  - ERC-4626 Synchronous   │                   │  - ERC-7540 Asynchronous  │
      │  - depositFromTreasury()  │                   │  - requestDeposit()       │
      │  - NAV Variance (AUD-03)  │                   │  - fulfillDeposit()       │
      │  - FeeEngine Hooks        │                   │  - claimDeposit()         │
      │  - Identity KYC Check     │                   │  - Direct Token Transfer  │
      └───────────────────────────┘                   └───────────────────────────┘
```

#### A. [`contracts/vault/BaseVault.sol`](file:///c:/Users/anask/Desktop/CPM/CRATS-EVM/contracts/vault/BaseVault.sol)
- **Role**: Abstract base for all CopyM vaults.
- **BOR Syncing**: Overrides OpenZeppelin 5.x `_update(from, to, value)`. Automatically synchronizes beneficial ownership to `syncManager.updateBeneficialOwnership()` for every mint, burn, and share transfer.
- **Yield Sync**: Implements `_afterYieldDistribution()`, updating all holders in batches (≤200 holders) or emitting `YieldSyncRequired` (>200 holders).

#### B. [`contracts/vault/SyncVault.sol`](file:///c:/Users/anask/Desktop/CPM/CRATS-EVM/contracts/vault/SyncVault.sol)
- **Role**: Upgradeable ERC-4626 vault for liquid/semi-liquid RWA assets.
- **Compliance**: Enforces `_checkCompliance(account)` via `IIdentityRegistry(identityRegistry).isVerified(account)`.
- **Valuation**: `totalAssets()` dynamically scales based on `INAVOracle(navOracle).getWeightedNAV(assetId)`.
- **Treasury Entry Hook (`depositFromTreasury`)**:
  ```solidity
  function depositFromTreasury(
      uint256 assetTokens,
      address investor,
      uint256 usdcAmountPaid
  ) external onlyRole(OPERATOR_ROLE) nonReentrant returns (uint256)
  ```
  - Only callable by accounts holding `OPERATOR_ROLE`.
  - Checks `_checkCompliance(investor)`.
  - If `navOracle != address(0)`, queries `getNavForMintValidation(assetId)`.
  - Computates expected assets: `expectedAsset = (usdcAmountPaid * 1e18) / navPerToken`.
  - Validates that `abs(assetTokens - expectedAsset) / expectedAsset <= 5%` (500 BPS).
  - Pulls `assetTokens` from caller (`msg.sender`) using `safeTransferFrom`.
  - Mints `assetTokens` vault shares 1:1 to `investor`.
  - Synchronizes BOR via `syncManager.updateBeneficialOwnership`.
- **Standard ERC-4626 Functions**: `deposit()`, `mint()`, `withdraw()`, `redeem()`. Also attempts to pull entry/exit fees in USDC from the caller to `FeeEngine`.

#### C. [`contracts/vault/AsyncVault.sol`](file:///c:/Users/anask/Desktop/CPM/CRATS-EVM/contracts/vault/AsyncVault.sol)
- **Role**: ERC-7540 asynchronous tokenized vault for illiquid assets.
- **Lifecycle**:
  - `requestDeposit(assets, controller, owner)`: locks assets from `owner` via `IERC20(asset()).safeTransferFrom(owner, address(this), assets)`.
  - `fulfillDeposit(controller, assets)`: called by `FULFILLER_ROLE`, mints claimable shares to vault escrow.
  - `deposit(assets, receiver, controller)`: transfers shares from escrow to `receiver`.
  - `requestRedeem` -> `fulfillRedeem` -> `redeem`: 3-phase redemption.
- **Current State**: Implements standard ERC-7540 where `owner` transfers the underlying asset. **It does NOT have any integration with the Treasury custody model or NAVOracle**.

#### D. [`contracts/financial/VaultFactory.sol`](file:///c:/Users/anask/Desktop/CPM/CRATS-EVM/contracts/financial/VaultFactory.sol)
- **Role**: Factory contract deploying `SyncVault` and `AsyncVault` via ERC-1167 minimal proxy clones.
- **Current State**: Initializes the cloned vault, sets category, and sets identity/compliance modules. **Does not wire default NAVOracle, FeeEngine, Treasury, or assetId on newly cloned vaults**.

#### E. Supporting Infrastructure
- [`contracts/market/NAVOracle.sol`](file:///c:/Users/anask/Desktop/CPM/CRATS-EVM/contracts/market/NAVOracle.sol): Multi-source valuation engine (Appraisal, DCF, Comparables). Requires Proof of Reserve (PoR) document hash before accepting NAV. Exposes `getNavForMintValidation(assetId)` which rejects STALE or DISPUTED pricing.
- [`contracts/asset/OwnershipSyncManager.sol`](file:///c:/Users/anask/Desktop/CPM/CRATS-EVM/contracts/asset/OwnershipSyncManager.sol): Single gateway for Beneficial Ownership Register (BOR) updates on `AssetRegistry`. Enforces `onlyAuthorized(asset, vault)` and emits `SyncRouted` with reason codes.
- [`contracts/financial/FeeEngine.sol`](file:///c:/Users/anask/Desktop/CPM/CRATS-EVM/contracts/financial/FeeEngine.sol): Protocol fee management (entry fee, exit fee, management fee, performance fee via High-Water Mark).
- [`contracts/financial/RedemptionManager.sol`](file:///c:/Users/anask/Desktop/CPM/CRATS-EVM/contracts/financial/RedemptionManager.sol): Standard and institutional share redemptions (recently audited and hardened with Q1-Q4 fixes).
- [`contracts/financial/LifecycleExitManager.sol`](file:///c:/Users/anask/Desktop/CPM/CRATS-EVM/contracts/financial/LifecycleExitManager.sol): Institutional liquidation exits for complete asset dissolution.

---

### 2.2 `copym-platform` Purchase & Settlement Flow

```
[ Investor Web UI ]
        │  Click "Buy Shares"
        ▼
[ POST /api/marketplace/purchase ]
        │  SSE Streaming Route
        ▼
[ tokenPurchaseService.purchaseTokens() ]
        │
        ├─► Step 0: Ensure Investor Vault Account in Fireblocks (finalVaultId)
        ├─► Step 1: Validate Token & Marketplace Listing (Prisma DB)
        ├─► Step 2: Create TokenOwnership Record (Status: PENDING)
        │
        ├─► Step 3: Cash Payment (Investor -> Treasury)
        │     - Calculate Total Payable = assetAmount + platformFee
        │     - Investor Fireblocks Vault sends USDC/USDT to Treasury Vault
        │     - Wait for on-chain transfer confirmation
        │
        ├─► Step 3.5: Platform Fee Forwarding
        │     - Treasury Vault forwards platformFee to FeeEngine contract
        │     - Calls cratsFeeService.receiveFee()
        │
        └─► Step 4: Layer 3 Vault Share Issuance (transferTokens)
              - Check on-chain KYC via cratsIdentityService.isVerified(investorAddress)
              - Treasury approves Vault to spend RWA tokens (approve(vault, amountWei))
              - [Step A.5]: Calculate and approve USDC entry fee (redundant)
              - Detect depositFromTreasury (selector 0xa6c7a111)
              - Treasury calls depositFromTreasury(amountWei, investorAddress, usdcPaid)
              - Vault mints ERC-4626 shares to Investor and updates BOR!
```

#### Key Files in `copym-platform`:
1. [`apps/investor-web/src/components/TokenDetailView.jsx`](file:///c:/Users/anask/Desktop/CPM/copym-platform/apps/investor-web/src/components/TokenDetailView.jsx): UI modal for fractional purchase, calculates investment amount, calls `executeRealTokenPurchase`.
2. [`apps/investor-web/src/utils/purchaseApi.js`](file:///c:/Users/anask/Desktop/CPM/copym-platform/apps/investor-web/src/utils/purchaseApi.js): Streams Server-Sent Events (SSE) from the backend `/marketplace/purchase` endpoint to show real-time progress.
3. [`backend/routes/marketplace/marketplace.routes.js`](file:///c:/Users/anask/Desktop/CPM/copym-platform/backend/routes/marketplace/marketplace.routes.js): Document signature gate (`checkInvestmentSignatures`), invokes `tokenPurchaseService.purchaseTokens()`.
4. [`backend/services/tokenPurchaseService.js`](file:///c:/Users/anask/Desktop/CPM/copym-platform/backend/services/tokenPurchaseService.js): The central coordinator between Fireblocks MPC, Prisma DB, and on-chain CRATS contracts.
5. [`backend/services/cratsVaultService.js`](file:///c:/Users/anask/Desktop/CPM/copym-platform/backend/services/cratsVaultService.js): Deploys vaults, registers identities, configures `FeeEngine`, `NAVOracle`, and sets `treasury`.

---

## 3. Review of Generic Updates vs. Codebase Reality

The generic updates in `update_v10.md` describe a high-level model. When cross-referenced against the actual source code, significant differences and half-implementations emerge:

| Dimension | Generic Update Claim (`update_v10.md`) | Codebase Reality | Status |
|---|---|---|---|
| **USDC Custody** | USDC never touches the vault; sits 100% in Fireblocks Treasury. | **Accurate in intention, but mixed in code**: `depositFromTreasury()` does keep USDC in Treasury. However, `SyncVault.deposit()` still contains legacy logic attempting to pull USDC entry fees directly. | ⚠️ Partially Implemented |
| **Share Issuance** | Treasury transfers ERC-3643 tokens to vault; vault mints shares 1:1 to investor. | **Implemented in `SyncVault.sol`**, but `AsyncVault.sol` has no Treasury hook. | ⚠️ Half Implemented |
| **NAV-Based Minting** | Vault validates deposits against `NAVOracle.getNavForMintValidation()` within 500 BPS. | **Implemented in `SyncVault.sol`**, but `tokenPurchaseService.js` has a math bug that causes this validation to revert 100% of the time! | ❌ Critical Bug |
| **Asynchronous Vaults** | Illiquid assets use ERC-7540 `AsyncVault` with 3-phase request-fulfill-claim. | `AsyncVault.sol` assumes the **investor** deposits underlying tokens directly. It has zero Treasury custody support, zero NAV checks, and zero backend support. | ❌ Architectural Gap |
| **Beneficial Ownership** | Real-time BOR sync on every transfer/mint/burn via `OwnershipSyncManager`. | Fully implemented in `BaseVault.sol` and `OwnershipSyncManager.sol`. Verified functional. | ✅ Functional |
| **Vault Factory Automation** | Factory deploys and fully configures archetype-specific vaults. | `VaultFactory.sol` only clones the bytecode. All critical wiring (NAV, FeeEngine, Treasury, AssetId) must be handled by off-chain scripts. | ⚠️ Manual Overhead |

---

## 4. Critical Bugs & Discrepancies (Root Cause Analysis)

### 🔴 Bug 1 (Showstopper Revert): `usdcAmountPaid` Parameter in `tokenPurchaseService.js`

In [`backend/services/tokenPurchaseService.js`](file:///c:/Users/anask/Desktop/CPM/copym-platform/backend/services/tokenPurchaseService.js#L1072-L1076):
```javascript
let depositData;
if (useDepositFromTreasury) {
    console.log(`Vault supports depositFromTreasury, calling depositFromTreasury()...`);
    const vaultIface = new ethers.Interface(["function depositFromTreasury(uint256 assetTokens, address investor, uint256 usdcAmountPaid)"]);
    const usdcPaid = purchasePrice ? ethers.parseUnits(purchasePrice.toString(), 18) : amountWei;
    depositData = vaultIface.encodeFunctionData("depositFromTreasury", [amountWei, investorAddress, usdcPaid]);
}
```

#### Why This Breaks:
- `purchasePrice` is the **unit price per token** (e.g. $100.00).
- The investor purchased `amount = 10` tokens.
- Total cash paid by the investor in Step 3 was `10 * $100 = $1,000`.
- The code passes `usdcPaid = ethers.parseUnits("100", 18)` ($100) instead of the total paid ($1,000)!
- Inside [`SyncVault.sol:406-409`](file:///c:/Users/anask/Desktop/CPM/CRATS-EVM/contracts/vault/SyncVault.sol#L406-L409):
  ```solidity
  uint256 expectedAsset = (usdcAmountPaid * 1e18) / navPerToken;
  uint256 diff = assetTokens > expectedAsset ? assetTokens - expectedAsset : expectedAsset - assetTokens;
  require(diff * 10000 / expectedAsset <= 500, "SyncVault: deposit variance exceeds threshold");
  ```
- If NAV is $100:
  `expectedAsset = (100e18 * 1e18) / 100e18 = 1 token (1e18)`
- But `assetTokens` is `10 tokens (10e18)`.
- `diff = 9 tokens`. Variance = `9 / 1 = 900%` (90,000 BPS), which vastly exceeds `500 BPS` (5%).
- **Result**: `depositFromTreasury` **reverts every single time** with `"SyncVault: deposit variance exceeds threshold"`!

#### Fix:
`usdcPaid` must be calculated as `totalUsdcPaid = purchasePrice * amount`:
```javascript
const totalUsdcNumeric = Number(purchasePrice) * Number(amount);
const usdcPaid = ethers.parseUnits(totalUsdcNumeric.toFixed(6), 18); // 18-decimal scaled USD value
```

---

### 🔴 Bug 2 (Permission Revert): Treasury Address Missing `OPERATOR_ROLE` on SyncVault

In [`SyncVault.sol:393`](file:///c:/Users/anask/Desktop/CPM/CRATS-EVM/contracts/vault/SyncVault.sol#L393):
```solidity
function depositFromTreasury(
    uint256 assetTokens,
    address investor,
    uint256 usdcAmountPaid
) external onlyRole(OPERATOR_ROLE) nonReentrant returns (uint256)
```

In [`tokenPurchaseService.js:1083-1088`](file:///c:/Users/anask/Desktop/CPM/copym-platform/backend/services/tokenPurchaseService.js#L1083-L1088):
```javascript
const depositRes = await fireblocksService.submitContractCall({
    vaultAccountId: sourceVaultId, // Treasury Vault Account
    contractAddress: vaultAddress,
    callData: depositData,
    assetId: network
});
```

#### Why This Breaks:
- The transaction on-chain is submitted by the **Fireblocks Treasury EVM Address** (`blockchainConfig.treasuryAddress`).
- In `SyncVault.sol`, `depositFromTreasury` is protected by `onlyRole(OPERATOR_ROLE)`.
- During vault initialization, `OPERATOR_ROLE` is granted **only to `admin`** (the deployer / backend signer).
- In [`cratsVaultService.js:290-293`](file:///c:/Users/anask/Desktop/CPM/copym-platform/backend/services/cratsVaultService.js#L290-L293), `cratsVaultService` grants `DEFAULT_ADMIN_ROLE` to `CarbonRetirementManager`, `RedemptionManager`, and `LifecycleExitManager`. **It never grants `OPERATOR_ROLE` to `blockchainConfig.treasuryAddress`**!
- **Result**: Any call to `depositFromTreasury` submitted by the Treasury Fireblocks vault will revert with `AccessControl: account ... is missing role ... OPERATOR_ROLE`!

#### Fix:
In `cratsVaultService.js`, immediately after deploying the vault:
```javascript
const OPERATOR_ROLE = await vaultContract.OPERATOR_ROLE();
const hasOp = await vaultContract.hasRole(OPERATOR_ROLE, blockchainConfig.treasuryAddress);
if (!hasOp) {
    const tx = await vaultContract.grantRole(OPERATOR_ROLE, blockchainConfig.treasuryAddress);
    await tx.wait();
    console.log(`✅ Granted OPERATOR_ROLE to Treasury (${blockchainConfig.treasuryAddress}) on vault`);
}
```

---

### 🔴 Bug 3 (Decimal Risk): USDC 6 Decimals vs On-Chain 18-Decimal Assumption

In [`SyncVault.sol:406`](file:///c:/Users/anask/Desktop/CPM/CRATS-EVM/contracts/vault/SyncVault.sol#L406):
```solidity
uint256 expectedAsset = (usdcAmountPaid * 1e18) / navPerToken;
```
- Real USDC uses **6 decimals** (`1 USDC = 1,000,000 units`).
- `navPerToken` in `NAVOracle` uses **18 decimals** (`$100 = 100 * 1e18`).
- If an off-chain integration passes a raw 6-decimal USDC value (e.g. `1,000 * 1e6 = 1,000,000,000`), then:
  `expectedAsset = (1,000,000,000 * 1e18) / (100 * 1e18) = 10,000,000` (which is `0.00000000001` tokens in 18 decimals)!
- `expectedAsset` becomes virtually zero, causing variance check failure.

#### Fix:
Explicitly document and enforce that `usdcAmountPaid` passed to `depositFromTreasury` must be **normalized to 18 decimals** (WAD format), OR update `SyncVault.sol` to normalize using `_scaleDecimals(usdcToken, address(this), usdcAmountPaid)`. Normalizing in the contract is much safer against frontend/backend decimal mistakes.

---

### 🟡 Bug 4 (Architectural Gap): `AsyncVault.sol` Incompatible with Treasury Custody

`AsyncVault.sol` implements ERC-7540 by having the investor call:
```solidity
function requestDeposit(uint256 assets, address controller, address owner) external override nonReentrant returns (uint256 requestId) {
    IERC20(asset()).safeTransferFrom(owner, address(this), assets);
    ...
```
- The generic update specification states: **"Investors never directly hold or transfer underlying asset tokens; they interact exclusively with vault shares. USDC remains in Fireblocks Treasury."**
- In `AsyncVault.sol`, `owner` is expected to hold and transfer `asset()` (the underlying ERC-3643 token).
- If an asset is configured as illiquid (private equity, real estate development tranche), an investor depositing USDC to Treasury cannot participate because `AsyncVault` has no `requestDepositFromTreasury()` function!
- Furthermore, `AsyncVault.sol` has:
  - No `navOracle` integration.
  - No `feeEngine` integration.
  - An outdated dead-share pattern (`_mint(address(1), 1)`) instead of OpenZeppelin 5.x virtual shares.
  - Test suite failure due to timeout during `requestDeposit` (missing BOR / registry approval in test setup).

#### Fix:
Extend `AsyncVault.sol` with:
```solidity
function requestDepositFromTreasury(
    uint256 assetTokens,
    address investor,
    uint256 usdcAmountPaid
) external onlyRole(OPERATOR_ROLE) nonReentrant returns (uint256 requestId)
```
Where Treasury locks the asset tokens into the vault escrow on behalf of the investor, recording the investor as the claim controller.

---

### 🟡 Bug 5 (Security Gap): Unprotected `setCategory` and `setSettlementPeriod`

In [`SyncVault.sol:323`](file:///c:/Users/anask/Desktop/CPM/CRATS-EVM/contracts/vault/SyncVault.sol#L323):
```solidity
function setCategory(bytes32 category_) external override {
    category = category_;
}
```
In [`AsyncVault.sol:294-298`](file:///c:/Users/anask/Desktop/CPM/CRATS-EVM/contracts/vault/AsyncVault.sol#L294-L298):
```solidity
function setCategory(bytes32 cat) external { category = cat; }
function setSettlementPeriod(uint256 period) external {
    require(period > 0, "invalid period");
    settlementPeriod = period;
}
```
- **Vulnerability**: These functions have **NO access control**!
- Any random wallet can call `setCategory(bytes32(0))` or `setSettlementPeriod(1)` on any deployed vault.
- `AsyncVault.test.js` actually contains a test verifying that anyone can change the settlement period!

#### Fix:
Add `onlyRole(DEFAULT_ADMIN_ROLE)` to both functions in `SyncVault.sol` and `AsyncVault.sol`.

---

### 🟡 Bug 6 (Dead Code & Waste): Redundant Step A.5 in `tokenPurchaseService.js`

In [`backend/services/tokenPurchaseService.js:1027-1053`](file:///c:/Users/anask/Desktop/CPM/copym-platform/backend/services/tokenPurchaseService.js#L1027-L1053):
- Prior to calling `depositFromTreasury`, the service attempts to calculate an entry fee and approve USDC to the vault contract.
- But `depositFromTreasury` **never pulls USDC** from Treasury! The platform fee was **already collected and forwarded to FeeEngine in Step 3 & 3.5**.
- This step causes an extra asynchronous Fireblocks transaction submission, gas burn, and delay, but achieves nothing.

#### Fix:
Remove or bypass Step A.5 whenever `useDepositFromTreasury` is true.

---

### 🟡 Bug 7 (Interface Incompleteness): `ISyncVault.sol` Missing Functions

In [`contracts/interfaces/vault/ISyncVault.sol`](file:///c:/Users/anask/Desktop/CPM/CRATS-EVM/contracts/interfaces/vault/ISyncVault.sol):
- `depositFromTreasury` is **missing** from `ISyncVault`.
- `setFeeEngine`, `setNavOracle`, `setAssetId`, and `setTreasury` are **missing** from `ISyncVault`.
- This forced `tokenPurchaseService.js` to define inline ad-hoc interfaces (`new ethers.Interface(["function depositFromTreasury(...)"])`).

#### Fix:
Update `ISyncVault.sol` to declare all production methods.

---

## 5. Architectural Alignment: How the Purchase Flow Must Work

Here is the exact, end-to-end corrected architectural pipeline:

```
[ Investor Web ]
       │ 1. User inputs: 10 shares of "Azure Manor" @ $100/share = $1,000 + $10 Fee = $1,010
       ▼
[ Backend /marketplace/purchase ]
       │ 2. Validates Sumsub KYC & E-Signatures
       ▼
[ tokenPurchaseService.purchaseTokens() ]
       │
       │ 3. Cash Settlement (Fireblocks MPC)
       │    Investor Vault --( $1,010 USDC )--> Protocol Treasury Vault
       │
       │ 4. Platform Fee Sweep (Fireblocks MPC)
       │    Treasury Vault --( $10 USDC )-----> FeeEngine Contract
       │    cratsFeeService.receiveFee(vaultAddress, 10)
       │
       │ 5. NAV Check & Asset Calculation
       │    Backend queries NAVOracle: NAV = $100.00 (State: FRESH)
       │    Required Asset Tokens = $1,000 / $100 = 10 Tokens (10 * 1e18)
       │    Total USDC Paid = $1,000 (scaled to 1e18 = 1000 * 1e18)
       │
       │ 6. RWA Token Approval (Fireblocks MPC)
       │    Treasury Vault approves SyncVault for 10 Asset Tokens
       │
       │ 7. Primary Vault Deposit (Fireblocks MPC with OPERATOR_ROLE)
       │    Treasury Vault calls:
       │    SyncVault.depositFromTreasury(
       │        assetTokens: 10 * 1e18,
       │        investor: 0xInvestorAddress,
       │        usdcAmountPaid: 1000 * 1e18
       │    )
       │
       │ 8. On-Chain Execution (SyncVault.sol)
       │    ├── Validates investor KYC via IdentityRegistry
       │    ├── Validates NAV variance: expected = (1000e18 * 1e18) / 100e18 = 10e18 == 10e18 (0% variance <= 5%)
       │    ├── Pulls 10 Asset Tokens from Treasury to Vault
       │    ├── Mints 10 Vault Shares (vAZM) directly to 0xInvestorAddress
       │    └── Calls syncManager.updateBeneficialOwnership(...)
       │
       ▼
[ AssetRegistry (BOR) ]
       Beneficial Ownership Register updated in real-time with investor's new balance.
```

---

## 6. Concrete Technical Changes Required

### Phase 1: Smart Contract Fixes (`CRATS-EVM`)

#### 1.1 Update [`contracts/interfaces/vault/ISyncVault.sol`](file:///c:/Users/anask/Desktop/CPM/CRATS-EVM/contracts/interfaces/vault/ISyncVault.sol)
Add the missing function definitions:
```solidity
function depositFromTreasury(
    uint256 assetTokens,
    address investor,
    uint256 usdcAmountPaid
) external returns (uint256);

function setFeeEngine(address feeEngine) external;
function setNavOracle(address navOracle) external;
function setAssetId(bytes32 assetId) external;
function setTreasury(address treasury) external;
function isClosed() external view returns (bool);
function treasury() external view returns (address);
function navOracle() external view returns (address);
function feeEngine() external view returns (address);
function assetId() external view returns (bytes32);
```

#### 1.2 Harden [`contracts/vault/SyncVault.sol`](file:///c:/Users/anask/Desktop/CPM/CRATS-EVM/contracts/vault/SyncVault.sol)
1. Add `onlyRole(DEFAULT_ADMIN_ROLE)` to `setCategory`:
   ```solidity
   function setCategory(bytes32 category_) external override onlyRole(DEFAULT_ADMIN_ROLE) {
       category = category_;
   }
   ```
2. Safe Decimal Handling in `depositFromTreasury`:
   Ensure `usdcAmountPaid` scales gracefully if 6-decimal USDC is passed by adding automatic decimal normalization:
   ```solidity
   // If usdcAmountPaid appears to be in 6 decimals (< 1e12 for realistic investments), scale to 18
   uint256 normalizedUSDC = usdcAmountPaid < 1e14 ? usdcAmountPaid * 1e12 : usdcAmountPaid;
   uint256 expectedAsset = (normalizedUSDC * 1e18) / navPerToken;
   ```

#### 1.3 Harden & Upgrade [`contracts/vault/AsyncVault.sol`](file:///c:/Users/anask/Desktop/CPM/CRATS-EVM/contracts/vault/AsyncVault.sol)
1. Add `onlyRole(DEFAULT_ADMIN_ROLE)` to `setCategory` and `setSettlementPeriod`.
2. Add `requestDepositFromTreasury`:
   ```solidity
   function requestDepositFromTreasury(
       uint256 assetTokens,
       address investor,
       uint256 usdcAmountPaid
   ) external onlyRole(OPERATOR_ROLE) nonReentrant returns (uint256 requestId) {
       require(!isClosed, "Vault: closed");
       require(assetTokens > 0, "ZERO_ASSETS");
       require(investor != address(0), "INVALID_INVESTOR");
       
       // Pull RWA tokens from Treasury (msg.sender) into Vault
       IERC20(asset()).safeTransferFrom(msg.sender, address(this), assetTokens);
       
       _pendingDeposit[investor] += assetTokens;
       _totalPendingDepositAssets += assetTokens;
       requestId = _nextDepositRequestId[investor]++;
       
       if (address(syncManager) != address(0)) {
           syncManager.updateBeneficialOwnership(asset(), address(this), investor, balanceOf(investor) + convertToShares(assetTokens));
       }
       
       emit DepositRequest(investor, msg.sender, requestId, msg.sender, assetTokens);
       return requestId;
   }
   ```
3. Fix the timeout in `test/layer3/AsyncVault.test.js` by ensuring proper mock token setup before `requestDeposit`.

---

### Phase 2: Backend Orchestration Fixes (`copym-platform`)

#### 2.1 Fix `tokenPurchaseService.js` Line 1075
In [`backend/services/tokenPurchaseService.js`](file:///c:/Users/anask/Desktop/CPM/copym-platform/backend/services/tokenPurchaseService.js):
Replace:
```javascript
// BUGGY:
const usdcPaid = purchasePrice ? ethers.parseUnits(purchasePrice.toString(), 18) : amountWei;
depositData = vaultIface.encodeFunctionData("depositFromTreasury", [amountWei, investorAddress, usdcPaid]);
```
With:
```javascript
// FIXED: Calculate TOTAL cash paid (Price Per Token * Amount of Tokens)
const totalCashPaidNumeric = (Number(purchasePrice || 1.0) * Number(amount));
const usdcPaid = ethers.parseUnits(totalCashPaidNumeric.toFixed(6), 18);
console.log(`Calling depositFromTreasury: assetTokens=${amountWei}, investor=${investorAddress}, totalUsdcPaid=${ethers.formatUnits(usdcPaid, 18)} USD`);
depositData = vaultIface.encodeFunctionData("depositFromTreasury", [amountWei, investorAddress, usdcPaid]);
```

#### 2.2 Grant `OPERATOR_ROLE` to Treasury in `cratsVaultService.js`
In [`backend/services/cratsVaultService.js`](file:///c:/Users/anask/Desktop/CPM/copym-platform/backend/services/cratsVaultService.js#L350-L360):
Immediately after `setTreasury`:
```javascript
// Grant OPERATOR_ROLE to Treasury on vault so depositFromTreasury succeeds
try {
  const operatorRole = await vaultContract.OPERATOR_ROLE();
  const treasuryAddr = blockchainConfig.treasuryAddress;
  const isTreasuryOp = await vaultContract.hasRole(operatorRole, treasuryAddr);
  if (!isTreasuryOp) {
    const nonce = await this.provider.getTransactionCount(this.signer.address, 'latest');
    const grantOpTx = await vaultContract.grantRole(operatorRole, treasuryAddr, { nonce });
    console.log(`⏳ Granting OPERATOR_ROLE to Treasury on vault (Tx: ${grantOpTx.hash})...`);
    await grantOpTx.wait();
    console.log(`${colors.green}✅ Treasury granted OPERATOR_ROLE on vault${colors.reset}`);
  } else {
    console.log(`${colors.cyan}ℹ️ Treasury already holds OPERATOR_ROLE on vault${colors.reset}`);
  }
} catch (opRoleErr) {
  console.warn(`${colors.yellow}⚠️ Granting OPERATOR_ROLE to Treasury skipped: ${opRoleErr.message}${colors.reset}`);
}
```

#### 2.3 Eliminate Redundant Step A.5
In [`backend/services/tokenPurchaseService.js:1027-1053`](file:///c:/Users/anask/Desktop/CPM/copym-platform/backend/services/tokenPurchaseService.js#L1027-L1053):
Wrap Step A.5 with a check:
```javascript
if (!useDepositFromTreasury) {
    // Only execute legacy entry fee approval if falling back to standard deposit()
    ...
} else {
    console.log(`Bypassing Step A.5: depositFromTreasury manages platform fees off-chain via Treasury sweep.`);
}
```

---

### Phase 3: Comprehensive Testing & Verification Plan

#### 3.1 New Hardhat Unit Test: `depositFromTreasury`
Add dedicated test cases in [`test/layer3/SyncVault.test.js`](file:///c:/Users/anask/Desktop/CPM/CRATS-EVM/test/layer3/SyncVault.test.js):
1. **Successful Deposit**: Treasury calls `depositFromTreasury` with matching NAV; shares mint 1:1, BOR updates.
2. **Variance Rejection**: Treasury calls `depositFromTreasury` with >5% discrepancy; reverts with `"SyncVault: deposit variance exceeds threshold"`.
3. **Unauthorized Caller**: Non-operator calls `depositFromTreasury`; reverts with `AccessControl` error.
4. **KYC Gate**: Unverified investor rejected with `"SyncVault: Account not verified"`.

#### 3.2 End-to-End Simulation Script
Update [`scripts/simulate_deposit.js`](file:///c:/Users/anask/Desktop/CPM/CRATS-EVM/scripts/simulate_deposit.js) to test the exact production parameters:
```bash
npx hardhat run scripts/simulate_deposit.js --network localhost
```

---

## 7. Action Item Checklist for Developers

| # | Task | Repository | Target File | Priority |
|---|---|---|---|---|
| 1 | Fix `usdcPaid` calculation (`totalCashPaid = purchasePrice * amount`) | `copym-platform` | `backend/services/tokenPurchaseService.js` | 🚨 CRITICAL |
| 2 | Grant `OPERATOR_ROLE` to `treasuryAddress` upon vault deployment | `copym-platform` | `backend/services/cratsVaultService.js` | 🚨 CRITICAL |
| 3 | Bypass redundant Step A.5 entry fee approval when using `depositFromTreasury` | `copym-platform` | `backend/services/tokenPurchaseService.js` | ⚡ HIGH |
| 4 | Add `depositFromTreasury` & setters to Solidity interface | `CRATS-EVM` | `contracts/interfaces/vault/ISyncVault.sol` | ⚡ HIGH |
| 5 | Add `onlyRole(DEFAULT_ADMIN_ROLE)` to `setCategory` | `CRATS-EVM` | `contracts/vault/SyncVault.sol` | 🛡️ SECURITY |
| 6 | Add `onlyRole(DEFAULT_ADMIN_ROLE)` to `setCategory` and `setSettlementPeriod` | `CRATS-EVM` | `contracts/vault/AsyncVault.sol` | 🛡️ SECURITY |
| 7 | Implement `requestDepositFromTreasury` for illiquid assets | `CRATS-EVM` | `contracts/vault/AsyncVault.sol` | 🏗️ ARCHITECTURE |
| 8 | Add comprehensive `depositFromTreasury` test suite to Hardhat | `CRATS-EVM` | `test/layer3/SyncVault.test.js` | 🧪 TESTING |
