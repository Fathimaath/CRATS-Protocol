// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "../interfaces/identity/IInvestorRightsRegistry.sol";
import "../interfaces/identity/IIdentityRegistry.sol";
import "../utils/CRATSConfig.sol";

/**
 * @title InvestorRightsRegistry
 * @dev On-chain registry for tracking and enforcing investor rights.
 * // Source: ERC-3643 T-REX Compliance Pattern
 */
contract InvestorRightsRegistry is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable,
    IInvestorRightsRegistry
{
    IIdentityRegistry public identityRegistry;

    // investor -> tokenContract -> rights
    mapping(address => mapping(address => InvestorRights)) private _rights;

    // NEW: Rights enforcement tracking
    mapping(bytes32 => bool) private _enforcementExecuted;

    event RightsRegistered(
        address indexed investor,
        address indexed tokenContract,
        bool hasVoting,
        bool hasDividend,
        bool hasRedemption
    );
    event DividendClaimed(
        address indexed investor,
        address indexed tokenContract,
        uint256 amount
    );
    event VoteExercised(
        address indexed investor,
        address indexed tokenContract,
        uint256 amount
    );
    event RedemptionRequested(
        address indexed investor,
        address indexed tokenContract,
        uint256 redemptionValue
    );
    // NEW: Enforcement event
    event RightEnforced(
        address indexed investor,
        address indexed tokenContract,
        uint8 rightType,
        bytes data
    );

    // Right type constants
    uint8 public constant RIGHT_DIVIDEND = 1;
    uint8 public constant RIGHT_VOTE = 2;
    uint8 public constant RIGHT_REDEMPTION = 3;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address admin,
        address identityRegistry_
    ) public initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        identityRegistry = IIdentityRegistry(identityRegistry_);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(CRATSConfig.COMPLIANCE_ROLE, admin);
    }

    // === Admin Functions ===

    function registerRights(
        address investor,
        address tokenContract,
        bool hasVoting,
        bool hasDividend,
        bool hasRedemption,
        uint256 votingPower,
        uint256 redemptionValue,
        uint64 windowStart,
        uint64 windowEnd
    ) external override onlyRole(CRATSConfig.COMPLIANCE_ROLE) {
        require(identityRegistry.isVerified(investor), "InvestorRightsRegistry: investor not verified");

        InvestorRights storage r = _rights[investor][tokenContract];
        r.tokenContract = tokenContract;
        r.hasVotingRights = hasVoting;
        r.hasDividendRights = hasDividend;
        r.hasRedemptionRights = hasRedemption;
        r.votingPower = votingPower;
        r.redemptionValue = redemptionValue;
        r.redemptionWindowStart = windowStart;
        r.redemptionWindowEnd = windowEnd;
        r.registeredAt = uint64(block.timestamp);
        r.updatedAt = uint64(block.timestamp);

        emit RightsRegistered(investor, tokenContract, hasVoting, hasDividend, hasRedemption);
    }

    // === Investor Life-cycle Functions ===

    function claimDividend(address investor, address tokenContract)
        external
        override
        nonReentrant
        onlyRole(CRATSConfig.COMPLIANCE_ROLE)
    {
        InvestorRights storage r = _rights[investor][tokenContract];
        require(r.hasDividendRights, "InvestorRightsRegistry: no dividend rights");
        uint256 amount = r.pendingDividend;
        require(amount > 0, "InvestorRightsRegistry: no pending dividend");

        r.pendingDividend = 0;
        r.claimedDividend += amount;
        r.lastClaimAt = uint64(block.timestamp);

        emit DividendClaimed(investor, tokenContract, amount);
    }

    function exerciseVote(
        address investor,
        address tokenContract,
        uint256 voteAmount
    ) external override onlyRole(CRATSConfig.COMPLIANCE_ROLE) {
        InvestorRights storage r = _rights[investor][tokenContract];
        require(r.hasVotingRights, "InvestorRightsRegistry: no voting rights");
        require(voteAmount <= r.votingPower - r.votesCast, "InvestorRightsRegistry: insufficient power");

        r.votesCast += voteAmount;
        r.lastVoteAt = uint64(block.timestamp);

        emit VoteExercised(investor, tokenContract, voteAmount);
    }

    function requestRedemption(address investor, address tokenContract)
        external
        override
        onlyRole(CRATSConfig.COMPLIANCE_ROLE)
    {
        InvestorRights storage r = _rights[investor][tokenContract];
        require(r.hasRedemptionRights, "InvestorRightsRegistry: no redemption rights");
        require(
            block.timestamp >= r.redemptionWindowStart &&
            block.timestamp <= r.redemptionWindowEnd,
            "InvestorRightsRegistry: outside window"
        );
        require(!r.redemptionRequested, "InvestorRightsRegistry: already requested");

        r.redemptionRequested = true;
        r.updatedAt = uint64(block.timestamp);

        emit RedemptionRequested(investor, tokenContract, r.redemptionValue);
    }

    // ============================================================
    // NEW: Rights Enforcement (Regulatory/Issuer Enforcement)
    // ============================================================

    /**
     * @notice Enforce investor rights (regulator/issuer only).
     * @dev Can be used to force dividend payment, enable voting, or process redemption.
     *      Right types: 1=Dividend, 2=Vote, 3=Redemption
     */
    function enforceRight(
        address investor,
        address tokenContract,
        uint8 rightType,
        bytes calldata data
    ) external override onlyRole(CRATSConfig.COMPLIANCE_ROLE) {
        require(identityRegistry.isVerified(investor), "InvestorRightsRegistry: investor not verified");

        bytes32 enforcementKey = keccak256(abi.encodePacked(investor, tokenContract, rightType, block.timestamp));
        require(!_enforcementExecuted[enforcementKey], "InvestorRightsRegistry: enforcement already executed");

        InvestorRights storage r = _rights[investor][tokenContract];

        if (rightType == RIGHT_DIVIDEND) {
            // Force dividend payment
            uint256 amount = abi.decode(data, (uint256));
            r.pendingDividend = 0;
            r.claimedDividend += amount;
            r.lastClaimAt = uint64(block.timestamp);
            emit DividendClaimed(investor, tokenContract, amount);
        } else if (rightType == RIGHT_VOTE) {
            // Force vote enable
            (uint256 votingPower) = abi.decode(data, (uint256));
            r.hasVotingRights = true;
            r.votingPower = votingPower;
        } else if (rightType == RIGHT_REDEMPTION) {
            // Force redemption processing
            uint256 redemptionValue = abi.decode(data, (uint256));
            r.hasRedemptionRights = true;
            r.redemptionValue = redemptionValue;
            r.redemptionRequested = true;
            emit RedemptionRequested(investor, tokenContract, redemptionValue);
        } else {
            revert("InvestorRightsRegistry: invalid right type");
        }

        _enforcementExecuted[enforcementKey] = true;
        r.updatedAt = uint64(block.timestamp);

        emit RightEnforced(investor, tokenContract, rightType, data);
    }

    // === Views ===

    function getRights(address investor, address tokenContract)
        external
        view
        override
        returns (InvestorRights memory)
    {
        return _rights[investor][tokenContract];
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
