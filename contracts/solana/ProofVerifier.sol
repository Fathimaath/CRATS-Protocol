// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/vault/ISyncVault.sol";
import "./SolanaMirrorToken.sol";

contract ProofVerifier {
    address public operator;           // backend/relayer signer
    SolanaMirrorToken public mirror;
    ISyncVault public vault;

    uint256 public maxSupply;          // = total_locked on Solana
    uint256 public mintedShares;       // track minted

    constructor(address _op) { operator = _op; }

    function setup(address _mirror, address _vault, uint256 _max) external {
        require(address(mirror) == address(0), "init");
        mirror = SolanaMirrorToken(_mirror);
        vault  = ISyncVault(_vault);
        maxSupply = _max;
    }

    /// @dev Called after USDT payment is received by treasury
    function mintAndDeposit(address investor, uint256 amount) external {
        require(msg.sender == operator, "operator");
        require(mintedShares + amount <= maxSupply, "cap");

        mintedShares += amount;

        mirror.mint(address(this), amount);
        mirror.approve(address(vault), amount);
        vault.deposit(amount, investor);
    }
}
