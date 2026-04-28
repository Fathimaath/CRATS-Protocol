// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title IAssetPlugin
 * @dev Interface for asset-specific validation plugins.
 */
interface IAssetPlugin {
    struct AssetParams {
        string name;
        string symbol;
        uint256 initialSupply;
        bytes32 categoryId;
    }

    struct AssetDocument {
        string docType;
        bytes32 docHash;
    }

    function getCategoryId() external pure returns (bytes32);
    function getCategoryName() external pure returns (string memory);
    
    function validateCreation(
        address issuer,
        AssetParams calldata params
    ) external view returns (bool);
    
    function validateDocuments(
        AssetDocument[] calldata docs
    ) external view returns (bool);
    
    function getRequiredDocuments() external pure returns (string[] memory);
}
