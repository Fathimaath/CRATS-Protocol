// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "../interfaces/asset/IAssetRegistry.sol";
import "../utils/AssetConfig.sol";

/**
 * @title AssetRegistry
 * @dev Document management and Proof of Reserve (PoR) system for CRATS Assets.
 * // Source: T-REX Document Management Pattern
 */
contract AssetRegistry is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable,
    IAssetRegistry
{
    // === State ===
    Document[] private _documents;
    mapping(bytes32 => uint256) private _docIndex;
    PORAttestation[] private _porAttestations;
    AssetEvent[] private _assetEvents;

    mapping(address => bool) public isOperator;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address admin) public initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(AssetConfig.OPERATOR_ROLE, admin);
        isOperator[admin] = true;
    }

    // === View Functions ===

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

    function getDocumentsByType(string calldata docType) external view override returns (Document[] memory) {
        uint256 count = 0;
        bytes32 typeHash = keccak256(bytes(docType));
        for (uint256 i = 0; i < _documents.length; i++) {
            if (keccak256(bytes(_documents[i].docType)) == typeHash) count++;
        }

        Document[] memory result = new Document[](count);
        uint256 currentIndex = 0;
        for (uint256 i = 0; i < _documents.length; i++) {
            if (keccak256(bytes(_documents[i].docType)) == typeHash) {
                result[currentIndex] = _documents[i];
                currentIndex++;
            }
        }
        return result;
    }

    function getPORAttestation(uint256 porId) external view override returns (PORAttestation memory) {
        return _porAttestations[porId];
    }

    function getLatestPOR() external view override returns (PORAttestation memory) {
        require(_porAttestations.length > 0, "AssetRegistry: No POR");
        return _porAttestations[_porAttestations.length - 1];
    }

    function getAssetEvent(uint256 eventId) external view override returns (AssetEvent memory) {
        return _assetEvents[eventId];
    }

    // === Document Management ===

    function uploadDocument(
        bytes32 docHash,
        string calldata docType,
        bytes calldata /* metadata */
    ) external override nonReentrant {
        require(isOperator[_msgSender()], "AssetRegistry: not operator");
        require(_docIndex[docHash] == 0, "AssetRegistry: already exists");

        _docIndex[docHash] = _documents.length + 1;
        _documents.push(Document({
            docHash: docHash,
            docType: docType,
            timestamp: block.timestamp,
            uploader: _msgSender(),
            verified: false
        }));

        emit DocumentUploaded(docHash, docType, _msgSender(), block.timestamp);
    }

    function verifyDocument(bytes32 docHash) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_docIndex[docHash] > 0, "AssetRegistry: not found");
        _documents[_docIndex[docHash] - 1].verified = true;
        emit DocumentVerified(docHash, _msgSender());
    }

    function logAssetEvent(string calldata eventType, bytes32 dataHash) external override {
        require(isOperator[_msgSender()], "AssetRegistry: not operator");
        _assetEvents.push(AssetEvent({
            eventType: eventType,
            dataHash: dataHash,
            timestamp: block.timestamp,
            initiator: _msgSender()
        }));
        emit AssetEventLogged(eventType, dataHash, block.timestamp);
    }

    // === Proof of Reserve ===

    function submitPOR(
        uint256 assetValue,
        bytes32 documentHash,
        bytes calldata signature
    ) external override nonReentrant {
        require(isOperator[_msgSender()], "AssetRegistry: not operator");
        
        // Get Chainlink round ID if feed is configured (Section 6.2 - NEW v3.0)
        bytes32 chainlinkRoundId = bytes32(0);
        // Note: Chainlink feed would be configured externally
        // This is a placeholder for when Chainlink PoR is integrated
        
        _porAttestations.push(PORAttestation({
            timestamp: block.timestamp,
            assetValue: assetValue,
            documentHash: documentHash,
            custodian: _msgSender(),
            signature: signature,
            verified: false,
            chainlinkRoundId: chainlinkRoundId
        }));
        emit PORSubmitted(block.timestamp, assetValue);
    }

    function verifyPOR(uint256 porId) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        _porAttestations[porId].verified = true;
        emit PORVerified(porId, _msgSender());
    }

    // === Management ===

    function addOperator(address operator) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        isOperator[operator] = true;
    }

    function removeOperator(address operator) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        isOperator[operator] = false;
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
