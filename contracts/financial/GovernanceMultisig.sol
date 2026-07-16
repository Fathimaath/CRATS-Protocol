// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Multicall.sol";

contract GovernanceMultisig is AccessControl, Multicall {
    bytes32 public constant SIGNER_ROLE = keccak256("SIGNER_ROLE");
    bytes32 public constant PROPOSER_ROLE = keccak256("PROPOSER_ROLE");

    uint256 public requiredSigners;
    uint256 public totalSigners;
    uint256 public timelockDelay; // Delay in seconds (e.g. 48 hours)

    struct Operation {
        address target;
        bytes callData;
        uint256 value;
        uint256 timelockExpiry;
        bool executed;
        uint256 approvalsCount;
    }

    mapping(bytes32 => Operation) public operations;
    mapping(bytes32 => mapping(address => bool)) public operationSignatures;
    
    address public emergencyGuardian;

    event OperationProposed(bytes32 indexed opHash, address target, bytes callData, uint256 timelockExpiry);
    event OperationSigned(bytes32 indexed opHash, address signer, uint256 sigCount);
    event OperationExecuted(bytes32 indexed opHash, address executor);
    event EmergencyPaused(address indexed target, address guardian, uint256 timestamp);

    constructor(
        address admin,
        address[] memory signers,
        uint256 _requiredSigners,
        uint256 _timelockDelay,
        address _emergencyGuardian
    ) {
        require(_requiredSigners <= signers.length, "Multisig: threshold too high");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PROPOSER_ROLE, admin);

        for (uint256 i = 0; i < signers.length; i++) {
            _grantRole(SIGNER_ROLE, signers[i]);
        }

        requiredSigners = _requiredSigners;
        totalSigners = signers.length;
        timelockDelay = _timelockDelay;
        emergencyGuardian = _emergencyGuardian;
    }

    function proposeOperation(
        address target,
        bytes calldata callData,
        uint256 value
    ) external onlyRole(PROPOSER_ROLE) returns (bytes32 opHash) {
        opHash = keccak256(abi.encodePacked(target, callData, value, block.timestamp));
        require(operations[opHash].target == address(0), "Multisig: already proposed");

        uint256 expiry = block.timestamp + timelockDelay;
        operations[opHash] = Operation({
            target: target,
            callData: callData,
            value: value,
            timelockExpiry: expiry,
            executed: false,
            approvalsCount: 0
        });

        emit OperationProposed(opHash, target, callData, expiry);
    }

    function signOperation(bytes32 opHash) external onlyRole(SIGNER_ROLE) {
        Operation storage op = operations[opHash];
        require(op.target != address(0), "Multisig: operation not found");
        require(!op.executed, "Multisig: already executed");
        require(!operationSignatures[opHash][msg.sender], "Multisig: already signed");

        operationSignatures[opHash][msg.sender] = true;
        op.approvalsCount++;

        emit OperationSigned(opHash, msg.sender, op.approvalsCount);
    }

    function executeOperation(bytes32 opHash) external payable {
        Operation storage op = operations[opHash];
        require(op.target != address(0), "Multisig: operation not found");
        require(!op.executed, "Multisig: already executed");
        require(block.timestamp >= op.timelockExpiry, "Multisig: timelock not expired");
        require(op.approvalsCount >= requiredSigners, "Multisig: insufficient signers");

        op.executed = true;

        (bool success, ) = op.target.call{value: op.value}(op.callData);
        require(success, "Multisig: call execution failed");

        emit OperationExecuted(opHash, msg.sender);
    }

    function hasApproval(bytes32 opHash) external view returns (bool) {
        Operation memory op = operations[opHash];
        return op.approvalsCount >= requiredSigners;
    }

    function setEmergencyGuardian(address newGuardian) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emergencyGuardian = newGuardian;
    }

    function setTimelockDelay(uint256 delay) external onlyRole(DEFAULT_ADMIN_ROLE) {
        timelockDelay = delay;
    }

    function emergencyPause(address target) external {
        require(msg.sender == emergencyGuardian, "Multisig: guardian only");
        
        // Simulates calling pause() on the target contract directly if it supports it
        (bool success, ) = target.call(abi.encodeWithSignature("pause()"));
        require(success, "Multisig: pause call failed");

        emit EmergencyPaused(target, msg.sender, block.timestamp);
    }
}
