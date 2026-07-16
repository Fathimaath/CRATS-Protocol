// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface IDMS {
    enum ApprovalMode { AUTO, MANUAL, COMPLIANCE_REQUIRED }
    enum DocumentStatus { UPLOADED, UNDER_REVIEW, COMPLIANCE_PENDING, APPROVED, REJECTED, EXPIRED, REVOKED }

    function isDocumentApproved(bytes32 docHash) external view returns (bool);
    function getDocumentStatus(bytes32 docHash) external view returns (DocumentStatus);
}
