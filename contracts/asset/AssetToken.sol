// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "../interfaces/asset/IAssetToken.sol";
import "../interfaces/identity/IIdentityRegistry.sol";
import "../interfaces/compliance/ICompliance.sol";
import "../interfaces/asset/ICircuitBreakerModule.sol";
import "../utils/AssetConfig.sol";
import "../utils/CRATSConfig.sol";

/**
 * @title AssetToken
 * @dev ERC-20F token with force transfer, freezing, and compliance integration.
 * // Source: ERC-3643 T-REX + ERC-7518 Force Transfer
 */
contract AssetToken is 
    Initializable, 
    ERC20Upgradeable, 
    ERC20PausableUpgradeable, 
    AccessControlUpgradeable, 
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable, 
    IAssetToken 
{
    // === State ===
    address public identityRegistry;
    address public complianceModule;
    address public circuitBreaker;

    mapping(address => bool) private _frozen;

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

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        string memory name,
        string memory symbol,
        address admin,
        address identityRegistry_,
        address complianceModule_,
        address circuitBreaker_
    ) public initializer {
        __ERC20_init(name, symbol);
        __ERC20Pausable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        identityRegistry = identityRegistry_;
        complianceModule = complianceModule_;
        circuitBreaker = circuitBreaker_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(CRATSConfig.COMPLIANCE_ROLE, admin);
        _grantRole(CRATSConfig.REGULATOR_ROLE, admin);
    }

    // === View Functions ===

    function version() external pure override returns (string memory) {
        return AssetConfig.VERSION;
    }

    function isVerified(address account) external view override returns (bool) {
        return IIdentityRegistry(identityRegistry).isVerified(account);
    }

    function isFrozen(address account) external view override returns (bool) {
        return _frozen[account];
    }

    function isTradingHalted() external view override returns (bool) {
        return ICircuitBreakerModule(circuitBreaker).isHalted(address(this));
    }

    function totalMinted() external view override returns (uint256) {
        return totalSupply(); 
    }

    function totalBurned() external pure override returns (uint256) {
        return 0;
    }

    // === Mint/Burn ===

    function mint(address to, uint256 amount) external override onlyRole(DEFAULT_ADMIN_ROLE) returns (bool) {
        require(IIdentityRegistry(identityRegistry).isVerified(to), "AssetToken: recipient not verified");
        _mint(to, amount);
        emit TokensMinted(to, amount);
        return true;
    }

    function burn(uint256 amount) external override {
        _burn(_msgSender(), amount);
        emit TokensBurned(_msgSender(), amount);
    }

    function burnFrom(address account, uint256 amount) external override {
        _spendAllowance(account, _msgSender(), amount);
        _burn(account, amount);
        emit TokensBurned(account, amount);
    }

    // === Regulatory Functions ===

    function forceTransfer(
        address from,
        address to,
        uint256 amount,
        bytes32 reasonCode,
        bytes calldata evidence
    ) external override onlyRole(CRATSConfig.REGULATOR_ROLE) nonReentrant {
        require(balanceOf(from) >= amount, "AssetToken: insufficient balance");
        
        _transfer(from, to, amount);

        _forceTransferHistory.push(ForceTransferRecord({
            from: from,
            to: to,
            amount: amount,
            executor: _msgSender(),
            reasonCode: reasonCode,
            timestamp: block.timestamp,
            evidenceHash: keccak256(evidence)
        }));

        emit ForceTransferred(from, to, amount, reasonCode);
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
        ForceTransferRecord storage r = _forceTransferHistory[index];
        return (r.from, r.to, r.amount, r.executor, r.reasonCode, r.timestamp, r.evidenceHash);
    }

    // === Freezing ===

    function freezeAddress(address account) external override onlyRole(CRATSConfig.COMPLIANCE_ROLE) {
        _frozen[account] = true;
        emit AddressFrozen(account, true);
    }

    function unfreezeAddress(address account) external override onlyRole(CRATSConfig.COMPLIANCE_ROLE) {
        _frozen[account] = false;
        emit AddressFrozen(account, false);
    }

    // === Safety (Circuit Breaker) ===

    function haltTrading(bytes32 reason) external override onlyRole(CRATSConfig.REGULATOR_ROLE) {
        ICircuitBreakerModule(circuitBreaker).activateAssetHalt(address(this), reason, 0);
        _pause();
        emit TradingHalted(block.timestamp, _msgSender(), reason);
    }

    function resumeTrading() external override onlyRole(CRATSConfig.REGULATOR_ROLE) {
        ICircuitBreakerModule(circuitBreaker).deactivateAssetHalt(address(this));
        _unpause();
        emit TradingResumed(block.timestamp, _msgSender());
    }

    function setPriceLimits(uint256 /*limitUpBps*/, uint256 /*limitDownBps*/) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        // Logic delegated to CircuitBreaker if needed
    }

    // === Configuration ===

    function setComplianceModule(address newModule) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        complianceModule = newModule;
    }

    function setIdentityRegistry(address newRegistry) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        identityRegistry = newRegistry;
    }

    function setCircuitBreaker(address newCircuitBreaker) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        circuitBreaker = newCircuitBreaker;
    }

    // === Compliance Hook ===

    function _update(address from, address to, uint256 amount) internal override(ERC20Upgradeable, ERC20PausableUpgradeable) {
        super._update(from, to, amount);

        if (from == address(0) || to == address(0)) return;

        // 1. Freeze Check
        require(!_frozen[from] && !_frozen[to], "AssetToken: address frozen");

        // 2. Circuit Breaker Check
        (bool allowed, string memory message) = ICircuitBreakerModule(circuitBreaker).checkTradingAllowed(address(this));
        require(allowed, message);

        // 3. Compliance Check
        ICompliance.TransferCheckResult memory result = ICompliance(complianceModule).checkTransfer(from, to, amount, address(this));
        require(result.allowed, result.reason);
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
