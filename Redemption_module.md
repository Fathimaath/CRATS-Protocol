PROTOCOL SPECIFICATION
Version 5.0
CRATS Protocol
Redemption
Module
A standardized, institutional-grade redemption
framework for Real-World Assets. Defines asset
aware policies, governance controls, and investor
protection mechanisms across all supported asset
classes.
Real-World Asset Tokenization Protocol
Specification Document
CRATS FOUNDATION
CRATS Protocol Redemption Module Specification Page 1
Table of Contents
5 1. Introduction
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 5 1.1 Purpose
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 5 1.2 Objectives
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 5 Standardized Redemption
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 5 Asset-Aware Policies
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 5 Institutional Governance
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 6 Investor Protection
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 6 Regulatory Compliance
6 2. Design Principles
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 6 2.1 Separation of Responsibilities
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 7 2.2 Asset-Aware Redemption
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 8 2.3 Fail-Closed Architecture
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 8 2.4 Fail-Safe and Onboarding Principles
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 8 2.5 New and Unregistered Category Handling
9 3. Master Decision Log
11 4. Redemption Policy Model
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 11 4.1 Layer 1: Platform Default Policy
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 12 4.2 Layer 2: Issuer Configuration
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 13 Issuer Override Matrix
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 13 RedemptionPolicy Structure
14 5. Asset Redemption Matrix
15 6. Institutional Redemption Workflows
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 15 6.1 Fine Art
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 15 6.2 Commodities
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 15 6.3 Carbon Credits
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 15 6.4 Real Estate
16 7. LifecycleExitManager
CRATS Protocol Redemption Module Specification Page 2
17 8. Investor Restrictions (Layer 2 - AssetToken)
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 17 8.1 Trigger Authority and Activation
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 17 8.2 Holder Restriction
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 18 8.3 Pending Redemption Handling
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 18 8.4 Time-Based Restrictions
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 18 8.5 Restriction Removal and Governance Review
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 19 8.6 Asset Pause vs Holder Restriction
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 19 8.7 Transfer Validation
19 9. Governance Model
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 20 9.1 Governance Responsibilities
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 20 9.2 Governance and Access Control Summary
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 21 9.3 Governance In-Place Override for Minted Assets
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 21 9.4 Timelock
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 22 9.5 Guardian Model
22 10. Emergency Response Model
22 11. Redemption Request Lifecycle
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 23 11.1 State Definitions
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 23 11.2 Standard Flow
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 24 11.3 Cancellation and Expiration
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 24 11.4 Frozen Flow and Three-Way Precedence
24 12. Smart Contract Architecture
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 24 12.1 IAssetPlugin
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 25 12.2 Asset Registry
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 25 12.3 AssetFactory
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 25 12.4 RedemptionManager
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 25 12.5 SyncVault
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 25 12.6 AsyncVault
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 26 12.7 LifecycleExitManager
26 13. Contract Interaction Flow
CRATS Protocol Redemption Module Specification Page 3
26 14. Events
27 15. Internal Security Audit
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 27 15.1 High Severity
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 28 15.2 Medium Severity
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 29 15.3 Low Severity
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 29 15.4 Informational
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 30 15.5 Organizational Action Item
30 16. Security Considerations
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 30 16.1 Fail-Closed Validation
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 30 16.2 Separation of Responsibilities
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 31 16.3 Immutable Asset Configuration
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 31 16.4 On-Chain Transparency and Override Prohibition
31 17. Testing Requirements
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 31 17.1 Core Behavior
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 31 17.2 Fail-Safe and Onboarding
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 32 17.3 Governance Enforcement
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 32 17.4 Compliance and Investor Restrictions
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 32 17.5 Emergency Response
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 32 17.6 Edge Cases
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 32 17.7 LifecycleExitManager Compliance and Emergency Stop
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 33 17.8 Compliance Restriction Accountability
33 18. Backend Integration
33 19. Frontend Integration
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 33 19.1 Investor Portal
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 34 19.2 Issuer Portal
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 34 19.3 Administrator Portal
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 34 19.4 Compliance Dashboard
34 20. Blockchain Indexer Integration
34 21. Files to Modify
CRATS Protocol Redemption Module Specification Page 4
35 22. Implementation Guide
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 35 22.1 Pre-Implementation Checklist
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 36 22.2 Deployment Sequence
36 23. Open Items for Future Phases
37 24. Addendum: v5.1 Findings and Remediation
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 37 24.1 Purpose and Scope
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 37 24.2 Findings Summary
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 38 24.3 High Severity Findings
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 38 F-1: LifecycleExitManager Compliance Check
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 38 F-2: LifecycleExitManager Emergency Stop
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 38 F-3: Pause Authority Consolidation
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 39 F-4: Compliance Restriction Accountability
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 39 24.4 Medium Severity Findings
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 39 F-5: Investor Restriction Duration Cap
 .  .  .  .  .  .  .  .  .  .  .  .  .  . 39 F-6: RESTRICTED State and Three-Way Precedence
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 39 F-7: Redemption Gate Mechanic Status
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 40 24.5 Documentation Findings
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 40 24.6 Master Decision Log Additions
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 41 24.7 Additional Files and Tests
 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  . 41 24.8 Summary
