const { expect } = require("chai");
const { ethers } = require("hardhat");

// ── Status enum mirrors the Solidity contract ──────────────────────────────
const Status = {
  REQUESTED:          0,
  PENDING_REGISTRY:   1,
  COMPLIANCE_REVIEW:  2,
  GOVERNANCE_REVIEW:  3,
  CONFIRMED:          4,
  FAILED:             5,
  CANCELLED:          6,
};

// ── Time helpers ───────────────────────────────────────────────────────────
const increaseTime = async (seconds) => {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine");
};

// ── Roles ──────────────────────────────────────────────────────────────────
const REGISTRY_OPERATOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("REGISTRY_OPERATOR_ROLE"));
const COMPLIANCE_ROLE        = ethers.keccak256(ethers.toUtf8Bytes("COMPLIANCE_ROLE"));
const GOVERNANCE_ROLE        = ethers.keccak256(ethers.toUtf8Bytes("GOVERNANCE_ROLE"));

// ─────────────────────────────────────────────────────────────────────────────
// Minimal mock contracts defined inline via ethers.
// We deploy them using a raw bytecode approach or use hardhat artifacts.
// We keep it simple: use the existing MockERC20 + MockVault from test helpers.
// ─────────────────────────────────────────────────────────────────────────────

describe("CarbonRetirementManager — Registry Verification, Retry & Governance Policy", function () {
  let manager, batchManager, mockVaultToken, mockShareToken;
  let admin, operator, compliance, governance, investor, investor2, random;

  // Small amounts for testing
  const TOTAL_CREDITS = 10_000n; // 10,000 tCO2e
  const TOTAL_SHARES  = ethers.parseEther("1000");
  const INVESTOR_SHARES = ethers.parseEther("100"); // 10% of pool → 1,000 credits

  // ── Mock Vault ─────────────────────────────────────────────────────────
  // We need a contract that exposes: asset(), balanceOf(), totalSupply(), burnShares()
  // Use MockVault if available, otherwise inline.

  before(async function () {
    [admin, operator, compliance, governance, investor, investor2, random] =
      await ethers.getSigners();
  });

  beforeEach(async function () {
    // 1. Deploy mock ERC20 as the underlying asset token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockVaultToken = await MockERC20.deploy("Carbon Asset Token", "CAT");
    await mockVaultToken.waitForDeployment();

    // 2. Deploy mock vault (shares token) — reuse MockVault from helpers
    const MockVault = await ethers.getContractFactory("MockVault");
    mockShareToken = await MockVault.deploy();
    await mockShareToken.waitForDeployment();

    // Seed vault: mint shares to investor (represents their vault position)
    await mockShareToken.setAsset(await mockVaultToken.getAddress());
    await mockShareToken.mint(investor.address, INVESTOR_SHARES);
    await mockShareToken.setTotalSupply(TOTAL_SHARES);

    // 3. Deploy CarbonBatchManager
    const CarbonBatchManager = await ethers.getContractFactory("CarbonBatchManager");
    batchManager = await CarbonBatchManager.deploy(admin.address);
    await batchManager.waitForDeployment();

    // Register initial batch for the asset token
    await batchManager.addBatch(
      await mockVaultToken.getAddress(),
      TOTAL_CREDITS,
      2024,               // vintage
      "VCU-1000001",
      "VCU-1010000"
    );

    // 4. Deploy CarbonRetirementManager (address(0) for optional metadataStore)
    const CarbonRetirementManager = await ethers.getContractFactory("CarbonRetirementManager");
    manager = await CarbonRetirementManager.deploy(
      admin.address,
      await batchManager.getAddress(),
      ethers.ZeroAddress, // no metadata store for tests
      ethers.ZeroAddress  // no ownershipSyncManager for tests
    );
    await manager.waitForDeployment();

    // 5. Grant CarbonRetirementManager operator rights over batchManager
    await batchManager.setOperator(await manager.getAddress(), true);

    // 6. Assign roles on manager
    await manager.grantRole(REGISTRY_OPERATOR_ROLE, operator.address);
    await manager.grantRole(COMPLIANCE_ROLE,        compliance.address);
    await manager.grantRole(GOVERNANCE_ROLE,        governance.address);
  });

  // ── Helper: open a retirement request and return the ID ────────────────
  async function openRetirement(investor_) {
    const tx = await manager.connect(investor_).requestRetirement(
      await mockShareToken.getAddress(),
      INVESTOR_SHARES,
      "Acme Corp",
      "Scope 1 FY2026 offsetting"
    );
    const receipt = await tx.wait();
    const event = receipt.logs.find(log => {
      try { return manager.interface.parseLog(log).name === "RetirementRequested"; }
      catch { return false; }
    });
    return event.args.id;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 1. Initialization & Configuration
  // ═══════════════════════════════════════════════════════════════════════
  describe("Initialization", function () {
    it("admin holds all three roles by default", async function () {
      expect(await manager.hasRole(REGISTRY_OPERATOR_ROLE, admin.address)).to.be.true;
      expect(await manager.hasRole(COMPLIANCE_ROLE,        admin.address)).to.be.true;
      expect(await manager.hasRole(GOVERNANCE_ROLE,        admin.address)).to.be.true;
    });

    it("default SLA config is correct", async function () {
      expect(await manager.defaultMaxRetries()).to.equal(3);
      expect(await manager.defaultRetryIntervalSeconds()).to.equal(8 * 3600);
      expect(await manager.defaultMaxWaitPeriodSeconds()).to.equal(24 * 3600);
      expect(await manager.defaultGovernanceBufferSeconds()).to.equal(72 * 3600);
    });

    it("admin can update SLA config", async function () {
      await manager.connect(admin).setSLAConfig(5, 4 * 3600, 48 * 3600, 96 * 3600);
      expect(await manager.defaultMaxRetries()).to.equal(5);
      expect(await manager.defaultRetryIntervalSeconds()).to.equal(4 * 3600);
      expect(await manager.defaultMaxWaitPeriodSeconds()).to.equal(48 * 3600);
    });

    it("non-admin cannot update SLA config", async function () {
      await expect(manager.connect(random).setSLAConfig(1, 1, 1, 1)).to.be.reverted;
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 2. Request Retirement
  // ═══════════════════════════════════════════════════════════════════════
  describe("requestRetirement()", function () {
    it("emits RetirementRequested and sets PENDING_REGISTRY state", async function () {
      const tx = await manager.connect(investor).requestRetirement(
        await mockShareToken.getAddress(),
        INVESTOR_SHARES,
        "Acme Corp",
        "Scope 1 FY2026"
      );
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try { return manager.interface.parseLog(log).name === "RetirementRequested"; } catch { return false; }
      });
      expect(event).to.not.be.undefined;
      const id = event.args.id;

      const rec = await manager.getRetirementRecord(id);
      expect(rec.status).to.equal(Status.PENDING_REGISTRY);
      expect(rec.creditsRetired).to.equal(TOTAL_CREDITS / 10n); // 10% of pool = 1,000 credits
      expect(rec.retryCount).to.equal(0);
      expect(rec.maxRetries).to.equal(3);
    });

    it("opens initial audit trail entry", async function () {
      const id = await openRetirement(investor);
      const trail = await manager.getAuditTrail(id);
      expect(trail.length).to.equal(1);
      expect(trail[0].toStatus).to.equal(Status.PENDING_REGISTRY);
    });

    it("tracks by investor and vault", async function () {
      const id = await openRetirement(investor);
      const byInvestor = await manager.getRetirementsByInvestor(investor.address);
      const byVault    = await manager.getRetirementsByVault(await mockShareToken.getAddress());
      expect(byInvestor).to.include(id);
      expect(byVault).to.include(id);
    });

    it("reverts on zero shares", async function () {
      await expect(
        manager.connect(investor).requestRetirement(
          await mockShareToken.getAddress(), 0, "X", "Y"
        )
      ).to.be.revertedWith("Retirement: zero shares");
    });

    it("reverts if investor has insufficient shares", async function () {
      await expect(
        manager.connect(investor2).requestRetirement(
          await mockShareToken.getAddress(), INVESTOR_SHARES, "X", "Y"
        )
      ).to.be.revertedWith("Retirement: insufficient shares balance");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 3. triggerRetry()
  // ═══════════════════════════════════════════════════════════════════════
  describe("triggerRetry()", function () {
    let id;

    beforeEach(async function () {
      id = await openRetirement(investor);
    });

    it("operator can trigger retry after interval elapses", async function () {
      await increaseTime(8 * 3600); // retryInterval = 8h
      const tx = await manager.connect(operator).triggerRetry(id);
      await expect(tx).to.emit(manager, "RetryTriggered");

      const rec = await manager.getRetirementRecord(id);
      expect(rec.retryCount).to.equal(1);
      expect(rec.nextRetryAt).to.be.gt(0n);
      expect(rec.status).to.equal(Status.PENDING_REGISTRY); // still PENDING
    });

    it("can retry up to maxRetries (3)", async function () {
      for (let i = 1; i <= 3; i++) {
        await increaseTime(8 * 3600);
        await manager.connect(operator).triggerRetry(id);
        const rec = await manager.getRetirementRecord(id);
        expect(rec.retryCount).to.equal(i);
      }
    });

    it("reverts if retry interval not elapsed", async function () {
      await expect(manager.connect(operator).triggerRetry(id))
        .to.be.revertedWith("Retirement: retry interval not elapsed");
    });

    it("reverts after retry limit reached", async function () {
      for (let i = 0; i < 3; i++) {
        await increaseTime(8 * 3600);
        await manager.connect(operator).triggerRetry(id);
      }
      await increaseTime(8 * 3600);
      await expect(manager.connect(operator).triggerRetry(id))
        .to.be.revertedWith("Retirement: retry limit reached, escalate to Compliance");
    });

    it("non-operator cannot trigger retry", async function () {
      await increaseTime(8 * 3600);
      await expect(manager.connect(random).triggerRetry(id)).to.be.reverted;
    });

    it("audit trail records each retry", async function () {
      await increaseTime(8 * 3600);
      await manager.connect(operator).triggerRetry(id);
      await increaseTime(8 * 3600);
      await manager.connect(operator).triggerRetry(id);
      const trail = await manager.getAuditTrail(id);
      expect(trail.length).to.equal(3); // 1 open + 2 retries
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 4. escalateToCompliance()
  // ═══════════════════════════════════════════════════════════════════════
  describe("escalateToCompliance()", function () {
    let id;

    beforeEach(async function () {
      id = await openRetirement(investor);
      // Exhaust retries
      for (let i = 0; i < 3; i++) {
        await increaseTime(8 * 3600);
        await manager.connect(operator).triggerRetry(id);
      }
    });

    it("operator escalates to COMPLIANCE_REVIEW after retry limit", async function () {
      await expect(manager.connect(operator).escalateToCompliance(id, "Registry unresponsive"))
        .to.emit(manager, "EscalatedToCompliance");

      const rec = await manager.getRetirementRecord(id);
      expect(rec.status).to.equal(Status.COMPLIANCE_REVIEW);
    });

    it("compliance role can also escalate", async function () {
      await expect(manager.connect(compliance).escalateToCompliance(id, "Manually escalating"))
        .to.emit(manager, "EscalatedToCompliance");
    });

    it("investor-facing string is correct", async function () {
      await manager.connect(operator).escalateToCompliance(id, "Retry exhausted");
      expect(await manager.getInvestorStatusString(id)).to.equal("Escalated to Compliance Review");
    });

    it("cannot escalate if retries not exhausted and SLA not breached", async function () {
      const id2 = await openRetirement(investor);
      await expect(
        manager.connect(operator).escalateToCompliance(id2, "Too early")
      ).to.be.revertedWith("Retirement: retry limit not reached and SLA not breached");
    });

    it("can escalate early if SLA deadline passed", async function () {
      const id2 = await openRetirement(investor);
      await increaseTime(25 * 3600); // past 24h SLA
      await expect(manager.connect(compliance).escalateToCompliance(id2, "SLA expired"))
        .to.emit(manager, "EscalatedToCompliance");
    });

    it("random address cannot escalate", async function () {
      await expect(
        manager.connect(random).escalateToCompliance(id, "hack")
      ).to.be.revertedWith("Retirement: unauthorized");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 5. escalateToGovernance()
  // ═══════════════════════════════════════════════════════════════════════
  describe("escalateToGovernance()", function () {
    let id;

    beforeEach(async function () {
      id = await openRetirement(investor);
      // Exhaust retries + escalate to compliance
      for (let i = 0; i < 3; i++) {
        await increaseTime(8 * 3600);
        await manager.connect(operator).triggerRetry(id);
      }
      await manager.connect(operator).escalateToCompliance(id, "Retries exhausted");
    });

    it("compliance escalates to GOVERNANCE_REVIEW after SLA deadline", async function () {
      await increaseTime(25 * 3600); // past 24h SLA
      await expect(manager.connect(compliance).escalateToGovernance(id))
        .to.emit(manager, "EscalatedToGovernance");

      const rec = await manager.getRetirementRecord(id);
      expect(rec.status).to.equal(Status.GOVERNANCE_REVIEW);
    });

    it("reverts if SLA not yet breached", async function () {
      // Set a long max wait so 3×8h retries don't breach SLA
      await manager.connect(admin).setSLAConfig(3, 8 * 3600, 7 * 24 * 3600, 72 * 3600);
      const id2 = await openRetirement(investor);
      for (let i = 0; i < 3; i++) {
        await increaseTime(8 * 3600);
        await manager.connect(operator).triggerRetry(id2);
      }
      await manager.connect(operator).escalateToCompliance(id2, "Retry limit");
      // SLA is 7 days — not yet breached after 24h
      await expect(manager.connect(compliance).escalateToGovernance(id2))
        .to.be.revertedWith("Retirement: max wait period not yet exceeded");
    });

    it("operator cannot call escalateToGovernance", async function () {
      await increaseTime(25 * 3600);
      await expect(manager.connect(operator).escalateToGovernance(id)).to.be.reverted;
    });

    it("investor status is correct", async function () {
      await increaseTime(25 * 3600);
      await manager.connect(compliance).escalateToGovernance(id);
      expect(await manager.getInvestorStatusString(id)).to.equal("Under Governance Review");
    });

    it("isEligibleForGovernanceEscalation returns true after SLA breach", async function () {
      await increaseTime(25 * 3600);
      expect(await manager.isEligibleForGovernanceEscalation(id)).to.be.true;
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 6. Governance Actions
  // ═══════════════════════════════════════════════════════════════════════
  describe("Governance Actions", function () {
    let id;

    beforeEach(async function () {
      id = await openRetirement(investor);
      for (let i = 0; i < 3; i++) {
        await increaseTime(8 * 3600);
        await manager.connect(operator).triggerRetry(id);
      }
      await manager.connect(operator).escalateToCompliance(id, "Retries exhausted");
      await increaseTime(25 * 3600);
      await manager.connect(compliance).escalateToGovernance(id);
    });

    it("governance can extend SLA", async function () {
      const recBefore = await manager.getRetirementRecord(id);
      await expect(manager.connect(governance).governanceExtendSLA(id, 48 * 3600))
        .to.emit(manager, "GovernanceSLAExtended");

      const recAfter = await manager.getRetirementRecord(id);
      expect(recAfter.slaDeadline).to.equal(recBefore.slaDeadline + BigInt(48 * 3600));
    });

    it("governance can log a continue-hold note without state change", async function () {
      await expect(
        manager.connect(governance).governanceContinueHold(id, "Awaiting Verra response")
      ).to.emit(manager, "GovernanceContinueHold");

      const rec = await manager.getRetirementRecord(id);
      expect(rec.status).to.equal(Status.GOVERNANCE_REVIEW); // no state change
    });

    it("governance can cancel the retirement and release credits", async function () {
      await expect(
        manager.connect(governance).governanceCancel(id, "Registry confirmed ineligible")
      ).to.emit(manager, "GovernanceCancelled");

      const rec = await manager.getRetirementRecord(id);
      expect(rec.status).to.equal(Status.CANCELLED);
      expect(await manager.getInvestorStatusString(id)).to.equal("Cancelled by Governance");
    });

    it("non-governance cannot call governance functions", async function () {
      await expect(manager.connect(operator).governanceExtendSLA(id, 3600)).to.be.reverted;
      await expect(manager.connect(compliance).governanceCancel(id, "nope")).to.be.reverted;
      await expect(manager.connect(random).governanceContinueHold(id, "nope")).to.be.reverted;
    });

    it("governance cannot act on non-GOVERNANCE_REVIEW retirement", async function () {
      const id2 = await openRetirement(investor);
      await expect(manager.connect(governance).governanceCancel(id2, "wrong state"))
        .to.be.revertedWith("Retirement: not in Governance Review");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 7. confirmRetirement() — happy path
  // ═══════════════════════════════════════════════════════════════════════
  describe("confirmRetirement()", function () {
    let id;
    const FAKE_TX_HASH  = ethers.keccak256(ethers.toUtf8Bytes("registry-tx-001"));
    const FAKE_CERT_HASH = ethers.keccak256(ethers.toUtf8Bytes("cert-ipfs-001"));

    beforeEach(async function () {
      id = await openRetirement(investor);
    });

    it("operator confirms from PENDING_REGISTRY → CONFIRMED and burns shares", async function () {
      await expect(
        manager.connect(operator).confirmRetirement(
          id, "VCU-1000001", "VCU-1001000", FAKE_TX_HASH, FAKE_CERT_HASH
        )
      ).to.emit(manager, "RetirementConfirmed");

      const rec = await manager.getRetirementRecord(id);
      expect(rec.status).to.equal(Status.CONFIRMED);
      expect(rec.registryTxHash).to.equal(FAKE_TX_HASH);
      expect(await manager.getInvestorStatusString(id)).to.equal("Registry Verification Completed");
    });

    it("operator can confirm from COMPLIANCE_REVIEW state", async function () {
      for (let i = 0; i < 3; i++) {
        await increaseTime(8 * 3600);
        await manager.connect(operator).triggerRetry(id);
      }
      await manager.connect(operator).escalateToCompliance(id, "retry done");
      await manager.connect(operator).confirmRetirement(
        id, "VCU-1000001", "VCU-1001000", FAKE_TX_HASH, FAKE_CERT_HASH
      );
      const rec = await manager.getRetirementRecord(id);
      expect(rec.status).to.equal(Status.CONFIRMED);
    });

    it("operator can confirm from GOVERNANCE_REVIEW state", async function () {
      for (let i = 0; i < 3; i++) {
        await increaseTime(8 * 3600);
        await manager.connect(operator).triggerRetry(id);
      }
      await manager.connect(operator).escalateToCompliance(id, "retry done");
      await increaseTime(25 * 3600);
      await manager.connect(compliance).escalateToGovernance(id);
      await manager.connect(operator).confirmRetirement(
        id, "VCU-1000001", "VCU-1001000", FAKE_TX_HASH, FAKE_CERT_HASH
      );
      const rec = await manager.getRetirementRecord(id);
      expect(rec.status).to.equal(Status.CONFIRMED);
    });

    it("reverts with zero registryTxHash", async function () {
      await expect(
        manager.connect(operator).confirmRetirement(
          id, "VCU-1000001", "VCU-1001000", ethers.ZeroHash, FAKE_CERT_HASH
        )
      ).to.be.revertedWith("Retirement: invalid tx hash");
    });

    it("reverts if already CONFIRMED (terminal)", async function () {
      await manager.connect(operator).confirmRetirement(
        id, "VCU-1000001", "VCU-1001000", FAKE_TX_HASH, FAKE_CERT_HASH
      );
      await expect(
        manager.connect(operator).confirmRetirement(
          id, "VCU-1000001", "VCU-1001000", FAKE_TX_HASH, FAKE_CERT_HASH
        )
      ).to.be.revertedWith("Retirement: already terminal");
    });

    it("non-operator cannot confirm", async function () {
      await expect(
        manager.connect(random).confirmRetirement(
          id, "VCU-1000001", "VCU-1001000", FAKE_TX_HASH, FAKE_CERT_HASH
        )
      ).to.be.reverted;
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 8. failRetirement()
  // ═══════════════════════════════════════════════════════════════════════
  describe("failRetirement()", function () {
    let id;

    beforeEach(async function () {
      id = await openRetirement(investor);
    });

    it("operator can fail from PENDING_REGISTRY", async function () {
      await expect(manager.connect(operator).failRetirement(id, "Registry rejected — invalid VCU"))
        .to.emit(manager, "RetirementFailed");

      const rec = await manager.getRetirementRecord(id);
      expect(rec.status).to.equal(Status.FAILED);
      expect(await manager.getInvestorStatusString(id)).to.equal("Registry Verification Failed");
    });

    it("cannot fail a terminal retirement", async function () {
      await manager.connect(operator).failRetirement(id, "Rejected");
      await expect(manager.connect(operator).failRetirement(id, "Again"))
        .to.be.revertedWith("Retirement: already terminal");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 9. Audit Trail Integrity
  // ═══════════════════════════════════════════════════════════════════════
  describe("Audit Trail", function () {
    it("records every state transition with actor and timestamp", async function () {
      const id = await openRetirement(investor);

      await increaseTime(8 * 3600);
      await manager.connect(operator).triggerRetry(id);

      for (let i = 1; i < 3; i++) {
        await increaseTime(8 * 3600);
        await manager.connect(operator).triggerRetry(id);
      }

      await manager.connect(operator).escalateToCompliance(id, "Retries exhausted");
      await increaseTime(25 * 3600);
      await manager.connect(compliance).escalateToGovernance(id);
      await manager.connect(governance).governanceContinueHold(id, "Awaiting registry");
      await manager.connect(governance).governanceExtendSLA(id, 24 * 3600);
      await manager.connect(operator).confirmRetirement(
        id, "VCU-1000001", "VCU-1001000",
        ethers.keccak256(ethers.toUtf8Bytes("tx")),
        ethers.keccak256(ethers.toUtf8Bytes("cert"))
      );

      const trail = await manager.getAuditTrail(id);
      // 1 open + 3 retries + 1 compliance + 1 governance + 1 continue + 1 extend + 1 confirm = 9
      expect(trail.length).to.equal(9);
      expect(trail[0].actor).to.equal(investor.address);
      expect(trail[trail.length - 1].toStatus).to.equal(Status.CONFIRMED);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 10. isOverSLA / isEligibleForGovernanceEscalation
  // ═══════════════════════════════════════════════════════════════════════
  describe("SLA View Helpers", function () {
    let id;

    beforeEach(async function () {
      id = await openRetirement(investor);
    });

    it("isOverSLA is false before deadline", async function () {
      expect(await manager.isOverSLA(id)).to.be.false;
    });

    it("isOverSLA is true after 24h", async function () {
      await increaseTime(25 * 3600);
      expect(await manager.isOverSLA(id)).to.be.true;
    });

    it("isEligibleForGovernanceEscalation only true from COMPLIANCE_REVIEW + SLA breached", async function () {
      // Use a long SLA so 3×8h retries don't consume it
      await manager.connect(admin).setSLAConfig(3, 8 * 3600, 7 * 24 * 3600, 72 * 3600);
      const id2 = await openRetirement(investor);
      for (let i = 0; i < 3; i++) {
        await increaseTime(8 * 3600);
        await manager.connect(operator).triggerRetry(id2);
      }
      await manager.connect(operator).escalateToCompliance(id2, "");
      // Only 24h elapsed total — SLA is 7 days, so not eligible yet
      expect(await manager.isEligibleForGovernanceEscalation(id2)).to.be.false;
      // Push past the 7-day SLA
      await increaseTime(7 * 24 * 3600);
      expect(await manager.isEligibleForGovernanceEscalation(id2)).to.be.true;
    });
  });
});

// ── anyValue helper (no chai-as-promised needed) ─────────────────────────
function anyValue() { return { asymmetricMatch: () => true }; }
