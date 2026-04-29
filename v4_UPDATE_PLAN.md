# CRATS Protocol v4.0.0 Upgrade: Dual-Chain RWA Architecture

This document outlines the architecture and implementation plan for upgrading the CRATS Protocol to v4.0.0. This upgrade introduces a dual-chain approach where Real World Assets (RWAs) are securely custodied on Solana while liquidity and shares are managed on EVM networks.

## 📄 0. Goal

Sell RWA shares on EVM while the real asset (SPL token) is fully locked on Solana. We will ensure existing Hardhat and React functionalities remain intact while adding the Solana Anchor layer.

*   **Solana**: Custody of the real asset (SPL).
*   **EVM**: ERC4626 vault shares for liquidity.
*   **Verifier/Relayer**: Interoperability layer that mints mirror tokens and deposits them into the vault in a single transaction upon payment.

No cross-chain token transfer. No duplicate asset minting. Every share is backed 1:1 by a locked SPL token.

---

## ✅ 1. User Decisions & Architecture

Based on recent updates and user feedback, the following structural decisions have been implemented:

*   **Structure**: The root directory is now organized as a monorepo.
    *   `CRAT-EVM/`: Contains the Hardhat environment, existing contracts (Layer 1, 2, 3), and the React frontend (`apps/demo-web`).
    *   `CRAT-SOL/`: A new Anchor workspace for the Solana custody program.
*   **Backend**: For this version (demo/MVP), a separate backend service is not strictly required. The "Verifier" logic will be handled directly via the Frontend or local operator scripts.
*   **Integration**: The Solana-EVM link is established via a "Mirror & Vault" pattern where the EVM side issues shares only when the Solana side confirms asset locking.

---

## 🏗️ 2. Proposed Changes

### 2.1 EVM Layer (Hardhat)
We maintain all existing Layer 1, 2, and 3 contracts in `CRAT-EVM/contracts`. We add a new module specifically for the Solana integration:

#### **Contracts (`CRAT-EVM/contracts/solana/`)**
*   **`SolanaMirrorToken.sol`**: An ERC20 token (mCRAT) that acts as a placeholder minted only when assets are locked on Solana.
*   **`SyncVault.sol` (Existing)**: Instead of creating a new vault, we utilize your existing `SyncVault` located in `contracts/vault/`. This ensures the Solana mirror shares benefit from your **Identity Registry**, **Compliance Modules**, and **BOR (Beneficial Owner Registry)** syncing.
*   **`ProofVerifier.sol`**: The bridge operator. It will be granted the `OPERATOR_ROLE` on the `SyncVault`. When a payment is verified, it:
    1.  Mints `mCRAT`.
    2.  Deposits into the existing `SyncVault`.
    3.  The `SyncVault` automatically updates the `AssetRegistry` (BOR) to reflect the new holder.

### 2.2 Solana Layer (Anchor)
Located in `CRAT-SOL/`.

#### **Program (`programs/custody`)**
*   **`record_lock`**: Records the lock of a specific amount of SPL tokens.
*   **State PDA**: Tracks `total_locked` on-chain, which provides a transparent proof-of-reserve for the EVM side.

### 2.3 Frontend Integration (`CRAT-EVM/apps/demo-web`)
The React app will now interact with both chains:
1.  **Dashboard**: Show Solana Custody Balance vs. EVM Vault Total Supply.
2.  **Purchase Flow**:
    *   User pays USDT/USDC on EVM.
    *   Frontend triggers the "Proof Verifier" (simulating the relayer/backend).
    *   User receives Vault Shares.

---

## 👥 3. User Roles

| Role | Action | Responsibility |
| :--- | :--- | :--- |
| **Issuer (Admin)** | Mint SPL on Solana & Lock | Ensure physical/legal asset matches Solana mint. |
| **Issuer (Admin)** | Deploy EVM Stack | Set `maxSupply` on `ProofVerifier` to match Solana locks. |
| **Investor** | Purchase on EVM | Pay liquidity (USDT) to receive vCRAT shares. |
| **Verifier (System)** | Mint & Deposit | Automate the minting of mirror tokens upon verified payment. |

---

## 🧪 4. Verification Plan

### 4.1 Automated Tests
*   **EVM**: `cd CRAT-EVM && npx hardhat test` (Ensures new contracts don't break existing compliance layers).
*   **Solana**: `cd CRAT-SOL && anchor test` (Verifies state PDA logic).

### 4.2 Manual E2E Flow
1.  **Solana**: Run script to lock 1000 tokens in `Custody`.
2.  **EVM**: Deploy `ProofVerifier` with `maxSupply = 1000`.
3.  **Frontend**: Connect wallet, click "Buy 100 shares".
4.  **Result**: Investor receives 100 `vCRAT`, `mintedShares` becomes 100.

---

## ⚠️ 5. Hardhat Integration & Deployment

Integrating with your existing Hardhat environment is seamless because all contracts in `contracts/` are automatically included in the compilation scope.

### 5.1 Compilation
Simply run:
```bash
npx hardhat compile
```
The artifacts for the Solana bridge will be generated in `artifacts/contracts/solana/`.

### 5.2 Deployment Script (`scripts/deploy-solana-v4.js`)
To integrate with your existing infrastructure, the deployment flow is:
1.  **Deploy mCRAT**: `SolanaMirrorToken`.
2.  **Clone/Deploy SyncVault**: Use your existing Factory or deploy a new `SyncVault` instance pointing to the `mCRAT` as the asset.
3.  **Deploy Verifier**: `ProofVerifier` pointing to the `mCRAT` and `SyncVault`.
4.  **Permissions**:
    *   Call `mirror.setVerifier(verifier.address)`.
    *   Grant `OPERATOR_ROLE` to the `verifier.address` on the `SyncVault`.
    *   Grant `MINTER_ROLE` (if applicable) or ensure the verifier has permissions to mint the mirror.

### 5.3 Test Environment
Use the Hardhat network for local simulation. The `ProofVerifier` can be tested by mocking the "payment confirmation" event and observing the `SyncVault` balance change and the `AssetRegistry` sync logs.
