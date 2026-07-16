# CRATS Protocol v10.0.0 — Implementation Plan
> **Last Updated**: July 16, 2026 | Added: Carbon Credit Plugin Enhancement (Section 5) | Corrections: Archetype, DMS optional, Treasury/Vault flow, NAV+POR, Serial linkage

> [!IMPORTANT]
> **Correction Log (July 16, 2026)**
> 1. **Carbon archetype = `STATIC_HOLD`** (not `CONSUMABLE`). Retirement is business logic inside `CarbonCreditPlugin`, not an archetype. `CONSUMABLE` only applies to a separate `CarbonRetirementPlugin`.
> 2. **DMSRegistry is OPTIONAL** — not required for tokenization or marketplace. The platform runs document approval locally. DMS can be deployed and connected independently as an upgrade.
> 3. **Vault NEVER holds USDC/USDT** — investment and payout are backend-orchestrated. The vault is a share-accounting contract only.
> 4. **NAV + PoR wired to SyncVault** — `SyncVault.depositFromTreasury()` reads NAVOracle for share price validation. NAVOracle checks PoR before accepting a new NAV. NAV per share reflects in vault.
> 5. **Serial numbers registered at tokenization** — the asset token in `CarbonAssetMetadataStore` stores the serial range at creation. Producers and investors can look up which serials belong to the pooled asset.
> 6. **CarbonAssetMetadataStore is OPTIONAL** — not required for protocol operation. Tokenization works without it.


> **Blockchain Developer Level | Institutional Grade | Production Ready**
> Generated: July 2026 | Based on: `update_v10.md` + full contract audit

---

## Executive Summary

This plan transforms the current v8/v9 codebase into the v10.0.0 architecture defined in `update_v10.md`. Every change is designed to be **non-breaking** to existing on-chain state, layered top-down through the 4-layer stack, and **treasury-agnostic**: the Fireblocks-specific flow is replaced by an `ITreasury` interface so any custody wallet (Fireblocks, Gnosis Safe, Coinbase Prime, or a plain EOA) can be plugged in without touching the protocol contracts.

---

## User Review Required

> [!IMPORTANT]
> **Treasury Abstraction Decision** — The user stated: *"we are using Fireblocks as treasury but we will change — it should not affect CRATS."*
> This plan introduces `ITreasury` as a fully abstract interface. Fireblocks-specific SDK logic lives **only in the backend**. The on-chain contracts reference `ITreasury` addresses only. Swapping to any new custody provider is a `setTreasury(address)` call — zero contract redeployment.

> [!WARNING]
> **Breaking Changes from v9 → v10** — The following are **BREAKING** and require proxy upgrades or redeployment:
> - `LifecycleExitManager` must be redeployed as v2 (new state variables)
> - `AssetFactory` gains DMS reference and archetype parameter
> - `SyncVault` / `AsyncVault` gain treasury deposit hook
> - `OwnershipSyncManager` upgrades to include vault closure + governance triggers
>
> All other changes are **additive** (new contracts, new view functions, new events) and do not break existing vaults.

> [!CAUTION]
> **No Backend Changes in This Plan** — Backend orchestration (NAV calculation, Fireblocks webhook, treasury transfer sequencing) is explicitly excluded per user instruction. The contracts expose the required on-chain hooks; backend wires them.

---

## Open Questions

> [!IMPORTANT]
> 1. **Governance Multisig Signers**: How many signers (N-of-M)? Recommended: 3-of-5 for operations, 4-of-7 for protocol-level. This affects `GovernanceMultisig` deployment params.
> 2. **Timelock Delay**: v10 spec says "48h". Confirm or override before deploying `TimelockController`.
> 3. **Asset Archetypes for Existing Assets**: Existing `REAL_ESTATE`, `FINE_ART`, `CARBON_CREDIT` tokens need archetype tags (`STATIC_HOLD`, `YIELD_BEARING`, `CONSUMABLE`). Need migration mapping.
> 4. **REGULATOR_ROLE Multisig Protection**: Audit finding AUD-04 — confirm `REGULATOR_ROLE` on `AssetToken.forceTransfer()` is gated behind multisig + timelock, not just single-role.
> 5. **Sanctions Oracle Provider**: Audit finding AUD-05 — choose: Chainlink-based, Sumsub, or custom. Affects `SanctionsOracle.sol` design.
> 6. **Cross-Chain Strategy**: Audit finding AUD-10 — single-chain only for now, or design bridge sync? Affects compliance architecture.

---

## Proposed Changes

### Layer 0 — New Interfaces & Abstractions

---

#### [NEW] `contracts/interfaces/treasury/ITreasury.sol`
The single most important new interface. Every vault, LifecycleExitManager, and RedemptionManager references this instead of any Fireblocks-specific address.

```solidity
interface ITreasury {
    /// @notice Transfer underlying ERC-3643 asset tokens from treasury to vault for share minting
    function transferToVault(address assetToken, address vault, uint256 amount) external;
    
    /// @notice Return underlying tokens from vault back to treasury (on withdrawal/exit)
    function receiveFromVault(address assetToken, uint256 amount) external;
    
    /// @notice Disburse USDC from treasury to a recipient (investor payout)
    function disburseFunds(address recipient, uint256 usdcAmount) external;
    
    /// @notice Query USDC balance held in treasury for a specific purpose
    function availableForSettlement(address vault) external view returns (uint256);
    
    /// @notice Confirm settlement funds are available on-chain before exit executes
    function confirmSettlementAvailable(address vault, uint256 requiredAmount) external view returns (bool);
    
    /// @notice Treasury provider address (for off-chain identification)
    function treasuryAddress() external view returns (address);
    
    event FundsTransferred(address indexed recipient, uint256 amount, bytes32 purpose);
    event AssetsMovedToVault(address indexed assetToken, address indexed vault, uint256 amount);
    event AssetsReturnedFromVault(address indexed assetToken, uint256 amount);
}
```

**Key design**: The treasury is a **role-gated contract wrapper** on-chain. The actual custody (Fireblocks, Gnosis, EOA) is behind the `transferToVault` implementation. Swapping providers = deploy new `ITreasury` implementation + call `setTreasury(newAddr)` on relevant contracts.

---

#### [NEW] `contracts/interfaces/dms/IDMS.sol`
Document Management System interface used by plugins and AssetFactory.

```solidity
interface IDMS {
    enum DocumentStatus { UPLOADED, UNDER_REVIEW, COMPLIANCE_PENDING, APPROVED, REJECTED, REVOKED, EXPIRED }
    enum ApprovalMode { AUTO, MANUAL, COMPLIANCE_REQUIRED }
    
    struct DocumentRecord {
        bytes32 docHash;
        string docType;
        DocumentStatus status;
        ApprovalMode mode;
        uint256 uploadedAt;
        uint256 approvedAt;
        uint256 expiresAt;
        bytes32 evidenceHash;    // AUD-06 fix: required on revocation
        address approvedBy;
    }
    
    function getDocumentStatus(bytes32 docHash) external view returns (DocumentStatus);
    function isDocumentApproved(bytes32 docHash) external view returns (bool);
    function getDocumentRecord(bytes32 docHash) external view returns (DocumentRecord memory);
    
    // AUD-06 fix: revocation requires evidence + emits for governance review
    function revokeDocument(bytes32 docHash, bytes32 evidenceHash, string calldata justification) external;
    
    event DocumentApproved(bytes32 indexed docHash, string docType, address approvedBy, uint256 timestamp);
    event DocumentRevoked(bytes32 indexed docHash, bytes32 evidenceHash, string justification, address revokedBy, uint256 timestamp);
}
```

---

#### [NEW] `contracts/interfaces/governance/IGovernanceMultisig.sol`
Interface for multisig governance gating on critical operations.

```solidity
interface IGovernanceMultisig {
    function hasApproval(bytes32 operationHash) external view returns (bool);
    function queueOperation(bytes32 operationHash) external;
    function executeOperation(bytes32 operationHash) external;
    function isTimelockExpired(bytes32 operationHash) external view returns (bool);
}
```

---

#### [MODIFY] `contracts/interfaces/asset/IAssetPlugin.sol`
Add v10 required fields: DMS-aware validation, archetype, exit mechanism declaration.

**Changes**:
- Add `exitMechanism()` return: `enum ExitMechanism { PER_SHARE_REDEMPTION, RETIRE_BURN, LIFECYCLE_EXIT_ONLY }`
- Add `archetypeType()` return: `enum Archetype { STATIC_HOLD, YIELD_BEARING, CONSUMABLE }`
- Modify `validateDocuments(AssetDocument[] calldata docs, address dmsAddress)` — DMS address injected so plugin checks `IDMS.isDocumentApproved(docHash)` for each doc
- Add `getRequiredDocumentTypes()` pure getter (AUD-12 fix)

---

### Layer 1 — Identity & Compliance Upgrades

---

#### [NEW] `contracts/compliance/SanctionsOracle.sol`
Addresses AUD-05: live sanctions screening beyond point-in-time KYC.

```solidity
contract SanctionsOracle is AccessControl {
    // Pluggable: supports Chainalysis, Elliptic, or manual list
    mapping(address => bool) public sanctionedAddresses;
    address public externalOracleFeed;  // Optional: Chainlink/Sumsub feed
    
    function checkSanctions(address account) external returns (bool isSanctioned);
    function updateSanctionsList(address[] calldata accounts, bool[] calldata sanctioned) external onlyRole(COMPLIANCE_ROLE);
    function setExternalFeed(address feed) external onlyRole(DEFAULT_ADMIN_ROLE);
    
    // Triggered when external feed marks address as sanctioned
    event AddressSanctioned(address indexed account, bytes32 evidenceRef, uint256 timestamp);
    event AddressCleaned(address indexed account, uint256 timestamp);
}
```

Integration: `IdentityRegistry.isVerified()` and `Compliance.isInvestorRestricted()` will call `SanctionsOracle.checkSanctions()` before returning true.

---

#### [MODIFY] `contracts/compliance/Compliance.sol`
- Add `SanctionsOracle` reference
- `isInvestorRestricted()` checks sanctions oracle in addition to manual restrictions
- Restriction records now require `evidenceHash` and `justification` (AUD-06 pattern applied)
- Add `REGULATOR_ROLE` explicitly under governance multisig protection (AUD-04 fix)

---

### Layer 2 — Asset Layer Upgrades

---

#### [NEW] `contracts/asset/DMSRegistry.sol` — **OPTIONAL / FUTURE**

> [!NOTE]
> **DMSRegistry is OPTIONAL.** It is NOT required for tokenization, plugin validation, vault creation, or marketplace operation. The platform operates document approval locally (admin approves docs manually in the CopyM platform dashboard; documents are stored off-chain in local storage/IPFS). DMSRegistry can be deployed and wired in later as an independent upgrade without touching any existing contract.

On-chain DMS document registry implementing `IDMS`. When deployed and connected, the compliance approval workflow lives here.

**Key Functions** (when deployed):
- `uploadDocument(bytes32 docHash, string docType, ApprovalMode mode, uint256 expiresAt)` — UPLOADED state
- `submitForReview(bytes32 docHash)` → UNDER_REVIEW
- `flagForCompliance(bytes32 docHash)` → COMPLIANCE_PENDING
- `approveDocument(bytes32 docHash)` onlyRole(COMPLIANCE_ROLE) → APPROVED
- `rejectDocument(bytes32 docHash, string reason)` → REJECTED
- `revokeDocument(bytes32 docHash, bytes32 evidenceHash, string justification)` → REVOKED (AUD-06: evidence required)
- Expiry check on read: auto-marks EXPIRED if `block.timestamp > expiresAt`
- `reconcileApprovalMode(bytes32 docHash)` — resolves AUTO vs MANUAL vs COMPLIANCE_REQUIRED state transitions (AUD-08 fix)

**Connection pattern (optional)**: `AssetFactory` has a `dmsRegistry` address slot. If `dmsRegistry == address(0)`, document validation skips DMS check and passes through. If a DMS address is set, it enforces document approval. This means **zero impact on existing tokenization flows** when DMS is not deployed.

**Events** (new Indexer v2 events):
- `DocumentApproved`, `DocumentRevoked`, `DocumentExpired`, `DocumentStatusChanged`


---

#### [MODIFY] `contracts/asset/AssetFactory.sol`
Major changes for v10:

