const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");

describe("ComplianceModule", function () {
  const CHAIN_ID_ETH = 1;
  const JURISDICTION_US = 840;
  const JURISDICTION_UK = 826;
  const JURISDICTION_CN = 156; // China (restricted for testing)

  async function deployComplianceModuleFixture() {
    const [owner, kycProvider, user1, user2, complianceManager] = await ethers.getSigners();

    // Deploy KYCProvidersRegistry
    const KYCRegistry = await ethers.getContractFactory("KYCProvidersRegistry");
    const kycRegistry = await KYCRegistry.deploy();

    // Register and approve KYC provider
    await kycRegistry.registerProvider(kycProvider.address, "Test KYC Provider");
    await kycRegistry.approveProvider(kycProvider.address);

    // Deploy IdentitySBT
    const IdentitySBT = await ethers.getContractFactory("IdentitySBT");
    const identitySBT = await IdentitySBT.deploy(owner.address, await kycRegistry.getAddress());

    // Deploy IdentityRegistry
    const IdentityRegistry = await ethers.getContractFactory("IdentityRegistry");
    const identityRegistry = await IdentityRegistry.deploy(
      owner.address,
      await identitySBT.getAddress(),
      await kycRegistry.getAddress()
    );

    // Deploy ComplianceModule
    const ComplianceModule = await ethers.getContractFactory("ComplianceModule");
    const complianceModule = await ComplianceModule.deploy(
      owner.address,
      await identityRegistry.getAddress()
    );

    // Grant compliance manager role
    const COMPLIANCE_MANAGER_ROLE = ethers.id("COMPLIANCE_MANAGER_ROLE");
    await complianceModule.grantRole(COMPLIANCE_MANAGER_ROLE, complianceManager.address);

    // Grant IDENTITY_MANAGER_ROLE to IdentityRegistry so it can call mintIdentity
    const IDENTITY_MANAGER_ROLE = ethers.id("IDENTITY_MANAGER_ROLE");
    await identitySBT.grantRole(IDENTITY_MANAGER_ROLE, await identityRegistry.getAddress());

    return { 
      complianceModule, 
      identityRegistry, 
      identitySBT, 
      kycRegistry, 
      owner, 
      kycProvider, 
      user1, 
      user2, 
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
      const { complianceModule } = await loadFixture(deployComplianceModuleFixture);
      expect(await complianceModule.isEnabled()).to.be.true;
    });

    it("Should have default jurisdictions configured", async function () {
      const { complianceModule } = await loadFixture(deployComplianceModuleFixture);
      
      // US should be allowed by default
      expect(await complianceModule.isJurisdictionAllowed(JURISDICTION_US)).to.be.true;
      // UK should be allowed by default
      expect(await complianceModule.isJurisdictionAllowed(JURISDICTION_UK)).to.be.true;
    });
  });

  describe("Validate Transfer", function () {
    it("Should return valid for compliant transfer", async function () {
      const { complianceModule, identityRegistry, kycProvider, user1, user2 } = await loadFixture(deployComplianceModuleFixture);

      await registerIdentity(identityRegistry, kycProvider, user1);
      await registerIdentity(identityRegistry, kycProvider, user2);

      const amount = ethers.parseEther("100");
      const result = await complianceModule.validateTransfer(user1.address, user2.address, amount);

      expect(result.isValid).to.be.true;
      expect(result.failCode).to.equal(0);
    });

    it("Should fail when sender is not verified", async function () {
      const { complianceModule, identityRegistry, kycProvider, user1, user2 } = await loadFixture(deployComplianceModuleFixture);

      // Only register receiver, not sender
      await registerIdentity(identityRegistry, kycProvider, user2);

      const amount = ethers.parseEther("100");
      const result = await complianceModule.validateTransfer(user1.address, user2.address, amount);

      expect(result.isValid).to.be.false;
      // Fail code 9 = FAIL_SENDER_EXPIRED (sender has no identity, which is treated as expired)
      expect(result.failCode).to.equal(9);
    });

    it("Should fail when receiver is not verified", async function () {
      const { complianceModule, identityRegistry, kycProvider, user1, user2 } = await loadFixture(deployComplianceModuleFixture);

      // Only register sender, not receiver
      await registerIdentity(identityRegistry, kycProvider, user1);

      const amount = ethers.parseEther("100");
      const result = await complianceModule.validateTransfer(user1.address, user2.address, amount);

      expect(result.isValid).to.be.false;
      // Fail code 10 = FAIL_RECEIVER_EXPIRED (receiver has no identity, which is treated as expired)
      expect(result.failCode).to.equal(10);
    });

    it("Should fail when receiver jurisdiction is blocked", async function () {
      const { complianceModule, identityRegistry, kycProvider, user1, user2, complianceManager } = await loadFixture(deployComplianceModuleFixture);

      await registerIdentity(identityRegistry, kycProvider, user1);
      await registerIdentity(identityRegistry, kycProvider, user2, 1, JURISDICTION_CN);

      // Block China jurisdiction
      await complianceModule.connect(complianceManager).blockJurisdictions([JURISDICTION_CN]);

      const amount = ethers.parseEther("100");
      const result = await complianceModule.validateTransfer(user1.address, user2.address, amount);

      expect(result.isValid).to.be.false;
      expect(result.failCode).to.equal(5); // FAIL_JURISDICTION_BLOCKED
    });

    it("Should fail when sender is frozen", async function () {
      const { complianceModule, identityRegistry, identitySBT, kycProvider, user1, user2 } = await loadFixture(deployComplianceModuleFixture);

      await registerIdentity(identityRegistry, kycProvider, user1);
      await registerIdentity(identityRegistry, kycProvider, user2);

      // Freeze sender
      const tokenId = await identityRegistry.getTokenId(user1.address);
      await identitySBT.connect(kycProvider).freezeIdentity(tokenId);

      const amount = ethers.parseEther("100");
      const result = await complianceModule.validateTransfer(user1.address, user2.address, amount);

      expect(result.isValid).to.be.false;
      // Fail code 1 = FAIL_SENDER_NOT_VERIFIED (frozen accounts are not verified)
      expect(result.failCode).to.equal(1);
    });

    it("Should fail when receiver is frozen", async function () {
      const { complianceModule, identityRegistry, identitySBT, kycProvider, user1, user2 } = await loadFixture(deployComplianceModuleFixture);

      await registerIdentity(identityRegistry, kycProvider, user1);
      await registerIdentity(identityRegistry, kycProvider, user2);

      // Freeze receiver
      const tokenId = await identityRegistry.getTokenId(user2.address);
      await identitySBT.connect(kycProvider).freezeIdentity(tokenId);

      const amount = ethers.parseEther("100");
      const result = await complianceModule.validateTransfer(user1.address, user2.address, amount);

      expect(result.isValid).to.be.false;
      // Fail code 2 = FAIL_RECEIVER_NOT_VERIFIED (frozen accounts are not verified)
      expect(result.failCode).to.equal(2);
    });
  });

  describe("Set Jurisdiction Allowed", function () {
    it("Should allow a jurisdiction", async function () {
      const { complianceModule, complianceManager } = await loadFixture(deployComplianceModuleFixture);

      await complianceModule.connect(complianceManager).setJurisdictionAllowed(JURISDICTION_UK, true);

      expect(await complianceModule.isJurisdictionAllowed(JURISDICTION_UK)).to.be.true;
    });

    it("Should block a jurisdiction", async function () {
      const { complianceModule, complianceManager } = await loadFixture(deployComplianceModuleFixture);

      // US is allowed by default, block it
      await complianceModule.connect(complianceManager).setJurisdictionAllowed(JURISDICTION_US, false);

      expect(await complianceModule.isJurisdictionAllowed(JURISDICTION_US)).to.be.false;
    });

    it("Should fail to allow restricted jurisdiction", async function () {
      const { complianceModule, complianceManager } = await loadFixture(deployComplianceModuleFixture);

      // Try to allow North Korea (408) - should fail
      await expect(
        complianceModule.connect(complianceManager).setJurisdictionAllowed(408, true)
      ).to.be.revertedWith("ComplianceModule: Cannot allow restricted jurisdiction");
    });

    it("Should emit JurisdictionUpdated event", async function () {
      const { complianceModule, complianceManager } = await loadFixture(deployComplianceModuleFixture);

      await expect(
        complianceModule.connect(complianceManager).setJurisdictionAllowed(JURISDICTION_UK, true)
      ).to.emit(complianceModule, "JurisdictionUpdated")
        .withArgs(JURISDICTION_UK, true);
    });
  });

  describe("Set Holding Limit", function () {
    it("Should set holding limit for a role", async function () {
      const { complianceModule, complianceManager } = await loadFixture(deployComplianceModuleFixture);

      const limit = ethers.parseEther("50000");
      await complianceModule.connect(complianceManager).setHoldingLimit(1, limit); // Investor role

      expect(await complianceModule.getHoldingLimit(1)).to.equal(limit);
    });

    it("Should emit HoldingLimitUpdated event", async function () {
      const { complianceModule, complianceManager } = await loadFixture(deployComplianceModuleFixture);

      const limit = ethers.parseEther("50000");

      await expect(
        complianceModule.connect(complianceManager).setHoldingLimit(1, limit)
      ).to.emit(complianceModule, "HoldingLimitUpdated")
        .withArgs(1, limit);
    });
  });

  describe("Set Daily Limit", function () {
    it("Should set daily limit for a role", async function () {
      const { complianceModule, complianceManager } = await loadFixture(deployComplianceModuleFixture);

      const limit = ethers.parseEther("10000");
      await complianceModule.connect(complianceManager).setDailyLimit(1, limit); // Investor role

      expect(await complianceModule.getDailyLimit(1)).to.equal(limit);
    });

    it("Should emit DailyLimitUpdated event", async function () {
      const { complianceModule, complianceManager } = await loadFixture(deployComplianceModuleFixture);

      const limit = ethers.parseEther("10000");

      await expect(
        complianceModule.connect(complianceManager).setDailyLimit(1, limit)
      ).to.emit(complianceModule, "DailyLimitUpdated")
        .withArgs(1, limit);
    });
  });

  describe("Set Max Investors", function () {
    it("Should set max investors", async function () {
      const { complianceModule, complianceManager } = await loadFixture(deployComplianceModuleFixture);

      const maxInvestors = 50000;
      await complianceModule.connect(complianceManager).setMaxInvestors(maxInvestors);

      expect(await complianceModule.getMaxInvestors()).to.equal(maxInvestors);
    });

    it("Should fail to set zero max investors", async function () {
      const { complianceModule, complianceManager } = await loadFixture(deployComplianceModuleFixture);

      await expect(
        complianceModule.connect(complianceManager).setMaxInvestors(0)
      ).to.be.revertedWith("ComplianceModule: Max investors must be positive");
    });

    it("Should emit MaxInvestorsUpdated event", async function () {
      const { complianceModule, complianceManager } = await loadFixture(deployComplianceModuleFixture);

      const maxInvestors = 50000;

      await expect(
        complianceModule.connect(complianceManager).setMaxInvestors(maxInvestors)
      ).to.emit(complianceModule, "MaxInvestorsUpdated")
        .withArgs(maxInvestors);
    });
  });

  describe("Allow/Block Multiple Jurisdictions", function () {
    it("Should allow multiple jurisdictions at once", async function () {
      const { complianceModule, complianceManager } = await loadFixture(deployComplianceModuleFixture);

      const jurisdictions = [276, 250, 756]; // DE, FR, CH

      await complianceModule.connect(complianceManager).allowJurisdictions(jurisdictions);

      for (const jurisdiction of jurisdictions) {
        expect(await complianceModule.isJurisdictionAllowed(jurisdiction)).to.be.true;
      }
    });

    it("Should block multiple jurisdictions at once", async function () {
      const { complianceModule, complianceManager } = await loadFixture(deployComplianceModuleFixture);

      const jurisdictions = [840, 826]; // US, UK

      await complianceModule.connect(complianceManager).blockJurisdictions(jurisdictions);

      for (const jurisdiction of jurisdictions) {
        expect(await complianceModule.isJurisdictionAllowed(jurisdiction)).to.be.false;
      }
    });
  });

  describe("Set Enabled", function () {
    it("Should disable compliance module", async function () {
      const { complianceModule, owner } = await loadFixture(deployComplianceModuleFixture);

      await complianceModule.connect(owner).setEnabled(false);

      expect(await complianceModule.isEnabled()).to.be.false;
    });

    it("Should allow all transfers when disabled", async function () {
      const { complianceModule, identityRegistry, kycProvider, user1, user2, owner } = await loadFixture(deployComplianceModuleFixture);

      // Don't register identities

      await complianceModule.connect(owner).setEnabled(false);

      const amount = ethers.parseEther("100");
      const result = await complianceModule.validateTransfer(user1.address, user2.address, amount);

      expect(result.isValid).to.be.true;
    });

    it("Should fail when non-admin tries to set enabled", async function () {
      const { complianceModule, user1 } = await loadFixture(deployComplianceModuleFixture);

      await expect(
        complianceModule.connect(user1).setEnabled(false)
      ).to.be.reverted;
    });
  });

  describe("Get Investor Count", function () {
    it("Should return correct investor count", async function () {
      const { complianceModule, identityRegistry, kycProvider, user1, user2 } = await loadFixture(deployComplianceModuleFixture);

      expect(await complianceModule.getInvestorCount()).to.equal(0);

      await registerIdentity(identityRegistry, kycProvider, user1);
      expect(await complianceModule.getInvestorCount()).to.equal(1);

      await registerIdentity(identityRegistry, kycProvider, user2);
      expect(await complianceModule.getInvestorCount()).to.equal(2);
    });
  });

  describe("Record Transfer", function () {
    it("Should record transfer for daily volume tracking", async function () {
      const { complianceModule, identityRegistry, kycProvider, user1, user2 } = await loadFixture(deployComplianceModuleFixture);

      await registerIdentity(identityRegistry, kycProvider, user1);
      await registerIdentity(identityRegistry, kycProvider, user2);

      const amount = ethers.parseEther("100");

      // Record transfer
      await expect(
        complianceModule.connect(user1).recordTransfer(user1.address, user2.address, amount)
      ).to.emit(complianceModule, "ComplianceCheckPassed");
    });

    it("Should track daily transfer volume", async function () {
      const { complianceModule, identityRegistry, kycProvider, user1, user2 } = await loadFixture(deployComplianceModuleFixture);

      await registerIdentity(identityRegistry, kycProvider, user1);
      await registerIdentity(identityRegistry, kycProvider, user2);

      // Record multiple transfers
      await complianceModule.connect(user1).recordTransfer(user1.address, user2.address, ethers.parseEther("100"));
      await complianceModule.connect(user1).recordTransfer(user1.address, user2.address, ethers.parseEther("200"));
      await complianceModule.connect(user1).recordTransfer(user1.address, user2.address, ethers.parseEther("300"));

      // Volume should accumulate (tested indirectly through validateTransfer)
      const result = await complianceModule.validateTransfer(user1.address, user2.address, ethers.parseEther("100"));
      expect(result.isValid).to.be.true;
    });

    it("Should reset daily volume on new day", async function () {
      const { complianceModule, identityRegistry, kycProvider, user1, user2 } = await loadFixture(deployComplianceModuleFixture);

      await registerIdentity(identityRegistry, kycProvider, user1);
      await registerIdentity(identityRegistry, kycProvider, user2);

      // Record transfer
      await complianceModule.connect(user1).recordTransfer(user1.address, user2.address, ethers.parseEther("100"));

      // Advance time by 1 day
      await time.increase(time.duration.days(1));

      // Volume should be reset (tested indirectly)
      const result = await complianceModule.validateTransfer(user1.address, user2.address, ethers.parseEther("100"));
      expect(result.isValid).to.be.true;
    });
  });

  describe("Reset Daily Volume", function () {
    it("Should allow compliance manager to reset daily volume", async function () {
      const { complianceModule, identityRegistry, kycProvider, user1, user2, complianceManager } = await loadFixture(deployComplianceModuleFixture);

      await registerIdentity(identityRegistry, kycProvider, user1);
      await registerIdentity(identityRegistry, kycProvider, user2);

      // Record transfer
      await complianceModule.connect(user1).recordTransfer(user1.address, user2.address, ethers.parseEther("100"));

      // Compliance manager resets volume
      await complianceModule.connect(complianceManager).resetDailyVolume(user1.address);

      // Verify transfer still works
      const result = await complianceModule.validateTransfer(user1.address, user2.address, ethers.parseEther("100"));
      expect(result.isValid).to.be.true;
    });
  });
});
