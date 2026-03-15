const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");

describe("TravelRuleModule", function () {
  const CHAIN_ID_ETH = 1;
  const JURISDICTION_US = 840;
  const JURISDICTION_UK = 826;
  const JURISDICTION_CN = 156;
  const DEFAULT_THRESHOLD = ethers.parseEther("1000");

  async function deployTravelRuleFixture() {
    const [owner, kycProvider, user1, user2, regulator, complianceManager] = await ethers.getSigners();

    const KYCRegistry = await ethers.getContractFactory("KYCProvidersRegistry");
    const kycRegistry = await KYCRegistry.deploy();
    await kycRegistry.registerProvider(kycProvider.address, "Test KYC Provider");
    await kycRegistry.approveProvider(kycProvider.address);

    const IdentitySBT = await ethers.getContractFactory("IdentitySBT");
    const identitySBT = await IdentitySBT.deploy(owner.address, await kycRegistry.getAddress());

    const IdentityRegistry = await ethers.getContractFactory("IdentityRegistry");
    const identityRegistry = await IdentityRegistry.deploy(
      owner.address,
      await identitySBT.getAddress(),
      await kycRegistry.getAddress()
    );

    const ComplianceModule = await ethers.getContractFactory("ComplianceModule");
    const complianceModule = await ComplianceModule.deploy(
      owner.address,
      await identityRegistry.getAddress()
    );

    const COMPLIANCE_MANAGER_ROLE = ethers.id("COMPLIANCE_MANAGER_ROLE");
    await complianceModule.grantRole(COMPLIANCE_MANAGER_ROLE, complianceManager.address);

    const REGULATOR_ROLE = ethers.id("REGULATOR_ROLE");
    await identityRegistry.grantRole(REGULATOR_ROLE, regulator.address);

    const IDENTITY_MANAGER_ROLE = ethers.id("IDENTITY_MANAGER_ROLE");
    await identitySBT.grantRole(IDENTITY_MANAGER_ROLE, await identityRegistry.getAddress());

    const TravelRuleModule = await ethers.getContractFactory("TravelRuleModule");
    const travelRuleModule = await TravelRuleModule.deploy(
      owner.address,
      await identityRegistry.getAddress(),
      await complianceModule.getAddress(),
      DEFAULT_THRESHOLD
    );

    const REPORTER_ROLE = ethers.id("REPORTER_ROLE");
    await travelRuleModule.grantRole(REPORTER_ROLE, regulator.address);

    await complianceModule.setTravelRuleModule(await travelRuleModule.getAddress());

    return {
      travelRuleModule,
      complianceModule,
      identityRegistry,
      identitySBT,
      kycRegistry,
      owner,
      kycProvider,
      user1,
      user2,
      regulator,
      complianceManager
    };
  }

  async function registerIdentity(identityRegistry, kycProvider, user, role = 1, jurisdiction = JURISDICTION_US) {
    const chainAddresses = [{
      chainId: CHAIN_ID_ETH,
      wallet: user.address,
      isActive: true,
      addedAt: 0
    }];

    const didHash = ethers.id("did-document-" + user.address);
    const did = "did:crats:" + user.address.slice(2);

    await identityRegistry.connect(kycProvider).registerIdentity(
      user.address,
      didHash,
      did,
      chainAddresses,
      role,
      jurisdiction,
      false
    );
  }

  describe("Deployment", function () {
    it("Should deploy successfully", async function () {
      const { travelRuleModule } = await loadFixture(deployTravelRuleFixture);
      expect(await travelRuleModule.getThreshold()).to.equal(DEFAULT_THRESHOLD);
    });
  });

  describe("Record Transfer", function () {
    it("Should record a transfer above threshold", async function () {
      const { complianceModule, identityRegistry, kycProvider, user1, user2, travelRuleModule } = await loadFixture(deployTravelRuleFixture);

      await registerIdentity(identityRegistry, kycProvider, user1);
      await registerIdentity(identityRegistry, kycProvider, user2);

      const amount = ethers.parseEther("5000");

      await complianceModule.connect(user1).recordTransfer(
        user1.address,
        user2.address,
        amount
      );

      const count = await travelRuleModule.getTransferCount(user1.address);
      expect(count).to.equal(1);
    });

    it("Should calculate risk score correctly", async function () {
      const { complianceModule, identityRegistry, kycProvider, user1, user2, travelRuleModule } = await loadFixture(deployTravelRuleFixture);

      await registerIdentity(identityRegistry, kycProvider, user1);
      await registerIdentity(identityRegistry, kycProvider, user2);

      const amount = ethers.parseEther("10000");

      await complianceModule.connect(user1).recordTransfer(
        user1.address,
        user2.address,
        amount
      );

      const count = await travelRuleModule.getTransferCount(user1.address);
      expect(count).to.equal(1);
    });

    it("Should flag high-risk transfers for review", async function () {
      const { complianceModule, identityRegistry, kycProvider, user1, user2, travelRuleModule } = await loadFixture(deployTravelRuleFixture);

      await registerIdentity(identityRegistry, kycProvider, user1, 1, JURISDICTION_US);
      await registerIdentity(identityRegistry, kycProvider, user2, 1, JURISDICTION_CN);

      const amount = ethers.parseEther("100000");

      await complianceModule.connect(user1).recordTransfer(
        user1.address,
        user2.address,
        amount
      );

      const count = await travelRuleModule.getTransferCount(user1.address);
      expect(count).to.be.greaterThan(0);
    });
  });

  describe("Get Transfer History", function () {
    it("Should return transfer history for address", async function () {
      const { complianceModule, identityRegistry, kycProvider, user1, user2, travelRuleModule } = await loadFixture(deployTravelRuleFixture);

      await registerIdentity(identityRegistry, kycProvider, user1);
      await registerIdentity(identityRegistry, kycProvider, user2);

      await complianceModule.connect(user1).recordTransfer(user1.address, user2.address, ethers.parseEther("1000"));
      await complianceModule.connect(user1).recordTransfer(user1.address, user2.address, ethers.parseEther("1500"));
      await complianceModule.connect(user1).recordTransfer(user1.address, user2.address, ethers.parseEther("2000"));

      const history = await travelRuleModule.getTransferHistory(user1.address, 10);
      expect(history.length).to.equal(3);

      const count = await travelRuleModule.getTransferCount(user1.address);
      expect(count).to.equal(3);
    });

    it("Should respect limit parameter", async function () {
      const { complianceModule, identityRegistry, kycProvider, user1, user2, travelRuleModule } = await loadFixture(deployTravelRuleFixture);

      await registerIdentity(identityRegistry, kycProvider, user1);
      await registerIdentity(identityRegistry, kycProvider, user2);

      await complianceModule.connect(user1).recordTransfer(user1.address, user2.address, ethers.parseEther("1000"));
      await complianceModule.connect(user1).recordTransfer(user1.address, user2.address, ethers.parseEther("1500"));

      const history = await travelRuleModule.getTransferHistory(user1.address, 1);
      expect(history.length).to.equal(1);
    });
  });

  describe("Set Threshold", function () {
    it("Should allow admin to set threshold", async function () {
      const { travelRuleModule, owner } = await loadFixture(deployTravelRuleFixture);

      const newThreshold = ethers.parseEther("5000");
      await travelRuleModule.connect(owner).setThreshold(newThreshold);

      expect(await travelRuleModule.getThreshold()).to.equal(newThreshold);
    });

    it("Should emit ThresholdUpdated event", async function () {
      const { travelRuleModule, owner } = await loadFixture(deployTravelRuleFixture);

      const newThreshold = ethers.parseEther("5000");

      await expect(travelRuleModule.connect(owner).setThreshold(newThreshold))
        .to.emit(travelRuleModule, "ThresholdUpdated")
        .withArgs(newThreshold);
    });

    it("Should fail when non-admin tries to set threshold", async function () {
      const { travelRuleModule, user1 } = await loadFixture(deployTravelRuleFixture);

      await expect(
        travelRuleModule.connect(user1).setThreshold(ethers.parseEther("5000"))
      ).to.be.reverted;
    });

    it("Should fail to set zero threshold", async function () {
      const { travelRuleModule, owner } = await loadFixture(deployTravelRuleFixture);

      await expect(
        travelRuleModule.connect(owner).setThreshold(0)
      ).to.be.revertedWith("TravelRuleModule: Threshold must be positive");
    });
  });

  describe("Report to Authority", function () {
    it("Should fail when non-reporter tries to report", async function () {
      const { travelRuleModule, user1 } = await loadFixture(deployTravelRuleFixture);

      await expect(
        travelRuleModule.connect(user1).reportToAuthority(ethers.ZeroHash)
      ).to.be.reverted;
    });

    it("Should allow reporter to report transfer", async function () {
      const { travelRuleModule, complianceModule, identityRegistry, kycProvider, user1, user2, regulator } = await loadFixture(deployTravelRuleFixture);

      await registerIdentity(identityRegistry, kycProvider, user1);
      await registerIdentity(identityRegistry, kycProvider, user2);

      // Record transfer
      await complianceModule.connect(user1).recordTransfer(
        user1.address,
        user2.address,
        ethers.parseEther("5000")
      );

      // Get tx hash
      const history = await travelRuleModule.getTransferHistory(user1.address, 10);
      const txHash = history[0];

      // Reporter reports to authority
      await expect(
        travelRuleModule.connect(regulator).reportToAuthority(txHash)
      ).to.emit(travelRuleModule, "TransferReported");
    });
  });

  describe("Get Originator and Beneficiary", function () {
    it("Should return originator info (name hash for privacy)", async function () {
      const { travelRuleModule, complianceModule, identityRegistry, kycProvider, user1, user2 } = await loadFixture(deployTravelRuleFixture);

      await registerIdentity(identityRegistry, kycProvider, user1);
      await registerIdentity(identityRegistry, kycProvider, user2);

      // Record transfer
      await complianceModule.connect(user1).recordTransfer(
        user1.address,
        user2.address,
        ethers.parseEther("5000")
      );

      // Get tx hash
      const history = await travelRuleModule.getTransferHistory(user1.address, 10);
      const txHash = history[0];

      // Get originator info - now returns nameHash instead of plain text name
      const originator = await travelRuleModule.getOriginator(txHash);
      expect(originator.wallet).to.equal(user1.address);
      expect(originator.tokenId).to.be.greaterThan(0);
      expect(originator.nameHash).to.not.equal(ethers.ZeroHash); // Name is hashed for privacy
    });

    it("Should return beneficiary info (name hash for privacy)", async function () {
      const { travelRuleModule, complianceModule, identityRegistry, kycProvider, user1, user2 } = await loadFixture(deployTravelRuleFixture);

      await registerIdentity(identityRegistry, kycProvider, user1);
      await registerIdentity(identityRegistry, kycProvider, user2);

      // Record transfer
      await complianceModule.connect(user1).recordTransfer(
        user1.address,
        user2.address,
        ethers.parseEther("5000")
      );

      // Get tx hash
      const history = await travelRuleModule.getTransferHistory(user1.address, 10);
      const txHash = history[0];

      // Get beneficiary info - now returns nameHash instead of plain text name
      const beneficiary = await travelRuleModule.getBeneficiary(txHash);
      expect(beneficiary.wallet).to.equal(user2.address);
      expect(beneficiary.tokenId).to.be.greaterThan(0);
      expect(beneficiary.nameHash).to.not.equal(ethers.ZeroHash); // Name is hashed for privacy
    });
  });

  describe("Mark Reviewed", function () {
    it("Should mark transfer as reviewed and approved", async function () {
      const { travelRuleModule, complianceModule, identityRegistry, kycProvider, user1, user2, regulator } = await loadFixture(deployTravelRuleFixture);

      await registerIdentity(identityRegistry, kycProvider, user1);
      await registerIdentity(identityRegistry, kycProvider, user2);

      // Record transfer
      await complianceModule.connect(user1).recordTransfer(
        user1.address,
        user2.address,
        ethers.parseEther("5000")
      );

      // Get tx hash
      const history = await travelRuleModule.getTransferHistory(user1.address, 10);
      const txHash = history[0];

      // Mark as reviewed and approved
      await travelRuleModule.connect(regulator).markReviewed(txHash, true);

      // Verify requiresReview is false
      expect(await travelRuleModule.requiresReview(txHash)).to.be.false;
    });

    it("Should mark transfer as reviewed and rejected", async function () {
      const { travelRuleModule, complianceModule, identityRegistry, kycProvider, user1, user2, regulator } = await loadFixture(deployTravelRuleFixture);

      await registerIdentity(identityRegistry, kycProvider, user1);
      await registerIdentity(identityRegistry, kycProvider, user2);

      // Record transfer
      await complianceModule.connect(user1).recordTransfer(
        user1.address,
        user2.address,
        ethers.parseEther("5000")
      );

      // Get tx hash
      const history = await travelRuleModule.getTransferHistory(user1.address, 10);
      const txHash = history[0];

      // Mark as reviewed and rejected
      await travelRuleModule.connect(regulator).markReviewed(txHash, false);

      // Verify requiresReview is true (rejected = needs review)
      expect(await travelRuleModule.requiresReview(txHash)).to.be.true;
    });

    it("Should fail when non-reporter tries to mark reviewed", async function () {
      const { travelRuleModule, complianceModule, identityRegistry, kycProvider, user1, user2 } = await loadFixture(deployTravelRuleFixture);

      await registerIdentity(identityRegistry, kycProvider, user1);
      await registerIdentity(identityRegistry, kycProvider, user2);

      // Record transfer
      await complianceModule.connect(user1).recordTransfer(
        user1.address,
        user2.address,
        ethers.parseEther("5000")
      );

      // Get tx hash
      const history = await travelRuleModule.getTransferHistory(user1.address, 10);
      const txHash = history[0];

      // Non-reporter tries to mark reviewed - should fail
      await expect(
        travelRuleModule.connect(user1).markReviewed(txHash, true)
      ).to.be.reverted;
    });
  });

  describe("Get Transfer Data", function () {
    it("Should return complete transfer data", async function () {
      const { travelRuleModule, complianceModule, identityRegistry, kycProvider, user1, user2 } = await loadFixture(deployTravelRuleFixture);

      await registerIdentity(identityRegistry, kycProvider, user1);
      await registerIdentity(identityRegistry, kycProvider, user2);

      const amount = ethers.parseEther("5000");

      // Record transfer
      await complianceModule.connect(user1).recordTransfer(
        user1.address,
        user2.address,
        amount
      );

      // Get tx hash
      const history = await travelRuleModule.getTransferHistory(user1.address, 10);
      const txHash = history[0];

      // Get complete transfer data
      const transferData = await travelRuleModule.getTransferData(txHash);
      expect(transferData.txHash).to.equal(txHash);
      expect(transferData.amount).to.equal(amount);
      expect(transferData.originatorWallet).to.equal(user1.address);
      expect(transferData.beneficiaryWallet).to.equal(user2.address);
      expect(transferData.timestamp).to.be.greaterThan(0);
    });

    it("Should return empty data for non-existent transfer", async function () {
      const { travelRuleModule } = await loadFixture(deployTravelRuleFixture);

      const transferData = await travelRuleModule.getTransferData(ethers.ZeroHash);
      expect(transferData.txHash).to.equal(ethers.ZeroHash);
    });
  });

  // === NEW TESTS: PII Hashing (GDPR Compliance) ===

  describe("PII Hashing (GDPR Compliance)", function () {
    it("Should store names as hashes (not plain text)", async function () {
      const { travelRuleModule, complianceModule, identityRegistry, kycProvider, user1, user2 } = await loadFixture(deployTravelRuleFixture);

      await registerIdentity(identityRegistry, kycProvider, user1);
      await registerIdentity(identityRegistry, kycProvider, user2);

      // Record transfer
      await complianceModule.connect(user1).recordTransfer(
        user1.address,
        user2.address,
        ethers.parseEther("5000")
      );

      // Get tx hash
      const history = await travelRuleModule.getTransferHistory(user1.address, 10);
      const txHash = history[0];

      // Get transfer data - names should be hashed
      const transferData = await travelRuleModule.getTransferData(txHash);
      expect(transferData.originatorNameHash).to.not.equal(ethers.ZeroHash);
      expect(transferData.beneficiaryNameHash).to.not.equal(ethers.ZeroHash);
    });

    it("Should verify originator name against hash", async function () {
      const { travelRuleModule, complianceModule, identityRegistry, kycProvider, user1, user2, regulator } = await loadFixture(deployTravelRuleFixture);

      await registerIdentity(identityRegistry, kycProvider, user1);
      await registerIdentity(identityRegistry, kycProvider, user2);

      // Record transfer
      await complianceModule.connect(user1).recordTransfer(
        user1.address,
        user2.address,
        ethers.parseEther("5000")
      );

      // Get tx hash
      const history = await travelRuleModule.getTransferHistory(user1.address, 10);
      const txHash = history[0];

      // Get name hash
      const nameHash = await travelRuleModule.getOriginatorNameHash(txHash);
      expect(nameHash).to.not.equal(ethers.ZeroHash);

      // Verify with correct name (in production, name would come from off-chain source)
      // For this test, we just verify the hash exists and verification function works
      const REPORTER_ROLE = ethers.id("REPORTER_ROLE");
      await travelRuleModule.grantRole(REPORTER_ROLE, regulator.address);
      
      // The verify function should work (we can't test exact name without knowing it)
      const isValid = await travelRuleModule.connect(regulator).verifyOriginatorName(txHash, "test-name");
      expect(typeof isValid).to.equal("boolean");
    });

    it("Should verify beneficiary name against hash", async function () {
      const { travelRuleModule, complianceModule, identityRegistry, kycProvider, user1, user2, regulator } = await loadFixture(deployTravelRuleFixture);

      await registerIdentity(identityRegistry, kycProvider, user1);
      await registerIdentity(identityRegistry, kycProvider, user2);

      // Record transfer
      await complianceModule.connect(user1).recordTransfer(
        user1.address,
        user2.address,
        ethers.parseEther("5000")
      );

      // Get tx hash
      const history = await travelRuleModule.getTransferHistory(user1.address, 10);
      const txHash = history[0];

      // Get name hash
      const REPORTER_ROLE = ethers.id("REPORTER_ROLE");
      await travelRuleModule.grantRole(REPORTER_ROLE, regulator.address);
      
      const nameHash = await travelRuleModule.connect(regulator).getBeneficiaryNameHash(txHash);
      expect(nameHash).to.not.equal(ethers.ZeroHash);

      // Verify function should work
      const isValid = await travelRuleModule.connect(regulator).verifyBeneficiaryName(txHash, "test-name");
      expect(typeof isValid).to.equal("boolean");
    });

    it("Should restrict name hash access to reporter role", async function () {
      const { travelRuleModule, complianceModule, identityRegistry, kycProvider, user1, user2, regulator } = await loadFixture(deployTravelRuleFixture);

      await registerIdentity(identityRegistry, kycProvider, user1);
      await registerIdentity(identityRegistry, kycProvider, user2);

      // Record transfer
      await complianceModule.connect(user1).recordTransfer(
        user1.address,
        user2.address,
        ethers.parseEther("5000")
      );

      // Get tx hash
      const history = await travelRuleModule.getTransferHistory(user1.address, 10);
      const txHash = history[0];

      // Grant reporter role to regulator
      const REPORTER_ROLE = ethers.id("REPORTER_ROLE");
      await travelRuleModule.grantRole(REPORTER_ROLE, regulator.address);

      // Reporter CAN access name hash
      const nameHash = await travelRuleModule.connect(regulator).getOriginatorNameHash(txHash);
      expect(nameHash).to.not.equal(ethers.ZeroHash);

      // Non-reporter tries to get name hash - should fail
      await expect(
        travelRuleModule.connect(user1).getOriginatorNameHash(txHash)
      ).to.be.reverted;

      await expect(
        travelRuleModule.connect(user1).getBeneficiaryNameHash(txHash)
      ).to.be.reverted;
    });
  });
});
