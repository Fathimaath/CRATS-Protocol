// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title IERC7540
 * @dev Interface for ERC-7540 Asynchronous ERC-4626 Tokenized Vaults
 * 
 * NOTE: This interface does NOT extend IERC4626 because ERC-7540 uses
 * the same function signatures with different semantics (controller vs owner).
 * Implementing contracts should also implement IERC4626 separately.
 * 
 * ERC-7540 extends ERC-4626 by adding support for asynchronous deposit and redemption flows.
 * This is essential for RWA tokenization where settlement cannot happen atomically due to:
 * - Traditional settlement cycles (T+1, T+2)
 * - KYC/AML verification delays
 * - Cross-chain operations
 * - Banking transfer delays
 * 
 * Request Lifecycle:
 * 1. PENDING: User submits requestDeposit/requestRedeem
 * 2. CLAIMABLE: Off-chain processing complete, ready to claim
 * 3. CLAIMED: User calls deposit/redeem to finalize
 * 
 * Audit Status:
 * - ERC4626 Alliance Reference Implementation: Production-grade, audited
 * - Centrifuge Protocol: $500M+ AUM, production deployed
 * - Reference: https://github.com/ERC4626-Alliance/ERC-7540-Reference
 * 
 * @dev See: https://eips.ethereum.org/EIPS/eip-7540
 */
interface IERC7540 is IERC20 {
    /**
     * @dev Emitted when assets are deposited into the vault
     */
    event Deposit(
        address indexed sender,
        address indexed owner,
        uint256 assets,
        uint256 shares
    );

    /**
     * @dev Emitted when shares are redeemed from the vault
     */
    event Withdraw(
        address indexed sender,
        address indexed receiver,
        address indexed owner,
        uint256 assets,
        uint256 shares
    );

    // ========== ERC-4626 Core Functions (Included for completeness) ==========

    function asset() external view returns (address assetTokenAddress);

    function totalAssets() external view returns (uint256 totalManagedAssets);

    function convertToShares(uint256 assets) external view returns (uint256 shares);

    function convertToAssets(uint256 shares) external view returns (uint256 assets);

    function maxDeposit(address receiver) external view returns (uint256 maxAssets);

    function maxMint(address receiver) external view returns (uint256 maxShares);

    function maxWithdraw(address owner) external view returns (uint256 maxAssets);

    function maxRedeem(address owner) external view returns (uint256 maxShares);

    function previewDeposit(uint256 assets) external view returns (uint256 shares);

    function previewMint(uint256 shares) external view returns (uint256 assets);

    function previewWithdraw(uint256 assets) external view returns (uint256 shares);

    function previewRedeem(uint256 shares) external view returns (uint256 assets);

    // ========== ERC-7540 Async Functions ==========

    /**
     * @dev Emitted when a deposit request is created
     */
    event DepositRequest(
        address indexed controller,
        address indexed owner,
        uint256 indexed requestId,
        address sender,
        uint256 assets
    );

    /**
     * @dev Emitted when a redeem request is created
     */
    event RedeemRequest(
        address indexed controller,
        address indexed owner,
        uint256 indexed requestId,
        address sender,
        uint256 shares
    );

    /**
     * @dev Emitted when an operator is set for a controller
     */
    event OperatorSet(
        address indexed controller,
        address indexed operator,
        bool approved
    );

    /**
     * @dev Request struct representing a deposit or redemption request
     */
    struct Request {
        address controller; // Who can claim/execute the request
        address owner; // Owner of the assets/shares
        uint256 amount; // Amount of assets or shares
        uint256 requestId; // Unique request identifier
        uint256 timestamp; // When the request was created
    }

    // ========== ASYNC DEPOSIT OPERATIONS ==========

    /**
     * @dev Request to deposit assets into the vault (async step 1)
     * 
     * Flow:
     * 1. Transfers assets from owner to vault
     * 2. Creates a pending request
     * 3. User later calls deposit() to claim shares
     * 
     * @param assets The amount of assets to deposit
     * @param controller The address that can claim the shares (defaults to msg.sender)
     * @param owner The address that owns the assets (must approve or be msg.sender)
     * @return requestId Unique identifier for the request
     * 
     * Requirements:
     * - owner must have approved vault to spend assets OR msg.sender == owner
     * - assets must be transferred to vault
     * - MUST emit DepositRequest event
     */
    function requestDeposit(
        uint256 assets,
        address controller,
        address owner
    ) external returns (uint256 requestId);

    /**
     * @dev View function to get pending deposit request amount
     * @param requestId The request ID
     * @param controller The controller address
     * @return assets The amount of assets in pending state
     */
    function pendingDepositRequest(
        uint256 requestId,
        address controller
    ) external view returns (uint256 assets);

