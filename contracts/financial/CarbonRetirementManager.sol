// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "../interfaces/carbon/ICarbonRegistry.sol";
import "../interfaces/carbon/ICarbonRetirementManager.sol";
import "../asset/carbon/CarbonBatchManager.sol";
import "../asset/carbon/CarbonAssetMetadataStore.sol";
import "../interfaces/asset/IOwnershipSync.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

interface IVault {
    function asset() external view returns (address);
    function burnShares(address account, uint256 amount) external;
    function balanceOf(address account) external view returns (uint256);
    function totalSupply() external view returns (uint256);
}

/**
 * @title CarbonRetirementManager
 * @notice Manages the full carbon credit retirement lifecycle including:
 *         - FIFO serial number allocation from CarbonBatchManager
 *         - Registry verification with automatic retry (up to maxRetries)
 *         - Compliance escalation after retry limit
 *         - Governance escalation after max wait period
 *         - Complete immutable audit trail per retirement
 *         - Investor-visible status strings at every stage
 *         - Credit release on cancellation / failure
 *         - Vault share burn and BOR update on confirmation
 *
 * @dev Registry Verification SLA defaults (all configurable by DEFAULT_ADMIN_ROLE):
 *      - maxRetries:             3
 *      - retryIntervalSeconds:   8 hours
 *      - maxWaitPeriodSeconds:   24 hours  (SLA deadline = requestedAt + maxWait)
 *      - governanceBufferSeconds: 72 hours (governance deadline = slaDeadline + buffer)
 */
