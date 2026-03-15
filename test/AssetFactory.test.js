const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");

describe("AssetFactory", function () {
  async function deployAssetFactoryFixture() {
    const [owner, operator, issuer1, issuer2, user1] = await ethers.getSigners();

    // Deploy KYCProvidersRegistry (Layer 1 dependency)
    const KYCRegistry = await ethers.getContractFactory("KYCProvidersRegistry");
    const kycRegistry = await KYCRegistry.deploy();

    // Deploy IdentitySBT (Layer 1)
    const IdentitySBT = await ethers.getContractFactory("IdentitySBT");
    const identitySBT = await IdentitySBT.deploy(owner.address, await kycRegistry.getAddress());

    // Deploy IdentityRegistry (Layer 1)
    const IdentityRegistry = await ethers.getContractFactory("IdentityRegistry");
    const identityRegistry = await IdentityRegistry.deploy(
      owner.address,
      await identitySBT.getAddress(),
      await kycRegistry.getAddress()
    );

    // Deploy ComplianceModule (Layer 1)
    const ComplianceModule = await ethers.getContractFactory("ComplianceModule");
    const complianceModule = await ComplianceModule.deploy(
      owner.address,
      await identityRegistry.getAddress()
    );

    // Deploy CircuitBreakerModule (Layer 2)
    const CircuitBreakerModule = await ethers.getContractFactory("CircuitBreakerModule");
    const circuitBreaker = await CircuitBreakerModule.deploy(owner.address);

    // Deploy AssetFactory
    const AssetFactory = await ethers.getContractFactory("AssetFactory");
    const assetFactory = await AssetFactory.deploy(owner.address);

    // Grant OPERATOR_ROLE
    const OPERATOR_ROLE = ethers.id("OPERATOR_ROLE");
    await assetFactory.grantRole(OPERATOR_ROLE, operator.address);

    // Configure Layer 1 dependencies
    await assetFactory.connect(owner).setIdentityRegistry(await identityRegistry.getAddress());
    await assetFactory.connect(owner).setComplianceModule(await complianceModule.getAddress());
    await assetFactory.connect(owner).setCircuitBreakerModule(await circuitBreaker.getAddress());

    // Approve issuers
    await assetFactory.connect(owner).approveIssuer(issuer1.address);
    await assetFactory.connect(owner).approveIssuer(issuer2.address);

    return {
      assetFactory,
      identityRegistry,
      identitySBT,
      kycRegistry,
      complianceModule,
      circuitBreaker,
      owner,
      operator,
      issuer1,
      issuer2,
      user1
    };
  }

  describe("Deployment", function () {
    it("Should deploy successfully", async function () {
      const { assetFactory } = await loadFixture(deployAssetFactoryFixture);
      expect(await assetFactory.assetCount()).to.equal(0);
    });

    it("Should set the right owner as operator", async function () {
      const { assetFactory, owner } = await loadFixture(deployAssetFactoryFixture);
      const OPERATOR_ROLE = ethers.id("OPERATOR_ROLE");
      expect(await assetFactory.hasRole(OPERATOR_ROLE, owner.address)).to.be.true;
    });

    it("Should approve initial issuer", async function () {
      const { assetFactory, owner } = await loadFixture(deployAssetFactoryFixture);
      expect(await assetFactory.isIssuerApproved(owner.address)).to.be.true;
    });
  });

  describe("Issuer Management", function () {
    it("Should approve new issuer", async function () {
      const { assetFactory, operator, issuer1 } = await loadFixture(deployAssetFactoryFixture);
      expect(await assetFactory.isIssuerApproved(issuer1.address)).to.be.true;
    });

    it("Should revoke issuer", async function () {
      const { assetFactory, operator, issuer1 } = await loadFixture(deployAssetFactoryFixture);
      
      await assetFactory.connect(operator).revokeIssuer(issuer1.address);
      expect(await assetFactory.isIssuerApproved(issuer1.address)).to.be.false;
    });

    it("Should fail when non-operator tries to approve issuer", async function () {
      const { assetFactory, user1 } = await loadFixture(deployAssetFactoryFixture);
      await expect(
        assetFactory.connect(user1).approveIssuer(user1.address)
      ).to.be.reverted;
    });
  });

  describe("Plugin Management", function () {
    it("Should register plugin", async function () {
      const { assetFactory, owner } = await loadFixture(deployAssetFactoryFixture);

      // Deploy mock plugin
      const RealEstatePlugin = await ethers.getContractFactory("RealEstatePlugin");
      const plugin = await RealEstatePlugin.deploy();

      const REAL_ESTATE = ethers.id("REAL_ESTATE");
      
      await expect(
        assetFactory.connect(owner).registerPlugin(REAL_ESTATE, await plugin.getAddress())
      ).to.emit(assetFactory, "PluginRegistered");

      expect(await assetFactory.isPluginRegistered(REAL_ESTATE)).to.be.true;
    });

    it("Should upgrade plugin", async function () {
      const { assetFactory, owner } = await loadFixture(deployAssetFactoryFixture);

      const RealEstatePlugin = await ethers.getContractFactory("RealEstatePlugin");
      const plugin1 = await RealEstatePlugin.deploy();
      const plugin2 = await RealEstatePlugin.deploy();

      const REAL_ESTATE = ethers.id("REAL_ESTATE");
      
      await assetFactory.connect(owner).registerPlugin(REAL_ESTATE, await plugin1.getAddress());
      
      await expect(
        assetFactory.connect(owner).upgradePlugin(REAL_ESTATE, await plugin2.getAddress())
      ).to.emit(assetFactory, "PluginUpgraded");
    });

    it("Should fail to register plugin with zero address", async function () {
      const { assetFactory, owner } = await loadFixture(deployAssetFactoryFixture);
      const REAL_ESTATE = ethers.id("REAL_ESTATE");
      
      await expect(
        assetFactory.connect(owner).registerPlugin(REAL_ESTATE, ethers.ZeroAddress)
      ).to.be.revertedWith("AssetFactory: Plugin cannot be zero address");
    });
  });

  describe("Asset Creation Request", function () {
    it("Should submit creation request", async function () {
      const { assetFactory, owner, issuer1 } = await loadFixture(deployAssetFactoryFixture);

      // Register plugin first
      const RealEstatePlugin = await ethers.getContractFactory("RealEstatePlugin");
      const plugin = await RealEstatePlugin.deploy();
      const REAL_ESTATE = ethers.id("REAL_ESTATE");
      await assetFactory.connect(owner).registerPlugin(REAL_ESTATE, await plugin.getAddress());

      // Category data must be at least 128 bytes for plugin validation
      const categoryData = "0x" + "00".repeat(128);
      
      await expect(
        assetFactory.connect(issuer1).submitCreationRequest(
          REAL_ESTATE,
          "Test Asset",
          "TST",
          1000000,
          ethers.parseEther("100"),
          categoryData
        )
      ).to.emit(assetFactory, "CreationRequestSubmitted");
    });

    it("Should fail with unregistered category", async function () {
      const { assetFactory, issuer1 } = await loadFixture(deployAssetFactoryFixture);

      const categoryData = "0x" + "00".repeat(128);
      
      await expect(
        assetFactory.connect(issuer1).submitCreationRequest(
          ethers.id("UNKNOWN_CATEGORY"),
          "Test Asset",
          "TST",
          1000000,
          ethers.parseEther("100"),
          categoryData
        )
      ).to.be.revertedWith("AssetFactory: Category plugin not registered");
    });

    it("Should fail when non-issuer tries to submit request", async function () {
      const { assetFactory, user1 } = await loadFixture(deployAssetFactoryFixture);

      await expect(
        assetFactory.connect(user1).submitCreationRequest(
          ethers.id("REAL_ESTATE"),
          "Test Asset",
          "TST",
          1000000,
          ethers.parseEther("100"),
          "0x" + "00".repeat(128)
        )
      ).to.be.reverted;
    });
  });

  describe("Approve/Reject Creation Request", function () {
    it("Should approve creation request", async function () {
      const { assetFactory, owner, issuer1 } = await loadFixture(deployAssetFactoryFixture);

      const RealEstatePlugin = await ethers.getContractFactory("RealEstatePlugin");
      const plugin = await RealEstatePlugin.deploy();
      const REAL_ESTATE = ethers.id("REAL_ESTATE");
      await assetFactory.connect(owner).registerPlugin(REAL_ESTATE, await plugin.getAddress());

      const categoryData = "0x" + "00".repeat(128);
      const tx = await assetFactory.connect(issuer1).submitCreationRequest(
        REAL_ESTATE,
        "Test Asset",
        "TST",
        1000000,
        ethers.parseEther("100"),
        categoryData
      );
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          const parsed = assetFactory.interface.parseLog(log);
          return parsed && parsed.name === "CreationRequestSubmitted";
        } catch {
          return false;
        }
      });
      const requestId = event.args.requestId;

      await expect(
        assetFactory.connect(owner).approveCreationRequest(requestId)
      ).to.emit(assetFactory, "CreationRequestApproved");
    });

    it("Should reject creation request", async function () {
      const { assetFactory, owner, issuer1 } = await loadFixture(deployAssetFactoryFixture);

      const RealEstatePlugin = await ethers.getContractFactory("RealEstatePlugin");
      const plugin = await RealEstatePlugin.deploy();
      const REAL_ESTATE = ethers.id("REAL_ESTATE");
      await assetFactory.connect(owner).registerPlugin(REAL_ESTATE, await plugin.getAddress());

      const categoryData = "0x" + "00".repeat(128);
      const tx = await assetFactory.connect(issuer1).submitCreationRequest(
        REAL_ESTATE,
        "Test Asset",
        "TST",
        1000000,
        ethers.parseEther("100"),
        categoryData
      );
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          const parsed = assetFactory.interface.parseLog(log);
          return parsed && parsed.name === "CreationRequestSubmitted";
        } catch {
          return false;
        }
      });
      const requestId = event.args.requestId;

      await expect(
        assetFactory.connect(owner).rejectCreationRequest(requestId, "Invalid details")
      ).to.emit(assetFactory, "CreationRequestRejected");
    });
  });

  describe("Get Functions", function () {
    it("Should get asset count", async function () {
      const { assetFactory } = await loadFixture(deployAssetFactoryFixture);
      expect(await assetFactory.assetCount()).to.equal(0);
    });

    it("Should get request count", async function () {
      const { assetFactory } = await loadFixture(deployAssetFactoryFixture);
      expect(await assetFactory.getRequestCount()).to.equal(0);
    });

    it("Should get version", async function () {
      const { assetFactory } = await loadFixture(deployAssetFactoryFixture);
      const version = await assetFactory.version();
      expect(version).to.equal("3.0.0");
    });
  });
});
