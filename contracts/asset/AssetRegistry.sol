// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/asset/IAssetRegistry.sol";
import "../utils/AssetConfig.sol";

/**
 * @title AssetRegistry
 * @dev Document management and Proof of Reserve system
 * Layer 2 v3.0
 * Template contract - deployed per asset
 */
contract AssetRegistry is AccessControl, ReentrancyGuard, IAssetRegistry {

    // === State Variables ===

    Document[] private _documents;
    mapping(bytes32 => uint256) private _docIndex;

    PORAttestation[] private _porAttestations;

    AssetEvent[] private _assetEvents;

    mapping(address => bool) public isOperator;

    // === Modifiers ===

    modifier onlyOperator() {
        require(isOperator[msg.sender], "AssetRegistry: Caller is not operator");
        _;
    }

    // === Constructor ===

    constructor(address admin) {
        require(admin != address(0), "AssetRegistry: Admin cannot be zero address");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(AssetConfig.OPERATOR_ROLE, admin);
        isOperator[admin] = true;
    }

    // === External View Functions ===

    function version() external pure override returns (string memory) {
        return AssetConfig.VERSION;
    }

    function documentCount() external view override returns (uint256) {
        return _documents.length;
    }

    function porCount() external view override returns (uint256) {
        return _porAttestations.length;
    }

    function eventCount() external view override returns (uint256) {
        return _assetEvents.length;
    }

    function getDocument(bytes32 docHash) external view override returns (Document memory) {
        require(_docIndex[docHash] > 0, "AssetRegistry: Document not found");
        return _documents[_docIndex[docHash] - 1];
    }

    function getDocumentByIndex(uint256 index) external view override returns (Document memory) {
        require(index < _documents.length, "AssetRegistry: Index out of bounds");
        return _documents[index];
    }

    function getDocumentsByType(
        string calldata docType
    ) external view override returns (Document[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < _documents.length; i++) {
            if (keccak256(bytes(_documents[i].docType)) == keccak256(bytes(docType))) {
                count++;
            }
        }

        Document[] memory result = new Document[](count);
        uint256 currentIndex = 0;
        for (uint256 i = 0; i < _documents.length; i++) {
            if (keccak256(bytes(_documents[i].docType)) == keccak256(bytes(docType))) {
                result[currentIndex] = _documents[i];
                currentIndex++;
            }
        }

        return result;
    }

    function getPORAttestation(uint256 porId) external view override returns (PORAttestation memory) {
        require(porId < _porAttestations.length, "AssetRegistry: POR not found");
        return _porAttestations[porId];
    }

    function getLatestPOR() external view override returns (PORAttestation memory) {
        require(_porAttestations.length > 0, "AssetRegistry: No POR attestations");
        return _porAttestations[_porAttestations.length - 1];
    }

    function getAssetEvent(uint256 eventId) external view override returns (AssetEvent memory) {
        require(eventId < _assetEvents.length, "AssetRegistry: Event not found");
        return _assetEvents[eventId];
    }

    // === Document Management ===

    function uploadDocument(
        bytes32 docHash,
        string calldata docType,
        bytes calldata /* metadata */
    ) external override onlyOperator {
        require(docHash != bytes32(0), "AssetRegistry: Hash cannot be zero");
        require(bytes(docType).length > 0, "AssetRegistry: Doc type required");

        uint256 index = _documents.length;
        _documents.push(Document({
            docHash: docHash,
            docType: docType,
            timestamp: block.timestamp,
            uploader: msg.sender,
            verified: false
        }));
        _docIndex[docHash] = index + 1;

        emit DocumentUploaded(docHash, docType, msg.sender, block.timestamp);
    }

    function verifyDocument(bytes32 docHash) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_docIndex[docHash] > 0, "AssetRegistry: Document not found");

        Document storage doc = _documents[_docIndex[docHash] - 1];
        doc.verified = true;

        emit DocumentVerified(docHash, msg.sender);
    }

    function logAssetEvent(
        string calldata eventType,
        bytes32 dataHash
    ) external override onlyOperator {
        _assetEvents.push(AssetEvent({
            eventType: eventType,
            dataHash: dataHash,
            timestamp: block.timestamp,
            initiator: msg.sender
        }));

        emit AssetEventLogged(eventType, dataHash, block.timestamp);
    }

    // === Proof of Reserve ===

    function submitPOR(
        uint256 assetValue,
        bytes32 documentHash,
        bytes calldata signature
    ) external override onlyOperator {
        require(assetValue > 0, "AssetRegistry: Asset value must be positive");
        require(signature.length > 0, "AssetRegistry: Signature required");

        bytes32 chainlinkRoundId = bytes32(0);

        _porAttestations.push(PORAttestation({
            timestamp: block.timestamp,
            assetValue: assetValue,
            documentHash: documentHash,
            custodian: msg.sender,
            signature: signature,
            verified: false,
            chainlinkRoundId: chainlinkRoundId
        }));

        emit PORSubmitted(block.timestamp, assetValue);
    }

    function verifyPOR(uint256 porId) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        require(porId < _porAttestations.length, "AssetRegistry: POR not found");

        PORAttestation storage por = _porAttestations[porId];
        por.verified = true;

        emit PORVerified(porId, msg.sender);
    }

    // === Operator Management ===

    function addOperator(address operator) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        require(operator != address(0), "AssetRegistry: Operator cannot be zero address");
        isOperator[operator] = true;
    }

    function removeOperator(address operator) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        isOperator[operator] = false;
    }
}

