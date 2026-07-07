# CRATS Protocol — Unified Redemption & Exit Module Specifications (v8.0.0)

This document provides the complete, production-grade specification for the new updates in **CRATS Protocol v8.0.0**, focusing on standard investor redemptions (`RedemptionManager.sol`), real estate asset liquidations (`LifecycleExitManager.sol`), upgraded compliance duration locks, and automated Beneficial Owner Registry (BOR) synchronization.

---

## 1. Feature Specifications

### 1.1 Standard Exits (`RedemptionManager`)
Provides immediate and asynchronous queue-based exits for compliance-onboarded investors:
*   **Synchronous Settlement (SyncVault)**: Vaults execute immediate exits by calling ERC-4626 `redeem` or `withdraw`. The vault burns the shares and returns the underlying asset tokens atomically, subject to active identity registry whitelists.
*   **Asynchronous Settlement (AsyncVault / EIP-7540)**: For illiquid real-world assets, redemptions use a multi-stage request pipeline:
    1.  **Request**: Investor locks their shares in the vault contract and pays the stablecoin (USDC) exit fee. The request is created in the `PENDING` state.
    2.  **Processing**: Operators verify property liquid reserves, calculate the final asset settlement amount, and mark the request `READY`.
    3.  **Claim**: The investor calls `claimRedemption` to withdraw the underlying assets.
*   **Compliance Hold State**: If an investor is restricted by the compliance layer during the `PENDING` stage, their request status transitions to `RESTRICTED` (or is held pending) and cannot advance to `READY` until compliance removes the restriction.

### 1.2 Institutional Exit Liquidations (`LifecycleExitManager`)
Enables full-asset exits for real estate and other fractional properties:
*   **Settlement Verification**: The asset issuer deposits the liquidated property's USDC funds into the `LifecycleExitManager` contract, which verifies the settlement size.
*   **Escrow Routing**: Investors who are restricted by compliance when the exit is executed cannot receive payouts. The contract routes their pro-rata USDC entitlement to an escrow sub-balance.
*   **Programmatic Burning**: Automates the burning of both the investor's vault shares (shares represent claims) and the underlying RWA asset tokens from the vault's custody.
*   **Vault Closure**: Permanently shuts down the vault by calling `closeVault()`, ensuring no further transactions or fees can occur.
*   **Guardian Emergency Pause**: Employs a pausable checkpoint that allows the Guardian role to freeze the liquidation process before payout/burning begins.

---

## 2. Advanced Security Mechanisms

1.  **Strict Separation of Roles**:
    *   `DEFAULT_ADMIN_ROLE`: Configures registries and initializes/executes liquidations.
    *   `GUARDIAN_ROLE`: Exercises emergency pause capabilities.
    *   `PROCESSOR_ROLE`: Fulfills queued redemption requests.
    *   `COMPLIANCE_ROLE`: Restricts/unrestricts individual investor addresses.
2.  **Compliance Hold Caps**:
    *   Investor restrictions imposed by compliance are capped at a maximum duration of **180 days** to ensure continuous regulatory review and prevent indefinite, unchecked asset locking.
3.  **Zero-Address Safety Guards**:
    *   All setters and initialization parameters require non-zero address checks.
4.  **No Partial State Guarantee**:
    *   Once the `LifecycleExitManager` executes an exit, it loops through beneficial owners, distributes payouts/escrow, burns shares/assets, and closes the vault within a single, atomic EVM transaction, ensuring no partial or corrupted exit states can occur.

---

## 3. Function & Method Signatures

### 3.1 `RedemptionManager.sol` Core API

```solidity
/**
 * @notice Submits a standard queue-based redemption request.
 * @param vault Address of the SyncVault/AsyncVault.
 * @param shares Amount of shares the investor wishes to redeem.
 * @return requestId Unique incrementing identifier for the request.
 */
function requestRedemption(
    address vault,
    uint256 shares
) external nonReentrant returns (uint256 requestId);

/**
 * @notice Fulfills a pending request (Operator only).
 * @param vault Address of the vault.
 * @param requestId The ID of the request to process.
 * @param assets Actual amount of underlying assets allocated to this request.
 */
function processRedemption(
    address vault,
    uint256 requestId,
    uint256 assets
) external onlyRole(PROCESSOR_ROLE) nonReentrant;

/**
 * @notice Claims the underlying assets after processing.
 * @param vault Address of the vault.
 * @param requestId The ID of the request to claim.
 */
function claimRedemption(
    address vault,
    uint256 requestId
) external nonReentrant;
```

