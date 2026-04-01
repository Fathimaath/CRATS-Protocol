// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockVault
 * @dev Simple mock vault token for testing (ERC20 with mint function)
 */
contract MockVault is ERC20 {
    constructor() ERC20("Mock Vault", "mVT") {
        // Mint initial supply to deployer for testing
        _mint(msg.sender, 1000000 * 10 ** 18);
    }

    /**
     * @dev Mint tokens to address
     */
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
