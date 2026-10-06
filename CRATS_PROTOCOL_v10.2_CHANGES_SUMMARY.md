# CRATS Protocol v10.2.0 — Comprehensive Vault & Lifecycle Exit Architecture Master Summary

## 1. Executive Summary

This master document consolidates and supersedes all previous change logs (including `CRATS_VAULT_CHANGES_SUMMARY.md` and `CRATS_VAULT_CHANGES_SUMMARY_v10.1.md`). It documents the full architectural enhancements, security hardening, audit remediations, and deployment records across versions **v10.0**, **v10.1.0**, and **v10.2.0** of the **CRATS-EVM** smart contract repository.

### Core Architectural Paradigms:
1. **Institutional Purchase Architecture ("USDC Never Touches the Vault")**:
   - Investor fiat and stablecoins remain strictly in institutional custody (Fireblocks Treasury).
   - The Treasury directly settles tokenized Real World Assets (RWA) into CRATS Vaults (`depositFromTreasury` / `requestDepositFromTreasury`).
   - Vaults mint 1:1 fractional shares directly to the investor's verified on-chain address.
   - Dual-mode NAV pricing validation (Path A: total consideration, Path B: unit price) enforces a strict 500 BPS (5%) variance tolerance against off-chain manipulation.
2. **Institutional Exit & Settlement Lifecycle**:
   - Vault liquidation and asset sale returns capital directly to the Treasury, with USDC escrowed for redemption.
   - Batch-processed exits prevent block gas limit DoS on high-investor-count vaults.
   - Compliance-compliant escrow sweeping handles frozen/sanctioned wallets without locking protocol funds.
   - Last-investor redemption gate relief allows final remaining share holders to fully redeem without artificial fractional-share lockouts.

All modifications follow a **minimalist, production-grade design**, maintaining 100% backwards compatibility and requiring **zero code changes on `copym-platform`**.

---

## 2. Master Overview of Changes by File

### 2.1. `contracts/vault/SyncVault.sol`

| Feature / Fix | Version | Rationale & Security Impact |
| :--- | :--- | :--- |
| **Protected `setCategory(bytes32)`** | v10.0 | Added `onlyRole(DEFAULT_ADMIN_ROLE)`. Previously publicly callable without access control, allowing external parties to alter asset classification. |
| **Automatic Treasury Operator Authorization** | v10.0 | In `setTreasury(address _treasury)`, the contract automatically calls `_grantRole(OPERATOR_ROLE, _treasury)`. Additionally, `depositFromTreasury` allows `msg.sender == treasury`. Eliminates execution reverts from Fireblocks Treasury. |
| **Dual-Mode NAV Pricing Validation** | v10.1 | Resolves variance revert issues where callers supply either total cash paid (`price * amount`) or unit price (`purchasePrice`). Validates incoming USD value against NAV in primary mode and unit price fallback within 500 BPS (5%). |
| **Sound Decimal Handling** | v10.1 | Treats `usdcAmountPaid` canonically as 18-decimal WAD value at the interface boundary. Removes ambiguous heuristics (`usdcAmountPaid < 1e14`) that risked falsely scaling micro-transactions. |
| **Direct Settlement & Minting** | v10.0 | Mints vault shares directly to the verified investor upon Treasury RWA deposit. |

### 2.2. `contracts/vault/AsyncVault.sol`

