// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface ICarbonRetirementManager {

    // ─── Status Lifecycle ──────────────────────────────────────────────────
    // Six investor-visible states instead of the previous three.
    enum RetirementStatus {
        REQUESTED,                  // 0 - On-chain retirement initiated, awaiting registry
        PENDING_REGISTRY,           // 1 - Registry verification in progress (active retry window)
        COMPLIANCE_REVIEW,          // 2 - Retry limit reached, escalated to Compliance team
        GOVERNANCE_REVIEW,          // 3 - Max wait period exceeded, under Governance committee
        CONFIRMED,                  // 4 - Registry confirmed, shares burned (terminal ✅)
        FAILED,                     // 5 - Registry definitively rejected (terminal ❌)
        CANCELLED                   // 6 - Governance cancelled the request (terminal ❌)
    }

    // ─── Audit Trail Entry ─────────────────────────────────────────────────
    struct AuditEntry {
        RetirementStatus fromStatus;
        RetirementStatus toStatus;
        uint256          timestamp;
        address          actor;
        string           note;
    }

    // ─── Retirement Record ─────────────────────────────────────────────────
    struct RetirementRecord {
        address         assetToken;
        address         vault;
        address         investor;
        uint256         sharesBurned;
        uint256         creditsRetired;
        uint256         batchId;           // startBatchId for the FIFO allocation
        string          serialStart;
        string          serialEnd;
        bytes32         registryTxHash;
        bytes32         retirementCertHash;
        string          beneficiaryName;
        string          retirementPurpose;
        RetirementStatus status;
        uint256         requestedAt;
        uint256         confirmedAt;
        // SLA & retry fields
        uint8           retryCount;
        uint8           maxRetries;
        uint256         retryIntervalSeconds;
        uint256         nextRetryAt;
        uint256         slaDeadline;       // requestedAt + maxWaitPeriod
        uint256         governanceDeadline;// slaDeadline + governanceBuffer
    }

    // ─── Core Lifecycle Functions ──────────────────────────────────────────

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

    // ─── Retry Functions ───────────────────────────────────────────────────

    /// @notice Advances the retry counter. Must wait retryIntervalSeconds between calls.
    ///         Callable by REGISTRY_OPERATOR_ROLE.
    function triggerRetry(uint256 retirementId) external;

    // ─── Escalation Functions ──────────────────────────────────────────────

    /// @notice Escalates to Compliance after retry limit is exhausted.
    ///         Callable by REGISTRY_OPERATOR_ROLE or COMPLIANCE_ROLE.
    function escalateToCompliance(uint256 retirementId, string calldata reason) external;

    /// @notice Escalates to Governance after the SLA deadline passes.
    ///         Callable by COMPLIANCE_ROLE.
    function escalateToGovernance(uint256 retirementId) external;

    // ─── Governance Functions ──────────────────────────────────────────────

    /// @notice Governance extends the SLA deadline by additional seconds.
    function governanceExtendSLA(uint256 retirementId, uint256 extensionSeconds) external;

    /// @notice Governance cancels the retirement, releasing reserved credits back.
    function governanceCancel(uint256 retirementId, string calldata reason) external;

    /// @notice Governance explicitly continues holding with a logged note (no state change).
    function governanceContinueHold(uint256 retirementId, string calldata note) external;

    // ─── View Functions ────────────────────────────────────────────────────

    function getRetirementRecord(uint256 id) external view returns (RetirementRecord memory);
    function getAuditTrail(uint256 id) external view returns (AuditEntry[] memory);
    function getRetirementsByInvestor(address investor) external view returns (uint256[] memory);
    function getRetirementsByVault(address vault) external view returns (uint256[] memory);
    function getInvestorStatusString(uint256 retirementId) external view returns (string memory);
    function isOverSLA(uint256 retirementId) external view returns (bool);
    function isEligibleForGovernanceEscalation(uint256 retirementId) external view returns (bool);

    // ─── Events ────────────────────────────────────────────────────────────

    event RetirementRequested(uint256 indexed id, address indexed investor, address vault, uint256 credits, uint256 timestamp);
    event RetryTriggered(uint256 indexed id, uint8 retryCount, uint8 maxRetries, uint256 nextRetryAt);
    event EscalatedToCompliance(uint256 indexed id, address actor, string reason, uint256 timestamp);
    event EscalatedToGovernance(uint256 indexed id, uint256 timestamp);
    event GovernanceSLAExtended(uint256 indexed id, uint256 newDeadline, address governor);
    event GovernanceCancelled(uint256 indexed id, string reason, address governor);
    event GovernanceContinueHold(uint256 indexed id, string note, address governor);
    event RetirementConfirmed(uint256 indexed id, string serialStart, string serialEnd, bytes32 registryTxHash);
    event RetirementFailed(uint256 indexed id, string reason);
    event RetirementCancelled(uint256 indexed id, string reason, address governor);
}
