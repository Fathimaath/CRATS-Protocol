// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "../interfaces/standards/IERC7540.sol";
import "../interfaces/identity/IIdentityRegistry.sol";
import "../interfaces/compliance/ICompliance.sol";
import "../utils/AssetConfig.sol";

/**
 * @title AsyncVault
 * @dev ERC-7540 Asynchronous Tokenized Vault
 * 
 * COPIED FROM: ERC4626 Alliance ERC-7540 Reference Implementation
 * Source: https://github.com/ERC4626-Alliance/ERC-7540-Reference
 * 
 * IMPORTANT: This contract does NOT inherit from ERC4626 because ERC-7540
 * uses the same function signatures with different semantics (controller vs owner).
 * We implement IERC4626 interface but override behavior for async flows.
 */
contract AsyncVault is ERC20, AccessControl, ReentrancyGuard, IERC7540 {
    using SafeERC20 for IERC20;
    using Math for uint256;

    // ========== State Variables ==========

    /// @dev The underlying ERC-20 asset
    IERC20 private immutable _asset;

    /// @dev Total pending deposit assets
    uint256 internal _totalPendingDepositAssets;

    /// @dev Total pending redeem shares
    uint256 internal _totalPendingRedeemShares;

    /// @dev Pending deposit requests: controller => assets
    mapping(address => PendingDeposit) internal _pendingDeposit;

    /// @dev Claimable deposit requests: controller => (assets, shares)
    mapping(address => ClaimableDeposit) internal _claimableDeposit;

    /// @dev Pending redeem requests: controller => shares
    mapping(address => PendingRedeem) internal _pendingRedeem;

    /// @dev Claimable redeem requests: controller => (assets, shares)
    mapping(address => ClaimableRedeem) internal _claimableRedeem;

    /// @dev Operator approvals: controller => operator => approved
    mapping(address => mapping(address => bool)) public override isOperator;

    /// @dev Next deposit request ID per controller
    mapping(address => uint256) private _nextDepositRequestId;

    /// @dev Next redeem request ID per controller
    mapping(address => uint256) private _nextRedeemRequestId;

    /// @dev Layer 1 Identity Registry
    address public identityRegistry;

    /// @dev Layer 1 Compliance Module
    address public complianceModule;

    /// @dev Vault category
    bytes32 public category;

    /// @dev Settlement period (seconds)
    uint256 public settlementPeriod = 24 hours;

    // ========== Structs ==========

    struct PendingDeposit {
        uint256 assets;
    }

    struct ClaimableDeposit {
        uint256 assets;
        uint256 shares;
    }

    struct PendingRedeem {
        uint256 shares;
    }

    struct ClaimableRedeem {
        uint256 assets;
        uint256 shares;
    }

    // ========== Constants ==========

    /// @dev Interface ID for ERC-165
    bytes4 private constant INTERFACE_ID_ERC7540_DEPOSIT = 0xce3bbe50;
    bytes4 private constant INTERFACE_ID_ERC7540_REDEEM = 0x620ee8e4;
    bytes4 private constant INTERFACE_ID_ERC7540_OPERATOR = 0xe3bc4e65;

    // ========== Roles ==========

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant COMPLIANCE_ROLE = keccak256("COMPLIANCE_ROLE");
    bytes32 public constant FULFILLER_ROLE = keccak256("FULFILLER_ROLE");

    // ========== Modifiers ==========

    modifier onlyFulfiller() {
        require(hasRole(FULFILLER_ROLE, msg.sender), "AsyncVault: Caller is not fulfiller");
        _;
    }

    // ========== Constructor ==========

    constructor(
        address asset_,
        string memory name_,
        string memory symbol_,
        address admin
    ) ERC20(name_, symbol_) {
        require(asset_ != address(0), "AsyncVault: Asset cannot be zero");
        require(admin != address(0), "AsyncVault: Admin cannot be zero");

        _asset = IERC20(asset_);

        // Grant roles
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
        _grantRole(COMPLIANCE_ROLE, admin);
        _grantRole(FULFILLER_ROLE, admin);

        // Inflation attack prevention: mint 1 dead share to address(1) (burn address)
        _mint(address(1), 1);
    }

    // ========== IERC4626 View Functions ==========

    function asset() public view override returns (address) {
        return address(_asset);
    }

    function totalAssets() public view override returns (uint256) {
        return ERC20(address(_asset)).balanceOf(address(this)) 
            - _totalPendingDepositAssets 
            - _totalPendingRedeemShares;
    }

    function convertToShares(uint256 assets) public view override returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) {
            return assets;
        }
        return assets.mulDiv(supply, totalAssets(), Math.Rounding.Floor);
    }

    function convertToAssets(uint256 shares) public view override returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) {
            return shares;
        }
        return shares.mulDiv(totalAssets(), supply, Math.Rounding.Floor);
    }

    function maxDeposit(address controller) public view override returns (uint256) {
        return _claimableDeposit[controller].assets;
    }

    function maxMint(address controller) public view override returns (uint256) {
        return _claimableDeposit[controller].shares;
    }

    function maxWithdraw(address controller) public view override returns (uint256) {
        return _claimableRedeem[controller].assets;
    }

    function maxRedeem(address controller) public view override returns (uint256) {
        return _claimableRedeem[controller].shares;
    }

    function previewDeposit(uint256) public pure override returns (uint256) {
        revert("AsyncVault: Use claimableDepositRequest");
    }

    function previewMint(uint256) public pure override returns (uint256) {
        revert("AsyncVault: Use claimableDepositRequest");
    }

    function previewWithdraw(uint256) public pure override returns (uint256) {
        revert("AsyncVault: Use claimableRedeemRequest");
    }

    function previewRedeem(uint256) public pure override returns (uint256) {
        revert("AsyncVault: Use claimableRedeemRequest");
    }

    // ========== IERC7540 Async Deposit Functions ==========

    function requestDeposit(uint256 assets, address controller, address owner)
        external
        override
        nonReentrant
        returns (uint256 requestId)
    {
        require(owner == msg.sender || isOperator[owner][msg.sender], "AsyncVault: Invalid caller");
        require(_asset.balanceOf(owner) >= assets, "AsyncVault: Insufficient balance");
        require(assets != 0, "ZERO_ASSETS");

        _checkCompliance(owner);

        _asset.safeTransferFrom(owner, address(this), assets);

        uint256 currentPendingAssets = _pendingDeposit[controller].assets;
        _pendingDeposit[controller] = PendingDeposit(assets + currentPendingAssets);
        _totalPendingDepositAssets += assets;

        // Generate unique request ID
        requestId = _nextDepositRequestId[controller]++;

        emit DepositRequest(controller, owner, requestId, msg.sender, assets);
        return requestId;
    }

    function pendingDepositRequest(uint256, address controller)
        public
        view
        override
        returns (uint256 pendingAssets)
    {
        pendingAssets = _pendingDeposit[controller].assets;
    }

    function claimableDepositRequest(uint256, address controller)
        public
        view
        override
        returns (uint256 claimableAssets)
    {
        claimableAssets = _claimableDeposit[controller].assets;
    }

    function nextDepositRequestId(address controller) external view override returns (uint256) {
        return _nextDepositRequestId[controller];
    }

    // ========== IERC7540 Async Redeem Functions ==========

    function requestRedeem(uint256 shares, address controller, address owner)
        external
        override
        nonReentrant
        returns (uint256 requestId)
    {
        require(owner == msg.sender || isOperator[owner][msg.sender], "AsyncVault: Invalid caller");
        require(balanceOf(owner) >= shares, "AsyncVault: Insufficient balance");
        require(shares != 0, "ZERO_SHARES");

        _checkCompliance(owner);

        _transfer(owner, address(this), shares);

        uint256 currentPendingShares = _pendingRedeem[controller].shares;
        _pendingRedeem[controller] = PendingRedeem(shares + currentPendingShares);
        _totalPendingRedeemShares += shares;

        // Generate unique request ID
        requestId = _nextRedeemRequestId[controller]++;

        emit RedeemRequest(controller, owner, requestId, msg.sender, shares);
        return requestId;
    }

    function pendingRedeemRequest(uint256, address controller)
        public
        view
        override
        returns (uint256 pendingShares)
    {
        pendingShares = _pendingRedeem[controller].shares;
    }

    function claimableRedeemRequest(uint256, address controller)
        public
        view
        override
        returns (uint256 claimableShares)
    {
        claimableShares = _claimableRedeem[controller].shares;
    }

    function nextRedeemRequestId(address controller) external view override returns (uint256) {
        return _nextRedeemRequestId[controller];
    }

    // ========== Fulfillment Logic (Owner Only) ==========

    /**
     * @dev Fulfill deposit requests (makes them claimable)
     */
    function fulfillDeposit(address controller, uint256 assets)
        external
        onlyFulfiller
        returns (uint256 shares)
    {
        PendingDeposit storage request = _pendingDeposit[controller];
        require(request.assets != 0 && assets <= request.assets, "ZERO_ASSETS");

        shares = convertToShares(assets);
        _mint(address(this), shares);

        _claimableDeposit[controller] = ClaimableDeposit(
            _claimableDeposit[controller].assets + assets,
            _claimableDeposit[controller].shares + shares
        );

        request.assets -= assets;
        _totalPendingDepositAssets -= assets;
    }

    /**
     * @dev Fulfill redeem requests (makes them claimable)
     */
    function fulfillRedeem(address controller, uint256 shares)
        external
        onlyFulfiller
        returns (uint256 assets)
    {
        PendingRedeem storage request = _pendingRedeem[controller];
        require(request.shares != 0 && shares <= request.shares, "ZERO_SHARES");

        assets = convertToAssets(shares);
        _claimableRedeem[controller] = ClaimableRedeem(
            _claimableRedeem[controller].assets + assets,
            _claimableRedeem[controller].shares + shares
        );
        request.shares -= shares;
        _totalPendingRedeemShares -= shares;
    }

    // ========== IERC7540 Claim Functions (Override ERC-4626) ==========

    function deposit(uint256 assets, address receiver, address controller)
        external
        nonReentrant
        returns (uint256 shares)
    {
        require(controller == msg.sender || isOperator[controller][msg.sender], "AsyncVault: Invalid caller");
        require(assets != 0, "Must claim nonzero amount");

        ClaimableDeposit storage claimable = _claimableDeposit[controller];
        shares = assets.mulDiv(claimable.shares, claimable.assets, Math.Rounding.Floor);
        uint256 sharesUp = assets.mulDiv(claimable.shares, claimable.assets, Math.Rounding.Ceil);

        claimable.assets -= assets;
        claimable.shares = claimable.shares > sharesUp ? claimable.shares - sharesUp : 0;

        _mint(receiver, shares);

        emit Deposit(msg.sender, receiver, assets, shares);
    }

    function mint(uint256 shares, address receiver, address controller)
        external
        nonReentrant
        returns (uint256 assets)
    {
        require(controller == msg.sender || isOperator[controller][msg.sender], "AsyncVault: Invalid caller");
        require(shares != 0, "Must claim nonzero amount");

        ClaimableDeposit storage claimable = _claimableDeposit[controller];
        assets = shares.mulDiv(claimable.assets, claimable.shares, Math.Rounding.Floor);
        uint256 assetsUp = shares.mulDiv(claimable.assets, claimable.shares, Math.Rounding.Ceil);

        claimable.assets = claimable.assets > assetsUp ? claimable.assets - assetsUp : 0;
        claimable.shares -= shares;

        _mint(receiver, shares);

        emit Deposit(msg.sender, receiver, assets, shares);
    }

    function withdraw(uint256 assets, address receiver, address controller)
        external
        nonReentrant
        returns (uint256 shares)
    {
        require(controller == msg.sender || isOperator[controller][msg.sender], "AsyncVault: Invalid caller");
        require(assets != 0, "Must claim nonzero amount");

        ClaimableRedeem storage claimable = _claimableRedeem[controller];
        shares = assets.mulDiv(claimable.shares, claimable.assets, Math.Rounding.Floor);
        uint256 sharesUp = assets.mulDiv(claimable.shares, claimable.assets, Math.Rounding.Ceil);

        claimable.assets -= assets;
        claimable.shares = claimable.shares > sharesUp ? claimable.shares - sharesUp : 0;

        _asset.safeTransfer(receiver, assets);

        emit Withdraw(msg.sender, receiver, controller, assets, shares);
    }

    function redeem(uint256 shares, address receiver, address controller)
        external
        nonReentrant
        returns (uint256 assets)
    {
        require(controller == msg.sender || isOperator[controller][msg.sender], "AsyncVault: Invalid caller");
        require(shares != 0, "Must claim nonzero amount");

        ClaimableRedeem storage claimable = _claimableRedeem[controller];
        assets = shares.mulDiv(claimable.assets, claimable.shares, Math.Rounding.Floor);
        uint256 assetsUp = shares.mulDiv(claimable.assets, claimable.shares, Math.Rounding.Ceil);

        claimable.assets = claimable.assets > assetsUp ? claimable.assets - assetsUp : 0;
        claimable.shares -= shares;

        _asset.safeTransfer(receiver, assets);

        emit Withdraw(msg.sender, receiver, controller, assets, shares);
    }

    // ========== IERC7540 Operator Management ==========

    function setOperator(address operator, bool approved)
        external
        override
        returns (bool success)
    {
        isOperator[msg.sender][operator] = approved;
        emit OperatorSet(msg.sender, operator, approved);
        return true;
    }

    // ========== ERC-165 Support ==========

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(AccessControl, IERC7540)
        returns (bool)
    {
        return
            interfaceId == INTERFACE_ID_ERC7540_DEPOSIT ||
            interfaceId == INTERFACE_ID_ERC7540_REDEEM ||
            interfaceId == INTERFACE_ID_ERC7540_OPERATOR ||
            super.supportsInterface(interfaceId);
    }

    // ========== Compliance Integration ==========

    function _checkCompliance(address account) internal view {
        if (identityRegistry == address(0)) {
            return;
        }
        bool verified = IIdentityRegistry(identityRegistry).isVerified(account);
        require(verified, "AsyncVault: Account not verified");
    }

    function setIdentityRegistry(address registry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(registry != address(0), "AsyncVault: Invalid registry");
        identityRegistry = registry;
    }

    function setComplianceModule(address compliance) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(compliance != address(0), "AsyncVault: Invalid compliance");
        complianceModule = compliance;
    }

    function setCategory(bytes32 category_) external {
        category = category_;
    }

    function setSettlementPeriod(uint256 period) external {
        require(period > 0, "AsyncVault: Invalid period");
        settlementPeriod = period;
    }

    // ========== Emergency Functions ==========

    function emergencyWithdraw(uint256 amount, address to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(to != address(0), "AsyncVault: Invalid address");
        _asset.safeTransfer(to, amount);
    }

    // ========== Version ==========

    function version() external pure virtual returns (string memory) {
        return AssetConfig.VERSION;
    }
}
