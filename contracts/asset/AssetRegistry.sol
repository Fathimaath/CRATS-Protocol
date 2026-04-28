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

    // === Beneficial Ownership State ===
    // assetToken => vault => investor => BeneficialOwner
    mapping(address => mapping(address => mapping(address => BeneficialOwner))) private _owners;
    
    // assetToken => vault => investor list (for enumeration)
    mapping(address => mapping(address => address[])) private _ownerIndex;
    
    // assetToken => vault => investor => index in ownerIndex (1-based; 0 = not present)
    mapping(address => mapping(address => mapping(address => uint256))) private _ownerIndexPos;

    // assetToken => registered vault addresses
    mapping(address => address[]) private _vaults;
    mapping(address => mapping(address => bool)) private _vaultRegistered;

    // assetToken => vault => VaultSummary cache
    mapping(address => mapping(address => VaultSummary)) private _vaultSummary;

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

    // === Beneficial Ownership Registry (BOR) Implementation ===

    function registerVault(
        address assetToken,
        address vault
    ) external override onlyRole(AssetConfig.OPERATOR_ROLE) {
        require(!_vaultRegistered[assetToken][vault], "AssetRegistry: already registered");

        _vaultRegistered[assetToken][vault] = true;
        _vaults[assetToken].push(vault);

        // Grant VAULT_ROLE so vault can call syncOwner
        _grantRole(AssetConfig.VAULT_ROLE, vault);

        emit VaultRegistered(assetToken, vault, block.timestamp);
    }

    function syncOwner(
        address assetToken,
        address investor,
        uint256 newShares
    ) external override onlyRole(AssetConfig.VAULT_ROLE) {
        address vault = msg.sender;
        require(_vaultRegistered[assetToken][vault], "AssetRegistry: vault not registered");
        _syncSingle(assetToken, vault, investor, newShares);
    }

    function syncOwnerBatch(
        address assetToken,
        address[] calldata investors,
        uint256[] calldata newShares
    ) external override onlyRole(AssetConfig.VAULT_ROLE) {
        address vault = msg.sender;
        require(_vaultRegistered[assetToken][vault], "AssetRegistry: vault not registered");
        require(investors.length == newShares.length, "AssetRegistry: length mismatch");

        for (uint256 i = 0; i < investors.length; i++) {
            _syncSingle(assetToken, vault, investors[i], newShares[i]);
        }
    }

    function _syncSingle(
        address assetToken,
        address vault,
        address investor,
        uint256 newShares
    ) internal {
        IVaultView vaultView = IVaultView(vault);
        uint256 totalShares = vaultView.totalSupply();
        uint256 totalAssets = vaultView.totalAssets();
        uint256 sharePrice = totalShares > 0
            ? (totalAssets * 1e18) / totalShares
            : 1e18;

        if (newShares == 0) {
            _removeOwner(assetToken, vault, investor);
            return;
        }

        uint256 aptClaim = (newShares * sharePrice) / 1e18;
        uint256 bpsOwnership = totalAssets > 0
            ? (aptClaim * AssetConfig.BASIS_POINTS) / totalAssets
            : 0;

        BeneficialOwner storage record = _owners[assetToken][vault][investor];
        bool isNew = !record.isActive;

        record.investor = investor;
        record.vaultShares = newShares;
        record.aptClaim = aptClaim;
        record.bpsOwnership = bpsOwnership;
        record.lastUpdated = block.timestamp;
        record.isActive = true;

        if (isNew) {
            _ownerIndex[assetToken][vault].push(investor);
            _ownerIndexPos[assetToken][vault][investor] = _ownerIndex[assetToken][vault].length;
        }

        _vaultSummary[assetToken][vault] = VaultSummary({
            vault: vault,
            totalShares: totalShares,
            totalAssets: totalAssets,
            sharePrice: sharePrice,
            ownerCount: _ownerIndex[assetToken][vault].length,
            lastSynced: block.timestamp
        });

        emit BeneficialOwnerUpdated(assetToken, vault, investor, newShares, aptClaim, bpsOwnership, block.timestamp);
    }

    function _removeOwner(
        address assetToken,
        address vault,
        address investor
    ) internal {
        BeneficialOwner storage record = _owners[assetToken][vault][investor];
        if (!record.isActive) return;

        record.isActive = false;
        record.vaultShares = 0;
        record.aptClaim = 0;
        record.bpsOwnership = 0;
        record.lastUpdated = block.timestamp;

        uint256 pos = _ownerIndexPos[assetToken][vault][investor];
        uint256 last = _ownerIndex[assetToken][vault].length;
        if (pos != last) {
            address moved = _ownerIndex[assetToken][vault][last - 1];
            _ownerIndex[assetToken][vault][pos - 1] = moved;
            _ownerIndexPos[assetToken][vault][moved] = pos;
        }
        _ownerIndex[assetToken][vault].pop();
        delete _ownerIndexPos[assetToken][vault][investor];

        // Update Summary Cache
        IVaultView vaultView = IVaultView(vault);
        _vaultSummary[assetToken][vault] = VaultSummary({
            vault: vault,
            totalShares: vaultView.totalSupply(),
            totalAssets: vaultView.totalAssets(),
            sharePrice: vaultView.totalSupply() > 0 ? (vaultView.totalAssets() * 1e18) / vaultView.totalSupply() : 1e18,
            ownerCount: _ownerIndex[assetToken][vault].length,
            lastSynced: block.timestamp
        });

        emit BeneficialOwnerRemoved(assetToken, vault, investor, block.timestamp);
    }

    // === View Functions (BOR) ===

    function getBeneficialOwner(
        address assetToken,
        address vault,
        address investor
    ) external view override returns (BeneficialOwner memory) {
        return _owners[assetToken][vault][investor];
    }

    function getVaultOwners(
        address assetToken,
        address vault
    ) external view override returns (BeneficialOwner[] memory) {
        address[] storage owners = _ownerIndex[assetToken][vault];
        BeneficialOwner[] memory result = new BeneficialOwner[](owners.length);
        for (uint256 i = 0; i < owners.length; i++) {
            result[i] = _owners[assetToken][vault][owners[i]];
        }
        return result;
    }

    function getAllOwners(
        address assetToken
    ) external view override returns (BeneficialOwner[] memory) {
        address[] memory vaults = _vaults[assetToken];
        uint256 total;
        for (uint256 v = 0; v < vaults.length; v++) {
            total += _ownerIndex[assetToken][vaults[v]].length;
        }

        BeneficialOwner[] memory result = new BeneficialOwner[](total);
        uint256 idx;
        for (uint256 v = 0; v < vaults.length; v++) {
            address[] storage owners = _ownerIndex[assetToken][vaults[v]];
            for (uint256 i = 0; i < owners.length; i++) {
                result[idx++] = _owners[assetToken][vaults[v]][owners[i]];
            }
        }
        return result;
    }

    function getTotalClaim(
        address assetToken,
        address investor
    ) external view override returns (uint256 totalAptClaim, uint256 totalBps) {
        address[] memory vaults = _vaults[assetToken];
        for (uint256 v = 0; v < vaults.length; v++) {
            BeneficialOwner storage record = _owners[assetToken][vaults[v]][investor];
            if (record.isActive) {
                totalAptClaim += record.aptClaim;
                totalBps += record.bpsOwnership;
            }
        }
    }

    function getVaultSummary(
        address assetToken,
        address vault
    ) external view override returns (VaultSummary memory) {
        return _vaultSummary[assetToken][vault];
    }

    function validateInvariant(
        address assetToken,
        address vault
    ) external view override returns (bool isValid, uint256 delta) {
        uint256 sumClaims;
        address[] storage owners = _ownerIndex[assetToken][vault];
        for (uint256 i = 0; i < owners.length; i++) {
            sumClaims += _owners[assetToken][vault][owners[i]].aptClaim;
        }
        uint256 vaultTotal = IVaultView(vault).totalAssets();
        isValid = sumClaims == vaultTotal;
        delta = sumClaims > vaultTotal ? sumClaims - vaultTotal : vaultTotal - sumClaims;
    }
}

interface IVaultView {
    function totalSupply() external view returns (uint256);
    function totalAssets() external view returns (uint256);
}
