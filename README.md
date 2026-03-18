# CRATS Protocol - Multi-Layer RWA Tokenization Platform

**CRATS** (Compliant Real World Asset Tokenization System) is a comprehensive 4-layer architecture for regulated RWA tokenization on Ethereum.

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 4: MARKETPLACE / LIQUIDITY                                │
│ +-- AMMPool, OrderBook, Settlement                              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 3: FINANCIAL ABSTRACTION (ERC-4626 + ERC-7540)           │
│ +-- SyncVault (ERC-4626)  - Atomic deposit/redeem              │
│ +-- AsyncVault (ERC-7540) - Request/claim pattern (T+1, T+2)   │
│ +-- VaultFactory          - Vault deployment                   │
│ +-- YieldDistributor      - Rental/dividend/interest           │
│ +-- RedemptionManager     - Queue processing, gates            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 2: TOKENIZATION (ERC-20F)                                 │
│ +-- AssetToken   - Force transfer (ERC-7518)                   │
│ +-- AssetOracle  - Multi-sig NAV, Chainlink PoR                │
│ +-- AssetRegistry - Documents, Proof of Reserve                │
│ +-- CircuitBreaker - Trading halts, price limits               │
│ +-- Plugins: RealEstate, FineArt, CarbonCredit                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 1: IDENTITY & COMPLIANCE                                  │
│ +-- IdentitySBT          - Soulbound identity (ERC-721)        │
│ +-- IdentityRegistry     - Wallet-to-identity mapping           │
│ +-- KYCProvidersRegistry - Approved KYC providers               │
│ +-- ComplianceModule     - Jurisdiction, limits, caps          │
│ +-- TravelRuleModule     - FATF Recommendation 16              │
│ +-- InvestorRightsRegistry - Investor entitlements             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 0: LEGAL / SPV                                            │
│ +-- Legal Structure, Custody, Off-chain Assets                 │
└─────────────────────────────────────────────────────────────────┘
```

## 📋 Standards Compliance

| Layer | Standard | Purpose | Status |
|-------|----------|---------|--------|
| L1 | ERC-721 | Soulbound Identity | ✅ Implemented |
| L2 | ERC-20F | Force Transfer Token | ✅ Implemented |
| L2 | ERC-7518 | Tokenized Securities | ✅ Implemented |
| L3 | ERC-4626 | Tokenized Vault | ✅ Implemented |
| L3 | ERC-7540 | Async Vault Extension | ✅ Implemented |

## 🚀 Quick Start

### Installation

```bash
npm install
```

### Compile Contracts

```bash
npm run compile
```

### Run Tests

```bash
npm test
REPORT_GAS=true npm test
npm run test:coverage
```

### Deploy Layer 1 (Identity & Compliance)

```bash
# Local Hardhat
npm run deploy:local

# Sepolia Testnet
npm run deploy:sepolia

# Mainnet
npm run deploy:mainnet
```

### Deploy Layer 2 (Asset Tokenization)

```bash
# Local
npm run deploy:layer2:local

# Configure Layer 1 addresses first:
export IDENTITY_REGISTRY_ADDRESS=0x...
export COMPLIANCE_MODULE_ADDRESS=0x...
export TRAVEL_RULE_MODULE_ADDRESS=0x...
```

### Deploy Layer 3 (Financial Vaults)

```bash
# Local
npm run deploy:layer3:local
```

## 📁 Project Structure

```
contracts/
├── identity/           # Layer 1 - Identity & KYC
│   ├── IdentitySBT.sol
│   ├── IdentityRegistry.sol
│   ├── KYCProvidersRegistry.sol
│   └── InvestorRightsRegistry.sol
├── compliance/         # Layer 1 - Compliance Engine
│   ├── ComplianceModule.sol
│   ├── TravelRuleModule.sol
│   └── CircuitBreakerModule.sol
├── asset/             # Layer 2 - Asset Tokenization
│   ├── AssetToken.sol
│   ├── AssetFactory.sol
│   ├── AssetOracle.sol
│   ├── AssetRegistry.sol
│   └── plugins/       # RealEstate, FineArt, CarbonCredit
├── vault/             # Layer 3 - Financial Vaults
│   ├── SyncVault.sol      # ERC-4626
│   └── AsyncVault.sol     # ERC-7540
├── market/            # Layer 3/4 - Market Infrastructure
│   ├── YieldDistributor.sol
│   ├── RedemptionManager.sol
│   ├── AMMPool.sol
│   └── OrderBook.sol
├── financial/         # Layer 3 - Factory & Registry
│   └── VaultFactory.sol
└── interfaces/        # Contract Interfaces
    ├── identity/
    ├── compliance/
    ├── asset/
    ├── standards/     # ERC-4626, ERC-7540
    └── financial/
