// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title IAssetOracle
 * @dev Interface for Asset Oracle - Multi-sig NAV with Chainlink PoR
 */
interface IAssetOracle {

    // === Events ===

    event NAVProposed(uint256 indexed proposalId, uint256 proposedNAV, address proposer, uint256 timestamp);
    event NAVApproved(uint256 indexed proposalId, uint256 approvedNAV, address approver);
    event NAVUpdated(uint256 oldNAV, uint256 newNAV, uint256 timestamp);
    event SignerAdded(address indexed signer);
    event SignerRemoved(address indexed signer);
    event ChainlinkPoRConfigured(address feedAddress, uint256 requiredReserveRatio);

    // === Structs ===

    struct NAVProposal {
        uint256 proposedNAV;
        uint256 timestamp;
        uint256 approvals;
        bool executed;
        mapping(address => bool) hasApproved;
    }

    // === View Functions ===

    function version() external view returns (string memory);
    function currentNAV() external view returns (uint256);
    function lastNAV() external view returns (uint256);
    function lastNAVUpdate() external view returns (uint256);
    function proposalCount() external view returns (uint256);
    function REQUIRED_APPROVALS() external view returns (uint256);
    function UPDATE_DELAY() external view returns (uint256);
    function isSigner(address account) external view returns (bool);
    function getSigners() external view returns (address[] memory);
    function getProposal(uint256 proposalId) external view returns (
        uint256 proposedNAV,
        uint256 timestamp,
        uint256 approvals,
        bool executed
    );
    function chainlinkPoRFeed() external view returns (address);
    function requiredReserveRatio() external view returns (uint256);

    // === NAV Management ===

    function proposeNAV(uint256 newNAV, bytes memory signature) external;
    function approveNAV(uint256 proposalId) external;
    function executeNAV(uint256 proposalId) external;

    // === Signer Management ===

    function addSigner(address signer) external;
    function removeSigner(address signer) external;

    // === Chainlink PoR Configuration ===

    function setChainlinkPoRFeed(address feedAddress, uint256 reserveRatio) external;
}
