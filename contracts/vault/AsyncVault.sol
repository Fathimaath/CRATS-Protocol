// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC4626Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../interfaces/standards/IERC7540.sol";
import "../interfaces/identity/IIdentityRegistry.sol";
import "./BaseVault.sol";

/**
 * @title AsyncVault
 * @dev ERC-7540 Asynchronous Tokenized Vault.
 * Inherits ERC4626Upgradeable for core accounting and BaseVault for BOR syncing.
 */
contract AsyncVault is 
    Initializable,
    ERC4626Upgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    IERC7540,
    BaseVault 
{
    using SafeERC20 for IERC20;
    using Math for uint256;

    // Async State
    uint256 internal _totalPendingDepositAssets;
    uint256 internal _totalPendingRedeemShares;
    mapping(address => uint256) internal _pendingDeposit;
    struct InternalClaim { uint256 assets; uint256 shares; }
    mapping(address => InternalClaim) internal _claimableDeposit;
    mapping(address => uint256) internal _pendingRedeem;
    mapping(address => InternalClaim) internal _claimableRedeem;
    mapping(address => uint256) private _nextDepositRequestId;
    mapping(address => uint256) private _nextRedeemRequestId;

    address public identityRegistry;
    address public complianceModule;
    bytes32 public category;
    uint256 public settlementPeriod;
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant FULFILLER_ROLE = keccak256("FULFILLER_ROLE");

    constructor() { _disableInitializers(); }

    function initialize(
        address asset_,
        string memory name_,
        string memory symbol_,
        address admin,
        address assetRegistry_
    ) public initializer {
        __ERC4626_init(IERC20(asset_));
        __ERC20_init(name_, symbol_);
        __AccessControl_init();
        __ReentrancyGuard_init();
        __BaseVault_init(asset_, assetRegistry_);

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
        _grantRole(FULFILLER_ROLE, admin);

        settlementPeriod = 24 * 60 * 60; // 24 hours default
        _mint(address(1), 1); // Minimum supply to prevent inflation attacks (Standard 4626)
    }

    // === Overrides (Consolidated for multiple inheritance) ===

    function decimals() public view override(ERC20Upgradeable, ERC4626Upgradeable) returns (uint8) {
        return super.decimals();
    }

    function asset() public view override(ERC4626Upgradeable, IERC7540) returns (address) {
        return super.asset();
    }

    function totalAssets() public view override(ERC4626Upgradeable, BaseVault, IERC7540) returns (uint256) {
        uint256 actualBalance = IERC20(asset()).balanceOf(address(this));
        return actualBalance > _totalPendingDepositAssets ? actualBalance - _totalPendingDepositAssets : 0;
    }

    function convertToShares(uint256 assets) public view override(ERC4626Upgradeable, IERC7540) returns (uint256) {
        return super.convertToShares(assets);
    }

    function convertToAssets(uint256 shares) public view override(ERC4626Upgradeable, IERC7540) returns (uint256) {
        return super.convertToAssets(shares);
    }

    // === ERC-7540 Async Logic ===

    function requestDeposit(uint256 assets, address controller, address owner) external override nonReentrant returns (uint256 requestId) {
        require(assets > 0, "ZERO_ASSETS");
        require(owner == msg.sender || isOperator(owner, msg.sender), "unauthorized");
        IERC20(asset()).safeTransferFrom(owner, address(this), assets);
        _pendingDeposit[controller] += assets;
        _totalPendingDepositAssets += assets;
        requestId = _nextDepositRequestId[controller]++;
        
        // BOR sync: reflect pending position
        if (address(assetRegistry) != address(0)) {
            assetRegistry.syncOwner(asset(), controller, balanceOf(controller) + convertToShares(assets));
        }
        
        emit DepositRequest(controller, owner, requestId, msg.sender, assets);
        return requestId;
    }

    function requestRedeem(uint256 shares, address controller, address owner) external override nonReentrant returns (uint256 requestId) {
        require(shares > 0, "ZERO_SHARES");
        require(owner == msg.sender || isOperator(owner, msg.sender), "unauthorized");
        _transfer(owner, address(this), shares);
        _pendingRedeem[controller] += shares;
        _totalPendingRedeemShares += shares;
        requestId = _nextRedeemRequestId[controller]++;
        
        // BOR sync: reflect reduction
        if (address(assetRegistry) != address(0)) {
            assetRegistry.syncOwner(asset(), owner, balanceOf(owner));
        }
        
        emit RedeemRequest(controller, owner, requestId, msg.sender, shares);
        return requestId;
    }

    function fulfillDeposit(address controller, uint256 assets) external onlyRole(FULFILLER_ROLE) {
        uint256 shares = convertToShares(assets);
        _mint(address(this), shares);
        _claimableDeposit[controller].assets += assets;
        _claimableDeposit[controller].shares += shares;
        _pendingDeposit[controller] -= assets;
        _totalPendingDepositAssets -= assets;
    }

    function fulfillRedeem(address controller, uint256 shares) external onlyRole(FULFILLER_ROLE) {
        uint256 assets = convertToAssets(shares);
        _claimableRedeem[controller].shares += shares;
        _claimableRedeem[controller].assets += assets;
        _pendingRedeem[controller] -= shares;
        _totalPendingRedeemShares -= shares;
    }

    // Consolidated overrides for overlapping signatures between 4626 and 7540

    function deposit(uint256 assets, address receiver, address controller) public override(IERC7540) nonReentrant returns (uint256 shares) {
        require(assets > 0, "Must claim nonzero amount");
        require(controller == msg.sender || isOperator(controller, msg.sender), "unauthorized");
        InternalClaim storage cl = _claimableDeposit[controller];
        require(cl.assets >= assets, "insufficient claimable assets");
        shares = assets.mulDiv(cl.shares, cl.assets, Math.Rounding.Floor);
        cl.assets -= assets; cl.shares -= shares;
        _transfer(address(this), receiver, shares);
        emit Deposit(msg.sender, receiver, assets, shares);
    }

    function redeem(uint256 shares, address receiver, address controller) public override(ERC4626Upgradeable, IERC7540) nonReentrant returns (uint256 assets) {
        require(shares > 0, "Must claim nonzero shares");
        require(controller == msg.sender || isOperator(controller, msg.sender), "unauthorized");
        InternalClaim storage cl = _claimableRedeem[controller];
        require(cl.shares >= shares, "insufficient claimable shares");
        assets = shares.mulDiv(cl.assets, cl.shares, Math.Rounding.Floor);
        cl.shares -= shares; cl.assets -= assets;
        _burn(address(this), shares);
        IERC20(asset()).safeTransfer(receiver, assets);
        emit Withdraw(msg.sender, receiver, controller, assets, shares);
    }

    // === Disable Atomic methods to enforce Async (Mapping to claim if available) ===

    function deposit(uint256 assets, address receiver) public override(ERC4626Upgradeable) returns (uint256) {
        return deposit(assets, receiver, msg.sender);
    }
    function mint(uint256 shares, address receiver) public override(ERC4626Upgradeable) returns (uint256) {
        uint256 assets = convertToAssets(shares);
        return deposit(assets, receiver, msg.sender);
    }
    function withdraw(uint256 assets, address receiver, address owner) public override(ERC4626Upgradeable) returns (uint256) {
        uint256 shares = convertToShares(assets);
        return redeem(shares, receiver, owner);
    }

    // === View Functions (Max/Preview) ===

    function maxDeposit(address) public view override(ERC4626Upgradeable, IERC7540) returns (uint256) { return 0; }
    function maxMint(address) public view override(ERC4626Upgradeable, IERC7540) returns (uint256) { return 0; }
    function maxWithdraw(address o) public view override(ERC4626Upgradeable, IERC7540) returns (uint256) { return _claimableRedeem[o].assets; }
    function maxRedeem(address o) public view override(ERC4626Upgradeable, IERC7540) returns (uint256) { return _claimableRedeem[o].shares; }
    
    // We don't call super here to avoid unreachable code warnings
    function previewDeposit(uint256) public pure override(ERC4626Upgradeable, IERC7540) returns (uint256) { revert("Use requestDeposit"); }
    function previewMint(uint256) public pure override(ERC4626Upgradeable, IERC7540) returns (uint256) { revert("Use requestDeposit"); }
    function previewWithdraw(uint256) public pure override(ERC4626Upgradeable, IERC7540) returns (uint256) { revert("Use requestRedeem"); }
    function previewRedeem(uint256) public pure override(ERC4626Upgradeable, IERC7540) returns (uint256) { revert("Use requestRedeem"); }

    // === BOR & Holder Logic ===

    function _update(address from, address to, uint256 value) internal override(ERC20Upgradeable, BaseVault) {
        super._update(from, to, value);
    }

    function _getHolderCount() internal view override returns (uint256) { return 0; } // Optional: implement tracking if needed
    function _getAllHolders() internal view override returns (address[] memory, uint256[] memory) {
        return (new address[](0), new uint256[](0));
    }

    // === Boilerplate ===

    mapping(address => mapping(address => bool)) private _ops;
    function isOperator(address c, address o) public view override returns (bool) { return _ops[c][o]; }
    function setOperator(address o, bool a) external override returns (bool) {
        _ops[msg.sender][o] = a; emit OperatorSet(msg.sender, o, a); return true;
    }
    function supportsInterface(bytes4 id) public view override(AccessControlUpgradeable, IERC7540) returns (bool) {
        return id == 0xce3bbe50 || id == 0x620ee8e4 || id == 0xe3bc4e65 || super.supportsInterface(id);
    }

    function pendingDepositRequest(uint256, address c) external view override returns (uint256) { return _pendingDeposit[c]; }
    function claimableDepositRequest(uint256, address c) external view override returns (uint256) { return _claimableDeposit[c].assets; }
    function nextDepositRequestId(address c) external view override returns (uint256) { return _nextDepositRequestId[c]; }
    function pendingRedeemRequest(uint256, address c) external view override returns (uint256) { return _pendingRedeem[c]; }
    function claimableRedeemRequest(uint256, address c) external view override returns (uint256) { return _claimableRedeem[c].shares; }
    function nextRedeemRequestId(address c) external view override returns (uint256) { return _nextRedeemRequestId[c]; }

    function setIdentityRegistry(address r) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(r != address(0), "invalid registry");
        identityRegistry = r;
    }

    function setComplianceModule(address compliance) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(compliance != address(0), "invalid compliance");
        complianceModule = compliance;
    }

    function setCategory(bytes32 cat) external { category = cat; }

    function setSettlementPeriod(uint256 period) external {
        require(period > 0, "invalid period");
        settlementPeriod = period;
    }

    function version() external pure returns (string memory) {
        return "3.0.0";
    }

    function emergencyWithdraw(uint256 amount, address to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(to != address(0), "invalid to address");
        IERC20(asset()).safeTransfer(to, amount);
    }
}
