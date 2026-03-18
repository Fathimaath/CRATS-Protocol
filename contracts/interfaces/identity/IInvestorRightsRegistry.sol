// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title IInvestorRightsRegistry
 * @dev Interface for tracking investor rights (Voting, Dividends, Redemption).
 * // Source: ERC-3643 T-REX Identity/Compliance Pattern
 */
interface IInvestorRightsRegistry {
    struct InvestorRights {
        address tokenContract;
        uint256 balanceAtSnapshot;

        bool hasVotingRights;
        uint256 votingPower;
        uint256 votesCast;
        uint256 lastVoteAt;

        bool hasDividendRights;
        uint256 pendingDividend;
        uint256 claimedDividend;
        uint256 lastClaimAt;

        bool hasRedemptionRights;
        uint256 redemptionValue;
        uint64 redemptionWindowStart;
        uint64 redemptionWindowEnd;
        bool redemptionRequested;

        uint64 registeredAt;
        uint64 updatedAt;
    }

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
    ) external;

    function claimDividend(address investor, address tokenContract) external;
    function exerciseVote(address investor, address tokenContract, uint256 voteAmount) external;
    function requestRedemption(address investor, address tokenContract) external;
    function getRights(address investor, address tokenContract) external view returns (InvestorRights memory);
}
