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

    /**
     * @notice Get transfer history for a wallet address.
     * @dev Returns array of transaction hashes for the given wallet.
     */
    function getTransferHistory(address wallet) external view returns (bytes32[] memory);

    /**
     * @notice Set the Travel Rule threshold amount.
     * @dev Only callable by admin. Threshold is in token decimals.
     */
    function setThreshold(uint256 threshold) external;

    /**
     * @notice Get the current Travel Rule threshold.
     */
    function threshold() external view returns (uint256);

    /**
     * @notice Mark transfer as reported to regulatory authority.
     * @dev Only callable by regulator role.
     */
    function reportToAuthority(bytes32 txHash, bytes32 authorityHash) external;

    /**
     * @notice Get count of transfers reported to authorities.
     */
    function getReportedCount() external view returns (uint256);
}
