// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IInvestorRightsRegistry.sol";
import "../interfaces/IIdentityRegistry.sol";
import "../interfaces/ICRATSAccessControl.sol";

/**
 * @title InvestorRightsRegistry
 * @dev On-chain registry for tracking and enforcing investor rights
 * 
 * Supports:
 * - Voting rights (SEC 14(a), MiCA Art. 65)
 * - Dividend rights (Corporate law, Prospectus requirements)
 * - Redemption rights (Fund regulations, SEC Rule 22e-4)
 * - Information rights (SEC Reg S-K, MiCA Art. 67)
 */
contract InvestorRightsRegistry is AccessControl, ReentrancyGuard, IInvestorRightsRegistry {

    // === State Variables ===

    // Identity Registry
    IIdentityRegistry private _identityRegistry;

    // Investor rights mapping
    mapping(address => mapping(address => InvestorRights)) private _rights;

    // Dividend distributions
    mapping(address => mapping(uint256 => DividendDistribution)) private _distributions;
    mapping(address => uint256) private _distributionCount;

    // Voting proposals
    mapping(uint256 => VotingProposal) private _proposals;
    uint256 private _proposalCount;

    // Vote tracking
    mapping(uint256 => mapping(address => bool)) private _hasVoted;

    // Roles
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");

    // === Modifiers ===

    /**
     * @dev Modifier to check if caller is issuer or admin
     */
    modifier onlyIssuerOrAdmin() {
        require(
            hasRole(ISSUER_ROLE, msg.sender) || 
            hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "InvestorRightsRegistry: Caller is not issuer or admin"
        );
        _;
    }

    /**
     * @dev Modifier to check if proposal is active
     */
    modifier onlyActiveProposal(uint256 proposalId) {
        require(_proposals[proposalId].votingEndTime > block.timestamp, "InvestorRightsRegistry: Voting ended");
        require(_proposals[proposalId].votingStartTime <= block.timestamp, "InvestorRightsRegistry: Voting not started");
        require(!_proposals[proposalId].executed, "InvestorRightsRegistry: Already executed");
        _;
    }

    // === Constructor ===

    constructor(address admin, address identityRegistryAddress) {
        require(admin != address(0), "InvestorRightsRegistry: Admin cannot be zero");
        require(identityRegistryAddress != address(0), "InvestorRightsRegistry: Registry cannot be zero");

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ISSUER_ROLE, admin);

        _identityRegistry = IIdentityRegistry(identityRegistryAddress);
    }

    // === External View Functions ===

    function getRights(address tokenContract, address investor) 
        external 
        view 
        override 
        returns (InvestorRights memory) 
    {
        return _rights[tokenContract][investor];
    }

    function getPendingDividend(address tokenContract, address investor) 
        external 
        view 
        override 
        returns (uint256) 
    {
        return _rights[tokenContract][investor].pendingDividend;
    }

    function getVotingPower(address tokenContract, address investor) 
        external 
        view 
        override 
        returns (uint256) 
    {
        InvestorRights memory rights = _rights[tokenContract][investor];
        if (rights.hasVotingRights) {
            return rights.votingPower;
        }
        return 0;
    }

    function getDividendDistribution(address tokenContract, uint256 distributionId) 
        external 
        view 
        override 
        returns (DividendDistribution memory) 
    {
        return _distributions[tokenContract][distributionId];
    }

    function getVotingProposal(uint256 proposalId) 
        external 
        view 
        override 
        returns (VotingProposal memory) 
    {
        return _proposals[proposalId];
    }

    function hasVoted(uint256 proposalId, address voter) 
        external 
        view 
        override 
        returns (bool) 
    {
        return _hasVoted[proposalId][voter];
    }

    function getDistributionCount(address tokenContract) 
        external 
        view 
        override 
        returns (uint256) 
    {
        return _distributionCount[tokenContract];
    }

    // === Investor Functions ===

    /**
     * @dev Claim pending dividend
     */
    function claimDividend(address tokenContract) 
        external 
        override 
        nonReentrant 
        returns (uint256) 
    {
        InvestorRights storage rights = _rights[tokenContract][msg.sender];
        
        require(rights.hasDividendRights, "InvestorRightsRegistry: No dividend rights");
        require(rights.pendingDividend > 0, "InvestorRightsRegistry: No pending dividend");

        uint256 amount = rights.pendingDividend;
        rights.pendingDividend = 0;
        rights.claimedDividend += amount;
        rights.lastClaimAt = uint64(block.timestamp);

        emit DividendClaimed(msg.sender, tokenContract, amount);

        return amount;
    }

    /**
     * @dev Cast vote on proposal
     */
    function castVote(uint256 proposalId, uint8 support) 
        external 
        override 
        onlyActiveProposal(proposalId) 
    {
        require(support <= 2, "InvestorRightsRegistry: Invalid vote type");
        require(!_hasVoted[proposalId][msg.sender], "InvestorRightsRegistry: Already voted");

        VotingProposal storage proposal = _proposals[proposalId];
        InvestorRights storage rights = _rights[proposal.tokenContract][msg.sender];

        require(rights.hasVotingRights, "InvestorRightsRegistry: No voting rights");
        require(rights.votingPower > 0, "InvestorRightsRegistry: No voting power");

        uint256 votingPower = rights.votingPower;

        // Count votes
        if (support == 0) {
            proposal.againstVotes += votingPower;
        } else if (support == 1) {
            proposal.forVotes += votingPower;
        } else {
            proposal.abstainVotes += votingPower;
        }

        // Update voter state
        _hasVoted[proposalId][msg.sender] = true;
        rights.votesCast += votingPower;
        rights.lastVoteAt = uint64(block.timestamp);

        emit VoteCast(msg.sender, proposalId, support, votingPower);
    }

    /**
     * @dev Request redemption of tokens
     */
    function requestRedemption(address tokenContract, uint256 amount) 
        external 
        override 
    {
        InvestorRights storage rights = _rights[tokenContract][msg.sender];
        
        require(rights.hasRedemptionRights, "InvestorRightsRegistry: No redemption rights");
        require(amount > 0, "InvestorRightsRegistry: Amount must be positive");
        require(amount <= rights.balance, "InvestorRightsRegistry: Insufficient balance");

        // Check redemption window
        require(
            block.timestamp >= rights.redemptionWindowStart && 
            block.timestamp <= rights.redemptionWindowEnd,
            "InvestorRightsRegistry: Outside redemption window"
        );

        require(!rights.redemptionRequested, "InvestorRightsRegistry: Redemption already requested");

        rights.redemptionRequested = true;
        rights.redemptionValue = amount;

        emit RedemptionRequested(msg.sender, tokenContract, amount, uint64(block.timestamp));
    }

    // === Issuer/Admin Functions ===

    /**
     * @dev Register rights for token holders
     */
    function registerRights(
        address tokenContract,
        address[] calldata investors,
        uint256[] calldata balances,
        bool hasVoting,
        bool hasDividend
    ) external override onlyIssuerOrAdmin {
        require(investors.length == balances.length, "InvestorRightsRegistry: Array length mismatch");

        for (uint256 i = 0; i < investors.length; i++) {
            InvestorRights storage rights = _rights[tokenContract][investors[i]];

            rights.tokenContract = tokenContract;
            rights.balance = balances[i];
            rights.hasVotingRights = hasVoting;
            rights.hasDividendRights = hasDividend;
            rights.votingPower = hasVoting ? balances[i] : 0;

            // ✅ INFORMATION RIGHTS (Section 12.1) - All investors get information rights by default
            rights.hasInformationRights = true;
            rights.disclosuresReceived = 0;
            rights.lastDisclosureAt = 0;

            if (rights.registeredAt == 0) {
                rights.registeredAt = uint64(block.timestamp);
            }
            rights.updatedAt = uint64(block.timestamp);

            emit RightsRegistered(tokenContract, investors[i], rights.votingPower, balances[i]);
        }
    }

    /**
     * @dev Create dividend distribution
     */
    function createDividendDistribution(
        address tokenContract,
        uint256 totalAmount,
        uint64 recordDate,
        uint64 paymentStartDate,
        uint64 paymentEndDate
    ) external override onlyIssuerOrAdmin returns (uint256) {
        require(totalAmount > 0, "InvestorRightsRegistry: Amount must be positive");
        require(recordDate > block.timestamp, "InvestorRightsRegistry: Record date must be future");
        require(paymentStartDate >= recordDate, "InvestorRightsRegistry: Payment must be after record");
        require(paymentEndDate > paymentStartDate, "InvestorRightsRegistry: Invalid end date");

        uint256 distributionId = _distributionCount[tokenContract];
        
        DividendDistribution storage distribution = _distributions[tokenContract][distributionId];
        
        distribution.tokenContract = tokenContract;
        distribution.totalAmount = totalAmount;
        distribution.recordDate = recordDate;
        distribution.paymentStartDate = paymentStartDate;
        distribution.paymentEndDate = paymentEndDate;
        distribution.isActive = true;

        _distributionCount[tokenContract]++;

        emit DividendDistributionCreated(tokenContract, totalAmount, recordDate, paymentStartDate);

        return distributionId;
    }

    /**
     * @dev Create voting proposal
     */
    function createVotingProposal(
        address tokenContract,
        string calldata description,
        uint64 votingDuration
    ) external override onlyIssuerOrAdmin returns (uint256) {
        require(bytes(description).length > 0, "InvestorRightsRegistry: Empty description");
        require(votingDuration > 0, "InvestorRightsRegistry: Duration must be positive");

        _proposalCount++;
        
        VotingProposal storage proposal = _proposals[_proposalCount];
        
        proposal.tokenContract = tokenContract;
        proposal.description = description;
        proposal.votingStartTime = uint64(block.timestamp);
        proposal.votingEndTime = uint64(block.timestamp) + votingDuration;

        emit VotingProposalCreated(_proposalCount, tokenContract, description, proposal.votingStartTime, proposal.votingEndTime);

        return _proposalCount;
    }

    /**
     * @dev Execute voting proposal result
     */
    function executeProposal(uint256 proposalId) external override {
        VotingProposal storage proposal = _proposals[proposalId];
        
        require(proposal.votingEndTime <= block.timestamp, "InvestorRightsRegistry: Voting not ended");
        require(!proposal.executed, "InvestorRightsRegistry: Already executed");

        proposal.executed = true;
        
        // Proposal passes if for votes > against votes
        proposal.executedResult = proposal.forVotes > proposal.againstVotes;
    }

    /**
     * @dev Update investor balance (called by token contract)
     */
    function updateBalance(address tokenContract, address investor, uint256 newBalance)
        external
        override
        onlyIssuerOrAdmin
    {
        InvestorRights storage rights = _rights[tokenContract][investor];

        rights.balance = newBalance;
        if (rights.hasVotingRights) {
            rights.votingPower = newBalance;
        }
        rights.updatedAt = uint64(block.timestamp);
    }

    // === NEW: enforceRight() Function (Section 12) ===

    /**
     * @dev Enforce investor right (regulator/issuer only)
     * Right types: 0=Voting, 1=Dividend, 2=Redemption, 3=Information
     */
    function enforceRight(
        address tokenContract,
        address investor,
        uint8 rightType
    ) external override onlyIssuerOrAdmin {
        InvestorRights storage rights = _rights[tokenContract][investor];
        require(rights.registeredAt > 0, "InvestorRightsRegistry: Rights not registered");

        if (rightType == 0) {
            // Voting Rights Enforcement
            require(rights.hasVotingRights, "InvestorRightsRegistry: No voting rights");
            require(rights.votingPower > 0, "InvestorRightsRegistry: No voting power");
            rights.votesCast = 0; // Reset for re-vote
            rights.lastVoteAt = block.timestamp;
            emit RightsRegistered(tokenContract, investor, rights.votingPower, rights.balance);

        } else if (rightType == 1) {
            // Dividend Rights Enforcement
            require(rights.hasDividendRights, "InvestorRightsRegistry: No dividend rights");
            if (rights.pendingDividend > 0) {
                uint256 amount = rights.pendingDividend;
                rights.pendingDividend = 0;
                rights.claimedDividend += amount;
                rights.lastClaimAt = uint64(block.timestamp);
                emit DividendClaimed(investor, tokenContract, amount);
            }

        } else if (rightType == 2) {
            // Redemption Rights Enforcement
            require(rights.hasRedemptionRights, "InvestorRightsRegistry: No redemption rights");
            if (block.timestamp > rights.redemptionWindowEnd) {
                rights.redemptionWindowEnd = uint64(block.timestamp + 30 days);
                rights.redemptionRequested = false;
            }

        } else if (rightType == 3) {
            // Information Rights Enforcement (Section 12.1)
            require(rights.hasInformationRights, "InvestorRightsRegistry: No information rights");
            emit InformationRightEnforced(tokenContract, investor, block.timestamp);

        } else {
            revert("InvestorRightsRegistry: Invalid right type");
        }
    }

    // === NEW: Information Rights Tracking (Section 12.1) ===

    /**
     * @dev Record that a disclosure was sent to investor
     */
    function recordDisclosure(
        address tokenContract,
        address[] calldata investors
    ) external override onlyRole(ISSUER_ROLE) {
        for (uint256 i = 0; i < investors.length; i++) {
            InvestorRights storage rights = _rights[tokenContract][investors[i]];
            require(rights.hasInformationRights, "InvestorRightsRegistry: No information rights");

            rights.disclosuresReceived++;
            rights.lastDisclosureAt = uint64(block.timestamp);
            rights.updatedAt = uint64(block.timestamp);

            emit DisclosureRecorded(tokenContract, investors[i], rights.disclosuresReceived);
        }
    }

    /**
     * @dev Get disclosure count for investor
     */
    function getDisclosureCount(address tokenContract, address investor)
        external
        view
        override
        returns (uint256)
    {
        return _rights[tokenContract][investor].disclosuresReceived;
    }

    /**
     * @dev Get last disclosure timestamp for investor
     */
    function getLastDisclosureAt(address tokenContract, address investor)
        external
        view
        override
        returns (uint256)
    {
        return _rights[tokenContract][investor].lastDisclosureAt;
    }

    // === Internal Functions ===

    /**
     * @dev Set identity registry address
     */
    function setIdentityRegistry(address newRegistry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newRegistry != address(0), "InvestorRightsRegistry: Invalid address");
        _identityRegistry = IIdentityRegistry(newRegistry);
    }
}
