// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title IAssetRegistry
 * @dev Interface for Asset Registry - Document management and Proof of Reserve
 */
interface IAssetRegistry {

    // === Events ===

    event DocumentUploaded(bytes32 indexed docHash, string docType, address uploader, uint256 timestamp);
    event DocumentVerified(bytes32 indexed docHash, address verifier);
    event PORSubmitted(uint256 timestamp, uint256 assetValue);
    event PORVerified(uint256 indexed porId, address verifier);
    event AssetEventLogged(string eventType, bytes32 indexed dataHash, uint256 timestamp);
    event BeneficialOwnerUpdated(address indexed assetToken, address indexed vault, address indexed investor, uint256 shares, uint256 aptClaim, uint256 bpsOwnership, uint256 timestamp);
    event BeneficialOwnerRemoved(address indexed assetToken, address indexed vault, address indexed investor, uint256 timestamp);
    event VaultRegistered(address indexed assetToken, address indexed vault, uint256 timestamp);

    // === Structs ===

    struct Document {
        bytes32 docHash;
        string docType;
        uint256 timestamp;
        address uploader;
        bool verified;
    }

    struct PORAttestation {
        uint256 timestamp;
        uint256 assetValue;
        bytes32 documentHash;
        address custodian;
        bytes signature;
        bool verified;
        bytes32 chainlinkRoundId;
    }

    struct AssetEvent {
        string eventType;
        bytes32 dataHash;
        uint256 timestamp;
        address initiator;
    }

    struct BeneficialOwner {
        address investor;
        uint256 vaultShares;
        uint256 aptClaim;
        uint256 bpsOwnership;
        uint256 lastUpdated;
        bool isActive;
    }

    struct VaultSummary {
        address vault;
        uint256 totalShares;
        uint256 totalAssets;
        uint256 sharePrice;
        uint256 ownerCount;
        uint256 lastSynced;
    }

    // === View Functions ===

    function version() external view returns (string memory);
    function documentCount() external view returns (uint256);
    function porCount() external view returns (uint256);
    function eventCount() external view returns (uint256);
    function getDocument(bytes32 docHash) external view returns (Document memory);
    function getDocumentByIndex(uint256 index) external view returns (Document memory);
    function getDocumentsByType(string calldata docType) external view returns (Document[] memory);
    function getPORAttestation(uint256 porId) external view returns (PORAttestation memory);
    function getLatestPOR() external view returns (PORAttestation memory);
    function getAssetEvent(uint256 eventId) external view returns (AssetEvent memory);
    function isOperator(address account) external view returns (bool);

    // === Document Management ===

    function uploadDocument(
        bytes32 docHash,
        string calldata docType,
        bytes calldata metadata
    ) external;

    function verifyDocument(bytes32 docHash) external;
    function logAssetEvent(string calldata eventType, bytes32 dataHash) external;

    // === Proof of Reserve ===

    function submitPOR(
        uint256 assetValue,
        bytes32 documentHash,
        bytes calldata signature
    ) external;

    function verifyPOR(uint256 porId) external;

    // === Operator Management ===

    function addOperator(address operator) external;
    function removeOperator(address operator) external;

    // === Beneficial Ownership Registry (BOR) ===

    function registerVault(address assetToken, address vault) external;
    function syncOwner(address assetToken, address investor, uint256 newShares) external;
    function syncOwnerBatch(address assetToken, address[] calldata investors, uint256[] calldata newShares) external;
    
    function getBeneficialOwner(address assetToken, address vault, address investor) external view returns (BeneficialOwner memory);
    function getVaultOwners(address assetToken, address vault) external view returns (BeneficialOwner[] memory);
    function getAllOwners(address assetToken) external view returns (BeneficialOwner[] memory);
    function getTotalClaim(address assetToken, address investor) external view returns (uint256 totalAptClaim, uint256 totalBps);
    function getVaultSummary(address assetToken, address vault) external view returns (VaultSummary memory);
    function validateInvariant(address assetToken, address vault) external view returns (bool isValid, uint256 delta);
}
