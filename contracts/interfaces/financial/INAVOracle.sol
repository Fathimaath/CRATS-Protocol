// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface INAVOracle {
    enum ValuationMethod {
        FULL_APPRAISAL, DESKTOP_APPRAISAL, DCF_MODEL,
        MARKET_COMPARABLE, AUDIT_VERIFIED, INCOME_STATEMENT
    }
    enum NAVState { FRESH, WARNING, CRITICAL, STALE }
    enum DisputeStatus { NONE, OPEN, RESOLVED, EXPIRED }

    struct NAVSubmission {
        uint256        assetValue;
        uint256        valuationDate;
        uint256        submittedAt;
        bytes32        documentHash;
        address        submitter;
        ValuationMethod method;
        uint8          confidenceScore;
        bool           disputed;
    }

    struct WeightConfig {
        uint16 appraisalWeight; uint16 dcfWeight;
        uint16 incomeWeight; uint16 compWeight;
        uint32 appraisalMaxAge; uint32 dcfMaxAge;
        uint32 incomeMaxAge; uint32 compMaxAge;
    }

    struct DisputeRecord {
        uint256        submissionIndex;
        uint256        openedAt;
        uint256        deadline;
        uint256        challengerValue;
        bytes32        challengerEvidence;
        address        challenger;
        DisputeStatus  status;
    }

    struct ChallengeStake {
        address challenger;
        uint256 amount;
        bool    refunded;
    }

    struct AssetClassSchedule {
        uint32 maxValuationInterval;
        uint32 warningThreshold;
        bool   isActive;
    }

    event NAVSubmitted(
        bytes32 indexed assetId, uint256 assetValue,
        ValuationMethod method, address submitter, bool autoFlagged
    );
    event SubmissionFlaggedForReview(
        bytes32 indexed assetId, uint256 submissionIndex, uint256 deviationBPS
    );
    event DisputeOpened(bytes32 indexed assetId, address challenger, uint256 challengerValue);
    event DisputeResolved(bytes32 indexed assetId, uint256 resolvedValue, DisputeStatus status);
    event DisputeExpired(bytes32 indexed assetId, uint256 stakeReturned);
    event WeightConfigSet(bytes32 indexed assetId);
    event VaultRegistered(bytes32 indexed vaultId, address vault, bytes32 assetId);
    event CircuitBreakerTriggered(bytes32 indexed assetId);
    event ScheduleUpdated(bytes32 indexed assetClass);

    function BPS_DENOMINATOR()          external pure returns (uint256);
    function DEVIATION_THRESHOLD_BPS()   external pure returns (uint256);
    function CHALLENGE_DEADLINE()        external pure returns (uint256);
    function FRESH_THRESHOLD()           external pure returns (uint256);
    function WARNING_THRESHOLD()         external pure returns (uint256);
    function CRITICAL_THRESHOLD()        external pure returns (uint256);

    function submitNAV(bytes32 assetId, uint256 assetValue, uint256 valuationDate, bytes32 documentHash, ValuationMethod method) external;
    function getWeightedNAV(bytes32 assetId) external view returns (uint256);
    function calculateNAV(bytes32 vaultId) external view returns (uint256 navPerShare, uint256 totalAssets, uint256 totalLiabilities, NAVState state);
    function getNAVState(bytes32 assetId) external view returns (NAVState);
    function getNAVStateWithWarning(bytes32 assetId) external view returns (NAVState state, bool shouldWarn);
    function assertDepositAllowed(bytes32 assetId) external view;
    function assertRedemptionAllowed(bytes32) external pure;
    function enforceStalenessCircuitBreaker(bytes32 assetId) external;

    function fileChallenge(bytes32 assetId, uint256 challengerValue, bytes32 evidenceHash, bytes calldata signature) external;
    function resolveDispute(bytes32 assetId, uint256 resolvedValue, bytes32 evidence) external;
    function expireDispute(bytes32 assetId) external;

    function setAssetClassSchedule(bytes32 assetClass, AssetClassSchedule calldata schedule) external;
    function setAssetClass(bytes32 assetId, bytes32 assetClass) external;
    function checkScheduleCompliance(bytes32 assetId) external view returns (bool compliant, uint256 daysRemaining);
    function setWeightConfig(bytes32 assetId, WeightConfig calldata cfg) external;
    function registerVault(bytes32 vaultId, address vault, bytes32 assetId, WeightConfig calldata cfg) external;
    function setUSDC(address _usdc) external;
    function setProtocolTreasury(address _treasury) external;
    function setChallengeStakeAmount(uint256 _amount) external;
    function setPendingRedemption(bytes32 assetId, uint256 amount) external;

    function feeEngine()                   external view returns (address);
    function usdc()                        external view returns (address);
    function protocolTreasury()             external view returns (address);
    function challengeStakeAmount()         external view returns (uint256);
    function activeSubmission(bytes32)     external view returns (NAVSubmission memory);
    function vaultAddress(bytes32)         external view returns (address);
    function vaultIdToAsset(bytes32)       external view returns (bytes32);
    function assetToVaultId(bytes32)       external view returns (bytes32);
    function activeDispute(bytes32)        external view returns (bool);
    function weightConfigs(bytes32)        external view returns (WeightConfig memory);
    function classSchedules(bytes32)       external view returns (AssetClassSchedule memory);
    function assetClassForId(bytes32)      external view returns (bytes32);
    function pendingRedemptions(bytes32)   external view returns (uint256);
}