| Feature / Fix | Version | Rationale & Security Impact |
| :--- | :--- | :--- |
| **Protected `setCategory(bytes32)` & `setSettlementPeriod(uint256)`** | v10.0 | Added `onlyRole(DEFAULT_ADMIN_ROLE)` to both setters to prevent unauthorized parameter alteration. |
| **Factory Deployer Permissions in `initialize()`** | v10.0 | Added `_grantRole(DEFAULT_ADMIN_ROLE, _msgSender())` during vault initialization so `VaultFactory` can execute configuration setters without reverting. |
| **Treasury Hook (`requestDepositFromTreasury`)** | v10.1 | Added async Treasury entry point. Treasury locks underlying illiquid RWA tokens on behalf of an investor without requiring the investor to hold raw RWA. |
| **AUD-03 NAV Oracle Validation** | **v10.2** | Replaced commented-out `usdcAmountPaid` with full on-chain NAV Oracle verification: queries `navOracle.getNAV(assetId)` and enforces 500 BPS variance validation across Dual Modes (Path A: total consideration, Path B: unit price). |
| **Fee Engine & NAV Oracle State** | **v10.2** | Added `feeEngine`, `navOracle`, and `assetId` state variables with admin setters (`setFeeEngine`, `setNavOracle`, `setAssetId`), enabling comprehensive fee deduction and price feed access. |
| **Version Alignment** | v10.0 | Standardized `version()` to return `AssetConfig.VERSION` (`"3.0.0"`). |

### 2.3. `contracts/interfaces/vault/ISyncVault.sol` & `IAsyncVault.sol`

| Feature / Fix | Version | Rationale & Security Impact |
| :--- | :--- | :--- |
| **Complete Interface Coverage** | v10.1 / **v10.2** | Declared `depositFromTreasury`, `requestDepositFromTreasury`, `setTreasury`, `setFeeEngine`, `setNavOracle`, `setAssetId`, `closeVault`, and getters (`isClosed`, `treasury`, `feeEngine`, `navOracle`, `assetId`, `lastDepositUSDCAmount`). |
| **Type-Safe Platform Integration** | v10.1 / **v10.2** | Prevents off-chain callers and downstream contracts from having to construct ad-hoc inline interfaces. |

### 2.4. `contracts/financial/VaultFactory.sol`

| Feature / Fix | Version | Rationale & Security Impact |
| :--- | :--- | :--- |
| **Protocol Infrastructure Defaults** | **v10.2** | Added state variables `defaultTreasury`, `defaultNavOracle`, and `defaultFeeEngine` with management setters (`setProtocolDefaults`, `setDefaultTreasury`, `setDefaultNavOracle`, `setDefaultFeeEngine`). |
| **Automated Clone Configuration** | **v10.2** | In `createVault()`, automatically wires `assetId`, `defaultTreasury`, `defaultNavOracle`, `defaultFeeEngine`, `identityRegistry`, and `complianceModule` on newly cloned `SyncVault` and `AsyncVault` instances immediately after initialization. |
| **Permission Grants** | v10.0 / **v10.2** | Grants `VAULT_FACTORY_ROLE` on `AssetFactory`, enabling automated asset-to-vault binding. |

### 2.5. `contracts/financial/LifecycleExitManager.sol`

| Feature / Fix | Version | Rationale & Security Impact |
| :--- | :--- | :--- |
| **Batch Exit Execution (`executeExitBatch`)** | **v10.2** | Implemented batched investor exits accepting `address[] calldata investors`. Iterates over subsets of shareholders, increments `totalSharesProcessed`, tracks individual payouts via `hasHolderExited[vault][holder]`, and completely eliminates block gas limit DoS. |
| **Dedicated Exit Finalization (`finalizeExit`)** | **v10.2** | Requires all shares to be processed (`totalSharesProcessed >= initialTotalShares`), burns vault shares, calls `vault.closeVault()`, and transitions status to `ExitStatus.COMPLETED`. |
| **Backwards-Compatible `executeExit`** | **v10.2** | Retained single-call `executeExit(address vault)` for small-cap vaults, internally delegating through the batch mechanism and calling `finalizeExit`. |
| **Unclaimed Escrow Sweeper (`sweepUnclaimedEscrow`)** | **v10.2** | Enables authorized governance to sweep unclaimed exit proceeds from frozen, sanctioned, or non-compliant wallets to a designated custodial recovery address without stalling exit closure. |
| **Constructor / Initializer Ordering Fix** | **v10.2** | Corrected inverted parameter assignment between `_usdc` and `_assetRegistry` during proxy initialization. |
| **Complete External Linkages** | **v10.2** | Added and verified administrative setters: `setNAVOracle`, `setRedemptionManager`, `setOwnershipSyncManager`, `setTreasury`, and `setSettlementVarianceBPS`. |

