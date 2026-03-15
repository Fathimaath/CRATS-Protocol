// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title IInvestorRightsRegistry
 * @dev Interface for on-chain investor rights tracking and enforcement
 * Supports voting rights, dividend claims, and redemption mechanisms
 * 
 * Regulatory Compliance:
 * - SEC investor protection requirements
 * - MiCA investor rights mandates
 * - Corporate law dividend requirements
 */
interface IInvestorRightsRegistry {

    /**
     * @dev Struct containing investor rights for a token holder
     */
    struct InvestorRights {
        // Token Association
        address tokenContract;
        uint256 balance;

        // Voting Rights
        bool hasVotingRights;
        uint256 votingPower;
        uint256 votesCast;
        uint256 lastVoteAt;

        // Dividend Rights
        bool hasDividendRights;
        uint256 pendingDividend;
        uint256 claimedDividend;
        uint256 lastClaimAt;

        // Redemption Rights
        bool hasRedemptionRights;
        uint256 redemptionValue;
        uint64 redemptionWindowStart;
        uint64 redemptionWindowEnd;
        bool redemptionRequested;

        // ✅ INFORMATION RIGHTS (Section 12.1)
        bool hasInformationRights;
        uint256 disclosuresReceived;
        uint64 lastDisclosureAt;

        // Metadata
        uint64 registeredAt;
        uint64 updatedAt;
    }

    /**
     * @dev Struct for dividend distribution
     */
    struct DividendDistribution {
        address tokenContract;
        uint256 totalAmount;
        uint256 totalShares;
        uint256 dividendPerShare;
        uint64 recordDate;
        uint64 paymentStartDate;
        uint64 paymentEndDate;
        bool isActive;
        uint256 claimedAmount;
    }

    /**
     * @dev Struct for voting proposal
     */
    struct VotingProposal {
        address tokenContract;
        string description;
        uint64 votingStartTime;
        uint64 votingEndTime;
        bool executed;
        uint256 forVotes;
        uint256 againstVotes;
        uint256 abstainVotes;
        bool executedResult;
    }

    // === Events ===

    /**
     * @dev Emitted when investor rights are registered
     */
    event RightsRegistered(
        address indexed tokenContract,
        address indexed investor,
        uint256 votingPower,
        uint256 balance
    );

    /**
     * @dev Emitted when dividend is claimed
     */
    event DividendClaimed(
        address indexed investor,
        address indexed tokenContract,
        uint256 amount
    );

    /**
     * @dev Emitted when vote is cast
     */
    event VoteCast(
        address indexed voter,
        uint256 indexed proposalId,
        uint8 voteType,
        uint256 votingPower
    );

    /**
     * @dev Emitted when redemption is requested
     */
    event RedemptionRequested(
        address indexed investor,
        address indexed tokenContract,
        uint256 amount,
        uint64 timestamp
    );

    /**
     * @dev Emitted when dividend distribution is created
     */
    event DividendDistributionCreated(
        address indexed tokenContract,
        uint256 totalAmount,
        uint64 recordDate,
        uint64 paymentStartDate
    );

    /**
     * @dev Emitted when voting proposal is created
     */
    event VotingProposalCreated(
        uint256 indexed proposalId,
        address indexed tokenContract,
        string description,
        uint64 votingStartTime,
        uint64 votingEndTime
    );

    /**
     * @dev Emitted when information right is enforced (Section 12.1)
     */
    event InformationRightEnforced(
        address indexed tokenContract,
        address indexed investor,
        uint256 timestamp
    );

    /**
     * @dev Emitted when disclosure is recorded
     */
    event DisclosureRecorded(
        address indexed tokenContract,
        address indexed investor,
        uint256 disclosureCount
    );

    // === View Functions ===

    /**
     * @notice Get investor rights for a token holder
     * @param tokenContract Token contract address
     * @param investor Investor address
     * @return InvestorRights struct
     */
    function getRights(address tokenContract, address investor) external view returns (InvestorRights memory);

    /**
     * @notice Get pending dividend for investor
     * @param tokenContract Token contract address
     * @param investor Investor address
     * @return uint256 Pending dividend amount
     */
    function getPendingDividend(address tokenContract, address investor) external view returns (uint256);

    /**
     * @notice Get voting power for investor
     * @param tokenContract Token contract address
     * @param investor Investor address
     * @return uint256 Voting power
     */
    function getVotingPower(address tokenContract, address investor) external view returns (uint256);

