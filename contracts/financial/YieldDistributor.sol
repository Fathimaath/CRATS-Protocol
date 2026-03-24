// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../utils/AssetConfig.sol";

/**
 * @title YieldDistributor
 * @dev Manages yield distribution for RWA vaults
 *
 * Handles different yield types:
 * - Rental income (real estate)
 * - Dividends (equity)
 * - Interest (debt instruments)
 * - Royalties (IP, art)
 *
 * Yield is distributed to vaults, increasing share price
 * rather than minting new shares (ERC-4626 standard).
 *
 * @dev Integrates with Layer 1 InvestorRightsRegistry for entitlement tracking
 */
contract YieldDistributor is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ========== State Variables ==========

    /// @dev Vault registry address
    address public vaultRegistry;

    /// @dev Layer 1 Investor Rights Registry
    address public investorRightsRegistry;

    /// @dev Yield schedules: vault => schedule ID => YieldSchedule
    mapping(address => mapping(bytes32 => YieldSchedule)) public yieldSchedules;

    /// @dev Yield history: vault => schedule ID => YieldPayment[]
    mapping(address => mapping(bytes32 => YieldPayment[])) public yieldHistory;

    /// @dev Pending yield: vault => amount
    mapping(address => uint256) public pendingYield;

    /// @dev Total distributed yield: vault => total
    mapping(address => uint256) public totalDistributed;

    /// @dev Schedule IDs per vault
    mapping(address => bytes32[]) public vaultScheduleIds;

    // ========== Structs ==========

    /**
     * @dev Yield schedule configuration
     */
    struct YieldSchedule {
        string name;              // Schedule name (e.g., "Monthly Rent")
        IERC20 yieldToken;        // Token address for yield
        uint256 amount;           // Expected amount per period
        uint256 frequency;        // Frequency in seconds
        uint256 lastDistribution; // Last distribution timestamp
        uint256 nextDue;          // Next due timestamp
        bool active;              // Schedule active status
        YieldType yieldType;      // Type of yield
    }

    /**
     * @dev Yield payment record
     */
    struct YieldPayment {
        uint256 amount;           // Amount distributed
        uint256 timestamp;        // Distribution timestamp
        address distributor;      // Who distributed
        YieldType yieldType;      // Type of yield
        bytes32 scheduleId;       // Associated schedule
    }

    /**
     * @dev Yield types
     */
    enum YieldType {
        RENTAL_INCOME,      // Real estate rent
        DIVIDEND,           // Corporate dividends
        INTEREST,           // Debt interest
        ROYALTY,            // IP/art royalties
        CAPITAL_GAINS,      // Asset sale proceeds
        REFINANCING,        // Refinancing proceeds
        OTHER               // Other income
    }

    // ========== Events ==========

    event YieldScheduleCreated(
        address indexed vault,
        bytes32 indexed scheduleId,
        string name,
        YieldType yieldType,
        uint256 amount,
        uint256 frequency
    );

    event YieldDistributed(
        address indexed vault,
        bytes32 indexed scheduleId,
        uint256 amount,
        address indexed distributor,
        YieldType yieldType
    );

    event YieldClaimed(
        address indexed vault,
        uint256 amount,
        address indexed claimer
    );

    event YieldScheduleUpdated(
        address indexed vault,
        bytes32 indexed scheduleId,
        uint256 amount,
        uint256 frequency
    );

    event YieldScheduleDeactivated(
        address indexed vault,
        bytes32 indexed scheduleId
    );

    // ========== Roles ==========

    bytes32 public constant DISTRIBUTOR_ROLE = keccak256("DISTRIBUTOR_ROLE");
    bytes32 public constant VAULT_CREATOR_ROLE = keccak256("VAULT_CREATOR_ROLE");

    // ========== Constructor ==========

    constructor(address admin) {
        require(admin != address(0), "YieldDistributor: Admin cannot be zero");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(DISTRIBUTOR_ROLE, admin);
        _grantRole(VAULT_CREATOR_ROLE, admin);
    }

    // ========== Yield Schedule Management ==========

    /**
     * @dev Create a yield schedule for a vault
     */
    function createYieldSchedule(
        address vault,
        string calldata name,
        IERC20 yieldToken,
        uint256 amount,
        uint256 frequency,
        YieldType yieldType
    ) external onlyRole(VAULT_CREATOR_ROLE) returns (bytes32 scheduleId) {
        require(vault != address(0), "YieldDistributor: Invalid vault");
        require(address(yieldToken) != address(0), "YieldDistributor: Invalid token");
        require(frequency > 0, "YieldDistributor: Frequency must be positive");

        // Generate schedule ID
        scheduleId = keccak256(abi.encodePacked(vault, name, block.timestamp));

        // Create schedule
        yieldSchedules[vault][scheduleId] = YieldSchedule({
            name: name,
            yieldToken: yieldToken,
            amount: amount,
            frequency: frequency,
            lastDistribution: 0,
            nextDue: block.timestamp + frequency,
            active: true,
            yieldType: yieldType
        });

        vaultScheduleIds[vault].push(scheduleId);

        emit YieldScheduleCreated(vault, scheduleId, name, yieldType, amount, frequency);
    }

    /**
     * @dev Update yield schedule parameters
     */
    function updateYieldSchedule(
        address vault,
        bytes32 scheduleId,
        uint256 newAmount,
        uint256 newFrequency
    ) external onlyRole(VAULT_CREATOR_ROLE) {
        require(yieldSchedules[vault][scheduleId].active, "YieldDistributor: Schedule not active");

        YieldSchedule storage schedule = yieldSchedules[vault][scheduleId];
        schedule.amount = newAmount;
        schedule.frequency = newFrequency;

        emit YieldScheduleUpdated(vault, scheduleId, newAmount, newFrequency);
    }

    /**
     * @dev Deactivate a yield schedule
     */
    function deactivateYieldSchedule(
        address vault,
        bytes32 scheduleId
    ) external onlyRole(VAULT_CREATOR_ROLE) {
        require(yieldSchedules[vault][scheduleId].active, "YieldDistributor: Schedule not active");

        yieldSchedules[vault][scheduleId].active = false;

        emit YieldScheduleDeactivated(vault, scheduleId);
    }

    // ========== Yield Distribution ==========

    /**
     * @dev Distribute yield to a vault
     * @param vault The vault address
     * @param amount The amount to distribute
     * @param scheduleId The associated schedule ID (can be bytes32(0) for one-time)
     */
    function distributeYield(
        address vault,
        uint256 amount,
        bytes32 scheduleId
    ) external nonReentrant returns (bool) {
        require(vault != address(0), "YieldDistributor: Invalid vault");
        require(amount > 0, "YieldDistributor: Amount must be positive");

        YieldSchedule storage schedule = yieldSchedules[vault][scheduleId];

        // Validate schedule if provided
        if (scheduleId != bytes32(0)) {
            require(schedule.active, "YieldDistributor: Schedule not active");

            // Update schedule
            schedule.lastDistribution = block.timestamp;
            schedule.nextDue = block.timestamp + schedule.frequency;
        }

        // Transfer yield tokens to vault
        schedule.yieldToken.safeTransferFrom(msg.sender, vault, amount);

        // Update tracking
        pendingYield[vault] += amount;
        totalDistributed[vault] += amount;

        // Record payment
        yieldHistory[vault][scheduleId].push(YieldPayment({
            amount: amount,
            timestamp: block.timestamp,
            distributor: msg.sender,
            yieldType: schedule.yieldType,
            scheduleId: scheduleId
        }));

        emit YieldDistributed(vault, scheduleId, amount, msg.sender, schedule.yieldType);

        return true;
    }

    /**
     * @dev Distribute yield directly to vault (calls vault's distributeYield)
     */
    function distributeYieldToVault(
        address vault,
        uint256 amount,
        bytes32 scheduleId
    ) external nonReentrant returns (bool) {
        require(vault != address(0), "YieldDistributor: Invalid vault");
        require(amount > 0, "YieldDistributor: Amount must be positive");

        YieldSchedule storage schedule = yieldSchedules[vault][scheduleId];

        // Validate schedule if provided
        if (scheduleId != bytes32(0)) {
            require(schedule.active, "YieldDistributor: Schedule not active");
            schedule.lastDistribution = block.timestamp;
            schedule.nextDue = block.timestamp + schedule.frequency;
        }

        // Transfer yield tokens to vault
        schedule.yieldToken.safeTransferFrom(msg.sender, vault, amount);

        // Call vault's distributeYield function
        (bool success, ) = vault.call(
            abi.encodeWithSignature("distributeYield(uint256)", amount)
        );
        require(success, "YieldDistributor: Vault distribution failed");

        // Record payment
        yieldHistory[vault][scheduleId].push(YieldPayment({
            amount: amount,
            timestamp: block.timestamp,
            distributor: msg.sender,
            yieldType: schedule.yieldType,
            scheduleId: scheduleId
        }));

        emit YieldDistributed(vault, scheduleId, amount, msg.sender, schedule.yieldType);

        return true;
    }

    // ========== View Functions ==========

    /**
     * @dev Get yield schedule details
     */
    function getYieldSchedule(address vault, bytes32 scheduleId)
        external
        view
        returns (YieldSchedule memory)
    {
        return yieldSchedules[vault][scheduleId];
    }

    /**
     * @dev Get yield history for a vault and schedule
     */
    function getYieldHistory(address vault, bytes32 scheduleId)
        external
        view
        returns (YieldPayment[] memory)
    {
        return yieldHistory[vault][scheduleId];
    }

    /**
     * @dev Get latest yield payment
     */
    function getLatestYieldPayment(address vault, bytes32 scheduleId)
        external
        view
        returns (YieldPayment memory)
    {
        YieldPayment[] memory history = yieldHistory[vault][scheduleId];
        require(history.length > 0, "YieldDistributor: No yield history");
        return history[history.length - 1];
    }

    /**
     * @dev Get all schedule IDs for a vault
     */
    function getVaultScheduleIds(address vault)
        external
        view
        returns (bytes32[] memory)
    {
        return vaultScheduleIds[vault];
    }

    /**
     * @dev Check if yield is due for a schedule
     */
    function isYieldDue(address vault, bytes32 scheduleId)
        external
        view
        returns (bool)
    {
        YieldSchedule memory schedule = yieldSchedules[vault][scheduleId];
        return schedule.active && block.timestamp >= schedule.nextDue;
    }

    /**
     * @dev Get total pending yield for a vault
     */
    function getPendingYield(address vault) external view returns (uint256) {
        return pendingYield[vault];
    }

    // ========== Configuration ==========

    /**
     * @dev Set vault registry address
     */
    function setVaultRegistry(address registry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(registry != address(0), "YieldDistributor: Invalid registry");
        vaultRegistry = registry;
    }

    /**
     * @dev Set Layer 1 Investor Rights Registry
     */
    function setInvestorRightsRegistry(address registry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(registry != address(0), "YieldDistributor: Invalid registry");
        investorRightsRegistry = registry;
    }

    // ========== Emergency Functions ==========

    /**
     * @dev Emergency withdrawal of stuck tokens
     */
    function emergencyWithdraw(
        IERC20 token,
        uint256 amount,
        address to
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(to != address(0), "YieldDistributor: Invalid address");
        token.safeTransfer(to, amount);
    }

    // ========== Version ==========

    function version() external pure virtual returns (string memory) {
        return AssetConfig.VERSION;
    }
}
