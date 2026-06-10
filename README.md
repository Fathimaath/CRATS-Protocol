# CRATS Protocol — Institutional RWA Platform

**The Enterprise Gateway to the Real-World Asset Economy.**

CRATS is a production-grade 4-layer institutional protocol for tokenizing, managing, and providing liquidity for Real-World Assets (RWAs). It enables compliant transformation of properties, private equity, and credit instruments into institutional-grade on-chain tokens.

---

## 🏛️ Protocol Architecture

| Layer | Name | Contracts |
|-------|------|-----------|
| **L1** | Identity & Compliance | `KYCProvidersRegistry`, `IdentitySBT`, `IdentityRegistry`, `Compliance`, `TravelRuleModule` |
| **L2** | Asset Tokenization | `AssetFactory`, `AssetToken` (ERC-3643), `AssetRegistry`, `RealEstatePlugin`, `CircuitBreakerModule` |
| **L3** | Financial Abstraction | `VaultFactory`, `SyncVault` (ERC-4626), `YieldDistributor`, `FeeEngine`, `NAVOracle`, `RedemptionManager` |
| **L4** | Marketplace & Settlement | `OrderBookEngine`, `SettlementEngine`, `ClearingHouse`, `MarketplaceFactory` |

---

## 🛠️ Tech Stack

- **Network**: Hardhat (localhost) · Ethereum Sepolia (testnet)
- **Smart Contracts**: Solidity `^0.8.20` — UUPS Upgradeable (OpenZeppelin v5)
- **Tooling**: Hardhat · Ethers.js v6 · `@openzeppelin/hardhat-upgrades`
- **Frontend**: React + Vite + Tailwind CSS + Framer Motion
- **Custody**: Fireblocks (institutional wallet management)

---

## ⚡ Quick Start

### Prerequisites

```bash
node >= 18.0.0
npm >= 9.0.0
```

### Install Dependencies

```bash
cd CRATS-EVM
npm install
```

### Compile Contracts

```bash
npx hardhat compile
```

---

## 🖥️ Local Development (Hardhat Node)

### 1. Start the Local Node

Open a **dedicated terminal** and keep it running:

```bash
npx hardhat node
```

This starts a local EVM at `http://127.0.0.1:8545` with 20 pre-funded accounts.

---

### 2. Deploy All Contracts (One Command)

Deploys all 4 layers in one shot — recommended for a clean start:

```bash
npx hardhat run scripts/deploy-master.js --network localhost
```

**What it deploys:**
- L1: KYCRegistry, IdentitySBT, IdentityRegistry, Compliance, TravelRuleModule
- L2: CircuitBreakerModule, AssetToken (template), AssetFactory, AssetRegistry, RealEstatePlugin
- L3: SyncVault (template), VaultFactory, YieldDistributor, MockUSDC, MockUSDT, FeeEngine, NAVOracle
- L4: MarketplaceFactory, OrderBookEngine, SettlementEngine, ClearingHouse

All addresses are saved to `deployments/localhost-deployment.json`.

---

### 3. Deploy Layer by Layer

Use individual layer scripts when iterating on a specific layer:

```bash
# Layer 1 — Identity & Compliance
npx hardhat run scripts/deploy-layer1.js --network localhost

# Layer 2 — Asset Tokenization
npx hardhat run scripts/deploy-layer2.js --network localhost

# Layer 3 — Financial Abstraction (Vaults, FeeEngine, NAVOracle)
npx hardhat run scripts/deploy-layer3.js --network localhost

# Layer 4 — Marketplace & Settlement
npx hardhat run scripts/deploy-layer4.js --network localhost
```

> **Note**: Each layer reads addresses from the previous layer's output in `deployments/localhost-deployment.json`. Always deploy in order: L1 → L2 → L3 → L4.

---

### 4. Clean Reset & Redeploy

To wipe state and redeploy everything from scratch:

```powershell
# Remove stale deployment files
Remove-Item "deployments\localhost-deployment.json" -ErrorAction SilentlyContinue
Remove-Item "deployments\localhost-workflow-results.json" -ErrorAction SilentlyContinue

# Redeploy all layers
npx hardhat run scripts/deploy-master.js --network localhost
```

Or use the convenience script:

```powershell
.\scripts\reset-and-deploy.ps1
```

---

## 🔄 Running the E2E Workflow (14 Steps)

The full lifecycle from issuer onboarding to secondary market settlement. Requires a running local node with all contracts deployed.

### Run All 14 Steps at Once

```bash
npx hardhat run scripts/workflow/test-workflow.js --network localhost
```

### Run Individual Steps

```bash
# L1 — Identity
npx hardhat run scripts/workflow/1.issuer_onboarding_identity_registry_L1.js --network localhost
npx hardhat run scripts/workflow/2.kyc_verification_L1.js --network localhost
npx hardhat run scripts/workflow/3.sbt_minting_L1.js --network localhost

# L2 — Asset Tokenization
npx hardhat run scripts/workflow/4.asset_tokenization_L2.js --network localhost
npx hardhat run scripts/workflow/5.asset_document_registry_L2.js --network localhost
npx hardhat run scripts/workflow/6.oracle_nav_configuration_L2.js --network localhost
npx hardhat run scripts/workflow/7.minting_to_treasury_L2.js --network localhost

# L3 — Vault & Investment
npx hardhat run scripts/workflow/8.listing_creating_vault_contract_L3.js --network localhost
npx hardhat run scripts/workflow/9.investor_onboarding_L1.js --network localhost
npx hardhat run scripts/workflow/10.investor_sbt_minting_L1.js --network localhost
npx hardhat run scripts/workflow/11.investment_primary_market_L3.js --network localhost
npx hardhat run scripts/workflow/12.yield_distribution_L3.js --network localhost

# L4 — Secondary Market
npx hardhat run scripts/workflow/13.secondary_market_order_L4.js --network localhost
npx hardhat run scripts/workflow/14.clearing_settlement_L4.js --network localhost
```

