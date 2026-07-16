// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "../../interfaces/asset/IAssetPlugin.sol";
import "../../interfaces/dms/IDMS.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title CarbonCreditPlugin
 * @dev Institutional-grade carbon credit validation plugin.
 * Archetype: STATIC_HOLD (0)
 */
contract CarbonCreditPlugin is IAssetPlugin, Ownable {
    bytes32 public constant CATEGORY_ID = keccak256("CARBON_CREDIT");
    string public constant CATEGORY_NAME = "Carbon Credit";

    address public dmsRegistry;

    event DMSRegistryUpdated(address indexed oldDMS, address indexed newDMS);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function setDMSRegistry(address dms) external onlyOwner {
        address old = dmsRegistry;
        dmsRegistry = dms;
        emit DMSRegistryUpdated(old, dms);
    }

    function getCategoryId() external pure override returns (bytes32) {
        return CATEGORY_ID;
    }

    function getCategoryName() external pure override returns (string memory) {
        return CATEGORY_NAME;
    }

    function redemptionPolicy() external pure override returns (bool defaultEnabled, bool issuerCanOverride) {
        // Carbon credits use RETIRE_BURN, not standard redemption
        return (false, false);
    }

    function archetypeType() external pure returns (uint8) {
        return 0; // Archetype.STATIC_HOLD
    }

    function exitMechanism() external pure returns (uint8) {
        return 1; // ExitMechanism.RETIRE_BURN
    }

    function validateCreation(
        address /*issuer*/,
        AssetParams calldata params
    ) external pure override returns (bool) {
        require(params.initialSupply > 0, "Carbon: supply required");
        require(params.categoryId == CATEGORY_ID, "Carbon: invalid category");
        return true;
    }

    function validateDocuments(
        AssetDocument[] calldata docs
    ) external view override returns (bool) {
        bool hasVerificationReport      = false;
        bool hasValidationReport        = false;
        bool hasIssuanceCert            = false;
        bool hasProjectDesignDoc        = false;
        bool hasMonitoringReport        = false;
        bool hasRegistryExport          = false;
        bool hasImmobilizationProof     = false;

        for (uint256 i = 0; i < docs.length; i++) {
            bytes32 typeHash = keccak256(bytes(docs[i].docType));

            // DMS approval gate if DMS is set
            if (dmsRegistry != address(0)) {
                require(
                    IDMS(dmsRegistry).isDocumentApproved(docs[i].docHash),
                    "Carbon: document not DMS-approved"
                );
            }

            if (typeHash == keccak256("VERIFICATION_REPORT"))    hasVerificationReport  = true;
            if (typeHash == keccak256("VALIDATION_REPORT"))      hasValidationReport    = true;
            if (typeHash == keccak256("ISSUANCE_CERTIFICATE"))   hasIssuanceCert        = true;
            if (typeHash == keccak256("PROJECT_DESIGN_DOC"))     hasProjectDesignDoc    = true;
            if (typeHash == keccak256("MONITORING_REPORT"))      hasMonitoringReport    = true;
            if (typeHash == keccak256("REGISTRY_EXPORT"))        hasRegistryExport      = true;
            if (typeHash == keccak256("IMMOBILIZATION_PROOF"))   hasImmobilizationProof = true;
        }

        require(hasVerificationReport,   "Carbon: VERIFICATION_REPORT required");
        require(hasValidationReport,     "Carbon: VALIDATION_REPORT required");
        require(hasIssuanceCert,         "Carbon: ISSUANCE_CERTIFICATE required");
        require(hasProjectDesignDoc,     "Carbon: PROJECT_DESIGN_DOC required");
        require(hasMonitoringReport,     "Carbon: MONITORING_REPORT required");
        require(hasRegistryExport,       "Carbon: REGISTRY_EXPORT required");
        require(hasImmobilizationProof,  "Carbon: IMMOBILIZATION_PROOF required");

        return true;
    }

    function getRequiredDocumentTypes() external pure returns (
        string[] memory types,
        uint8[]   memory approvalModes   // 0=AUTO, 1=MANUAL, 2=COMPLIANCE_REQUIRED
    ) {
        types = new string[](7);
        approvalModes = new uint8[](7);

        types[0] = "VERIFICATION_REPORT";    approvalModes[0] = 2; // COMPLIANCE_REQUIRED
        types[1] = "VALIDATION_REPORT";      approvalModes[1] = 2;
        types[2] = "ISSUANCE_CERTIFICATE";   approvalModes[2] = 2;
        types[3] = "PROJECT_DESIGN_DOC";     approvalModes[3] = 1; // MANUAL
        types[4] = "MONITORING_REPORT";      approvalModes[4] = 1;
        types[5] = "REGISTRY_EXPORT";        approvalModes[5] = 2;
        types[6] = "IMMOBILIZATION_PROOF";   approvalModes[6] = 2;
    }

    function getRequiredDocuments() external pure override returns (string[] memory docs) {
        docs = new string[](7);
        docs[0] = "VERIFICATION_REPORT";
        docs[1] = "VALIDATION_REPORT";
        docs[2] = "ISSUANCE_CERTIFICATE";
        docs[3] = "PROJECT_DESIGN_DOC";
        docs[4] = "MONITORING_REPORT";
        docs[5] = "REGISTRY_EXPORT";
        docs[6] = "IMMOBILIZATION_PROOF";
        return docs;
    }
}
