// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// ─── External Interface ───────────────────────────────────────────────────────

interface INavOracleDispute {
    struct ChallengeStake {
        address challenger;
        uint256 amount;
        bool    refunded;
    }
    function challengeStakes(bytes32 assetId) external view returns (ChallengeStake memory);
    function activeDispute(bytes32 assetId)   external view returns (bool);
    function resolveDispute(bytes32 assetId, uint256 resolvedValue, bytes32 evidence) external;
    function usdc()                           external view returns (address);
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * @title DisputeResolver
 * @notice v1.0.0 — Standalone contract that resolves NAV disputes filed via NAVOracle.
 *
 * Resolution Logic:
 *   Challenger Correct
 *     → Return Stake (full USDC stake back to challenger)
 *     → Optional Reward (configurable rewardAmount, default 0, paid from treasury)
 *
 *   Challenger Wrong
 *     → Stake Slashed (stake transferred to protocolTreasury)
 *     → Emit StakeSlashed event
 *
 * This contract holds RESOLVER_ROLE on NAVOracle and calls
 * navOracle.resolveDispute() after emitting its own events.
 * The USDC stake is custodied inside NAVOracle itself.
 */
contract DisputeResolver is
    Initializable,
    UUPSUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20 for IERC20;

    string public constant VERSION = "1.0.0";

    // ─── Roles ───────────────────────────────────────────────
    bytes32 public constant RESOLVER_ROLE = keccak256("RESOLVER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // ─── State ───────────────────────────────────────────────
    address public navOracle;
    IERC20  public usdc;
    address public protocolTreasury;

    /// @notice Optional USDC bonus for correct challengers. Default = 0.
    uint256 public rewardAmount;

    // ─── Events ──────────────────────────────────────────────
    event DisputeResolvedCorrect(
        bytes32 indexed assetId,
        address indexed challenger,
        uint256 stakeReturned,
        uint256 rewardPaid
    );
    event DisputeResolvedWrong(
        bytes32 indexed assetId,
        address indexed challenger,
        uint256 stakeSlashed,
        address indexed slashedTo
    );
    event RewardAmountUpdated(uint256 oldAmount, uint256 newAmount);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);

    // ─── Initialize ──────────────────────────────────────────
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _navOracle,
        address _protocolTreasury,
        address _admin
    ) public initializer {
        require(_navOracle != address(0),        "DisputeResolver: zero navOracle");
        require(_protocolTreasury != address(0), "DisputeResolver: zero treasury");
        require(_admin != address(0),            "DisputeResolver: zero admin");

        __UUPSUpgradeable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(RESOLVER_ROLE,      _admin);
        _grantRole(UPGRADER_ROLE,      _admin);

        navOracle        = _navOracle;
        protocolTreasury = _protocolTreasury;

        // Sync USDC address from NAVOracle so they stay consistent
        usdc = IERC20(INavOracleDispute(_navOracle).usdc());
    }

    // ═══════════════════════════════════════════════════════════
    // SECTION 1: DISPUTE RESOLUTION
    // ═══════════════════════════════════════════════════════════

    /**
     * @notice Resolve a NAV dispute. Only callable by RESOLVER_ROLE.
     *
     * @param assetId           The asset identifier under dispute
     * @param resolvedValue     The accepted NAV value after resolver review
     * @param evidence          Evidence hash for audit trail
     * @param challengerCorrect True if challenger was right; false if original submission stands
     *
     * When challengerCorrect == true:
     *   NAVOracle.resolveDispute() returns stake to challenger (since resolvedValue matches challengerValue)
     *   Then optionally pulls rewardAmount from treasury to challenger
     *
     * When challengerCorrect == false:
     *   NAVOracle.resolveDispute() slashes stake to insuranceReserve (= protocolTreasury)
     *   Emits StakeSlashed for indexer visibility
     */
    function resolveChallenge(
        bytes32 assetId,
        uint256 resolvedValue,
        bytes32 evidence,
        bool    challengerCorrect
    ) external nonReentrant onlyRole(RESOLVER_ROLE) {
        INavOracleDispute oracle = INavOracleDispute(navOracle);

        require(oracle.activeDispute(assetId), "DisputeResolver: no active dispute");

        // Snapshot stake info before NAVOracle marks it refunded
        INavOracleDispute.ChallengeStake memory stake = oracle.challengeStakes(assetId);
        require(!stake.refunded,                "DisputeResolver: stake already processed");
        require(stake.challenger != address(0), "DisputeResolver: no challenger on record");

        address challenger = stake.challenger;
        uint256 amount     = stake.amount;

        // Delegate stake transfer + state update to NAVOracle
        oracle.resolveDispute(assetId, resolvedValue, evidence);

        if (challengerCorrect) {
            // Optional reward: pull from treasury → challenger
            uint256 reward = 0;
            if (rewardAmount > 0 && protocolTreasury != address(0)) {
                uint256 available = usdc.balanceOf(protocolTreasury);
                if (available >= rewardAmount) {
                    reward = rewardAmount;
                    usdc.safeTransferFrom(protocolTreasury, challenger, reward);
                }
            }
            emit DisputeResolvedCorrect(assetId, challenger, amount, reward);
        } else {
            emit DisputeResolvedWrong(assetId, challenger, amount, protocolTreasury);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // SECTION 2: CONFIGURATION
    // ═══════════════════════════════════════════════════════════

    /**
     * @notice Set optional USDC reward for correct challengers.
     * @param _amount Amount in USDC base units (6 decimals). Set 0 to disable.
     *   Example: setRewardAmount(500_000_000) = 500 USDC reward
     */
    function setRewardAmount(uint256 _amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emit RewardAmountUpdated(rewardAmount, _amount);
        rewardAmount = _amount;
    }

    /// @notice Update protocol treasury (slash destination)
    function setProtocolTreasury(address _treasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_treasury != address(0), "DisputeResolver: zero address");
        emit TreasuryUpdated(protocolTreasury, _treasury);
        protocolTreasury = _treasury;
    }

    /// @notice Re-sync USDC address from NAVOracle if it was updated there
    function syncUSDC() external onlyRole(DEFAULT_ADMIN_ROLE) {
        usdc = IERC20(INavOracleDispute(navOracle).usdc());
    }

    // ═══════════════════════════════════════════════════════════
    // SECTION 3: VIEW
    // ═══════════════════════════════════════════════════════════

    /**
     * @notice Preview what would happen in a resolution without executing.
     */
    function previewResolution(bytes32 assetId)
        external
        view
        returns (
            bool    hasActiveDispute,
            address challenger,
            uint256 stakeAmount,
            bool    alreadyRefunded,
            uint256 potentialReward
        )
    {
        INavOracleDispute oracle = INavOracleDispute(navOracle);
        hasActiveDispute = oracle.activeDispute(assetId);
        INavOracleDispute.ChallengeStake memory s = oracle.challengeStakes(assetId);
        challenger      = s.challenger;
        stakeAmount     = s.amount;
        alreadyRefunded = s.refunded;
        potentialReward = rewardAmount;
    }

    function _authorizeUpgrade(address) internal override onlyRole(UPGRADER_ROLE) {}

    // ─── Storage Gap ─────────────────────────────────────────
    uint256[50] private __gap;
}
