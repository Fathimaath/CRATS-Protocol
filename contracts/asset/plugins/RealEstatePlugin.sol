// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "../../interfaces/asset/IAssetPlugin.sol";

/**
 * @title RealEstatePlugin
 * @dev Plugin for tokenizing Real Estate assets.
 * // Source: Audited RWA Plugin Patterns
 */
contract RealEstatePlugin is IAssetPlugin {
    bytes32 public constant CATEGORY_ID = keccak256("REAL_ESTATE");
    string public constant CATEGORY_NAME = "Real Estate";

    function getCategoryId() external pure override returns (bytes32) {
        return CATEGORY_ID;
    }

    function getCategoryName() external pure override returns (string memory) {
        return CATEGORY_NAME;
    }

    function validateCreation(
        address /*issuer*/,
        AssetParams calldata params
    ) external pure override returns (bool) {
        require(bytes(params.name).length > 0, "RealEstate: Name required");
        require(bytes(params.symbol).length > 0, "RealEstate: Symbol required");
        require(params.initialSupply > 0, "RealEstate: Supply required");
        require(params.categoryId == CATEGORY_ID, "RealEstate: Invalid category");
        return true;
    }

    function validateDocuments(
        AssetDocument[] calldata docs
    ) external pure override returns (bool) {
        bool hasTitleDeed = false;
        bool hasAppraisal = false;

        for (uint256 i = 0; i < docs.length; i++) {
            if (keccak256(bytes(docs[i].docType)) == keccak256("TITLE_DEED")) hasTitleDeed = true;
            if (keccak256(bytes(docs[i].docType)) == keccak256("APPRAISAL")) hasAppraisal = true;
        }

        require(hasTitleDeed, "RealEstate: Title Deed required");
        require(hasAppraisal, "RealEstate: Appraisal required");
        return true;
    }

    function getRequiredDocuments() external pure override returns (string[] memory) {
        string[] memory requiredDocs = new string[](2);
        requiredDocs[0] = "TITLE_DEED";
        requiredDocs[1] = "APPRAISAL";
        return requiredDocs;
    }
}
