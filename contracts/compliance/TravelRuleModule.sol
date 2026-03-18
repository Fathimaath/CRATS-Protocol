// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "../interfaces/compliance/ITravelRuleModule.sol";
import "../interfaces/identity/IIdentityRegistry.sol";
import "../utils/CRATSConfig.sol";

/**
 * @title TravelRuleModule
 * @dev Records identity hashes for transactions to comply with FATF R.16.
 * // Source: FATF Recommendation 16 (Travel Rule) implementation
 */
contract TravelRuleModule is
    Initializable,
    AccessControlUpgradeable,
    UUPSUpgradeable,
    ITravelRuleModule
{
    IIdentityRegistry public identityRegistry;

    mapping(bytes32 => TransferRecord) private _records;

    event TransferRecorded(
        bytes32 indexed txHash,
        address indexed tokenContract,
        address indexed fromWallet,
        address toWallet,
        uint256 amount
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address admin,
        address identityRegistry_
    ) public initializer {
        __AccessControl_init();
        __UUPSUpgradeable_init();

        identityRegistry = IIdentityRegistry(identityRegistry_);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(CRATSConfig.COMPLIANCE_ROLE, admin);
    }

    /**
     * @dev Records a transfer for Travel Rule compliance.
     * Use identity hashes only, no PII on chain.
     */
    function recordTransfer(
        bytes32 txHash,
        address tokenContract,
        uint256 amount,
        address fromWallet,
        address toWallet,
        bytes32 originatorIdentityHash,
        bytes32 beneficiaryIdentityHash,
        bytes32 originatorAccountIdHash,
        bytes32 beneficiaryAccountIdHash,
        uint8 riskScore,
        bool requiresReview
    ) external override onlyRole(CRATSConfig.COMPLIANCE_ROLE) {
        require(_records[txHash].timestamp == 0, "TravelRule: tx already recorded");

        _records[txHash] = TransferRecord({
            txHash: txHash,
            tokenContract: tokenContract,
            amount: amount,
            timestamp: uint64(block.timestamp),
            originatorIdentityHash: originatorIdentityHash,
            beneficiaryIdentityHash: beneficiaryIdentityHash,
            originatorAccountIdHash: originatorAccountIdHash,
            beneficiaryAccountIdHash: beneficiaryAccountIdHash,
            riskScore: riskScore,
            requiresReview: requiresReview,
            isReported: false
        });

        emit TransferRecorded(txHash, tokenContract, fromWallet, toWallet, amount);
    }

    function getTransfer(bytes32 txHash) external view override returns (TransferRecord memory) {
        return _records[txHash];
    }

    /**
     * @dev Mark a transaction as reported to regulators.
     */
    function markReported(bytes32 txHash) external onlyRole(CRATSConfig.REGULATOR_ROLE) {
        _records[txHash].isReported = true;
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