contract CarbonRetirementManager is ICarbonRetirementManager, AccessControl {

    // ─── Roles ──────────────────────────────────────────────────────────────
    bytes32 public constant REGISTRY_OPERATOR_ROLE = keccak256("REGISTRY_OPERATOR_ROLE");
    bytes32 public constant COMPLIANCE_ROLE         = keccak256("COMPLIANCE_ROLE");
    bytes32 public constant GOVERNANCE_ROLE          = keccak256("GOVERNANCE_ROLE");

    // ─── Immutable Dependencies ──────────────────────────────────────────────
    CarbonBatchManager       public immutable batchManager;
    CarbonAssetMetadataStore public immutable metadataStore; // optional (can be address(0))
    address                  public immutable ownershipSyncManager;

    // ─── SLA Configuration (admin-adjustable) ───────────────────────────────
    uint8   public defaultMaxRetries             = 3;
    uint256 public defaultRetryIntervalSeconds   = 8 hours;
    uint256 public defaultMaxWaitPeriodSeconds   = 24 hours;
    uint256 public defaultGovernanceBufferSeconds = 72 hours;

    // ─── Internal Storage ────────────────────────────────────────────────────
    struct InternalRecord {
        address          assetToken;
        address          vault;
        address          investor;
        uint256          sharesBurned;
        uint256          creditsRetired;
        uint256          startBatchId;
        uint256          endBatchId;
        string           serialStart;
        string           serialEnd;
        bytes32          registryTxHash;
        bytes32          retirementCertHash;
        string           beneficiaryName;
        string           retirementPurpose;
        RetirementStatus status;
        uint256          requestedAt;
        uint256          confirmedAt;
        // SLA & retry
        uint8            retryCount;
        uint8            maxRetries;
        uint256          retryIntervalSeconds;
        uint256          nextRetryAt;
        uint256          slaDeadline;
        uint256          governanceDeadline;
    }

    mapping(uint256 => InternalRecord)  private _retirements;
    mapping(uint256 => AuditEntry[])    private _auditTrails;
    mapping(address => uint256[])       private _investorRetirements;
    mapping(address => uint256[])       private _vaultRetirements;

    uint256 public nextRetirementId;

    // ─── Constructor ────────────────────────────────────────────────────────
    constructor(
        address admin,
        address _batchManager,
        address _metadataStore,
        address _ownershipSyncManager
    ) {
        _grantRole(DEFAULT_ADMIN_ROLE,    admin);
        _grantRole(REGISTRY_OPERATOR_ROLE, admin);
        _grantRole(COMPLIANCE_ROLE,       admin);
        _grantRole(GOVERNANCE_ROLE,       admin);

        batchManager        = CarbonBatchManager(_batchManager);
        metadataStore       = CarbonAssetMetadataStore(_metadataStore);
        ownershipSyncManager = _ownershipSyncManager;
    }

    // ─── Admin: SLA Config ────────────────────────────────────────────────
    function setSLAConfig(
        uint8   _maxRetries,
        uint256 _retryIntervalSeconds,
        uint256 _maxWaitPeriodSeconds,
        uint256 _governanceBufferSeconds
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        defaultMaxRetries              = _maxRetries;
        defaultRetryIntervalSeconds    = _retryIntervalSeconds;
        defaultMaxWaitPeriodSeconds    = _maxWaitPeriodSeconds;
        defaultGovernanceBufferSeconds = _governanceBufferSeconds;
    }

    // ─── Internal Helpers ────────────────────────────────────────────────
    function _appendAudit(
        uint256          id,
        RetirementStatus from,
        RetirementStatus to,
        string memory    note
    ) internal {
        _auditTrails[id].push(AuditEntry({
            fromStatus: from,
            toStatus:   to,
            timestamp:  block.timestamp,
            actor:      msg.sender,
            note:       note
        }));
    }

    function _requireActive(InternalRecord storage r) internal view {
        require(
            r.status != RetirementStatus.CONFIRMED &&
            r.status != RetirementStatus.FAILED    &&
            r.status != RetirementStatus.CANCELLED,
            "Retirement: already terminal"
        );
    }

    function _releaseCredits(InternalRecord storage r) internal {
        batchManager.releaseCredits(r.assetToken, r.startBatchId, r.endBatchId, r.creditsRetired);
        if (address(metadataStore) != address(0) && metadataStore.isRegistered(r.assetToken)) {
            metadataStore.failRetirementCredits(r.assetToken, r.creditsRetired);
        }
    }

    // ─── 1. Request Retirement ───────────────────────────────────────────
    function requestRetirement(
        address vault,
        uint256 shares,
        string calldata beneficiaryName,
        string calldata retirementPurpose
    ) external override returns (uint256 retirementId) {
        require(shares > 0, "Retirement: zero shares");
        IVault v = IVault(vault);
        require(v.balanceOf(msg.sender) >= shares, "Retirement: insufficient shares balance");

        address assetToken       = v.asset();
        uint256 totalVaultShares = v.totalSupply();
        require(totalVaultShares > 0, "Retirement: zero vault shares");

        // Determine total credits
        uint256 totalCredits = 0;
        if (address(metadataStore) != address(0) && metadataStore.isRegistered(assetToken)) {
            totalCredits = metadataStore.getCarbonMetadata(assetToken).totalCredits;
        } else {
            uint256 count = batchManager.getBatchCount(assetToken);
            for (uint256 i = 0; i < count; i++) {
                totalCredits += batchManager.getBatch(assetToken, i).totalCredits;
            }
        }
        require(totalCredits > 0, "Retirement: zero total credits");

        uint256 credits = (shares * totalCredits) / totalVaultShares;
        require(credits > 0, "Retirement: share amount resolves to zero credits");

        // FIFO serial allocation
        (uint256 startBatch, uint256 endBatch, string memory sStart, string memory sEnd) =
            batchManager.allocateCredits(assetToken, credits);

        if (address(metadataStore) != address(0) && metadataStore.isRegistered(assetToken)) {
            metadataStore.decrementAvailableCredits(assetToken, credits);
        }

        // Compute SLA deadlines
        uint256 slaDeadline        = block.timestamp + defaultMaxWaitPeriodSeconds;
        uint256 governanceDeadline = slaDeadline + defaultGovernanceBufferSeconds;
        uint256 nextRetryAt        = block.timestamp + defaultRetryIntervalSeconds;

        retirementId = nextRetirementId++;
        _retirements[retirementId] = InternalRecord({
            assetToken:         assetToken,
            vault:              vault,
            investor:           msg.sender,
            sharesBurned:       shares,
            creditsRetired:     credits,
            startBatchId:       startBatch,
            endBatchId:         endBatch,
            serialStart:        sStart,
            serialEnd:          sEnd,
            registryTxHash:     bytes32(0),
            retirementCertHash: bytes32(0),
            beneficiaryName:    beneficiaryName,
            retirementPurpose:  retirementPurpose,
            status:             RetirementStatus.PENDING_REGISTRY,
            requestedAt:        block.timestamp,
            confirmedAt:        0,
            retryCount:         0,
            maxRetries:         defaultMaxRetries,
            retryIntervalSeconds: defaultRetryIntervalSeconds,
            nextRetryAt:        nextRetryAt,
            slaDeadline:        slaDeadline,
            governanceDeadline: governanceDeadline
        });

        _investorRetirements[msg.sender].push(retirementId);
        _vaultRetirements[vault].push(retirementId);

        _appendAudit(retirementId, RetirementStatus.REQUESTED, RetirementStatus.PENDING_REGISTRY,
            "Registry verification initiated");

        emit RetirementRequested(retirementId, msg.sender, vault, credits, block.timestamp);
    }

    // ─── 2. Trigger Retry ────────────────────────────────────────────────
    /**
     * @notice Logs a retry attempt. Callable by REGISTRY_OPERATOR_ROLE.
     *         Must wait retryIntervalSeconds between calls.
     *         After maxRetries, status stays PENDING_REGISTRY until operator
     *         explicitly escalates to COMPLIANCE_REVIEW.
     */
    function triggerRetry(uint256 retirementId) external override onlyRole(REGISTRY_OPERATOR_ROLE) {
        InternalRecord storage r = _retirements[retirementId];
        _requireActive(r);
        require(
            r.status == RetirementStatus.PENDING_REGISTRY,
            "Retirement: not in PENDING_REGISTRY state"
        );
        require(block.timestamp >= r.nextRetryAt, "Retirement: retry interval not elapsed");
        require(r.retryCount < r.maxRetries,      "Retirement: retry limit reached, escalate to Compliance");

        r.retryCount++;
        r.nextRetryAt = block.timestamp + r.retryIntervalSeconds;

        _appendAudit(retirementId, RetirementStatus.PENDING_REGISTRY, RetirementStatus.PENDING_REGISTRY,
            string(abi.encodePacked("Retry #", _uint8ToString(r.retryCount), " of ", _uint8ToString(r.maxRetries))));

        emit RetryTriggered(retirementId, r.retryCount, r.maxRetries, r.nextRetryAt);
    }

    // ─── 3. Confirm (Success) ────────────────────────────────────────────
    /**
     * @notice Registry confirmed the retirement. Burns shares and updates BOR.
     *         Valid from PENDING_REGISTRY or COMPLIANCE_REVIEW or GOVERNANCE_REVIEW.
     */
    function confirmRetirement(
        uint256 retirementId,
        string calldata serialStart,
        string calldata serialEnd,
        bytes32 registryTxHash,
        bytes32 retirementCertHash
    ) external override onlyRole(REGISTRY_OPERATOR_ROLE) {
        InternalRecord storage record = _retirements[retirementId];
        _requireActive(record);
        require(registryTxHash != bytes32(0), "Retirement: invalid tx hash");

        RetirementStatus prev = record.status;

        record.status             = RetirementStatus.CONFIRMED;
        record.confirmedAt        = block.timestamp;
        record.serialStart        = serialStart;
        record.serialEnd          = serialEnd;
        record.registryTxHash     = registryTxHash;
        record.retirementCertHash = retirementCertHash;

        // Burn vault shares
        IVault(record.vault).burnShares(record.investor, record.sharesBurned);

        // Confirm in metadata store
        if (address(metadataStore) != address(0) && metadataStore.isRegistered(record.assetToken)) {
            metadataStore.confirmRetirementCredits(record.assetToken, record.creditsRetired);
        }

        // BOR update
        if (ownershipSyncManager != address(0)) {
            uint256 newBalance = IVault(record.vault).balanceOf(record.investor);
            try IOwnershipSync(ownershipSyncManager).updateBeneficialOwnership(
                record.assetToken,
                record.vault,
                record.investor,
                newBalance
            ) {} catch {}
        }

        _appendAudit(retirementId, prev, RetirementStatus.CONFIRMED,
            string(abi.encodePacked("Confirmed. Registry tx: ", _bytes32ToHex(registryTxHash))));

        emit RetirementConfirmed(retirementId, serialStart, serialEnd, registryTxHash);
    }

    // ─── 4. Fail (Hard Rejection) ────────────────────────────────────────
    /**
     * @notice Registry definitively rejected the retirement. Releases reserved credits.
     */
    function failRetirement(uint256 retirementId, string calldata reason)
        external override onlyRole(REGISTRY_OPERATOR_ROLE)
    {
        InternalRecord storage r = _retirements[retirementId];
        _requireActive(r);

        RetirementStatus prev = r.status;
        r.status = RetirementStatus.FAILED;

        _releaseCredits(r);
        _appendAudit(retirementId, prev, RetirementStatus.FAILED, reason);

        emit RetirementFailed(retirementId, reason);
    }

    // ─── 5. Escalate to Compliance ───────────────────────────────────────
    /**
     * @notice Escalates after retry limit is exhausted.
     *         Callable by REGISTRY_OPERATOR_ROLE or COMPLIANCE_ROLE.
     */
    function escalateToCompliance(uint256 retirementId, string calldata reason)
        external override
    {
        require(
            hasRole(REGISTRY_OPERATOR_ROLE, msg.sender) || hasRole(COMPLIANCE_ROLE, msg.sender),
            "Retirement: unauthorized"
        );
        InternalRecord storage r = _retirements[retirementId];
        _requireActive(r);
        require(
            r.status == RetirementStatus.PENDING_REGISTRY,
            "Retirement: must be PENDING_REGISTRY to escalate"
        );
        require(
            r.retryCount >= r.maxRetries || block.timestamp >= r.slaDeadline,
            "Retirement: retry limit not reached and SLA not breached"
        );

        r.status = RetirementStatus.COMPLIANCE_REVIEW;

        _appendAudit(retirementId, RetirementStatus.PENDING_REGISTRY, RetirementStatus.COMPLIANCE_REVIEW, reason);

        emit EscalatedToCompliance(retirementId, msg.sender, reason, block.timestamp);
    }

    // ─── 6. Escalate to Governance ───────────────────────────────────────
    /**
     * @notice Escalates after slaDeadline is passed. Callable by COMPLIANCE_ROLE.
     */
    function escalateToGovernance(uint256 retirementId)
        external override onlyRole(COMPLIANCE_ROLE)
    {
        InternalRecord storage r = _retirements[retirementId];
        _requireActive(r);
        require(
            r.status == RetirementStatus.COMPLIANCE_REVIEW,
            "Retirement: must be in COMPLIANCE_REVIEW"
        );
        require(
            block.timestamp >= r.slaDeadline,
            "Retirement: max wait period not yet exceeded"
        );

        r.status = RetirementStatus.GOVERNANCE_REVIEW;

        _appendAudit(retirementId, RetirementStatus.COMPLIANCE_REVIEW, RetirementStatus.GOVERNANCE_REVIEW,
            "Escalated to Governance: max wait period exceeded");

        emit EscalatedToGovernance(retirementId, block.timestamp);
    }

    // ─── 7. Governance: Extend SLA ───────────────────────────────────────
    function governanceExtendSLA(uint256 retirementId, uint256 extensionSeconds)
        external override onlyRole(GOVERNANCE_ROLE)
    {
        InternalRecord storage r = _retirements[retirementId];
        _requireActive(r);
        require(r.status == RetirementStatus.GOVERNANCE_REVIEW, "Retirement: not in Governance Review");
        require(extensionSeconds > 0, "Retirement: zero extension");

        r.slaDeadline        += extensionSeconds;
        r.governanceDeadline += extensionSeconds;

        _appendAudit(retirementId, RetirementStatus.GOVERNANCE_REVIEW, RetirementStatus.GOVERNANCE_REVIEW,
            string(abi.encodePacked("SLA extended by ", _uint256ToString(extensionSeconds), " seconds")));

        emit GovernanceSLAExtended(retirementId, r.slaDeadline, msg.sender);
    }

    // ─── 8. Governance: Cancel ───────────────────────────────────────────
    /**
     * @notice Governance cancels the retirement. Credits released back to the pool.
     */
    function governanceCancel(uint256 retirementId, string calldata reason)
        external override onlyRole(GOVERNANCE_ROLE)
    {
        InternalRecord storage r = _retirements[retirementId];
        _requireActive(r);
        require(r.status == RetirementStatus.GOVERNANCE_REVIEW, "Retirement: not in Governance Review");

        RetirementStatus prev = r.status;
        r.status = RetirementStatus.CANCELLED;

        _releaseCredits(r);
        _appendAudit(retirementId, prev, RetirementStatus.CANCELLED, reason);

        emit GovernanceCancelled(retirementId, reason, msg.sender);
        emit RetirementCancelled(retirementId, reason, msg.sender);
    }

    // ─── 9. Governance: Continue Hold ────────────────────────────────────
    /**
     * @notice Governance logs a "continue hold" note. No state change.
     *         Used to show the investor the case is actively managed.
     */
    function governanceContinueHold(uint256 retirementId, string calldata note)
        external override onlyRole(GOVERNANCE_ROLE)
    {
        InternalRecord storage r = _retirements[retirementId];
        _requireActive(r);
        require(r.status == RetirementStatus.GOVERNANCE_REVIEW, "Retirement: not in Governance Review");

        _appendAudit(retirementId, RetirementStatus.GOVERNANCE_REVIEW, RetirementStatus.GOVERNANCE_REVIEW, note);

        emit GovernanceContinueHold(retirementId, note, msg.sender);
    }

    // ─── View: Get Full Record ────────────────────────────────────────────
    function getRetirementRecord(uint256 id) external view override returns (RetirementRecord memory) {
        InternalRecord memory r = _retirements[id];
        return RetirementRecord({
            assetToken:          r.assetToken,
            vault:               r.vault,
            investor:            r.investor,
            sharesBurned:        r.sharesBurned,
            creditsRetired:      r.creditsRetired,
            batchId:             r.startBatchId,
            serialStart:         r.serialStart,
            serialEnd:           r.serialEnd,
            registryTxHash:      r.registryTxHash,
            retirementCertHash:  r.retirementCertHash,
            beneficiaryName:     r.beneficiaryName,
            retirementPurpose:   r.retirementPurpose,
            status:              r.status,
            requestedAt:         r.requestedAt,
            confirmedAt:         r.confirmedAt,
            retryCount:          r.retryCount,
            maxRetries:          r.maxRetries,
            retryIntervalSeconds: r.retryIntervalSeconds,
            nextRetryAt:         r.nextRetryAt,
            slaDeadline:         r.slaDeadline,
            governanceDeadline:  r.governanceDeadline
        });
    }

    // ─── View: Audit Trail ────────────────────────────────────────────────
    function getAuditTrail(uint256 id) external view override returns (AuditEntry[] memory) {
        return _auditTrails[id];
    }

    // ─── View: By Investor / Vault ────────────────────────────────────────
    function getRetirementsByInvestor(address investor) external view override returns (uint256[] memory) {
        return _investorRetirements[investor];
    }

    function getRetirementsByVault(address vault) external view override returns (uint256[] memory) {
        return _vaultRetirements[vault];
    }

    // ─── View: Investor-Facing Status String ──────────────────────────────
    function getInvestorStatusString(uint256 retirementId) external view override returns (string memory) {
        RetirementStatus s = _retirements[retirementId].status;
        if (s == RetirementStatus.PENDING_REGISTRY)  return "Registry Verification in Progress";
        if (s == RetirementStatus.COMPLIANCE_REVIEW) return "Escalated to Compliance Review";
        if (s == RetirementStatus.GOVERNANCE_REVIEW) return "Under Governance Review";
        if (s == RetirementStatus.CONFIRMED)         return "Registry Verification Completed";
        if (s == RetirementStatus.FAILED)            return "Registry Verification Failed";
        if (s == RetirementStatus.CANCELLED)         return "Cancelled by Governance";
        return "Pending Registry Confirmation";
    }

    // ─── View: SLA Checks ─────────────────────────────────────────────────
    function isOverSLA(uint256 retirementId) external view override returns (bool) {
        return block.timestamp >= _retirements[retirementId].slaDeadline;
    }

    function isEligibleForGovernanceEscalation(uint256 retirementId) external view override returns (bool) {
        InternalRecord storage r = _retirements[retirementId];
        return r.status == RetirementStatus.COMPLIANCE_REVIEW && block.timestamp >= r.slaDeadline;
    }

    // ─── Internal: String Utilities ───────────────────────────────────────
    function _uint8ToString(uint8 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint8 tmp = v;
        uint8 digits;
        while (tmp != 0) { digits++; tmp /= 10; }
        bytes memory buf = new bytes(digits);
        while (v != 0) { digits--; buf[digits] = bytes1(uint8(48 + v % 10)); v /= 10; }
        return string(buf);
    }

    function _uint256ToString(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 tmp = v;
        uint256 digits;
        while (tmp != 0) { digits++; tmp /= 10; }
        bytes memory buf = new bytes(digits);
        while (v != 0) { digits--; buf[digits] = bytes1(uint8(48 + v % 10)); v /= 10; }
        return string(buf);
    }

    function _bytes32ToHex(bytes32 b) internal pure returns (string memory) {
        bytes memory hex_ = new bytes(64);
        bytes memory alphabet = "0123456789abcdef";
        for (uint256 i = 0; i < 32; i++) {
            hex_[i * 2]     = alphabet[uint8(b[i] >> 4)];
            hex_[i * 2 + 1] = alphabet[uint8(b[i] & 0x0f)];
        }
        return string(hex_);
    }
}
