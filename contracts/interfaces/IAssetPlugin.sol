// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title IAssetPlugin
 * @dev Interface for Asset Plugin - Category-specific validation
 */
interface IAssetPlugin {

    // === Structs ===

    struct ValuationInfo {
        uint256 value;
        uint256 timestamp;
        address valuer;
        string methodology;
        bytes32 documentHash;
    }

    struct DocumentRequirement {
        string docType;
        bool required;
        uint256 validFor;
    }

    // === View Functions ===

    function version() external view returns (string memory);
    function getCategoryId() external pure returns (bytes32);
    function getCategoryName() external pure returns (string memory);
    function getRequiredDocuments() external pure returns (string[] memory);
    function getDocumentRequirements() external pure returns (DocumentRequirement[] memory);

    // === Validation Functions ===

    function validateCreation(
        address issuer,
        bytes calldata categoryData
    ) external view returns (bool, string memory);

    function validateDocuments(
        bytes32[] calldata docHashes,
        string[] calldata docTypes
    ) external view returns (bool, string memory);

    function validateValuation(
        uint256 proposedValue,
        bytes calldata valuationData
    ) external view returns (bool, string memory);

    // === Chainlink PoR Configuration ===

    function getChainlinkPoRConfig() external view returns (
        address defaultFeedAddress,
        uint256 defaultReserveRatio
    );

    // === Category Data Parsing ===

    function parseCategoryData(bytes calldata data) external pure returns (bytes memory);
    function parseValuationData(bytes calldata data) external pure returns (ValuationInfo memory);
}
