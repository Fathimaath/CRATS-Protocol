const { expect } = require("chai");
const { ethers } = require("hardhat");
const { registerIdentity, DEFAULT_VALUES, deployUpgradeable } = require("../helpers/fixtures");

// CRATSConfig constants
const COMPLIANCE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("COMPLIANCE_ROLE"));
const REGULATOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("REGULATOR_ROLE"));

describe("Layer 1 - TravelRuleModule", function () {
  let travelRuleModule, identityRegistry, identitySBT, kycRegistry;
  let admin, user1, user2, compliance, regulator;

  beforeEach(async function () {
    [admin, user1, user2, , , compliance, , regulator] = await ethers.getSigners();

    // Deploy KYCProvidersRegistry
    kycRegistry = await deployUpgradeable("KYCProvidersRegistry", [admin.address]);

    // Deploy IdentitySBT
    identitySBT = await deployUpgradeable("IdentitySBT", ["CRATS Identity", "CRATSID", admin.address]);

    // Deploy IdentityRegistry
    identityRegistry = await deployUpgradeable("IdentityRegistry", [
      admin.address,
      await identitySBT.getAddress(),
      await kycRegistry.getAddress()
    ]);

    // Deploy TravelRuleModule (with threshold parameter)
    const defaultThreshold = ethers.parseEther("1000"); // FATF default threshold
    travelRuleModule = await deployUpgradeable("TravelRuleModule", [
      admin.address,
      await identityRegistry.getAddress(),
      defaultThreshold
    ]);

    // Setup roles
    await travelRuleModule.grantRole(COMPLIANCE_ROLE, compliance.address);
    await travelRuleModule.grantRole(REGULATOR_ROLE, regulator.address);
  });

  describe("Initialization", function () {
    it("Should initialize correctly", async function () {
      expect(await travelRuleModule.identityRegistry()).to.equal(await identityRegistry.getAddress());
    });

    it("Should grant admin and compliance roles", async function () {
      const DEFAULT_ADMIN_ROLE = await travelRuleModule.DEFAULT_ADMIN_ROLE();

      expect(await travelRuleModule.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
      expect(await travelRuleModule.hasRole(COMPLIANCE_ROLE, compliance.address)).to.be.true;
      expect(await travelRuleModule.hasRole(REGULATOR_ROLE, regulator.address)).to.be.true;
    });
  });

  describe("Record Transfer", function () {
    let txHash, originatorIdentityHash, beneficiaryIdentityHash;

    beforeEach(async function () {
      txHash = ethers.keccak256(ethers.toUtf8Bytes("tx-001"));
      originatorIdentityHash = ethers.keccak256(ethers.toUtf8Bytes("originator-identity"));
      beneficiaryIdentityHash = ethers.keccak256(ethers.toUtf8Bytes("beneficiary-identity"));
    });

    it("Should record transfer successfully", async function () {
      const tx = await travelRuleModule.connect(compliance).recordTransfer(
        txHash,
        admin.address, // tokenContract
        ethers.parseEther("1000"), // amount
        user1.address, // fromWallet
        user2.address, // toWallet
        originatorIdentityHash,
        beneficiaryIdentityHash,
        ethers.keccak256(ethers.toUtf8Bytes("originator-account")),
        ethers.keccak256(ethers.toUtf8Bytes("beneficiary-account")),
        50, // riskScore (0-100)
        false // requiresReview
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          const parsed = travelRuleModule.interface.parseLog(log);
          return parsed.name === "TransferRecorded";
        } catch { return false; }
      });

      expect(event).to.not.be.undefined;
      expect(event.args.tokenContract).to.equal(admin.address);
      expect(event.args.amount).to.equal(ethers.parseEther("1000"));
    });

    it("Should only allow compliance role to record transfers", async function () {
      await expect(
        travelRuleModule.connect(user1).recordTransfer(
          txHash,
          admin.address,
          ethers.parseEther("1000"),
          user1.address,
          user2.address,
          originatorIdentityHash,
          beneficiaryIdentityHash,
          ethers.keccak256(ethers.toUtf8Bytes("originator-account")),
          ethers.keccak256(ethers.toUtf8Bytes("beneficiary-account")),
          50,
          false
        )
      ).to.be.reverted;
    });

    it("Should reject duplicate transaction recording", async function () {
      await travelRuleModule.connect(compliance).recordTransfer(
        txHash,
        admin.address,
        ethers.parseEther("1000"),
        user1.address,
        user2.address,
        originatorIdentityHash,
        beneficiaryIdentityHash,
        ethers.keccak256(ethers.toUtf8Bytes("originator-account")),
        ethers.keccak256(ethers.toUtf8Bytes("beneficiary-account")),
        50,
        false
      );

      await expect(
        travelRuleModule.connect(compliance).recordTransfer(
          txHash,
          admin.address,
          ethers.parseEther("500"),
          user1.address,
          user2.address,
          originatorIdentityHash,
          beneficiaryIdentityHash,
          ethers.keccak256(ethers.toUtf8Bytes("originator-account")),
          ethers.keccak256(ethers.toUtf8Bytes("beneficiary-account")),
          50,
          false
        )
      ).to.be.revertedWith("TravelRule: tx already recorded");
    });

    it("Should store all transfer details correctly", async function () {
      const originatorAccountIdHash = ethers.keccak256(ethers.toUtf8Bytes("originator-account"));
      const beneficiaryAccountIdHash = ethers.keccak256(ethers.toUtf8Bytes("beneficiary-account"));
      const riskScore = 75;
      const requiresReview = true;

      await travelRuleModule.connect(compliance).recordTransfer(
        txHash,
        admin.address,
        ethers.parseEther("1000"),
        user1.address,
        user2.address,
        originatorIdentityHash,
        beneficiaryIdentityHash,
        originatorAccountIdHash,
        beneficiaryAccountIdHash,
        riskScore,
        requiresReview
      );

      const record = await travelRuleModule.getTransfer(txHash);
      
      expect(record.txHash).to.equal(txHash);
      expect(record.tokenContract).to.equal(admin.address);
      expect(record.amount).to.equal(ethers.parseEther("1000"));
      expect(record.originatorIdentityHash).to.equal(originatorIdentityHash);
      expect(record.beneficiaryIdentityHash).to.equal(beneficiaryIdentityHash);
      expect(record.originatorAccountIdHash).to.equal(originatorAccountIdHash);
      expect(record.beneficiaryAccountIdHash).to.equal(beneficiaryAccountIdHash);
      expect(record.riskScore).to.equal(riskScore);
      expect(record.requiresReview).to.be.true;
      expect(record.isReported).to.be.false;
      expect(record.timestamp).to.be.greaterThan(0);
    });
  });

  describe("Get Transfer", function () {
    it("Should return transfer record", async function () {
      const txHash = ethers.keccak256(ethers.toUtf8Bytes("tx-001"));
      
      await travelRuleModule.connect(compliance).recordTransfer(
        txHash,
        admin.address,
        ethers.parseEther("1000"),
        user1.address,
        user2.address,
        ethers.keccak256(ethers.toUtf8Bytes("originator-identity")),
        ethers.keccak256(ethers.toUtf8Bytes("beneficiary-identity")),
        ethers.keccak256(ethers.toUtf8Bytes("originator-account")),
        ethers.keccak256(ethers.toUtf8Bytes("beneficiary-account")),
        50,
        false
      );

      const record = await travelRuleModule.getTransfer(txHash);
      expect(record.txHash).to.equal(txHash);
      expect(record.amount).to.equal(ethers.parseEther("1000"));
    });

    it("Should return empty record for non-existent tx", async function () {
      const nonExistentTxHash = ethers.keccak256(ethers.toUtf8Bytes("non-existent-tx"));
      
      const record = await travelRuleModule.getTransfer(nonExistentTxHash);
      
      // For non-existent records, timestamp will be 0
      expect(record.timestamp).to.equal(0);
    });
  });

  describe("Mark Reported", function () {
    let txHash;

    beforeEach(async function () {
      txHash = ethers.keccak256(ethers.toUtf8Bytes("tx-001"));
      
      await travelRuleModule.connect(compliance).recordTransfer(
        txHash,
        admin.address,
        ethers.parseEther("1000"),
        user1.address,
        user2.address,
        ethers.keccak256(ethers.toUtf8Bytes("originator-identity")),
        ethers.keccak256(ethers.toUtf8Bytes("beneficiary-identity")),
        ethers.keccak256(ethers.toUtf8Bytes("originator-account")),
        ethers.keccak256(ethers.toUtf8Bytes("beneficiary-account")),
        50,
        false
      );
    });

    it("Should mark transfer as reported", async function () {
      await travelRuleModule.connect(regulator).markReported(txHash);
      
      const record = await travelRuleModule.getTransfer(txHash);
      expect(record.isReported).to.be.true;
    });

    it("Should only allow regulator role to mark as reported", async function () {
      await expect(
        travelRuleModule.connect(user1).markReported(txHash)
      ).to.be.reverted;
    });

    it("Should allow marking multiple transfers as reported", async function () {
      const txHash2 = ethers.keccak256(ethers.toUtf8Bytes("tx-002"));
      
      await travelRuleModule.connect(compliance).recordTransfer(
        txHash2,
        admin.address,
        ethers.parseEther("500"),
        user1.address,
        user2.address,
        ethers.keccak256(ethers.toUtf8Bytes("originator-identity")),
        ethers.keccak256(ethers.toUtf8Bytes("beneficiary-identity")),
        ethers.keccak256(ethers.toUtf8Bytes("originator-account")),
        ethers.keccak256(ethers.toUtf8Bytes("beneficiary-account")),
        50,
        false
      );

      await travelRuleModule.connect(regulator).markReported(txHash);
      await travelRuleModule.connect(regulator).markReported(txHash2);
      
      const record1 = await travelRuleModule.getTransfer(txHash);
      const record2 = await travelRuleModule.getTransfer(txHash2);
      
      expect(record1.isReported).to.be.true;
      expect(record2.isReported).to.be.true;
    });
  });

  describe("Risk Score Tracking", function () {
    it("Should record transfers with different risk scores", async function () {
      const lowRiskTx = ethers.keccak256(ethers.toUtf8Bytes("low-risk-tx"));
      const highRiskTx = ethers.keccak256(ethers.toUtf8Bytes("high-risk-tx"));
      
      await travelRuleModule.connect(compliance).recordTransfer(
        lowRiskTx,
        admin.address,
        ethers.parseEther("100"),
        user1.address,
        user2.address,
        ethers.keccak256(ethers.toUtf8Bytes("originator-identity")),
        ethers.keccak256(ethers.toUtf8Bytes("beneficiary-identity")),
        ethers.keccak256(ethers.toUtf8Bytes("originator-account")),
        ethers.keccak256(ethers.toUtf8Bytes("beneficiary-account")),
        20, // Low risk
        false
      );

      await travelRuleModule.connect(compliance).recordTransfer(
        highRiskTx,
        admin.address,
        ethers.parseEther("10000"),
        user1.address,
        user2.address,
        ethers.keccak256(ethers.toUtf8Bytes("originator-identity")),
        ethers.keccak256(ethers.toUtf8Bytes("beneficiary-identity")),
        ethers.keccak256(ethers.toUtf8Bytes("originator-account")),
        ethers.keccak256(ethers.toUtf8Bytes("beneficiary-account")),
        90, // High risk
        true // Requires review
      );

      const lowRiskRecord = await travelRuleModule.getTransfer(lowRiskTx);
      const highRiskRecord = await travelRuleModule.getTransfer(highRiskTx);
      
      expect(lowRiskRecord.riskScore).to.equal(20);
      expect(lowRiskRecord.requiresReview).to.be.false;
      expect(highRiskRecord.riskScore).to.equal(90);
      expect(highRiskRecord.requiresReview).to.be.true;
    });
  });

  describe("FATF R.16 Compliance", function () {
    it("Should store identity hashes (not PII) for FATF compliance", async function () {
      // FATF Recommendation 16 requires originator and beneficiary information
      // But only hashes should be stored on-chain, not actual PII
      
      const originatorName = "John Doe";
      const originatorAccount = "ACC123456";
      
      const nameHash = ethers.keccak256(ethers.toUtf8Bytes(originatorName));
      const accountHash = ethers.keccak256(ethers.toUtf8Bytes(originatorAccount));
      
      const txHash = ethers.keccak256(ethers.toUtf8Bytes("fatf-compliant-tx"));
      
      await travelRuleModule.connect(compliance).recordTransfer(
        txHash,
        admin.address,
        ethers.parseEther("1000"),
        user1.address,
        user2.address,
        nameHash, // Hash of name, not actual name
        ethers.keccak256(ethers.toUtf8Bytes("beneficiary")),
        accountHash, // Hash of account, not actual account
        ethers.keccak256(ethers.toUtf8Bytes("beneficiary-account")),
        50,
        false
      );

      const record = await travelRuleModule.getTransfer(txHash);
      
      // Verify only hashes are stored
      expect(record.originatorIdentityHash).to.equal(nameHash);
      expect(record.originatorAccountIdHash).to.equal(accountHash);
      
      // Original PII cannot be recovered from on-chain data
      expect(record.originatorIdentityHash).to.not.equal(originatorName);
      expect(record.originatorAccountIdHash).to.not.equal(originatorAccount);
    });
  });

  describe("Events", function () {
    it("Should emit TransferRecorded event", async function () {
      const txHash = ethers.keccak256(ethers.toUtf8Bytes("tx-001"));
      
      await expect(
        travelRuleModule.connect(compliance).recordTransfer(
          txHash,
          admin.address,
          ethers.parseEther("1000"),
          user1.address,
          user2.address,
          ethers.keccak256(ethers.toUtf8Bytes("originator-identity")),
          ethers.keccak256(ethers.toUtf8Bytes("beneficiary-identity")),
          ethers.keccak256(ethers.toUtf8Bytes("originator-account")),
          ethers.keccak256(ethers.toUtf8Bytes("beneficiary-account")),
          50,
          false
        )
      ).to.emit(travelRuleModule, "TransferRecorded");
    });
  });

  describe("Multiple Transfers", function () {
    it("Should track multiple transfers for same user", async function () {
      const txHashes = [];
      
      for (let i = 0; i < 5; i++) {
        const txHash = ethers.keccak256(ethers.toUtf8Bytes(`tx-${i}`));
        txHashes.push(txHash);
        
        await travelRuleModule.connect(compliance).recordTransfer(
          txHash,
          admin.address,
          ethers.parseEther("100"),
          user1.address,
          user2.address,
          ethers.keccak256(ethers.toUtf8Bytes("originator-identity")),
          ethers.keccak256(ethers.toUtf8Bytes("beneficiary-identity")),
          ethers.keccak256(ethers.toUtf8Bytes("originator-account")),
          ethers.keccak256(ethers.toUtf8Bytes("beneficiary-account")),
          50,
          false
        );
      }

      // Verify all transfers are recorded
      for (const txHash of txHashes) {
        const record = await travelRuleModule.getTransfer(txHash);
        expect(record.txHash).to.equal(txHash);
        expect(record.amount).to.equal(ethers.parseEther("100"));
      }
    });
  });

  describe("Edge Cases", function () {
    it("Should handle zero amount transfer", async function () {
      const txHash = ethers.keccak256(ethers.toUtf8Bytes("zero-amount-tx"));
      
      await travelRuleModule.connect(compliance).recordTransfer(
        txHash,
        admin.address,
        0,
        user1.address,
        user2.address,
        ethers.keccak256(ethers.toUtf8Bytes("originator-identity")),
        ethers.keccak256(ethers.toUtf8Bytes("beneficiary-identity")),
        ethers.keccak256(ethers.toUtf8Bytes("originator-account")),
        ethers.keccak256(ethers.toUtf8Bytes("beneficiary-account")),
        50,
        false
      );

      const record = await travelRuleModule.getTransfer(txHash);
      expect(record.amount).to.equal(0);
    });

    it("Should handle same wallet as originator and beneficiary", async function () {
      const txHash = ethers.keccak256(ethers.toUtf8Bytes("self-transfer-tx"));

      await travelRuleModule.connect(compliance).recordTransfer(
        txHash,
        admin.address,
        ethers.parseEther("100"),
        user1.address,
        user1.address, // Same wallet
        ethers.keccak256(ethers.toUtf8Bytes("originator-identity")),
        ethers.keccak256(ethers.toUtf8Bytes("originator-identity")), // Same identity
        ethers.keccak256(ethers.toUtf8Bytes("originator-account")),
        ethers.keccak256(ethers.toUtf8Bytes("originator-account")),
        50,
        false
      );

      const record = await travelRuleModule.getTransfer(txHash);
      expect(record[0]).to.equal(txHash);  // txHash
      expect(record[2]).to.equal(ethers.parseEther("100"));  // amount
    });
  });

  // ============================================================
  // NEW: Travel Rule Threshold Tests (FATF R.16 Compliance)
  // ============================================================

  describe("Travel Rule Threshold", function () {
    it("Should have default threshold after initialization", async function () {
      // Deploy with custom threshold
      const customThreshold = ethers.parseEther("1000");
      travelRuleModule = await deployUpgradeable("TravelRuleModule", [
        admin.address,
        await identityRegistry.getAddress(),
        customThreshold
      ]);

      expect(await travelRuleModule.threshold()).to.equal(customThreshold);
    });

    it("Should allow admin to set threshold", async function () {
      const newThreshold = ethers.parseEther("3000"); // US Travel Rule threshold
      
      const tx = await travelRuleModule.connect(admin).setThreshold(newThreshold);
      const receipt = await tx.wait();
      
      const event = receipt.logs.find(log => {
        try {
          const parsed = travelRuleModule.interface.parseLog(log);
          return parsed.name === "ThresholdUpdated";
        } catch { return false; }
      });

      expect(event).to.not.be.undefined;
      expect(await travelRuleModule.threshold()).to.equal(newThreshold);
    });

    it("Should only allow admin to set threshold", async function () {
      const newThreshold = ethers.parseEther("3000");

      await expect(
        travelRuleModule.connect(user1).setThreshold(newThreshold)
      ).to.be.reverted;

      await expect(
        travelRuleModule.connect(compliance).setThreshold(newThreshold)
      ).to.be.reverted;
    });

    it("Should emit ThresholdUpdated event", async function () {
      const oldThreshold = await travelRuleModule.threshold();
      const newThreshold = ethers.parseEther("5000");

      await expect(
        travelRuleModule.connect(admin).setThreshold(newThreshold)
      ).to.emit(travelRuleModule, "ThresholdUpdated")
        .withArgs(oldThreshold, newThreshold);
    });
  });

  // ============================================================
  // NEW: Transfer History Tests (Regulatory Audit Requirement)
  // ============================================================

  describe("Transfer History Lookup", function () {
    it("Should return empty array for wallet with no transfers", async function () {
      const history = await travelRuleModule.getTransferHistory(user1.address);
      expect(history.length).to.equal(0);
    });

    it("Should track transfers for originator wallet", async function () {
      const txHash1 = ethers.keccak256(ethers.toUtf8Bytes("tx-history-1"));
      const txHash2 = ethers.keccak256(ethers.toUtf8Bytes("tx-history-2"));

      await travelRuleModule.connect(compliance).recordTransfer(
        txHash1,
        admin.address,
        ethers.parseEther("1000"),
        user1.address, // originator
        user2.address,
        ethers.keccak256(ethers.toUtf8Bytes("originator-identity")),
        ethers.keccak256(ethers.toUtf8Bytes("beneficiary-identity")),
        ethers.keccak256(ethers.toUtf8Bytes("originator-account")),
        ethers.keccak256(ethers.toUtf8Bytes("beneficiary-account")),
        50,
        false
      );

      await travelRuleModule.connect(compliance).recordTransfer(
        txHash2,
        admin.address,
        ethers.parseEther("500"),
        user1.address, // originator again
        user2.address,
        ethers.keccak256(ethers.toUtf8Bytes("originator-identity")),
        ethers.keccak256(ethers.toUtf8Bytes("beneficiary-identity")),
        ethers.keccak256(ethers.toUtf8Bytes("originator-account")),
        ethers.keccak256(ethers.toUtf8Bytes("beneficiary-account")),
        50,
        false
      );

      const history = await travelRuleModule.getTransferHistory(user1.address);
      expect(history.length).to.equal(2);
      expect(history[0]).to.equal(txHash1);
      expect(history[1]).to.equal(txHash2);
    });

    it("Should track transfers for beneficiary wallet", async function () {
      const txHash = ethers.keccak256(ethers.toUtf8Bytes("tx-beneficiary"));

      await travelRuleModule.connect(compliance).recordTransfer(
        txHash,
        admin.address,
        ethers.parseEther("1000"),
        user1.address,
        user2.address, // beneficiary
        ethers.keccak256(ethers.toUtf8Bytes("originator-identity")),
        ethers.keccak256(ethers.toUtf8Bytes("beneficiary-identity")),
        ethers.keccak256(ethers.toUtf8Bytes("originator-account")),
        ethers.keccak256(ethers.toUtf8Bytes("beneficiary-account")),
        50,
        false
      );

      const history = await travelRuleModule.getTransferHistory(user2.address);
      expect(history.length).to.equal(1);
      expect(history[0]).to.equal(txHash);
    });

    it("Should track transfer for both originator and beneficiary", async function () {
      const txHash = ethers.keccak256(ethers.toUtf8Bytes("tx-both"));

      await travelRuleModule.connect(compliance).recordTransfer(
        txHash,
        admin.address,
        ethers.parseEther("1000"),
        user1.address,
        user2.address,
        ethers.keccak256(ethers.toUtf8Bytes("originator-identity")),
        ethers.keccak256(ethers.toUtf8Bytes("beneficiary-identity")),
        ethers.keccak256(ethers.toUtf8Bytes("originator-account")),
        ethers.keccak256(ethers.toUtf8Bytes("beneficiary-account")),
        50,
        false
      );

      const history1 = await travelRuleModule.getTransferHistory(user1.address);
      const history2 = await travelRuleModule.getTransferHistory(user2.address);

      expect(history1.length).to.equal(1);
      expect(history2.length).to.equal(1);
      expect(history1[0]).to.equal(history2[0]); // Same txHash
    });

    it("Should only add transfer once for self-transfer", async function () {
      const txHash = ethers.keccak256(ethers.toUtf8Bytes("tx-self"));

      await travelRuleModule.connect(compliance).recordTransfer(
        txHash,
        admin.address,
        ethers.parseEther("1000"),
        user1.address,
        user1.address, // Same wallet
        ethers.keccak256(ethers.toUtf8Bytes("originator-identity")),
        ethers.keccak256(ethers.toUtf8Bytes("originator-identity")),
        ethers.keccak256(ethers.toUtf8Bytes("originator-account")),
        ethers.keccak256(ethers.toUtf8Bytes("originator-account")),
        50,
        false
      );

      const history = await travelRuleModule.getTransferHistory(user1.address);
      expect(history.length).to.equal(1); // Should be 1, not 2
    });

    it("Should get transfer count for wallet", async function () {
      const txHash1 = ethers.keccak256(ethers.toUtf8Bytes("tx-count-1"));
      const txHash2 = ethers.keccak256(ethers.toUtf8Bytes("tx-count-2"));
      const txHash3 = ethers.keccak256(ethers.toUtf8Bytes("tx-count-3"));

      await travelRuleModule.connect(compliance).recordTransfer(
        txHash1, admin.address, ethers.parseEther("100"),
        user1.address, user2.address,
        ethers.keccak256(ethers.toUtf8Bytes("o")), ethers.keccak256(ethers.toUtf8Bytes("b")),
        ethers.keccak256(ethers.toUtf8Bytes("oa")), ethers.keccak256(ethers.toUtf8Bytes("ba")),
        50, false
      );

      await travelRuleModule.connect(compliance).recordTransfer(
        txHash2, admin.address, ethers.parseEther("100"),
        user1.address, user2.address,
        ethers.keccak256(ethers.toUtf8Bytes("o")), ethers.keccak256(ethers.toUtf8Bytes("b")),
        ethers.keccak256(ethers.toUtf8Bytes("oa")), ethers.keccak256(ethers.toUtf8Bytes("ba")),
        50, false
      );

      await travelRuleModule.connect(compliance).recordTransfer(
        txHash3, admin.address, ethers.parseEther("100"),
        user1.address, user2.address,
        ethers.keccak256(ethers.toUtf8Bytes("o")), ethers.keccak256(ethers.toUtf8Bytes("b")),
        ethers.keccak256(ethers.toUtf8Bytes("oa")), ethers.keccak256(ethers.toUtf8Bytes("ba")),
        50, false
      );

      expect(await travelRuleModule.getTransferCount(user1.address)).to.equal(3);
      expect(await travelRuleModule.getTransferCount(user2.address)).to.equal(3);
    });
  });

  // ============================================================
  // NEW: Regulatory Reporting Tests (FATF R.16 Enforcement)
  // ============================================================

  describe("Report to Authority", function () {
    let txHash, authorityHash;

    beforeEach(async function () {
      txHash = ethers.keccak256(ethers.toUtf8Bytes("tx-report"));
      authorityHash = ethers.keccak256(ethers.toUtf8Bytes("authority-finCEN"));

      await travelRuleModule.connect(compliance).recordTransfer(
        txHash,
        admin.address,
        ethers.parseEther("1000"),
        user1.address,
        user2.address,
        ethers.keccak256(ethers.toUtf8Bytes("originator-identity")),
        ethers.keccak256(ethers.toUtf8Bytes("beneficiary-identity")),
        ethers.keccak256(ethers.toUtf8Bytes("originator-account")),
        ethers.keccak256(ethers.toUtf8Bytes("beneficiary-account")),
        50,
        false
      );
    });

    it("Should allow regulator to report transfer to authority", async function () {
      const tx = await travelRuleModule.connect(regulator).reportToAuthority(
        txHash,
        authorityHash
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          const parsed = travelRuleModule.interface.parseLog(log);
          return parsed.name === "ReportedToAuthority";
        } catch { return false; }
      });

      expect(event).to.not.be.undefined;
      expect(event.args.txHash).to.equal(txHash);
      expect(event.args.authorityHash).to.equal(authorityHash);

      const record = await travelRuleModule.getTransfer(txHash);
      expect(record.isReported).to.be.true;
    });

    it("Should only allow regulator to report to authority", async function () {
      await expect(
        travelRuleModule.connect(user1).reportToAuthority(txHash, authorityHash)
      ).to.be.reverted;

      await expect(
        travelRuleModule.connect(compliance).reportToAuthority(txHash, authorityHash)
      ).to.be.reverted;
    });

    it("Should reject reporting non-existent transfer", async function () {
      const fakeTxHash = ethers.keccak256(ethers.toUtf8Bytes("fake-tx"));

      await expect(
        travelRuleModule.connect(regulator).reportToAuthority(fakeTxHash, authorityHash)
      ).to.be.revertedWith("TravelRule: tx not found");
    });

    it("Should reject reporting already reported transfer", async function () {
      await travelRuleModule.connect(regulator).reportToAuthority(txHash, authorityHash);

      await expect(
        travelRuleModule.connect(regulator).reportToAuthority(txHash, authorityHash)
      ).to.be.reverted;
    });

    it("Should increment reported count", async function () {
      const txHash2 = ethers.keccak256(ethers.toUtf8Bytes("tx-report-2"));
      const txHash3 = ethers.keccak256(ethers.toUtf8Bytes("tx-report-3"));

      await travelRuleModule.connect(compliance).recordTransfer(
        txHash2, admin.address, ethers.parseEther("1000"),
        user1.address, user2.address,
        ethers.keccak256(ethers.toUtf8Bytes("o")), ethers.keccak256(ethers.toUtf8Bytes("b")),
        ethers.keccak256(ethers.toUtf8Bytes("oa")), ethers.keccak256(ethers.toUtf8Bytes("ba")),
        50, false
      );

      await travelRuleModule.connect(compliance).recordTransfer(
        txHash3, admin.address, ethers.parseEther("1000"),
        user1.address, user2.address,
        ethers.keccak256(ethers.toUtf8Bytes("o")), ethers.keccak256(ethers.toUtf8Bytes("b")),
        ethers.keccak256(ethers.toUtf8Bytes("oa")), ethers.keccak256(ethers.toUtf8Bytes("ba")),
        50, false
      );

      expect(await travelRuleModule.getReportedCount()).to.equal(0);

      await travelRuleModule.connect(regulator).reportToAuthority(txHash, authorityHash);
      expect(await travelRuleModule.getReportedCount()).to.equal(1);

      await travelRuleModule.connect(regulator).reportToAuthority(txHash2, authorityHash);
      expect(await travelRuleModule.getReportedCount()).to.equal(2);

      await travelRuleModule.connect(regulator).reportToAuthority(txHash3, authorityHash);
      expect(await travelRuleModule.getReportedCount()).to.equal(3);
    });

    it("Should emit ReportedToAuthority event", async function () {
      await expect(
        travelRuleModule.connect(regulator).reportToAuthority(txHash, authorityHash)
      ).to.emit(travelRuleModule, "ReportedToAuthority");
      // Event has 3 args: txHash, authorityHash, timestamp
      // Can't check exact args with .withArgs() because timestamp is dynamic
    });
  });
});
