// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IComplianceGate
 * @dev Interface for Pre-Trade Compliance Validation
 */
interface IComplianceGate {
    // ============ Events ============
    event UserAuthorized(address indexed user);
    event UserDeauthorized(address indexed user);
    event AddressSanctioned(address indexed address_);
    event AddressUnsanctioned(address indexed address_);
    event TokenFrozen(address indexed token);
    event TokenUnfrozen(address indexed token);
    event ComplianceConfigured(address identityRegistry, address complianceModule);
    event TradeLimitSet(uint256 maxTrade, uint256 dailyLimit);

    // ============ Compliance Functions ============
    function checkCompliance(
        address user,
        address token,
        uint256 amount
    ) external view returns (bool, string memory);

    function preTradeCheck(
        address trader,
        address baseToken,
        address quoteToken,
        uint256 amount,
        uint256 price
    ) external view returns (bool, string memory);

    function postTradeUpdate(address trader, uint256 amount) external;

    function batchCheckCompliance(
        address[] calldata users,
        address token,
        uint256 amount
    ) external view returns (bool[] memory results, string[] memory reasons);

    // ============ View Functions ============
    function authorizedUsers(address user) external view returns (bool);

    function sanctionedAddresses(address address_) external view returns (bool);

    function frozenTokens(address token) external view returns (bool);

    function frozenAssets(address asset) external view returns (bool);

    function identityRegistry() external view returns (address);

    function complianceModule() external view returns (address);

    function maxTradeAmount() external view returns (uint256);

    function dailyTradeLimit() external view returns (uint256);

    function dailyTradeVolume(address user) external view returns (uint256);

    function lastTradeDay(address user) external view returns (uint256);

    // ============ Admin Functions ============
    function authorizeUser(address user) external;

    function deauthorizeUser(address user) external;

    function sanctionAddress(address address_) external;

    function unsanctionAddress(address address_) external;

    function freezeToken(address token) external;

    function unfreezeToken(address token) external;

    function freezeAsset(address asset) external;

    function unfreezeAsset(address asset) external;

    function setComplianceConfig(address _identityRegistry, address _complianceModule) external;

    function setTradeLimits(uint256 _maxTrade, uint256 _dailyLimit) external;
}