1. **DMS Integration**: Add `address public dmsRegistry`. `deployAsset()` now requires DMS-approved documents — calls `IAssetPlugin(plugin).validateDocuments(docs, dmsRegistry)`.
2. **Archetype Support**: Add `archetype` parameter to `deployAsset()`. Stored in `AssetInfo` struct alongside category.
3. **Treasury Reference**: Add `address public treasury`. After minting 100% supply, automatically transfers entire supply to `ITreasury(treasury).receiveFromVault()` — i.e., locks into treasury.
4. **Archetype Validation**: Before deployment, validate archetype is one of `{STATIC_HOLD, YIELD_BEARING, CONSUMABLE}` and matches plugin's declared archetype.
5. **Plugin Upgrade Governance**: `upgradePlugin()` now queues through governance timelock instead of instant admin call.

**New state**:
```solidity
address public dmsRegistry;
address public treasury;

struct AssetInfo {
    address token;
    address issuer;
    bytes32 category;
    uint8   archetype;   // NEW: Archetype enum value
    uint256 timestamp;
    bytes32 dmsDocSetHash; // NEW: Hash of approved document set
}
```

---

#### [MODIFY] `contracts/asset/plugins/RealEstatePlugin.sol`
Addresses AUD-07: thin document requirements.

**Changes**:
- `archetypeType()` → `STATIC_HOLD`
- `exitMechanism()` → `LIFECYCLE_EXIT_ONLY`
- `validateDocuments(docs, dmsAddr)`:
  - Required: `TITLE_DEED` (DMS-approved), `APPRAISAL` (DMS-approved)
  - Now also required: `NOC` (No Objection Certificate), `ENCUMBRANCE_CERT`
  - DMS check: `IDMS(dmsAddr).isDocumentApproved(doc.docHash)` must return `true` for each required doc
- `getRequiredDocumentTypes()` returns all 4 types with required approval mode (AUD-12 fix)

---

#### [NEW] `contracts/asset/plugins/FineArtPlugin.sol` (upgrade)
- `archetypeType()` → `STATIC_HOLD`
- `exitMechanism()` → `LIFECYCLE_EXIT_ONLY`
- Required docs: `AUTHENTICATION`, `INSURANCE`, `PROVENANCE_CERT`, `APPRAISAL`
- DMS-gated validation

---

#### [MODIFY] `contracts/asset/plugins/CarbonCreditPlugin.sol` — **STATIC_HOLD Archetype**

> [!IMPORTANT]
> **Archetype Correction: Carbon credit = `STATIC_HOLD`, NOT `CONSUMABLE`.**
>
> Carbon credits do not generate periodic yield, do not distribute income, and investors simply hold proportional ownership of a pooled registry asset. The value changes with the carbon market (NAV). The **retirement process is business logic inside the plugin** — it is not the archetype.
>
> Plugin-to-archetype final mapping:
> | Asset | Archetype | Plugin |
> |---|---|---|
> | Real Estate | `YIELD_BEARING` | `RealEstatePlugin` |
> | Fine Art | `STATIC_HOLD` | `FineArtPlugin` |
> | Carbon Credit (holding) | `STATIC_HOLD` | `CarbonCreditPlugin` |
> | Carbon Credit (retirement) | `CONSUMABLE` | `CarbonRetirementPlugin` (or `CarbonCreditPlugin` with retirement module enabled) |
>
> **Already deployed**: `FineArtPlugin` (STATIC_HOLD), `RealEstatePlugin` (YIELD_BEARING).
> **To deploy (v10)**: `CarbonCreditPlugin` (STATIC_HOLD) + `CarbonRetirementPlugin` (CONSUMABLE).

See **Section 5** for the complete, institutional-grade carbon credit plugin architecture. This is a full rewrite — not an incremental patch.

---

#### [NEW] `contracts/asset/plugins/PrivateCreditPlugin.sol`
New plugin for yield-bearing category.
- `archetypeType()` → `YIELD_BEARING`
- `exitMechanism()` → `PER_SHARE_REDEMPTION`
- Required: `CREDIT_AGREEMENT`, `BORROWER_KYC`, `MATURITY_DATE_CERT`, `INTEREST_SCHEDULE`
- Category rules: must specify maturity date, interest rate, default handling params

---

#### [NEW] `contracts/asset/plugins/TreasuryBillPlugin.sol`
Yield-bearing, market-priced.
- `archetypeType()` → `YIELD_BEARING`
- `exitMechanism()` → `PER_SHARE_REDEMPTION`
- Required: `CUSIP_CERT`, `MATURITY_SCHEDULE`, `ISSUER_CREDIT_RATING`
- NAV update frequency: 1 day max

---

#### [MODIFY] `contracts/asset/OwnershipSyncManager.sol`
Upgrade to v2 — adds missing trigger coverage (v8/v9 gaps from Table 10).

**New triggers added**:
- `updateOnVaultClosure(address asset, address vault)` — trigger #9: vault closure final state
- `updateOnAsyncRequest(address asset, address vault, address investor, uint256 pendingShares)` — trigger #10
- `updateOnAsyncClaim(address asset, address vault, address investor, uint256 finalShares)` — trigger #11
- `updateOnGovernanceRoleMigration(address asset, address vault, address oldAdmin, address newAdmin)` — trigger #12

**Storage upgrade**: Make upgradeable (currently uses non-upgradeable `AccessControl` — switch to `AccessControlUpgradeable` + UUPS proxy pattern for future upgradeability).

**Reason codes**: Expand `callerReasonCodes` enum with: `VAULT_CLOSURE`, `ASYNC_REQUEST`, `ASYNC_CLAIM`, `GOVERNANCE_MIGRATION`.

---

#### [MODIFY] `contracts/asset/AssetRegistry.sol` (BOR v2)
Add fields required for v10 enhanced BOR (Table 10, Section 8.2):

```solidity
// NEW fields in BeneficialOwner struct (storage layout safe addition via separate mapping)
mapping(address => mapping(address => mapping(address => OwnershipHistoryEntry[]))) private _ownershipHistory;
mapping(address => mapping(address => LifecycleSnapshot[])) private _lifecycleSnapshots;
mapping(address => mapping(address => ExitRecord[])) private _exitHistory;

// NEW: archetype stored per asset
mapping(address => uint8) public assetArchetype;  // maps assetToken => Archetype

// NEW: DMS document reference per asset
mapping(address => bytes32) public assetDMSDocSet;

// NEW: lifecycle status per vault
mapping(address => VaultLifecycleStatus) public vaultLifecycleStatus;
enum VaultLifecycleStatus { ACTIVE, EXIT_INITIATED, CLOSED }
```

**New functions**:
- `recordLifecycleSnapshot(address asset, address vault, bytes32 reason)` — called by LifecycleExitManager
- `recordExitHistory(address asset, address vault, address investor, uint256 settledAmount)` — called on exit
- `getOwnershipHistory(address asset, address vault, address investor)` — for regulatory reporting
- `setVaultLifecycleStatus(address vault, VaultLifecycleStatus status)` — onlyRole(SYNC_MANAGER_ROLE)

---

### Layer 3 — Financial Layer Upgrades

---

#### [NEW] `contracts/financial/GovernanceMultisig.sol`
New contract. Wraps OpenZeppelin `TimelockController` + `Multicall` pattern.

```solidity
contract GovernanceMultisig is TimelockController, AccessControl {
    // N-of-M signer threshold
    uint256 public requiredSigners;
    uint256 public totalSigners;
    mapping(bytes32 => mapping(address => bool)) public operationSignatures;
    mapping(bytes32 => uint256) public signatureCount;
    
    // Emergency Guardian — can pause without multisig (not execute)
    address public emergencyGuardian;
    
    function proposeOperation(bytes32 operationHash, bytes calldata callData, address target) external onlyRole(PROPOSER_ROLE);
    function signOperation(bytes32 operationHash) external onlyRole(SIGNER_ROLE);
    function executeOperation(bytes32 operationHash) external; // requires N-of-M sigs + timelock
    function emergencyPause(address target) external; // guardian only, no timelock
    
    event OperationProposed(bytes32 indexed opHash, address proposer, uint256 timelockExpiry);
    event OperationSigned(bytes32 indexed opHash, address signer, uint256 sigCount);
    event OperationExecuted(bytes32 indexed opHash, address executor);
    event EmergencyPaused(address indexed target, address guardian, uint256 timestamp);
}
```

**Governs**: LifecycleExitManager, AssetFactory (plugin upgrades), AssetRegistry (redemption policy), Compliance (role migrations).

---

#### [MODIFY] `contracts/financial/LifecycleExitManager.sol` → **v2 FULL REWRITE**

This is the most critical contract change. Current implementation is missing the 8 preconditions from v10 Table 13.

**New state variables**:
```solidity
address public navOracle;
address public treasury;         // ITreasury — treasury-agnostic
address public redemptionManager;
address public ownershipSyncManager;
address public governanceMultisig;
uint256 public settlementVarianceBPS; // Configurable, e.g., 500 = 5%
```

