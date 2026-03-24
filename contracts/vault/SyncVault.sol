// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "../interfaces/identity/IIdentityRegistry.sol";
import "../interfaces/compliance/ICompliance.sol";
import "../utils/AssetConfig.sol";

/**
 * @title SyncVault
 * @dev ERC-4626 Tokenized Vault with synchronous deposit/redeem
 * 
 * BASED ON: OpenZeppelin ERC-4626 Implementation
 * Source: https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/extensions/ERC4626.sol
 * Audit: OpenZeppelin Audits 2022-10
 * 
 * Features:
 * - Atomic deposit/redeem (T+0 settlement)
 * - Share price appreciation for yield
 * - Inflation attack prevention
 * - Layer 1 compliance integration
 */
contract SyncVault is ERC4626, AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ========== State Variables ==========

    /// @dev Layer 1 Identity Registry
    address public identityRegistry;

    /// @dev Layer 1 Compliance Module
    address public complianceModule;

    /// @dev Circuit breaker module
    address public circuitBreaker;

    /// @dev Vault category
    bytes32 public category;

    // ========== Roles ==========

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant COMPLIANCE_ROLE = keccak256("COMPLIANCE_ROLE");

    // ========== Modifiers ==========

    modifier onlyOperator() {
        require(hasRole(OPERATOR_ROLE, msg.sender), "SyncVault: Caller is not operator");
        _;
    }

    modifier onlyCompliance() {
        require(hasRole(COMPLIANCE_ROLE, msg.sender), "SyncVault: Caller is not compliance");
        _;
    }

    // ========== Constructor ==========

    constructor(
        IERC20 asset_,
        string memory name_,
        string memory symbol_,
        address admin
    ) ERC4626(asset_) ERC20(name_, symbol_) {
        require(admin != address(0), "SyncVault: Admin cannot be zero");

        // Grant roles
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
        _grantRole(COMPLIANCE_ROLE, admin);

        // Inflation attack prevention: mint 1 dead share to address(0)
        _mint(address(0), 1);
    }

    // ========== Override ERC4626 Functions ==========

    /**
     * @dev Deposit with compliance check
     */
    function deposit(uint256 assets, address receiver)
        public
        override
        nonReentrant
        returns (uint256 shares)
    {
        _checkCompliance(msg.sender);
        return super.deposit(assets, receiver);
    }

    /**
     * @dev Mint with compliance check
     */
    function mint(uint256 shares, address receiver)
        public
        override
        nonReentrant
        returns (uint256 assets)
    {
        _checkCompliance(msg.sender);
        return super.mint(shares, receiver);
    }

    /**
     * @dev Withdraw with compliance check
     */
    function withdraw(uint256 assets, address receiver, address owner)
        public
        override
        nonReentrant
        returns (uint256 shares)
    {
        _checkCompliance(owner);
        return super.withdraw(assets, receiver, owner);
    }

    /**
     * @dev Redeem with compliance check
     */
    function redeem(uint256 shares, address receiver, address owner)
        public
        override
        nonReentrant
        returns (uint256 assets)
    {
        _checkCompliance(owner);
        return super.redeem(shares, receiver, owner);
    }

    /**
     * @dev Override totalAssets to include internal accounting
     */
    function totalAssets() public view override returns (uint256) {
        return ERC20(asset()).balanceOf(address(this));
    }

    // ========== Yield Distribution ==========

    /**
     * @dev Distribute yield to vault (increases share price)
     */
    function distributeYield(uint256 amount) external onlyOperator {
        require(amount > 0, "SyncVault: Amount must be positive");
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), amount);
    }

    // ========== Compliance Integration ==========

    function _checkCompliance(address account) internal view {
        if (identityRegistry == address(0)) {
            return;
        }
        bool verified = IIdentityRegistry(identityRegistry).isVerified(account);
        require(verified, "SyncVault: Account not verified");
    }

    function setIdentityRegistry(address registry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(registry != address(0), "SyncVault: Invalid registry");
        identityRegistry = registry;
    }

    function setComplianceModule(address compliance) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(compliance != address(0), "SyncVault: Invalid compliance");
        complianceModule = compliance;
    }

    function setCircuitBreaker(address cb) external onlyRole(DEFAULT_ADMIN_ROLE) {
        circuitBreaker = cb;
    }

    function setCategory(bytes32 category_) external {
        category = category_;
    }

    // ========== Emergency Functions ==========

    function emergencyWithdraw(uint256 amount, address to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(to != address(0), "SyncVault: Invalid address");
        IERC20(asset()).safeTransfer(to, amount);
    }

    // ========== Version ==========

    function version() external pure virtual returns (string memory) {
        return AssetConfig.VERSION;
    }
}
