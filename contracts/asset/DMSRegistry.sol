// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "../interfaces/dms/IDMS.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract DMSRegistry is IDMS, AccessControl {
    bytes32 public constant COMPLIANCE_ROLE = keccak256("COMPLIANCE_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    struct DocumentRecord {
        bytes32 docHash;
        string docType;
        ApprovalMode mode;
        DocumentStatus status;
        uint256 expiresAt;
        bytes32 evidenceHash;
        string rejectionReason;
        string revocationJustification;
    }

    mapping(bytes32 => DocumentRecord) private _documents;
    mapping(bytes32 => bool) private _docExists;

    event DocumentUploaded(bytes32 indexed docHash, string docType, ApprovalMode mode, uint256 expiresAt);
    event DocumentStatusChanged(bytes32 indexed docHash, DocumentStatus indexed status);
    event DocumentApproved(bytes32 indexed docHash);
    event DocumentRejected(bytes32 indexed docHash, string reason);
    event DocumentRevoked(bytes32 indexed docHash, bytes32 evidenceHash, string justification);
    event DocumentExpired(bytes32 indexed docHash);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(COMPLIANCE_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
    }

    function uploadDocument(
        bytes32 docHash,
        string calldata docType,
        ApprovalMode mode,
        uint256 expiresAt
    ) external onlyRole(OPERATOR_ROLE) {
        require(docHash != bytes32(0), "DMS: invalid hash");
        require(!_docExists[docHash], "DMS: document already exists");

        _documents[docHash] = DocumentRecord({
            docHash: docHash,
            docType: docType,
            mode: mode,
            status: DocumentStatus.UPLOADED,
            expiresAt: expiresAt,
            evidenceHash: bytes32(0),
            rejectionReason: "",
            revocationJustification: ""
        });
        _docExists[docHash] = true;

        emit DocumentUploaded(docHash, docType, mode, expiresAt);
        emit DocumentStatusChanged(docHash, DocumentStatus.UPLOADED);
    }

    function submitForReview(bytes32 docHash) external onlyRole(OPERATOR_ROLE) {
        require(_docExists[docHash], "DMS: document not found");
        DocumentRecord storage doc = _documents[docHash];
        require(doc.status == DocumentStatus.UPLOADED || doc.status == DocumentStatus.REJECTED, "DMS: invalid status");

        doc.status = DocumentStatus.UNDER_REVIEW;
        emit DocumentStatusChanged(docHash, DocumentStatus.UNDER_REVIEW);
    }

    function flagForCompliance(bytes32 docHash) external onlyRole(OPERATOR_ROLE) {
        require(_docExists[docHash], "DMS: document not found");
        DocumentRecord storage doc = _documents[docHash];
        require(doc.status == DocumentStatus.UNDER_REVIEW, "DMS: invalid status");

        doc.status = DocumentStatus.COMPLIANCE_PENDING;
        emit DocumentStatusChanged(docHash, DocumentStatus.COMPLIANCE_PENDING);
    }

    function approveDocument(bytes32 docHash) external onlyRole(COMPLIANCE_ROLE) {
        require(_docExists[docHash], "DMS: document not found");
        DocumentRecord storage doc = _documents[docHash];
        require(doc.status == DocumentStatus.UNDER_REVIEW || doc.status == DocumentStatus.COMPLIANCE_PENDING || doc.status == DocumentStatus.UPLOADED, "DMS: invalid status");

        doc.status = DocumentStatus.APPROVED;
        emit DocumentApproved(docHash);
        emit DocumentStatusChanged(docHash, DocumentStatus.APPROVED);
    }

    function rejectDocument(bytes32 docHash, string calldata reason) external onlyRole(COMPLIANCE_ROLE) {
        require(_docExists[docHash], "DMS: document not found");
        DocumentRecord storage doc = _documents[docHash];
        require(doc.status == DocumentStatus.UNDER_REVIEW || doc.status == DocumentStatus.COMPLIANCE_PENDING, "DMS: invalid status");

        doc.status = DocumentStatus.REJECTED;
        doc.rejectionReason = reason;
        emit DocumentRejected(docHash, reason);
        emit DocumentStatusChanged(docHash, DocumentStatus.REJECTED);
    }

    function revokeDocument(
        bytes32 docHash,
        bytes32 evidenceHash,
        string calldata justification
    ) external onlyRole(COMPLIANCE_ROLE) {
        require(_docExists[docHash], "DMS: document not found");
        require(evidenceHash != bytes32(0), "DMS: evidence required");
        DocumentRecord storage doc = _documents[docHash];
        require(doc.status == DocumentStatus.APPROVED, "DMS: invalid status");

        doc.status = DocumentStatus.REVOKED;
        doc.evidenceHash = evidenceHash;
        doc.revocationJustification = justification;

        emit DocumentRevoked(docHash, evidenceHash, justification);
        emit DocumentStatusChanged(docHash, DocumentStatus.REVOKED);
    }

    function reconcileApprovalMode(bytes32 docHash) external onlyRole(OPERATOR_ROLE) {
        require(_docExists[docHash], "DMS: document not found");
        DocumentRecord storage doc = _documents[docHash];
        require(doc.status == DocumentStatus.UPLOADED, "DMS: invalid status");

        if (doc.mode == ApprovalMode.AUTO) {
            doc.status = DocumentStatus.APPROVED;
            emit DocumentApproved(docHash);
            emit DocumentStatusChanged(docHash, DocumentStatus.APPROVED);
        } else if (doc.mode == ApprovalMode.MANUAL) {
            doc.status = DocumentStatus.UNDER_REVIEW;
            emit DocumentStatusChanged(docHash, DocumentStatus.UNDER_REVIEW);
        } else {
            doc.status = DocumentStatus.COMPLIANCE_PENDING;
            emit DocumentStatusChanged(docHash, DocumentStatus.COMPLIANCE_PENDING);
        }
    }

    function isDocumentApproved(bytes32 docHash) external view override returns (bool) {
        if (!_docExists[docHash]) return false;
        DocumentRecord memory doc = _documents[docHash];
        if (doc.status != DocumentStatus.APPROVED) return false;
        if (doc.expiresAt != 0 && block.timestamp > doc.expiresAt) return false;
        return true;
    }

    function getDocumentStatus(bytes32 docHash) external view override returns (DocumentStatus) {
        require(_docExists[docHash], "DMS: document not found");
        DocumentRecord memory doc = _documents[docHash];
        if (doc.status == DocumentStatus.APPROVED && doc.expiresAt != 0 && block.timestamp > doc.expiresAt) {
            return DocumentStatus.EXPIRED;
        }
        return doc.status;
    }

    function getDocumentRecord(bytes32 docHash) external view returns (DocumentRecord memory) {
        require(_docExists[docHash], "DMS: document not found");
        DocumentRecord memory doc = _documents[docHash];
        if (doc.status == DocumentStatus.APPROVED && doc.expiresAt != 0 && block.timestamp > doc.expiresAt) {
            doc.status = DocumentStatus.EXPIRED;
        }
        return doc;
    }
}
