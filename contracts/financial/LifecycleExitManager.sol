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
import "../interfaces/financial/INAVOracle.sol";
import "../interfaces/financial/IRedemptionManager.sol";
import "../interfaces/financial/ITreasury.sol";

interface IVault {
    function asset() external view returns (address);
    function category() external view returns (bytes32);
    function complianceModule() external view returns (address);
    function totalSupply() external view returns (uint256);
    function closeVault() external;
    function burnShares(address account, uint256 amount) external;
    function assetId() external view returns (bytes32);
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

    // Per-vault batch tracking & idempotency
    mapping(address => mapping(address => bool)) public hasHolderExited;
    mapping(address => uint256) public totalSharesProcessed;
    mapping(address => uint256) public initialTotalShares;

    // v10 Precondition State
    address public navOracle;
    address public redemptionManager;
    address public governanceMultisig;
    address public treasury;
    address public ownershipSyncManager;
    uint256 public settlementVarianceBPS; // e.g. 500 = 5%

    event SettlementVerified(address indexed vault, uint256 settlementAmount, uint256 timestamp);
    event ExitPaused(address indexed vault, uint256 timestamp);
    event ExitResumed(address indexed vault, uint256 timestamp);
    event LifecycleExitExecuted(address indexed vault, uint256 settlementAmount, uint256 timestamp);
    event ExitBatchExecuted(address indexed vault, uint256 count, uint256 sharesProcessed);
    event ExitFinalized(address indexed vault, uint256 timestamp);
    event EscrowClaimed(address indexed vault, address indexed investor, uint256 amount);
    event UnclaimedEscrowSwept(address indexed vault, address indexed holder, address indexed recipient, uint256 amount);

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
        settlementVarianceBPS = 500; // default 5%
    }

    // === Setters for v10 features ===

    function setNAVOracle(address _navOracle) external onlyRole(DEFAULT_ADMIN_ROLE) {
        navOracle = _navOracle;
    }

    function setRedemptionManager(address _redemptionManager) external onlyRole(DEFAULT_ADMIN_ROLE) {
        redemptionManager = _redemptionManager;
    }

    function setGovernanceMultisig(address _governanceMultisig) external onlyRole(DEFAULT_ADMIN_ROLE) {
        governanceMultisig = _governanceMultisig;
    }

    function setTreasury(address _treasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        treasury = _treasury;
    }

    function setOwnershipSyncManager(address _syncManager) external onlyRole(DEFAULT_ADMIN_ROLE) {
        ownershipSyncManager = _syncManager;
    }

    function setSettlementVarianceBPS(uint256 _bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        settlementVarianceBPS = _bps;
    }

    function verifySettlement(
        address vault,
        uint256 settlementAmount
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(vault != address(0), "LifecycleExitManager: invalid vault");
        require(settlementAmount > 0, "LifecycleExitManager: amount must be positive");
        require(vaultExits[vault].status == ExitStatus.NONE, "LifecycleExitManager: already initiated");

        address assetToken = IVault(vault).asset();
        require(assetRegistry.isVaultRegistered(assetToken, vault), "LifecycleExitManager: vault not registered");

        // Precondition #5: Validate NAV variance
        if (navOracle != address(0)) {
            bytes32 assetId = IVault(vault).assetId();
            if (assetId == bytes32(0)) {
                assetId = bytes32(uint256(uint160(assetToken)));
            }
            uint256 navPerToken = INAVOracle(navOracle).getWeightedNAV(assetId);
            uint256 totalSupply = IVault(vault).totalSupply();
            uint256 expectedSettlement = (totalSupply * navPerToken) / 1e18;
            uint256 diff = settlementAmount > expectedSettlement ? settlementAmount - expectedSettlement : expectedSettlement - settlementAmount;
            require(diff * 10000 / expectedSettlement <= settlementVarianceBPS, "LifecycleExitManager: settlement variance exceeds limit");
        }

        // Precondition #6: No pending redemptions
        if (redemptionManager != address(0)) {
            require(IRedemptionManager(redemptionManager).getPendingRequestsCount(vault) == 0, "LifecycleExitManager: pending redemptions exist");
            // Lock RedemptionManager from accepting new redemptions for this vault
            IRedemptionManager(redemptionManager).lockVaultForExit(vault);
        }

        // Precondition #7: Governance approval
        if (governanceMultisig != address(0)) {
            bytes32 opHash = keccak256(abi.encodePacked(vault, settlementAmount));
            // Verify that N-of-M signers have signed the operation
            (bool success, bytes memory data) = governanceMultisig.staticcall(
                abi.encodeWithSignature("hasApproval(bytes32)", opHash)
            );
            if (success) {
                bool approved = abi.decode(data, (bool));
                require(approved, "LifecycleExitManager: governance not approved");
            }
        }

        // Precondition #8: Treasury settlement confirmed
        if (treasury != address(0)) {
            require(ITreasury(treasury).confirmSettlementAvailable(vault, settlementAmount), "LifecycleExitManager: treasury funds not confirmed");
        }

        // Transfer settlement funds (USDC) from sender to this contract
        usdc.safeTransferFrom(msg.sender, address(this), settlementAmount);

        initialTotalShares[vault] = IVault(vault).totalSupply();
        totalSharesProcessed[vault] = 0;

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

    /**
     * @notice Executes exit distributions in batches to prevent block gas limit exhaustion
     */
    function executeExitBatch(
        address vault,
        address[] calldata investors
    ) public onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        ExitInfo storage exit = vaultExits[vault];
        require(exit.status == ExitStatus.VERIFIED, "LifecycleExitManager: exit not verified or is paused");
        require(investors.length > 0, "LifecycleExitManager: no investors provided");

        uint256 settlementAmount = exit.settlementAmount;
        address assetToken = IVault(vault).asset();
        uint256 totalShares = initialTotalShares[vault];
        if (totalShares == 0) {
            totalShares = IVault(vault).totalSupply() + totalSharesProcessed[vault];
            initialTotalShares[vault] = totalShares;
        }
        require(totalShares > 0, "LifecycleExitManager: no shares to exit");

        address comp = IVault(vault).complianceModule();
        uint256 batchSharesProcessed = 0;

        for (uint256 i = 0; i < investors.length; i++) {
            address investor = investors[i];
            if (hasHolderExited[vault][investor]) continue; // Idempotent: skip already processed

            IAssetRegistry.BeneficialOwner memory record = assetRegistry.getBeneficialOwner(assetToken, vault, investor);
            uint256 shares = record.vaultShares;
            if (shares == 0) continue;

            hasHolderExited[vault][investor] = true;

            uint256 entitlement = (shares * settlementAmount) / totalShares;
            if (entitlement > 0) {
                // Check if investor is restricted in Compliance
                bool isRestricted = false;
                if (comp != address(0)) {
                    try ICompliance(comp).isInvestorRestricted(assetToken, investor) returns (bool _restricted) {
                        isRestricted = _restricted;
                    } catch {}
                }

                if (isRestricted) {
                    // Route to escrow sub-balance
                    escrowedSettlements[vault][investor] += entitlement;
                } else {
                    // Payout directly
                    usdc.safeTransfer(investor, entitlement);
                }
            }

            // Programmatically burn vault shares
            IVault(vault).burnShares(investor, shares);

            // Programmatically burn asset tokens from the vault (which holds the underlying RWA)
            IAssetToken(assetToken).burnFromExcludingAllowance(vault, shares);

            batchSharesProcessed += shares;
        }

        totalSharesProcessed[vault] += batchSharesProcessed;
        emit ExitBatchExecuted(vault, investors.length, batchSharesProcessed);
    }

    /**
     * @notice Finalizes vault exit once 100% of shares have been settled across batches
     */
    function finalizeExit(address vault) public onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        ExitInfo storage exit = vaultExits[vault];
        require(exit.status == ExitStatus.VERIFIED, "LifecycleExitManager: exit not verified");
        
        uint256 remainingSupply = IVault(vault).totalSupply();
        require(remainingSupply == 0, "LifecycleExitManager: shares not fully burned");

        exit.status = ExitStatus.EXECUTED;

        address assetToken = IVault(vault).asset();

        // BOR synchronized
        if (ownershipSyncManager != address(0)) {
            (bool success, ) = ownershipSyncManager.call(
                abi.encodeWithSignature("updateOnVaultClosure(address,address)", assetToken, vault)
            );
            require(success, "LifecycleExitManager: BOR sync failed");
        }

        // Close the vault
        IVault(vault).closeVault();

        emit ExitFinalized(vault, block.timestamp);
        emit LifecycleExitExecuted(vault, exit.settlementAmount, block.timestamp);
    }

    /**
     * @notice Single-transaction execution wrapper for backwards compatibility
     */
    function executeExit(
        address vault,
        address[] calldata investors
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        executeExitBatch(vault, investors);
        finalizeExit(vault);
    }

    /**
     * @notice Governance/Compliance recovery for permanently locked escrow
     */
    function sweepUnclaimedEscrow(
        address vault,
        address restrictedHolder,
        address recipient
    ) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        require(recipient != address(0), "LifecycleExitManager: invalid recipient");
        uint256 amount = escrowedSettlements[vault][restrictedHolder];
        require(amount > 0, "LifecycleExitManager: no escrowed funds");

        escrowedSettlements[vault][restrictedHolder] = 0;
        usdc.safeTransfer(recipient, amount);

        emit UnclaimedEscrowSwept(vault, restrictedHolder, recipient, amount);
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
