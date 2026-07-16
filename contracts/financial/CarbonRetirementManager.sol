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

contract CarbonRetirementManager is ICarbonRetirementManager, AccessControl {
    bytes32 public constant REGISTRY_OPERATOR_ROLE = keccak256("REGISTRY_OPERATOR_ROLE");

    CarbonBatchManager public immutable batchManager;
    CarbonAssetMetadataStore public immutable metadataStore; // optional (can be address(0))
    address public immutable ownershipSyncManager;

    struct ExtendedRetirementRecord {
        address assetToken;
        address vault;
        address investor;
        uint256 sharesBurned;
        uint256 creditsRetired;
        uint256 startBatchId;
        uint256 endBatchId;
        string serialStart;
        string serialEnd;
        bytes32 registryTxHash;
        bytes32 retirementCertHash;
        string beneficiaryName;
        string retirementPurpose;
        RetirementStatus status;
        uint256 requestedAt;
        uint256 confirmedAt;
    }

    mapping(uint256 => ExtendedRetirementRecord) private _retirements;
    mapping(address => uint256[]) private _investorRetirements;
    mapping(address => uint256[]) private _vaultRetirements;
    
    uint256 public nextRetirementId;

    constructor(
        address admin,
        address _batchManager,
        address _metadataStore,
        address _ownershipSyncManager
    ) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REGISTRY_OPERATOR_ROLE, admin);

        batchManager = CarbonBatchManager(_batchManager);
        metadataStore = CarbonAssetMetadataStore(_metadataStore);
        ownershipSyncManager = _ownershipSyncManager;
    }

    function requestRetirement(
        address vault,
        uint256 shares,
        string calldata beneficiaryName,
        string calldata retirementPurpose
    ) external override returns (uint256 retirementId) {
        require(shares > 0, "Retirement: zero shares");
        IVault v = IVault(vault);
        require(v.balanceOf(msg.sender) >= shares, "Retirement: insufficient shares balance");

        address assetToken = v.asset();
        uint256 totalVaultShares = v.totalSupply();
        require(totalVaultShares > 0, "Retirement: zero vault shares");

        // Determine total credits from batch manager or metadata store
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

        // Reserve credits in Batch Manager
        (uint256 startBatch, uint256 endBatch, string memory sStart, string memory sEnd) = 
            batchManager.allocateCredits(assetToken, credits);

        // Reserve credits in Metadata Store if available
        if (address(metadataStore) != address(0) && metadataStore.isRegistered(assetToken)) {
            metadataStore.decrementAvailableCredits(assetToken, credits);
        }

        retirementId = nextRetirementId++;
        _retirements[retirementId] = ExtendedRetirementRecord({
            assetToken: assetToken,
            vault: vault,
            investor: msg.sender,
            sharesBurned: shares,
            creditsRetired: credits,
            startBatchId: startBatch,
            endBatchId: endBatch,
            serialStart: sStart,
            serialEnd: sEnd,
            registryTxHash: bytes32(0),
            retirementCertHash: bytes32(0),
            beneficiaryName: beneficiaryName,
            retirementPurpose: retirementPurpose,
            status: RetirementStatus.REQUESTED,
            requestedAt: block.timestamp,
            confirmedAt: 0
        });

        _investorRetirements[msg.sender].push(retirementId);
        _vaultRetirements[vault].push(retirementId);

        emit RetirementRequested(retirementId, msg.sender, vault, credits, block.timestamp);
    }

    function confirmRetirement(
        uint256 retirementId,
        string calldata serialStart,
        string calldata serialEnd,
        bytes32 registryTxHash,
        bytes32 retirementCertHash
    ) external override onlyRole(REGISTRY_OPERATOR_ROLE) {
        ExtendedRetirementRecord storage record = _retirements[retirementId];
        require(record.status == RetirementStatus.REQUESTED, "Retirement: not in REQUESTED state");
        require(registryTxHash != bytes32(0), "Retirement: invalid tx hash");

        record.status = RetirementStatus.CONFIRMED;
        record.confirmedAt = block.timestamp;
        record.serialStart = serialStart;
        record.serialEnd = serialEnd;
        record.registryTxHash = registryTxHash;
        record.retirementCertHash = retirementCertHash;

        // Burn the shares from the vault
        IVault(record.vault).burnShares(record.investor, record.sharesBurned);

        // Confirm in Metadata Store if registered
        if (address(metadataStore) != address(0) && metadataStore.isRegistered(record.assetToken)) {
            metadataStore.confirmRetirementCredits(record.assetToken, record.creditsRetired);
        }

        // Notify OwnershipSyncManager (BOR update)
        if (ownershipSyncManager != address(0)) {
            uint256 newBalance = IVault(record.vault).balanceOf(record.investor);
            try IOwnershipSync(ownershipSyncManager).updateBeneficialOwnership(
                record.assetToken,
                record.vault,
                record.investor,
                newBalance
            ) {} catch {}
        }

        emit RetirementConfirmed(retirementId, serialStart, serialEnd, registryTxHash);
    }

    function failRetirement(uint256 retirementId, string calldata reason) external override onlyRole(REGISTRY_OPERATOR_ROLE) {
        ExtendedRetirementRecord storage record = _retirements[retirementId];
        require(record.status == RetirementStatus.REQUESTED, "Retirement: not in REQUESTED state");

        record.status = RetirementStatus.FAILED;

        // Release reserved credits in batch manager
        batchManager.releaseCredits(record.assetToken, record.startBatchId, record.endBatchId, record.creditsRetired);

        // Release in Metadata Store if registered
        if (address(metadataStore) != address(0) && metadataStore.isRegistered(record.assetToken)) {
            metadataStore.failRetirementCredits(record.assetToken, record.creditsRetired);
        }

        emit RetirementFailed(retirementId, reason);
    }

    function getRetirementRecord(uint256 id) external view override returns (RetirementRecord memory) {
        ExtendedRetirementRecord memory r = _retirements[id];
        return RetirementRecord({
            assetToken: r.assetToken,
            vault: r.vault,
            investor: r.investor,
            sharesBurned: r.sharesBurned,
            creditsRetired: r.creditsRetired,
            batchId: r.startBatchId,
            serialStart: r.serialStart,
            serialEnd: r.serialEnd,
            registryTxHash: r.registryTxHash,
            retirementCertHash: r.retirementCertHash,
            beneficiaryName: r.beneficiaryName,
            retirementPurpose: r.retirementPurpose,
            status: r.status,
            requestedAt: r.requestedAt,
            confirmedAt: r.confirmedAt
        });
    }

    function getRetirementsByInvestor(address investor) external view override returns (uint256[] memory) {
        return _investorRetirements[investor];
    }

    function getRetirementsByVault(address vault) external view returns (uint256[] memory) {
        return _vaultRetirements[vault];
    }
}
