// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "../interfaces/IAssetPlugin.sol";
import "../config/AssetConfig.sol";

/**
 * @title FineArtPlugin
 * @dev Plugin for Fine Art RWA category validation
 */
contract FineArtPlugin is IAssetPlugin {

    // === Structs ===

    struct FineArtData {
        string artist;
        string title;
        uint256 yearCreated;
        string medium;
        uint256 dimensions;
        address custodian;
    }

    // === View Functions ===

    function version() external pure override returns (string memory) {
        return AssetConfig.VERSION;
    }

    function getCategoryId() external pure override returns (bytes32) {
        return AssetConfig.FINE_ART;
    }

    function getCategoryName() external pure override returns (string memory) {
        return "Fine Art";
    }

    function getRequiredDocuments() external pure override returns (string[] memory) {
        string[] memory docs = new string[](6);
        docs[0] = "PROVENANCE";
        docs[1] = "AUTHENTICATION";
        docs[2] = "APPRAISAL";
        docs[3] = "INSURANCE";
        docs[4] = "CONDITION_REPORT";
        docs[5] = "CUSTODY_ATTESTATION";
        return docs;
    }

    function getDocumentRequirements() external pure override returns (DocumentRequirement[] memory) {
        DocumentRequirement[] memory requirements = new DocumentRequirement[](6);
        
        requirements[0] = DocumentRequirement("PROVENANCE", true, 0); // Permanent
        requirements[1] = DocumentRequirement("AUTHENTICATION", true, 0); // Permanent
        requirements[2] = DocumentRequirement("APPRAISAL", true, 15552000); // 180 days
        requirements[3] = DocumentRequirement("INSURANCE", true, 31536000); // 1 year
        requirements[4] = DocumentRequirement("CONDITION_REPORT", true, 31536000); // 1 year
        requirements[5] = DocumentRequirement("CUSTODY_ATTESTATION", true, 31536000); // 1 year
        
        return requirements;
    }

    // === Validation Functions ===

    function validateCreation(
        address issuer,
        bytes calldata categoryData
    ) external pure override returns (bool, string memory) {
        require(issuer != address(0), "FineArt: Invalid issuer");
        require(categoryData.length > 0, "FineArt: Category data required");
        require(categoryData.length >= 128, "FineArt: Data too short");
        
        return (true, "Valid");
    }

    function validateDocuments(
        bytes32[] calldata docHashes,
        string[] calldata docTypes
    ) external pure override returns (bool, string memory) {
        require(docHashes.length == docTypes.length, "FineArt: Array length mismatch");
        require(docHashes.length >= 4, "FineArt: Missing required documents");

        bool hasProvenance = false;
        bool hasAuthentication = false;
        bool hasAppraisal = false;
        bool hasInsurance = false;

        for (uint256 i = 0; i < docTypes.length; i++) {
            string memory docType = docTypes[i];

            if (keccak256(bytes(docType)) == keccak256(bytes("PROVENANCE"))) {
                hasProvenance = true;
            } else if (keccak256(bytes(docType)) == keccak256(bytes("AUTHENTICATION"))) {
                hasAuthentication = true;
            } else if (keccak256(bytes(docType)) == keccak256(bytes("APPRAISAL"))) {
                hasAppraisal = true;
            } else if (keccak256(bytes(docType)) == keccak256(bytes("INSURANCE"))) {
                hasInsurance = true;
            }
        }

        require(hasProvenance, "FineArt: Missing provenance");
        require(hasAuthentication, "FineArt: Missing authentication");
        require(hasAppraisal, "FineArt: Missing appraisal");
        require(hasInsurance, "FineArt: Missing insurance");

        return (true, "Valid");
    }

    function validateValuation(
        uint256 proposedValue,
        bytes calldata valuationData
    ) external pure override returns (bool, string memory) {
        require(proposedValue > 0, "FineArt: Value must be positive");
        require(valuationData.length > 0, "FineArt: Valuation data required");

        return (true, "Valid");
    }

    // === Chainlink PoR Configuration ===

    function getChainlinkPoRConfig() external pure override returns (
        address defaultFeedAddress,
        uint256 defaultReserveRatio
    ) {
        // Default: No Chainlink PoR feed (optional for fine art)
        defaultFeedAddress = address(0);
        defaultReserveRatio = 10000; // 100%
    }

    // === Category Data Parsing ===

    function parseCategoryData(bytes calldata data) external pure override returns (bytes memory) {
        require(data.length >= 128, "FineArt: Data too short");
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