### Workflow Step Summary

| Step | Layer | Action |
|------|-------|--------|
| 1 | L1 | Issuer identity registration + KYC provider setup |
| 2 | L1 | KYC verification → `STATUS_VERIFIED` |
| 3 | L1 | IdentitySBT confirmation |
| 4 | L2 | Asset tokenization — deploys `AZURE` (ERC-3643) |
| 5 | L2 | Document registry — TITLE_DEED + APPRAISAL |
| 6 | L2 | NAV Oracle configuration — initial $1.00 NAV |
| 7 | L2 | Mint 10M AZURE tokens to treasury wallet |
| 8 | L3 | Deploy SyncVault (ERC-4626) + NAVOracle + identity registration |
| 9 | L1 | Investor identity registration + KYC |
| 10 | L1 | Investor SBT minting + `STATUS_VERIFIED` |
| 11 | L3 | Primary market investment → USDC → treasury, AZURE → vault, vAZURE → investor |
| 12 | L3 | Yield distribution → rental income distributed to vault |
| 13 | L4 | Secondary market — place buy order on OrderBookEngine |
| 14 | L4 | Clearing & DvP settlement via ClearingHouse |

---

## 🌐 Sepolia Testnet Deployment

### Prerequisites

1. Create a `.env` file in `CRATS-EVM/`:

```env
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY
PRIVATE_KEY=0xYOUR_DEPLOYER_PRIVATE_KEY
ETHERSCAN_API_KEY=YOUR_ETHERSCAN_KEY
```

2. Ensure deployer wallet has **≥ 0.5 ETH** on Sepolia (get from [Sepolia Faucet](https://sepoliafaucet.com/)).

### Deploy All Layers to Sepolia

```bash
npx hardhat run scripts/deploy-master.js --network sepolia
```

All addresses saved to `deployments/sepolia-deployment.json`.

### Deploy Layer by Layer on Sepolia

```bash
npx hardhat run scripts/deploy-layer1.js --network sepolia
npx hardhat run scripts/deploy-layer2.js --network sepolia
npx hardhat run scripts/deploy-layer3.js --network sepolia
npx hardhat run scripts/deploy-layer4.js --network sepolia
```

### Run Workflow on Sepolia

```bash
npx hardhat run scripts/workflow/test-workflow.js --network sepolia
```

> **Note**: Each transaction on Sepolia requires gas. The full workflow uses ~50–80 transactions. Budget ~0.1 ETH for a complete run.

### Verify Contracts on Etherscan

```bash
npx hardhat verify --network sepolia <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
```

For UUPS proxy contracts:

```bash
npx hardhat verify --network sepolia <PROXY_ADDRESS>
```

---

## 🔑 Key Files

```
CRATS-EVM/
├── contracts/
│   ├── identity/          # L1 — KYCRegistry, IdentitySBT, IdentityRegistry
│   ├── compliance/        # L1 — Compliance, TravelRuleModule
│   ├── asset/             # L2 — AssetFactory, AssetToken, AssetRegistry, plugins
│   ├── financial/         # L3 — VaultFactory, FeeEngine, YieldDistributor
│   ├── vault/             # L3 — SyncVault (ERC-4626), AsyncVault, BaseVault
│   └── market/            # L4 — OrderBookEngine, SettlementEngine, ClearingHouse, NAVOracle
├── scripts/
│   ├── deploy-master.js   # Full 4-layer deployment (single command)
│   ├── deploy-layer1.js   # L1 only
│   ├── deploy-layer2.js   # L2 only
│   ├── deploy-layer3.js   # L3 only
│   ├── deploy-layer4.js   # L4 only
│   └── workflow/          # 14-step E2E lifecycle scripts
├── deployments/
│   ├── localhost-deployment.json   # Contract addresses (local)
│   └── sepolia-deployment.json     # Contract addresses (Sepolia)
└── hardhat.config.js
```

---

## 🧪 Testing

```bash
# Run all tests
npx hardhat test

# Run tests for a specific layer
npx hardhat test test/layer1/
npx hardhat test test/layer2/
npx hardhat test test/layer3/
npx hardhat test test/layer4/

# Run with gas reporting
REPORT_GAS=true npx hardhat test

# Run with coverage
npx hardhat coverage
```

---

## 🏗️ Hardhat Config Networks

| Network | RPC | Chain ID |
|---------|-----|----------|
| `localhost` | `http://127.0.0.1:8545` | 31337 |
| `sepolia` | Infura / Alchemy | 11155111 |

---

## 📋 Deployment Output Example

After running `deploy-master.js`, the `localhost-deployment.json` will contain:

```json
{
  "network": "localhost",
  "contracts": {
    "kycRegistry":        "0x...",
    "identitySBT":        "0x...",
    "identityRegistry":   "0x...",
    "complianceModule":   "0x...",
    "assetFactory":       "0x...",
    "assetRegistry":      "0x...",
    "vaultFactory":       "0x...",
    "syncVaultTemplate":  "0x...",
    "yieldDistributor":   "0x...",
    "feeEngine":          "0x...",
    "navOracle":          "0x...",
    "usdc":               "0x...",
    "usdt":               "0x...",
    "orderBookEngine":    "0x...",
    "settlementEngine":   "0x...",
    "clearingHouse":      "0x..."
  }
}
```

---

*Verified. Compliant. Liquid. — CRATS Protocol*
