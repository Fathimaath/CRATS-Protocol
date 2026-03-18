const {
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const ethers = require("hardhat").ethers;

describe("VaultFactory", function () {
  async function deployFactoryFixture() {
    const [owner, creator, user1] = await ethers.getSigners();

    // Deploy mock asset
    const MockToken = await ethers.getContractFactory("MockERC20");
    const asset = await MockToken.deploy("Mock Asset", "MCK");
    await asset.waitForDeployment();

    // Deploy SyncVault template with creator as admin (so clones inherit roles)
    const SyncVault = await ethers.getContractFactory("SyncVault");
    const syncTemplate = await SyncVault.deploy(
      await asset.getAddress(),
      "Sync Vault",
      "svMCK",
      creator.address  // Use creator as admin so they have roles in clones
    );
    await syncTemplate.waitForDeployment();

    // Deploy AsyncVault template with creator as admin
    const AsyncVault = await ethers.getContractFactory("AsyncVault");
    const asyncTemplate = await AsyncVault.deploy(
      await asset.getAddress(),
      "Async Vault",
      "avMCK",
      creator.address  // Use creator as admin so they have roles in clones
    );
    await asyncTemplate.waitForDeployment();

    // Deploy VaultFactory
    const VaultFactory = await ethers.getContractFactory("VaultFactory");
    const factory = await VaultFactory.deploy(owner.address);
    await factory.waitForDeployment();

    // Configure factory
    await factory.setSyncVaultTemplate(await syncTemplate.getAddress());
    await factory.setAsyncVaultTemplate(await asyncTemplate.getAddress());

    // Grant creator role
    const VAULT_CREATOR_ROLE = await factory.VAULT_CREATOR_ROLE();
    await factory.connect(owner).grantRole(VAULT_CREATOR_ROLE, creator.address);

    return { factory, asset, syncTemplate, asyncTemplate, owner, creator, user1 };
  }

  describe("Deployment", function () {
    it("Should set the correct admin", async function () {
      const { factory, owner } = await loadFixture(deployFactoryFixture);
      expect(await factory.hasRole(await factory.DEFAULT_ADMIN_ROLE(), owner.address)).to.be.true;
    });

    it("Should have zero vaults initially", async function () {
      const { factory } = await loadFixture(deployFactoryFixture);
      expect(await factory.vaultCount()).to.equal(0);
    });
  });

  describe("Template Management", function () {
    it("Should allow admin to set templates", async function () {
      const { factory, syncTemplate } = await loadFixture(deployFactoryFixture);

      await factory.setSyncVaultTemplate(await syncTemplate.getAddress());

      expect(await factory.syncVaultTemplate()).to.equal(await syncTemplate.getAddress());
    });

    it("Should prevent non-admin from setting templates", async function () {
      const { factory, syncTemplate, user1 } = await loadFixture(deployFactoryFixture);

      await expect(
        factory.connect(user1).setSyncVaultTemplate(await syncTemplate.getAddress())
      ).to.be.reverted;
    });
  });

  describe("Creating Sync Vaults", function () {
    it("Should create a sync vault", async function () {
      const { factory, asset, creator } = await loadFixture(deployFactoryFixture);

      const tx = await factory.connect(creator).createSyncVault(
        await asset.getAddress(),
        "My Sync Vault",
        "MSV",
        ethers.id("REAL_ESTATE")
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => log.fragment?.name === "VaultCreated");
      const vaultAddress = event.args.vault;

      expect(vaultAddress).to.not.equal(ethers.ZeroAddress);

      const vaultInfo = await factory.getVaultInfo(vaultAddress);
      expect(vaultInfo.name).to.equal("My Sync Vault");
      expect(vaultInfo.symbol).to.equal("MSV");
      expect(vaultInfo.vaultType).to.equal(0); // SYNC
    });

    it("Should increment vault count", async function () {
      const { factory, asset, creator } = await loadFixture(deployFactoryFixture);

      await factory.connect(creator).createSyncVault(
        await asset.getAddress(),
        "Vault 1",
        "V1",
        ethers.id("REAL_ESTATE")
      );

      expect(await factory.vaultCount()).to.equal(1);

      await factory.connect(creator).createSyncVault(
        await asset.getAddress(),
        "Vault 2",
        "V2",
        ethers.id("REAL_ESTATE")
      );

      expect(await factory.vaultCount()).to.equal(2);
    });

    it("Should prevent non-creator from creating vaults", async function () {
      const { factory, asset, user1 } = await loadFixture(deployFactoryFixture);

      await expect(
        factory.connect(user1).createSyncVault(
          await asset.getAddress(),
          "Unauthorized Vault",
          "UAV",
          ethers.id("REAL_ESTATE")
        )
      ).to.be.reverted;
    });
  });

  describe("Creating Async Vaults", function () {
    it("Should create an async vault", async function () {
      const { factory, asset, creator } = await loadFixture(deployFactoryFixture);

      const tx = await factory.connect(creator).createAsyncVault(
        await asset.getAddress(),
        "My Async Vault",
        "MAV",
        ethers.id("FINE_ART"),
        24 * 60 * 60, // 24 hours deposit settlement
        72 * 60 * 60  // 72 hours redeem settlement
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => log.fragment?.name === "VaultCreated");
      const vaultAddress = event.args.vault;

      expect(vaultAddress).to.not.equal(ethers.ZeroAddress);

      const vaultInfo = await factory.getVaultInfo(vaultAddress);
      expect(vaultInfo.name).to.equal("My Async Vault");
      expect(vaultInfo.vaultType).to.equal(1); // ASYNC
    });

    it("Should set settlement period for async vault", async function () {
      const { factory, asset, creator } = await loadFixture(deployFactoryFixture);

      const tx = await factory.connect(creator).createAsyncVault(
        await asset.getAddress(),
        "Async Vault",
        "AV",
        ethers.id("FINE_ART"),
        48 * 60 * 60,
        120 * 60 * 60
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => log.fragment?.name === "VaultCreated");
      const vaultAddress = event.args.vault;

      const AsyncVault = await ethers.getContractFactory("AsyncVault");
      const vault = AsyncVault.attach(vaultAddress);

      expect(await vault.settlementPeriod()).to.equal(120 * 60 * 60);
    });
  });

  describe("Vault Registry", function () {
    it("Should track vaults by category", async function () {
      const { factory, asset, creator } = await loadFixture(deployFactoryFixture);

      const category = ethers.id("REAL_ESTATE");

      await factory.connect(creator).createSyncVault(
        await asset.getAddress(),
        "RE Vault 1",
        "REV1",
        category
      );

      await factory.connect(creator).createSyncVault(
        await asset.getAddress(),
        "RE Vault 2",
        "REV2",
        category
      );

      const vaults = await factory.getVaultsByCategory(category);
      expect(vaults.length).to.equal(2);
    });

    it("Should return all vaults", async function () {
      const { factory, asset, creator } = await loadFixture(deployFactoryFixture);

      await factory.connect(creator).createSyncVault(
        await asset.getAddress(),
        "Vault 1",
        "V1",
        ethers.id("REAL_ESTATE")
      );

      await factory.connect(creator).createAsyncVault(
        await asset.getAddress(),
        "Vault 2",
        "V2",
        ethers.id("FINE_ART"),
        24 * 60 * 60,
        72 * 60 * 60
      );

      const allVaults = await factory.getAllVaults();
      expect(allVaults.length).to.equal(2);
    });

    it("Should return vault info", async function () {
      const { factory, asset, creator } = await loadFixture(deployFactoryFixture);

      const tx = await factory.connect(creator).createSyncVault(
        await asset.getAddress(),
        "Test Vault",
        "TV",
        ethers.id("CARBON_CREDIT")
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => log.fragment?.name === "VaultCreated");
      const vaultAddress = event.args.vault;

      const vaultInfo = await factory.getVaultInfo(vaultAddress);
      expect(vaultInfo.name).to.equal("Test Vault");
      expect(vaultInfo.symbol).to.equal("TV");
      expect(vaultInfo.active).to.be.true;
      expect(vaultInfo.creator).to.equal(creator.address);
    });
  });

  describe("Category Plugins", function () {
    it("Should allow category manager to register plugins", async function () {
      const { factory, owner } = await loadFixture(deployFactoryFixture);

      const mockPlugin = owner.address; // Using address as mock plugin
      const category = ethers.id("REAL_ESTATE");

      await factory.connect(owner).registerCategoryPlugin(category, mockPlugin);

      expect(await factory.getCategoryPlugin(category)).to.equal(mockPlugin);
    });

    it("Should emit CategoryPluginRegistered event", async function () {
      const { factory, owner } = await loadFixture(deployFactoryFixture);

      const mockPlugin = owner.address;
      const category = ethers.id("FINE_ART");

      await expect(
        factory.connect(owner).registerCategoryPlugin(category, mockPlugin)
      )
        .to.emit(factory, "CategoryPluginRegistered")
        .withArgs(category, mockPlugin);
    });
  });

  describe("Layer 1 Configuration", function () {
    it("Should allow admin to set Layer 1 dependencies", async function () {
      const { factory, owner } = await loadFixture(deployFactoryFixture);

      const mockAddress = owner.address;

      await factory.setIdentityRegistry(mockAddress);
      await factory.setComplianceModule(mockAddress);
      await factory.setCircuitBreakerModule(mockAddress);
      await factory.setYieldDistributor(mockAddress);
      await factory.setRedemptionManager(mockAddress);

      expect(await factory.identityRegistry()).to.equal(mockAddress);
      expect(await factory.complianceModule()).to.equal(mockAddress);
      expect(await factory.circuitBreakerModule()).to.equal(mockAddress);
      expect(await factory.yieldDistributor()).to.equal(mockAddress);
      expect(await factory.redemptionManager()).to.equal(mockAddress);
    });
  });
});