41 25. Conclusion
1. Introduction
1.1 Purpose
The CRATS Redemption Module defines the standardized framework for investor redemption and asset exit
across all supported Real-World Assets (RWAs) within the CRATS Protocol. The module provides a secure,
governance-controlled, and asset-aware redemption architecture while allowing each asset class to implement
redemption policies appropriate for its underlying real-world asset.
Rather than enforcing a single redemption process for every asset, the protocol delegates redemption eligibility
to a two-layer policy model: Platform Defaults defined by Asset Plugins, and Issuer Configuration stored in
the Asset Registry before minting. The final redemption decision for any given asset instance is stored
immutably after minting, ensuring that investors have permanent certainty about the terms of their holdings.
The module integrates with the following protocol components: Asset Plugins, AssetFactory, Asset Registry,
SyncVault, AsyncVault, RedemptionManager, LifecycleExitManager, Governance, Compliance, and
AssetToken. Each component performs a single, well-defined responsibility, ensuring modularity, testability,
and upgradeability without cross-cutting dependencies.
1.2 Objectives
The Redemption Module is designed to achieve several critical goals that span investor protection, institutional
governance, and regulatory compliance. These objectives collectively ensure that the protocol meets the
standards expected by institutional participants in the real-world asset tokenization space.
Standardized Redemption
The module provides a single redemption framework that supports multiple asset classes without embedding
asset-specific logic inside the RedemptionManager contract. This separation of concerns allows new asset
types to be added to the protocol without modifying the core redemption logic, reducing the risk of
introducing bugs or security vulnerabilities when the protocol expands to support additional real-world asset
categories.
Asset-Aware Policies
Every asset category defines its own redemption behavior through the Asset Plugin architecture. Fine Art,
Commodities, Luxury Goods, Carbon Credits, Real Estate, and future asset classes each have distinct exit
characteristics captured in their respective plugins. The two-layer policy model ensures that platform-level
defaults are respected while permitting issuer-level configuration within governed boundaries before minting.
Institutional Governance
All redemption operations are protected through a multi-layer governance model that includes multisig
governance execution, timelock delays for transparency, emergency guardian capabilities for rapid incident
response, and a complete audit trail. This governance structure ensures that no single party can unilaterally
modify redemption policies, and that all changes are subject to appropriate review periods before taking
Page 5
CRATS Protocol Redemption Module Specification
effect.
Investor Protection
The module ensures deterministic settlement processes, transparent request lifecycles with clearly defined
states, fair queue processing for asynchronous redemptions, and governance oversight at every critical decision
point. Investors can track their redemption requests through a well-defined state machine that progresses from
PENDING through READY to CLAIMED, with intermediate states for FROZEN and CANCELLED
requests when governance intervention is required.
Regulatory Compliance
The protocol supports compliance review processes, emergency pause capabilities, investor-level restrictions
that do not affect unrelated holders, and comprehensive audit requirements. The compliance architecture is
designed to satisfy the regulatory expectations of institutional participants while minimizing disruption to
ordinary investor operations, following the principle that individual compliance actions should not affect the
broader investor base.
2. Design Principles
The Redemption Module follows several foundational architectural principles that ensure the system remains
secure, modular, and maintainable as the protocol grows to support additional asset types and redemption
scenarios.
2.1 Separation of Responsibilities
Each protocol component has a single, well-defined responsibility. The Asset Plugin defines the platform
redemption policy, the Asset Registry stores the final issuer redemption configuration, the
RedemptionManager processes redemption requests, the SyncVault handles immediate redemptions, the
AsyncVault manages queue-based redemptions, the LifecycleExitManager manages full asset liquidation, the
Governance contract handles policy changes, and the AssetToken enforces investor ownership and transfer
restrictions. No business logic is duplicated across components, which means that a bug in the
RedemptionManager cannot affect the compliance enforcement logic in AssetToken, and a change to the
governance structure does not require modifications to the vault settlement logic.
Component
Responsibility
Asset Plugin
Asset Registry
Defines platform redemption policy
Stores final issuer redemption configuration
RedemptionManager
Processes redemption requests
SyncVault
Immediate redemption settlement
Page 6
CRATS Protocol Redemption Module Specification
AsyncVault
LifecycleExitManager
Queue-based redemption settlement
Full asset liquidation (separate module)
Governance
AssetToken
Policy changes via multisig + timelock
Investor ownership and holder restrictions
Table 1: Component Responsibility Separation
2.2 Asset-Aware Redemption
Different asset classes require fundamentally different redemption policies. A fine art painting can be
physically delivered to an investor who redeems their shares, while a carbon credit certificate can only be
retired from circulation. The RedemptionManager never determines whether an asset is redeemable; instead, it
resolves the asset instance configuration from the Asset Registry, which was set atomically during asset
creation from the plugin default and issuer choice. This architecture ensures that the RedemptionManager
remains a generic, auditable contract while asset-specific business logic lives exclusively in the plugins and the
immutable registry where it belongs.
Asset
Redemption
Fine Art
Commodities
Supported
Supported
Luxury Goods
Carbon Credits
Supported
Disabled
Real Estate
Lifecycle Exit Only
Table 2: Asset Class Redemption Support
Page 7
CRATS Protocol Redemption Module Specification
Figure 1: Redemption Eligibility Resolution Flow
2.3 Fail-Closed Architecture
Every resolution in the redemption pipeline must succeed. The system follows a strict fail-closed design where
the resolution chain proceeds through the Vault, the Asset Token, the Asset Category, the Plugin, the Asset
Registry configuration, and finally the RedemptionPolicy check. Failure at any point in this chain immediately
reverts the entire transaction. There is no default behavior that allows a redemption to proceed if any
component in the resolution chain cannot confirm the asset is eligible. This design philosophy ensures that the
protocol never accidentally processes a redemption for an asset that should not be redeemed.
2.4 Fail-Safe and Onboarding Principles
Every resolution step (asset, category, plugin, asset registry configuration) fails closed on any ambiguity. New
asset categories carry no default: they are unusable until a redemption policy is set in the same atomic
transaction as registration, eliminating any undefined-state window. Category reclassification is disallowed
silently; it requires the same governance rigor as onboarding a new category, including a governance in-place
override with investor disclosure. These principles ensure that the protocol can never enter an ambiguous or
inconsistent state during asset onboarding or reclassification.
2.5 New and Unregistered Category Handling
The protocol enforces strict handling for asset categories that have not been formally registered through the
governance process. An unregistered category is any asset type that does not have a corresponding entry in the
AssetFactory's category-to-plugin mapping. This includes entirely new asset types that have never been
proposed, as well as categories that may have been proposed but not yet approved and registered through the
governance workflow.
When the RedemptionManager encounters an asset whose category is unregistered, the resolution chain fails
immediately at the category-lookup step. The plugin address resolves to zero, the redemptionPolicy() call
Page 8
CRATS Protocol Redemption Module Specification
reverts, and the entire transaction reverts with no partial state changes. There is no fallback behavior, no
default policy, and no grace period. The asset is effectively non-functional for redemption purposes until its
category is properly registered.
Registration of a new category follows a governed, atomic process. The Governance Multisig must approve the
category registration, assign a plugin contract, and define the redemption policy (defaultEnabled,
issuerCanOverride) in a single transaction. This atomicity guarantees that no category can exist in the protocol
without a fully defined redemption behavior. The AssetCategoryRegistered event is emitted on-chain,
providing an immutable record of when the category became active and what its initial policy was.
Once a category is registered, assets of that type can be created by issuers following the standard two-layer
policy workflow. However, the plugin contract for a new category is itself subject to the same governance
protections as all other plugins: the plugin must be deployed, audited, and registered through the
AssetFactory.setPlugin() function, which requires multisig approval and timelock. This layered governance
ensures that even the addition of entirely new asset types cannot bypass the protocol's security and
transparency requirements.
Attempting to create an asset with an unregistered category, or attempting to redeem an asset whose category
mapping has been removed, results in an immediate revert. The fail-closed design means that the protocol
never guesses or infers the behavior of an unknown category; it simply refuses to proceed. This approach
protects investors from assets that have not been properly vetted and configured through the governance
process, and it ensures that every asset category in the protocol carries the full weight of governance review,
audit, and transparency.
3. Master Decision Log
The following decisions represent the final, resolved design choices for the Redemption Module. Each
decision was made during the design review process and has been incorporated into this specification. This log
serves as the authoritative reference for resolving any ambiguity in the design intent. All decisions are
considered locked unless explicitly superseded by a future revision of this document.
#
Area
Decision
1
2
Carbon Credit
model
Real Estate model
RedemptionPolicy defaultEnabled = false. Uses retire()/burn() only, never RedemptionManager or
direct vault redemption.
Storage-backed per plugin instance, updatable only via governance path. Allows post-deployment
configurability for platform defaults.
defaultEnabled = false everywhere (RedemptionManager + vaults). Full-property exit handled by
LifecycleExitManager (separate module).
3
4
Unresolvable
plugin/category
RedemptionPolicy
type
Fail closed: transaction reverts. Redemption never proceeds by default.
Page 9
CRATS Protocol Redemption Module Specification
CRATS Protocol Redemption Module Specification Page 10
5 Governance:
redemption toggle
Platform default (Multisig + 48-72hr timelock) governs future assets. Already-minted asset
configuration is immutable to the issuer; governance may perform an in-place override via Multisig +
Timelock + Investor Notification + On-chain Events.
6
Governance:
AssetFactory
address
Same protection as #5: multisig + timelock. Affects plugin resolution for all asset types.
7 Event logging Detailed: old value, new value, timestamp, proposer, executor, on both governed settings.
8 Test coverage Full: core cases, governance enforcement, fail-closed paths, edge cases (mid-queue toggle, expired
timelock, replay attempts).
9 New category
onboarding
No default value. Category registration and redemption policy set atomically in one transaction: no
undefined-state window.
1
0 Emergency pause Pause-only (cannot move funds/change ownership). Granular per category. Triggered by guardian
multisig (2-of-3 or 3-of-5), disjoint from governance.
1
1
Emergency
un-pause
Guardian may unpause instantly for false alarms with recorded justification. Real fixes require full
governance (multisig + timelock).
1
2
Mid-flight
handling
FROZEN state added. In-flight requests when policy is toggled off are frozen, pending explicit
governance resolution.
1
3
Pre-implementatio
n audit Audit current production state before deployment to identify live categories requiring policy backfill.
1
4
Backend/on-chain
sync Backend pre-checks are UX convenience only. On-chain require() is sole source of truth.
1
5
Investor
notification Pending timelocked changes surfaced via indexed events plus dashboard banner during delay window.
1
6
Plugin upgrade
governance
Plugin upgrades require same or stronger governance as policy toggle, preventing bypass via silent
implementation upgrade.
1
7
False-alarm
accountability
Guardian must record justification when classifying pause as false alarm. Governance may challenge or
override.
1
8
FROZEN state
scope
Applies to RedemptionManager queued requests and AsyncVault in-flight requests (requestRedeem
called but fulfillRedeem not yet executed).
1
9
Fee handling on
frozen/cancelled
Redemption-request fee fully refunded on governance cancellation. Underlying position untouched by
freeze.
2
0
Category
reclassification
Silent reclassification disallowed. Requires governance in-place override with investor disclosure, same
rigor as new onboarding (#9).
2
1
Guardian/governa
nce separation Zero overlapping signer addresses between guardian and governance multisigs.
2
2 Security audit Independent third-party security audit is mandatory before mainnet deployment.
CRATS Protocol Redemption Module Specification Page 11
2
3
FROZEN and
PAUSED
interaction
Stricter-wins: both must independently clear. No auto-resolution while either condition remains active.
2
4
Timelock request
throttle
Throttle applies only to restrictive changes (true to false) during pending timelock. Never applies to
permissive changes.
2
5
New/unregistered
category handling
Unregistered categories are fully blocked: no redemption, no asset creation, no fallback behavior.
Category registration requires atomic single-tx governance (plugin + policy). Attempting to operate on
an unregistered category reverts immediately with no partial state change.
2
6
LifecycleExitMan
ager compliance
check
Settlement distribution must check each investor's restriction status before payout. Restricted investors'
portions are held in escrow, released automatically upon restriction resolution.
2
7
LifecycleExitMan
ager emergency
stop
Guardian may pause LifecycleExitManager execution only between settlement verification and
distribution. No pause possible once burning/closure begins, preserving atomicity.
2
8
Pause authority
consolidation
All asset-wide and category-level pause authority resides exclusively with the Guardian multisig
(Section 10). No separate SYSTEM_PAUSE_ROLE exists.
2
9
Compliance
restriction
accountability
Applying a restriction requires a recorded justification/evidence hash at activation. Governance may
review and revoke a restriction believed to be applied in error or bad faith, without adding a timelock
to initial application.
3
0
Investor
restriction
duration cap
Maximum restriction duration of 180 days by default. Continuation past this point requires the same
justification-and-review process as initial application.
3
1
RESTRICTED
state and
three-way
precedence
New RESTRICTED state added to the request lifecycle. Stricter-wins rule (Decision #23) extended to
three conditions: FROZEN, PAUSED, and RESTRICTED must all independently clear.
3
2
Redemption gate
mechanic status
The 25% gate / 7-day processing period is confirmed as active RedemptionManager mechanics for all
asset types supporting redemption, applied uniformly, pending explicit confirmation from the
specification authors.
Table 3: Master Decision Log
4. Redemption Policy Model
The protocol separates redemption policy into two independent layers that work together to determine whether
a specific asset instance supports redemption. The final redemption decision belongs to the asset instance
stored in the Asset Registry, not just the plugin default. This two-layer model balances protocol-wide
consistency with the flexibility required by different asset types and issuer preferences, while guaranteeing
immutability after minting.
4.1 Layer 1: Platform Default Policy
Each Asset Plugin defines the platform default redemption behavior for its asset class. For example, the Fine
Art plugin sets defaultEnabled to true, meaning that fine art assets support redemption by default unless the
issuer explicitly opts out. The Carbon Credit plugin sets defaultEnabled to false, reflecting the fact that carbon
credits are retirement instruments that cannot be individually redeemed. These defaults represent the
protocol's recommended redemption policy for each asset class, based on the inherent characteristics of the
underlying real-world asset and the regulatory framework that governs it. Platform defaults may be modified
by governance for future assets only.
Asset Class
Default Redemption
Fine Art
Commodities
ON
ON
Luxury Goods
Carbon Credit
ON
OFF
Real Estate
New / Unregistered
OFF
N/A -- Not usable until atomically registered
Table 4: Platform Default Redemption Policies
4.2 Layer 2: Issuer Configuration
When creating a new asset, the issuer may configure redemption behavior before minting, subject to the rules
defined by the corresponding Asset Plugin. The workflow proceeds through asset creation, asset class
selection, loading the platform default from the plugin, applying issuer configuration if permitted by the
plugin, storing the final asset configuration in the Asset Registry, and then minting the asset. Once the asset is
minted, the issuer configuration becomes immutable to the issuer; the issuer cannot modify it after investors
own shares. However, governance retains the ability to perform an in-place override of the redemption
configuration for an already-minted asset through a governed process: Multisig approval, Timelock delay
(48-72 hours), Investor notification via dashboard banner during the delay window, and On-chain event
emission with full audit details (old value, new value, asset ID, proposer, executor, timestamp). This
mechanism addresses the case where an issuer makes an inadvertent configuration error before minting,
without requiring a disruptive full migration.
Page 12
CRATS Protocol Redemption Module Specification
Figure 2: Two-Layer Redemption Policy Model
Issuer Override Matrix
Asset
Default
Issuer Override
Fine Art
Commodities
ON
ON
Allowed
Allowed
Luxury Goods
Carbon Credits
ON
OFF
Allowed
Not Allowed
Real Estate
New / Unregistered
OFF
N/A
Not Allowed
Not Allowed -- category must be registered first
Table 5: Issuer Override Permissions by Asset Class
RedemptionPolicy Structure
Each Asset Plugin exposes a redemption policy through a standardized interface. The RedemptionPolicy struct
contains two fields: defaultEnabled, which indicates whether redemption is enabled by default for the asset
class, and issuerCanOverride, which indicates whether the issuer is permitted to modify the default during
asset creation. The plugin never stores issuer configuration; it only defines the platform rules that constrain
what the issuer is allowed to configure. The final redemption configuration is stored in the Asset Registry
during asset creation and queried by the RedemptionManager during every redemption request.
struct RedemptionPolicy {
bool defaultEnabled;
Page 13
CRATS Protocol Redemption Module Specification
bool issuerCanOverride;
}
Once the asset is minted, the issuer redemption configuration becomes immutable to the issuer. The issuer
cannot modify it after investors own shares. Subsequent modifications to an already-minted asset's redemption
configuration require a governance-controlled in-place override through multisig and timelock. This override
emits a RedemptionPolicyOverridden event containing the old value, new value, asset ID, executor, and
timestamp, ensuring that every change is fully auditable on-chain. Investors are notified via dashboard banner
during the timelock window. No single admin key can override redemption policy; all overrides require
multisig approval, providing investors with transparency and review time before any policy change takes
effect.
5. Asset Redemption Matrix
The CRATS Protocol supports multiple Real-World Asset classes, each of which defines its redemption
behavior through the two-layer policy model. The following matrix provides a comprehensive overview of
how each supported asset type interacts with the redemption system, showing the platform default, issuer
override permission, whether the asset is eligible for RedemptionManager operations, and the specific exit
mechanism that applies. RedemptionManager remains fully generic across asset types: no per-asset branching.
It resolves the asset's stored configuration and enforces the same mechanics for every asset instance that
returns true.
A special case exists for new or unregistered asset categories. These are categories that have not yet been
registered through the governance process, or whose plugin mapping has not been established in the
AssetFactory. Such categories are explicitly blocked from all redemption operations: they cannot be created as
assets, cannot be redeemed, and cannot bypass the fail-closed resolution chain. The only path to activation is
through the governed, atomic category registration process described in Chapter 2.5, which sets the plugin,
default policy, and issuer override permission in a single transaction.
Asset Type
Platform
Default
Issuer
Override
RedemptionMana
ger
Fine Art
Commodities
ON
ON
Yes
Yes
Supported
Supported
Exit Mechanism
Per-share redemption
Per-share redemption
Luxury Goods
Automotive
ON
ON
Yes
Yes
Supported
Supported
Per-share redemption
Per-share redemption
Carbon Credits
Real Estate
OFF
OFF
No
No
Not Supported
Not Supported
retire() / burn()
LifecycleExitManager
Page 14
CRATS Protocol Redemption Module Specification
Blocked
New /
Unregistered
N/A
N/A
Not usable until atomically registered with plugin +
policy
Table 6: Complete Asset Redemption Matrix
6. Institutional Redemption Workflows
Different Real-World Assets follow different legal and financial exit procedures. The CRATS Protocol
models these differences while maintaining a unified architecture. Each asset type follows the workflow that
best reflects the characteristics of its underlying real-world asset and the regulatory framework governing its
transfer and ownership.
6.1 Fine Art
Fine Art assets may support per-share redemption if enabled during asset creation. The workflow begins when
an investor submits a redemption request, which proceeds through queue validation to ensure the request meets
all eligibility requirements, followed by vault settlement where the underlying asset tokens are burned and the
corresponding settlement is transferred to the investor. If the issuer disables redemption before minting,
investors may exit only through supported secondary market mechanisms, ensuring that the physical artwork is
not fragmented or improperly handled.
6.2 Commodities
Commodities follow the same redemption workflow as Fine Art when redemption is enabled. The investor
submits a redemption request, the settlement is processed, and the investor's shares are burned. Issuers may
disable redemption before minting if they intend the asset to be traded only through secondary markets, which
is a common approach for commodity-backed tokens where the underlying physical commodity is stored in a
centralized warehouse and individual redemption would be logistically impractical.
6.3 Carbon Credits
Carbon Credits do not support investor redemption through the RedemptionManager. Instead, the lifecycle
follows a retirement pattern where the carbon credit is retired from circulation and the associated token is
burned, representing the permanent removal of the carbon credit from the market. This design reflects the
environmental integrity requirements of carbon credit markets, where credits represent verified emissions
reductions that must be retired when claimed, rather than redeemed for their underlying value.
6.4 Real Estate
Real Estate follows a complete asset liquidation lifecycle rather than individual investor redemption. Investors
cannot redeem individual property shares; instead, the property exits as a whole through a process managed by
the LifecycleExitManager (specified separately). The institutional workflow proceeds through property sale,
settlement verification, governance approval, pro-rata distribution calculation, settlement distribution to all
CRATS Protocol Redemption Module Specification
Page 15
investors, burning of vault shares and asset tokens, vault closure, and recording of the ownership transfer. This
approach ensures that real estate assets are handled in accordance with property law requirements, where
fractional ownership interests must be resolved through a single, complete liquidation event.
Figure 3: LifecycleExitManager Execution Flow
7. LifecycleExitManager
LifecycleExitManager is a dedicated protocol component (specified separately from this module) responsible
for managing institutional asset exits. It handles the complete lifecycle of an asset liquidation event, from the
initial settlement verification through to the final vault closure and audit event emission. The contract
performs the entire exit atomically after all required approvals have been completed, ensuring that no partial
state changes can occur if any step in the exit process fails.
Settlement funds must be verified before any investor payout or token burn operation begins. This sequencing
ensures that no distribution or state change occurs unless the underlying settlement is confirmed. The
LifecycleExitManager is responsible for the following operations: verifying settlement evidence provided by
the asset manager, verifying that governance has approved the exit, freezing further asset operations,
calculating each investor's entitlement based on their pro-rata share, executing the pro-rata settlement
distribution, burning all vault shares, burning all asset tokens, marking the vault as CLOSED, and emitting
comprehensive audit events.
Before calculating or distributing pro-rata settlement, the LifecycleExitManager must query each investor's
restriction status via the Compliance layer (Decision #26). If an investor is currently restricted, their portion is
routed to an escrow sub-balance tied to their address rather than distributed directly, and released
automatically once the restriction is lifted or expires. This ensures that the single largest fund-movement event
in an asset's lifecycle does not bypass the compliance protections defined in Chapter 8.
A pausable checkpoint exists between settlement verification and distribution, which the Guardian may trigger
using the existing instant, category-scoped mechanism from Chapter 10 (Decision #27). Once burning and
Page 16
CRATS Protocol Redemption Module Specification
vault closure begin, the transaction remains atomic and cannot be interrupted, consistent with the
no-partial-state guarantee. This ensures that even the highest-value event in the protocol is within reach of the
emergency response model.
No administrative account performs manual token burning. The entire process is executed programmatically
by the contract, ensuring consistency and auditability. The LifecycleExitManager is used only for full asset
liquidation workflows and is never invoked for standard investor redemption requests, which are handled by
the RedemptionManager and vault contracts.
8. Investor Restrictions (Layer 2 - AssetToken)
Investor restrictions are implemented within the AssetToken layer, which means they apply only to specific
investors and never pause the entire asset unless explicitly required by a regulatory or protocol-level event.
This design ensures that compliance actions targeting a single investor do not disrupt the operations of other
investors who hold the same asset. The protocol follows the principle that institutional asset management
platforms should isolate compliance actions to the affected account while allowing all other investors to
continue normal operations.
8.1 Trigger Authority and Activation
Investor-level restrictions are triggered exclusively by accounts holding the COMPLIANCE_ROLE, not by
general administrators or governance accounts. This role separation ensures that compliance actions are
executed by personnel with the appropriate regulatory authority and operational context. Compliance officers,
identified by their COMPLIANCE_ROLE assignment, are the only accounts authorized to restrict a specific
investor's ability to transfer, redeem, withdraw, or trade tokens on the marketplace.
Restrictions take effect immediately upon submission by a compliance officer. There is no timelock,
governance vote, or approval delay for investor-level restrictions, because compliance actions such as AML
freezes, sanctions enforcement, and fraud investigations require immediate effect to be legally effective.
Delaying a compliance restriction could expose the protocol to regulatory liability or allow the restricted
investor to move assets before the restriction takes hold.
Applying a restriction requires a recorded justification or evidence hash as a mandatory parameter on the
restriction transaction (Decision #29). This ensures that every restriction, including its initial activation, carries
a complete on-chain audit trail. Governance retains the ability to review and revoke a restriction it determines
was applied in error or bad faith, mirroring the false-alarm challenge mechanism defined for the Guardian
(Decision #17). This does not add a timelock to the initial application, which must remain instant per the
regulatory rationale above; it adds review after the fact only.
8.2 Holder Restriction
When a compliance officer restricts a specific holder, only that investor is affected. Other investors continue
to operate normally, including transferring tokens, redeeming shares, and trading on the marketplace.
Restricted investors may be prevented from transfers, redemption, withdrawals, and marketplace trading
depending on the nature of the restriction. Restrictions automatically expire when the configured duration ends
Page 17
CRATS Protocol Redemption Module Specification
or when compliance officers remove them manually through the compliance interface.
Each restriction record contains the wallet address of the affected investor, a reason code that describes the
basis for the restriction, the authority (compliance officer address) that imposed the restriction, the start time
and end time of the restriction, the current status of the restriction, and an evidence hash that provides
complete auditability for regulatory actions. This comprehensive record-keeping ensures that every restriction
can be traced back to its original justification and the authority that imposed it.
8.3 Pending Redemption Handling
When a compliance officer restricts an investor who has pending redemption requests, the behavior depends
on the request's current state. A PENDING request submitted by the now-restricted investor is held: it remains
in the PENDING state but cannot advance to READY while the restriction is active, because the
RedemptionManager validates holder restrictions before processing. No settlement occurs, no tokens are
burned, and no funds are transferred. The investor's position remains intact throughout the restriction period.
A READY request that has not yet been claimed is similarly held: the investor cannot call the claim function
while restricted, because the AssetToken transfer validation rejects the operation. Once the compliance
restriction is removed (either by manual removal by a compliance officer or by automatic expiration at the
configured end time), the redemption request resumes its normal lifecycle. PENDING requests proceed
through the standard processing pipeline, and READY requests become claimable again. This design ensures
that compliance actions protect the protocol without destroying in-flight redemption requests.
If a compliance officer determines that a restricted investor's pending redemption should be permanently
cancelled rather than held, the officer may coordinate with governance to cancel the specific request. In this
case, any redemption-request fee is refunded to the investor. The underlying asset position is never at risk
during a restriction; it remains untouched until the restriction resolves or the request is explicitly cancelled.
8.4 Time-Based Restrictions
Restrictions are time-based by default. A compliance officer may freeze a holder for a specified duration,
such as 30 days for an AML review. During this period, the restriction is active and the investor cannot
perform restricted operations. When the duration expires, the restriction is automatically removed and the
investor's access is restored, including the resumption of any held redemption requests. If additional review is
required, compliance officers may extend the restriction before the original duration expires, providing
flexibility for complex investigations.
A default maximum restriction duration of 180 days applies, aligned with typical AML investigation timelines
(Decision #30). Continuing a restriction beyond 180 days requires the same justification-and-review discipline
as the initial restriction, rather than a silent extension. This cap ensures that investor-level restrictions, which
target a specific person rather than an asset class, carry the same duration discipline as FROZEN (30-day cap,
Decision #19) and Guardian PAUSE (7-day cap, Decision #23), preventing indefinite blocking without active
justification.
8.5 Restriction Removal and Governance Review
Restrictions may be removed in three ways: automatic expiration when the configured duration elapses
(including the 180-day maximum), manual removal by a compliance officer at any time before expiration, or
Page 18
CRATS Protocol Redemption Module Specification
governance revocation of a restriction determined to have been applied in error or bad faith (Decision #29). In
all cases, a HolderRestrictionRemoved event is emitted on-chain, recording the investor address, the reason for
removal, and the authority that performed the removal. Manual removal and governance revocation both
require a justification to be recorded. Once removed, all held redemption requests and escrowed distributions
resume normal processing immediately.
Governance revocation does not add a timelock to the restriction removal itself; it functions as a post-hoc
review mechanism. A compliance officer who has a restriction revoked by governance cannot silently reapply
the same restriction without new justification and evidence, ensuring that improper restrictions are not simply
re-implemented to circumvent the review.
8.6 Asset Pause vs Holder Restriction
The protocol distinguishes between protocol-wide asset controls and individual investor restrictions,
implementing two fundamentally different mechanisms for different situations. An asset pause affects the
entire asset, preventing all transfers, trading, and redemption for every investor. A holder restriction affects
only the specific investor targeted by the compliance action, leaving all other investors unaffected. This
distinction is critical for institutional compliance: normal AML or sanctions investigations should use holder
restrictions, not asset pauses, to minimize impact on unaffected investors.
Role
Permission
Scope
GUARDIAN
Emergency pause (all asset-wide and
category-level pause authority)
Per category, instant; 7-day cap with
auto-escalation
COMPLIANCE_ROLE
Restrict specific investor (immediate,
no timelock; requires justification at
activation; subject to governance
revocation)
Single investor only; 180-day max duration
GOVERNANCE
8.7 Transfer Validation
Long-term protocol policy; compliance
restriction review and revocation
Table 7: Access Control Roles
Protocol-wide, with timelock
Before any transfer or redemption, AssetToken validates both the sender and the receiver. If the sender is
restricted, the transfer is rejected. If the receiver is restricted, the transfer is also rejected. This dual-validation
ensures that restricted investors cannot circumvent their restrictions by receiving tokens through alternative
channels. The same validation applies to redemption and marketplace transactions, providing comprehensive
coverage across all token movement scenarios.
9. Governance Model
Page 19
CRATS Protocol Redemption Module Specification
The CRATS Redemption Module uses a multi-layer governance model to protect investor assets and prevent
unauthorized redemption policy changes. Governance is divided into three operational layers: the Governance
Multisig for long-term protocol configuration, the Guardian Multisig for emergency response, and the
Compliance layer for investor-specific restrictions. Each layer operates independently with clearly defined
permissions, ensuring that no single entity can compromise the redemption system. Guardian multisig signers
have zero overlap with governance multisig signers, preserving a genuine separation between the fast-response
path and the deliberate-change path.
Figure 4: Governance and Timelock Flow
9.1 Governance Responsibilities
The Governance Multisig is responsible for protocol-level configuration, including asset plugin registration,
platform default policy changes, in-place overrides of already-minted asset redemption configurations,
AssetFactory updates, plugin upgrades, new asset category registration, and lifecycle approvals. Every
governance action follows the timelock process before execution, providing a mandatory delay during which
investors and operators can review the proposed changes. Governance can modify platform default policies
(affecting future assets only) and can perform in-place overrides of minted asset configurations through the
same multisig and timelock process, with full on-chain event emission and investor notification during the
delay window. No single admin key can override redemption policy; all overrides require multisig approval.
9.2 Governance and Access Control Summary
The following table summarizes every governed setting, the control mechanism, delay, and notes for each
operation within the Redemption Module. This serves as the definitive reference for understanding who can
change what, and under what conditions.
Setting
Control
Delay
Notes
Page 20
CRATS Protocol Redemption Module Specification
Platform default policy
(per plugin)
AssetFactory address
Multisig
Multisig
48-72hr timelock
48-72hr timelock
Affects future assets only; dashboard notice required
Affects plugin resolution for all asset types
New category + policy
Plugin contract
upgrade
Multisig
Multisig
Atomic, single tx
Same or stronger
No undefined-state window
Prevents bypass via implementation swap
Minted asset config
change
Emergency pause
Governance
Multisig
Guardian
multisig
Timelock +
notification
Instant
In-place override; emits RedemptionPolicyOverridden event
Pause-only, reversible, cannot move funds
Unpause (false alarm)
Unpause (real fix)
Guardian
multisig
Governance
multisig
Instant
48-72hr timelock
Requires recorded justification
No guardian shortcut for confirmed issues
Table 8: Governance and Access Control Summary
9.3 Governance In-Place Override for Minted Assets
When a minted asset requires a redemption policy change, whether to correct an issuer error or to respond to a
material change in the underlying asset, the Governance Multisig may perform an in-place override of the
asset's redemption configuration stored in the Asset Registry. This process follows the same multisig and
timelock discipline as all governance actions, ensuring that investors receive adequate notice and review time
before any change takes effect.
The in-place override process proceeds through the following steps: a Governance Proposal is created
specifying the target asset, the current redemption configuration, and the proposed new configuration; the
Multisig approves the proposal with the required quorum; the approved change enters the Timelock period
(48-72 hours) during which a dashboard banner notifies all holders of the affected asset; after the timelock
expires, any authorized executor may execute the change, which updates the Asset Registry in-place; and a
RedemptionPolicyOverridden event is emitted on-chain containing the old value, new value, asset ID,
proposer, executor, and timestamp. Every use of this override is fully visible on-chain and auditable. The
in-place override never uses a single admin key; it always requires multisig approval and timelock execution.
9.4 Timelock
Protocol configuration changes require a mandatory delay before execution. The delay provides investor
transparency, operational review, community visibility, and the opportunity for emergency intervention if
required. During this period, the frontend displays a notification for affected assets, informing investors that a
governance change is pending and will take effect after the timelock period expires. For restrictive changes
(enabling to disabling redemption), new redemption requests for the affected asset type are throttled during the
Page 21
CRATS Protocol Redemption Module Specification
timelock window to prevent front-running. Permissive changes (disabling to enabling) are not throttled.
9.5 Guardian Model
The Guardian exists only for emergency response and operates under strict limitations. The Guardian is
allowed to pause an asset category (granularly, including pausing multiple or all categories in one action),
resume operations after a false alarm with a recorded justification, and emit emergency events for audit
purposes. The Guardian is explicitly not allowed to transfer assets, burn tokens, modify ownership, change
governance configuration, or change redemption policies. If an emergency is detected, the Guardian pauses the
affected asset category and triggers an investigation. If the investigation reveals a false alarm, the Guardian
resumes operations after recording the justification. If the investigation confirms a genuine issue, the matter is
escalated to the Governance Multisig through the standard proposal, timelock, and execution process.
Guardian pause duration is capped at 7 days. If unresolved, the pause auto-escalates into a mandatory
main-governance vote; it does not auto-unpause. This prevents a silent or bad-faith guardian from freezing the
system indefinitely.
10. Emergency Response Model
The protocol implements a dedicated emergency response model that provides rapid incident response
capability while maintaining strict separation from normal governance operations. This model is designed to
handle situations that require immediate action, such as critical security vulnerabilities, oracle failures, or
regulatory emergencies, without compromising the deliberate, transparent nature of normal governance
processes.
Action
Trigger
Scope
Pause
Guardian multisig
(2-of-3 or 3-of-5)
Per asset category; can pause
multiple/all in one action
Follow-up
Full timelock process; no guardian
shortcut
Pause-only: cannot move funds or change
ownership
Unpause (false
alarm)
Guardian multisig
Same scope as pause
Recorded justification required; may be
challenged by governance
Unpause (real
fix)
Governance multisig
Same scope as pause
Table 9: Emergency Response Actions
11. Redemption Request Lifecycle
Every redemption request follows a deterministic lifecycle with clearly defined states and transitions.
Understanding this lifecycle is essential for investors, operators, and compliance personnel who interact with
the redemption system.
Page 22
CRATS Protocol Redemption Module Specification
Figure 5: Redemption Request Lifecycle States
11.1 State Definitions
State
Meaning
Entered From
PENDING
READY
Request submitted, awaiting
queue processing
Approved and eligible for claim
New request
PENDING
Exits To
READY, CANCELLED, EXPIRED
CLAIMED
CLAIMED
Investor has received settlement
READY
Resumed when restriction lifts; auto-escrow for
LifecycleExit
Terminal
CANCELLE
D
Investor or governance cancelled
PENDING, FROZEN
EXPIRED
FROZEN
Claim window lapsed unclaimed
Policy toggled off while in flight
READY
Terminal
Terminal
PENDING, READY
RESTRICTE
D
Investor-level compliance
restriction active
Any non-terminal state
CANCELLED (fee refund) or resumed by
governance
Table 10: Redemption Request State Definitions
11.2 Standard Flow
Under normal conditions, a redemption request progresses through three states. The request starts in the
PENDING state when the investor submits it, transitions to READY when the request has been processed and
is ready for settlement, and finally reaches CLAIMED when the investor has successfully claimed the
settlement. The investor cannot claim settlement while the request remains in the PENDING state; they must
wait until the protocol has processed the request and moved it to READY.
Page 23
CRATS Protocol Redemption Module Specification
11.3 Cancellation and Expiration
A request in the PENDING state may be cancelled by the investor before it is processed. A request that has
reached the READY state may expire if the investor does not claim the settlement within the configured time
window. Both CANCELLED and EXPIRED states are terminal; the investor must submit a new redemption
request if they still wish to redeem their shares after a cancellation or expiration event.
11.4 Frozen Flow and Three-Way Precedence
Governance actions may temporarily freeze redemption requests at any point in their lifecycle. A PENDING
request may become FROZEN if governance changes the platform default policy before the request is
processed. A READY request may also become FROZEN before the investor claims the settlement. The
FROZEN state applies uniformly to both RedemptionManager queued requests and AsyncVault requests
where requestRedeem() has been called but fulfillRedeem() has not yet executed.
The investor cannot claim settlement while the request remains frozen. Once governance reaches a decision, it
may either RESUME the request (allowing it to continue through the standard lifecycle) or CANCEL it with a
full fee refund. Frozen requests are subject to a maximum duration of 30 days. If unresolved by governance
within this period, the request auto-cancels with full fee refund. The underlying asset position is never at risk
during a freeze and requires no refund, since it remains untouched.
Three independent blocking mechanisms now exist in the protocol: policy freeze (FROZEN), category pause
(PAUSED), and investor-level compliance restriction (RESTRICTED). The stricter-wins rule has been
extended to three conditions (Decision #31): a request remains blocked until FROZEN, PAUSED, and
RESTRICTED have all independently cleared, whichever combination takes longest. No auto-resolution fires
while any condition remains active. This ensures that the same class of ambiguity previously resolved for two
mechanisms (Decision #23) does not re-emerge for the third.
12. Smart Contract Architecture
The Redemption Module consists of several independent contracts, each performing a single responsibility
within the broader redemption ecosystem. The investor interacts with the RedemptionManager, which
coordinates with the AssetFactory, Asset Plugin, Asset Registry, and Vault to process redemption requests.
12.1 IAssetPlugin
Each Asset Plugin defines the platform redemption policy for its asset class through the IAssetPlugin
interface. The plugin exposes a RedemptionPolicy struct and provides a redemptionPolicy() view function.
The plugin never stores issuer configuration; it only defines the platform rules that constrain what the issuer is
allowed to configure during asset creation.
function redemptionPolicy()
external view returns (
bool defaultEnabled,
bool issuerCanOverride
);
Page 24
CRATS Protocol Redemption Module Specification
12.2 Asset Registry
The Asset Registry stores the final redemption configuration for each minted asset instance. When an issuer
creates a new asset, the system loads the platform default from the corresponding Asset Plugin, applies any
permitted issuer configuration, and stores the final configuration atomically in the registry during the same
transaction as asset creation. After minting, the configuration cannot be modified by the issuer. Governance
may perform an in-place override through multisig and timelock with full event emission. The
RedemptionManager queries the Asset Registry (not the plugin directly) to determine whether a specific asset
instance supports redemption.
12.3 AssetFactory
The AssetFactory is responsible for registering asset categories, registering plugins, resolving plugins,
validating configuration, and storing category mappings. Every registration is governed, meaning that no
category may exist without an associated redemption policy. When a new category is registered, the plugin
registration, default policy storage, and category activation occur atomically in a single transaction, ensuring
that every asset category in the protocol has a well-defined redemption behavior before any assets of that type
can be created. The AssetFactory.setPlugin() function is protected by the same multisig plus timelock
governance as the AssetFactory address itself.
12.4 RedemptionManager
The RedemptionManager is the primary entry point for investor redemption requests. Its responsibilities
include receiving redemption requests, resolving the asset token via the vault, resolving the category and plugin
via the AssetFactory, loading the final redemption configuration from the Asset Registry, performing
compliance and holder restriction checks, queuing requests for asynchronous processing, handling the
FROZEN state when governance intervention is required, and executing settlement through the appropriate
vault contract. The RedemptionManager never contains asset-specific business logic; all asset-specific
determinations are delegated to the Asset Plugin and Asset Registry. It reverts on any unresolved step in the
resolution chain.
12.5 SyncVault
The SyncVault supports immediate redemption, where the settlement occurs in the same transaction as the
redemption request. Before processing a redemption, the SyncVault validates the asset configuration from the
registry, compliance status, holder restrictions, and redemption policy. If any validation fails, the entire
transaction reverts immediately.
12.6 AsyncVault
The AsyncVault supports queued redemption, where the investor submits a request that enters a queue for later
settlement. The workflow proceeds through requestRedeem(), which places the request in the queue, followed
by the fulfillment process, and finally fulfillRedeem() where the investor claims the settlement. In-flight
requests (requestRedeem called but fulfillRedeem not yet executed) are subject to the same FROZEN
Page 25
CRATS Protocol Redemption Module Specification
handling as RedemptionManager queued requests.
12.7 LifecycleExitManager
The LifecycleExitManager (specified separately) manages complete asset liquidation events and is used only
for asset-wide exits such as real estate property sales and fund terminations. It is never used for ordinary
investor redemption requests. The execution flow proceeds through settlement verification (which must
complete before any payout or burn), a pausable Guardian checkpoint, compliance-restricted investor escrow,
fund distribution, vault share burning, asset token burning, and vault closure, all executed atomically as a single
transaction (Decisions #26, #27).
Figure 6: Complete Contract Interaction Flow
13. Contract Interaction Flow
A complete redemption request follows a comprehensive validation and settlement pipeline that ensures every
requirement is satisfied before any state changes occur. The investor initiates the request through the
RedemptionManager, which resolves the asset and its associated plugin, loads the final asset configuration
from the Asset Registry, performs compliance and holder restriction checks, validates the redemption policy,
and finally executes the settlement through the appropriate vault. Every validation step must succeed before
settlement proceeds; failure at any point immediately reverts the entire transaction, ensuring that no partial or
inconsistent state can result from a failed redemption attempt. Backend pre-checks are a UX convenience
only; the on-chain require() is the sole source of truth, and the backend must gracefully handle reverts even
after its own checks have passed.
14. Events
The Redemption Module emits events for every critical action, providing a comprehensive audit trail that can
be consumed by backend services, blockchain indexers, and audit reporting systems. These events are indexed
to enable efficient querying and are essential for maintaining the transparency and accountability that
institutional participants require. Governed setting changes emit events that include the old value, new value,
timestamp, proposer, and executor.
Page 26
CRATS Protocol Redemption Module Specification
CRATS Protocol Redemption Module Specification Page 27
Event Description
RedemptionRequested Investor submitted a new redemption request
RedemptionReady Request processed and ready for settlement
RedemptionClaimed Investor claimed the settlement
RedemptionFrozen Request frozen by governance action
RedemptionCancelled Request cancelled by investor or governance
RedemptionPolicyUpdated Governance updated platform default policy
RedemptionPolicyOverridden Governance in-place override of minted asset config (oldValue, newValue,
assetId, executor, timestamp)
AssetCategoryRegistered New asset category registered atomically
PluginRegistered Plugin registered with AssetFactory
HolderRestricted Compliance restricted a specific investor
HolderRestrictionRemoved Restriction removed or expired
GuardianPaused Guardian paused an asset category
GuardianResumed Guardian resumed after false alarm
LifecycleExitExecuted Full asset liquidation completed
Table 11: Redemption Module Events
15. Internal Security Audit
The following is a design-level internal review, not a code audit. No implementation exists yet, so findings are
limited to architectural and governance gaps identified during the design review process. An independent
third-party code audit remains mandatory before deployment per Decision #22. All findings below have been
adopted with the fixes described.
15.1 High Severity
ID Finding Fix Status
CRATS Protocol Redemption Module Specification Page 28
H-1
AssetFactory.setPlugin() has no
stated governance, separate from
the AssetFactory address itself.
Apply same multisig plus timelock protection to
setPlugin() as to the AssetFactory address (Decision #6). Adopted
H-2
Public timelock transparency
creates a front-running window:
investors can rush the queue
before a restrictive change lands.
Throttle new redemption requests for the affected asset
type during the timelock window, restrictive changes
only (Decision #24).
Adopted
H-3
(F-1)
LifecycleExitManager does not
check investor restriction status
before distributing settlement
funds.
Query each investor's restriction status before
distribution; route restricted portions to escrow, release
on restriction resolution (Decision #26).
Adopted
H-4
(F-2)
Guardian pause authority does not
extend to LifecycleExitManager;
no emergency stop for in-progress
exits.
Add pausable checkpoint between settlement
verification and distribution; Guardian may pause only at
that point (Decision #27).
Adopted
H-5
(F-3)
SYSTEM_PAUSE_ROLE and
Guardian pause authority overlap
with no stated relationship.
Remove SYSTEM_PAUSE_ROLE; all pause authority
consolidated under Guardian multisig (Decision #28). Adopted
H-6
(F-4)
COMPLIANCE_ROLE has no
oversight, challenge, or
multi-party control, unlike
Guardian and Governance.
Require justification at activation; grant Governance
ability to review and revoke improper restrictions
(Decision #29).
Adopted
15.2 Medium Severity
ID Finding Fix Status
M-1
No upper bound on FROZEN
duration; a request can sit blocked
indefinitely.
Maximum freeze duration of 30 days. If unresolved,
auto-cancel with full fee refund (Decision #19). Adopted
M-2
No upper bound on guardian
PAUSE duration; silent or
bad-faith guardian could freeze
indefinitely.
Hard cap of 7 days. If unresolved, auto-escalates to
mandatory governance vote (does not auto-unpause). Adopted
M-3
False-alarm justification is a
policy, not enforceable, if
recorded off-chain.
Require non-empty justification string or incident-report
hash as mandatory parameter on unpause transaction,
emitted in event.
Adopted
M-4 "Substantially disjoint" signers is
not a testable threshold.
Zero overlapping signer addresses between guardian and
governance multisigs (Decision #21). Adopted
CRATS Protocol Redemption Module Specification Page 29
M-5
Governance level for new
category registration is
unspecified; could be
lower-privilege.
New-category registration goes through identical
multisig plus timelock as toggling an existing flag. Adopted
M-6
FROZEN and PAUSED have no
stated precedence when both
apply simultaneously.
Stricter-wins rule: both conditions must independently
clear (Decision #23). Adopted
M-7
(F-5)
No maximum duration on
investor-level restrictions; renewal
is unbounded and silent.
180-day maximum duration. Continuation requires same
justification-and-review process (Decision #30). Adopted
M-8
(F-6)
Investor restriction "hold" is not a
formal state; not reconciled with
FROZEN/PAUSED precedence.
Add RESTRICTED state; extend stricter-wins to three
conditions (Decision #31). Adopted
M-9
(F-7)
25% gate / 7-day redemption
period not described in operative
sections; only in open items.
Confirmed as active RedemptionManager mechanics,
applied uniformly (Decision #32). Adopted
15.3 Low Severity
ID Finding Fix Status
L-1
Fee refund custody model unclear
if fees are swept to treasury
before resolution.
Escrow redemption-request fees in RedemptionManager
until terminal state; sweep to treasury only on successful
claim.
Adopted
L-2
(F-8)
Duplicate section number: two
sections both numbered 9.4. Renumbered second occurrence to 9.5. Fixed
L-3
(F-9)
Section numbering jumps from
16.3 directly to 16.5. Renumbered 16.5 to 16.4. Fixed
L-4
(F-10)
Section 23 contains a
self-contradictory statement about
the reclassification override
procedure.
Clarified: in-place override is in Ch 9.3; open item now
specifies what standalone document would add. Fixed
Table 12: Security Audit Findings
15.4 Informational
Checks-effects-interactions ordering must be enforced in the refund and cancellation path at implementation
time, given the external transfer involved. The test plan should add economic and griefing scenarios,
specifically queue-spam attempts timed against a pending restrictive timelocked change, to validate the H-2 fix
under adversarial conditions.
15.5 Organizational Action Item
Enforcing zero signer overlap between the guardian multisig and main governance multisig (M-4) may require
recruiting guardian signers from outside the core founding team, since the main governance multisig is
expected to draw from existing leadership. This is a staffing and trust decision, not a contract parameter, and
must be resolved before deployment. It is tracked as a pre-implementation checklist item in Chapter 22.
16. Security Considerations
The Redemption Module follows a fail-safe design philosophy that prioritizes security and correctness over
convenience. Every aspect of the system is designed to ensure that redemption operations can only proceed
when all validation checks pass, and that any failure results in a complete transaction revert with no partial
state changes.
16.1 Fail-Closed Validation
Every lookup in the redemption pipeline must succeed. The resolution chain proceeds through the Vault,
Asset, Category, Plugin, Asset Registry Configuration, Compliance, Restriction Check, and Settlement stages.
Failure at any step immediately reverts the transaction. There is no fallback behavior that could allow a
redemption to slip through a failed validation check.
16.2 Separation of Responsibilities
Each protocol component performs a single responsibility, ensuring that a vulnerability in one component
cannot be exploited to compromise another. The Asset Plugin defines platform redemption policy, the Asset
Registry stores issuer redemption configuration, the RedemptionManager handles request processing, the
LifecycleExitManager manages full asset liquidation, the AssetToken enforces ownership and holder
restrictions, the Compliance layer manages investor restrictions, and the Governance layer manages policy
changes.
Component
Responsibility
Asset Plugin
Asset Registry
Platform redemption policy
Issuer redemption configuration (immutable after mint)
RedemptionManager
LifecycleExitManager
Request processing
Full asset liquidation (separate module)
AssetToken
Compliance
Ownership and holder restrictions
Investor-level restrictions
Governance
Platform policy management
Page 30
CRATS Protocol Redemption Module Specification
Table 13: Security Component Responsibilities
16.3 Immutable Asset Configuration
After minting, the issuer redemption configuration cannot be changed by the issuer, the asset category cannot
be silently reclassified, and investor ownership cannot be altered outside governed protocol operations.
Governance may perform an in-place override of the redemption configuration through multisig and timelock
with full on-chain event emission (RedemptionPolicyOverridden). Silent reclassification of an
already-tokenized asset's category is disallowed; any correction requires the same governance rigor as
new-category onboarding (Decision #20).
16.4 On-Chain Transparency and Override Prohibition
Every redemption policy override, whether to a platform default or to a minted asset's configuration, emits
immutable on-chain audit events. The RedemptionPolicyOverridden event records the old value, new value,
asset ID, proposer, executor, and timestamp, providing a complete, tamper-proof audit trail. Every use of the
governance override capability is fully visible on-chain, enabling investors, auditors, and regulators to review
the complete history of any policy change.
Single-key override is strictly prohibited. No individual admin wallet, regardless of its assigned roles, can
override redemption policy. All redemption policy overrides require multisig approval and timelock execution,
ensuring that no single point of compromise exists in the override path. This prohibition applies equally to
platform default changes, minted asset in-place overrides, and any other policy modification that affects
investor redemption rights. Every override emits immutable on-chain audit events that cannot be deleted or
modified after emission.
17. Testing Requirements
Testing should validate protocol correctness, governance enforcement, and security across all supported asset
types and redemption scenarios. The testing strategy is organized into five categories that cover functional,
compliance, governance, lifecycle, and security requirements.
17.1 Core Behavior
Fine Art redemption accepted at both RedemptionManager and vault level. Real Estate and Carbon Credit
rejected at both RedemptionManager and vault level. Issuer override behavior correctly applied during asset
creation. Asset configuration correctly locked after minting. Complete redemption request lifecycle from
submission through claim.
17.2 Fail-Safe and Onboarding
Unregistered category or zero-address plugin reverts immediately. New category unusable until redemption
policy set atomically with registration. Reclassification attempt without governance in-place override is
Page 31
CRATS Protocol Redemption Module Specification
rejected. No default redemption policy exists for unregistered categories.
Additional test coverage for new and unregistered categories must include the following scenarios. An asset
creation attempt with an unregistered category must revert at the AssetFactory level before any state is written.
A redemption attempt on an asset whose category-plugin mapping was removed must revert at the
category-lookup step in the resolution chain. A zero-address plugin reference must cause the entire transaction
to revert with a descriptive error. The atomic category registration flow (plugin assignment plus policy setting
in a single transaction) must be tested for both success and partial-failure reversion. An attempt to bypass
registration by directly calling the RedemptionManager with a crafted category identifier must revert. After a
category is registered, assets of that type must correctly resolve the newly assigned plugin and its redemption
policy through the standard two-layer model.
17.3 Governance Enforcement
No change without multisig quorum. No effect before timelock expiry. Correct events emitted with proposer,
executor, old value, new value, and timestamp. Plugin upgrade blocked without equivalent governance to
policy toggle. AssetFactory.setPlugin() protected by same governance as AssetFactory address change.
New-category registration goes through identical governance as flag toggle. Governance in-place override of
minted asset configuration emits RedemptionPolicyOverridden event with full details. Single-key override
attempt rejected.
17.4 Compliance and Investor Restrictions
Investor restriction triggered exclusively by COMPLIANCE_ROLE, not admin or governance. Restriction
takes effect immediately, no timelock. Pending redemption requests held while investor is restricted (not
cancelled or completed). READY claims blocked for restricted investor. Upon restriction removal, held
requests resume normal processing. Manual removal requires recorded justification.
HolderRestrictionRemoved event emitted on removal.
17.5 Emergency Response
Guardian pause takes effect instantly and is scoped correctly (single or multiple categories). Guardian
false-alarm unpause requires justification record as mandatory parameter. Real-issue unpause rejected unless
routed through main governance timelock. Guardian pause duration capped at 7 days with auto-escalation.
17.6 Edge Cases
Mid-queue and mid-flight (AsyncVault) toggle produces FROZEN state, not silent cancellation or completion.
Frozen request cancellation triggers fee refund, not position or value adjustment. Timelock execution
attempted before expiry fails. Replay of executed action fails. FROZEN, PAUSED, and RESTRICTED
stricter-wins rule: request blocked until all three clear independently (Decision #31). Economic and griefing
scenarios including queue-spam during pending restrictive timelocked change.
17.7 LifecycleExitManager Compliance and Emergency Stop
Page 32
CRATS Protocol Redemption Module Specification
LifecycleExitManager distribution correctly withholds funds for a restricted investor and releases them
automatically upon restriction expiry or removal (Decision #26). Guardian pause succeeds when triggered
before distribution begins and is rejected once burning/closure has started (Decision #27). Escrow sub-balance
for restricted investors is correctly created and released.
17.8 Compliance Restriction Accountability
Restriction activation without a justification or evidence parameter is rejected (Decision #29). Governance
can revoke a compliance restriction it determines to be improper; a revoked restriction cannot be silently
reapplied by the same compliance officer without new justification. Restriction exceeding the 180-day
maximum duration without renewal justification is automatically lifted (Decision #30). Attempting to invoke a
SYSTEM_PAUSE_ROLE-equivalent function outside the Guardian multisig path fails (Decision #28).
18. Backend Integration
The backend serves as the orchestration layer between client applications and the CRATS smart contracts. It
provides validation, user experience enhancements, notifications, and settlement coordination, while the
blockchain remains the ultimate source of truth. Backend validation must never replace on-chain validation;
even if all backend checks succeed, the smart contract performs the same validation again, and the backend
must gracefully handle any transaction reverts that occur (Decision #14).
The backend is responsible for creating redemption requests, retrieving asset redemption policies from the
Asset Registry, managing investor notifications, tracking redemption lifecycle states, synchronizing blockchain
events, managing settlement workflows, displaying governance status and pending timelocked changes, and
handling failed transactions gracefully. Before submitting a redemption transaction, the backend may perform
preliminary validation to improve user experience by checking whether the asset exists, whether redemption is
enabled in the stored configuration, and whether the holder is restricted, providing early feedback to investors
before they commit to an on-chain transaction.
The backend continuously monitors redemption requests, settlement completion, governance events, guardian
actions, and lifecycle exits. Settlement status is synchronized through blockchain events, ensuring that the
backend's view of protocol state is always consistent with the on-chain reality. This event-driven architecture
allows the backend to react to protocol events in real-time.
19. Frontend Integration
The frontend provides investors, issuers, administrators, and compliance officers with visibility into
redemption status and the tools they need to interact with the redemption system effectively.
19.1 Investor Portal
Investors should be able to view redemption availability, the asset's final redemption configuration (from the
Asset Registry), request status, queue position, settlement status, frozen requests, holder restriction status, and
governance notices including pending timelocked changes through a unified portal that aggregates all relevant
Page 33
CRATS Protocol Redemption Module Specification
information about their holdings and redemption activities. During timelock windows for restrictive changes, a
prominent banner must be displayed for the affected asset type (Decision #15).
19.2 Issuer Portal
After minting, the issuer redemption configuration becomes immutable to the issuer. The issuer cannot modify
it after investors own shares. Subsequent modifications to an already-minted asset's redemption configuration
require a governance-controlled in-place override through multisig and timelock with full investor notification.
19.3 Administrator Portal
Administrators can monitor redemption requests, settlement progress, guardian actions, governance proposals,
asset lifecycle events, and investor restrictions through a comprehensive dashboard. Administrators cannot
arbitrarily modify redemption configurations after minting, ensuring that the protocol's immutability
guarantees are preserved.
19.4 Compliance Dashboard
Compliance officers manage investor restrictions through a dedicated dashboard that allows them to select an
investor and asset, apply a freeze with a specified reason, duration, and evidence, and activate the restriction.
Only the selected investor is affected by the restriction, and all actions are recorded with full auditability for
regulatory reporting purposes.
20. Blockchain Indexer Integration
The CRATS Indexer listens for redemption-related events and maintains a queryable off-chain representation
of protocol state. The indexer maintains redemption history, queue analytics, settlement history, investor
activity, compliance actions, governance actions, and asset lifecycle events. No business logic is executed by
the indexer; it is a passive observer that records and indexes protocol events for efficient querying by backend
services and frontend applications. This separation ensures that the indexer cannot influence protocol behavior
and serves purely as a data accessibility layer.
21. Files to Modify
The following files require modification to implement the Redemption Module. The list is organized by
contract layer, followed by backend, frontend, and test files. Each file is listed with a brief description of the
changes required.
File
Changes
IAssetPlugin.sol
Add redemptionPolicy() returning (bool defaultEnabled, bool issuerCanOverride)
FineArtPlugin.sol
Storage-backed defaultEnabled=true, issuerCanOverride=true
Page 34
CRATS Protocol Redemption Module Specification
CRATS Protocol Redemption Module Specification Page 35
RealEstatePlugin.sol Storage-backed defaultEnabled=false, issuerCanOverride=false
CarbonCreditPlugin.sol Storage-backed defaultEnabled=false, issuerCanOverride=false
RedemptionManager.sol Asset Registry validation, FROZEN state, RESTRICTED state, three-way stricter-wins,
governed AssetFactory setter, 25%/7-day gate (Decision #32)
IRedemptionManager.sol AssetFactory configuration interface
SyncVault.sol Asset Registry validation before redeem/withdraw
AsyncVault.sol Asset Registry validation, FROZEN handling, RESTRICTED-state handling for in-flight
requests
AssetFactory.sol Atomic category registration + policy-setting; governed setPlugin(); remove or formally scope
any SYSTEM_PAUSE_ROLE reference
governance/ Multisig + timelock wiring; guardian multisig; plugin upgrade governance; compliance
restriction revocation function
Asset Registry New: stores final redemption config per asset instance
LifecycleExitManager.sol Restriction-status check before distribution; escrow sub-balance for restricted investors;
pausable Guardian checkpoint pre-distribution
Compliance.sol / AssetToken.sol Mandatory justification at activation; governance override/revocation; 180-day max duration;
renewal justification
cratsVaultService.js Mirrored pre-checks against Asset Registry; graceful revert handling
frontend/dashboard Pending-change banner during timelock windows; RESTRICTED-state display
RedemptionManager.test.js Full coverage per Chapter 17, including v5.1 addendum test additions
Table 14: Files Requiring Modification
22. Implementation Guide
This section covers deployment and pre-implementation concerns that are outside the scope of protocol
behavior specification but are essential for a successful production deployment. These items address the
operational, organizational, and procedural requirements that must be satisfied before the Redemption Module
can be deployed to mainnet.
22.1 Pre-Implementation Checklist
• Audit current production state for any live asset category or vault requiring redemption policy backfill
(Decision #13)
• Recruit and confirm guardian multisig signers with zero overlap with main governance multisig (Decision
#21, Finding M-4); this is an organizational staffing decision that may require recruiting from outside the
core team
• Implement freeze duration cap (30 days) and pause duration cap (7 days) with their escalation and
auto-resolution logic (Findings M-1, M-2)
• Schedule independent third-party security audit prior to mainnet deployment (Decision #22); this is
mandatory, not optional
• Implement fee escrow in RedemptionManager: redemption-request fees must be held until terminal state,
swept to treasury only on successful claim (Finding L-1)
• Implement timelock request throttle for restrictive changes (Decision #24, Finding H-2)
• Implement mandatory justification parameter on guardian unpause transactions (Finding M-3)
22.2 Deployment Sequence
• Deploy Asset Plugins and configure platform redemption policies (defaultEnabled, issuerCanOverride)
• Deploy Asset Registry for storing per-asset redemption configuration
• Deploy AssetFactory and register asset categories with plugins atomically
• Deploy RedemptionManager with reference to AssetFactory and Asset Registry
• Deploy LifecycleExitManager with governance integration (specified separately)
• Deploy Governance contracts and configure the timelock period (48-72 hours)
• Deploy Guardian contracts with confirmed disjoint signers and configure emergency roles
• Configure protocol roles (SYSTEM_PAUSE_ROLE, COMPLIANCE_ROLE, GUARDIAN, etc.)
• Configure the blockchain Indexer for event monitoring
• Execute full integration tests across all contracts
• Complete independent third-party security audit
23. Open Items for Future Phases
The following items are explicitly deferred to future phases and are not part of this specification. They are
documented here to provide visibility into the roadmap and to ensure that the current design does not preclude
their future implementation.
• Full specification of LifecycleExitManager (currently referenced as a separate module)
• Whether the 25% gate / 7-day period should be configurable per asset type (currently global)
• Plugin re-mapping procedure for reclassification: the in-place override mechanism is fully specified in
Chapter 9.3, but a standalone document describing the plugin re-mapping workflow (deploying a new
plugin, assigning it via governed AssetFactory.setPlugin(), and handling existing assets) is not yet written
• Additional asset classes: intellectual property, music royalties, sports contracts, private equity
• Advanced settlement providers for faster or more flexible settlement options
• Cross-chain redemption support for multi-network asset redemption
• Institutional custody integrations enabling redemption to qualified custodians
Page 36
CRATS Protocol Redemption Module Specification
• Enhanced governance mechanisms such as delegated voting or quadratic voting
24. Addendum: v5.1 Findings and Remediation
This addendum is an independent review of CRATS Protocol Redemption Module Specification v5.0. It
supplements, and does not replace, the base specification. All findings below reference section numbers from
the v5.0 document. This is a design-level review; an independent third-party code audit remains mandatory
before mainnet deployment per Decision #22.
24.1 Purpose and Scope
This review evaluated the v5.0 specification for architectural consistency, governance completeness, and
alignment with the Master Decision Log established during prior design review. The review focused on
interactions between newly introduced components (Investor Restrictions, LifecycleExitManager) and
previously established controls (FROZEN state, Guardian pause, governance override); consistency of
oversight and duration limits across all privileged roles; and document structural integrity.
Ten findings are identified: seven substantive design gaps and three documentation issues. All are assessed as
resolvable without altering the core architecture of v5.0. The gaps are concentrated in the two components
added most recently, Investor Restrictions and LifecycleExitManager, which had not yet received the same
rigor (duration limits, oversight, state-machine integration) applied elsewhere in the document.
24.2 Findings Summary
ID
Severit
y
Area
F-1
F-2
High
High
LifecycleExitMa
nager
Emergency
Response
Summary
Does not check investor restriction status before distributing settlement funds.
Guardian pause authority does not extend to LifecycleExitManager; scope undefined.
F-3
High
Access Control
The 25% gate / 7-day redemption period is not described in the operative sections; only
referenced as an open item.
SYSTEM_PAUSE_ROLE and Guardian pause authority overlap or duplicate with no
stated relationship.
F-4
High
Compliance
COMPLIANCE_ROLE has no oversight, challenge, or multi-party control, unlike
Guardian and Governance.
F-5
F-6
Medium
Medium
Compliance
State Model
No maximum duration on investor-level restrictions; renewal is unbounded and silent.
Investor restriction "hold" is not a formal state and is not reconciled with the
FROZEN/PAUSED precedence rule.
F-7
Medium
Core Mechanics
Page 37
CRATS Protocol Redemption Module Specification
F-8
F-9
F-1
0
Low
Low
Low
Documentation
Documentation
Duplicate section number: two sections both numbered 9.4.
Missing section 16.4; numbering jumps from 16.3 to 16.5.
Section 23 contains a self-contradictory statement about the reclassification override
procedure.
Documentation
Table 15: v5.1 Findings Summary
24.3 High Severity Findings
F-1: LifecycleExitManager Compliance Check
Section 7 describes pro-rata settlement distribution to all investors during a full-property exit, with no check
against the investor-restriction status defined in Section 8. An investor under an active compliance hold (AML
review, sanctions match, fraud investigation) would still receive their distribution automatically, bypassing the
very protection that Section 8 exists to provide. This is particularly critical because the LifecycleExitManager
handles the single largest fund-movement event in an asset's lifecycle.
Remediation (Decision #26): Before calculating or distributing pro-rata settlement, LifecycleExitManager
queries each investor's restriction status via the Compliance layer. If an investor is currently restricted, their
portion is routed to an escrow sub-balance tied to their address rather than distributed directly, and released
automatically once the restriction is lifted or expires. This mirrors the existing FROZEN-request refund
pattern, applied to a payout rather than a fee, and requires no new governance action.
F-2: LifecycleExitManager Emergency Stop
Section 10 scopes Guardian pause authority to "asset categories." The specification does not state whether
Guardian can halt an in-progress LifecycleExitManager execution, which Section 7 describes as executing
atomically after settlement verification and governance approval. Without an emergency stop before
irreversible steps begin, a compromised or fraudulent settlement-verification step could not be halted once
initiated, leaving the highest-value event in the protocol outside the reach of the emergency response model.
Remediation (Decision #27): An explicit pausable checkpoint is added to LifecycleExitManager between
settlement verification and distribution. Guardian may pause execution at that checkpoint only, using the
existing instant, category-scoped mechanism from Section 10. Once burning and vault closure begin, the
transaction remains atomic and cannot be interrupted, consistent with Section 7's no-partial-state guarantee.
F-3: Pause Authority Consolidation
Table 7 previously listed SYSTEM_PAUSE_ROLE ("pause entire asset, all investors") as a distinct row from
GUARDIAN ("emergency pause, per category, instant"). The specification did not state whether these were
the same role described twice, or two independent roles with overlapping authority. An undocumented second
pause path could bypass every protection built into the Guardian model: zero signer overlap with governance,
the 7-day cap, and false-alarm accountability.
Page 38
CRATS Protocol Redemption Module Specification
Remediation (Decision #28): SYSTEM_PAUSE_ROLE has been removed as a separate entry. All asset-wide
and category-level pause authority resides exclusively with the Guardian multisig defined in Section 10. If a
genuinely distinct role is intended in the future, it must be named, scoped, and placed under governance
equivalent to or stronger than the Guardian model, including signer-overlap restrictions.
F-4: Compliance Restriction Accountability
COMPLIANCE_ROLE can restrict any investor instantly, with no timelock (by design, per Section 8.1) and,
unlike Guardian, with no challenge or override mechanism available to Governance. Every other privileged
role in the specification (Governance, Guardian) carries some check on its power: multisig, timelock, or
challengeability. COMPLIANCE_ROLE currently has none, despite holding the power to freeze any
individual investor's funds unilaterally.
Remediation (Decision #29): A recorded justification or evidence hash is now required at the moment a
restriction is applied, not only at removal. Governance has the ability to review and revoke a restriction it
determines was applied in error or bad faith, mirroring the false-alarm challenge mechanism already defined
for Guardian (Decision #17). This does not add a timelock to applying a restriction, which must remain instant
per Section 8.1's own regulatory rationale; it adds review after the fact only.
24.4 Medium Severity Findings
F-5: Investor Restriction Duration Cap
Section 8.4 permitted compliance officers to extend a restriction indefinitely, with no stated maximum
duration, unlike every other blocking mechanism in the specification. FROZEN is capped at 30 days and
Guardian PAUSE is capped at 7 days, specifically to prevent indefinite blocking without active justification.
Investor-level restrictions target a specific person rather than an asset class and arguably warrant this discipline
more, not less.
Remediation (Decision #30): A default maximum restriction duration of 180 days has been introduced,
aligned with typical AML investigation timelines. Continuing a restriction beyond 180 days requires the same
justification-and-review discipline as the initial restriction, rather than a silent extension.
F-6: RESTRICTED State and Three-Way Precedence
Section 8.3 described redemption requests being "held" during an active investor restriction, but this was not
represented as a formal state in Table 10, and its interaction with the FROZEN/PAUSED stricter-wins rule
(Decision #23) was not defined. Three independent blocking mechanisms existed (policy freeze, category
pause, investor restriction), but only one pairwise interaction was documented.
Remediation (Decision #31): A formal RESTRICTED state has been added to the request lifecycle. The
stricter-wins rule has been extended to three conditions: a request remains blocked until FROZEN, PAUSED,
and RESTRICTED have all independently cleared, whichever combination takes longest.
F-7: Redemption Gate Mechanic Status
Earlier design iterations of this module included a global 25% redemption gate and 7-day processing period as
core RedemptionManager mechanics. Version 5.0 referenced this only once, obliquely, as an open item,
Page 39
CRATS Protocol Redemption Module Specification
without describing the mechanic itself in Section 11 or Section 12.4. This was a foundational mechanic in
prior versions, and an oblique reference in the open-items section creates ambiguity for implementers as to
whether this was a deliberate simplification or an unintentional omission during restructuring.
Remediation (Decision #32): The 25% gate and 7-day processing period are confirmed as active
RedemptionManager mechanics for all asset types supporting redemption, applied uniformly. This
confirmation is recorded in the Master Decision Log to resolve the ambiguity.
24.5 Documentation Findings
Three low-severity documentation issues were identified and resolved directly in the base specification. F-8:
two sections both numbered 9.4 have been corrected by renumbering the second occurrence to 9.5. F-9: the
numbering jump from 16.3 to 16.5 has been corrected by renumbering 16.5 to 16.4. F-10: the
self-contradictory open item about the reclassification override procedure has been clarified to distinguish
between the fully specified in-place override mechanism (Chapter 9.3) and the not-yet-written standalone
document for plugin re-mapping workflows.
24.6 Master Decision Log Additions
Seven new decisions (Decisions #26 through #32) have been added to the Master Decision Log in Chapter 3,
formally closing Findings F-1 through F-7. Each decision is numbered continuously from the existing log and
specifies the area, the resolved decision, and any cross-references to other decisions or findings. These
decisions carry the same authoritative weight as all prior decisions in the log.
#
Area
Decision
2
6
2
7
LifecycleExitMa
nager
Emergency Stop
Settlement distribution checks restriction status. Restricted portions escrowed.
Guardian pauses LifecycleExit only pre-distribution. Atomic after burn begins.
2
8
2
9
Access Control
Compliance
All pause authority under Guardian. No separate SYSTEM_PAUSE_ROLE.
Justification required at activation. Governance may revoke improper restrictions.
3
0
3
1
Duration Cap
State Model
180-day maximum. Continuation requires same justification-and-review.
RESTRICTED state added. Three-way stricter-wins: FROZEN + PAUSED + RESTRICTED.
3
2
Core Mechanics
25% gate / 7-day period confirmed active, applied uniformly.
Table 16: v5.1 Decision Log Additions
Page 40
CRATS Protocol Redemption Module Specification
24.7 Additional Files and Tests
The v5.1 review identified additional files requiring modification and additional test scenarios beyond the
original v5.0 scope. The Files to Modify table (Chapter 21) has been updated with LifecycleExitManager
compliance checks, Compliance.sol governance revocation, AssetFactory SYSTEM_PAUSE_ROLE cleanup,
and AsyncVault RESTRICTED-state handling. The Testing Requirements (Chapter 17) has been expanded
with two new subsections: LifecycleExitManager Compliance and Emergency Stop (Section 17.7) and
Compliance Restriction Accountability (Section 17.8). All new test scenarios are documented and ready for
implementation.
24.8 Summary
The base specification (v5.0) is architecturally sound and reflects the full set of decisions and audit
remediations established in prior design review. The gaps identified in this addendum are concentrated in the
two components added most recently, Investor Restrictions and LifecycleExitManager, which had not yet
received the same rigor (duration limits, oversight, state-machine integration) applied elsewhere in the
document. None of the findings require altering the core two-layer policy model, the governance structure, or
the emergency response model; all are additive fixes to newer components.
Resolving Findings F-1 through F-4 should be treated as a prerequisite to any implementation work involving
LifecycleExitManager or the Compliance layer. The documentation issues (F-8, F-9, F-10) have been resolved
directly in this version. All seven new decisions have been incorporated into the Master Decision Log, all
findings have been adopted into the security audit tables, and all remediations have been applied to the
operative sections of the specification.
25. Conclusion
The CRATS Redemption Module provides a standardized, institutional-grade redemption framework for
Real-World Assets. The design separates responsibilities across Asset Plugins, Asset Registry,
RedemptionManager, Vaults, AssetToken, Governance, and LifecycleExitManager while maintaining a
consistent protocol interface that investors can rely on regardless of the underlying asset type.
Key characteristics of the module include asset-aware redemption policies defined through a two-layer model
of platform defaults and issuer configuration; immutable redemption configuration in the Asset Registry after
minting that ensures investor certainty; a generic RedemptionManager without asset-specific logic that keeps
the core contract auditable; a dedicated LifecycleExitManager (separate module) for full asset liquidation;
investor-level holder restrictions that protect compliance actions from affecting unrelated investors;
governance-controlled platform configuration with timelock transparency and investor notification; a
transparent request lifecycle with FROZEN state handling and stricter-wins rules; comprehensive security
audit findings with all remediations adopted; and complete auditability through indexed blockchain events that
satisfy regulatory reporting requirements.
Page 41
CRATS Protocol Redemption Module Specification
This architecture enables CRATS to support multiple Real-World Asset classes while preserving security,
regulatory compliance, operational flexibility, and institutional governance standards. The modular design
ensures that the protocol can evolve to support new asset types and redemption scenarios without
compromising the stability or security of existing functionality.
Page 42
CRATS Protocol Redemption Module Specification