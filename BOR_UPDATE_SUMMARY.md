# CRATS Protocol Update: Beneficial Owner Registry (BOR)

This update integrates the **Beneficial Owner Registry (BOR)** module, transformining the CRATS Protocol into a fully transparent, regulatory-grade RWA tokenization platform.

## 🚀 The Core Innovation: "Look-Through" Transparency
In traditional RWA tokenization, regulators can only see the "nominee" (the Vault) holding the assets. This update creates an on-chain "Look-Through" layer in the **AssetRegistry**, allowing anyone with authorization to see the **ultimate beneficial owners** holding shares in the Vault.

---

## ✨ Key Features

### 1. Real-Time Ownership Ledger
The **AssetRegistry (Layer 2)** now maintains a live ledger of:
- **Actual Investor Addresses**: The real people/institutions behind the vault shares.
- **APT Claim**: The absolute quantity of the underlying asset owned (e.g., 52.3 grams of Gold or 5.23% of a Property).
- **BPS Ownership**: Precise ownership percentage in Basis Points.

### 2. Automated "Set-and-Forget" Hooks
We have implemented a **BaseVault** architecture. This means:
- Every **Deposit**, **Redeem**, and **Transfer** automatically updates the Registry.
- No manual reporting is required; the blockchain is the reporting engine.

### 3. Asynchronous Visibility
For RWA assets using **AsyncVaults (ERC-7540)**, the registry now tracks **Pending Positions**. 
- Regulators can see when an investor has committed capital *before* the tokens are even minted.

### 4. Mathematical Auditability (The Invariant)
The system enforces a strict mathematical truth:
> **Σ (Institutional Claims) == Vault.totalAssets()**
- A new `validateInvariant()` function allows and-chain or off-chain auditors to verify the integrity of the ownership data instantly.

---

## 🛠️ Contract Modifications

| Component | Category | Change Description |
| :--- | :--- | :--- |
| **AssetRegistry.sol** | Layer 2 | Integrated the BOR storage and `syncOwner` logic. |
| **AssetFactory.sol** | Layer 2 | Added automatic vault registration hooks. |
| **BaseVault.sol** | Layer 3 | **[NEW]** Created abstract base for all institutional vaults. |
| **SyncVault.sol** | Layer 3 | Refactored to support automatic BOR syncing. |
| **AsyncVault.sol** | Layer 3 | Refactored to support request-lifecycle syncing. |
| **VaultFactory.sol** | Layer 3 | Integrated with AssetFactory for zero-config deployments. |

---

## 🔒 Security & Performance
- **Gas Optimization**: Implemented batch-syncing for small vaults and event-driven signals for large vaults (>200 holders) to prevent gas exhaustion.
- **Role-Based Access**: Only authorized Vaults (via `VAULT_ROLE`) can update the Registry, preventing data corruption.

---

## 📈 Practical Example: The "Look-Through" in Action

**Scenario**: An institutional investor (**0xUserA**) invests $10,000 in a Real Estate Vault.

### 1. The Investment (Layer 3)
*   **Action**: User deposits funds; Vault mints **1,000 vAPT** (shares).
*   **Automatic Hook**: The Vault's internal hook fires immediately.

### 2. The Registry Update (Layer 2)
The Vault automatically notifies the `AssetRegistry`. A regulator querying the registry for **0xUserA** sees:

| Field | Value | Significance |
| :--- | :--- | :--- |
| **investor** | 0xUserA... | Verified identity link. |
| **vaultShares** | 1,000 vAPT | Technical share balance. |
| **aptClaim** | **12.5 APT** | **Economic Value**: Real-world asset claim. |
| **bpsOwnership** | **450 BPS** | **Auditability**: 4.5% total property share. |

***

> [!TIP]
> **Key Takeaway**: Even if the investor only sees "1,000 shares" in their wallet, the **AssetRegistry** provides the legal, audit-grade proof that those shares represent exactly **12.5 units** of the underlying RWA.