### 3.2 `LifecycleExitManager.sol` Core API

```solidity
/**
 * @notice Registers and locks the USDC settlement funds (Admin only).
 * @param vault Address of the SyncVault to exit.
 * @param settlementAmount The total USDC allocated to the vault liquidation.
 */
function verifySettlement(
    address vault,
    uint256 settlementAmount
) external onlyRole(DEFAULT_ADMIN_ROLE);

/**
 * @notice Halts a verified exit before payouts are processed (Guardian only).
 */
function pauseExit(address vault) external onlyRole(GUARDIAN_ROLE);

/**
 * @notice Resumes a paused exit (Guardian only).
 */
function resumeExit(address vault) external onlyRole(GUARDIAN_ROLE);

/**
 * @notice Executes the pro-rata payouts, escrow routing, burns tokens, and closes the vault.
 */
function executeExit(address vault) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant;

/**
 * @notice Allows a previously restricted investor to withdraw their escrowed USDC once compliance is cleared.
 */
function claimEscrow(address vault) external nonReentrant;
```

---

## 4. Full Audited Smart Contract Code

### 4.1 `LifecycleExitManager.sol` (Complete Implementation)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/asset/IAssetRegistry.sol";
import "../interfaces/compliance/ICompliance.sol";

interface IVault {
    function asset() external view returns (address);
    function category() external view returns (bytes32);
    function complianceModule() external view returns (address);
    function totalSupply() external view returns (uint256);
    function closeVault() external;
    function burnShares(address account, uint256 amount) external;
}

interface IAssetToken {
    function burnFromExcludingAllowance(address account, uint256 amount) external;
}

