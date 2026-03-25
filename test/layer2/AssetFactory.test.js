const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Layer 2 - AssetFactory", function () {
  let assetFactory, assetTokenImpl, identityRegistry, complianceModule, circuitBreaker;
  let admin, issuer, user;

  beforeEach(async function () {
    [admin, issuer, user] = await ethers.getSigners();

    // Deploy mock IdentityRegistry
    const IdentityRegistry = await ethers.getContractFactory("contracts/identity/IdentityRegistry.sol:IdentityRegistry");
    identityRegistry = await IdentityRegistry.deploy();
    await identityRegistry.waitForDeployment();

    // Deploy mock ComplianceModule
    const ComplianceModule = await ethers.getContractFactory("contracts/compliance/Compliance.sol:Compliance");
    complianceModule = await ComplianceModule.deploy();
    await complianceModule.waitForDeployment();

    // Deploy CircuitBreakerModule
    const CircuitBreakerModule = await ethers.getContractFactory("contracts/compliance/CircuitBreakerModule.sol:CircuitBreakerModule");
    circuitBreaker = await CircuitBreakerModule.deploy(admin.address);
    await circuitBreaker.waitForDeployment();

    // Deploy AssetToken implementation
    const AssetToken = await ethers.getContractFactory("AssetToken");
    assetTokenImpl = await AssetToken.deploy();
    await assetTokenImpl.waitForDeployment();

    // Deploy AssetFactory
    const AssetFactory = await ethers.getContractFactory("AssetFactory");
    const factoryImpl = await AssetFactory.deploy();
    await factoryImpl.waitForDeployment();

    // Deploy proxy
    const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
    const initData = await factoryImpl.interface.encodeFunctionData("initialize", [
      admin.address,
      await assetTokenImpl.getAddress(),
      await identityRegistry.getAddress(),
      await complianceModule.getAddress(),
      await circuitBreaker.getAddress()
    ]);
    const proxy = await ERC1967Proxy.deploy(await factoryImpl.getAddress(), initData);
    await proxy.waitForDeployment();

    assetFactory = AssetFactory.attach(await proxy.getAddress());
  });

  describe("Initialization", function () {
    it("Should initialize correctly", async function () {
      expect(await assetFactory.assetTokenImplementation()).to.equal(await assetTokenImpl.getAddress());
      expect(await assetFactory.identityRegistry()).to.equal(await identityRegistry.getAddress());
      expect(await assetFactory.complianceModule()).to.equal(await complianceModule.getAddress());
      expect(await assetFactory.circuitBreakerModule()).to.equal(await circuitBreaker.getAddress());
    });

    it("Should grant admin role", async function () {
      const DEFAULT_ADMIN_ROLE = await assetFactory.DEFAULT_ADMIN_ROLE();
      expect(await assetFactory.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
    });
  });

  describe("Issuer Management", function () {
    it("Should approve issuer", async function () {
      await assetFactory.approveIssuer(issuer.address);
      
      expect(await assetFactory.isIssuerApproved(issuer.address)).to.be.true;
    });

    it("Should only allow admin to approve issuer", async function () {
      await expect(
        assetFactory.connect(user).approveIssuer(issuer.address)
      ).to.be.reverted;
    });

    it("Should revoke issuer", async function () {
      await assetFactory.approveIssuer(issuer.address);
      await assetFactory.revokeIssuer(issuer.address);
      
      expect(await assetFactory.isIssuerApproved(issuer.address)).to.be.false;
    });

    it("Should only allow admin to revoke issuer", async function () {
      await expect(
        assetFactory.connect(user).revokeIssuer(issuer.address)
      ).to.be.reverted;
    });

    it("Should emit IssuerApproved event", async function () {
      await expect(assetFactory.approveIssuer(issuer.address))
        .to.emit(assetFactory, "IssuerApproved")
        .withArgs(issuer.address);
    });

    it("Should emit IssuerRevoked event", async function () {
      await assetFactory.approveIssuer(issuer.address);
      
      await expect(assetFactory.revokeIssuer(issuer.address))
        .to.emit(assetFactory, "IssuerRevoked")
        .withArgs(issuer.address);
    });
  });

  describe("Plugin Management", function () {
    let plugin;

    beforeEach(async function () {
      // Deploy mock plugin
      const RealEstatePlugin = await ethers.getContractFactory("RealEstatePlugin");
      plugin = await RealEstatePlugin.deploy();
      await plugin.waitForDeployment();
    });

    it("Should register plugin", async function () {
      const categoryId = await plugin.getCategoryId();
      
      await assetFactory.registerPlugin(categoryId, await plugin.getAddress());
      
      expect(await assetFactory.getPlugin(categoryId)).to.equal(await plugin.getAddress());
    });

    it("Should only allow admin to register plugin", async function () {
      const categoryId = await plugin.getCategoryId();
      
      await expect(
        assetFactory.connect(user).registerPlugin(categoryId, await plugin.getAddress())
      ).to.be.reverted;
    });

    it("Should upgrade plugin", async function () {
      const categoryId = await plugin.getCategoryId();
      await assetFactory.registerPlugin(categoryId, await plugin.getAddress());
      
      const RealEstatePlugin = await ethers.getContractFactory("RealEstatePlugin");
      const newPlugin = await RealEstatePlugin.deploy();
      await newPlugin.waitForDeployment();
      
      await assetFactory.upgradePlugin(categoryId, await newPlugin.getAddress());
      
      expect(await assetFactory.getPlugin(categoryId)).to.equal(await newPlugin.getAddress());
    });

    it("Should only allow admin to upgrade plugin", async function () {
      const categoryId = await plugin.getCategoryId();
      
      await expect(
        assetFactory.connect(user).upgradePlugin(categoryId, await plugin.getAddress())
      ).to.be.reverted;
    });

    it("Should check if plugin is registered", async function () {
      const categoryId = await plugin.getCategoryId();
      
      expect(await assetFactory.isPluginRegistered(categoryId)).to.be.false;
      
      await assetFactory.registerPlugin(categoryId, await plugin.getAddress());
      
      expect(await assetFactory.isPluginRegistered(categoryId)).to.be.true;
    });

    it("Should emit PluginRegistered event", async function () {
      const categoryId = await plugin.getCategoryId();
      
      await expect(assetFactory.registerPlugin(categoryId, await plugin.getAddress()))
        .to.emit(assetFactory, "PluginRegistered")
        .withArgs(categoryId, await plugin.getAddress());
    });

    it("Should emit PluginUpgraded event", async function () {
      const categoryId = await plugin.getCategoryId();
      await assetFactory.registerPlugin(categoryId, await plugin.getAddress());
      
      const RealEstatePlugin = await ethers.getContractFactory("RealEstatePlugin");
      const newPlugin = await RealEstatePlugin.deploy();
      await newPlugin.waitForDeployment();
      
      await expect(assetFactory.upgradePlugin(categoryId, await newPlugin.getAddress()))
        .to.emit(assetFactory, "PluginUpgraded");
    });
  });

  describe("Asset Deployment", function () {
    let plugin, categoryId;

    beforeEach(async function () {
      const RealEstatePlugin = await ethers.getContractFactory("RealEstatePlugin");
      plugin = await RealEstatePlugin.deploy();
      await plugin.waitForDeployment();
      
      categoryId = await plugin.getCategoryId();
      await assetFactory.registerPlugin(categoryId, await plugin.getAddress());
      await assetFactory.approveIssuer(issuer.address);
    });

    it("Should only allow approved issuer to deploy", async function () {
      await expect(
        assetFactory.connect(user).deployAsset(
          "Test Asset",
          "TST",
          ethers.parseEther("1000000"),
          categoryId
        )
      ).to.be.reverted;
    });

    it("Should reject if plugin not registered", async function () {
      const fakeCategoryId = ethers.keccak256(ethers.toUtf8Bytes("FAKE_CATEGORY"));
      
      await expect(
        assetFactory.connect(issuer).deployAsset(
          "Test Asset",
          "TST",
          ethers.parseEther("1000000"),
          fakeCategoryId
        )
      ).to.be.reverted;
    });
  });

  describe("Configuration", function () {
    it("Should set circuit breaker module", async function () {
      const newCircuitBreaker = ethers.Wallet.createRandom().address;
      
      await assetFactory.setCircuitBreakerModule(newCircuitBreaker);
      
      expect(await assetFactory.circuitBreakerModule()).to.equal(newCircuitBreaker);
    });

    it("Should only allow admin to configure", async function () {
      await expect(
        assetFactory.connect(user).setCircuitBreakerModule(ethers.Wallet.createRandom().address)
      ).to.be.reverted;
    });

    it("Should emit CircuitBreakerConfigured event", async function () {
      const newCircuitBreaker = ethers.Wallet.createRandom().address;
      
      await expect(assetFactory.setCircuitBreakerModule(newCircuitBreaker))
        .to.emit(assetFactory, "CircuitBreakerConfigured");
    });
  });

  describe("View Functions", function () {
    it("Should return version", async function () {
      expect(await assetFactory.version()).to.equal("3.0.0");
    });

    it("Should return asset count", async function () {
      expect(await assetFactory.assetCount()).to.equal(0);
    });

    it("Should return request count", async function () {
      expect(await assetFactory.getRequestCount()).to.equal(0);
    });
  });
});
