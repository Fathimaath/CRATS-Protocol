# CRATS Nexus: Institutional RWA Protocol

**The Enterprise Gateway to the Real-World Asset Economy.**

CRATS Nexus is a high-fidelity institutional protocol designed to tokenize, manage, and provide liquidity for Real-World Assets (RWAs). Built on a 4-layer architecture, it enables seamless transformation of properties, private equity, and credit into institutional-grade digital tokens.

---

## 🏛️ The Protocol Architecture

CRATS Nexus operates across four modular layers to ensured compliance, security, and financial utility:

*   **Layer 1: Identity & Compliance**: Multi-jurisdictional KYC/AML registry utilizing non-transferable Soulbound Tokens (SBTs) to gate-keep participation.
*   **Layer 2: Asset Tokenization**: Atomic issuance of ERC-3643 compatible tokens with force-transfer, circuit-breaker, and document-registry capabilities.
*   **Layer 3: Financial Abstraction**: ERC-4626 Tokenized Vaults (SyncVaults) that decouple asset ownership from investment liquidity.
*   **Layer 4: Marketplace & Secondary**: High-throughput settlement engines for primary market issuance and peer-to-peer secondary trading.

---

## 🎭 The Story: A High-Fidelity Demo Journey

This demo mimics a real-world SaaS experience for two primary personas:

### 1. The Institutional Issuer (Asset Manager)
*   **Step 1: Onboarding**: Connect your institutional wallet and undergo "Nexus Verification" to receive your Identity SBT.
*   **Step 2: Tokenization**: Use the **Token Studio** to deploy a compliant RWA token (e.g., *Azure Manor*). The protocol atomically mints the entire supply to the treasury.
*   **Step 3: Market Listing**: Deploy a **SyncVault** specifically for that asset to open it up for institutional investment.

### 2. The Institutional Investor
*   **Step 1: Discover**: Browse the **Nexus Marketplace** for yield-bearing RWA vaults verified by the protocol.
*   **Step 2: Invest**: One-click investment flow that deposits stablecoins, transfers asset tokens from treasury to vault, and mints yield-bearing shares to the investor.

---

## 🛠️ Tech Stack & Deployment

*   **Network**: Sepolia Testnet (Ethereum).
*   **Frontend**: React + Vite + Tailwind CSS + Framer Motion (Stripe-inspired UI).
*   **Smart Contracts**: Solidity v0.8.25 (UUPS Upgradable, OpenZeppelin).
*   **Provider**: Ethers.js v6 with automated demo-signing authority.

---

## 🚦 Getting Started

1.  **Clone & Install**: `npm install`
2.  **Infrastructure**: `npx hardhat compile`
3.  **Launch Dashboard**: `npm run dev`

*Verified. Compliant. Liquid. Welcome to the Nexus Protocol.*
