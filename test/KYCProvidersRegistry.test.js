const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");

describe("KYCProvidersRegistry", function () {
  async function deployKYCRegistryFixture() {
    const [owner, provider1, provider2, user] = await ethers.getSigners();

    const KYCRegistry = await ethers.getContractFactory("KYCProvidersRegistry");
    const kycRegistry = await KYCRegistry.deploy();

    return { kycRegistry, owner, provider1, provider2, user };
  }

  describe("Deployment", function () {
    it("Should deploy successfully", async function () {
      const { kycRegistry, owner } = await loadFixture(deployKYCRegistryFixture);
      expect(await kycRegistry.owner()).to.equal(owner.address);
    });
  });

  describe("Provider Registration", function () {
    it("Should register a new provider with Pending status", async function () {
      const { kycRegistry, owner, provider1 } = await loadFixture(deployKYCRegistryFixture);

      await kycRegistry.registerProvider(provider1.address, "Test Provider 1");

      const provider = await kycRegistry.getProviderInfo(provider1.address);
      expect(provider.name).to.equal("Test Provider 1");
      expect(provider.status).to.equal(1); // Pending
    });

    it("Should fail to register zero address", async function () {
      const { kycRegistry, owner } = await loadFixture(deployKYCRegistryFixture);

      await expect(
        kycRegistry.registerProvider(ethers.ZeroAddress, "Invalid Provider")
      ).to.be.revertedWith("Provider address cannot be zero");
    });

    it("Should fail to register already registered provider", async function () {
      const { kycRegistry, owner, provider1 } = await loadFixture(deployKYCRegistryFixture);

      await kycRegistry.registerProvider(provider1.address, "Test Provider 1");

      await expect(
        kycRegistry.registerProvider(provider1.address, "Test Provider 2")
      ).to.be.revertedWith("Provider already registered");
    });

    it("Should fail when non-owner tries to register", async function () {
      const { kycRegistry, provider1, provider2 } = await loadFixture(deployKYCRegistryFixture);

      await expect(
        kycRegistry.connect(provider1).registerProvider(provider2.address, "Test Provider")
      ).to.be.reverted; // Ownable reverts with "Ownable: caller is not the owner"
    });
  });

  describe("Provider Approval", function () {
    it("Should approve a pending provider", async function () {
      const { kycRegistry, owner, provider1 } = await loadFixture(deployKYCRegistryFixture);

      await kycRegistry.registerProvider(provider1.address, "Test Provider 1");
      await kycRegistry.approveProvider(provider1.address);

      const isApproved = await kycRegistry.isProviderApproved(provider1.address);
      expect(isApproved).to.be.true;
    });

    it("Should emit ProviderStatusChanged event on approval", async function () {
      const { kycRegistry, owner, provider1 } = await loadFixture(deployKYCRegistryFixture);

      await kycRegistry.registerProvider(provider1.address, "Test Provider 1");

      await expect(kycRegistry.approveProvider(provider1.address))
        .to.emit(kycRegistry, "ProviderStatusChanged")
        .withArgs(provider1.address, 2); // Approved
    });

    it("Should fail to approve non-pending provider", async function () {
      const { kycRegistry, owner, provider1 } = await loadFixture(deployKYCRegistryFixture);

      await expect(
        kycRegistry.approveProvider(provider1.address)
      ).to.be.revertedWith("Provider is not in a pending state");
    });
  });

  describe("Provider Suspension", function () {
    it("Should suspend an approved provider", async function () {
      const { kycRegistry, owner, provider1 } = await loadFixture(deployKYCRegistryFixture);

      await kycRegistry.registerProvider(provider1.address, "Test Provider 1");
      await kycRegistry.approveProvider(provider1.address);
      await kycRegistry.suspendProvider(provider1.address);

      const isApproved = await kycRegistry.isProviderApproved(provider1.address);
      expect(isApproved).to.be.false;

      const provider = await kycRegistry.getProviderInfo(provider1.address);
      expect(provider.status).to.equal(3); // Suspended
    });

    it("Should fail to suspend non-approved provider", async function () {
      const { kycRegistry, owner, provider1 } = await loadFixture(deployKYCRegistryFixture);

      await kycRegistry.registerProvider(provider1.address, "Test Provider 1");

      await expect(
        kycRegistry.suspendProvider(provider1.address)
      ).to.be.revertedWith("Provider is not approved");
    });
  });

  describe("Provider Revocation", function () {
    it("Should revoke a provider permanently", async function () {
      const { kycRegistry, owner, provider1 } = await loadFixture(deployKYCRegistryFixture);

      await kycRegistry.registerProvider(provider1.address, "Test Provider 1");
      await kycRegistry.approveProvider(provider1.address);
      await kycRegistry.revokeProvider(provider1.address);

      const provider = await kycRegistry.getProviderInfo(provider1.address);
      expect(provider.status).to.equal(4); // Revoked
    });

    it("Should fail to revoke non-registered provider", async function () {
      const { kycRegistry, owner, provider1 } = await loadFixture(deployKYCRegistryFixture);

      await expect(
        kycRegistry.revokeProvider(provider1.address)
      ).to.be.revertedWith("Provider is not registered");
    });
  });

  describe("Get Approved Providers", function () {
    it("Should return only approved providers", async function () {
      const { kycRegistry, owner, provider1, provider2 } = await loadFixture(deployKYCRegistryFixture);

      // Register and approve provider1
      await kycRegistry.registerProvider(provider1.address, "Provider 1");
      await kycRegistry.approveProvider(provider1.address);

      // Register and approve provider2
      await kycRegistry.registerProvider(provider2.address, "Provider 2");
      await kycRegistry.approveProvider(provider2.address);

      const approvedProviders = await kycRegistry.getApprovedProviders();
      expect(approvedProviders.length).to.equal(2);
      expect(approvedProviders).to.include(provider1.address);
      expect(approvedProviders).to.include(provider2.address);
    });

    it("Should return empty array when no approved providers", async function () {
      const { kycRegistry } = await loadFixture(deployKYCRegistryFixture);

      const approvedProviders = await kycRegistry.getApprovedProviders();
      expect(approvedProviders.length).to.equal(0);
    });
  });
});
