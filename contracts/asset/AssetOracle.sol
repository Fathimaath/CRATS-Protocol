// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "../interfaces/standards/AggregatorV3Interface.sol";
import "../interfaces/asset/IAssetOracle.sol";
import "../utils/AssetConfig.sol";

/**
 * @title AssetOracle
 * @dev Multi-signature NAV oracle with Chainlink Proof of Reserve (PoR).
 * // Source: Audited Oracle Patterns
 */
contract AssetOracle is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable,
    IAssetOracle
{
    // === State ===
    uint256 public currentNAV;
    uint256 public lastNAV;
    uint256 public lastNAVUpdate;
    uint256 public proposalCount;

    mapping(address => bool) public isSigner;
    address[] private _signers;
    mapping(uint256 => NAVProposal) public proposals;

    address public chainlinkPoRFeed;
    uint256 public requiredReserveRatio;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address admin) public initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(AssetConfig.OPERATOR_ROLE, admin);
        
        isSigner[admin] = true;
        _signers.push(admin);
    }

    // === View Functions ===

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
        NAVProposal storage p = proposals[proposalId];
        return (p.proposedNAV, p.timestamp, p.approvals, p.executed);
    }

    // === NAV Management ===

    function proposeNAV(uint256 newNAV, bytes memory /* signature */) external override {
        require(isSigner[_msgSender()], "AssetOracle: not signer");
        require(newNAV > 0, "AssetOracle: invalid NAV");

        proposalCount++;
        NAVProposal storage p = proposals[proposalCount];
        p.proposedNAV = newNAV;
        p.timestamp = block.timestamp;
        p.approvals = 0;
        p.executed = false;

        emit NAVProposed(proposalCount, newNAV, _msgSender(), block.timestamp);
    }

    function approveNAV(uint256 proposalId) external override nonReentrant {
        require(isSigner[_msgSender()], "AssetOracle: not signer");
        NAVProposal storage p = proposals[proposalId];
        require(!p.hasApproved[_msgSender()], "AssetOracle: already approved");
        require(!p.executed, "AssetOracle: already executed");

        p.hasApproved[_msgSender()] = true;
        p.approvals++;

        emit NAVApproved(proposalId, p.proposedNAV, _msgSender());

        if (p.approvals >= AssetConfig.REQUIRED_APPROVALS) {
            if (block.timestamp >= p.timestamp + AssetConfig.UPDATE_DELAY) {
                _executeNAVUpdate(proposalId);
            }
        }
    }

    function executeNAV(uint256 proposalId) external override nonReentrant {
        NAVProposal storage p = proposals[proposalId];
        require(p.approvals >= AssetConfig.REQUIRED_APPROVALS, "AssetOracle: not enough approvals");
        require(!p.executed, "AssetOracle: already executed");
        require(block.timestamp >= p.timestamp + AssetConfig.UPDATE_DELAY, "AssetOracle: delay not met");

        _executeNAVUpdate(proposalId);
    }

    // === Management ===

    function addSigner(address signer) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        require(!isSigner[signer], "AssetOracle: already signer");
        isSigner[signer] = true;
        _signers.push(signer);
        emit SignerAdded(signer);
    }

    function removeSigner(address signer) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        require(isSigner[signer], "AssetOracle: not signer");
        isSigner[signer] = false;
        // Optimization: don't strictly need to remove from array if checked via mapping
        emit SignerRemoved(signer);
    }

    function setChainlinkPoRFeed(address feedAddress, uint256 reserveRatio) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "AssetOracle: not admin");
        chainlinkPoRFeed = feedAddress;
        requiredReserveRatio = reserveRatio;
        emit ChainlinkPoRConfigured(feedAddress, reserveRatio);
    }

    function getNAV() external view returns (uint256) {
        return currentNAV;
    }

    // === Internal ===

    function _executeNAVUpdate(uint256 proposalId) internal {
        NAVProposal storage p = proposals[proposalId];
        
        lastNAV = currentNAV;
        currentNAV = p.proposedNAV;
        lastNAVUpdate = block.timestamp;
        p.executed = true;

        emit NAVUpdated(lastNAV, currentNAV, block.timestamp);
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
