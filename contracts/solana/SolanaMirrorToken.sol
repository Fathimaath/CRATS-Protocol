// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract SolanaMirrorToken is ERC20 {
    address public verifier;
    constructor() ERC20("CRAT Mirror", "mCRAT") {}
    function setVerifier(address v) external {
        require(verifier == address(0), "set");
        verifier = v;
    }
    function mint(address to, uint256 a) external {
        require(msg.sender == verifier, "verifier");
        _mint(to, a);
    }
    function burn(address from, uint256 a) external {
        require(msg.sender == verifier, "verifier");
        _burn(from, a);
    }
}
