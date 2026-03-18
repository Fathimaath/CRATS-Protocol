// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "../../interfaces/asset/IAssetPlugin.sol";

/**
 * @title FineArtPlugin
 * @dev Plugin for tokenizing Fine Art assets.
 */
contract FineArtPlugin is IAssetPlugin {
    bytes32 public constant CATEGORY_ID = keccak256("FINE_ART");
    string public constant CATEGORY_NAME = "Fine Art";

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
        require(params.initialSupply > 0, "FineArt: Supply required");
        require(keccak256(abi.encodePacked(params.categoryId)) == CATEGORY_ID, "FineArt: Invalid category");
        return true;
    }

    function validateDocuments(
        AssetDocument[] calldata docs
    ) external pure override returns (bool) {
        bool hasAuth = false;
        bool hasInsurance = false;

        for (uint256 i = 0; i < docs.length; i++) {
            if (keccak256(bytes(docs[i].docType)) == keccak256("AUTHENTICATION")) hasAuth = true;
            if (keccak256(bytes(docs[i].docType)) == keccak256("INSURANCE")) hasInsurance = true;
        }

        require(hasAuth, "FineArt: Authentication required");
        require(hasInsurance, "FineArt: Insurance required");
        return true;
    }

    function getRequiredDocuments() external pure override returns (string[] memory) {
        string[] memory requiredDocs = new string[](2);
        requiredDocs[0] = "AUTHENTICATION";
        requiredDocs[1] = "INSURANCE";
        return requiredDocs;
    }
}
