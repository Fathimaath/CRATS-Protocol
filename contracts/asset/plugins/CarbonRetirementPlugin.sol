// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "../../interfaces/asset/IAssetPlugin.sol";
import "../../interfaces/dms/IDMS.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title CarbonRetirementPlugin
 * @dev Plugin for Carbon Retirement assets.
 * Archetype: CONSUMABLE (2)
 */
contract CarbonRetirementPlugin is IAssetPlugin, Ownable {
    bytes32 public constant CATEGORY_ID = keccak256("CARBON_RETIREMENT");
    string public constant CATEGORY_NAME = "Carbon Retirement";

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
        return (false, false);
    }

    function archetypeType() external pure returns (uint8) {
        return 2; // Archetype.CONSUMABLE
    }

    function exitMechanism() external pure returns (uint8) {
        return 2; // ExitMechanism.LOCKED_BURN
    }

    function validateCreation(
        address /*issuer*/,
        AssetParams calldata params
    ) external pure override returns (bool) {
        require(params.initialSupply > 0, "Retirement: supply required");
        require(params.categoryId == CATEGORY_ID, "Retirement: invalid category");
        return true;
    }

    function validateDocuments(
        AssetDocument[] calldata docs
    ) external view override returns (bool) {
        bool hasCert = false;

        for (uint256 i = 0; i < docs.length; i++) {
            bytes32 typeHash = keccak256(bytes(docs[i].docType));

            if (dmsRegistry != address(0)) {
                require(
                    IDMS(dmsRegistry).isDocumentApproved(docs[i].docHash),
                    "Retirement: document not DMS-approved"
                );
            }

            if (typeHash == keccak256("RETIREMENT_CERTIFICATE")) hasCert = true;
        }

        require(hasCert, "Retirement: RETIREMENT_CERTIFICATE required");
        return true;
    }

    function getRequiredDocuments() external pure override returns (string[] memory docs) {
        docs = new string[](1);
        docs[0] = "RETIREMENT_CERTIFICATE";
        return docs;
    }
}
