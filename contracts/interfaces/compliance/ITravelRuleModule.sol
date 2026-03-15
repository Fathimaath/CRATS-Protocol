// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title ITravelRuleModule
 * @dev Interface for FATF Recommendation 16 (Travel Rule) compliance
 * Records originator and beneficiary information for transfers above threshold
 * 
 * FATF Travel Rule Requirements:
 * - Originator name, account, country
 * - Beneficiary name, account, country
 * - Transaction monitoring and reporting
 */
interface ITravelRuleModule {

    /**
     * @dev Struct containing Travel Rule data for a transfer
     * Note: Names are hashed for GDPR/privacy compliance
     */
    struct TravelRuleData {
        // Transaction Info
        bytes32 txHash;
        address tokenContract;
        uint256 amount;
        uint64 timestamp;

        // Originator Info (FATF R.16)
        uint256 originatorTokenId;
        address originatorWallet;
        bytes32 originatorNameHash;  // Hashed for privacy (GDPR compliance)
        string originatorCountry;
        bytes32 originatorAccountId;

        // Beneficiary Info (FATF R.16)
        uint256 beneficiaryTokenId;
        address beneficiaryWallet;
        bytes32 beneficiaryNameHash;  // Hashed for privacy (GDPR compliance)
        string beneficiaryCountry;
        bytes32 beneficiaryAccountId;

        // Compliance Flags
        bool isReported;
        bool requiresReview;
        uint8 riskScore;
    }

    // === Events ===

    /**
     * @dev Emitted when a transfer is recorded for Travel Rule compliance
     */
    event TransferRecorded(
        bytes32 indexed txHash,
        address indexed originator,
        address indexed beneficiary,
        uint256 amount,
        uint8 riskScore
    );

    /**
     * @dev Emitted when a transfer is flagged for manual review
     */
    event TransferFlaggedForReview(
        bytes32 indexed txHash,
        address originator,
        address beneficiary,
        uint256 amount,
        string reason
    );

    /**
     * @dev Emitted when transfer data is reported to regulatory authority
     */
    event TransferReported(
        bytes32 indexed txHash,
        address regulator,
        uint64 timestamp
    );

    /**
     * @dev Emitted when Travel Rule threshold is updated
     */
    event ThresholdUpdated(uint256 newThreshold);

    /**
     * @dev Emitted when transfer is marked as reviewed
     */
    event TransferReviewed(
        bytes32 indexed txHash,
        bool approved,
        address reviewer
    );

    // === View Functions ===

    /**
     * @notice Get Travel Rule data for a transaction
     * @param txHash Transaction hash
     * @return TravelRuleData struct
     */
    function getTransferData(bytes32 txHash) external view returns (TravelRuleData memory);

    /**
     * @notice Get originator information for a transfer
     * @param txHash Transaction hash
     * @return tokenId Originator's SBT token ID
     * @return wallet Originator's wallet address
     * @return nameHash Originator's name hash (for privacy)
     * @return country Originator's country code
     */
    function getOriginator(bytes32 txHash) external view returns (
        uint256 tokenId,
        address wallet,
        bytes32 nameHash,
        string memory country
    );

    /**
     * @notice Get beneficiary information for a transfer
     * @param txHash Transaction hash
     * @return tokenId Beneficiary's SBT token ID
     * @return wallet Beneficiary's wallet address
     * @return nameHash Beneficiary's name hash (for privacy)
     * @return country Beneficiary's country code
     */
    function getBeneficiary(bytes32 txHash) external view returns (
        uint256 tokenId,
        address wallet,
        bytes32 nameHash,
        string memory country
    );

    /**
     * @notice Get transfer history for an address
     * @param wallet Wallet address
     * @param limit Maximum number of records to return
     * @return txHashes Array of transaction hashes
     */
    function getTransferHistory(address wallet, uint256 limit) external view returns (bytes32[] memory);

    /**
     * @notice Get current Travel Rule threshold
     * @return uint256 Threshold amount
     */
    function getThreshold() external view returns (uint256);

    /**
     * @notice Check if a transfer requires manual review
     * @param txHash Transaction hash
     * @return bool True if requires review
     */
    function requiresReview(bytes32 txHash) external view returns (bool);

    /**
     * @notice Get transfer count for an address
     * @param wallet Wallet address
     * @return uint256 Number of transfers
     */
    function getTransferCount(address wallet) external view returns (uint256);

    // === Admin Functions ===

    /**
     * @notice Record a transfer for Travel Rule compliance
     * @param tokenContract Token contract address
     * @param from Sender address
     * @param to Receiver address
     * @param amount Transfer amount
     * @return txHash Transaction hash (bytes32)
     */
    function recordTransfer(
        address tokenContract,
        address from,
        address to,
        uint256 amount
    ) external returns (bytes32);

    /**
     * @notice Set Travel Rule threshold amount
     * @param threshold New threshold amount
     */
    function setThreshold(uint256 threshold) external;

    /**
     * @notice Report transfer to regulatory authority
     * @param txHash Transaction hash
     */
    function reportToAuthority(bytes32 txHash) external;

    /**
     * @notice Mark transfer as reviewed
     * @param txHash Transaction hash
     * @param approved Whether transfer is approved
     */
    function markReviewed(bytes32 txHash, bool approved) external;

    /**
     * @notice Verify originator name against stored hash (regulator only)
     * @param txHash Transaction hash
     * @param name Claimed originator name
     * @return bool True if name matches hash
     */
    function verifyOriginatorName(bytes32 txHash, string calldata name) external view returns (bool);

    /**
     * @notice Verify beneficiary name against stored hash (regulator only)
     * @param txHash Transaction hash
     * @param name Claimed beneficiary name
     * @return bool True if name matches hash
     */
    function verifyBeneficiaryName(bytes32 txHash, string calldata name) external view returns (bool);

    /**
     * @notice Get originator name hash (regulator only)
     * @param txHash Transaction hash
     * @return bytes32 Name hash
     */
    function getOriginatorNameHash(bytes32 txHash) external view returns (bytes32);

    /**
     * @notice Get beneficiary name hash (regulator only)
     * @param txHash Transaction hash
     * @return bytes32 Name hash
     */
    function getBeneficiaryNameHash(bytes32 txHash) external view returns (bytes32);
}
