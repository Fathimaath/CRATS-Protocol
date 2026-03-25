const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployUpgradeable } = require("../helpers/fixtures");

describe("Layer 1 - KYCProvidersRegistry", function () {
  let kycRegistry, admin, user1, provider1, provider2;

  beforeEach(async function () {
    [admin, user1, provider1, provider2] = await ethers.getSigners();
    kycRegistry = await deployUpgradeable("KYCProvidersRegistry", [admin.address]);
  });

  describe("Initialization", function () {
    it("Should initialize correctly", async function () {
      const DEFAULT_ADMIN_ROLE = await kycRegistry.DEFAULT_ADMIN_ROLE();
      expect(await kycRegistry.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
    });
  });

  describe("Provider Registration", function () {
    it("Should register provider successfully", async function () {
      const tx = await kycRegistry.connect(admin).registerProvider(
        provider1.address,
        "Test Provider 1"
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          const parsed = kycRegistry.interface.parseLog(log);
          return parsed.name === "ProviderRegistered";
        } catch { return false; }
      });

      expect(event).to.not.be.undefined;
      expect(event.args.providerAddress).to.equal(provider1.address);
      expect(event.args.name).to.equal("Test Provider 1");
    });

    it("Should only allow admin to register providers", async function () {
      await expect(
        kycRegistry.connect(user1).registerProvider(provider1.address, "Test Provider")
      ).to.be.reverted;
    });

    it("Should reject zero address", async function () {
      await expect(
        kycRegistry.connect(admin).registerProvider(ethers.ZeroAddress, "Test Provider")
      ).to.be.revertedWith("Provider address zero");
    });

    it("Should reject duplicate registration", async function () {
      await kycRegistry.connect(admin).registerProvider(provider1.address, "Test Provider 1");

      await expect(
        kycRegistry.connect(admin).registerProvider(provider1.address, "Test Provider 1 Again")
      ).to.be.revertedWith("Already registered");
    });

    it("Should set provider status to pending (1)", async function () {
      await kycRegistry.connect(admin).registerProvider(provider1.address, "Test Provider 1");

      const provider = await kycRegistry.getProviderInfo(provider1.address);
      expect(provider.status).to.equal(1); // Pending
    });
  });

  describe("Provider Approval", function () {
    beforeEach(async function () {
      await kycRegistry.connect(admin).registerProvider(provider1.address, "Test Provider 1");
    });

    it("Should approve provider successfully", async function () {
      const tx = await kycRegistry.connect(admin).approveProvider(provider1.address);

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          const parsed = kycRegistry.interface.parseLog(log);
          return parsed.name === "ProviderStatusChanged";
        } catch { return false; }
      });

      expect(event).to.not.be.undefined;
      expect(event.args.providerAddress).to.equal(provider1.address);
      expect(event.args.newStatus).to.equal(2); // Approved
    });

    it("Should only allow admin to approve", async function () {
      await expect(
        kycRegistry.connect(user1).approveProvider(provider1.address)
      ).to.be.reverted;
    });

    it("Should reject approval if not pending", async function () {
      await expect(
        kycRegistry.connect(admin).approveProvider(user1.address)
      ).to.be.revertedWith("Not pending");
    });

    it("Should return true for isProviderApproved after approval", async function () {
      await kycRegistry.connect(admin).approveProvider(provider1.address);

      expect(await kycRegistry.isProviderApproved(provider1.address)).to.be.true;
    });

    it("Should update lastActive timestamp", async function () {
      const beforeApproval = await kycRegistry.getProviderInfo(provider1.address);

      await kycRegistry.connect(admin).approveProvider(provider1.address);

      const afterApproval = await kycRegistry.getProviderInfo(provider1.address);
      expect(afterApproval.lastActive).to.be.greaterThan(beforeApproval.lastActive);
    });
  });

  describe("Provider Suspension", function () {
    beforeEach(async function () {
      await kycRegistry.connect(admin).registerProvider(provider1.address, "Test Provider 1");
      await kycRegistry.connect(admin).approveProvider(provider1.address);
    });

    it("Should suspend provider successfully", async function () {
      const tx = await kycRegistry.connect(admin).suspendProvider(provider1.address);

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          const parsed = kycRegistry.interface.parseLog(log);
          return parsed.name === "ProviderStatusChanged";
        } catch { return false; }
      });

      expect(event).to.not.be.undefined;
      expect(event.args.providerAddress).to.equal(provider1.address);
      expect(event.args.newStatus).to.equal(3); // Suspended
    });

    it("Should only allow admin to suspend", async function () {
      await expect(
        kycRegistry.connect(user1).suspendProvider(provider1.address)
      ).to.be.reverted;
    });

    it("Should reject suspension if not approved", async function () {
      await expect(
        kycRegistry.connect(admin).suspendProvider(user1.address)
      ).to.be.revertedWith("Not approved");
    });

    it("Should return false for isProviderApproved after suspension", async function () {
      await kycRegistry.connect(admin).suspendProvider(provider1.address);

      expect(await kycRegistry.isProviderApproved(provider1.address)).to.be.false;
    });
  });

  describe("Provider Revocation", function () {
    beforeEach(async function () {
      await kycRegistry.connect(admin).registerProvider(provider1.address, "Test Provider 1");
      await kycRegistry.connect(admin).approveProvider(provider1.address);
    });

    it("Should revoke provider successfully", async function () {
      const tx = await kycRegistry.connect(admin).revokeProvider(provider1.address);

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          const parsed = kycRegistry.interface.parseLog(log);
          return parsed.name === "ProviderStatusChanged";
        } catch { return false; }
      });

      expect(event).to.not.be.undefined;
      expect(event.args.providerAddress).to.equal(provider1.address);
      expect(event.args.newStatus).to.equal(4); // Revoked
    });

    it("Should only allow admin to revoke", async function () {
      await expect(
        kycRegistry.connect(user1).revokeProvider(provider1.address)
      ).to.be.reverted;
    });

    it("Should reject revocation if not registered", async function () {
      await expect(
        kycRegistry.connect(admin).revokeProvider(user1.address)
      ).to.be.revertedWith("Not registered");
    });

    it("Should return false for isProviderApproved after revocation", async function () {
      await kycRegistry.connect(admin).revokeProvider(provider1.address);

      expect(await kycRegistry.isProviderApproved(provider1.address)).to.be.false;
    });
  });

  describe("Get Approved Providers", function () {
    it("Should return empty array when no providers", async function () {
      const approvedProviders = await kycRegistry.getApprovedProviders();
      expect(approvedProviders.length).to.equal(0);
    });

    it("Should return only approved providers", async function () {
      await kycRegistry.connect(admin).registerProvider(provider1.address, "Provider 1");
      await kycRegistry.connect(admin).registerProvider(provider2.address, "Provider 2");

      await kycRegistry.connect(admin).approveProvider(provider1.address);

      const approvedProviders = await kycRegistry.getApprovedProviders();
      expect(approvedProviders.length).to.equal(1);
      expect(approvedProviders[0]).to.equal(provider1.address);
    });

    it("Should exclude suspended providers", async function () {
      await kycRegistry.connect(admin).registerProvider(provider1.address, "Provider 1");
      await kycRegistry.connect(admin).approveProvider(provider1.address);
      await kycRegistry.connect(admin).suspendProvider(provider1.address);

      const approvedProviders = await kycRegistry.getApprovedProviders();
      expect(approvedProviders.length).to.equal(0);
    });

    it("Should exclude revoked providers", async function () {
      await kycRegistry.connect(admin).registerProvider(provider1.address, "Provider 1");
      await kycRegistry.connect(admin).approveProvider(provider1.address);
      await kycRegistry.connect(admin).revokeProvider(provider1.address);

      const approvedProviders = await kycRegistry.getApprovedProviders();
      expect(approvedProviders.length).to.equal(0);
    });
  });

  describe("Provider Status Codes", function () {
    it("Should have correct status codes", async function () {
      // Status 0: Not registered
      let provider = await kycRegistry.getProviderInfo(user1.address);
      expect(provider.status).to.equal(0);

      // Status 1: Pending
      await kycRegistry.connect(admin).registerProvider(provider1.address, "Provider 1");
      provider = await kycRegistry.getProviderInfo(provider1.address);
      expect(provider.status).to.equal(1);

      // Status 2: Approved
      await kycRegistry.connect(admin).approveProvider(provider1.address);
      provider = await kycRegistry.getProviderInfo(provider1.address);
      expect(provider.status).to.equal(2);

      // Status 3: Suspended
      await kycRegistry.connect(admin).suspendProvider(provider1.address);
      provider = await kycRegistry.getProviderInfo(provider1.address);
      expect(provider.status).to.equal(3);

      // Status 4: Revoked
      await kycRegistry.connect(admin).revokeProvider(provider1.address);
      provider = await kycRegistry.getProviderInfo(provider1.address);
      expect(provider.status).to.equal(4);
    });
  });

  describe("Events", function () {
    it("Should emit ProviderRegistered event", async function () {
      await expect(
        kycRegistry.connect(admin).registerProvider(provider1.address, "Test Provider")
      ).to.emit(kycRegistry, "ProviderRegistered")
        .withArgs(provider1.address, "Test Provider");
    });

    it("Should emit ProviderStatusChanged event on approval", async function () {
      await kycRegistry.connect(admin).registerProvider(provider1.address, "Test Provider");

      await expect(
        kycRegistry.connect(admin).approveProvider(provider1.address)
      ).to.emit(kycRegistry, "ProviderStatusChanged")
        .withArgs(provider1.address, 2);
    });

    it("Should emit ProviderStatusChanged event on suspension", async function () {
      await kycRegistry.connect(admin).registerProvider(provider1.address, "Test Provider");
      await kycRegistry.connect(admin).approveProvider(provider1.address);

      await expect(
        kycRegistry.connect(admin).suspendProvider(provider1.address)
      ).to.emit(kycRegistry, "ProviderStatusChanged")
        .withArgs(provider1.address, 3);
    });

    it("Should emit ProviderStatusChanged event on revocation", async function () {
      await kycRegistry.connect(admin).registerProvider(provider1.address, "Test Provider");
      await kycRegistry.connect(admin).approveProvider(provider1.address);

      await expect(
        kycRegistry.connect(admin).revokeProvider(provider1.address)
      ).to.emit(kycRegistry, "ProviderStatusChanged")
        .withArgs(provider1.address, 4);
    });
  });
});
