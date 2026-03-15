// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/standards/AggregatorV3Interface.sol";
import "../interfaces/asset/IAssetOracle.sol";
import "../utils/AssetConfig.sol";

/**
 * @title AssetOracle
 * @dev Multi-signature NAV oracle with Chainlink Proof of Reserve
 * Layer 2 v3.0
 * Template contract - deployed per asset
 */
contract AssetOracle is AccessControl, ReentrancyGuard, IAssetOracle {

    // === State Variables ===

    uint256 public currentNAV;
    uint256 public lastNAV;
    uint256 public lastNAVUpdate;
    uint256 public proposalCount;

    // Signers
    mapping(address => bool) public isSigner;
    address[] private _signers;

    // Proposals
    mapping(uint256 => NAVProposal) public proposals;

    // Chainlink PoR
    address public chainlinkPoRFeed;
    uint256 public requiredReserveRatio;

    // === Modifiers ===

    modifier onlySigner() {
        require(isSigner[msg.sender], "AssetOracle: Caller is not signer");
        _;
    }

    modifier onlyOperator() {
        require(hasRole(AssetConfig.OPERATOR_ROLE, msg.sender), "AssetOracle: Caller is not operator");
        _;
    }

    // === Constructor ===

    constructor(address admin) {
        require(admin != address(0), "AssetOracle: Admin cannot be zero address");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(AssetConfig.OPERATOR_ROLE, admin);
        isSigner[admin] = true;
        _signers.push(admin);
    }

    // === External View Functions ===

    function version() external pure override returns (string memory) {
        return AssetConfig.VERSION;
    }

    function REQUIRED_APPROVALS() external pure override returns (uint256) {
        return AssetConfig.REQUIRED_APPROVALS;
    }

    function UPDATE_DELAY() external pure override returns (uint256) {
        return AssetConfig.UPDATE_DELAY;
    }

    function getSigners() external view override returns (address[] memory) {
        return _signers;
    }

    function getProposal(uint256 proposalId) external view override returns (
        uint256 proposedNAV,
        uint256 timestamp,
        uint256 approvals,
        bool executed
    ) {
        NAVProposal storage proposal = proposals[proposalId];
        return (proposal.proposedNAV, proposal.timestamp, proposal.approvals, proposal.executed);
    }

    // === NAV Management ===

    function proposeNAV(uint256 newNAV, bytes memory /* signature */) external override onlySigner {
        require(newNAV > 0, "AssetOracle: NAV must be positive");
        _verifyChainlinkPoR(newNAV);

        proposalCount++;
        NAVProposal storage proposal = proposals[proposalCount];
        proposal.proposedNAV = newNAV;
        proposal.timestamp = block.timestamp;
        proposal.approvals = 0;
        proposal.executed = false;

        emit NAVProposed(proposalCount, newNAV, msg.sender, block.timestamp);
    }

    function approveNAV(uint256 proposalId) external override onlySigner nonReentrant {
        NAVProposal storage proposal = proposals[proposalId];

        require(proposalId > 0 && proposalId <= proposalCount, "AssetOracle: Invalid proposal");
        require(!proposal.hasApproved[msg.sender], "AssetOracle: Already approved");
        require(!proposal.executed, "AssetOracle: Already executed");

        proposal.hasApproved[msg.sender] = true;
        proposal.approvals++;

        emit NAVApproved(proposalId, proposal.proposedNAV, msg.sender);

        if (proposal.approvals >= AssetConfig.REQUIRED_APPROVALS) {
            if (block.timestamp >= proposal.timestamp + AssetConfig.UPDATE_DELAY) {
                _executeNAVUpdate(proposalId);
            }
        }
    }

    function executeNAV(uint256 proposalId) external override nonReentrant {
        NAVProposal storage proposal = proposals[proposalId];

        require(proposalId > 0 && proposalId <= proposalCount, "AssetOracle: Invalid proposal");
        require(proposal.approvals >= AssetConfig.REQUIRED_APPROVALS, "AssetOracle: Not enough approvals");
        require(!proposal.executed, "AssetOracle: Already executed");
        require(
            block.timestamp >= proposal.timestamp + AssetConfig.UPDATE_DELAY,
            "AssetOracle: Delay not met"
        );

        _executeNAVUpdate(proposalId);
    }

    // === Signer Management ===

    function addSigner(address signer) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        require(signer != address(0), "AssetOracle: Signer cannot be zero address");
        require(!isSigner[signer], "AssetOracle: Already signer");

        isSigner[signer] = true;
        _signers.push(signer);

        emit SignerAdded(signer);
    }

    function removeSigner(address signer) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        require(isSigner[signer], "AssetOracle: Not signer");
        require(_signers.length > 1, "AssetOracle: Cannot remove last signer");

        isSigner[signer] = false;

        for (uint256 i = 0; i < _signers.length; i++) {
            if (_signers[i] == signer) {
                _signers[i] = _signers[_signers.length - 1];
                _signers.pop();
                break;
            }
        }

        emit SignerRemoved(signer);
    }

    // === Chainlink PoR Configuration ===

    function setChainlinkPoRFeed(
        address feedAddress,
        uint256 reserveRatio
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(reserveRatio > 0 && reserveRatio <= 10000, "AssetOracle: Invalid ratio");

        chainlinkPoRFeed = feedAddress;
        requiredReserveRatio = reserveRatio;

        emit ChainlinkPoRConfigured(feedAddress, reserveRatio);
    }

    // === Internal Functions ===

    function _executeNAVUpdate(uint256 proposalId) internal {
        NAVProposal storage proposal = proposals[proposalId];
        _verifyChainlinkPoR(proposal.proposedNAV);

        uint256 oldNAV = currentNAV;
        currentNAV = proposal.proposedNAV;
        lastNAV = oldNAV;
        lastNAVUpdate = block.timestamp;
        proposal.executed = true;

        emit NAVUpdated(oldNAV, proposal.proposedNAV, block.timestamp);
    }

    function _verifyChainlinkPoR(uint256 proposedNAV) internal view {
        if (chainlinkPoRFeed == address(0)) {
            return;
        }

        (
            /* uint80 roundID */,
            int256 reserveValue,
            /* uint256 startedAt */,
            uint256 updatedAt,
            /* uint80 answeredInRound */
        ) = AggregatorV3Interface(chainlinkPoRFeed).latestRoundData();

        require(reserveValue > 0, "AssetOracle: Invalid PoR value");
        require(updatedAt > 0, "AssetOracle: PoR stale");

        uint256 maxNAV = (uint256(reserveValue) * requiredReserveRatio) / AssetConfig.BASIS_POINTS;
        require(proposedNAV <= maxNAV, "AssetOracle: NAV exceeds verified reserve");
    }
}


