// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC4626Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/identity/IIdentityRegistry.sol";
import "../interfaces/vault/ISyncVault.sol";
import "../utils/AssetConfig.sol";

/**
 * @title SyncVault
 * @dev Upgradeable ERC-4626 Tokenized Vault with synchronous deposit/redeem
 * Compatible with Clones (ERC-1167)
 */
contract SyncVault is 
    Initializable, 
    ERC4626Upgradeable, 
    AccessControlUpgradeable, 
    ReentrancyGuardUpgradeable,
    ISyncVault 
{
    using SafeERC20 for IERC20;

    // === State ===
    address public identityRegistry;
    address public complianceModule;
    address public circuitBreaker;
    bytes32 public category;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant COMPLIANCE_ROLE = keccak256("COMPLIANCE_ROLE");

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address asset_,
        string memory name_,
        string memory symbol_,
        address admin
    ) public initializer {
        __ERC4626_init(IERC20(asset_));
        __ERC20_init(name_, symbol_);
        __AccessControl_init();
        __ReentrancyGuard_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(DEFAULT_ADMIN_ROLE, _msgSender()); // Grant to Factory for configuration
        _grantRole(OPERATOR_ROLE, admin);
        _grantRole(COMPLIANCE_ROLE, admin);

        // Inflation protection
        _mint(address(1), 1);
    }

    // === Overrides ===

    function asset() public view override(ERC4626Upgradeable, ISyncVault) returns (address) {
        return super.asset();
    }

    function totalAssets() public view override(ERC4626Upgradeable, ISyncVault) returns (uint256) {
        return IERC20(asset()).balanceOf(address(this));
    }

    function convertToAssets(uint256 shares) public view override(ERC4626Upgradeable, ISyncVault) returns (uint256) {
        return super.convertToAssets(shares);
    }

    function convertToShares(uint256 assets) public view override(ERC4626Upgradeable, ISyncVault) returns (uint256) {
        return super.convertToShares(assets);
    }

    function maxDeposit(address receiver) public view override(ERC4626Upgradeable, ISyncVault) returns (uint256) {
        return super.maxDeposit(receiver);
    }

    function maxMint(address receiver) public view override(ERC4626Upgradeable, ISyncVault) returns (uint256) {
        return super.maxMint(receiver);
    }

    function maxWithdraw(address owner) public view override(ERC4626Upgradeable, ISyncVault) returns (uint256) {
        return super.maxWithdraw(owner);
    }

    function maxRedeem(address owner) public view override(ERC4626Upgradeable, ISyncVault) returns (uint256) {
        return super.maxRedeem(owner);
    }

    function deposit(uint256 assets, address receiver) public override(ERC4626Upgradeable, ISyncVault) nonReentrant returns (uint256) {
        _checkCompliance(msg.sender);
        return super.deposit(assets, receiver);
    }

    function mint(uint256 shares, address receiver) public override(ERC4626Upgradeable, ISyncVault) nonReentrant returns (uint256) {
        _checkCompliance(msg.sender);
        return super.mint(shares, receiver);
    }

    function withdraw(uint256 assets, address receiver, address owner) public override(ERC4626Upgradeable, ISyncVault) nonReentrant returns (uint256) {
        _checkCompliance(owner);
        return super.withdraw(assets, receiver, owner);
    }

    function redeem(uint256 shares, address receiver, address owner) public override(ERC4626Upgradeable, ISyncVault) nonReentrant returns (uint256) {
        _checkCompliance(owner);
        return super.redeem(shares, receiver, owner);
    }

    function distributeYield(uint256 amount) external override onlyRole(OPERATOR_ROLE) {
        require(amount > 0, "SyncVault: Amount must be positive");
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), amount);
    }

    // === Identity & Compliance ===

    function _checkCompliance(address account) internal view {
        if (identityRegistry == address(0)) return;
        require(IIdentityRegistry(identityRegistry).isVerified(account), "SyncVault: Account not verified");
    }

    function setIdentityRegistry(address registry) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        identityRegistry = registry;
    }

    function setComplianceModule(address compliance) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        complianceModule = compliance;
    }

    function setCircuitBreaker(address cb) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        circuitBreaker = cb;
    }

    function setCategory(bytes32 category_) external override {
        category = category_;
    }

    function version() external pure override returns (string memory) {
        return AssetConfig.VERSION;
    }

    // Boilerplate for ISyncVault
    function totalMinted() external view override returns (uint256) { return totalSupply(); }
    function totalBurned() external pure override returns (uint256) { return 0; }
}
