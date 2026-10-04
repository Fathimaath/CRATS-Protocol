# CRATS Protocol — Vault Architecture Updates & Audit Resolution Summary

## 1. Executive Summary

This document outlines the architectural enhancements and security hardening applied to the **CRATS-EVM** smart contract repository.

The primary objective was to align the smart contract layer with the institutional purchase architecture: **"USDC Never Touches the Vault"**. Under this model, investor fiat/stablecoins remain strictly in institutional custody (Fireblocks Treasury), while the Treasury directly settles tokenized Real World Assets (RWA) into the CRATS Vaults, which in turn mint 1:1 fractional shares directly to the investor's verified address.

All modifications were implemented with a **minimalist, production-ready design**, ensuring zero unnecessary complexity and 100% backwards compatibility without requiring immediate code changes on `copym-platform`.

---

## 2. Overview of Changes by File

### 2.1. `contracts/vault/SyncVault.sol`

| What Changed | For What (Rationale & Security Impact) |
| :--- | :--- |
| **Protected `setCategory(bytes32)`** | Added `onlyRole(DEFAULT_ADMIN_ROLE)`. Previously, this function was publicly callable without access control, allowing any arbitrary external address to overwrite the vault's asset categorization. |
| **Automatic Treasury Operator Authorization** | In `setTreasury(address _treasury)`, the contract now automatically executes `_grantRole(OPERATOR_ROLE, _treasury)`. Additionally, `depositFromTreasury` explicitly permits `msg.sender == treasury`. This prevents transaction reverts when Fireblocks Treasury invokes vault methods. |
| **Dual-Mode NAV Pricing Validation** | Resolves the critical variance revert bug where backend callers might supply total cash paid (`price * amount`) or unit price (`purchasePrice`). The contract validates the incoming USD value against NAV in primary mode (total consideration) and falls back to unit pricing within the strict 5% (500 BPS) variance tolerance. |
| **Sound Decimal Handling** | Treats `usdcAmountPaid` canonically as 18-decimal WAD value at the interface boundary. This eliminates dangerous heuristics (`usdcAmountPaid < 1e14`) that could falsely scale legitimate micro-transactions. |

### 2.2. `contracts/vault/AsyncVault.sol`

| What Changed | For What (Rationale & Security Impact) |
| :--- | :--- |
| **Protected `setCategory(bytes32)` & `setSettlementPeriod(uint256)`** | Added `onlyRole(DEFAULT_ADMIN_ROLE)` to both administrative setters. Previously, both were public, allowing unauthorized actors to alter settlement periods or categorization. |
| **Treasury Hook (`requestDepositFromTreasury`)** | Added the async treasury entry point. Allows the institutional Treasury to lock underlying illiquid RWA tokens on behalf of an investor without requiring the investor to hold or transfer raw RWA tokens directly. |
| **Factory Deployer Permissions in `initialize()`** | Added `_grantRole(DEFAULT_ADMIN_ROLE, _msgSender())` during vault initialization. When `VaultFactory` clones a template, it immediately calls configuration setters (`setCategory`, `setSettlementPeriod`). Without this grant, factory deployments reverted with `AccessControlUnauthorizedAccount`. |
| **Version Alignment** | Standardized `version()` to return `AssetConfig.VERSION` (`"3.0.0"`), aligning with the global protocol versioning scheme. |

### 2.3. `contracts/interfaces/vault/ISyncVault.sol` & `IAsyncVault.sol`

| What Changed | For What (Rationale & Security Impact) |
| :--- | :--- |
| **Added Missing Interface Definitions** | Declared `depositFromTreasury`, `setTreasury`, `setFeeEngine`, `setNavOracle`, `setAssetId`, `closeVault`, and getters (`isClosed`, `treasury`, `feeEngine`, `navOracle`, `assetId`). |
| **Eliminated Ad-Hoc Call Parsing** | Prevents off-chain platforms from needing inline ad-hoc ethers Interfaces (`new ethers.Interface(["function depositFromTreasury(...)"])`), making integration robust and type-safe. |

---

## 3. Sepolia Testnet Deployment Record

Both updated vault implementations were deployed as immutable master templates on the Ethereum Sepolia Testnet, and the protocol's central `VaultFactory` was updated to point to these new templates.

| Contract Name | Sepolia Address | Status / Verification |
| :--- | :--- | :--- |
| **SyncVault Master Template** | `0xc9B9fED44301dc4E2b431C8fCadEd92206b8D0Bf` | Deployed & Active |
| **AsyncVault Master Template** | `0xD1B594EecEb90f262cc82C8AdD7B9d05B1bCdeF0` | Deployed & Active |
| **VaultFactory** | `0x9334dB9f4AE063b2C4FdEb40F2a63a7149d52C3c` | Configured with new templates via transactions `0x5ddbcc...` and `0x32b992...` |

Deployment config updated in:
- `deployments/sepolia-deployment.json`

---

## 4. Test Suite Results

All test suites were executed and verified against Hardhat EVM Cancun:
- **`SyncVault.test.js`**: **52 / 52 Passed**
- **`AsyncVault.test.js`**: **62 / 62 Passed**
- **`VaultFactory.test.js`**: **40 / 40 Passed**
- **Total Passing Tests**: **154 / 154 Passed (0 Failures)**
