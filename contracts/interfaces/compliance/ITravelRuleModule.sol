// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title ITravelRuleModule
 * @dev Interface for the FATF Travel Rule compliance module.
 * // Source: FATF Recommendation 16 (Travel Rule)
 */
interface ITravelRuleModule {
    struct TransferRecord {
        bytes32 txHash;
        address tokenContract;
        uint256 amount;
        uint64 timestamp;
        bytes32 originatorIdentityHash;
        bytes32 beneficiaryIdentityHash;
        bytes32 originatorAccountIdHash;
        bytes32 beneficiaryAccountIdHash;
        uint8 riskScore;
        bool requiresReview;
        bool isReported;
    }

    /**
     * @notice Record a transfer for Travel Rule compliance.
     * @dev Only callable by the compliance role.
     */
    function recordTransfer(
        bytes32 txHash,
        address tokenContract,
        uint256 amount,
        address fromWallet,
        address toWallet,
        bytes32 originatorIdentityHash,
        bytes32 beneficiaryIdentityHash,
        bytes32 originatorAccountIdHash,
        bytes32 beneficiaryAccountIdHash,
        uint8 riskScore,
        bool requiresReview
    ) external;

    function getTransfer(bytes32 txHash) external view returns (TransferRecord memory);
}
