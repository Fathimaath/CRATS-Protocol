// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IAssetToken.sol";
import "../interfaces/IIdentityRegistry.sol";
import "../interfaces/IComplianceModule.sol";
import "../interfaces/ICircuitBreakerModule.sol";
import "../config/AssetConfig.sol";

/**
 * @title AssetToken
 * @dev ERC-20F token with force transfer and circuit breaker integration
 * Layer 2 v3.0 - Compliant with ERC-7518
 * Template contract - deployed per asset
 */
contract AssetToken is ERC20, AccessControl, ReentrancyGuard, IAssetToken {

    // === State Variables ===

    // Layer 1 dependencies
    address public identityRegistry;
    address public complianceModule;
    address public circuitBreaker;

    // Freeze mapping
    mapping(address => bool) private _frozen;

    // Trading halt state
    bool private _tradingHalted;
    uint256 private _limitUpThreshold = 1000; // 10% in basis points
    uint256 private _limitDownThreshold = 1000; // 10% in basis points

    // Force transfer tracking
    struct ForceTransferRecord {
        address from;
        address to;
        uint256 amount;
        address executor;
        bytes32 reasonCode;
        uint256 timestamp;
        bytes32 evidenceHash;
    }

    ForceTransferRecord[] private _forceTransferHistory;

    // Token stats
    uint256 private _totalMinted;
    uint256 private _totalBurned;

    // Roles
    bytes32 public constant REGULATOR_ROLE = keccak256("REGULATOR_ROLE");

    // === Modifiers ===

    modifier onlyRegulator() {
        require(
            hasRole(REGULATOR_ROLE, msg.sender),
            "AssetToken: Caller is not regulator"
        );
        _;
    }

    modifier onlyOperator() {
        require(
            hasRole(AssetConfig.OPERATOR_ROLE, msg.sender),
            "AssetToken: Caller is not operator"
        );
        _;
    }

    modifier whenNotHalted() {
        require(!_tradingHalted, "AssetToken: Trading halted");
        _;
    }

    // === Constructor ===

    constructor(
        string memory name,
        string memory symbol,
        address admin
    ) ERC20(name, symbol) {
        require(admin != address(0), "AssetToken: Admin cannot be zero address");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(AssetConfig.OPERATOR_ROLE, admin);
        _grantRole(AssetConfig.COMPLIANCE_ROLE, admin);
    }

    // === External View Functions ===

    function version() external pure override returns (string memory) {
        return AssetConfig.VERSION;
    }

    function isVerified(address account) external view override returns (bool) {
        if (identityRegistry == address(0)) return true;
        return IIdentityRegistry(identityRegistry).isVerified(account);
    }

    function isFrozen(address account) external view override returns (bool) {
        return _frozen[account];
    }

    function isTradingHalted() external view override returns (bool) {
        return _tradingHalted;
    }

    function totalMinted() external view override returns (uint256) {
        return _totalMinted;
    }

    function totalBurned() external view override returns (uint256) {
        return _totalBurned;
    }

    function getForceTransferCount() external view override returns (uint256) {
        return _forceTransferHistory.length;
    }

    function getForceTransfer(uint256 index) external view override returns (
        address from,
        address to,
        uint256 amount,
        address executor,
        bytes32 reasonCode,
        uint256 timestamp,
        bytes32 evidenceHash
    ) {
        require(index < _forceTransferHistory.length, "AssetToken: Index out of bounds");
        ForceTransferRecord storage record = _forceTransferHistory[index];
        return (
            record.from,
            record.to,
            record.amount,
            record.executor,
            record.reasonCode,
            record.timestamp,
            record.evidenceHash
        );
    }

    // === Override Transfer Functions with Compliance ===

    function _update(address from, address to, uint256 amount) internal override whenNotHalted {
        // Skip checks for mint/burn
        if (from == address(0) || to == address(0)) {
            super._update(from, to, amount);
            return;
        }

        // Check freeze status
        require(!_frozen[from], "AssetToken: Sender frozen");
        require(!_frozen[to], "AssetToken: Recipient frozen");

        // Check identity verification
        require(
            IIdentityRegistry(identityRegistry).isVerified(from),
            "AssetToken: Sender not verified"
        );
        require(
            IIdentityRegistry(identityRegistry).isVerified(to),
            "AssetToken: Recipient not verified"
        );

        // Check circuit breaker price limits
        if (circuitBreaker != address(0)) {
            (bool allowed, string memory reason) = ICircuitBreakerModule(circuitBreaker)
                .checkPriceLimits(address(this), 0);
            require(allowed, string(abi.encodePacked("AssetToken: ", reason)));
        }

        // Check compliance
        if (complianceModule != address(0)) {
            IComplianceModule.ComplianceResult memory result = IComplianceModule(complianceModule)
                .validateTransfer(from, to, amount);
            require(result.isValid, string(abi.encodePacked("AssetToken: Transfer not compliant - code: ", uint256(result.failCode))));
        }

        super._update(from, to, amount);
    }

    // === Mint/Burn Functions ===

    function mint(address to, uint256 amount) external override onlyRole(AssetConfig.OPERATOR_ROLE) returns (bool) {
        require(to != address(0), "AssetToken: Mint to zero address");
        require(
            IIdentityRegistry(identityRegistry).isVerified(to),
            "AssetToken: Recipient not verified"
        );

        _mint(to, amount);
        _totalMinted += amount;

        emit TokensMinted(to, amount);
        return true;
    }

    function burn(uint256 amount) external override {
        _burn(msg.sender, amount);
        _totalBurned += amount;

        emit TokensBurned(msg.sender, amount);
    }

    function burnFrom(address account, uint256 amount) external override {
        _spendAllowance(account, msg.sender, amount);
        _burn(account, amount);
        _totalBurned += amount;

        emit TokensBurned(account, amount);
    }

    // === Force Transfer (ERC-7518) ===

    function forceTransfer(
        address from,
        address to,
        uint256 amount,
        bytes32 reasonCode,
        bytes calldata evidence
    ) external override onlyRegulator nonReentrant {
        require(from != address(0) && to != address(0), "AssetToken: Invalid addresses");
        require(balanceOf(from) >= amount, "AssetToken: Insufficient balance");
        require(AssetConfig.isValidReasonCode(reasonCode), "AssetToken: Invalid reason code");

        // Execute transfer without consent
        _transfer(from, to, amount);

        // Record for audit trail
        bytes32 evidenceHash = keccak256(evidence);
        _forceTransferHistory.push(ForceTransferRecord({
            from: from,
            to: to,
            amount: amount,
            executor: msg.sender,
            reasonCode: reasonCode,
            timestamp: block.timestamp,
            evidenceHash: evidenceHash
        }));

        emit ForceTransferred(from, to, amount, reasonCode);
    }

    // === Freeze/Unfreeze ===

    function freezeAddress(address account) external override onlyRole(AssetConfig.COMPLIANCE_ROLE) {
        require(account != address(0), "AssetToken: Cannot freeze zero address");
        _frozen[account] = true;
        emit AddressFrozen(account, true);
    }

    function unfreezeAddress(address account) external override onlyRole(AssetConfig.COMPLIANCE_ROLE) {
        _frozen[account] = false;
        emit AddressFrozen(account, false);
    }

    // === Circuit Breaker Functions ===

    function haltTrading(bytes32 reason) external override onlyRegulator {
        _tradingHalted = true;
        emit TradingHalted(block.timestamp, msg.sender, reason);
    }

    function resumeTrading() external override onlyRegulator {
        _tradingHalted = false;
        emit TradingResumed(block.timestamp, msg.sender);
    }

    function setPriceLimits(
        uint256 limitUpBps,
        uint256 limitDownBps
    ) external override onlyOperator {
        require(limitUpBps <= 5000, "AssetToken: Limit up too high");
        require(limitDownBps <= 5000, "AssetToken: Limit down too high");

        _limitUpThreshold = limitUpBps;
        _limitDownThreshold = limitDownBps;

        emit PriceLimitsSet(limitUpBps, limitDownBps);
    }

    // === Configuration ===

    function setComplianceModule(address newModule) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newModule != address(0), "AssetToken: Invalid compliance module");
        complianceModule = newModule;
    }

    function setIdentityRegistry(address newRegistry) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newRegistry != address(0), "AssetToken: Invalid identity registry");
        identityRegistry = newRegistry;
    }

    function setCircuitBreaker(address newCircuitBreaker) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        circuitBreaker = newCircuitBreaker;
    }
}