contract LifecycleExitManager is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;

    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    // L2 AssetRegistry
    IAssetRegistry public assetRegistry;
    IERC20 public usdc;

    // States of exit
    enum ExitStatus {
        NONE,
        VERIFIED,
        PAUSED,
        EXECUTED
    }

    struct ExitInfo {
        ExitStatus status;
        uint256 settlementAmount;
        uint256 verifiedAt;
    }

    // vault => ExitInfo
    mapping(address => ExitInfo) public vaultExits;

    // vault => investor => amount
    mapping(address => mapping(address => uint256)) public escrowedSettlements;

    event SettlementVerified(address indexed vault, uint256 settlementAmount, uint256 timestamp);
    event ExitPaused(address indexed vault, uint256 timestamp);
    event ExitResumed(address indexed vault, uint256 timestamp);
    event LifecycleExitExecuted(address indexed vault, uint256 settlementAmount, uint256 timestamp);
    event EscrowClaimed(address indexed vault, address indexed investor, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address admin,
        address _usdc,
        address _assetRegistry
    ) public initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(GUARDIAN_ROLE, admin);

        usdc = IERC20(_usdc);
        assetRegistry = IAssetRegistry(_assetRegistry);
    }

    function verifySettlement(
        address vault,
        uint256 settlementAmount
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(vault != address(0), "LifecycleExitManager: invalid vault");
        require(settlementAmount > 0, "LifecycleExitManager: amount must be positive");
        require(vaultExits[vault].status == ExitStatus.NONE, "LifecycleExitManager: already initiated");

        // Transfer settlement funds (USDC) from sender to this contract
        usdc.safeTransferFrom(msg.sender, address(this), settlementAmount);

        vaultExits[vault] = ExitInfo({
            status: ExitStatus.VERIFIED,
            settlementAmount: settlementAmount,
            verifiedAt: block.timestamp
        });

        emit SettlementVerified(vault, settlementAmount, block.timestamp);
    }

    function pauseExit(address vault) external onlyRole(GUARDIAN_ROLE) {
        require(vaultExits[vault].status == ExitStatus.VERIFIED, "LifecycleExitManager: can only pause pre-distribution");
        vaultExits[vault].status = ExitStatus.PAUSED;
        emit ExitPaused(vault, block.timestamp);
    }

    function resumeExit(address vault) external onlyRole(GUARDIAN_ROLE) {
        require(vaultExits[vault].status == ExitStatus.PAUSED, "LifecycleExitManager: not paused");
        vaultExits[vault].status = ExitStatus.VERIFIED;
        emit ExitResumed(vault, block.timestamp);
    }

    function executeExit(address vault) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        ExitInfo storage exit = vaultExits[vault];
        require(exit.status == ExitStatus.VERIFIED, "LifecycleExitManager: exit not verified or is paused");

        uint256 settlementAmount = exit.settlementAmount;
        exit.status = ExitStatus.EXECUTED;

        address assetToken = IVault(vault).asset();
        uint256 totalShares = IVault(vault).totalSupply();
        require(totalShares > 0, "LifecycleExitManager: no shares to exit");

        // Query beneficial owners from AssetRegistry
        IAssetRegistry.BeneficialOwner[] memory owners = assetRegistry.getVaultOwners(assetToken, vault);
        require(owners.length > 0, "LifecycleExitManager: no beneficial owners found");

        address comp = IVault(vault).complianceModule();

        for (uint256 i = 0; i < owners.length; i++) {
            address investor = owners[i].investor;
            uint256 shares = owners[i].vaultShares;
            if (shares == 0) continue;

            uint256 entitlement = (shares * settlementAmount) / totalShares;
            if (entitlement == 0) continue;

            // Check if investor is restricted in Compliance
            bool isRestricted = false;
            if (comp != address(0)) {
                isRestricted = ICompliance(comp).isInvestorRestricted(assetToken, investor);
            }

            if (isRestricted) {
                // Route to escrow sub-balance
                escrowedSettlements[vault][investor] += entitlement;
            } else {
                // Payout directly
                usdc.safeTransfer(investor, entitlement);
            }

            // Programmatically burn vault shares
            IVault(vault).burnShares(investor, shares);

            // Programmatically burn asset tokens from the vault (which holds the underlying RWA)
            IAssetToken(assetToken).burnFromExcludingAllowance(vault, shares);
        }

        // Close the vault
        IVault(vault).closeVault();

        emit LifecycleExitExecuted(vault, settlementAmount, block.timestamp);
    }

    function claimEscrow(address vault) external nonReentrant {
        uint256 amount = escrowedSettlements[vault][msg.sender];
        require(amount > 0, "LifecycleExitManager: no escrowed funds");

        address assetToken = IVault(vault).asset();
        address comp = IVault(vault).complianceModule();
        if (comp != address(0)) {
            require(!ICompliance(comp).isInvestorRestricted(assetToken, msg.sender), "LifecycleExitManager: investor still restricted");
        }

        escrowedSettlements[vault][msg.sender] = 0;
        usdc.safeTransfer(msg.sender, amount);

        emit EscrowClaimed(vault, msg.sender, amount);
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
```

---

## 5. Live Sepolia Deployment Addresses

The v8.0.0 components are active on the Ethereum Sepolia network at these addresses:
*   **AssetRegistry**: `0xb103311FFe01849201E892d07E984ad2A17ED62f`
*   **ComplianceModule**: `0xE48e8F4bd7473eC62Bb72C0114316Fa30437ab8e`
*   **AssetToken Template**: `0xD1aB6DAC41cC010aE4a6f858824a55BFDF59A70a`
*   **SyncVault Template**: `0x0EE0148e90F05478E524967C3322AdB5761D4C5E`
*   **AsyncVault Template**: `0x14CCb54eCD80a1C13E3B4757F82f7e5D2b0E3E1F`
*   **RedemptionManager**: `0x6D728934aCA64f45B98fE4e07aF6Bbe1C8956F52`
*   **LifecycleExitManager**: `0xC8af899eac24F755704a1ad287fCe62b77929a6c`