```

## 🔧 Key Features

### Layer 1 - Identity & Compliance

- ✅ **Soulbound Identity (SBT)** - Non-transferable ERC-721 for investor identity
- ✅ **Multi-Chain Wallet Support** - Link multiple wallets across chains (up to 20)
- ✅ **Investor Roles** - None, Investor, Qualified, Institutional, Issuer
- ✅ **Jurisdiction Controls** - Allow/block by ISO 3166-1 country codes
- ✅ **Holding/Transfer Limits** - By investor role
- ✅ **Travel Rule Compliance** - FATF Recommendation 16 (hashed PII for GDPR)
- ✅ **Risk Scoring** - 0-100 risk score for transactions

### Layer 2 - Asset Tokenization

- ✅ **ERC-20F Tokens** - Force transfer for regulatory recovery
- ✅ **Asset Factory** - Clone-based deployment (gas efficient)
- ✅ **Multi-Sig Oracle** - NAV updates require 2+ approvals
- ✅ **Chainlink PoR** - Proof of Reserve integration
- ✅ **Circuit Breakers** - Price limits, trading halts
- ✅ **Plugin System** - Category-specific logic (Real Estate, Art, Carbon)

### Layer 3 - Financial Vaults

- ✅ **ERC-4626 Sync Vaults** - Atomic deposit/redeem (T+0)
- ✅ **ERC-7540 Async Vaults** - Request/claim pattern (T+1, T+2, T+7)
- ✅ **Yield Distribution** - Rental income, dividends, interest
- ✅ **Redemption Queues** - FIFO processing, pro-rata distribution
- ✅ **Redemption Gates** - Limit % redeemable per period
- ✅ **Vault Factory** - Template-based deployment

## 🛡️ Security & Audits

### Reference Implementations

| Contract | Reference | Audit Status |
|----------|-----------|--------------|
| ERC-4626 (SyncVault) | OpenZeppelin | ✅ Audited 2022-10 |
| ERC-7540 (AsyncVault) | ERC4626 Alliance | ✅ Production-grade |
| ERC-7540 (AsyncVault) | Centrifuge Protocol | ✅ $500M+ AUM |

### Audit Status

| Layer | Status | Priority |
|-------|--------|----------|
| Layer 1 | ⚠️ Development | 🔴 Critical |
| Layer 2 | ⚠️ Development | 🔴 Critical |
| Layer 3 | ⚠️ Development | 🟡 High |

**Note:** For production deployment, professional audits are REQUIRED for Layer 1 and Layer 2 (critical compliance logic). Layer 3 uses audited reference implementations.

## 📊 Use Cases

### Real Estate Tokenization

1. Create AssetToken via AssetFactory (REAL_ESTATE category)
2. Deploy AsyncVault (ERC-7540) for the property
3. Investors requestDeposit() (T+1 settlement)
4. Rental income distributed via YieldDistributor
5. Investors redeem with 30-day notice period

### Treasury Bill Vault

1. Create AssetToken for T-Bills
2. Deploy SyncVault (ERC-4626) for instant liquidity
3. Daily yield accrual via Chainlink PoR
4. Instant deposit/redeem

### Fine Art Fractionalization

1. Create AssetToken via FineArtPlugin
2. Deploy AsyncVault with T+7 settlement
3. Royalty distribution via YieldDistributor
4. Scheduled redemption windows (quarterly)

## 🌐 Network Support

| Network | Chain ID | Status |
|---------|----------|--------|
| Hardhat Local | 31337 | ✅ Ready |
| Ethereum Sepolia | 11155111 | ⚠️ Configure .env |
| Ethereum Mainnet | 1 | ⚠️ Configure .env |
| Polygon | 137 | 🔜 Coming Soon |
| Arbitrum | 42161 | 🔜 Coming Soon |

## 📖 Documentation

- [Layer 1: Identity & Compliance](./docs/layer1-identity.md)
- [Layer 2: Asset Tokenization](./docs/layer2-assets.md)
- [Layer 3: Financial Vaults](./docs/layer3-vaults.md)
- [API Reference](./docs/api-reference.md)

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- OpenZeppelin Contracts (ERC-4626 implementation)
- ERC4626 Alliance (ERC-7540 reference)
- Centrifuge Protocol (RWA vault patterns)
- Ethereum Foundation (ERC standards)
