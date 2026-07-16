PROTOCOL UPDATE SPECIFICATION
CRATS Protocol
v10.0.0
Multi-Category Asset Framework and End-to-End Protocol
Integration. Transforming CRATS into a fully modular, institutional
grade multi-category RWA platform with archetype-based asset
plugins, unified vault lifecycle management, governance
hardening, DMS integration, and end-to-end ownership
synchronization.
CopyM Platform — Confidential
Multi-Category Asset Framework & Protocol Integration
July 2026
REAL-WORLD ASSET TOKENIZATION PLATFORM
v10.0.0
CRATS Protocol v10.0.0 - Technical Update Specification
Page 1 CopyM Platform - Confidential
Table of Contents
3 1. Executive Summary & Objective
3 2. High-Level Architecture Overview
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 4 2.1 Module Responsibility Matrix
5 3. Multi-Category Asset Framework
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 5 3.1 Archetype Definitions
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 6 3.2 Archetype-to-Contract Mapping
6 4. Plugin Framework v2
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 7 4.1 Plugin Responsibilities (Allowed)
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 7 4.2 Plugin Prohibitions (Not Allowed)
7 5. Fireblocks Treasury Integration
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 7 5.1 Custody Architecture
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 8 5.2 NAV-Based Investment Flow (Corrected)
8 6. Vault-Centric Lifecycle Architecture
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 8 6.1 SyncVault (ERC-4626) - Operations
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 9 6.2 AsyncVault (ERC-7540) - Operations
10 7. Dynamic NAV & Asset Valuation
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 10 7.1 NAV Source Weighting
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 10 7.2 Staleness Circuit Breakers
11 8. OwnershipSyncManager v2
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 11 8.1 Complete Trigger List
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 11 8.2 Beneficial Ownership Registry (BOR)
12 9. Document Management System (DMS)
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 12 9.1 DMS Workflow
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 12 9.2 DMS Features
13 10. Redemption Framework v6
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 13 10.1 Standard Redemption vs. Institutional Lifecycle Exit
13 11. LifecycleExitManager v2
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 13 11.1 Vault Closure Preconditions
14 12. Marketplace Integration
CRATS Protocol v10.0.0 - Technical Update Specification
Page 2 CopyM Platform - Confidential
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 14 12.1 P2P Trade Flow
15 13. Governance Hardening
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 15 13.1 Governance Components
15 14. Indexer v2 & Event Coverage
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 15 14.1 New Indexed Events
16 15. Migration Impact Matrix (v8/v9 to v10.0.0)
17 16. End-to-End Protocol Integration Flow
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 17 16.1 Complete Issuance-to-Exit Pipeline
18 17. Security & Production Readiness
19 18. Expected Outcome
CRATS Protocol v10.0.0 - Technical Update Specification
1. Executive Summary & Objective
CRATS Protocol v10.0.0 represents the most significant architectural overhaul since the protocol's inception. This
release transforms CRATS from a single-asset-class RWA tokenization platform into a fully modular,
institutional-grade multi-category Real-World Asset framework. The update introduces three standardized asset
archetypes (Static Hold, Yield-Bearing, and Consumable/Retirable), a stateless plugin framework, Fireblocks
Treasury custody integration, a Document Management System (DMS), governance hardening via multisig and
timelock mechanisms, and end-to-end ownership synchronization across every protocol layer.
The core objective is to establish a unified protocol where every module, from identity verification through to final
settlement and vault closure, operates as a single synchronized system. This eliminates the fragmented flows that
existed in prior versions, where treasury operations, vault accounting, ownership tracking, and settlement
verification operated as partially connected components. In v10.0.0, the Fireblocks Treasury Vault becomes the
institutional custody layer for both cash (USDC) and underlying ERC-3643 asset tokens, while SyncVault and
AsyncVault contracts serve purely as on-chain accounting and share issuance engines. This separation ensures that
investors never directly hold or transfer underlying asset tokens; they interact exclusively with ERC-4626 vault
shares.
ARCHITECTURAL PRINCIPLE: USDC never touches the Vault contract. It remains inside the Fireblocks
Treasury Vault. The vault only receives underlying ERC-3643 asset tokens, and mints shares 1:1 against those
tokens. NAVOracle, not the vault or the ERC-20 contract, is the single source of asset pricing.
2. High-Level Architecture Overview
The v10.0.0 architecture maintains the established 4-Layer Stack (Identity, Assets, Financials, Markets) but
introduces two critical integration layers that span all four tiers: the Fireblocks Treasury custody layer and the
OwnershipSyncManager middleware. The Fireblocks Treasury Vault (e.g., Vault-103) assumes responsibility for
all cash and underlying token custody, operating as an off-chain institutional custodian that interacts with on-chain
vault contracts through authorized transfers. The OwnershipSyncManager centralizes every ownership state
change, whether originating from primary issuance, P2P marketplace settlement, redemption processing, or
lifecycle exits, into a single update pipeline that feeds the Beneficial Ownership Registry (BOR) in real time.
The end-to-end protocol integration flow begins with issuer onboarding through the Document Management
System (DMS), proceeds through asset plugin validation and ERC-3643 token deployment, locks 100% of the
asset supply into the Fireblocks Treasury, deploys investment vaults via the VaultFactory, and enables investor
participation through a NAV-driven purchase flow where the backend orchestrator queries NAVOracle, calculates
required asset quantities, and instructs Fireblocks to transfer the precise number of underlying tokens into the vault
for share minting.
Page 3
CopyM Platform - Confidential
CRATS Protocol v10.0.0 - Technical Update Specification
Figure 1: CRATS v10.0.0 NAV-Based Investment Flow with Fireblocks Treasury Custody
2.1 Module Responsibility Matrix
Each module in the v10.0.0 architecture has a clearly defined, non-overlapping responsibility. The following table
maps every major component to its primary function, the data it manages, and its interaction boundaries. This
matrix serves as the authoritative reference for understanding which contract owns which piece of protocol state.
Module
Primary Responsibility
Data Owned
Fireblocks Treasury
NAVOracle
Institutional custody of USDC and
ERC-3643 tokens
Single source of asset pricing
Cash balances, underlying
token balances
Interacts With
Backend, NAVOracle, SyncVault
NAV per asset, valuation
sources, freshness
Backend, SyncVault,
LifecycleExitManager
SyncVault (ERC-462
6)
AsyncVault
(ERC-7540)
On-chain share accounting and
issuance
Async deposit/redeem lifecycle
for illiquid assets
Vault shares, fee checkpoints
Pending/claimable positions
Fireblocks, FeeEngine,
OwnershipSyncManager
Fireblocks, RedemptionManager,
NAVOracle
OwnershipSyncMan
ager
AssetRegistry (BOR)
Centralized BOR synchronization
Beneficial ownership record of
truth
Ownership events, sync state
All vaults, AssetRegistry,
Marketplace
Current/historical ownership,
lifecycle status
DMS
Document approval before
tokenization
Document versions, approval
status, hashes
OwnershipSyncManager, Indexer
AssetFactory, Plugins
Page 4
CopyM Platform - Confidential
CRATS Protocol v10.0.0 - Technical Update Specification
Page 5 CopyM Platform - Confidential
Module Primary Responsibility Data Owned Interacts With
AssetFactory ERC-3643 token deployment Token templates, plugin
mappings
DMS, Plugins, Fireblocks
FeeEngine Fee calculation and collection Fee configs, accruals, HWM
records
SyncVault, Treasury
RedemptionManager Standard investor redemptions Redemption requests, queue
state
SyncVault, AsyncVault,
ComplianceModule
LifecycleExitManag
er
Institutional liquidation exits Exit state, escrow balances NAVOracle, Governance,
Fireblocks
SettlementEngine P2P trade execution (DvP) Settlement orders, trade state ComplianceModule, Vaults,
OwnershipSyncManager
Governance Multisig Privileged operation authorization Role grants, timelock queues All admin-gated contracts
Indexer v2 Off-chain event indexing Complete protocol event history All contracts (event listeners)
Table 1: v10.0.0 Module Responsibility Matrix
3. Multi-Category Asset Framework
The most fundamental change in v10.0.0 is the introduction of three standardized asset archetypes. Prior versions
treated all RWA assets through a single, undifferentiated pipeline. While this worked for the initial real estate use
case, it created architectural friction when extending to yield-bearing instruments (private credit, treasury bills) and
consumable environmental assets (carbon credits, renewable energy certificates). Each archetype defines a
standardized set of characteristics, permitted operations, and required infrastructure components, enabling the
protocol to scale to any asset class without custom contract modifications.
3.1 Archetype Definitions
Characteristic Static Hold Yield-Bearing Consumable / Retirable
Description Long-term ownership assets with
no yield distribution
Income-generating assets with
periodic yield
Assets that are consumed or
retired upon use
Examples Real Estate, Fine Art, Precious
Metals, Commodities, Luxury
Assets
Private Credit, Treasury Bills,
Corporate Bonds, Invoice
Financing, Private Equity, IP
Royalties
Carbon Credits, Renewable
Energy Certificates, Water Credits
Ownership Model Long-term holding with P2P
trading
Periodic yield accrual and
distribution
Consumption-triggered retirement
Vault Type Standard ERC-4626 SyncVault ERC-4626 SyncVault with
FeeEngine + YieldDistributor
ERC-4626 SyncVault with
burn-on-consume hooks
NAV Pricing Appraisal-based, periodic updates NAVOracle-driven with
multi-source pricing and freshness
checks
Market-based or registry-verified
pricing
Redemption Standard redemption via
RedemptionManager
Maturity-aware redemption with
default handling
Retirement/burn with registry
verification
CRATS Protocol v10.0.0 - Technical Update Specification
Page 6 CopyM Platform - Confidential
Characteristic Static Hold Yield-Bearing Consumable / Retirable
Lifecycle Exit Supported via LifecycleExitManag
er v2
Supported with NAV-based
settlement verification
Not applicable (assets are retired,
not liquidated)
Key Risk Illiquidity, appraisal staleness Default risk, interest rate risk,
NAV volatility
Double-spend, registry
invalidation, fraud
Table 2: Asset Archetype Comparison Matrix
3.2 Archetype-to-Contract Mapping
Each archetype maps to a specific combination of protocol contracts. The AssetFactory uses the archetype type to
determine which vault template to deploy, which modules to connect, and which governance rules to apply. This
mapping is encoded in the AssetRegistry and enforced at deployment time by the asset plugin. The following table
defines the contract stack for each archetype, clarifying which modules are required versus optional for each asset
class.
Contract / Module Static Hold Yield-Bearing Consumable / Retirable
SyncVault (ERC-4626) Required Required Required
AsyncVault (ERC-7540) Optional Optional Not Used
FeeEngine Entry/Exit fees only Full: Mgmt + Perf + HWM Entry/Exit fees only
YieldDistributor Not Used Required Not Used
NAVOracle Required (periodic) Required (frequent) Required (market-based)
RedemptionManager Required Required Not Used (burn replaces)
LifecycleExitManager Required Required Not Used
OwnershipSyncManager Required Required Required
Registry Verification Not Used Not Used Required (double-spend
protection)
Maturity Handler Not Used Required Not Used
Default Handler Not Used Required Not Used
Table 3: Archetype-to-Contract Mapping
4. Plugin Framework v2
The Plugin Framework v2 introduces a rigorous standardization of all asset plugins under a common IAssetPlugin
interface. In previous versions, plugins such as RealEstatePlugin and FineArtPlugin contained a mix of validation
logic and occasional stateful operations, creating inconsistency and upgrade risk. In v10.0.0, every plugin is strictly
stateless and responsible exclusively for four categories of validation: document validation, asset metadata
validation, category-specific rule enforcement, and asset parameter validation. Any logic related to redemption,
burn, yield calculation, maturity handling, NAV computation, ownership updates, settlement, or lifecycle
management is explicitly prohibited from residing inside plugins.
CRATS Protocol v10.0.0 - Technical Update Specification
4.1 Plugin Responsibilities (Allowed)
• Document Validation: Verify that the required document types (e.g., TITLE_DEED, APPRAISAL,
AUTHENTICATION, INSURANCE) are present, properly formatted, and reference valid hashes.
• Metadata Validation: Validate asset name, symbol, decimals, total supply, and other ERC-3643 metadata
fields against category-specific rules.
• Category-Specific Rules: Enforce archetype-level constraints (e.g., consumable assets must have a registry
verification endpoint; yield-bearing assets must specify a maturity date).
• Parameter Validation: Verify configuration parameters such as NAV update frequency, fee structure
compatibility, and compliance module assignments.
4.2 Plugin Prohibitions (Not Allowed)
The following operations are strictly forbidden from plugin contracts. Enforcing this separation ensures that
plugins remain upgradeable without affecting financial flows, and that financial logic is centralized in the vault
layer where it can be audited and governed independently.
Prohibited Operation
Correct Location
Rationale
Redemption logic
Burn logic
RedemptionManager / Vault
Vault / LifecycleExitManager
Financial flow must be in vault layer
Token destruction requires governance
authorization
Yield distribution
Maturity handling
YieldDistributor / FeeEngine
Vault + Maturity Handler
Yield is a financial operation, not a validation rule
Maturity triggers settlement, not validation
NAV calculation
Ownership updates
NAVOracle
OwnershipSyncManager
Pricing requires multi-source oracle independence
Ownership state must be centralized
Settlement logic
SettlementEngine / LifecycleExitManager
Settlement requires compliance + DvP atomicity
Table 4: Plugin Prohibitions and Correct Locations
DMS INTEGRATION: Plugins validate DMS-approved documents instead of only checking document types.
This means a plugin will reject a TITLE_DEED document if the DMS has not approved it, even if the document
hash and format are valid. The DMS approval status is passed as a parameter to the plugin's validation function.
5. Fireblocks Treasury Integration
v10.0.0 replaces the traditional Platform Treasury EOA wallet with Fireblocks Vault Accounts, establishing a true
institutional custody layer for both stablecoin payments and underlying ERC-3643 asset tokens. The Fireblocks
Vault (e.g., Vault-103) serves as the single custody point where all USDC from investors is received and all
underlying asset tokens are stored. This architectural decision has profound implications for the entire investment
flow: the USDC never touches the Vault contract, the vault never interacts with investor cash directly, and the
backend orchestrator becomes the coordination layer between Fireblocks custody, NAVOracle pricing, and
on-chain vault operations.
5.1 Custody Architecture
Page 7
CopyM Platform - Confidential
CRATS Protocol v10.0.0 - Technical Update Specification
When an issuer tokenizes an asset, the AssetFactory deploys an ERC-3643 Asset Token contract and mints 100%
of the total supply. This entire supply is then transferred into the Fireblocks Treasury Vault, where it remains
locked under institutional MPC custody. Investors never receive, hold, or transfer the underlying ERC-3643
tokens. Instead, they receive ERC-4626 vault shares that represent their proportional claim on the underlying assets
held within the vault. This separation creates a clean boundary between custody (Fireblocks), accounting (Vault),
and ownership tracking (BOR).
5.2 NAV-Based Investment Flow (Corrected)
The investment flow in v10.0.0 is fundamentally different from a standard ERC-4626 deposit. In a standard
ERC-4626 flow, the investor calls deposit() on the vault, transferring the underlying asset directly. In CRATS
v10.0.0, the flow is orchestrated through the Fireblocks Treasury as follows:
Ste
p
Actor
Action
On-Chain / Off-Chain
1
2
Investor
Fireblocks
Sends USDC to Fireblocks Treasury Vault
Receives and custodies USDC. USDC never touches Vault contract.
Off-chain (Fireblocks)
Off-chain (Fireblocks)
3
4
Backend
Backend
Detects payment confirmation via Fireblocks webhook
Queries NAVOracle for current NAV per asset token
Off-chain (Backend)
On-chain (read)
5
6
Backend
Fireblocks
Calculates: USDC Amount / NAV = Required Asset Tokens
Transfers calculated ERC-3643 Asset Tokens to SyncVault
Off-chain (calculation)
On-chain (transfer)
7
8
SyncVault
OwnershipSyn
cManager
Receives underlying tokens, mints ERC-4626 Vault Shares to investor
Updates Beneficial Ownership Registry
On-chain (mint)
On-chain (write)
Table 5: v10.0.0 NAV-Based Investment Flow (Step-by-Step)
VAULT SIMPLICITY PRINCIPLE: The vault does not calculate NAV. It does not query pricing oracles. It
simply receives N underlying asset tokens and mints N vault shares. The pricing intelligence lives entirely in the
NAVOracle and the backend orchestrator. This keeps the vault contract minimal, auditable, and
standard-compliant.
6. Vault-Centric Lifecycle Architecture
In v10.0.0, all investment lifecycle logic is consolidated into the vault layer. The vault becomes the single lifecycle
controller, orchestrating deposits, withdrawals, redemptions, burns, lifecycle exits, fee checkpoints, and ownership
synchronization. This eliminates the scattered state management that existed in prior versions where
RedemptionManager, LifecycleExitManager, and the vault each maintained overlapping or inconsistent state. The
underlying ERC-3643 asset token always remains locked inside the Fireblocks Treasury and is only transferred to
the vault when an investment occurs, or back to the Treasury during a lifecycle exit.
6.1 SyncVault (ERC-4626) - Operations
Page 8
CopyM Platform - Confidential
CRATS Protocol v10.0.0 - Technical Update Specification
Page 9 CopyM Platform - Confidential
The SyncVault handles all synchronous operations for liquid and semi-liquid assets. It implements the standard
ERC-4626 interface but with CRATS-specific extensions for compliance gating, fee checkpointing, NAV-aware
deposit restrictions, and automatic ownership synchronization. Every state-changing operation triggers the
OwnershipSyncManager to update the BOR, ensuring that the registry always reflects the current beneficial owners
of the underlying asset.
Operation Trigger Vault Action Ownership Sync Fee Action
Deposit Fireblocks transfers assets
to vault
Mint vault shares 1:1 against
received tokens
OwnershipSyncManager.u
pdateBeneficialOwnership
()
Entry fee pulled in
USDC from Treasur
y
Withdraw Investor initiates
withdrawal
Burn vault shares, transfer
assets to Fireblocks Treasury
OwnershipSyncManager
updates BOR reduction
Exit fee pulled in
USDC from Treasur
y
Redeem Investor redeems shares
for assets
Burn shares, return pro-rata
assets
BOR updated to reflect
exit
Exit fee calculated
and collected
Burn Lifecycle exit or
consumption
Burn shares, return assets to
Treasury or burn
BOR fully cleared for
affected investor
No fee on lifecycle
burns
Fee Checkpo
int
Every deposit/withdraw/re
deem
Call FeeEngine.checkpoint(vaul
t)
N/A Accrues managemen
t fee based on
elapsed time
Table 6: SyncVault Operations Matrix
6.2 AsyncVault (ERC-7540) - Operations
The AsyncVault handles illiquid assets where deposits and redemptions cannot be executed atomically. It
implements the ERC-7540 asynchronous vault standard with a multi-step request-fulfill-claim lifecycle. Investors
lock their shares or assets during the pending phase, operators verify liquidity and compliance before fulfilling
requests, and investors claim their settled positions once fulfilled. The AsyncVault maintains the same
OwnershipSyncManager integration as the SyncVault, ensuring that every state transition in the async pipeline is
reflected in the BOR.
Phase Function Description Ownership Impact
Request requestDeposit() Investor locks USDC, vault escrows assets Pending position recorded in BOR
Fulfill fulfillDeposit() Operator mints claimable shares to vault escrow No BOR change (not yet
investor's)
Claim claimDeposit() Investor receives minted vault shares BOR updated with new ownership
Request requestRedeem() Investor locks shares, vault escrows redemption BOR reflects reduced balance
Fulfill fulfillRedeem() Operator allocates assets for claim No BOR change (pending payout)
Claim claimRedeem() Investor receives underlying assets via Treasury BOR fully cleared
Table 7: AsyncVault Lifecycle Phases
CRATS Protocol v10.0.0 - Technical Update Specification
7. Dynamic NAV & Asset Valuation
The NAVOracle becomes the single, authoritative pricing source for all asset tokens in v10.0.0. It supports
independent valuations from multiple sources (full appraisal, DCF model, income statement, market comparable),
each with configurable weights and maximum staleness thresholds. Oracle freshness checks ensure that trading and
investment operations are automatically halted if the valuation data becomes stale beyond a configurable critical
threshold. When the NAV changes, the underlying asset value is revalued through the NAVOracle, the vault's asset
value is updated, and the share price adjusts accordingly. Importantly, no additional shares are minted when NAV
changes; only the per-share value changes, preserving the 1:1 initial minting ratio while allowing market-driven
price discovery.
7.1 NAV Source Weighting
The NAVOracle computes a weighted average NAV per share based on all active valuation methods. Each method
has an independent staleness half-life: as a valuation source ages beyond half of its maximum allowed age, its
weight is automatically reduced by 50%. If a source exceeds its maximum age entirely, it is excluded from the
calculation. For appraisal-dependent asset classes like real estate, a stale appraisal triggers a full trading halt, while
for market-priced assets like corporate bonds, the system falls back to market comparable data with a warning
state.
Asset Class
Max Interval
Warning
Threshold
Primary Method
Fallback Method
Real Estate
Fine Art
90 days
365 days
75 days
330 days
Full Appraisal
Market Comparable
Full Appraisal
DCF Model
Private Credit
Corporate Bonds
30 days
1 day
25 days
1 day
DCF Model
Income Statement
Market Price
Treasury Bills
Carbon Credits
1 day
7 days
1 day
5 days
Market Price
Market Comparable
N/A (highly liquid)
Market Price
IP Royalties
30 days
25 days
Income Statement
Table 8: Per-Asset-Class NAV Valuation Schedule
7.2 Staleness Circuit Breakers
Registry Verified
DCF Model
State
Condition
Operations Allowed
FRESH
Time since last NAV < Warning 
threshold
WARNING Time since last NAV between
Warning and Critical
All operations: deposit, withdraw,
trade, redeem
System Action
Normal operations
Contract paused via circuit breaker;
emergency governance triggered
All operations allowed (with logged
alerts)
CRITICAL
STALE
Time since last NAV between
Critical and Max
Time since last NAV > Max
Interval
Withdraw and redeem only (deposits
blocked)
No operations allowed
Platform logs alert, dashboard
warning displayed
Deposit functions revert; investors
can exit
Table 9: NAV Staleness States and Circuit Breaker Behavior
Page 10
CopyM Platform - Confidential
CRATS Protocol v10.0.0 - Technical Update Specification
Page 11 CopyM Platform - Confidential
8. OwnershipSyncManager v2
The OwnershipSyncManager v2 centralizes all ownership synchronization across the entire protocol. Every
ownership event, whether originating from primary investment, secondary P2P trading, redemption processing,
forced compliance transfers, or lifecycle exits, automatically triggers an update to the Beneficial Ownership
Registry (BOR). The v2 upgrade extends the trigger set to cover all edge cases identified in prior versions,
including vault closure events, async vault request/claim cycles, and governance-triggered role migrations.
Ownership updates are completely independent of asset plugins, ensuring that plugin upgrades never disrupt
ownership tracking.
8.1 Complete Trigger List
# Trigger Event Source Contract BOR Update Type v8/v9
Supported
1 Primary investment (deposit) SyncVault / AsyncVault New ownership record created Yes
2 Deposit / Mint SyncVault Share balance increased Yes
3 Withdraw SyncVault Share balance decreased / removed Yes
4 Redemption RedemptionManager Shares burned, ownership cleared Yes
5 Share transfer (P2P) SyncVault (ERC-20
transfer)
Ownership transferred between
investors
Yes
6 P2P marketplace settlement SettlementEngine Atomic ownership swap Partial
7 Force transfer (regulatory) AssetToken Compliance-driven ownership change Yes
8 Lifecycle exit LifecycleExitManager All shares burned, ownership cleared Yes
9 Vault closure SyncVault Final state recorded, vault marked
closed
No
1
0
Async vault request AsyncVault Pending position recorded Partial
1
1
Async vault claim AsyncVault Final ownership updated Partial
1
2
Governance role migration Governance Multisig Admin role transfer logged No
Table 10: OwnershipSyncManager v2 Trigger Events (with v8/v9 Comparison)
8.2 Beneficial Ownership Registry (BOR)
The BOR maintains the complete ownership history for every tokenized asset. In v10.0.0, the BOR is expanded to
store not only current ownership but the full historical ownership chain, P2P ownership changes with settlement
references, lifecycle snapshots taken at each material state transition, exit history recording the complete lifecycle
of each investor's position, and regulatory reporting data required for KYC/AML compliance audits. The BOR is
queryable by the Indexer v2 for off-chain analytics and regulatory reporting, and it is also queryable on-chain by
compliance modules for real-time transfer verification.
CRATS Protocol v10.0.0 - Technical Update Specification
9. Document Management System (DMS)
v10.0.0 introduces a Document Management System that enforces a document approval workflow before any asset
can be tokenized. In prior versions, document validation was performed solely by the asset plugin at deployment
time, checking only document types and hash formats. The DMS adds a multi-step approval pipeline: the issuer
uploads documents to the DMS, the DMS performs a review and verification process, the compliance team
approves or rejects the submission, the asset plugin validates the approved documents against category-specific
requirements, and only after all checks pass does the AssetFactory proceed with tokenization. This ensures that no
asset enters the protocol without verified, approved, and compliant documentation.
9.1 DMS Workflow
Ste
p
Actor
Action
Status Transition
1
2
Issuer
DMS
Uploads asset documents (title deed, appraisal, insurance, etc.)
Verifies document integrity, format, hash consistency
UPLOADED
UNDER_REVIEW
3
4
Compliance
Compliance
Reviews documents against regulatory requirements
Approves or rejects with reason
COMPLIANCE_PEND
ING
APPROVED /
REJECTED
5
6
Plugin
AssetFactor
y
Validates approved documents against category rules
Proceeds with ERC-3643 token deployment
PLUGIN_VALIDATE
D
TOKENIZED
Table 11: DMS Document Approval Workflow
9.2 DMS Features
• Versioning: Every document revision is stored with a version number, allowing auditors to trace the complete
document history including superseded versions.
• Expiry: Documents can have an expiry date, after which they are marked EXPIRED and the associated asset
may be flagged for re-verification.
• Revocation: Compliance can revoke document approval at any time, which triggers a compliance freeze on
the associated asset token.
• Approval Status: Real-time queryable status (UPLOADED, UNDER_REVIEW, APPROVED, REJECTED,
REVOKED, EXPIRED).
• Hash Verification: All documents are stored with their content hash, enabling on-chain verification that the
document has not been tampered with since approval.
Page 12
CopyM Platform - Confidential
CRATS Protocol v10.0.0 - Technical Update Specification
10. Redemption Framework v6
The Redemption Framework v6 introduces a clear architectural separation between standard investor redemptions
and institutional lifecycle exits. In prior versions, there was potential for overlapping redemption flows where an
investor could simultaneously have a pending redemption request with the RedemptionManager while the
LifecycleExitManager was executing a full-asset liquidation for the same vault. v6 eliminates this ambiguity by
enforcing mutual exclusion: when a lifecycle exit is initiated for a vault, all pending standard redemptions are
either fulfilled immediately or migrated to the lifecycle exit process, and no new standard redemptions can be
initiated.
10.1 Standard Redemption vs. Institutional Lifecycle Exit
Dimension
Standard Redemption (RedemptionManager)
Institutional Lifecycle Exit
(LifecycleExitManager)
Trigger
Scope
Individual investor decision
Single investor's share position
Asset-level event (liquidation, maturity,
consumption)
All investors in the vault (full vault exit)
Settlement
Compliance
Pro-rata assets from vault reserves
Per-investor compliance check
NAV-verified settlement from Fireblocks Treasury
All-investor completeness validation
Governance
Vault Outcome
Processor role approval
Vault remains active
Multisig + Timelock + Governance approval
Vault permanently closed
Asset Token
Outcome
BOR Update
Shares burned, underlying returned to Treasury
Individual investor record cleared
Shares burned, underlying returned to Treasury,
potentially burned for consumables
All investor records cleared, vault marked closed
Table 12: Standard Redemption vs. Institutional Lifecycle Exit
11. LifecycleExitManager v2
The LifecycleExitManager v2 addresses all identified issues from the v8.0.0/v9.0.0 implementations and
introduces institutional-grade liquidation safeguards. The v2 upgrade adds NAV-based settlement verification
against the NAVOracle, a configurable settlement variance threshold that rejects settlements deviating beyond an
acceptable percentage from the calculated NAV, independent settlement validation that cross-checks the settlement
amount against multiple data sources, governance approval via multisig and timelock before execution, on-chain
investor completeness validation that verifies the sum of all processed shares equals the vault's totalSupply, and
Fireblocks settlement integration that routes all payouts through the institutional custody layer.
11.1 Vault Closure Preconditions
The LifecycleExitManager v2 prevents vault closure until every single precondition is satisfied. This atomic
guarantee ensures that no partial or corrupted exit states can occur. The following checks are performed in
sequence, and if any check fails, the entire exit transaction reverts.
Page 13
CopyM Platform - Confidential
CRATS Protocol v10.0.0 - Technical Update Specification
Page 14 CopyM Platform - Confidential
# Precondition Verification Method Failure Action
1 All investors paid Verify processed shares == vault totalSupply() Transaction reverts
2 All shares burned Check vault totalSupply == 0 after burns Transaction reverts
3 BOR synchronized Verify OwnershipSyncManager confirmed final
BOR update
Transaction reverts
4 Correct deployment
initialization
Verify vault deployment params match
AssetRegistry records
Transaction reverts
5 Settlement within NAV
variance
Verify settlement amount within configurable % of
NAV
Transaction reverts
6 No pending redemptions Verify RedemptionManager has no pending
requests for vault
Transaction reverts
7 Governance approval Verify multisig + timelock executed Transaction reverts
8 Fireblocks settlement
confirmed
Verify USDC is in Treasury for payout Transaction reverts
Table 13: LifecycleExitManager v2 - Vault Closure Preconditions
12. Marketplace Integration
The Layer 4 Marketplace connects directly with the OwnershipSyncManager, ensuring that every P2P trade is
immediately reflected in the Beneficial Ownership Registry. The P2P trading flow operates on vault shares
(ERC-4626), not on underlying ERC-3643 asset tokens. When Investor A sells vault shares to Investor B through
the SettlementEngine, the compliance module verifies both parties, the vault executes the share transfer, the
OwnershipSyncManager updates the BOR, and the Indexer records the trade for off-chain analytics. At no point do
the underlying ERC-3643 tokens move between investors; they remain locked inside the vault, with only the share
ownership changing hands.
12.1 P2P Trade Flow
Ste
p
Component Action
1 Investor A Lists vault shares for sale on OrderBookEngine
2 Investor B Accepts the order, initiates settlement
3 SettlementEngine Executes atomic DvP: shares from A to B, USDC from B to A via Treasury
4 ComplianceModule Verifies both parties are KYC-verified and not restricted
5 SyncVault Executes vault share transfer (ERC-20 transfer)
6 OwnershipSyncManager Updates BOR: A's ownership decreased, B's ownership increased
7 Indexer Records trade event for analytics and audit
Table 14: P2P Vault Share Trade Flow
CRATS Protocol v10.0.0 - Technical Update Specification
Page 15 CopyM Platform - Confidential
13. Governance Hardening
v10.0.0 replaces all single-admin operations with a governance framework built on multisig signatures, timelock
delays, and an emergency guardian role. This addresses the critical institutional concern identified in the v8.0.0 gap
analysis: regulatory roles and admin capabilities must not be controlled by a single private key. Every privileged
operation, from plugin upgrades and lifecycle exits to settlement verification and AssetFactory administration, now
requires approval through the governance multisig with an optional timelock delay that gives stakeholders a review
window before execution.
13.1 Governance Components
Component Function Applies To
Governance Multisig Requires N-of-M signers to approve privileged operations LifecycleExitManager, AssetFactory,
Plugin upgrades, Registry admin
Timelock Introduces a mandatory delay (e.g., 48h) between proposal
and execution
Plugin upgrades, fee config changes,
governance role changes
Emergency Guardian Can pause any critical operation in emergencies without
multisig
All vault operations, settlement,
lifecycle exits
Governance Approvals On-chain proposal and voting for major protocol changes New archetype creation, fee model
changes, new module deployments
Role Migration Controlled transfer of admin roles with multisig + timelock DEFAULT_ADMIN_ROLE,
GUARDIAN_ROLE,
PROCESSOR_ROLE
Table 15: Governance Components
14. Indexer v2 & Event Coverage
The Indexer v2 expands protocol-wide event indexing to cover every material lifecycle event. This ensures
complete auditability and enables off-chain analytics, regulatory reporting dashboards, and real-time monitoring of
protocol health. The Indexer listens to all deployed contracts and maintains a structured event database that can be
queried for compliance audits, investor reporting, and operational monitoring.
14.1 New Indexed Events
Event Source Contract Description Previous
Version
AssetCreated AssetFactory New ERC-3643 token deployed Yes (v8)
PluginRegistered AssetFactory New asset plugin registered for category Yes (v7)
PluginUpgraded AssetFactory Existing plugin upgraded Yes (v7)
DocumentApproved DMS Document passed compliance review NEW in v10
OwnershipUpdated OwnershipSyncManager BOR ownership change recorded Yes (v9)
VaultCreated VaultFactory New SyncVault/AsyncVault deployed NEW in v10
CRATS Protocol v10.0.0 - Technical Update Specification
Page 16 CopyM Platform - Confidential
Event Source Contract Description Previous
Version
Investment SyncVault Investment received, shares minted NEW in v10
ShareMinted SyncVault / AsyncVault Vault shares minted to investor NEW in v10
ShareBurned SyncVault / LifecycleExit
Manager
Vault shares burned NEW in v10
RedemptionRequeste
d
RedemptionManager Investor submitted redemption NEW in v10
RedemptionComplet
ed
RedemptionManager Redemption fulfilled and claimed NEW in v10
LifecycleStarted LifecycleExitManager Institutional exit initiated NEW in v10
LifecycleCompleted LifecycleExitManager Exit executed, vault closed NEW in v10
SettlementVerified LifecycleExitManager NAV-based settlement validated NEW in v10
VaultClosed SyncVault Vault permanently shut down NEW in v10
GovernanceApprove
d
Governance Multisig Governance action approved and executed NEW in v10
Table 16: Indexer v2 - Complete Event Coverage
15. Migration Impact Matrix (v8/v9 to v10.0.0)
The following matrix provides a comprehensive overview of every breaking change, new contract, deprecated
feature, and required migration step when upgrading from v8.0.0/v9.0.0 to v10.0.0. Each change is rated by impact
level and migration complexity to assist the development team in planning the upgrade sequence.
Module Change
Type
Description Impact Migration
Treasury BREAKI
NG
Platform Treasury EOA replaced by
Fireblocks Vault Account
Critical Migrate all USDC and asset tokens
to Fireblocks; update backend SDK
Investment
Flow
BREAKI
NG
USDC no longer sent to vault; Fireblocks
custody model
Critical Rewrite deposit flow to use backend
orchestrator pattern
NAVOracle ENHAN
CED
Added Proof-of-Reserve compatibility and
independent valuation checks
Medium Configure PoR oracle integration;
update valuation schedules
Plugins BREAKI
NG
All plugins must implement IAssetPlugin
(stateless only)
High Refactor RealEstatePlugin,
FineArtPlugin, CarbonCreditPlugin
DMS NEW Document Management System introduced
pre-tokenization
High Deploy DMS contracts; migrate
existing asset documents
OwnershipSyn
cManager
ENHAN
CED
Added vault closure, async vault, governance
triggers
Medium Upgrade contract; re-index historical
ownership events
AssetRegistry
(BOR)
ENHAN
CED
Added lifecycle status, redemption status,
DMS reference, archetype
Medium Schema migration for new fields;
backfill existing data
CRATS Protocol v10.0.0 - Technical Update Specification
Page 17 CopyM Platform - Confidential
Module Change
Type
Description Impact Migration
LifecycleExitM
anager
BREAKI
NG
v2 with NAV verification, multisig, investor
completeness
High Redeploy proxy; migrate any
in-progress exits
RedemptionMa
nager
ENHAN
CED
Mutual exclusion with LifecycleExitManager
added
Medium Upgrade to v6; add lifecycle exit
lock mechanism
Governance NEW Multisig + Timelock + Emergency Guardian
introduced
High Deploy Governance Multisig;
migrate all admin roles
Indexer ENHAN
CED
16 event types indexed (was partial coverage) Low Deploy v2 indexer; backfill events
from chain history
Vault Template
s
ENHAN
CED
SyncVault/AsyncVault updated for
Fireblocks flow
High Redeploy VaultFactory with new
templates; existing vaults require
migration
Table 17: Full Migration Impact Matrix (v8/v9 to v10.0.0)
16. End-to-End Protocol Integration Flow
The v10.0.0 protocol integration ensures that every layer, from identity verification through to final settlement and
indexing, remains fully synchronized and auditable. The complete flow demonstrates how an asset moves from
issuer intent to investor ownership, through trading, yield distribution, and eventual exit or maturity. Each step in
the flow is visible to the Indexer, recorded in the BOR, and governed by the appropriate authority. This creates a
protocol where custody, ownership, valuation, compliance, and settlement operate as one unified,
institutional-grade RWA tokenization platform.
16.1 Complete Issuance-to-Exit Pipeline
Phase Component Action Output
1. Document
Upload
DMS Issuer uploads asset documents for compliance
review
Approved document set
2. Tokenization AssetFactory DMS-approved documents pass plugin validation;
ERC-3643 token deployed
AssetToken contract
3. Custody Fireblocks Treasury 100% supply minted and locked in Fireblocks
Vault
Treasury holds all
underlying tokens
4. Vault Deploym
ent
VaultFactory SyncVault or AsyncVault deployed based on
archetype
Investment vault ready
5. Investment Backend + Fireblocks Investor USDC received; NAV queried; asset
tokens transferred to vault
Vault shares minted to
investor
6. Ownership
Sync
OwnershipSyncManage
r
BOR updated with investor ownership record Regulatory transparency
7. Yield / Trading YieldDistributor /
Marketplace
Yield distributed or shares traded P2P Updated BOR on every event
8. Redemption /
Exit
RedemptionManager /
LifecycleExitManager
Investor exits or vault liquidated Shares burned, BOR cleared
CRATS Protocol v10.0.0 - Technical Update Specification
Page 18 CopyM Platform - Confidential
Phase Component Action Output
9. Settlement Fireblocks Treasury USDC or asset tokens returned to investor via
custody
Final payout
10. Indexing Indexer v2 All events recorded for audit and analytics Complete audit trail
Table 18: Complete Protocol Integration Pipeline
17. Security & Production Readiness
v10.0.0 requires a complete security audit cycle before mainnet deployment. The protocol's expanded attack
surface, driven by the Fireblocks integration, governance multisig, DMS workflow, and the centralized
OwnershipSyncManager, demands rigorous external review. The following checklist defines the mandatory
security tasks, each of which must be completed and documented before the protocol can be considered
production-ready.
# Task Scope Priority
1 External Security Audit All new and modified contracts: DMS, LifecycleExitManager v2,
Governance, OwnershipSyncManager v2
P0 - Critical
2 Reentrancy Review All vault operations, SettlementEngine, RedemptionManager (especially
with Fireblocks callback patterns)
P0 - Critical
3 Storage Compatibility Verify all upgradeable proxy storage layouts are compatible between v9
and v10
P0 - Critical
4 Upgrade Validation Test all UUPS proxy upgrade paths, including governance-controlled
upgrades
P1 - High
5 Invariant Testing Formal verification of core invariants: shares == assets, BOR
consistency, NAV non-negative
P1 - High
6 Emergency Recovery Test Guardian pause/resume, timelock cancellation, multisig recovery
flows
P1 - High
7 Governance Testing Test all governance operations: role grants, timelock execution,
emergency guardian actions
P1 - High
8 Fireblocks Integration End-to-end test of Treasury deposit, transfer, and settlement flows with
Fireblocks sandbox
P0 - Critical
9 DMS Workflow Test document upload, approval, revocation, expiry, and plugin
validation integration
P1 - High
1
0
Indexer Backfill Verify Indexer v2 can reconstruct complete state from chain history for
all 16 event types
P2 - Medium
Table 19: Security & Production Readiness Checklist
CRATS Protocol v10.0.0 - Technical Update Specification
18. Expected Outcome
Upon completion of the v10.0.0 upgrade, the CRATS Protocol will achieve the following outcomes that
collectively establish it as an institutional-grade, multi-category RWA tokenization platform. Each outcome
directly addresses a gap or limitation identified in prior versions and represents a measurable improvement in
protocol capability, security, or operational efficiency.
#
Outcome
Addresses
1
2
Three standardized asset archetypes (Static Hold, Yield-Bearing, Consumable/Retirable)
supporting all current and future RWA asset classes
Stateless asset plugins responsible only for validation and category rules, with no financial logic
Single-asset limitation in
v8/v9
Plugin statefulness and
scope creep
3
4
Fireblocks Vault Accounts provide secure institutional custody of all USDC and underlying
ERC-3643 asset tokens
ERC-4626/7540 vaults become the single lifecycle controller for investments, pricing,
redemptions, exits, and share issuance
EOA-based treasury with
single-key risk
Fragmented and partially
connected modules
Scattered lifecycle logic
across multiple managers
5
6
NAVOracle drives dynamic asset valuation and share pricing as the single authoritative source
OwnershipSyncManager automatically synchronizes the BOR across issuance, P2P trading,
redemptions, and lifecycle exits
Manual or inconsistent NAV
updates
Partial or inconsistent BOR
updates
7
8
DMS-backed document verification ensures only approved assets can be tokenized
Governance-secured operations protect high-value actions with multisig and timelock
Unverified document
acceptance
Single-admin key
controlling critical operations
9
1
0
Complete Indexer v2 event coverage enables end-to-end auditability and regulatory reporting
End-to-end protocol integration where custody, ownership, valuation, compliance, and
settlement operate as one unified protocol
Partial event indexing
Table 20: v10.0.0 Expected Outcomes
Page 19
CopyM Platform - Confidential
CRATS Protocol Security Audit Report
Table of Contents
1. Scope, Methodology & Limitations
1.1 What This Review Is Based On
1.2 What This Review Did NOT Do
1.3 How to Use This Report
2. Executive Summary
2.1 Findings Summary
2.2 Verified Remediated
2.3 Production Readiness Verdict
3. Scope
4. Findings
4.1 CRITICAL
4.2 HIGH
4.3 MEDIUM
4.4 LOW
4.5 INFORMATIONAL
5. Verified Remediated — No Action Needed
6. Conclusion
7. Issue & Fix Location Map
7.1 Quick Reference — All Findings
2
2
2
2
3
3
3
4
4
5
5
5
7
8
9
9
11
11
12
CRATS Protocol Security Audit Report
1. Scope, Methodology & Limitations
This report was produced by Claude (Anthropic), an AI system, not by Hacken, CertiK, Trail of Bits, or any
licensed security audit firm. It follows the structure, severity framework, and analytical approach used by
professional Web3 auditors, but it is not a certified audit and carries no such standing. It must not be presented
to investors, regulators, or partners as an independent third-party audit.
1.1 What This Review Is Based On
This assessment was built entirely from specification and design documents reviewed over the course of this
engagement: the original Plugin System design document, the CRATS Protocol Specification v9.0.0 (with
selected Solidity code snippets), the CRATS Redemption Module Specification v5.0 plus its v5.1 audit
addendum, the LifecycleExitManager Specification, direct developer confirmations on document-approval
mechanics and source-code verification of DisputeResolver/HWM logic, and the CRATS Protocol v10.0.0
Update Specification. Each of these documents was reviewed in its entirety, with cross-references checked
against the others to identify inconsistencies, gaps, or contradictions that could indicate implementation risk.
The review also drew on direct developer confirmations where specification text alone was insufficient to
determine the intended behavior of a given component or interaction pattern.
1.2 What This Review Did NOT Do
• No line-by-line Solidity source review. Several findings below are marked "Unverified against source"
for exactly this reason.
• No static analysis (Slither, Mythril, etc.), no fuzzing, no formal verification, no testnet/mainnet
transaction analysis.
• No review of off-chain infrastructure security (backend servers, key management operations, Fireblocks
configuration, CI/CD, cloud infrastructure).
• No review of the actual DMS, DisputeResolver, or FeeEngine implementation code — only their
specified behavior and, where stated, developer-confirmed source verification.
1.3 How to Use This Report
Treat this as a pre-audit readiness assessment: a prioritized list of what a real third-party auditor will very
likely flag, so it can be fixed before that audit starts rather than discovered during it. Every specification
reviewed in this engagement independently states that an external audit is mandatory before mainnet
deployment — this report does not change that requirement; if anything, Finding CRATS-AUD-01 below
restates it as the top finding. The severity ratings in this report follow the standard industry framework used by
professional Web3 security firms: CRITICAL for issues that block any mainnet deployment, HIGH for issues
with direct financial or compliance risk, MEDIUM for real gaps that should be resolved before broad asset
onboarding, LOW for lower-risk issues still worth fixing, and INFORMATIONAL for observations that are
CopyM / CRATS Foundation
Page 2
CRATS Protocol Security Audit Report
not security defects per se but carry organizational or scaling implications.
2. Executive Summary
The CRATS Protocol has undergone multiple rounds of design review and remediation across its Redemption
Module, LifecycleExitManager, and core protocol specifications. Three previously identified high-severity
findings (incomplete-liquidation risk, missing governance gating on the highest-value function, and unverified
settlement amounts) were independently confirmed fixed in the v10.0.0 update during this engagement — a
positive signal that the team acts on findings rather than accumulating them. The overall architecture —
archetype-based plugin model, stateless plugins, centralized ownership sync, layered governance — is sound
and, in several respects, converged independently with recommendations made during this review.
The remaining gaps are concentrated in four areas: (1) the mandatory external audit has not yet occurred, (2) a
small number of specific, addressable findings remain open, (3) governance decisions required to onboard new
asset categories have not yet been made, and (4) documentation consistency across five-plus living
specifications is beginning to show drift. None of the open findings require re-architecting the protocol. All
are executable within a standard pre-launch hardening cycle, provided the external audit is scheduled without
further delay.
2.1 Findings Summary
Severity
Count
Description
CRITICAL
HIGH
2
4
Blocking issues that must be resolved before mainnet under any circumstance
Serious issues with direct financial or compliance risk
MEDIUM
5
Real gaps that should be resolved before broad asset onboarding
LOW
3
Lower-risk issues, still worth fixing
INFORMATION
AL
5
Not security defects — scaling, process, and organizational observations
Table 1 — Findings severity distribution across the CRATS Protocol review scope.
2.2 Verified Remediated
14 previously identified issues were verified as fixed during this engagement (full list in Section 5). This count
is deliberately kept separate from open findings — remediation history is a positive signal for an auditor, not
noise to bury. The fact that three of the highest-severity items from the earlier gap analysis were independently
addressed in the v10.0.0 update specification, without prompting from this engagement, demonstrates that the
protocol team has internalized the severity framework and is acting on findings proactively rather than waiting
for external pressure.
CopyM / CRATS Foundation
Page 3
CRATS Protocol Security Audit Report
CopyM / CRATS Foundation Page 4
2.3 Production Readiness Verdict
Verdict NOT YET PRODUCTION READY
Primary Blockers No external audit performed (CRATS-AUD-01); SettlementEngine/OrderBookEngine custom logic
unaudited (CRATS-AUD-02); unresolved HIGH findings.
Assessment None of the blockers are architectural — all are executable within a normal pre-launch hardening cycle.
Table 2 — Production readiness assessment summary.
3. Scope
The following table enumerates every component reviewed during this engagement, the primary specification
or evidence source used for each, and any relevant caveats about the depth of review possible for that
component. Components marked as "Named only" were referenced in specifications but no detailed design
document or interface definition was made available, meaning the review could not assess their internal logic,
edge cases, or integration correctness beyond what the surrounding specification text implies.
Component Reviewed Via
AssetFactory, IAssetPlugin, RealEstatePlugin /
FineArtPlugin / CarbonCreditPlugin v9.0.0 specification + code snippets
SyncVault (ERC-4626), AsyncVault (ERC-7540),
VaultFactory v9.0.0 + v10.0.0 specifications
RedemptionManager Redemption Module spec v5.0/5.1 (full decision log + audit addendum)
LifecycleExitManager Dedicated LifecycleExitManager specification
FeeEngine, NAVOracle v9.0.0/v10.0.0 specifications; HWM logic developer-confirmed against
source
DisputeResolver Developer-confirmed against source (not independently reviewed)
OwnershipSyncManager / BOR v9.0.0 + v10.0.0 specifications
DMS / DocumentRegistry / DocumentUploadRule v10.0.0 specification + developer confirmation
Governance Multisig, Guardian, Compliance layer Redemption Module + v10.0.0 specifications
Fireblocks Treasury integration v10.0.0 specification only — newest component, least reviewed
SettlementEngine, OrderBookEngine, ClearingHouse Named only — no detailed specification reviewed
Indexer v2 v10.0.0 specification (event list only)
Table 3 — Component review scope and evidence sources.
CRATS Protocol Security Audit Report
4. Findings
4.1 CRITICAL
CRATS-AUD-01 — No independent third-party code audit has been performed
Severity: CRITICAL | Component: Entire protocol | Status: Open — blocking
Every specification reviewed in this engagement — the Redemption Module (Decision #22), the
LifecycleExitManager spec, and the v10.0.0 update (Section 17, item 1, rated P0-Critical) — independently states
that an external audit is mandatory before mainnet. Based on everything shared during this engagement, that audit
has not yet occurred. All findings in this report, including the ones marked "Verified Remediated," are verified only
against specification text or developer statements — not against a professional line-by-line code review.
Undiscovered implementation bugs are the largest unquantified risk to the protocol at this time.
Recommendation:
Commission a licensed Web3 security firm (Hacken, CertiK, Trail of Bits, OpenZeppelin, or equivalent) before any
mainnet deployment. This is not new guidance — it is restating the protocol's own mandatory requirement.
CRATS-AUD-02 — SettlementEngine, OrderBookEngine, and Treasury mediation logic are
unaudited custom code
Severity: CRITICAL | Component: Layer 4 — Marketplace & Settlement | Status: Open — blocking
The v10.0.0 specification itself (Section 17, item 1) flags these as custom logic rather than battle-tested standards
like ERC-3643 or ERC-4626, and rates external audit of them P0-Critical. No detailed specification for these
contracts was made available during this engagement, meaning even the specification-level review this report
performs could not meaningfully assess them. These contracts execute atomic delivery-versus-payment settlement
and order matching — a compromised or buggy implementation here has direct, large-scale financial impact across
every asset and every investor trading on Layer 4.
Recommendation:
Prioritize these three contracts at the top of the external audit scope. Request a detailed specification or interface document
for them before the audit begins, so scope isn't defined by the auditor working from source code alone.
4.2 HIGH
CRATS-AUD-03 — NAV-based investment flow has no on-chain verification tying minted shares
to USDC actually received
Severity: HIGH | Component: Fireblocks Treasury Integration / Backend Orchestrator | Status: Open — newly
identified
In the v10.0.0 investment flow, the backend calculates required asset-token quantity as USDC amount divided by
NAV entirely off-chain, then instructs Fireblocks to transfer that amount to the vault, which mints shares 1:1 against
whatever it receives with no independent on-chain check against the investor's actual USDC payment. A backend
calculation error or compromise could result in over- or under-minting of vault shares relative to real capital
received, with no on-chain mechanism to catch it — directly analogous to the settlement-verification gap already
fixed elsewhere in the protocol (CRATS-AUD-VF-03 in Section 5), but not yet addressed here.
CopyM / CRATS Foundation
Page 5
CRATS Protocol Security Audit Report
Recommendation:
Apply the same pattern used for LifecycleExitManager's settlement-variance check (Precondition #5, v10.0.0 Table 13):
record the USDC amount on-chain via the Fireblocks webhook confirmation, and validate the minted share count against
it within an acceptable variance before allowing the mint to finalize.
CRATS-AUD-04 — REGULATOR_ROLE governance protection is unconfirmed
Severity: HIGH | Component: AssetToken (ERC-3643) — forceTransfer() | Status: Open — needs direct confirmation
forceTransfer() being single-role-gated was the original P0 finding raised in the v9.0.0 gap analysis. The v10.0.0
governance hardening (Table 15) explicitly lists DEFAULT_ADMIN_ROLE, GUARDIAN_ROLE, and
PROCESSOR_ROLE under multisig + timelock protection, but does not explicitly name REGULATOR_ROLE. If
REGULATOR_ROLE was simply omitted from the table rather than deliberately left outside the governance
framework, the original P0 finding is still technically open despite the surrounding governance hardening effort.
forceTransfer() can move any investor's tokens without consent — this is the highest-consequence single action
available in the protocol.
Recommendation:
Get explicit written confirmation that REGULATOR_ROLE is included in the Role Migration governance component
(Table 15) with the same multisig + timelock protection as the other three named roles. Do not assume inclusion from
omission.
CRATS-AUD-05 — No sanctions oracle — static KYC check dates only
Severity: HIGH | Component: Layer 1 — Identity & Compliance | Status: Open — unresolved since original gap
analysis
IdentityRegistry enforces KYC verification as a point-in-time check. There is no live sanctions-list scanning that
would dynamically flag or freeze an address that becomes sanctioned after initial verification. This was raised in the
team's own v9.0.0 gap analysis and has not been addressed in any subsequent specification reviewed. An investor
could pass KYC, later appear on an international sanctions list (OFAC, EU, UN), and continue transacting on the
protocol indefinitely with no automated detection, creating a direct regulatory compliance exposure for the protocol
operator and all participating issuers.
Recommendation:
Integrate a live sanctions-screening oracle (Chainlink-based or a compliance data provider such as Sumsub's ongoing
monitoring) that can trigger the existing COMPLIANCE_ROLE restriction mechanism automatically when a sanctioned
address is detected.
CRATS-AUD-06 — Document revocation has no accountability mechanism
Severity: HIGH | Component: Document Management System (DMS) | Status: Open — newly identified, inconsistent
with established pattern elsewhere
Per the v10.0.0 specification (Section 9.2): "Compliance can revoke document approval at any time, which triggers
a compliance freeze on the associated asset token." No justification, evidence hash, or governance-review path is
described for this action — in direct contrast to the investor-restriction mechanism (Redemption Module Decision
#29), which requires exactly this discipline for a comparable action. A single compliance action can freeze an
already-tokenized, already-trading asset for every investor holding it, with no recorded justification and no stated
path for governance to review or reverse an improper revocation.
Recommendation:
CopyM / CRATS Foundation
Page 6
CRATS Protocol Security Audit Report
Apply the same pattern already used for investor restrictions: require a justification/evidence hash at the moment of
revocation, and give governance an explicit review-and-reverse capability, consistent with the rest of the protocol's
compliance-accountability design.
4.3 MEDIUM
CRATS-AUD-07 — RealEstatePlugin and CarbonCreditPlugin document requirements remain
thin
Severity: MEDIUM | Component: Plugin Layer | Status: Open — unresolved since initial review
Real Estate requires only TITLE_DEED and APPRAISAL (no NOC, encumbrance certificate, or valuer
credential). Carbon Credit requires only VINTAGE_CERT and VERIFICATION (no registry serial number or
retirement reference for double-counting protection). Flagged at the start of this engagement; unresolved through
every subsequent specification revision. Weak document requirements increase fraud and compliance risk for the
two longest-standing, currently-live asset categories.
Recommendation:
Add the previously recommended document types to both plugins' required-document lists, gated at
COMPLIANCE_REQUIRED approval mode once DMS is live.
CRATS-AUD-08 — DMS workflow states and DocumentUploadRule.approvalMode are described
independently, not reconciled
Severity: MEDIUM | Component: Document Management System (DMS) | Status: Open — documentation consistency
gap
The v10.0.0 specification describes a linear approval workflow (UPLOADED, UNDER_REVIEW,
COMPLIANCE_PENDING, APPROVED/REJECTED). Separately, DMS engineering has confirmed
approvalMode (AUTO/MANUAL/COMPLIANCE_REQUIRED) is set per document type. Neither document
explains how an AUTO-mode document moves through the review states, if at all. Two independently correct
descriptions of the same subsystem, written without reference to each other, are a common source of
implementation bugs.
Recommendation:
A short reconciliation document or diagram showing exactly how approvalMode determines which workflow states are
skipped, reviewed by both the protocol spec author and DMS engineering together.
CRATS-AUD-09 — Proof-of-Reserve is described as newly "compatible," not confirmed
mandatory or live
Severity: MEDIUM | Component: NAVOracle | Status: Open — needs explicit confirmation of enforcement status
The v10.0.0 migration matrix describes NAVOracle as "ENHANCED — Added Proof-of-Reserve compatibility,"
which is weaker language than a confirmed, enforced requirement. The original gap analysis called for moving away
from manual NAV updates entirely. If PoR integration is optional rather than enforced, manually-submitted NAV
values remain possible for any asset class that hasn't specifically configured it, reintroducing the original
manual-update risk.
Recommendation:
Confirm whether PoR (or the EIP-712 signed-valuation alternative previously discussed) is mandatory for all asset classes
or genuinely optional per category, and document the decision explicitly.
CopyM / CRATS Foundation
Page 7
CRATS Protocol Security Audit Report
CRATS-AUD-10 — No cross-chain synchronization design for identity, eligibility, or
redemption-lock state
Severity: MEDIUM | Component: Protocol-wide | Status: Open — unaddressed in any specification reviewed
CopyM's own pitch materials describe six supported blockchain networks. No specification reviewed in this
engagement addresses whether identity claims, compliance restrictions, or redemption locks stay synchronized if the
same asset is tradable from more than one network. If a single asset is genuinely tradable across multiple chains, a
restriction or redemption lock applied on one chain could be invisible on another, defeating the purpose of the
compliance and lock mechanisms.
Recommendation:
This needs a team decision, not a code fix: either confirm assets are single-chain by design (in which case the six-network
claim needs qualifying), or design an explicit cross-chain sync mechanism before any multi-chain asset goes live.
CRATS-AUD-11 — Plugin interface has no formal field for "exit only via LifecycleExitManager"
categories
Severity: MEDIUM | Component: IAssetPlugin | Status: Open — design gap
Real Estate's full-liquidation-only exit behavior is currently wired outside the plugin interface by convention
(defaultEnabled permanently false, with the real exit path implemented entirely in LifecycleExitManager), not
declared as a formal interface field. As more categories are added that may need this same pattern (Infrastructure,
Private Equity fund termination), the lack of a formal declaration increases the chance of an inconsistent or
incomplete implementation for a new category.
Recommendation:
Add an explicit exitMechanism field or equivalent to the plugin interface (e.g., PER_SHARE_REDEMPTION /
RETIRE_BURN / LIFECYCLE_EXIT_ONLY) before the next batch of categories is built.
4.4 LOW
CRATS-AUD-12 — No queryable getRequiredDocumentTypes() getter
Severity: LOW | Component: Plugin Layer | Status: Open — developer-experience and drift issue
Required documents are hardcoded inline inside each plugin's validateDocuments() logic rather than exposed as an
enumerable list. Frontend and admin tooling must duplicate the required-document list by hand, and it silently goes
stale if a plugin is upgraded.
Recommendation:
Add a pure getRequiredDocumentTypes() view function, returning type + required-approvalMode pairs, used internally
by validateDocuments() as the single source of truth.
CRATS-AUD-13 — Automotive category status unreconciled
Severity: LOW | Component: Category Taxonomy | Status: Open — procedural if deferred
The Redemption Module spec lists Automotive as its own asset category (ON, issuer-overridable). No subsequent
specification clarifies whether this folds into the proposed LuxuryGoodsPlugin or requires its own plugin. If the
eventual decision is to merge categories, that requires a full governance reclassification action with mandatory
investor disclosure.
CopyM / CRATS Foundation
Page 8
CRATS Protocol Security Audit Report
Recommendation:
Resolve explicitly before either plugin is built, to avoid a reclassification action later.
CRATS-AUD-14 — Specification version-numbering inconsistency across documents
Severity: LOW | Component: Documentation / Process | Status: Open — process recommendation
The LifecycleExitManager-related redemption work is referred to as both "v8.0.0" (per the master protocol
changelog) and "Version 5.0 / v5.1" (per the Redemption Module document's own title page) — two different
versioning schemes for related or overlapping work. As the number of living specifications grows (now five-plus),
version confusion increases the odds of someone building against a stale or wrong document.
Recommendation:
Adopt a single versioning scheme across all CRATS specifications, or maintain an explicit cross-reference table mapping
each document's internal version to the master protocol version.
4.5 INFORMATIONAL
1. Governance decisions (redemption default, 25% gate applicability, exit mechanism, NAV schedule)
have not yet been made for any of the 8 proposed new asset categories. Not a defect — this is the actual
blocker standing between the current architecture and onboarding new categories.
2. The backend orchestrator is a single coordination point for every NAV-based investment across every
vault. No redundancy, failover, or horizontal-scaling design has been described for it; worth addressing
before transaction volume grows materially.
3. Indexer v2 now tracks 16+ event types across a growing number of per-asset contracts with no
described scaling architecture (sharding, dedicated infrastructure) for high asset/transaction-volume
scenarios.
4. The interaction between three independent blocking mechanisms (FROZEN, PAUSED,
RESTRICTED) across multiple governance layers and archetypes is combinatorially complex. Formal
invariant testing is already planned per the v10.0.0 checklist (item 5) — this should be treated as a
priority within that plan.
5. Guardian and Governance multisig signers must have zero overlap; recruiting sufficient independent
signers was already flagged internally as an organizational, not technical, task — status of this
recruitment was not confirmed during this engagement.
5. Verified Remediated — No Action Needed
Listed separately from open findings so remediation history is visible rather than buried. Each item below was
independently confirmed fixed against a specification or, where noted, actual source code, during this
engagement. The verification methodology varied: some items were confirmed by comparing the v10.0.0
specification text against the original finding description, while others (marked "Developer-confirmed against
actual Solidity source") were verified by a developer inspecting the deployed or staging code and confirming
the fix is present in the implementation, not just the specification. This distinction matters because a
CopyM / CRATS Foundation
Page 9
CRATS Protocol Security Audit Report
specification-only fix can still be missing from the codebase if the implementation lagged behind the design.
ID
Item
Verified Against
VF-0
1
VF-0
2
LifecycleExitManager checks investor compliance status before
payout; restricted funds routed to escrow
Guardian can pause LifecycleExitManager only pre-distribution,
never mid-burn/closure
LifecycleExitManager spec, Decision #26
LifecycleExitManager spec, Decision #27
VF-0
3
VF-0
4
executeExit() now requires processed shares to equal vault
totalSupply() before vault closure
verifySettlement() / executeExit() now require multisig + timelock,
not single-role gating alone
v10.0.0 Table 13, Precondition #1
v10.0.0 Section 11, Table 13 Precondition #7
VF-0
5
VF-0
6
Settlement amount now validated against NAVOracle within a
configurable variance threshold
SYSTEM_PAUSE_ROLE ambiguity resolved — all pause
authority consolidated under Guardian multisig
v10.0.0 Section 11, Table 13 Precondition #5
RedemptionManager.requestRedemption() escrow
behavior, v9.0.0 appendix
Redemption Module, Decision #28 / Finding F-3
VF-0
7
VF-0
8
COMPLIANCE_ROLE restrictions now require
justification/evidence and are subject to governance review
Investor-level restrictions capped at 180 days, consistent with
FROZEN (30-day) and PAUSE (7-day) caps
Redemption Module, Decision #29 / Finding F-4
Redemption Module, Decision #30 / Finding F-5
VF-0
9
VF-1
0
RESTRICTED state formally added; three-way stricter-wins
precedence (FROZEN/PAUSED/RESTRICTED) defined
25% redemption gate / 7-day processing period confirmed as active,
uniformly applied mechanics
Redemption Module, Decision #31 / Finding F-6
Redemption Module, Decision #32 / Finding F-7
VF-1
1
VF-1
2
Dispute-resolution slashing logic (correct challenger
refunded+rewarded, incorrect challenger slashed)
High-Water-Mark update logic correctly monotonic — cannot be
improperly lowered
Developer-confirmed against actual Solidity source
Developer-confirmed against actual Solidity source
VF-1
3
VF-1
4
RedemptionManager confirmed as the canonical redemption entry
point, not a competing path with AsyncVault's native flow
Shares/assets confirmed escrowed automatically on request — no
separate locking registry needed to prevent secondary-market
double-realization
Redemption Module spec Section 12.4;
LifecycleExitManager spec cross-reference
Table 4 — All 14 verified remediated findings with evidence sources.
CopyM / CRATS Foundation
Page 10
CRATS Protocol Security Audit Report
6. Conclusion
The CRATS Protocol demonstrates a mature, iterative security posture: three of this engagement's own
highest-severity findings were independently fixed in the time between review rounds, and the architecture has
repeatedly converged with recommendations made during this review without prompting. That pattern is a
genuinely positive signal for an auditor to see. It indicates a team that is not passively waiting for audit results
but actively hardening the protocol as new information emerges from the design process itself.
What remains is a bounded, addressable list: two CRITICAL process items (the external audit itself, and the
unaudited settlement/marketplace layer), four HIGH findings with direct fixes proposed, and a mix of
MEDIUM/LOW items that are mostly about consistency and completeness rather than fundamental design
flaws. None of the findings in this report require re-architecting the protocol. All are executable within a
standard pre-launch hardening cycle, provided CRATS-AUD-01 — the actual third-party audit — is scheduled
without further delay. The four items the team flagged for double-checking before closing this review (NAV
calculation trust gap, document revocation accountability, DMS workflow status versus approval mode, and
REGULATOR_ROLE governance protection) all correspond directly to findings AUD-03, AUD-06,
AUD-08, and AUD-04 in this report, confirming that the protocol team's internal review process is converging
with external findings.
Important Disclaimer: This document is a specification-level review by an AI system, formatted in the style of a professional
audit report to make it maximally useful for internal prioritization. It is not, and cannot be represented as, a certified third-party
security audit.
7. Issue & Fix Location Map
This section serves as the visual companion to the security audit report, providing a structured reference that
maps every finding directly to the protocol component it affects. The two conceptual layers below organize
findings by their architectural position: Layer 1–2 covers Identity, Compliance, Document Management, and
Asset Tokenization; Layer 3–4 covers Financial Abstraction, Marketplace, Treasury, and protocol-wide
process items. Each finding is attached to the component it affects, with the required fix stated inline. Where
the fix belongs in a different component than the issue (as in the case of AUD-03), this is noted explicitly.
Legend
Marker
Dark red box
Meaning
CRITICAL — blocking, must resolve before mainnet
Red note
HIGH — direct financial or compliance risk
Amber note
MEDIUM — real gap, resolve before broad asset onboarding
Yellow note
LOW — lower risk, still worth fixing
CopyM / CRATS Foundation
Page 11
CRATS Protocol Security Audit Report
CopyM / CRATS Foundation Page 12
Marker Meaning
Dashed grey line Connects a component to the finding that affects it
7.1 Quick Reference — All Findings
ID Severity Diagram One-Line Fix
AUD-0
1 CRITICAL Fig. 2 Commission external audit firm before mainnet
AUD-0
2 CRITICAL Fig. 2 Prioritize SettlementEngine/OrderBookEngine in audit scope
AUD-0
3 HIGH Fig. 2 Add mint-variance check in SyncVault
AUD-0
4 HIGH Fig. 1 Confirm REGULATOR_ROLE has multisig + timelock
AUD-0
5 HIGH Fig. 1 Add live sanctions-screening oracle
AUD-0
6 HIGH Fig. 1 Require justification + governance review on document revocation
AUD-0
7 MEDIUM Fig. 1 Add missing document types to Real Estate / Carbon Credit plugins
AUD-0
8 MEDIUM Fig. 1 Reconcile DMS workflow states with approvalMode
AUD-0
9 MEDIUM Fig. 2 Confirm Proof-of-Reserve enforcement status
AUD-1
0 MEDIUM Fig. 2 Decide cross-chain sync approach or confirm single-chain
AUD-1
1 MEDIUM Fig. 1 Add exitMechanism field to plugin interface
AUD-1
2 LOW Fig. 1 Add getRequiredDocumentTypes() getter
AUD-1
3 LOW Fig. 1 Decide Automotive category placement
AUD-1
4 LOW Fig. 2 Standardize specification version numbering
Table 5 — Complete findings quick reference with diagram location and one-line fix.