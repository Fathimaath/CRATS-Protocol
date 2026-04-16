# Nexus Protocol: Institutional Workflow

This document outlines the high-level contiguous workflow for the Nexus Protocol SaaS Dashboard.

---

## 🏗️ Stage 1: Institutional Onboarding
**Goal**: Verify the organization and receive an Identity Soulbound Token (SBT).

1.  **Wallet Connection**: Sign in with the institutional treasury wallet.
2.  **KYC Verification**: Submit organizational credentials to the Nexus Compliance Registry.
3.  **SBT Issuance**: Upon approval, the `IdentityRegistry` mints a non-transferable Identity SBT to the wallet.
    *   *Blockchain Action*: `IdentityRegistry.registerIdentity` + `IdentitySBT.mint`.

---

## 💎 Stage 2: Tokenization Studio
**Goal**: Issue a compliant RWA token and prepare it for distribution.

1.  **Asset Definition**: Define name (e.g., Azure Manor), ticker, and initial Valuation (NAV).
2.  **Compliance Config**: Register legal proof-of-ownership documents via IPFS/DID.
3.  **Atomic Issuance**: Deploy the `AssetToken` contract and mint the total supply to the Institutional Treasury.
    *   *Blockchain Action*: `AssetFactory.deployAsset` + `AssetToken.setNAV` + `AssetToken.addDocuments`.

---

## 📈 Stage 3: Marketplace & Yield
**Goal**: Deploy liquidity vaults and enable secondary market investment.

1.  **Vault Deployment**: The issuer creates a `SyncVault` (ERC-4626) for a specific asset.
2.  **Primary Market Listing**: The vault is listed on the Nexus Marketplace.
3.  **Institutional Investment**: Investors deposit capital into the vault.
    *   *Blockchain Action*: `VaultFactory.createSyncVault` + `SyncVault.deposit`.
4.  **Instant Settlement**: Tokens are transferred from the Treasury to the Vault, and yield-bearing shares are minted to the investor.

---

## 🚀 The Tri-Stage Investment Lifecycle
**Goal**: Atomic institutional settlement for retail investors.

The Nexus Protocol uses a mediated settlement model to bridge the gap between retail capital (USDC/USDT) and institutional RWA assets.

1.  **Stage 1: Public Capital Transfer** (Wallet Connection Required)
    *   **Action**: The investor transfers the required USDT from their connected wallet (MetaMask/Phantom) to the Institutional Treasury.
    *   **Logic**: `ERC20.transfer(treasuryAddress, amount)`.
    
2.  **Stage 2: Institutional Conversion** (Treasury Mediation)
    *   **Action**: The Treasury verifies the incoming payment and performs the "conversion" by approving the required RWA `AssetTokens` for the target Vault.
    *   **Logic**: `AssetToken.approve(vaultAddress, amount)`.

3.  **Stage 3: Vault Share Minting** (Atomic Settlement)
    *   **Action**: The Treasury deposits the assets into the Vault, which atomically mints yield-bearing shares directly to the **Investor's Connected Wallet**.
    *   **Logic**: `SyncVault.deposit(amount, investorAddress)`.

---

## 🛡️ Risk & Safety Modules
*   **Circuit Breaker**: Halts trading in case of regulatory updates or oracle failure.
*   **Force Transfer**: Enables regulators to re-appropriate funds in case of lost keys or court orders.
*   **Atomic Clearance**: Layer 4 ClearingHouse ensures all trades are compliant before settlement.
