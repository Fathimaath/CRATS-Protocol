# CRATS Protocol: Backend Implementation & Fireblocks Integration Guide

This document provides a comprehensive technical guide for implementing the CRATS Protocol into the main system backend, specifically focusing on the integration with Fireblocks for secure, institutional-grade wallet management and transaction execution.

---

## 🏛️ 1. Protocol Architecture Overview

The CRATS Protocol follows a **4-Layer Modular Architecture** designed for compliant Real-World Asset (RWA) tokenization.

### Layer 1: Identity & Compliance
- **Core Contracts**: `IdentityRegistry.sol`, `IdentitySBT.sol`.
- **Purpose**: Ensures all participants are KYC/AML verified.
- **Mechanism**: Soulbound Tokens (SBTs) are minted to verified wallets.

### Layer 2: Asset Tokenization
- **Core Contracts**: `AssetFactory.sol`, `AssetToken.sol`.
- **Purpose**: Creates digital twins of RWAs.
- **Features**: Multi-jurisdictional compliance, Force Transfer, and NAV (Net Asset Value) management.

### Layer 3: Financial Abstraction
- **Core Contracts**: `VaultFactory.sol`, `SyncVault.sol` (ERC-4626).
- **Purpose**: Decouples underlying asset ownership from investor liquidity.
- **Mechanism**: Investors hold yield-bearing vault shares.

### Layer 4: Marketplace & Settlement
- **Core Contracts**: `SettlementEngine.sol`, `PriceOracle.sol`.
- **Purpose**: Enables atomic DvP (Delivery vs Payment) swaps between stablecoins and RWA assets.

---

## 🔐 2. Fireblocks Integration

Fireblocks is used as the primary infrastructure for custodial wallet management and secure transaction signing.

### 2.1. Environment Configuration
The backend requires the following environment variables (typically stored in `.env`):

```env
# Fireblocks Configuration
FIREBLOCKS_API_KEY="your-api-key"
FIREBLOCKS_API_PRIVATE_KEY_PATH="./fireblocks_secret.key"
FIREBLOCKS_BASE_URL="https://api.fireblocks.io/v1"

# Contract Addresses (EVM)
IDENTITY_REGISTRY="0x..."
IDENTITY_SBT="0x..."
ASSET_FACTORY="0x..."
VAULT_FACTORY="0x..."

# Treasury & Admin
TREASURY_VAULT_ID="1" # The Fireblocks Vault ID for the Protocol Treasury
ADMIN_PRIVATE_KEY="0x..." # Used for non-custodial admin actions if needed
RPC_URL="https://..."
```

### 2.2. Core Fireblocks Workflows
Fireblocks serves as the secure execution engine. The following workflows must be implemented:

**Action Prompt: Provision Institutional Wallet**
1. **Vault Creation**: Generate a new Fireblocks Vault Account named after the User/Institution.
2. **Asset Activation**: Create an asset wallet (e.g., `ETH_TEST` or `USDC`) within that vault.
3. **Address Mapping**: Export the deposit address to the protocol backend to link the Fireblocks Vault ID with the user's on-chain identity.

**Action Prompt: Secure Contract Interaction (CONTRACT_CALL)**
1. **Source Selection**: Designate the specific Vault ID (Treasury or User) as the transaction source.
2. **Destination Setup**: Set the target Smart Contract address as a `ONE_TIME_ADDRESS`.
3. **Payload Encoding**: Pass the hex-encoded function data (ABI-encoded) into the `extraParameters.contractCallData` field.
4. **Safety Check**: Ensure the `amount` is set to `0` unless the contract call requires native currency (ETH/MATIC).
5. **Audit Trail**: Attach a descriptive `note` to the transaction for institutional reporting.

---

## 🔄 3. Workflow Implementation Details

### 3.1. User Onboarding (Layer 1)
1. **Wallet Creation**: Create Fireblocks vault for user.
2. **KYC Registration**: Call `IdentityRegistry.registerIdentity`.
3. **SBT Minting**: `IdentityRegistry` atomically mints the `IdentitySBT`.

**Action Prompt: Register Institutional Identity**
1. **Wallet Check**: Ensure the target wallet address does not already have an Identity SBT.
2. **Metadata Preparation**:
   - Assign `Role: 1` (Institutional Investor).
   - Set `Jurisdiction: 1` (Standard Compliance).
   - Generate a unique `DID` (e.g., `did:crats:<address>`).
   - Set an `Expiry Date` (typically 1 year from current date).
3. **Registry Execution**: Execute the `registerIdentity` function on the `IdentityRegistry` contract using the parameters above.
4. **Verification**: Confirm that the `IdentitySBT` has been minted to the user's wallet address.