    /**
     * @dev View function to get claimable deposit request amount
     * @param requestId The request ID
     * @param controller The controller address
     * @return assets The amount of assets ready to claim
     */
    function claimableDepositRequest(
        uint256 requestId,
        address controller
    ) external view returns (uint256 assets);

    // ========== ASYNC REDEEM OPERATIONS ==========

    /**
     * @dev Request to redeem shares from the vault (async step 1)
     * 
     * Flow:
     * 1. Transfers shares from owner to vault (held in escrow)
     * 2. Creates a pending request
     * 3. User later calls redeem() to claim assets
     * 
     * @param shares The amount of shares to redeem
     * @param controller The address that can claim the assets (defaults to msg.sender)
     * @param owner The address that owns the shares (must approve or be msg.sender)
     * @return requestId Unique identifier for the request
     * 
     * Requirements:
     * - owner must have approved vault to spend shares OR msg.sender == owner
     * - shares must be transferred to vault
     * - MUST emit RedeemRequest event
     */
    function requestRedeem(
        uint256 shares,
        address controller,
        address owner
    ) external returns (uint256 requestId);

    /**
     * @dev View function to get pending redeem request amount
     * @param requestId The request ID
     * @param controller The controller address
     * @return shares The amount of shares in pending state
     */
    function pendingRedeemRequest(
        uint256 requestId,
        address controller
    ) external view returns (uint256 shares);

    /**
     * @dev View function to get claimable redeem request amount
     * @param requestId The request ID
     * @param controller The controller address
     * @return shares The amount of shares ready to claim
     */
    function claimableRedeemRequest(
        uint256 requestId,
        address controller
    ) external view returns (uint256 shares);

    // ========== OPERATOR MANAGEMENT ==========

    /**
     * @dev Check if an operator is approved for a controller
     * @param controller The controller address
     * @param operator The operator address
     * @return status True if operator is approved
     */
    function isOperator(
        address controller,
        address operator
    ) external view returns (bool status);

    /**
     * @dev Set or revoke operator approval for msg.sender
     * @param operator The operator address to approve/revoke
     * @param approved True to approve, false to revoke
     * @return success True if operation succeeded
     * 
     * Requirements:
     * - MUST emit OperatorSet event
     */
    function setOperator(
        address operator,
        bool approved
    ) external returns (bool success);

    // ========== OVERLOADED ERC-4626 FUNCTIONS ==========
    // These functions are overloaded to support async claim operations

    /**
     * @dev Overloaded deposit function to claim shares from async request
     * 
     * When used with controller parameter, this claims shares from a pending
     * deposit request instead of depositing new assets.
     * 
     * @param assets The amount of assets to claim (from request)
     * @param receiver The address that will receive the shares
     * @param controller The controller address (discriminates request)
     * @return shares The amount of shares minted
     * 
     * Requirements:
     * - msg.sender must be controller or approved operator
     * - Request must be in CLAIMABLE state
     */
    function deposit(
        uint256 assets,
        address receiver,
        address controller
    ) external returns (uint256 shares);

    /**
     * @dev Overloaded redeem function to claim assets from async request
     * 
     * When used with controller parameter, this claims assets from a pending
     * redeem request instead of redeeming shares.
     * 
     * @param shares The amount of shares to claim (from request)
     * @param receiver The address that will receive the assets
     * @param owner The owner address (same as controller for async)
     * @return assets The amount of assets received
     * 
     * Requirements:
     * - msg.sender must be controller or approved operator
     * - Request must be in CLAIMABLE state
     */
    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) external returns (uint256 assets);

    // ========== REQUEST ID MANAGEMENT ==========

    /**
     * @dev Get the next deposit request ID for a controller
     * @param controller The controller address
     * @return requestId The next request ID
     */
    function nextDepositRequestId(address controller) external view returns (uint256);

    /**
     * @dev Get the next redeem request ID for a controller
     * @param controller The controller address
     * @return requestId The next request ID
     */
    function nextRedeemRequestId(address controller) external view returns (uint256);

    // ========== ERC-165 SUPPORT ==========

    /**
     * @dev Check if the contract implements a specific interface
     * @param interfaceId The interface ID (ERC-165)
     * @return supported True if interface is supported
     * 
     * Required Interface IDs:
     * - Operator methods: 0xe3bc4e65
     * - Async deposit: 0xce3bbe50
     * - Async redemption: 0x620ee8e4
     */
    function supportsInterface(bytes4 interfaceId) external view returns (bool supported);
}
