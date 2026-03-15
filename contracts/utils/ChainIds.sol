// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title ChainIds
 * @dev Supported EVM chain IDs for multi-chain wallet tracking
 */
library ChainIds {
    // Ethereum Mainnet
    uint256 public constant ETHEREUM = 1;
    uint256 public constant GOERLI = 5;
    uint256 public constant SEPOLIA = 11155111;
    
    // Polygon
    uint256 public constant POLYGON = 137;
    uint256 public constant POLYGON_MUMBAI = 80001;
    uint256 public constant POLYGON_AMOY = 80002;
    
    // Arbitrum
    uint256 public constant ARBITRUM_ONE = 42161;
    uint256 public constant ARBITRUM_GOERLI = 421613;
    uint256 public constant ARBITRUM_SEPOLIA = 421614;
    
    // Optimism
    uint256 public constant OPTIMISM = 10;
    uint256 public constant OPTIMISM_GOERLI = 420;
    uint256 public constant OPTIMISM_SEPOLIA = 11155420;
    
    // BSC
    uint256 public constant BSC = 56;
    uint256 public constant BSC_TESTNET = 97;
    
    // Avalanche
    uint256 public constant AVALANCHE = 43114;
    uint256 public constant AVALANCHE_FUJI = 43113;
    
    /**
     * @dev Check if chain ID is supported
     * @param chainId Chain ID to check
     * @return bool True if supported
     */
    function isSupported(uint256 chainId) internal pure returns (bool) {
        return chainId == ETHEREUM ||
               chainId == SEPOLIA ||
               chainId == POLYGON ||
               chainId == POLYGON_AMOY ||
               chainId == ARBITRUM_ONE ||
               chainId == ARBITRUM_SEPOLIA ||
               chainId == OPTIMISM ||
               chainId == OPTIMISM_SEPOLIA ||
               chainId == BSC ||
               chainId == AVALANCHE;
    }
}