### 3.2. Asset Tokenization (Layer 2)
1. **Issuer Approval**: Admin approves the user's wallet as an issuer in `AssetFactory`.
2. **Deployment**: Fireblocks submits a `CONTRACT_CALL` to `AssetFactory.deployAsset`.

**Action Prompt: Deploy RWA Asset**
1. **Issuer Verification**: Confirm the user's wallet is approved as an authorized issuer in the `AssetFactory`.
2. **Data Encoding**: Encode the `deployAsset` function call with the following:
   - `Name`: Full asset name (e.g., "Azure Manor").
   - `Symbol`: Asset ticker (e.g., "AZM").
   - `Initial Supply`: Total tokens to mint (expressed in 18 decimal units).
   - `Category ID`: The `bytes32` hash of the asset category (e.g., "REAL_ESTATE").
3. **Fireblocks Submission**: Submit a `CONTRACT_CALL` from the Treasury Vault to the `AssetFactory` address containing the encoded data.
4. **State Update**: Once confirmed, record the new `AssetToken` address and link it to the user's profile.

### 3.3. Vault Deployment & Listing (Layer 3)
1. **Permissioning**: Grant the `VAULT_CREATOR_ROLE` to the user's wallet in the `VaultFactory`.
2. **Action Prompt: Create SyncVault**:
   - **Asset Mapping**: Link the vault to the previously deployed `AssetToken` address.
   - **Vault Branding**: Define the name and symbol for the yield-bearing shares (e.g., "vAZM").
   - **Execution**: Encode and submit a `createSyncVault` call via Fireblocks to the `VaultFactory`.
3. **Marketplace Integration**: Mark the vault as "Active" in the marketplace database to begin receiving deposits.

---

## 🛠️ 4. Technical Implementation "Gotchas"

### 4.1. Standardized Data Formats
The protocol uses specific formats for category identifiers and supply units.

- **Category IDs**: These are stored as `bytes32`. To generate them, take the name of the category (e.g., "Real Estate"), convert it to uppercase, replace spaces with underscores, and apply a Keccak-256 hash.
- **Supply Units**: All RWA token supplies must be scaled to 18 decimal places (standard EVM precision) before being passed to the `deployAsset` function.

### 4.2. Fireblocks Transaction Sanitization
When submitting `CONTRACT_CALL` transactions, ensure the `destination` object is flattened. The `id` (contract address) should be moved into a nested `oneTimeAddress` object to satisfy the Fireblocks SDK's latest API schema.

---

## 💎 5. The Three-Party Investment Lifecycle

This is the core business logic for processing investments from retail/institutional investors:

| Stage | Action | Description |
|:--- |:--- |:--- |
| **1. Capital Transfer** | `ERC20.transfer` | Investor sends stablecoins (USDC/USDT) to the Treasury Wallet. |
| **2. Asset Approval** | `AssetToken.approve` | Treasury approves the target `SyncVault` to spend its RWA tokens. |
| **3. Fee Approval** | `ERC20.approve` | Treasury approves the target `SyncVault` to spend the entry fee in USDC/USDT. |
| **4. Settlement** | `SyncVault.deposit` | Treasury deposits RWA assets into the Vault on behalf of the investor. Vault pulls the entry fee in USDC/USDT directly from the Treasury to the `FeeEngine` and mints shares directly to the investor's wallet. |

---

## 📊 6. Database Management

The backend maintains a local state to track Fireblocks IDs and pending blockchain actions.

**Recommended Schema (`users` table):**
- `id`: UUID
- `username`: String
- `vault_id`: Fireblocks Vault ID
- `wallet_address`: On-chain address
- `kyc_status`: PENDING/COMPLETED
- `sbt_minted`: Boolean

**Recommended Schema (`assets` table):**
- `id`: UUID
- `owner_id`: FK to users
- `address`: Token address
- `status`: DEPLOYED/LISTED

---

## 🛡️ 7. Security Best Practices

1. **Transaction Status Polling**: Fireblocks transactions are asynchronous. Implement a webhook listener or a polling mechanism to monitor `getTransactionById` until the status is `COMPLETED`.
2. **Nonce Management**: Fireblocks handles nonces internally, but ensure you don't submit redundant transactions for the same action.
3. **API Key Security**: The `fireblocks_secret.key` MUST never be committed to version control. Use a Secrets Manager in production.
4. **Idempotency**: Use `externalId` in Fireblocks transaction parameters to prevent duplicate executions during network retries.

---

## 🚀 8. Next Steps for Integration
1. **Deploy Contracts**: Ensure all L1-L4 contracts are deployed and addresses are updated in `.env`.
2. **Configure Fireblocks Console**: Set up API Users and Whitelist destination addresses if required.
3. **Initialize Registry**: Add KYC providers and Asset Categories to the registries before allowing user actions.
