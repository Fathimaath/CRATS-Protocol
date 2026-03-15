// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "../../interfaces/asset/plugins/IAssetPlugin.sol";
import "../../utils/AssetConfig.sol";

/**
 * @title CarbonCreditPlugin
 * @dev Plugin for Carbon Credit RWA category validation
 */
contract CarbonCreditPlugin is IAssetPlugin {

    // === Structs ===

    struct CarbonCreditData {
        string registry;
        string projectId;
        uint256 vintage;
        string projectType;
        uint256 totalCredits;
        string methodology;
    }

    // === View Functions ===

    function version() external pure override returns (string memory) {
        return AssetConfig.VERSION;
    }

    function getCategoryId() external pure override returns (bytes32) {
        return AssetConfig.CARBON_CREDIT;
    }

    function getCategoryName() external pure override returns (string memory) {
        return "Carbon Credit";
    }

    function getRequiredDocuments() external pure override returns (string[] memory) {
        string[] memory docs = new string[](5);
        docs[0] = "REGISTRY_CERT";
        docs[1] = "PROJECT_DOCS";
        docs[2] = "ISSUANCE_CERT";
        docs[3] = "VERIFICATION_REPORT";
        docs[4] = "RETIREMENT_CHECK";
        return docs;
    }

    function getDocumentRequirements() external pure override returns (DocumentRequirement[] memory) {
        DocumentRequirement[] memory requirements = new DocumentRequirement[](5);
        
        requirements[0] = DocumentRequirement("REGISTRY_CERT", true, 0); // Permanent
        requirements[1] = DocumentRequirement("PROJECT_DOCS", true, 0); // Permanent
        requirements[2] = DocumentRequirement("ISSUANCE_CERT", true, 0); // Permanent
        requirements[3] = DocumentRequirement("VERIFICATION_REPORT", true, 31536000); // 1 year
        requirements[4] = DocumentRequirement("RETIREMENT_CHECK", true, 86400); // 1 day (dynamic)
        
        return requirements;
    }

    // === Validation Functions ===

    function validateCreation(
        address issuer,
        bytes calldata categoryData
    ) external pure override returns (bool, string memory) {
        require(issuer != address(0), "CarbonCredit: Invalid issuer");
        require(categoryData.length > 0, "CarbonCredit: Category data required");
        require(categoryData.length >= 128, "CarbonCredit: Data too short");
        
        return (true, "Valid");
    }

    function validateDocuments(
        bytes32[] calldata docHashes,
        string[] calldata docTypes
    ) external pure override returns (bool, string memory) {
        require(docHashes.length == docTypes.length, "CarbonCredit: Array length mismatch");
        require(docHashes.length >= 5, "CarbonCredit: Missing required documents");

        bool hasRegistryCert = false;
        bool hasProjectDocs = false;
        bool hasIssuanceCert = false;
        bool hasVerification = false;

        for (uint256 i = 0; i < docTypes.length; i++) {
            string memory docType = docTypes[i];

            if (keccak256(bytes(docType)) == keccak256(bytes("REGISTRY_CERT"))) {
                hasRegistryCert = true;
            } else if (keccak256(bytes(docType)) == keccak256(bytes("PROJECT_DOCS"))) {
                hasProjectDocs = true;
            } else if (keccak256(bytes(docType)) == keccak256(bytes("ISSUANCE_CERT"))) {
                hasIssuanceCert = true;
            } else if (keccak256(bytes(docType)) == keccak256(bytes("VERIFICATION_REPORT"))) {
                hasVerification = true;
            }
        }

        require(hasRegistryCert, "CarbonCredit: Missing registry certificate");
        require(hasProjectDocs, "CarbonCredit: Missing project docs");
        require(hasIssuanceCert, "CarbonCredit: Missing issuance certificate");
        require(hasVerification, "CarbonCredit: Missing verification report");

        return (true, "Valid");
    }

    function validateValuation(
        uint256 proposedValue,
        bytes calldata valuationData
    ) external pure override returns (bool, string memory) {
        require(proposedValue > 0, "CarbonCredit: Value must be positive");
        require(valuationData.length > 0, "CarbonCredit: Valuation data required");

        return (true, "Valid");
    }

    // === Chainlink PoR Configuration ===

    function getChainlinkPoRConfig() external pure override returns (
        address defaultFeedAddress,
        uint256 defaultReserveRatio
    ) {
        // Default: No Chainlink PoR feed (optional for carbon credits)
        defaultFeedAddress = address(0);
        defaultReserveRatio = 10000; // 100%
    }

    // === Category Data Parsing ===

    function parseCategoryData(bytes calldata data) external pure override returns (bytes memory) {
        require(data.length >= 128, "CarbonCredit: Data too short");
        return data;
    }

    function parseValuationData(bytes calldata /* data */) external pure override returns (ValuationInfo memory) {
        return ValuationInfo({
            value: 0,
            timestamp: 0,
            valuer: address(0),
            methodology: "",
            documentHash: bytes32(0)
        });
    }
}