**New `verifySettlement()` function** (replaces current):
- Checks NAVOracle for current NAV of vault's asset
- Calculates expected settlement: `totalSupply * navPerShare`
- Validates `settlementAmount` is within `settlementVarianceBPS` of NAV-calculated value (AUD-03 pattern)
- Requires `ITreasury(treasury).confirmSettlementAvailable(vault, settlementAmount)` (Precondition #8)
- Requires `governanceMultisig.hasApproval(operationHash)` (Precondition #7)

**New `executeExit()` preconditions** (all 8 from Table 13):
```solidity
// Precondition #1: All investors paid
require(processedShares == IVault(vault).totalSupply(), "not all investors paid");

// Precondition #2: All shares burned  
// (verified after burning loop)
require(IVault(vault).totalSupply() == 0, "shares not fully burned");

// Precondition #3: BOR synchronized
IOwnershipSyncManager(ownershipSyncManager).updateOnVaultClosure(assetToken, vault);

// Precondition #4: Deployment params match AssetRegistry
require(IAssetRegistry(assetRegistry).isVaultRegistered(assetToken, vault), "vault not registered");

// Precondition #5: Settlement within NAV variance
_validateSettlementVariance(vault, exit.settlementAmount);

// Precondition #6: No pending redemptions
require(IRedemptionManager(redemptionManager).getPendingRequestsCount(vault) == 0, "pending redemptions exist");

// Precondition #7: Governance approval
require(IGovernanceMultisig(governanceMultisig).hasApproval(exitOpHash), "governance not approved");

// Precondition #8: Treasury settlement confirmed
require(ITreasury(treasury).confirmSettlementAvailable(vault, exit.settlementAmount), "treasury funds not confirmed");
```

**OwnershipSyncManager callback on close**: After all investors are processed, calls `IOwnershipSyncManager.updateOnVaultClosure(asset, vault)` to record final BOR state and mark vault closed in registry.

**Mutual exclusion with RedemptionManager**: Before initiating exit, call `IRedemptionManager(redemptionManager).lockVaultForExit(vault)` — prevents new redemption requests while exit is processing.

---

#### [MODIFY] `contracts/financial/RedemptionManager.sol` → **v6 enhancements**

**Mutual exclusion lock** (v10 Section 10):
```solidity
mapping(address => bool) public vaultExitLocked;

function lockVaultForExit(address vault) external onlyRole(LIFECYCLE_ROLE) {
    vaultExitLocked[vault] = true;
    _migrateToLifecycleExit(vault);
}

modifier notExitLocked(address vault) {
    require(!vaultExitLocked[vault], "vault is in lifecycle exit");
    _;
}
```

Apply `notExitLocked` modifier to `requestRedemption()`.

> [!IMPORTANT]
> **Redemption payout is backend-orchestrated, NOT an on-chain USDC transfer from vault.**
> When `claimRedemption()` is called:
> 1. RedemptionManager burns the investor's vault shares
> 2. Vault releases underlying AssetTokens to Treasury
> 3. RedemptionManager emits `RedemptionClaimed(investor, amount)` event
> 4. **Backend picks up the event** and instructs Treasury to send USDC directly to investor wallet
> 5. Backend calls `RedemptionManager.markDisbursed(requestId, txRef)` to record the off-chain payout on-chain
>
> The vault and RedemptionManager never hold or transfer USDC. The `ITreasury.disburseFunds()` reference in earlier drafts represents a backend action, logged on-chain via `markDisbursed()` for audit trail.

---

#### [MODIFY] `contracts/financial/VaultFactory.sol`
- Add `address public treasury` state variable
- Add `address public dmsRegistry`
- On vault creation, inject treasury reference into vault's storage: `ISyncVault(vault).setTreasury(treasury)`
- Add `NAV_ORACLE` reference injection per vault during creation
- Add `VaultCreated` event with archetype field (new Indexer v2 event, Table 16)

---

#### [MODIFY] `contracts/market/NAVOracle.sol`
**Per-asset-class schedule enforcement** (v10 Table 8):
- Current `getWeightedNAV()` hardcodes `FULL_APPRAISAL` as mandatory — breaks non-real-estate assets
- Fix: Make required source configurable per asset class. Yield-bearing assets (DCF+Income primary), carbon credits (market-based primary)
- Add `AssetClassSchedule` with `warningThreshold` field (currently only `maxValuationInterval`)
- Fix `assertDepositAllowed()`: check per-asset-class schedule, not hardcoded 90-day real estate assumption
- Add `getNavForMintValidation(bytes32 assetId) returns (uint256 navPerToken)` — used by SyncVault's treasury-orchestrated deposit hook (AUD-03 fix support)

---

### Layer 3 — Vault Layer Upgrades

---

#### [MODIFY] `contracts/vault/SyncVault.sol`
Key architectural change: treasury-orchestrated deposit — **vault NEVER holds USDC/USDT**.

> [!IMPORTANT]
> **Investment Flow (Backend Orchestrated — No USDC in Vault)**
>
> ```
> Investor sends USDC → Platform Treasury (backend detects)
>     ↓
> Backend orchestrator:
>   1. Treasury approves AssetTokens to SyncVault
>   2. Calls SyncVault.depositFromTreasury(assetTokenAmount, investor, usdcPaidAmount)
>     ↓
> SyncVault.depositFromTreasury():
>   1. Reads NAVOracle.getNavForMintValidation(assetId) → navPerToken
>   2. Validates: assetTokenAmount ≈ usdcPaidAmount / navPerToken (AUD-03 variance check)
>   3. Transfers AssetTokens from Treasury to vault (safeTransferFrom)
>   4. Mints vault shares to investor
>   5. Calls OwnershipSyncManager.updateBeneficialOwnership()
>   6. Emits Investment + ShareMinted events
> ```
>
> **Redemption Flow (also backend-orchestrated):**
> ```
> Investor requests redemption → RedemptionManager records request
>     ↓
> Backend fulfills: Treasury receives AssetTokens from vault burn
>     ↓
> Backend sends USDC directly to investor wallet (off-chain treasury disbursement)
>     ↓
> RedemptionManager.markClaimed(requestId) records completion on-chain
> ```
> The vault NEVER transfers USDC. `ITreasury.disburseFunds()` in the plan is a backend event trigger, not an on-chain USDC transfer from vault to investor.

**New state**:
```solidity
address public treasury;               // ITreasury reference (backend-controlled wallet)
uint256 public lastDepositUSDCAmount;  // AUD-03: recorded on-chain for mint variance check
bytes32 public pendingMintValidation;  // Hash of pending mint operation
```

**New `depositFromTreasury(uint256 assetTokens, address investor, uint256 usdcAmountPaid)` function**:
- Called by backend orchestrator (via treasury-authorized operator role)
- Records `usdcAmountPaid` on-chain for AUD-03 audit trail
- **NAV validation**: reads `NAVOracle.getNavForMintValidation(assetId)` — validates `assetTokens ≈ usdcAmountPaid / navPerToken` within acceptable variance (AUD-03 fix)
- Mints shares 1:1 against `assetTokens`
- Triggers OwnershipSyncManager BOR update with `reasonCode = PRIMARY_ISSUANCE`
- Emits `Investment` and `ShareMinted` events (new Indexer v2 events)

**NAV reflects in vault share price**:
```solidity
// SyncVault.totalAssets() is NAV-aware:
function totalAssets() public view override returns (uint256) {
    // Asset tokens in vault × NAV per token = total USDC value
    uint256 assetBalance = IERC20(asset()).balanceOf(address(this));
    uint256 navPerToken  = INAVOracle(navOracle).getNavPerToken(assetId);
    return (assetBalance * navPerToken) / 1e18;
}
// This means: vault share price = totalAssets() / totalSupply()
// = real NAV-backed share price that updates as NAV oracle updates
```

**PoR wired to NAV**:
```solidity
// NAVOracle.submitNAV() requires PoR attestation:
function submitNAV(
    bytes32 assetId,
    uint256 newNAV,
    bytes32 porDocumentHash    // Must be a verified PoR attestation hash
) external onlyRole(VALUATOR_ROLE) {
    require(porDocumentHash != bytes32(0), "NAVOracle: PoR required");
    // For carbon: porDocumentHash = immobilizationProofHash from CarbonAssetMetadataStore
    // For real estate: porDocumentHash = APPRAISAL document hash from AssetRegistry
    _updateNAV(assetId, newNAV, porDocumentHash);
}
```

**Ownership sync on every `_update()`**:
The existing `_update()` override already tracks holders. Extend to call `syncManager.updateBeneficialOwnership()` on every non-zero transfer, mint, and burn.

**`closeVault()` upgrade**:
- Must be called only by LifecycleExitManager (add role check)
- Triggers `syncManager.updateOnVaultClosure(asset(), address(this))`
- Sets `vaultLifecycleStatus = CLOSED` in AssetRegistry
- Emits `VaultClosed` event

---

#### [MODIFY] `contracts/vault/AsyncVault.sol`
- Add treasury reference
- `claimDeposit()` → triggers `syncManager.updateOnAsyncClaim()`
- `claimRedeem()` → routes payout through `ITreasury.disburseFunds()` + `syncManager.updateOnAsyncClaim()`
- Fix: `fulfillDeposit()` should emit BOR update (currently no-op for BOR)

---

#### [MODIFY] `contracts/vault/BaseVault.sol`
- Add `address public treasury` storage slot (all vaults inherit)
- Add `setTreasury(address)` with admin check
- Ensure storage gap is maintained for future upgrades

---

### Layer 4 — Marketplace Layer Upgrades

---

#### [MODIFY] `contracts/market/SettlementEngine.sol`
- Add OwnershipSyncManager integration: atomic DvP also triggers BOR sync (Table 10, trigger #6)
- Add compliance check before settlement (currently partial per Table 10)
- Settlement routes USDC through `ITreasury.disburseFunds()` for institutional-grade audit trail
- Emits `SettlementVerified` event (new Indexer v2 event)

---

#### [MODIFY] `contracts/market/OrderBookEngine.sol`
- Route all fund movements through `ITreasury`
- Add `ComplianceGate` check on order listing and order acceptance

---

### Cross-Cutting — New Events for Indexer v2

All new events from Table 16 must be added to their respective contracts:

| Event | Contract | Status |
|---|---|---|
| `DocumentApproved` | `DMSRegistry` | NEW |
| `VaultCreated` (with archetype) | `VaultFactory` | ENHANCED |
| `Investment` | `SyncVault` | NEW |
| `ShareMinted` | `SyncVault / AsyncVault` | NEW |
| `ShareBurned` | `SyncVault / LifecycleExitManager` | NEW |
| `RedemptionRequested` | `RedemptionManager` | EXISTS (verify) |
| `RedemptionCompleted` | `RedemptionManager` | NEW name |
| `LifecycleStarted` | `LifecycleExitManager` | NEW |
| `LifecycleCompleted` | `LifecycleExitManager` | NEW |
| `SettlementVerified` | `LifecycleExitManager` | NEW |
| `VaultClosed` | `SyncVault` | NEW |
| `GovernanceApproved` | `GovernanceMultisig` | NEW |

---

---

## Section 5 — Carbon Credit Plugin Enhancement (Institutional Grade)

> **Research Basis**: Verra VCS (VM0044, VM0045, VM0048), Gold Standard/CorTenX API, Puro.earth CORC structure, ACR/CAR serial formats, CAD Trust Data Model v2.0, ICVCM Core Carbon Principles (41 approved methodologies as of May 2026), Verra immobilization bridge mechanism, IPFS GeoJSON best practices, CCDF/CCCDM standard schemas.

### 5.0 — Architecture Principle

The carbon credit plugin is the **most complex plugin** in the CRATS protocol. Unlike real estate (appraisal-driven) or private credit (maturity-driven), carbon credits are **registry-sovereign assets**: their legitimacy, traceability, and retirement validity are controlled by external registries (Verra, Gold Standard, Puro, ACR, CAR) that operate entirely off-chain. The blockchain must store **immutable cryptographic proofs** of registry facts, not the facts themselves.

This enhancement also extends CRATS' existing secondary market capabilities to carbon assets. Investors may freely transfer and trade their ERC-4626 vault share tokens through the existing marketplace while the underlying registry-issued carbon credits remain securely custodied within the vault. This preserves institutional custody, ensures beneficial ownership synchronization through the BOR and OwnershipSyncManager, and maintains complete registry traceability without transferring individual registry serial numbers during normal secondary market transactions.

**Core design principles**:
1. **Registry is source of truth** — blockchain stores hashes + references, never raw registry data
2. **Immobilization pattern** — credits must be locked/immobilized in the source registry before tokenization (prevents double counting per Verra 2024 policy)
3. **Batch-level granularity** — every issuance is a distinct batch with a serial range; credits within a batch are fungible
4. **Retirement-time serial allocation** — individual serial numbers assigned only on retirement, not on investment
5. **CAD Trust compatibility** — metadata structure aligns with CAD Trust Data Model v2.0 for cross-registry interoperability
6. **ICVCM CCP flag** — track whether credits carry the Core Carbon Principles label (commands ~25% price premium)
7. **P2P trades vault shares only** — registry credits never move between investors; only BOR + carbon beneficial holdings view updates on secondary transfers

---

### 5.1 — New Interfaces

#### [NEW] `contracts/interfaces/carbon/ICarbonRegistry.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface ICarbonRegistry {

    // ── Registry Identification ──────────────────────────────
    enum RegistryType {
        VERRA,          // Verified Carbon Standard (VCU)
        GOLD_STANDARD,  // Gold Standard (VER/GS-VER)
        PURO,           // Puro.earth (CORC)
        ACR,            // American Carbon Registry (ERTs)
        CAR,            // Climate Action Reserve (CRTs)
        GCC,            // Global Carbon Council (GCCUs)
        OTHER           // Any future/regional registry
    }

    // ── Project Types (aligned with VCS sectoral scopes) ─────
    enum ProjectType {
        AFOLU_REDD,         // Reducing Emissions from Deforestation (REDD+)
        AFOLU_ARR,          // Afforestation, Reforestation, Revegetation
        AFOLU_IFM,          // Improved Forest Management
        AFOLU_ALM,          // Agricultural Land Management
        AFOLU_WRC,          // Wetlands / Blue Carbon
        AFOLU_ACoGS,        // Avoided Conversion of Grasslands
        ENERGY_RENEWABLE,   // Renewable Energy
        ENERGY_EFFICIENCY,  // Energy Efficiency
        METHANE_CAPTURE,    // Landfill / livestock methane
        BIOCHAR,            // Biochar carbon removal
        DIRECT_AIR_CAPTURE, // DAC / engineered removal
        ENHANCED_WEATHERING,// Rock weathering
        BLUE_CARBON,        // Ocean/coastal carbon sinks
        COOKSTOVES,         // Clean cooking
        INDUSTRIAL,         // Industrial processes
        TRANSPORT,          // Transport emission reduction
        WASTE_MANAGEMENT,   // Waste reduction / circular economy
        OTHER
    }

    // ── Registry Sync States ─────────────────────────────────
    enum RegistrySyncStatus {
        PENDING,     // Import requested, not yet confirmed
        VERIFIED,    // Registry has confirmed the serial range
        IMPORTED,    // Metadata fully imported
        TOKENIZED,   // ERC-3643 token minted on CRATS
        SUSPENDED,   // Registry suspended this project/batch
        RETIRED,     // Fully retired on registry
        CANCELLED    // Cancelled by registry or compliance
    }

    // ── Credit Type ─────────────────────────────────────────
    enum CreditType {
        REDUCTION,      // Emission reduction credit
        REMOVAL,        // Carbon removal credit (CDR)
        AVOIDANCE       // Avoided emission credit
    }

    // ── ICVCM / CCP Status ───────────────────────────────────
    enum CCPStatus {
        NOT_ASSESSED,   // Not yet reviewed by ICVCM
        ELIGIBLE,       // Program is CCP-eligible
        APPROVED,       // Specific methodology is CCP-approved
        CONDITIONAL,    // Approved with remedial conditions
        REJECTED        // Failed CCP assessment
    }
}
```

#### [NEW] `contracts/interfaces/carbon/ICarbonRetirementManager.sol`

```solidity
interface ICarbonRetirementManager {
    enum RetirementStatus {
        REQUESTED,   // On-chain retirement initiated
        PROCESSING,  // Serial range allocated, sent to registry
        CONFIRMED,   // Registry confirmed retirement
        FAILED       // Registry rejected / timed out
    }

    struct RetirementRecord {
        address   assetToken;
        address   vault;
        address   investor;          // Beneficiary of retirement
        uint256   sharesBurned;      // Vault shares consumed
        uint256   creditsRetired;    // tCO2e count retired
        uint256   batchId;           // Which batch serial range allocated from
        string    serialStart;       // e.g. "VCU-1000001"
        string    serialEnd;         // e.g. "VCU-1000500"
        bytes32   registryTxHash;    // Registry confirmation hash (off-chain anchor)
        bytes32   retirementCertHash;// IPFS/DMS hash of retirement certificate
        string    beneficiaryName;   // Corporate entity claiming offset
        string    retirementPurpose; // e.g. "Scope 1 offsetting FY2026"
        RetirementStatus status;
        uint256   requestedAt;
        uint256   confirmedAt;
    }

    function requestRetirement(
        address vault,
        uint256 shares,
        string calldata beneficiaryName,
        string calldata retirementPurpose
    ) external returns (uint256 retirementId);

    function confirmRetirement(
        uint256 retirementId,
        string calldata serialStart,
        string calldata serialEnd,
        bytes32 registryTxHash,
        bytes32 retirementCertHash
    ) external; // onlyRole(REGISTRY_OPERATOR_ROLE)

    function failRetirement(uint256 retirementId, string calldata reason) external;
    function getRetirementRecord(uint256 id) external view returns (RetirementRecord memory);
    function getRetirementsByInvestor(address investor) external view returns (uint256[] memory);

    event RetirementRequested(uint256 indexed id, address indexed investor, address vault, uint256 credits, uint256 timestamp);
    event RetirementConfirmed(uint256 indexed id, string serialStart, string serialEnd, bytes32 registryTxHash);
    event RetirementFailed(uint256 indexed id, string reason);
}
```

---

### 5.2 — CarbonCreditPlugin v2 (Full Rewrite)

#### [MAJOR REWRITE] `contracts/asset/plugins/CarbonCreditPlugin.sol`

The current plugin is 71 lines with only a `VERIFICATION_REPORT` check. The v2 becomes the **primary carbon business logic layer** — a stateless validator that enforces institutional-grade registry metadata requirements.

**Full contract structure**:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "../../interfaces/asset/IAssetPlugin.sol";
import "../../interfaces/dms/IDMS.sol";
import "../../interfaces/carbon/ICarbonRegistry.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title CarbonCreditPlugin v2
 * @dev Institutional-grade carbon credit validation plugin.
 *
 * Aligned with:
 * - Verra VCS Program (VM0044, VM0045, VM0048)
 * - Gold Standard / CorTenX API
 * - Puro.earth CORC structure
 * - ACR / CAR serial formats
 * - CAD Trust Data Model v2.0
 * - ICVCM Core Carbon Principles (CCP) label support
 * - Verra Immobilization bridge mechanism (2024)
 *
 * Architecture:
 * - STATELESS: no financial logic, no ownership, no NAV
 * - Validates registry metadata completeness
 * - Validates DMS-approved documents
 * - Validates serial range format per registry type
 * - Validates ICVCM CCP requirements where applicable
 * - Returns exitMechanism = RETIRE_BURN (consumable archetype)
 */
contract CarbonCreditPlugin is IAssetPlugin, ICarbonRegistry, AccessControl {

    bytes32 public constant CATEGORY_ID = keccak256("CARBON_CREDIT");
    string  public constant CATEGORY_NAME = "Carbon Credit";

    // ─── Extended Asset Params ──────────────────────────────
    // These are passed via `AssetParams.extraData` (ABI-encoded)
    struct CarbonAssetParams {
        // Registry Metadata
        RegistryType    registryType;
        string          registryProjectId;    // e.g. "VCS-1360", "GS-10340", "PURO-577166"
        string          registryBatchId;      // Registry-assigned batch ID
        string          registryAccountId;    // Account holding credits in registry
        string          registryAssetId;      // Registry-level asset/credit identifier
        string          registryUrl;          // Official registry URL for verification
        CreditType      creditType;           // REDUCTION / REMOVAL / AVOIDANCE

        // Project Metadata
        string          projectName;
        string          projectDescription;
        ProjectType     projectType;
        string          methodology;          // e.g. "VM0048", "VM0044", "GS-TPDDTEC"
        uint16          vintage;              // Year credits were generated (e.g. 2023)
        string          country;              // ISO 3166-1 alpha-2 (e.g. "BR", "KE")
        string          region;              // State/province
        bytes32         boundaryHash;         // SHA-256 of GeoJSON boundary file
        string          gisIpfsCid;           // IPFS CID of GeoJSON boundary
        uint256         areaHectares;         // Project area in hectares (scaled 1e2)

        // Batch / Serial Range
        uint256         totalCredits;         // Total tCO2e in this batch
        string          serialRangeStart;     // e.g. "VCU-1000001" or "PURO_PR_CORC100+_FI_577166_2020_..._1"
        string          serialRangeEnd;       // e.g. "VCU-1010000"
        bytes32         serialCommitment;     // keccak256(serialStart + serialEnd) — on-chain anti-tamper anchor

        // Verification (VVB references)
        string          vvbName;              // Accredited VVB name
        string          verificationId;       // VVB-assigned verification ID
        uint256         verificationDate;     // Unix timestamp of verification
        bytes32         verificationReportHash;   // SHA-256 of verification report (in DMS)
        bytes32         validationReportHash;     // SHA-256 of validation report
        bytes32         monitoringReportHash;     // SHA-256 of latest monitoring report
        bytes32         issuanceCertificateHash;  // SHA-256 of issuance certificate

        // Immobilization / Bridge
        bytes32         immobilizationProofHash;  // Verra/GS proof that credits are locked in registry
        RegistrySyncStatus initialSyncStatus;     // Must be VERIFIED or IMPORTED at deployment

        // ICVCM CCP
        CCPStatus       ccpStatus;            // CCP label status
        bool            corsiaEligible;       // CORSIA Article 6 eligible
        bool            article6Authorized;   // Article 6 Paris Agreement authorization

        // Manifest
        string          manifestIpfsCid;      // IPFS CID of Carbon Asset Manifest (JSON)
        bytes32         manifestHash;         // SHA-256 of manifest for on-chain integrity
    }

    // ─── IAssetPlugin implementation ────────────────────────

    function getCategoryId() external pure override returns (bytes32) {
        return CATEGORY_ID;
    }

    function getCategoryName() external pure override returns (string memory) {
        return CATEGORY_NAME;
    }

    function redemptionPolicy() external pure override returns (bool defaultEnabled, bool issuerCanOverride) {
        // Carbon credits use RETIRE_BURN, not standard redemption
        return (false, false);
    }

    function archetypeType() external pure returns (uint8) {
        return 2; // Archetype.CONSUMABLE
    }

    function exitMechanism() external pure returns (uint8) {
        return 1; // ExitMechanism.RETIRE_BURN
    }

    // ── Validation Entry Point ───────────────────────────────

    function validateCreation(
        address /*issuer*/,
        AssetParams calldata params
    ) external view override returns (bool) {
        require(params.initialSupply > 0, "Carbon: supply required");
        require(params.categoryId == CATEGORY_ID, "Carbon: invalid category");

        // Decode extended carbon params from extraData
        CarbonAssetParams memory cp = abi.decode(params.extraData, (CarbonAssetParams));

        _validateRegistryMetadata(cp);
        _validateProjectMetadata(cp);
        _validateSerialRange(cp);
        _validateVVBReferences(cp);
        _validateImmobilization(cp);
        _validateManifest(cp);

        return true;
    }

    function validateDocuments(
        AssetDocument[] calldata docs,
        address dmsAddress
    ) external view override returns (bool) {
        // Track required documents
        bool hasVerificationReport      = false;
        bool hasValidationReport        = false;
        bool hasIssuanceCert            = false;
        bool hasProjectDesignDoc        = false;
        bool hasMonitoringReport        = false;
        bool hasRegistryExport          = false;
        bool hasImmobilizationProof     = false;

        for (uint256 i = 0; i < docs.length; i++) {
            bytes32 typeHash = keccak256(bytes(docs[i].docType));

            // ── DMS approval gate (AUD-07 fix) ──────────────
            if (dmsAddress != address(0)) {
                require(
                    IDMS(dmsAddress).isDocumentApproved(docs[i].docHash),
                    "Carbon: document not DMS-approved"
                );
            }

            if (typeHash == keccak256("VERIFICATION_REPORT"))    hasVerificationReport  = true;
            if (typeHash == keccak256("VALIDATION_REPORT"))      hasValidationReport    = true;
            if (typeHash == keccak256("ISSUANCE_CERTIFICATE"))   hasIssuanceCert        = true;
            if (typeHash == keccak256("PROJECT_DESIGN_DOC"))     hasProjectDesignDoc    = true;
            if (typeHash == keccak256("MONITORING_REPORT"))      hasMonitoringReport    = true;
            if (typeHash == keccak256("REGISTRY_EXPORT"))        hasRegistryExport      = true;
            if (typeHash == keccak256("IMMOBILIZATION_PROOF"))   hasImmobilizationProof = true;
        }

        require(hasVerificationReport,   "Carbon: VERIFICATION_REPORT required");
        require(hasValidationReport,     "Carbon: VALIDATION_REPORT required");
        require(hasIssuanceCert,         "Carbon: ISSUANCE_CERTIFICATE required");
        require(hasProjectDesignDoc,     "Carbon: PROJECT_DESIGN_DOC required");
        require(hasMonitoringReport,     "Carbon: MONITORING_REPORT required");
        require(hasRegistryExport,       "Carbon: REGISTRY_EXPORT required");
        require(hasImmobilizationProof,  "Carbon: IMMOBILIZATION_PROOF required");

        return true;
    }

    // AUD-12 fix: machine-readable required documents
    function getRequiredDocumentTypes() external pure returns (
        string[] memory types,
        uint8[]   memory approvalModes   // 0=AUTO, 1=MANUAL, 2=COMPLIANCE_REQUIRED
    ) {
        types = new string[](7);
        approvalModes = new uint8[](7);

        types[0] = "VERIFICATION_REPORT";    approvalModes[0] = 2; // COMPLIANCE_REQUIRED
        types[1] = "VALIDATION_REPORT";      approvalModes[1] = 2;
        types[2] = "ISSUANCE_CERTIFICATE";   approvalModes[2] = 2;
        types[3] = "PROJECT_DESIGN_DOC";     approvalModes[3] = 1; // MANUAL
        types[4] = "MONITORING_REPORT";      approvalModes[4] = 1;
        types[5] = "REGISTRY_EXPORT";        approvalModes[5] = 2;
        types[6] = "IMMOBILIZATION_PROOF";   approvalModes[6] = 2;
    }

    // Legacy interface compatibility
    function getRequiredDocuments() external pure override returns (string[] memory docs) {
        docs = new string[](7);
        docs[0] = "VERIFICATION_REPORT";
        docs[1] = "VALIDATION_REPORT";
        docs[2] = "ISSUANCE_CERTIFICATE";
        docs[3] = "PROJECT_DESIGN_DOC";
        docs[4] = "MONITORING_REPORT";
        docs[5] = "REGISTRY_EXPORT";
        docs[6] = "IMMOBILIZATION_PROOF";
    }

    // ── Internal Validators ──────────────────────────────────

    function _validateRegistryMetadata(CarbonAssetParams memory cp) internal pure {
        require(bytes(cp.registryProjectId).length > 0,  "Carbon: registry project ID required");
        require(bytes(cp.registryBatchId).length > 0,    "Carbon: registry batch ID required");
        require(bytes(cp.registryUrl).length > 0,        "Carbon: registry URL required");
        require(cp.creditType <= CreditType.AVOIDANCE,   "Carbon: invalid credit type");
        // Validate sync status — must be at least VERIFIED before tokenization
        require(
            cp.initialSyncStatus == RegistrySyncStatus.VERIFIED ||
            cp.initialSyncStatus == RegistrySyncStatus.IMPORTED,
            "Carbon: registry sync not verified"
        );
    }

    function _validateProjectMetadata(CarbonAssetParams memory cp) internal pure {
        require(bytes(cp.projectName).length > 0,   "Carbon: project name required");
        require(bytes(cp.methodology).length > 0,   "Carbon: methodology required");
        require(cp.vintage >= 2000 && cp.vintage <= 2100, "Carbon: invalid vintage year");
        require(bytes(cp.country).length == 2,      "Carbon: country must be ISO-2 code");
        require(cp.areaHectares > 0,                "Carbon: area required");
        // GIS boundary — require either CID or hash (one must be present)
        require(
            cp.boundaryHash != bytes32(0) || bytes(cp.gisIpfsCid).length > 0,
            "Carbon: GIS boundary required (hash or IPFS CID)"
        );
    }

    function _validateSerialRange(CarbonAssetParams memory cp) internal pure {
        require(bytes(cp.serialRangeStart).length > 0, "Carbon: serial range start required");
        require(bytes(cp.serialRangeEnd).length > 0,   "Carbon: serial range end required");
        require(cp.totalCredits > 0,                   "Carbon: total credits required");
        // Validate serial commitment — prevents tampering after deployment
        require(
            cp.serialCommitment == keccak256(abi.encodePacked(cp.serialRangeStart, cp.serialRangeEnd)),
            "Carbon: serial commitment mismatch"
        );
    }

    function _validateVVBReferences(CarbonAssetParams memory cp) internal pure {
        require(bytes(cp.vvbName).length > 0,                "Carbon: VVB name required");
        require(bytes(cp.verificationId).length > 0,         "Carbon: verification ID required");
        require(cp.verificationDate > 0,                     "Carbon: verification date required");
        require(cp.verificationReportHash != bytes32(0),     "Carbon: verification report hash required");
        require(cp.validationReportHash != bytes32(0),       "Carbon: validation report hash required");
        require(cp.issuanceCertificateHash != bytes32(0),    "Carbon: issuance certificate hash required");
    }

    function _validateImmobilization(CarbonAssetParams memory cp) internal pure {
        // Double counting prevention: require proof that credits are locked/immobilized
        // in the source registry (Verra immobilization mechanism, GS custodianship, etc.)
        require(
            cp.immobilizationProofHash != bytes32(0),
            "Carbon: immobilization proof required (registry lock confirmation)"
        );
    }

    function _validateManifest(CarbonAssetParams memory cp) internal pure {
        // Carbon Asset Manifest must be present on IPFS and hash committed on-chain
        require(bytes(cp.manifestIpfsCid).length > 0, "Carbon: manifest IPFS CID required");
        require(cp.manifestHash != bytes32(0),         "Carbon: manifest hash required");
    }
}
```

---

### 5.3 — CarbonAssetMetadataStore — **OPTIONAL**

#### [NEW / OPTIONAL] `contracts/asset/carbon/CarbonAssetMetadataStore.sol`

> [!NOTE]
> **CarbonAssetMetadataStore is OPTIONAL.** Tokenization, vault creation, marketplace, and BOR all work without it. It is an enrichment layer for platforms that want on-chain carbon registry metadata and a `getCarbonHoldingView()` query function. It can be deployed independently and registered in `AssetRegistry.carbonMetadataStore[assetToken]` at any time.

Dedicated storage contract for carbon-specific on-chain metadata. Separate from `AssetRegistry` to keep carbon state isolated and independently upgradeable.

**Design rule: only critical on-chain data lives here. All rich metadata (images, GIS, docs) stay in IPFS. On-chain: hashes, IDs, numbers, one manifest CID.**

**Serial numbers are registered at tokenization time** — when the issuer tokenizes the carbon asset, `serialRangeStart` and `serialRangeEnd` are committed on-chain. This means:
- **Producer knows** which registry serial range is locked/immobilized for this asset token
- **Investors know** the underlying batch serials of the pooled asset they hold shares in
- Serial numbers are **allocated per investor** only at retirement (FIFO from the batch)

```solidity
struct CarbonRegistryMetadata {
    // ── Registry identifiers (small strings, on-chain) ───────
    ICarbonRegistry.RegistryType registryType;
    string   registryProjectId;   // e.g. "VCS-1360", "GS-10340"
    string   registryBatchId;     // Registry-assigned batch ID
    string   registryUrl;         // Official registry URL
    ICarbonRegistry.CreditType   creditType;
    ICarbonRegistry.RegistrySyncStatus syncStatus;

    // ── Project essentials (on-chain for filtering/query) ────
    string   projectName;
    ICarbonRegistry.ProjectType  projectType;
    string   methodology;         // e.g. "VM0048", "GS-TPDDTEC"
    uint16   vintage;             // credit generation year
    string   country;             // ISO 3166-1 alpha-2 code ONLY
    uint256  areaHectares;        // scaled 1e2

    // ── Serial range (registered at tokenization, public) ────
    string   serialRangeStart;    // e.g. "VCU-1000001" — visible to producer + investors
    string   serialRangeEnd;      // e.g. "VCU-1010000"
    bytes32  serialCommitment;    // keccak256(serialStart + serialEnd) — tamper proof

    // ── Batch accounting (on-chain, mutates on retirement) ───
    uint256  totalCredits;        // tCO2e in this batch
    uint256  availableCredits;    // decrements on retirement
    uint256  reservedCredits;     // locked in pending retirements
    uint256  retiredCredits;      // permanently consumed
    bytes32  serialCommitment;    // keccak256(serialStart + serialEnd) — tamper proof

    // ── Document hashes only (IPFS/DMS holds the actual files) 
    bytes32  verificationReportHash;    // SHA-256 anchor
    bytes32  validationReportHash;
    bytes32  monitoringReportHash;      // updated annually
    bytes32  issuanceCertificateHash;
    bytes32  immobilizationProofHash;   // registry lock confirmation

    // ── ICVCM ────────────────────────────────────────────────
    ICarbonRegistry.CCPStatus ccpStatus;
    bool     corsiaEligible;
    bool     article6Authorized;

    // ── Manifest pointer (single IPFS reference to everything)
    string   manifestIpfsCid;     // ipfs://Qm... — manifest JSON with all metadata
    bytes32  manifestHash;        // SHA-256 of manifest — on-chain integrity anchor
    string   coverImageCid;       // ipfs://Qm... — single cover image for UI display
}
```

> [!NOTE]
> **What is NOT stored on-chain**: site photos, drone images, satellite images, GIS polygon files, GeoJSON boundary files, project description, region text, VVB name details, video CIDs, and all other large/array fields. These live inside the **Carbon Asset Manifest** (IPFS) and are referenced via `manifestIpfsCid`. The manifest is the single source of truth for all rich metadata. The blockchain stores only `manifestHash` to guarantee integrity.

**Key functions**:
- `registerCarbonAsset(address assetToken, CarbonRegistryMetadata calldata meta)` — called by `AssetFactory` post-deployment; `onlyRole(OPERATOR_ROLE)`
- `updateRegistrySyncStatus(address assetToken, RegistrySyncStatus status)` — called by backend oracle after registry sync
- `updateMonitoringReport(address assetToken, bytes32 newReportHash, uint256 reportDate)` — annual monitoring report update
- `updateManifest(address assetToken, string calldata newCid, bytes32 newHash)` — when manifest is re-pinned with new media
- `decrementAvailableCredits(address assetToken, uint256 amount)` — `onlyRole(RETIREMENT_MANAGER_ROLE)`; called when retirement is requested
- `incrementRetiredCredits(address assetToken, uint256 amount)` — `onlyRole(RETIREMENT_MANAGER_ROLE)`; called on confirmed retirement
- `getCarbonHoldingView(address assetToken, address vault, address investor) returns (uint256 shares, uint256 creditEquivalent, uint256 pctBps)` — **key function for P2P tracking**; computes investor's proportional credit stake without assigning serial numbers
- `getCarbonMetadata(address assetToken) returns (CarbonRegistryMetadata memory)` — public view

**Events (Indexer v2)**:
```solidity
event CarbonAssetImported(address indexed assetToken, string registryProjectId, ICarbonRegistry.RegistryType registry);
event RegistrySyncCompleted(address indexed assetToken, ICarbonRegistry.RegistrySyncStatus newStatus, uint256 timestamp);
event MonitoringReportUpdated(address indexed assetToken, bytes32 newReportHash, uint256 reportDate);
event CreditReservationUpdated(address indexed assetToken, uint256 available, uint256 reserved, uint256 retired);
event ManifestUpdated(address indexed assetToken, string newCid, bytes32 newHash);
```

---

### 5.4 — CarbonBatchManager (New Contract)

#### [NEW] `contracts/asset/carbon/CarbonBatchManager.sol`

Manages issuance batches within a carbon asset. A single carbon token can have **multiple batches** (e.g., Verra issues credits annually per monitoring period).

```solidity
struct CarbonBatch {
    uint256  batchId;              // Sequential ID within this asset
    string   registryBatchId;      // Registry-assigned batch ID
    uint16   vintage;              // Vintage year for this batch
    uint256  totalCredits;         // Total tCO2e in batch
    uint256  availableCredits;
    uint256  reservedCredits;      // In pending retirements
    uint256  retiredCredits;
    string   serialStart;          // e.g. VCU-1000001
    string   serialEnd;            // e.g. VCU-1010000
    bytes32  serialCommitment;     // keccak256(start + end)
    bytes32  issuanceCertHash;     // DMS/IPFS hash
    uint256  issuedAt;
    bool     isSuspended;          // Registry-flagged suspension
}

// Functions:
function addBatch(address assetToken, CarbonBatch calldata batch) external onlyRole(BATCH_MANAGER_ROLE);
function suspendBatch(address assetToken, uint256 batchId, string calldata reason) external onlyRole(COMPLIANCE_ROLE);
function getBatch(address assetToken, uint256 batchId) external view returns (CarbonBatch memory);
function getAllBatches(address assetToken) external view returns (CarbonBatch[] memory);
function allocateSerialRange(
    address assetToken,
    uint256 creditsNeeded
) external returns (uint256 batchId, uint256 startIndex, uint256 endIndex);
// Called by CarbonRetirementManager — FIFO allocation of serials from oldest vintage first
```

**Double counting protection**: `allocateSerialRange()` uses a **FIFO + locking mechanism** — reserves the serial range atomically, preventing two concurrent retirements from allocating the same serial numbers.

---

### 5.5 — CarbonRetirementManager (New Contract)

#### [NEW] `contracts/financial/CarbonRetirementManager.sol`

> **Why a separate contract and not RedemptionManager?**
> Retirement and redemption are fundamentally different operations:
>
> | Dimension | RedemptionManager | CarbonRetirementManager |
> |---|---|---|
> | Investor gets back | USDC payout | Nothing — credits are consumed |
> | Share fate | Burned, USDC transferred | Burned, retirement certificate issued |
> | External confirmation | None needed | Registry must confirm before burn |
> | Serial numbers | Not involved | Allocated from batch at this step only |
> | Purpose | Exit investment | Claim environmental offset |
> | Registry sync | None | Registry status → RETIRED |
> | Reversible? | Cancellable before processing | Irreversible once registry confirms |
>
> Forcing retirement into RedemptionManager would mean mangling its USDC payout logic, adding registry confirmation callbacks, and handling an entirely different state machine inside an already complex contract. Separation keeps both clean.

The only new lifecycle component per the spec — handles the on-chain retirement workflow without modifying existing vault, BOR, or marketplace contracts.

**Flow** (matches Section 13 of the spec):

```
Investor.requestRetirement(vault, shares, beneficiaryName, purpose)
    ↓
[1] Verify investor holds ≥ shares in vault (ERC-20 balanceOf check)
[2] Compute credit quantity: credits = shares × (totalCredits / vault.totalSupply())
[3] Reserve credits atomically in CarbonBatchManager — FIFO from oldest vintage
    → decrementAvailableCredits() in CarbonAssetMetadataStore
[4] Status → REQUESTED, emit RetirementRequested
    ↓
[Backend Oracle] Submit to registry API (Verra / Gold Standard / Puro)
    ↓
[5] REGISTRY_OPERATOR calls confirmRetirement(id, serialStart, serialEnd, registryTxHash, certHash)
[6] Burn vault shares: SyncVault.burnShares(investor, shares) with RETIREMENT_MANAGER_ROLE
[7] incrementRetiredCredits() in CarbonAssetMetadataStore
[8] BOR update via OwnershipSyncManager.updateBeneficialOwnership(asset, vault, investor, newBalance)
    → reasonCode = RETIREMENT
[9] Status → CONFIRMED, emit RetirementConfirmed
    ↓
[Indexer] CarbonAssetImported + RetirementConfirmed events → dashboard updates
```

**Key state**:
```solidity
mapping(uint256 => ICarbonRetirementManager.RetirementRecord) public retirements;
mapping(address => uint256[]) public investorRetirements;  // investor => retirement IDs
mapping(address => uint256[]) public vaultRetirements;     // vault => retirement IDs
uint256 public nextRetirementId;
mapping(address => uint256) public totalReservedCredits;   // assetToken => pending retirement reserve
```

**Failure path**: If registry rejects or times out, `failRetirement()` is called: unreserves credits in `CarbonBatchManager`, returns shares to investor (no burn), status → FAILED. Investor can retry.

---

### 5.6 — Carbon Asset Manifest (IPFS Standard)

Every carbon asset references an **immutable manifest** stored on IPFS. Its SHA-256 hash is committed on-chain in `CarbonAssetMetadataStore.manifestHash`.

**Manifest JSON Schema** (`carbon_manifest_v1.json`):

```json
{
  "manifest_version": "1.0",
  "crats_asset_token": "0x...",
  "generated_at": "2026-07-16T00:00:00Z",

  "registry": {
    "name": "Verra VCS",
    "project_id": "VCS-1360",
    "batch_id": "VCS-1360-2023-001",
    "account_id": "VCS-ACCOUNT-4892",
    "credit_type": "REDUCTION",
    "registry_url": "https://registry.verra.org/app/projectDetail/VCS/1360",
    "icvcm_ccp_status": "APPROVED",
    "corsia_eligible": true,
    "article_6_authorized": false
  },

  "project": {
    "name": "Kasigau Corridor REDD+ Project",
    "description": "...",
    "type": "AFOLU_REDD",
    "methodology": "VM0009",
    "vintage": 2023,
    "country": "KE",
    "region": "Taita-Taveta County",
    "area_hectares": 200000,
    "coordinates": { "lat": -3.4, "lng": 38.6 }
  },

  "gis": {
    "boundary_map_cid": "ipfs://Qm...",
    "geojson_cid": "ipfs://Qm...",
    "gis_polygon_cid": "ipfs://Qm...",
    "coordinate_system": "WGS84"
  },

  "verification": {
    "vvb_name": "SCS Global Services",
    "verification_id": "SCS-VVB-2023-4892",
    "verification_date": "2023-11-15",
    "verification_report_cid": "ipfs://Qm...",
    "validation_report_cid": "ipfs://Qm...",
    "monitoring_report_cid": "ipfs://Qm...",
    "issuance_certificate_cid": "ipfs://Qm..."
  },

  "batch": {
    "total_credits": 10000,
    "serial_start": "VCU-1000001",
    "serial_end": "VCU-1010000",
    "serial_commitment": "0x...",
    "immobilization_proof_cid": "ipfs://Qm..."
  },

  "media": {
    "cover_image_cid": "ipfs://Qm...",
    "site_photos": ["ipfs://Qm..."],
    "boundary_map_cid": "ipfs://Qm..."
  },

  "documents": [
    { "type": "VERIFICATION_REPORT", "cid": "ipfs://Qm...", "sha256": "0x...", "version": "1" },
    { "type": "PROJECT_DESIGN_DOC",  "cid": "ipfs://Qm...", "sha256": "0x...", "version": "2" }
  ]
}
```

---

### 5.7 — AssetRegistry Extension for Carbon

#### [MODIFY] `contracts/asset/AssetRegistry.sol`

Add a lightweight reference layer — the full metadata lives in `CarbonAssetMetadataStore`, but the registry stores a pointer:

```solidity
// NEW: assetToken => carbon metadata store reference
mapping(address => address) public carbonMetadataStore;  // set on asset registration

// NEW: assetToken => registry sync status (lightweight cache for on-chain queries)
mapping(address => uint8) public carbonSyncStatus;  // ICarbonRegistry.RegistrySyncStatus

function setCarbonMetadataStore(address assetToken, address store)
    external onlyRole(OPERATOR_ROLE);
function getCarbonSyncStatus(address assetToken)
    external view returns (uint8);
```

---

### 5.8 — NAVOracle Carbon Configuration

Carbon credits are **market-priced** assets. The NAVOracle must be configured correctly:

| Field | Value |
|---|---|
| Primary valuation method | `MARKET_COMPARABLE` |
| Max valuation interval | 7 days (per Table 8 in update_v10.md) |
| Warning threshold | 5 days |
| Fallback method | `INCOME_STATEMENT` (registry-issued price reports) |
| Appraisal required | `false` (market-based, not appraisal) |
| PoR required | `true` (Immobilization proof = PoR for carbon) |

For ICVCM CCP-labeled credits: market price data sourced from Xpansiv CBL, ACX, or CAD Trust price feeds.

---

### 5.9 — DMS Carbon Document Types

Add these document type constants to `DMSRegistry.sol`:

```solidity
// Carbon-specific document types
bytes32 constant VERIFICATION_REPORT    = keccak256("VERIFICATION_REPORT");
bytes32 constant VALIDATION_REPORT      = keccak256("VALIDATION_REPORT");
bytes32 constant ISSUANCE_CERTIFICATE   = keccak256("ISSUANCE_CERTIFICATE");
bytes32 constant PROJECT_DESIGN_DOC     = keccak256("PROJECT_DESIGN_DOC");
bytes32 constant MONITORING_REPORT      = keccak256("MONITORING_REPORT");
bytes32 constant REGISTRY_EXPORT        = keccak256("REGISTRY_EXPORT");
bytes32 constant IMMOBILIZATION_PROOF   = keccak256("IMMOBILIZATION_PROOF");
bytes32 constant RETIREMENT_CERTIFICATE = keccak256("RETIREMENT_CERTIFICATE");
bytes32 constant GIS_BOUNDARY_FILE      = keccak256("GIS_BOUNDARY_FILE");
bytes32 constant GEOJSON_BOUNDARY       = keccak256("GEOJSON_BOUNDARY");
bytes32 constant LAND_DOCUMENT          = keccak256("LAND_DOCUMENT");
bytes32 constant CARBON_MANIFEST        = keccak256("CARBON_MANIFEST");
```

All 7 required carbon docs: `COMPLIANCE_REQUIRED` approval mode.
GIS + Media docs: `MANUAL` approval mode.

---

### 5.10 — Indexer v2 Carbon Events

Add to the Indexer v2 event coverage (extending Table 16):

| Event | Contract | Purpose |
|---|---|---|
| `CarbonAssetImported` | `CarbonAssetMetadataStore` | Full metadata imported from registry |
| `RegistryMetadataUpdated` | `CarbonAssetMetadataStore` | Any field update to registry metadata |
| `RegistrySyncCompleted` | `CarbonAssetMetadataStore` | Registry sync status → TOKENIZED |
| `RetirementRequested` | `CarbonRetirementManager` | Investor initiated retirement |
| `RetirementConfirmed` | `CarbonRetirementManager` | Registry confirmed retirement |
| `RetirementFailed` | `CarbonRetirementManager` | Registry rejected |
| `CarbonMediaUpdated` | `CarbonAssetMetadataStore` | New images/GIS uploaded |
| `VerificationReferenceUpdated` | `CarbonAssetMetadataStore` | Annual monitoring report update |
| `BatchAdded` | `CarbonBatchManager` | New issuance batch from registry |
| `BatchSuspended` | `CarbonBatchManager` | Compliance action on batch |
| `SerialRangeAllocated` | `CarbonBatchManager` | Credits reserved for retirement |

---

### 5.11 — Serial Number Format Validation

Each registry has a different serial number format. The plugin validates format integrity:

| Registry | Format | Example |
|---|---|---|
| Verra VCS | `VCU-{projectId}-{vintage}-{sequence}` | `VCU-1360-2023-000001` |
| Gold Standard | `GS{projectId}-{vintage}-{sequence}` | `GS10340-2023-001` |
| Puro.earth | `PURO_{registry}_{type}_{country}_{facility}_{vintage}_{issuanceId}_{range}` | `PURO_PR_CORC100+_FI_577166_2020_055a_1-100` |
| ACR | `ACR{projectId}-{vintage}-{sequence}` | `ACR521-2023-001` |
| CAR | `CAR{projectId}-{type}-{vintage}-{range}` | `CAR-1234-6-2023-001` |

On-chain: only `serialRangeStart` and `serialRangeEnd` strings stored. Format validated by the plugin as non-empty and prefix-matching the declared `registryType`.

---

### 5.12 — What is NOT Changed (Preserved Architecture)

Per the spec, the following remain **completely unchanged**:

| Component | Status | Reason |
|---|---|---|
| ERC-3643 AssetToken | ✅ No change | Carbon token is a standard ERC-3643 token |
| ERC-4626 SyncVault | ✅ No change | Vault holds underlying carbon tokens normally |
| Treasury flow | ✅ No change | Credits go Registry → Treasury → Vault on investment |
| BOR / OwnershipSyncManager | ✅ No change | Tracks vault shares; carbon extends it via reasonCode only |
| SettlementEngine / Marketplace | ✅ No change | Trades ERC-4626 shares, not registry credits |
| RedemptionManager | ✅ No change | Retirement is a distinct lifecycle, separate contract |
| FeeEngine / YieldDistributor | ✅ No change | Carbon is consumable — no yield distribution |

---

### 5.13 — Secondary Market (P2P) Support

This is a critical correctness requirement. Carbon assets **must** support CRATS' existing P2P secondary market without any change to the marketplace, settlement engine, or vault contracts.

#### 5.13.1 — What is Traded

```
❌ NOT this:
   Investor A  →  transfers 500 Registry Credits (VCU-1000001 to VCU-1000500)  →  Investor B
   (Serial numbers do NOT move. Registry credits stay in vault custody.)

✅ THIS:
   Investor A  →  sells 500 SyncVault shares via OrderBook/ClearingHouse  →  Investor B
   (Vault still holds 100% of the underlying carbon asset.)
   (Only beneficial ownership of vault shares changes.)
```

#### 5.13.2 — What Updates on P2P Trade

The existing `BaseVault._update()` hook already fires `OwnershipSyncManager.updateBeneficialOwnership()` on every ERC-20 transfer. For carbon assets, this is sufficient for BOR. The only addition is a **carbon-specific `reasonCode`** and a **holdings view update** — no new contract triggers required.

```
ClearingHouse / P2P Settlement
    ↓
SyncVault._update(from=Seller, to=Buyer, value=shares)
    ↓
OwnershipSyncManager.updateBeneficialOwnership(assetToken, vault, Seller, newSellerBalance)
    → reasonCode = CARBON_P2P_TRANSFER   ← new reason code added to callerReasonCodes
OwnershipSyncManager.updateBeneficialOwnership(assetToken, vault, Buyer, newBuyerBalance)
    → reasonCode = CARBON_P2P_TRANSFER
    ↓
AssetRegistry.updateBeneficialOwnership() [existing — no change]
    ↓
SyncRouted event emitted → Indexer picks up
    ↓
Backend updates:
  1. BOR (existing SQL cache)
  2. Carbon Holdings View: investor → vault% → creditEquivalent
     creditEquivalent = (newBalance / vault.totalSupply()) × totalCredits
```

#### 5.13.3 — Carbon Holdings View (What the Dashboard Shows)

No serial numbers are displayed to investors during normal trading. The dashboard shows **proportional credit stake**:

```
Investor A holds: 200 vault shares out of 1000 total
→ Carbon credit equivalent: 200/1000 × 10,000 tCO2e = 2,000 tCO2e
→ Registry: Verra VCS | Project: Kasigau Corridor | Vintage: 2023
→ Status: TOKENIZED (not retired)
→ Specific serials: NOT ASSIGNED — pooled in vault
```

This view is computed by `CarbonAssetMetadataStore.getCarbonHoldingView(assetToken, vault, investor)` — a pure view function, not a state-modifying write:

```solidity
function getCarbonHoldingView(
    address assetToken,
    address vault,
    address investor
) external view returns (
    uint256 vaultShares,        // investor's current vault share balance
    uint256 creditEquivalent,   // proportional tCO2e stake (no serial assignment)
    uint256 pctBps,             // ownership % in basis points (e.g. 2000 = 20.00%)
    uint256 availableToRetire,  // credits investor could currently retire
    ICarbonRegistry.RegistrySyncStatus syncStatus
) {
    vaultShares       = IERC20(vault).balanceOf(investor);
    uint256 totalSupply = IERC20(vault).totalSupply();
    CarbonRegistryMetadata storage m = _metadata[assetToken];

    if (totalSupply == 0) return (0, 0, 0, 0, m.syncStatus);

    pctBps           = (vaultShares * 10_000) / totalSupply;
    creditEquivalent = (vaultShares * m.totalCredits) / totalSupply;
    availableToRetire = (vaultShares * m.availableCredits) / totalSupply;
    syncStatus       = m.syncStatus;
}
```

#### 5.13.4 — What Stays Unchanged (P2P Carbon Correctness)

| Action | Serial Numbers | BOR | Carbon Holdings View |
|---|---|---|---|
| Investor A buys shares (primary) | ❌ Not assigned | ✅ Updated | ✅ Recomputed |
| Investor A sells 50% to B (P2P) | ❌ Not assigned | ✅ Updated for both | ✅ Recomputed for both |
| Investor B sells all shares to C | ❌ Not assigned | ✅ Updated for both | ✅ Recomputed for both |
| Investor C retires 100 credits | ✅ NOW assigned from batch (FIFO) | ✅ Updated | ✅ Updated (retired++, available--) |

#### 5.13.5 — New OwnershipSyncManager Reason Code

Add to `callerReasonCodes` in `OwnershipSyncManager`:

```solidity
bytes32 constant CARBON_P2P_TRANSFER = keccak256("CARBON_P2P_TRANSFER");
bytes32 constant CARBON_RETIREMENT   = keccak256("CARBON_RETIREMENT");
```

The Indexer uses these reason codes to distinguish carbon-specific `SyncRouted` events and update the Carbon Holdings dashboard separately from standard BOR updates.

#### 5.13.6 — Subgraph Extension for Carbon P2P

Extend the existing `schema.graphql` (from `P2P_UPDATE_v9.0.md`) with:

```graphql
type CarbonHoldingRecord @entity {
  id: ID!                        # assetToken-vault-investor
  assetToken: Bytes!
  vault: Bytes!
  investor: Bytes!
  vaultShares: BigInt!
  creditEquivalent: BigInt!      # proportional tCO2e
  pctBps: BigInt!                # ownership % in bps
  registryProjectId: String!
  vintage: Int!
  syncStatus: String!
  lastUpdated: BigInt!
}

type CarbonRetirementRecord @entity {
  id: ID!                        # retirementId
  investor: Bytes!
  vault: Bytes!
  assetToken: Bytes!
  creditsRetired: BigInt!
  serialStart: String!
  serialEnd: String!
  registryTxHash: Bytes!
  beneficiaryName: String!
  retirementPurpose: String!
  confirmedAt: BigInt!
}
```

Event handler: on every `SyncRouted` with `reasonCode == CARBON_P2P_TRANSFER`, recompute `CarbonHoldingRecord` for both seller and buyer by calling `getCarbonHoldingView()` view.

---

### Security Audit Finding Fixes

| ID | Severity | Fix Location | Implementation |
|---|---|---|---|
| AUD-03 | HIGH | `SyncVault.depositFromTreasury()` | On-chain USDC amount recording + mint variance check against NAVOracle |
| AUD-04 | HIGH | `Compliance.sol` + `GovernanceMultisig` | `REGULATOR_ROLE` explicitly added to multisig-gated role list |
| AUD-05 | HIGH | `SanctionsOracle.sol` (new) | Live sanctions screening integrated into `isVerified()` + `isInvestorRestricted()` |
| AUD-06 | HIGH | `DMSRegistry.revokeDocument()` | Evidence hash + justification required; governance review event emitted |
| AUD-07 | MEDIUM | `RealEstatePlugin`, `CarbonCreditPlugin` | Add NOC/ENCUMBRANCE (RE), REGISTRY_SERIAL/RETIREMENT_REF (CC) |
| AUD-08 | MEDIUM | `DMSRegistry.reconcileApprovalMode()` | Explicit state transition table per approvalMode documented and enforced in code |
| AUD-09 | MEDIUM | `NAVOracle` config | PoR enforcement status made explicit per asset class in `AssetClassSchedule.porRequired` flag |
| AUD-10 | MEDIUM | Architecture decision | Single-chain confirmed (document in `CRATS_Protocol_Specification.md` update) |
| AUD-11 | MEDIUM | `IAssetPlugin.exitMechanism()` | Formal `ExitMechanism` enum field added to interface |
| AUD-12 | LOW | All plugins | `getRequiredDocumentTypes()` pure getter returns `(string[] types, ApprovalMode[] modes)` |
| AUD-13 | LOW | AssetFactory category taxonomy | Automotive explicitly mapped to `LuxuryGoodsPlugin` or new `AutomotivePlugin` (decision needed) |
| AUD-14 | LOW | Docs | Version numbering unified in `CRATS_Protocol_Specification.md` |

---

## File Change Summary

### New Files
```
contracts/interfaces/treasury/ITreasury.sol          [NEW]
contracts/interfaces/dms/IDMS.sol                    [NEW]
contracts/interfaces/governance/IGovernanceMultisig.sol [NEW]
contracts/asset/DMSRegistry.sol                      [NEW]
contracts/compliance/SanctionsOracle.sol             [NEW]
contracts/financial/GovernanceMultisig.sol           [NEW]
contracts/asset/plugins/PrivateCreditPlugin.sol      [NEW]
contracts/asset/plugins/TreasuryBillPlugin.sol       [NEW]
contracts/asset/plugins/FineArtPlugin.sol            [UPDATE to v10 standard]
```

### Modified Files (UUPS Upgrades where applicable)
```
contracts/asset/AssetFactory.sol                     [BREAKING - add DMS, archetype, treasury]
contracts/asset/AssetRegistry.sol                    [ENHANCED - BOR v2 fields]
contracts/asset/OwnershipSyncManager.sol             [ENHANCED - triggers #9-12, make upgradeable]
contracts/asset/plugins/RealEstatePlugin.sol         [BREAKING - AUD-07 fix + v10 interface]
contracts/asset/plugins/CarbonCreditPlugin.sol       [BREAKING - AUD-07 fix + v10 interface]
contracts/compliance/Compliance.sol                  [ENHANCED - sanctions oracle, AUD-04/06]
contracts/financial/LifecycleExitManager.sol         [BREAKING REWRITE - v2 full rewrite]
contracts/financial/RedemptionManager.sol            [ENHANCED - mutual exclusion, treasury payout]
contracts/financial/VaultFactory.sol                 [ENHANCED - treasury + DMS injection]
contracts/market/NAVOracle.sol                       [ENHANCED - per-class schedule, mint validation]
contracts/market/SettlementEngine.sol                [ENHANCED - BOR sync, treasury routing]
contracts/vault/SyncVault.sol                        [ENHANCED - treasury deposit hook, AUD-03]
contracts/vault/AsyncVault.sol                       [ENHANCED - treasury payout, BOR triggers]
contracts/vault/BaseVault.sol                        [ENHANCED - treasury storage slot]
```

---

## Layer Connectivity Map

```
                    ┌─────────────────────────────────────────┐
                    │         ITreasury (Abstract Layer)       │
                    │  Fireblocks | GnosisSafe | EOA | Other  │
                    └──────────────┬──────────────────────────┘
                                   │ treasury.transferToVault()
                                   │ treasury.disburseFunds()
                                   │ treasury.confirmSettlement()
          ┌────────────────────────┼────────────────────────────┐
          │                        │                            │
   ┌──────▼──────┐      ┌─────────▼────────┐     ┌────────────▼───────┐
   │  SyncVault  │      │   AsyncVault     │     │ LifecycleExitMgr   │
   │  (ERC-4626) │      │   (ERC-7540)     │     │       v2           │
   └──────┬──────┘      └─────────┬────────┘     └────────────┬───────┘
          │                       │                            │
          └───────────────────────┴──────┬─────────────────────┘
                                         │ updateBeneficialOwnership()
                              ┌──────────▼────────────┐
                              │  OwnershipSyncMgr v2  │
                              │   (triggers #1-12)    │
                              └──────────┬────────────┘
                                         │
                              ┌──────────▼────────────┐
                              │     AssetRegistry     │
                              │     (BOR v2 + DMS     │
                              │      + archetype)     │
                              └──────────┬────────────┘
                                         │
                     ┌───────────────────┼───────────────────┐
                     │                   │                   │
              ┌──────▼──────┐   ┌────────▼──────┐  ┌────────▼──────┐
              │  NAVOracle  │   │  DMSRegistry  │  │  GovernanceMul│
              │  (per-class │   │  (document    │  │  tisig+Lock   │
              │   schedule) │   │   approval)   │  │               │
              └─────────────┘   └───────────────┘  └───────────────┘
```

---

## Execution Order

> [!IMPORTANT]
> Deploy in this exact order to avoid dependency failures:

1. **Deploy new interfaces** (no-op, just ABI definitions)
2. **Deploy `SanctionsOracle`** (standalone, no deps)
3. **Deploy `DMSRegistry`** (standalone, no deps)
4. **Deploy `GovernanceMultisig`** (standalone, configure signers)
5. **Upgrade `Compliance.sol`** (add sanctions oracle reference)
6. **Upgrade `AssetRegistry.sol`** (add BOR v2 fields)
7. **Upgrade `OwnershipSyncManager.sol`** (convert to UUPS, add triggers)
8. **Upgrade `NAVOracle.sol`** (per-class schedule)
9. **Upgrade all plugins** (`RealEstatePlugin`, `CarbonCreditPlugin`, etc.)
10. **Upgrade `AssetFactory.sol`** (add DMS + archetype + treasury)
11. **Deploy new `LifecycleExitManager` v2** (full redeploy via new proxy)
12. **Upgrade `RedemptionManager.sol`** (mutual exclusion, treasury)
13. **Upgrade `VaultFactory.sol`** (treasury + DMS injection)
14. **Upgrade `SyncVault.sol`** (treasury deposit hook)
15. **Upgrade `AsyncVault.sol`** (treasury payout + BOR triggers)
16. **Upgrade `SettlementEngine.sol`** (BOR sync, treasury routing)
17. **Configure all cross-references** (setTreasury, setDMSRegistry, setGovernanceMultisig on all contracts)
18. **Migrate admin roles** to GovernanceMultisig

---

## Verification Plan

### Automated Tests
```bash
npx hardhat test test/v10/treasury_abstraction.test.js
npx hardhat test test/v10/dms_workflow.test.js
npx hardhat test test/v10/lifecycle_exit_v2.test.js
npx hardhat test test/v10/ownership_sync_v2.test.js
npx hardhat test test/v10/plugin_v2.test.js
npx hardhat test test/v10/governance_multisig.test.js
npx hardhat test test/v10/sanctions_oracle.test.js
npx hardhat test test/v10/mint_variance_check.test.js  # AUD-03
npx hardhat test test/v10/cross_contract_integration.test.js
```

### Invariant Checks
- `vault.totalSupply() == 0` after successful lifecycle exit
- `BOR.sumOfShares(vault) == vault.totalSupply()` at all times
- `NAVOracle.navPerToken > 0` before any mint
- `SanctionsOracle.checkSanctions(investor) == false` before any deposit/trade

### Manual Verification
- [ ] Deploy full stack on local Hardhat node
- [ ] Execute end-to-end: plugin validation → asset deployment → vault creation → treasury deposit → BOR sync → lifecycle exit
- [ ] Swap treasury implementation (Fireblocks mock → EOA mock) and re-run full flow — zero contract changes required
- [ ] Trigger governance timelock: propose → sign (N-of-M) → wait timelock → execute
- [ ] Test emergency guardian pause (no multisig required, immediate)
- [ ] Carbon workflow: tokenize → invest → P2P trade → holdings view → retire → check BOR + serial allocation
- [ ] Verify admin balances on all deployed contracts

---

## Section 6 — Execution Phase (Post-Approval)

> [!IMPORTANT]
> This section executes only after the user approves the plan above. Steps in order.

### 6.1 — Contract Development (Solidity)

**Order of development** (dependency-first):

| Step | Contract | Type | Notes |
|---|---|---|---|
| 1 | `ITreasury.sol` | Interface | Wallet-agnostic treasury |
| 2 | `ICarbonRegistry.sol` | Interface | Carbon registry enums |
| 3 | `ICarbonRetirementManager.sol` | Interface | Retirement lifecycle |
| 4 | `DMSRegistry.sol` | Optional | Deploy but not wired by default |
| 5 | `CarbonCreditPlugin.sol` | REWRITE | STATIC_HOLD archetype |
| 6 | `CarbonRetirementPlugin.sol` | NEW | CONSUMABLE archetype |
| 7 | `CarbonAssetMetadataStore.sol` | Optional | On-chain registry metadata |
| 8 | `CarbonBatchManager.sol` | NEW | FIFO serial allocation |
| 9 | `CarbonRetirementManager.sol` | NEW | Retirement lifecycle |
| 10 | `GovernanceMultisig.sol` | NEW | N-of-M + timelock |
| 11 | `SanctionsOracle.sol` | NEW | Compliance oracle |
| 12 | `NAVOracle.sol` | MODIFY | PoR-gated NAV, per-asset-class |
| 13 | `SyncVault.sol` | MODIFY | NAV-wired totalAssets(), depositFromTreasury() |
| 14 | `RedemptionManager.sol` | MODIFY | markDisbursed(), exit lock |
| 15 | `OwnershipSyncManager.sol` | MODIFY | Carbon reason codes |
| 16 | `AssetRegistry.sol` | MODIFY | carbonMetadataStore pointer |
| 17 | `LifecycleExitManager.sol` | REWRITE | All 8 preconditions |

---

### 6.2 — New Workflow Scripts for Carbon Credits

Create new scripts in `scripts/workflow/` to cover the full carbon lifecycle:

#### [NEW] `scripts/workflow/17.carbon_asset_tokenization_L2.js`
```
Flow:
1. Register CarbonCreditPlugin (STATIC_HOLD) in AssetFactory
2. Set NAV schedule for CARBON_CREDITS (7-day interval, MARKET_COMPARABLE)
3. Deploy CarbonCreditPlugin asset via AssetFactory.deployAsset()
   - Pass CarbonAssetParams (registryProjectId, serialRangeStart, serialRangeEnd, vintage, etc.)
   - serialCommitment = keccak256(serialStart + serialEnd)
   - immobilizationProofHash = SHA-256 of registry lock proof document
4. AssetFactory mints 100% supply to Treasury
5. (Optional) Register in CarbonAssetMetadataStore with serial range
6. Submit NAV to NAVOracle with PoR hash
7. Log: assetToken address, serial range, IPFS manifest CID
```

#### [NEW] `scripts/workflow/18.carbon_vault_listing_L3.js`
```
Flow:
1. VaultFactory.createVault(assetToken, STATIC_HOLD) → SyncVault deployed
2. Register vault in AssetRegistry
3. FeeEngine.registerVault(vault, config)
4. NAVOracle.getNavForMintValidation(assetId) → confirm NAV is FRESH
5. SyncVault.setNavOracle(navOracle, assetId)
6. List vault on marketplace
7. Log: vault address, fee config, NAV status
```

#### [NEW] `scripts/workflow/19.carbon_investment_primary_L3.js`
```
Flow (backend orchestration — no USDC in vault):
1. Investor sends USDC to Treasury (simulated)
2. Backend: Treasury.approve(SyncVault, assetTokenAmount)
3. Backend: SyncVault.depositFromTreasury(assetTokenAmount, investor, usdcPaid)
   - SyncVault reads NAV, validates variance (AUD-03)
   - Mints vault shares to investor
   - OwnershipSyncManager.updateBeneficialOwnership() → BOR updated
4. (If CarbonAssetMetadataStore deployed) getCarbonHoldingView(asset, vault, investor)
   → logs: vaultShares, creditEquivalent, pctBps
5. Log: investor shares, BOR entry, carbon holding view
```

#### [NEW] `scripts/workflow/20.carbon_p2p_secondary_L4.js`
```
Flow:
1. Investor A places sell order (vault shares)
2. Investor B places buy order
3. OrderBook matches → ClearingHouse.settle()
4. SyncVault._update() fires → OwnershipSyncManager
   - reasonCode = CARBON_P2P_TRANSFER
   - BOR updated for A (decreased) and B (increased)
5. (If CarbonAssetMetadataStore deployed):
   - getCarbonHoldingView for A → lower creditEquivalent
   - getCarbonHoldingView for B → new creditEquivalent
6. Verify: serial numbers unchanged (still pooled in vault)
7. Log: before/after BOR, credit equivalents for both investors
```

#### [NEW] `scripts/workflow/21.carbon_retirement_L3.js`
```
Flow:
1. Investor B calls CarbonRetirementManager.requestRetirement(vault, shares, beneficiary, purpose)
2. CarbonBatchManager.allocateSerialRange(assetToken, credits) → FIFO from batch
3. CarbonAssetMetadataStore.decrementAvailableCredits()
4. Status → REQUESTED
5. (Simulate) REGISTRY_OPERATOR calls confirmRetirement(id, serialStart, serialEnd, txHash, certHash)
6. SyncVault.burnShares(investor, shares) — RETIREMENT_MANAGER_ROLE
7. CarbonAssetMetadataStore.incrementRetiredCredits()
8. OwnershipSyncManager.updateBeneficialOwnership() → reasonCode = CARBON_RETIREMENT
9. Log: retirement record, serials allocated, BOR updated, credits retired
```

#### [NEW] `scripts/workflow/22.carbon_registry_sync_update_L2.js`
```
Flow (annual monitoring update):
1. Admin uploads new monitoring report hash
2. CarbonAssetMetadataStore.updateMonitoringReport(assetToken, newHash, reportDate)
3. NAVOracle.submitNAV(assetId, newNAV, immobilizationProofHash) → PoR-gated
4. SyncVault.totalAssets() reflects new NAV → share price updated
5. Log: new NAV, share price before/after, monitoring report hash
```

---

### 6.3 — New Documentation

#### [NEW] `CRATS_v10_UPDATE.md` — Developer & End User Guide

Create `c:\Users\anask\Desktop\CPM\CRATS-EVM\CRATS_v10_UPDATE.md` with:

**Developer sections**:
- Architecture changes summary (ITreasury, Plugin v2, DMS optional)
- Carbon credit tokenization flow (step-by-step with function signatures)
- NAV + PoR integration guide (how vault share price is NAV-backed)
- P2P carbon trading guide (what updates, what doesn't)
- Carbon retirement guide (request → confirm → burn → certificate)
- New contract addresses template
- Upgrade checklist (proxy upgrade order, storage gap verification)
- New workflow script reference (scripts 17-22)

**End user sections**:
- What are carbon credits on CRATS? (simple explanation)
- How to buy carbon credit vault shares
- How to trade shares P2P
- How to retire credits (claiming environmental offset)
- What is the Carbon Holdings View?
- How to verify registry serials

#### [MODIFY] `CRATS_Protocol_Specification.md`

Update `c:\Users\anask\Desktop\CPM\CRATS-EVM\CRATS_Protocol_Specification.md`:
- Version header: `v8.0.0` → `v10.0.0`
- Section 1.1: Add Carbon Credit to architecture overview
- Section 3.2: Add Plugin v2 archetype table (STATIC_HOLD / YIELD_BEARING / CONSUMABLE)
- Section 5.1: Extend 14-step lifecycle to include carbon steps (17-22)
- Section 7: Add CARBON_CREDITS to per-asset-class NAV schedule table (7-day, MARKET_COMPARABLE)
- Section 8.1: Add CarbonCreditPlugin + CarbonRetirementPlugin to deployed plugins table
- New Section 10: v10.0.0 Carbon Credit Extension (summary)
- Changelog: Add v10.0.0 entry

---

### 6.4 — Local Node Deployment & Testing

**Deploy order (Hardhat localhost)**:

```bash
# Step 1: Start local node
npx hardhat node

# Step 2: Deploy base infrastructure (already deployed on Sepolia — redeploy locally)
npx hardhat run scripts/deploy/01_deploy_identity.js --network localhost
npx hardhat run scripts/deploy/02_deploy_asset_layer.js --network localhost
npx hardhat run scripts/deploy/03_deploy_financial_layer.js --network localhost
npx hardhat run scripts/deploy/04_deploy_marketplace.js --network localhost

# Step 3: Deploy v10 new contracts
npx hardhat run scripts/deploy/v10/01_deploy_governance.js --network localhost
npx hardhat run scripts/deploy/v10/02_deploy_carbon_interfaces.js --network localhost
npx hardhat run scripts/deploy/v10/03_deploy_carbon_plugin.js --network localhost
npx hardhat run scripts/deploy/v10/04_deploy_carbon_retirement_plugin.js --network localhost
npx hardhat run scripts/deploy/v10/05_deploy_carbon_metadata_store.js --network localhost
npx hardhat run scripts/deploy/v10/06_deploy_carbon_batch_manager.js --network localhost
npx hardhat run scripts/deploy/v10/07_deploy_carbon_retirement_manager.js --network localhost
npx hardhat run scripts/deploy/v10/08_deploy_dms_registry.js --network localhost  # optional
npx hardhat run scripts/deploy/v10/09_upgrade_sync_vault.js --network localhost
npx hardhat run scripts/deploy/v10/10_upgrade_nav_oracle.js --network localhost
npx hardhat run scripts/deploy/v10/11_wire_nav_to_vault.js --network localhost

# Step 4: Run full workflow
node scripts/workflow/17.carbon_asset_tokenization_L2.js localhost
node scripts/workflow/18.carbon_vault_listing_L3.js localhost
node scripts/workflow/19.carbon_investment_primary_L3.js localhost
node scripts/workflow/20.carbon_p2p_secondary_L4.js localhost
node scripts/workflow/21.carbon_retirement_L3.js localhost
node scripts/workflow/22.carbon_registry_sync_update_L2.js localhost

# Step 5: Run existing workflow to ensure nothing broken
node scripts/workflow/test-workflow.js localhost

# Step 6: Run all tests
npx hardhat test --network localhost

# Step 7: Check admin balance
node scripts/check_admin_balance.js localhost
```

**Admin balance check covers**:
- Admin ETH balance (gas)
- Treasury asset token holdings
- All deployed contract addresses
- NAVOracle status (FRESH/WARNING/CRITICAL/STALE) for all registered assets
- BOR entries count
- Carbon asset: availableCredits, retiredCredits, reservedCredits

---

### 6.5 — Sepolia Deployment (After Local Verification)

> [!CAUTION]
> Do NOT begin Sepolia deployment until local node tests pass and admin balance has been reviewed and confirmed by you.

**Upgrade/deploy order on Sepolia**:
1. Deploy v10 new contracts (carbon interfaces, plugins, retirement manager)
2. Upgrade existing proxies (SyncVault, NAVOracle, RedemptionManager, LifecycleExitManager) via UUPS
3. Wire NAV oracle reference into existing Sepolia vaults
4. Register CarbonCreditPlugin (STATIC_HOLD) in AssetFactory
5. Register CarbonRetirementPlugin (CONSUMABLE) in AssetFactory
6. Run workflow scripts 17-22 on Sepolia
7. Update `CRATS_Protocol_Specification.md` deployed addresses table with new Sepolia addresses
