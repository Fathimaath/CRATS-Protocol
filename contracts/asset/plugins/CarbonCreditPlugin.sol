// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "../../interfaces/asset/IAssetPlugin.sol";

/**
 * @title CarbonCreditPlugin
 * @dev Plugin for tokenizing Carbon Credit assets.
 */
contract CarbonCreditPlugin is IAssetPlugin {
    bytes32 public constant CATEGORY_ID = keccak256("CARBON_CREDIT");
    string public constant CATEGORY_NAME = "Carbon Credit";

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
        require(params.initialSupply > 0, "CarbonCredit: Supply required");
        require(keccak256(abi.encodePacked(params.categoryId)) == CATEGORY_ID, "CarbonCredit: Invalid category");
        return true;
    }

    function validateDocuments(
        AssetDocument[] calldata docs
    ) external pure override returns (bool) {
        bool hasReport = false;

        for (uint256 i = 0; i < docs.length; i++) {
            if (keccak256(bytes(docs[i].docType)) == keccak256("VERIFICATION_REPORT")) hasReport = true;
        }

        require(hasReport, "CarbonCredit: Verification Report required");
        return true;
    }

    function getRequiredDocuments() external pure override returns (string[] memory) {
        string[] memory requiredDocs = new string[](1);
        requiredDocs[0] = "VERIFICATION_REPORT";
        return requiredDocs;
    }
}
