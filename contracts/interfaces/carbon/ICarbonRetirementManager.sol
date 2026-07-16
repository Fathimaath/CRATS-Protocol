// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface ICarbonRetirementManager {
    enum RetirementStatus {
        REQUESTED,   // On-chain retirement initiated
        PROCESSING,  // Serial range allocated, sent to registry
        CONFIRMED,   // Registry confirmed retirement
        FAILED       // Registry rejected / timed out
    }

    struct RetirementRecord {
        address   assetToken;
        address   vault;
        address   investor;          // Beneficiary of retirement
        uint256   sharesBurned;      // Vault shares consumed
        uint256   creditsRetired;    // tCO2e count retired
        uint256   batchId;           // Which batch serial range allocated from
        string    serialStart;       // e.g. "VCU-1000001"
        string    serialEnd;         // e.g. "VCU-100500"
        bytes32   registryTxHash;    // Registry confirmation hash (off-chain anchor)
        bytes32   retirementCertHash;// IPFS/DMS hash of retirement certificate
        string    beneficiaryName;   // Corporate entity claiming offset
        string    retirementPurpose; // e.g. "Scope 1 offsetting FY2026"
        RetirementStatus status;
        uint256   requestedAt;
        uint256   confirmedAt;
    }

    function requestRetirement(
        address vault,
        uint256 shares,
        string calldata beneficiaryName,
        string calldata retirementPurpose
    ) external returns (uint256 retirementId);

    function confirmRetirement(
        uint256 retirementId,
        string calldata serialStart,
        string calldata serialEnd,
        bytes32 registryTxHash,
        bytes32 retirementCertHash
    ) external; // onlyRole(REGISTRY_OPERATOR_ROLE)

    function failRetirement(uint256 retirementId, string calldata reason) external;
    function getRetirementRecord(uint256 id) external view returns (RetirementRecord memory);
    function getRetirementsByInvestor(address investor) external view returns (uint256[] memory);

    event RetirementRequested(uint256 indexed id, address indexed investor, address vault, uint256 credits, uint256 timestamp);
    event RetirementConfirmed(uint256 indexed id, string serialStart, string serialEnd, bytes32 registryTxHash);
    event RetirementFailed(uint256 indexed id, string reason);
}