    /**
     * @notice Get dividend distribution details
     * @param tokenContract Token contract address
     * @param distributionId Distribution ID
     * @return DividendDistribution struct
     */
    function getDividendDistribution(address tokenContract, uint256 distributionId) 
        external view returns (DividendDistribution memory);

    /**
     * @notice Get voting proposal details
     * @param proposalId Proposal ID
     * @return VotingProposal struct
     */
    function getVotingProposal(uint256 proposalId) external view returns (VotingProposal memory);

    /**
     * @notice Check if investor has voted on proposal
     * @param proposalId Proposal ID
     * @param voter Voter address
     * @return bool True if voted
     */
    function hasVoted(uint256 proposalId, address voter) external view returns (bool);

    /**
     * @notice Get total dividend distributions for token
     * @param tokenContract Token contract address
     * @return uint256 Number of distributions
     */
    function getDistributionCount(address tokenContract) external view returns (uint256);

    // === Investor Functions ===

    /**
     * @notice Claim pending dividend
     * @param tokenContract Token contract address
     * @return uint256 Amount claimed
     */
    function claimDividend(address tokenContract) external returns (uint256);

    /**
     * @notice Cast vote on proposal
     * @param proposalId Proposal ID
     * @param support Vote type (0=Against, 1=For, 2=Abstain)
     */
    function castVote(uint256 proposalId, uint8 support) external;

    /**
     * @notice Request redemption of tokens
     * @param tokenContract Token contract address
     * @param amount Amount to redeem
     */
    function requestRedemption(address tokenContract, uint256 amount) external;

    // === Issuer/Admin Functions ===

    /**
     * @notice Register rights for token holders
     * @param tokenContract Token contract address
     * @param investors Array of investor addresses
     * @param balances Array of balances
     * @param hasVoting Whether investors have voting rights
     * @param hasDividend Whether investors have dividend rights
     */
    function registerRights(
        address tokenContract,
        address[] calldata investors,
        uint256[] calldata balances,
        bool hasVoting,
        bool hasDividend
    ) external;

    /**
     * @notice Create dividend distribution
     * @param tokenContract Token contract address
     * @param totalAmount Total dividend amount
     * @param recordDate Record date for eligibility
     * @param paymentStartDate Payment window start
     * @param paymentEndDate Payment window end
     */
    function createDividendDistribution(
        address tokenContract,
        uint256 totalAmount,
        uint64 recordDate,
        uint64 paymentStartDate,
        uint64 paymentEndDate
    ) external returns (uint256);

    /**
     * @notice Create voting proposal
     * @param tokenContract Token contract address
     * @param description Proposal description
     * @param votingDuration Voting duration in seconds
     * @return proposalId New proposal ID
     */
    function createVotingProposal(
        address tokenContract,
        string calldata description,
        uint64 votingDuration
    ) external returns (uint256);

    /**
     * @notice Execute voting proposal result
     * @param proposalId Proposal ID
     */
    function executeProposal(uint256 proposalId) external;

    /**
     * @notice Update investor balance (called by token contract)
     * @param tokenContract Token contract address
     * @param investor Investor address
     * @param newBalance New balance
     */
    function updateBalance(address tokenContract, address investor, uint256 newBalance) external;

    /**
     * @notice Enforce investor right (regulator/issuer only)
     * @param tokenContract Token contract address
     * @param investor Investor address
     * @param rightType Right type (0=Voting, 1=Dividend, 2=Redemption, 3=Information)
     */
    function enforceRight(
        address tokenContract,
        address investor,
        uint8 rightType
    ) external;

    /**
     * @notice Record that a disclosure was sent to investor
     * @param tokenContract Token contract address
     * @param investors Array of investor addresses
     */
    function recordDisclosure(
        address tokenContract,
        address[] calldata investors
    ) external;

    /**
     * @notice Get disclosure count for investor
     * @param tokenContract Token contract address
     * @param investor Investor address
     * @return uint256 Number of disclosures
     */
    function getDisclosureCount(address tokenContract, address investor) external view returns (uint256);

    /**
     * @notice Get last disclosure timestamp for investor
     * @param tokenContract Token contract address
     * @param investor Investor address
     * @return uint256 Last disclosure timestamp
     */
    function getLastDisclosureAt(address tokenContract, address investor) external view returns (uint256);
}
