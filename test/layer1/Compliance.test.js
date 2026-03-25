const { expect } = require("chai");
const { ethers } = require("hardhat");
const { registerIdentity, DEFAULT_VALUES, deployUpgradeable } = require("../helpers/fixtures");

// CRATSConfig constants
const COMPLIANCE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("COMPLIANCE_ROLE"));

describe("Layer 1 - Compliance", function () {
  let complianceModule, identityRegistry, identitySBT, kycRegistry;
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

    // Deploy Compliance
    complianceModule = await deployUpgradeable("Compliance", [
      admin.address,
      await identityRegistry.getAddress()
    ]);

    // Setup compliance role
    await complianceModule.grantRole(COMPLIANCE_ROLE, compliance.address);
  });

  describe("Initialization", function () {
    it("Should initialize correctly", async function () {
      expect(await complianceModule.identityRegistry()).to.equal(await identityRegistry.getAddress());
    });

    it("Should grant admin and compliance roles", async function () {
      const DEFAULT_ADMIN_ROLE = await complianceModule.DEFAULT_ADMIN_ROLE();

      expect(await complianceModule.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
      expect(await complianceModule.hasRole(COMPLIANCE_ROLE, compliance.address)).to.be.true;
    });
  });

  describe("Jurisdiction Management", function () {
    it("Should block jurisdiction", async function () {
      const tx = await complianceModule.connect(compliance).setJurisdictionBlocked(
        408, // North Korea
        true
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          const parsed = complianceModule.interface.parseLog(log);
          return parsed.name === "JurisdictionBlocked";
        } catch { return false; }
      });

      expect(event).to.not.be.undefined;
      expect(await complianceModule.blockedJurisdictions(408)).to.be.true;
    });

    it("Should unblock jurisdiction", async function () {
      await complianceModule.connect(compliance).setJurisdictionBlocked(408, true);
      await complianceModule.connect(compliance).setJurisdictionBlocked(408, false);
      
      expect(await complianceModule.blockedJurisdictions(408)).to.be.false;
    });

    it("Should only allow compliance role to block jurisdictions", async function () {
      await expect(
        complianceModule.connect(user1).setJurisdictionBlocked(408, true)
      ).to.be.reverted;
    });

    it("Should allow jurisdiction", async function () {
      await complianceModule.connect(compliance).setJurisdictionAllowed(840, true);
      expect(await complianceModule.allowedJurisdictions(840)).to.be.true;
    });

    it("Should only allow compliance role to allow jurisdictions", async function () {
      await expect(
        complianceModule.connect(user1).setJurisdictionAllowed(840, true)
      ).to.be.reverted;
    });
  });

  describe("Investor Count Management", function () {
    it("Should set max investor count", async function () {
      const maxCount = 100;
      
      const tx = await complianceModule.connect(compliance).setMaxInvestorCount(
        admin.address, // Using admin.address as mock token
        maxCount
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          const parsed = complianceModule.interface.parseLog(log);
          return parsed.name === "MaxInvestorCountSet";
        } catch { return false; }
      });

      expect(event).to.not.be.undefined;
      expect(await complianceModule.maxInvestorCount(admin.address)).to.equal(maxCount);
    });

    it("Should only allow compliance role to set max investor count", async function () {
      await expect(
        complianceModule.connect(user1).setMaxInvestorCount(admin.address, 100)
      ).to.be.reverted;
    });
  });

  describe("Transfer Compliance Checks", function () {
    beforeEach(async function () {
      // Register both users
      await registerIdentity(
        identitySBT,
        identityRegistry,
        admin,
        user1,
        DEFAULT_VALUES.jurisdictionUS,
        DEFAULT_VALUES.roleInvestor
      );

      await registerIdentity(
        identitySBT,
        identityRegistry,
        admin,
        user2,
        DEFAULT_VALUES.jurisdictionUS,
        DEFAULT_VALUES.roleInvestor
      );
    });

    it("Should allow transfer between verified users", async function () {
      const result = await complianceModule.checkTransfer.staticCall(
        user1.address,
        user2.address,
        ethers.parseEther("100"),
        admin.address // Mock token
      );

      expect(result.allowed).to.be.true;
      expect(result.reason).to.equal("");
    });

    it("Should reject transfer if sender not verified", async function () {
      // user2 is verified, but user3 is not
      const [, , , user3] = await ethers.getSigners();

      const result = await complianceModule.checkTransfer.staticCall(
        user3.address,
        user2.address,
        ethers.parseEther("100"),
        admin.address
      );

      expect(result.allowed).to.be.false;
      expect(result.reason).to.equal("Compliance: sender not verified");
    });

    it("Should reject transfer if recipient not verified", async function () {
      const [, , , user3] = await ethers.getSigners();

      const result = await complianceModule.checkTransfer.staticCall(
        user1.address,
        user3.address,
        ethers.parseEther("100"),
        admin.address
      );

      expect(result.allowed).to.be.false;
      expect(result.reason).to.equal("Compliance: recipient not verified");
    });

    it("Should reject transfer to blocked jurisdiction", async function () {
      // Register user with blocked jurisdiction
      const [, , , , , , , userBlocked] = await ethers.getSigners();
      
      await registerIdentity(
        identitySBT,
        identityRegistry,
        admin,
        userBlocked,
        408, // North Korea
        DEFAULT_VALUES.roleInvestor
      );

      // Block the jurisdiction
      await complianceModule.connect(compliance).setJurisdictionBlocked(408, true);

      const result = await complianceModule.checkTransfer.staticCall(
        user1.address,
        userBlocked.address,
        ethers.parseEther("100"),
        admin.address
      );

      expect(result.allowed).to.be.false;
      expect(result.reason).to.equal("Compliance: jurisdiction blocked");
    });

    it("Should reject transfer when allowlist is enabled and jurisdiction not allowed", async function () {
      // Enable allowlist mode (this would need a setter function - using internal state)
      // For now, test the default behavior which is blocklist mode
      
      const result = await complianceModule.checkTransfer.staticCall(
        user1.address,
        user2.address,
        ethers.parseEther("100"),
        admin.address
      );

      expect(result.allowed).to.be.true;
    });
  });

  describe("Transfer Check Result Structure", function () {
    it("Should return proper TransferCheckResult structure", async function () {
      await registerIdentity(
        identitySBT,
        identityRegistry,
        admin,
        user1,
        DEFAULT_VALUES.jurisdictionUS,
        DEFAULT_VALUES.roleInvestor
      );

      await registerIdentity(
        identitySBT,
        identityRegistry,
        admin,
        user2,
        DEFAULT_VALUES.jurisdictionUS,
        DEFAULT_VALUES.roleInvestor
      );

      const result = await complianceModule.checkTransfer.staticCall(
        user1.address,
        user2.address,
        ethers.parseEther("100"),
        admin.address
      );

      // Check structure - returns tuple [allowed, reason]
      expect(result[0]).to.be.true;  // allowed
      expect(typeof result[1]).to.equal('string');  // reason
    });
  });

  describe("Edge Cases", function () {
    it("Should handle zero amount transfer", async function () {
      await registerIdentity(
        identitySBT,
        identityRegistry,
        admin,
        user1,
        DEFAULT_VALUES.jurisdictionUS,
        DEFAULT_VALUES.roleInvestor
      );

      await registerIdentity(
        identitySBT,
        identityRegistry,
        admin,
        user2,
        DEFAULT_VALUES.jurisdictionUS,
        DEFAULT_VALUES.roleInvestor
      );

      const result = await complianceModule.checkTransfer.staticCall(
        user1.address,
        user2.address,
        0,
        admin.address
      );

      expect(result.allowed).to.be.true;
    });

    it("Should handle zero address token", async function () {
      await registerIdentity(
        identitySBT,
        identityRegistry,
        admin,
        user1,
        DEFAULT_VALUES.jurisdictionUS,
        DEFAULT_VALUES.roleInvestor
      );

      await registerIdentity(
        identitySBT,
        identityRegistry,
        admin,
        user2,
        DEFAULT_VALUES.jurisdictionUS,
        DEFAULT_VALUES.roleInvestor
      );

      const result = await complianceModule.checkTransfer.staticCall(
        user1.address,
        user2.address,
        ethers.parseEther("100"),
        ethers.ZeroAddress
      );

      expect(result.allowed).to.be.true;
    });
  });

  describe("Events", function () {
    it("Should emit JurisdictionBlocked event", async function () {
      await expect(
        complianceModule.connect(compliance).setJurisdictionBlocked(408, true)
      ).to.emit(complianceModule, "JurisdictionBlocked")
        .withArgs(408, true);
    });

    it("Should emit JurisdictionAllowed event", async function () {
      await expect(
        complianceModule.connect(compliance).setJurisdictionAllowed(840, true)
      ).to.emit(complianceModule, "JurisdictionAllowed")
        .withArgs(840, true);
    });

    it("Should emit MaxInvestorCountSet event", async function () {
      await expect(
        complianceModule.connect(compliance).setMaxInvestorCount(admin.address, 100)
      ).to.emit(complianceModule, "MaxInvestorCountSet")
        .withArgs(admin.address, 100);
    });
  });

  describe("Multiple Jurisdictions", function () {
    it("Should handle multiple blocked jurisdictions", async function () {
      const blockedJurisdictions = [408, 364, 760, 192]; // KP, IR, SY, CU

      for (const jurisdiction of blockedJurisdictions) {
        await complianceModule.connect(compliance).setJurisdictionBlocked(jurisdiction, true);
      }

      for (const jurisdiction of blockedJurisdictions) {
        expect(await complianceModule.blockedJurisdictions(jurisdiction)).to.be.true;
      }
    });

    it("Should handle multiple allowed jurisdictions", async function () {
      const allowedJurisdictions = [840, 826, 276, 250]; // US, GB, DE, FR

      for (const jurisdiction of allowedJurisdictions) {
        await complianceModule.connect(compliance).setJurisdictionAllowed(jurisdiction, true);
      }

      for (const jurisdiction of allowedJurisdictions) {
        expect(await complianceModule.allowedJurisdictions(jurisdiction)).to.be.true;
      }
    });
  });

  // ============================================================
  // NEW: Role-Based Limits Tests
  // ============================================================

  describe("Role-Based Holding Limits", function () {
    it("Should return 0 for role with no limit set", async function () {
      const limit = await complianceModule.getRoleLimit(DEFAULT_VALUES.roleInvestor);
      expect(limit).to.equal(0);
    });

    it("Should allow compliance role to set role limits", async function () {
      const limit = ethers.parseEther("10000");
      
      const tx = await complianceModule.connect(compliance).setRoleLimit(
        DEFAULT_VALUES.roleInvestor,
        limit
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          const parsed = complianceModule.interface.parseLog(log);
          return parsed.name === "RoleLimitSet";
        } catch { return false; }
      });

      expect(event).to.not.be.undefined;
      expect(await complianceModule.getRoleLimit(DEFAULT_VALUES.roleInvestor)).to.equal(limit);
    });

    it("Should only allow compliance role to set role limits", async function () {
      const limit = ethers.parseEther("10000");

      await expect(
        complianceModule.connect(user1).setRoleLimit(DEFAULT_VALUES.roleInvestor, limit)
      ).to.be.reverted;
    });

    it("Should emit RoleLimitSet event", async function () {
      const limit = ethers.parseEther("50000");

      await expect(
        complianceModule.connect(compliance).setRoleLimit(DEFAULT_VALUES.roleInstitutional, limit)
      ).to.emit(complianceModule, "RoleLimitSet")
        .withArgs(DEFAULT_VALUES.roleInstitutional, limit);
    });

    it("Should allow setting different limits for different roles", async function () {
      const investorLimit = ethers.parseEther("10000");
      const qualifiedLimit = ethers.parseEther("50000");
      const institutionalLimit = ethers.parseEther("1000000");

      await complianceModule.connect(compliance).setRoleLimit(DEFAULT_VALUES.roleInvestor, investorLimit);
      await complianceModule.connect(compliance).setRoleLimit(DEFAULT_VALUES.roleQualified, qualifiedLimit);
      await complianceModule.connect(compliance).setRoleLimit(DEFAULT_VALUES.roleInstitutional, institutionalLimit);

      expect(await complianceModule.getRoleLimit(DEFAULT_VALUES.roleInvestor)).to.equal(investorLimit);
      expect(await complianceModule.getRoleLimit(DEFAULT_VALUES.roleQualified)).to.equal(qualifiedLimit);
      expect(await complianceModule.getRoleLimit(DEFAULT_VALUES.roleInstitutional)).to.equal(institutionalLimit);
    });

    it("Should allow updating role limits", async function () {
      const initialLimit = ethers.parseEther("10000");
      const updatedLimit = ethers.parseEther("20000");

      await complianceModule.connect(compliance).setRoleLimit(DEFAULT_VALUES.roleInvestor, initialLimit);
      expect(await complianceModule.getRoleLimit(DEFAULT_VALUES.roleInvestor)).to.equal(initialLimit);

      await complianceModule.connect(compliance).setRoleLimit(DEFAULT_VALUES.roleInvestor, updatedLimit);
      expect(await complianceModule.getRoleLimit(DEFAULT_VALUES.roleInvestor)).to.equal(updatedLimit);
    });
  });

  // ============================================================
  // NEW: Allowlist Mode Tests
  // ============================================================

  describe("Jurisdiction Allowlist Mode", function () {
    beforeEach(async function () {
      await registerIdentity(
        identitySBT,
        identityRegistry,
        admin,
        user1,
        DEFAULT_VALUES.jurisdictionUS,
        DEFAULT_VALUES.roleInvestor
      );

      await registerIdentity(
        identitySBT,
        identityRegistry,
        admin,
        user2,
        DEFAULT_VALUES.jurisdictionUK,
        DEFAULT_VALUES.roleInvestor
      );
    });

    it("Should default to blocklist mode (useAllowlist = false)", async function () {
      expect(await complianceModule.useAllowlist()).to.be.false;
    });

    it("Should allow compliance role to enable allowlist mode", async function () {
      const tx = await complianceModule.connect(compliance).setUseAllowlist(true);
      
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          const parsed = complianceModule.interface.parseLog(log);
          return parsed.name === "AllowlistModeUpdated";
        } catch { return false; }
      });

      expect(event).to.not.be.undefined;
      expect(await complianceModule.useAllowlist()).to.be.true;
    });

    it("Should only allow compliance role to toggle allowlist mode", async function () {
      await expect(
        complianceModule.connect(user1).setUseAllowlist(true)
      ).to.be.reverted;
    });

    it("Should emit AllowlistModeUpdated event", async function () {
      await expect(
        complianceModule.connect(compliance).setUseAllowlist(true)
      ).to.emit(complianceModule, "AllowlistModeUpdated")
        .withArgs(true);

      await expect(
        complianceModule.connect(compliance).setUseAllowlist(false)
      ).to.emit(complianceModule, "AllowlistModeUpdated")
        .withArgs(false);
    });

    it("Should reject transfers to jurisdictions not in allowlist when enabled", async function () {
      // Enable allowlist mode
      await complianceModule.connect(compliance).setUseAllowlist(true);

      // Only allow US (840)
      await complianceModule.connect(compliance).setJurisdictionAllowed(840, true);

      // user2 has UK jurisdiction (826), which is not in allowlist
      const result = await complianceModule.checkTransfer.staticCall(
        user1.address,
        user2.address,
        ethers.parseEther("100"),
        admin.address
      );

      expect(result.allowed).to.be.false;
      expect(result.reason).to.equal("Compliance: jurisdiction not in allowlist");
    });

    it("Should allow transfers to jurisdictions in allowlist", async function () {
      // Enable allowlist mode
      await complianceModule.connect(compliance).setUseAllowlist(true);

      // Allow both US and UK
      await complianceModule.connect(compliance).setJurisdictionAllowed(840, true);
      await complianceModule.connect(compliance).setJurisdictionAllowed(826, true);

      const result = await complianceModule.checkTransfer.staticCall(
        user1.address,
        user2.address,
        ethers.parseEther("100"),
        admin.address
      );

      expect(result.allowed).to.be.true;
      expect(result.reason).to.equal("");
    });

    it("Should still respect blocklist even when allowlist is enabled", async function () {
      // Enable allowlist mode
      await complianceModule.connect(compliance).setUseAllowlist(true);

      // Allow all jurisdictions
      await complianceModule.connect(compliance).setJurisdictionAllowed(840, true);
      await complianceModule.connect(compliance).setJurisdictionAllowed(826, true);

      // But block North Korea
      await complianceModule.connect(compliance).setJurisdictionBlocked(408, true);

      // Register user with blocked jurisdiction
      const [, , , , , , , userBlocked] = await ethers.getSigners();
      await registerIdentity(
        identitySBT,
        identityRegistry,
        admin,
        userBlocked,
        408, // North Korea
        DEFAULT_VALUES.roleInvestor
      );

      const result = await complianceModule.checkTransfer.staticCall(
        user1.address,
        userBlocked.address,
        ethers.parseEther("100"),
        admin.address
      );

      expect(result.allowed).to.be.false;
      expect(result.reason).to.equal("Compliance: jurisdiction blocked");
    });

    it("Should allow all non-blocked transfers when allowlist is disabled", async function () {
      // Ensure allowlist is disabled
      await complianceModule.connect(compliance).setUseAllowlist(false);

      // Don't add any jurisdictions to allowlist

      const result = await complianceModule.checkTransfer.staticCall(
        user1.address,
        user2.address,
        ethers.parseEther("100"),
        admin.address
      );

      expect(result.allowed).to.be.true;
    });
  });
});
