// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "../../interfaces/carbon/ICarbonRegistry.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title CarbonAssetMetadataStore
 * @dev Optional storage contract for carbon-specific registry metadata.
 */
contract CarbonAssetMetadataStore is ICarbonRegistry, AccessControl {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant RETIREMENT_MANAGER_ROLE = keccak256("RETIREMENT_MANAGER_ROLE");

    struct CarbonRegistryMetadata {
        // ── Registry identifiers (small strings, on-chain) ───────
        RegistryType registryType;
        string   registryProjectId;   // e.g. "VCS-1360", "GS-10340"
        string   registryBatchId;     // Registry-assigned batch ID
        string   registryUrl;         // Official registry URL
        CreditType creditType;
        RegistrySyncStatus syncStatus;

        // ── Project essentials (on-chain for filtering/query) ────
        string   projectName;
        ProjectType projectType;
        string   methodology;         // e.g. "VM0048", "GS-TPDDTEC"
        uint16   vintage;             // credit generation year
        string   country;             // ISO 3166-1 alpha-2 code ONLY
        uint256  areaHectares;        // scaled 1e2

        // ── Serial range (registered at tokenization, public) ────
        string   serialRangeStart;    // e.g. "VCU-1000001" — visible to producer + investors
        string   serialRangeEnd;      // e.g. "VCU-1010000"
        bytes32  serialCommitment;    // keccak256(serialStart + serialEnd) — tamper proof

        // ── Batch accounting (on-chain, mutates on retirement) ───
        uint256  totalCredits;        // tCO2e in this batch
        uint256  availableCredits;    // decrements on retirement
        uint256  reservedCredits;     // locked in pending retirements
        uint256  retiredCredits;      // permanently consumed

        // ── Document hashes only (IPFS/DMS holds the actual files) 
        bytes32  verificationReportHash;    // SHA-256 anchor
        bytes32  validationReportHash;
        bytes32  monitoringReportHash;      // updated annually
        bytes32  issuanceCertificateHash;
        bytes32  immobilizationProofHash;   // registry lock confirmation

        // ── ICVCM ────────────────────────────────────────────────
        CCPStatus ccpStatus;
        bool     corsiaEligible;
        bool     article6Authorized;

        // ── Manifest pointer (single IPFS reference to everything)
        string   manifestIpfsCid;     // ipfs://Qm... — manifest JSON with all metadata
        bytes32  manifestHash;        // SHA-256 of manifest — on-chain integrity anchor
        string   coverImageCid;       // ipfs://Qm... — single cover image for UI display
    }

    mapping(address => CarbonRegistryMetadata) private _metadata;
    mapping(address => bool) private _isRegistered;

    event CarbonAssetRegistered(address indexed assetToken, string serialStart, string serialEnd, string registryProjectId);
    event RegistrySyncCompleted(address indexed assetToken, RegistrySyncStatus newStatus, uint256 timestamp);
    event MonitoringReportUpdated(address indexed assetToken, bytes32 newReportHash, uint256 reportDate);
    event CreditReservationUpdated(address indexed assetToken, uint256 available, uint256 reserved, uint256 retired);
    event ManifestUpdated(address indexed assetToken, string newCid, bytes32 newHash);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
    }

    function registerCarbonAsset(address assetToken, CarbonRegistryMetadata calldata meta) external onlyRole(OPERATOR_ROLE) {
        require(assetToken != address(0), "MetadataStore: invalid token");
        require(!_isRegistered[assetToken], "MetadataStore: already registered");
        require(meta.serialCommitment == keccak256(abi.encodePacked(meta.serialRangeStart, meta.serialRangeEnd)), "MetadataStore: commitment mismatch");

        _metadata[assetToken] = meta;
        _isRegistered[assetToken] = true;

        emit CarbonAssetRegistered(assetToken, meta.serialRangeStart, meta.serialRangeEnd, meta.registryProjectId);
        emit RegistrySyncCompleted(assetToken, meta.syncStatus, block.timestamp);
    }

    function updateRegistrySyncStatus(address assetToken, RegistrySyncStatus status) external onlyRole(OPERATOR_ROLE) {
        require(_isRegistered[assetToken], "MetadataStore: not registered");
        _metadata[assetToken].syncStatus = status;
        emit RegistrySyncCompleted(assetToken, status, block.timestamp);
    }

    function updateMonitoringReport(address assetToken, bytes32 newReportHash, uint256 reportDate) external onlyRole(OPERATOR_ROLE) {
        require(_isRegistered[assetToken], "MetadataStore: not registered");
        _metadata[assetToken].monitoringReportHash = newReportHash;
        emit MonitoringReportUpdated(assetToken, newReportHash, reportDate);
    }

    function updateManifest(address assetToken, string calldata newCid, bytes32 newHash) external onlyRole(OPERATOR_ROLE) {
        require(_isRegistered[assetToken], "MetadataStore: not registered");
        _metadata[assetToken].manifestIpfsCid = newCid;
        _metadata[assetToken].manifestHash = newHash;
        emit ManifestUpdated(assetToken, newCid, newHash);
    }

    function decrementAvailableCredits(address assetToken, uint256 amount) external onlyRole(RETIREMENT_MANAGER_ROLE) {
        require(_isRegistered[assetToken], "MetadataStore: not registered");
        CarbonRegistryMetadata storage meta = _metadata[assetToken];
        require(meta.availableCredits >= amount, "MetadataStore: insufficient available credits");
        
        meta.availableCredits -= amount;
        meta.reservedCredits += amount;

        emit CreditReservationUpdated(assetToken, meta.availableCredits, meta.reservedCredits, meta.retiredCredits);
    }

    function confirmRetirementCredits(address assetToken, uint256 amount) external onlyRole(RETIREMENT_MANAGER_ROLE) {
        require(_isRegistered[assetToken], "MetadataStore: not registered");
        CarbonRegistryMetadata storage meta = _metadata[assetToken];
        require(meta.reservedCredits >= amount, "MetadataStore: insufficient reserved credits");

        meta.reservedCredits -= amount;
        meta.retiredCredits += amount;

        emit CreditReservationUpdated(assetToken, meta.availableCredits, meta.reservedCredits, meta.retiredCredits);
    }

    function failRetirementCredits(address assetToken, uint256 amount) external onlyRole(RETIREMENT_MANAGER_ROLE) {
        require(_isRegistered[assetToken], "MetadataStore: not registered");
        CarbonRegistryMetadata storage meta = _metadata[assetToken];
        require(meta.reservedCredits >= amount, "MetadataStore: insufficient reserved credits");

        meta.reservedCredits -= amount;
        meta.availableCredits += amount;

        emit CreditReservationUpdated(assetToken, meta.availableCredits, meta.reservedCredits, meta.retiredCredits);
    }

    function getCarbonHoldingView(
        address assetToken,
        address vault,
        address investor
    ) external view returns (
        uint256 vaultShares,        // investor's current vault share balance
        uint256 creditEquivalent,   // proportional tCO2e stake (no serial assignment)
        uint256 pctBps,             // ownership % in basis points (e.g. 2000 = 20.00%)
        uint256 availableToRetire,  // credits investor could currently retire
        RegistrySyncStatus syncStatus
    ) {
        vaultShares = IERC20(vault).balanceOf(investor);
        uint256 totalSupply = IERC20(vault).totalSupply();
        CarbonRegistryMetadata storage m = _metadata[assetToken];

        if (totalSupply == 0) return (0, 0, 0, 0, m.syncStatus);

        pctBps = (vaultShares * 10_000) / totalSupply;
        creditEquivalent = (vaultShares * m.totalCredits) / totalSupply;
        availableToRetire = (vaultShares * m.availableCredits) / totalSupply;
        syncStatus = m.syncStatus;
    }

    function getSerialRange(address assetToken) external view returns (string memory start, string memory end) {
        require(_isRegistered[assetToken], "MetadataStore: not registered");
        return (_metadata[assetToken].serialRangeStart, _metadata[assetToken].serialRangeEnd);
    }

    function getCarbonMetadata(address assetToken) external view returns (CarbonRegistryMetadata memory) {
        require(_isRegistered[assetToken], "MetadataStore: not registered");
        return _metadata[assetToken];
    }

    function isRegistered(address assetToken) external view returns (bool) {
        return _isRegistered[assetToken];
    }
}