### 2.6. `contracts/financial/RedemptionManager.sol`

| Feature / Fix | Version | Rationale & Security Impact |
| :--- | :--- | :--- |
| **Last-Remaining-Investor Gate Relief** | **v10.2** | In `_checkRedemptionGate` and `_updateRedemptionGate`, if an investor holds 100% of the remaining vault share supply (`shares >= totalVaultSupply`), the quarterly percentage volume gate is bypassed. Prevents the final shareholder from being locked in an asymptotic fractional redemption trap. |

---

## 3. Comprehensive Sepolia Testnet Deployment Record

All contracts have been compiled, deployed, verified on-chain, and recorded in [`deployments/sepolia-deployment.json`](file:///c:/Users/anask/Desktop/CPM/CRATS-EVM/deployments/sepolia-deployment.json).

### 3.1. Contract Addresses Matrix

| Contract Name | v10.1.0 Address | v10.2.0 Active Address | Status / Verification |
| :--- | :--- | :--- | :--- |
| **SyncVault Template** | `0xc9B9fED44301dc4E2b431C8fCadEd92206b8D0Bf` | `0x6720580d11EB60A78DFFC99e987F670F47D9Bb50` | Deployed & Active |
| **AsyncVault Template** | `0xD1B594EecEb90f262cc82C8AdD7B9d05B1bCdeF0` | `0x65b865dB0fC1aC1e232fDBbD73Ef3Ec0E7B40471` | Deployed & Active |
| **VaultFactory** | `0x9334dB9f4AE063b2C4FdEb40F2a63a7149d52C3c` | `0xf99542Bc951D9B1B765AB61a1c44DceF1998fa25` | Deployed & Configured |
| **RedemptionManager** | `0x48D9b40eD1FAF5bcc9EeB4E9bFAcD7c9F17E51Fa` | `0x8A7A690D4405feA54FeBFf90a4f8aA2603DA1821` | Deployed & Linked |
| **LifecycleExitManager (Proxy)** | `0xC8af899eac24F755704a1ad287fCe62b77929a6c` | `0xFC9E7618a21534B40a1Cc90bDF33d9dAec3EF556` | Deployed, Initialized & Linked |
| **LifecycleExitManager (Impl)** | — | `0x5Cf1D485013A644DbcB0ee2122BD7EfF7d619d0c` | Upgradable Implementation |
| **Treasury Address** | `0x08a9a44dA0BF5eD6bF9027da175dd60949f17d6d` | `0x08a9a44dA0BF5eD6bF9027da175dd60949f17d6d` | Institutional Multi-Sig |
| **USDC Token** | `0xf3f6f980917e9304D8dC9828A463BDf4b59239D4` | `0xf3f6f980917e9304D8dC9828A463BDf4b59239D4` | Verified Mock/Testnet USDC |
| **AssetRegistry** | `0xb103311FFe01849201E892d07E984ad2A17ED62f` | `0xb103311FFe01849201E892d07E984ad2A17ED62f` | Protocol Asset Registry |
| **NAV Oracle** | `0xd23Ad18c8Db21A79E48e18D8f1aF085999d57867` | `0xd23Ad18c8Db21A79E48e18D8f1aF085999d57867` | Chainlink / Institutional NAV |
| **OwnershipSyncManager** | `0x096DdB2087c2a896bb5Fda93aC84131e08A91DF5` | `0x096DdB2087c2a896bb5Fda93aC84131e08A91DF5` | Protocol BOR Sync Manager |

### 3.2. On-Chain State Verification Proof

All state linkages on `LifecycleExitManager` (`0xFC9E7618a21534B40a1Cc90bDF33d9dAec3EF556`) were verified via RPC queries:
```
- NAV Oracle:           0xd23Ad18c8Db21A79E48e18D8f1aF085999d57867 (VALIDATED)
- RedemptionManager:    0x8A7A690D4405feA54FeBFf90a4f8aA2603DA1821 (VALIDATED)
- OwnershipSyncManager: 0x096DdB2087c2a896bb5Fda93aC84131e08A91DF5 (VALIDATED)
- Treasury:             0x08a9a44dA0BF5eD6bF9027da175dd60949f17d6d (VALIDATED)
- USDC:                 0xf3f6f980917e9304D8dC9828A463BDf4b59239D4 (VALIDATED)
- AssetRegistry:        0xb103311FFe01849201E892d07E984ad2A17ED62f (VALIDATED)
- SettlementVarianceBPS:500 (5.00%) (VALIDATED)
```

---

## 4. Comprehensive Test Suite Results

All unit and integration test suites were executed against the Hardhat EVM (Cancun target) with **zero failures and zero regressions**:

| Test Suite File | Test Count | Status | Notes |
| :--- | :--- | :--- | :--- |
| **`test/SyncVault.test.js`** | **52 / 52** | Passed | Tests depositFromTreasury, Path A/B NAV check, role protections, decimal scaling. |
| **`test/AsyncVault.test.js`** | **61 / 61** | Passed | Tests requestDepositFromTreasury, AUD-03 NAV validation, feeEngine, role protections. |
| **`test/VaultFactory.test.js`** | **40 / 40** | Passed | Tests factory cloning, automatic defaults propagation, admin roles. |
| **`test/LifecycleExitManager.test.js`** | **8 / 8** | Passed | Tests batch exit execution, exit finalization, escrow sweeping, idempotency. |
| **`test/RedemptionManager.test.js`** | **56 / 56** | Passed | Tests standard redemption, gate relief for last holder, fee calculations. |
| **TOTAL** | **217 / 217** | **100% Passed** | **0 Failures across all suites** |

---

## 5. Summary of Resolutions for Outstanding Gaps

| Gap ID | Area | Description | Resolution in v10.2.0 |
| :--- | :--- | :--- | :--- |
| **P-01** | Purchase | AsyncVault NAV validation had `usdcAmountPaid` commented out | Implemented on-chain NAV oracle querying and dual-path 500 BPS variance validation in `requestDepositFromTreasury`. |
| **P-02** | Purchase | AsyncVault missing `feeEngine` and `navOracle` references | Added state variables, setters, and automated initialization wiring via `VaultFactory`. |
| **P-03** | Purchase | VaultFactory did not propagate protocol defaults on vault clone | Added `defaultTreasury`, `defaultNavOracle`, `defaultFeeEngine` and automated configuration upon cloning. |
| **E-01** | Exit | Block gas limit DoS on high-investor vault exits | Added `executeExitBatch` with per-holder idempotency mapping (`hasHolderExited`) and progress tracking. |
| **E-02** | Exit | Incomplete exit finalization | Added `finalizeExit` verifying total shares processed before closing vault and marking status `COMPLETED`. |
| **E-03** | Exit | Stranded funds from sanctioned / frozen wallets | Added `sweepUnclaimedEscrow` allowing admin to reclaim escrowed funds from non-compliant addresses. |
| **E-04** | Exit | Last remaining investor locked by percentage redemption gate | Added gate relief logic in `RedemptionManager` allowing 100% redemption when `shares >= totalVaultSupply`. |
| **E-05** | Exit | LEM initialization address inversion | Corrected `_usdc` and `_assetRegistry` parameter sequence and redeployed proxy on Sepolia. |
| **E-06** | Exit | Unlinked external dependencies on LEM | Configured `navOracle`, `redemptionManager`, `syncManager`, and `treasury` on-chain. |
