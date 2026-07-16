// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract SanctionsOracle is AccessControl {
    bytes32 public constant SANCTIONER_ROLE = keccak256("SANCTIONER_ROLE");

    struct RestrictionRecord {
        bool restricted;
        bytes32 evidenceHash;
        string justification;
        uint256 timestamp;
    }

    // wallet => asset => record
    mapping(address => mapping(address => RestrictionRecord)) private _sanctionedWallets;

    event AddressSanctioned(address indexed wallet, address indexed asset, bytes32 evidenceHash, string justification);
    event AddressUnsanctioned(address indexed wallet, address indexed asset, bytes32 evidenceHash, string justification);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(SANCTIONER_ROLE, admin);
    }

    function restrictAddress(
        address wallet,
        address asset,
        bytes32 evidenceHash,
        string calldata justification
    ) external onlyRole(SANCTIONER_ROLE) {
        require(wallet != address(0), "SanctionsOracle: invalid wallet");
        require(evidenceHash != bytes32(0), "SanctionsOracle: evidence hash required");

        _sanctionedWallets[wallet][asset] = RestrictionRecord({
            restricted: true,
            evidenceHash: evidenceHash,
            justification: justification,
            timestamp: block.timestamp
        });

        emit AddressSanctioned(wallet, asset, evidenceHash, justification);
    }

    function unrestrictAddress(
        address wallet,
        address asset,
        bytes32 evidenceHash,
        string calldata justification
    ) external onlyRole(SANCTIONER_ROLE) {
        require(wallet != address(0), "SanctionsOracle: invalid wallet");
        require(evidenceHash != bytes32(0), "SanctionsOracle: evidence hash required");

        _sanctionedWallets[wallet][asset] = RestrictionRecord({
            restricted: false,
            evidenceHash: evidenceHash,
            justification: justification,
            timestamp: block.timestamp
        });

        emit AddressUnsanctioned(wallet, asset, evidenceHash, justification);
    }

    function isSanctioned(address wallet, address asset) external view returns (bool) {
        return _sanctionedWallets[wallet][asset].restricted;
    }

    function getRestrictionRecord(address wallet, address asset) external view returns (RestrictionRecord memory) {
        return _sanctionedWallets[wallet][asset];
    }
}
