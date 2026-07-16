# CRATS Protocol v10.0.0 Update — Carbon Credit & Core Upgrades

This document outlines the v10.0.0 architecture updates, workflow integration details, and developer/end-user operational guidelines.

---

## 1. Executive Summary

CRATS v10.0.0 introduces institutional-grade support for pooled carbon credit tokenization, automated retirement tracing, and a wallet-agnostic treasury layout. The update guarantees compliance and beneficial ownership tracking on-chain while keeping storage costs low by leveraging off-chain IPFS and local Document Management Systems (DMS).

---

## 2. Technical Architecture & Modifications

```
                                  [ Investor ]
                                       │ (USD Coin)
                                       ▼
                              [ Platform Treasury ]
                                       │
            ┌──────────────────────────┴──────────────────────────┐
            │ (Asset Tokens)                                      │ (USDC Payout)
            ▼                                                     ▼
     [ SyncVault ] ──(Sync beneficial ownership)──► [ OwnershipSyncManager ]
            │                                                     ▲
            ▼ (Burn Shares)                                       │ (Retirement Sync)
 [ CarbonRetirementManager ] ─────────────────────────────────────┘
            │
            ▼ (FIFO serial numbers allocation)
  [ CarbonBatchManager ]
```

### 2.1 Core Upgrades
- **SyncVault & AsyncVault**: Upgraded `totalAssets()` to scale based on weighted NAV, preventing price inflation and arbitrage attacks (AUD-03).
- **depositFromTreasury**: Introduced a new backend-orchestrated entry hook. Vaults no longer hold raw USDC/USDT. Investors deposit to the treasury wallet off-chain, and the treasury contract deposits RWA assets into the vault to mint shares directly to the investor's wallet.
- **NAV & PoR integration**: `submitNAV` in `NAVOracle` now enforces a Proof of Reserve (PoR) document hash restriction. The `getNavForMintValidation` helper ensures that only fresh or warned (non-stale/non-disputed) NAV values are utilized.
- **OwnershipSyncManager (BOR v2)**: Enriched beneficial ownership synchronization with custom reason codes (`CARBON_P2P_TRANSFER` and `CARBON_RETIREMENT`) and vault exit hooks.

### 2.2 Optional Integration Layers
- **DMSRegistry**: Local document compliance validation. It is entirely **optional**; if not configured, the asset factory skips DMS checks.
- **CarbonAssetMetadataStore**: Hosts on-chain carbon project metadata (vintage, area, methodology, registry type, serial range) and manifest hashes. It is entirely **optional**; base tokenization and vault listing function without it.

---

## 3. Carbon Credit Archetypes

CRATS separates carbon credits into two distinct archetypes:
1. **Carbon Credits (Holding)**: Configured as **`STATIC_HOLD`** (archetype code `0`). Investors hold proportional ownership of pooled assets whose value tracks the carbon market NAV. Standard redemptions are disabled.
2. **Retired Carbon Credits**: Configured as **`CONSUMABLE`** (archetype code `2`) via the `CarbonRetirementPlugin`. Once retired, the shares are burned, permanently reducing the pool size.

---

## 4. End-to-End Carbon Credit Workflow

```
Tokenize Asset (L2) ──► List Vault (L3) ──► Invest (L3) ──► P2P Trade (L4) ──► Retire Credits (L3)
```

1. **Tokenization (`scripts/workflow/17.carbon_asset_tokenization_L2.js`)**:
   - Issuer deploys `AssetToken` specifying the carbon registry category (`CARBON_CREDIT`).
   - The initial batch serial range is committed.
   - Initial NAV ($15.00) is submitted to the oracle alongside a Proof of Reserve document hash.
2. **Vault Listing (`scripts/workflow/18.carbon_vault_listing_L3.js`)**:
   - Deploy `SyncVault` and register it on `NAVOracle` and `FeeEngine`.
   - Setup `IdentityRegistry` compliance credentials for the vault.
3. **Primary Investment (`scripts/workflow/19.carbon_investment_primary_L3.js`)**:
   - Investor sends USDC to Treasury.
   - Treasury transfers RWA asset tokens to the vault and calls `depositFromTreasury(assetTokens, investor, usdcPaid)`.
   - Vault mints `vCARBON` shares directly to the investor's wallet and updates the Beneficial Ownership Register (BOR).
4. **P2P Trading (`scripts/workflow/20.carbon_p2p_secondary_L4.js`)**:
   - Investors trade `vCARBON` vault shares on the secondary market.
   - The clearing house settles the trade; ownership balances are synchronized in the BOR without allocating serial numbers (since they remain pooled in the vault).
5. **Retirement (`scripts/workflow/21.carbon_retirement_L3.js`)**:
   - Shareholder requests retirement specifying the quantity, beneficiary corporate entity, and offset purpose.
   - `CarbonBatchManager` allocates the specific serial numbers FIFO.
   - The registry operator confirms the retirement, triggering a permanent burn of vault shares.
6. **Registry Sync (`scripts/workflow/22.carbon_registry_sync_update_L2.js`)**:
   - Annual monitoring reports are uploaded on-chain.
   - Updated NAV (e.g., $16.50) is submitted, updating the vault share price dynamically.

---

## 5. Deployed Contract Reference (Localhost)

Use the following addresses for local hardhat verification:

| Contract | Purpose |
|---|---|
| `DMSRegistry` | Document compliance check (Optional) |
| `CarbonCreditPlugin` | STATIC_HOLD validator plugin |
| `CarbonRetirementPlugin` | CONSUMABLE validator plugin |
| `CarbonBatchManager` | FIFO serial tracker |
| `CarbonAssetMetadataStore` | Carbon facts registry store (Optional) |
| `CarbonRetirementManager` | Burn coordinator |
| `GovernanceMultisig` | Timelocked N-of-M multisig |
| `SanctionsOracle` | Compliance blacklist registry |

---

## 6. End-User Guide (How-To)

### How to buy Carbon Credit Vault Shares?
1. Perform KYC and ensure your wallet is verified in the `IdentityRegistry` (SBT active).
2. Wire USDC to the platform treasury.
3. The platform will automatically execute your deposit and deliver `vCARBON` vault shares to your wallet.

### How to trade Carbon Credit shares P2P?
1. List a sell or buy order on the platform order book.
2. Once matched, the settlement engine clears the trade. Your beneficial ownership updates instantly.

### How to retire Carbon Credits?
1. Submit a retirement request in the platform dashboard.
2. Specify the beneficiary name and offset purpose.
3. Wait for the registry confirmation. Once completed, your vault shares are burned and an official retirement certificate is issued to you.
