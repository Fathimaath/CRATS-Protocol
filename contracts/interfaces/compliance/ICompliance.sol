// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title ICompliance
 * @dev Interface for the Regulatory Compliance module.
 * // Source: ERC-3643 T-REX Compliance Hook
 */
interface ICompliance {
    struct TransferCheckResult {
        bool allowed;
        string reason;
    }

    /**
     * @notice Check if a transfer is allowed based on global and asset-specific rules.
     * @param from Sender address
     * @param to Recipient address
     * @param amount Amount to transfer
     * @param tokenContract The asset token contract triggerring the check
     */
    function checkTransfer(
        address from,
        address to,
        uint256 amount,
        address tokenContract
    ) external view returns (TransferCheckResult memory);

    /**
     * @notice Set role-based holding limits.
     * @param role The investor role (from CRATSConfig)
     * @param limit Maximum holding amount for this role
     */
    function setRoleLimit(uint8 role, uint256 limit) external;

    /**
     * @notice Get role-based holding limit.
     */
    function getRoleLimit(uint8 role) external view returns (uint256);

    /**
     * @notice Enable or disable jurisdiction allowlist mode.
     * @param enabled If true, only allowed jurisdictions can receive tokens
     */
    function setUseAllowlist(bool enabled) external;

    // === Investor Restrictions ===
    event HolderRestricted(address indexed token, address indexed investor, bytes32 reasonCode, uint256 endTime, bytes32 evidenceHash);
    event HolderRestrictionRemoved(address indexed token, address indexed investor, string justification);

    function isInvestorRestricted(address token, address investor) external view returns (bool);
    function restrictHolder(address token, address investor, bytes32 reasonCode, uint256 duration, bytes32 evidenceHash) external;
    function removeRestriction(address token, address investor, string calldata justification) external;
}
