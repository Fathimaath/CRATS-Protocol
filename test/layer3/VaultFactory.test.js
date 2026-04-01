const { expect } = require("chai");
const { ethers } = require("hardhat");

// Role constants
const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
const VAULT_CREATOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("VAULT_CREATOR_ROLE"));
const CATEGORY_MANAGER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("CATEGORY_MANAGER_ROLE"));

// Vault type enum
const VaultType = {
  SYNC: 0,
  ASYNC: 1
};

describe("Layer 3 - VaultFactory", function () {
  let vaultFactory, syncVaultTemplate, asyncVaultTemplate, mockAsset;
  let admin, creator, user1, user2;

  const CATEGORY_REAL_ESTATE = ethers.keccak256(ethers.toUtf8Bytes("REAL_ESTATE"));
  const CATEGORY_FINE_ART = ethers.keccak256(ethers.toUtf8Bytes("FINE_ART"));

  beforeEach(async function () {
    [admin, creator, user1, user2] = await ethers.getSigners();

    // Deploy mock ERC20 asset
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockAsset = await MockERC20.deploy("Mock Asset", "MCK");
    await mockAsset.waitForDeployment();

    // Deploy SyncVault template
    const SyncVault = await ethers.getContractFactory("SyncVault");
    syncVaultTemplate = await SyncVault.deploy(
      await mockAsset.getAddress(),
      "Sync Vault Template",
      "sVT",
      admin.address
    );
    await syncVaultTemplate.waitForDeployment();

    // Deploy AsyncVault template
    const AsyncVault = await ethers.getContractFactory("AsyncVault");
    asyncVaultTemplate = await AsyncVault.deploy(
      await mockAsset.getAddress(),
      "Async Vault Template",
      "aVT",
      admin.address
    );
    await asyncVaultTemplate.waitForDeployment();

    // Deploy VaultFactory
    const VaultFactory = await ethers.getContractFactory("VaultFactory");
    vaultFactory = await VaultFactory.deploy(admin.address);
    await vaultFactory.waitForDeployment();

    // Setup templates
    await vaultFactory.setSyncVaultTemplate(await syncVaultTemplate.getAddress());
    await vaultFactory.setAsyncVaultTemplate(await asyncVaultTemplate.getAddress());

    // Grant vault creator role
    await vaultFactory.grantRole(VAULT_CREATOR_ROLE, creator.address);
  });

  describe("Initialization", function () {
    it("Should grant admin role to deployer", async function () {
      expect(await vaultFactory.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
    });

    it("Should grant vault creator role to deployer", async function () {
      expect(await vaultFactory.hasRole(VAULT_CREATOR_ROLE, admin.address)).to.be.true;
    });

    it("Should grant category manager role to deployer", async function () {
      expect(await vaultFactory.hasRole(CATEGORY_MANAGER_ROLE, admin.address)).to.be.true;
    });

    it("Should return version", async function () {
      expect(await vaultFactory.version()).to.equal("3.0.0");
    });
  });

  describe("Template Management", function () {
    it("Should allow admin to set sync vault template", async function () {
      const newTemplate = ethers.Wallet.createRandom().address;
      await vaultFactory.setSyncVaultTemplate(newTemplate);

      expect(await vaultFactory.syncVaultTemplate()).to.equal(newTemplate);
    });

    it("Should allow admin to set async vault template", async function () {
      const newTemplate = ethers.Wallet.createRandom().address;
      await vaultFactory.setAsyncVaultTemplate(newTemplate);

      expect(await vaultFactory.asyncVaultTemplate()).to.equal(newTemplate);
    });

    it("Should emit VaultTemplateSet event", async function () {
      const newTemplate = ethers.Wallet.createRandom().address;

      await expect(vaultFactory.setSyncVaultTemplate(newTemplate))
        .to.emit(vaultFactory, "VaultTemplateSet")
        .withArgs(VaultType.SYNC, newTemplate);
    });

    it("Should only allow admin to set templates", async function () {
      const newTemplate = ethers.Wallet.createRandom().address;

      await expect(
        vaultFactory.connect(user1).setSyncVaultTemplate(newTemplate)
      ).to.be.reverted;
    });

    it("Should reject zero address for template", async function () {
      await expect(
        vaultFactory.setSyncVaultTemplate(ethers.ZeroAddress)
      ).to.be.reverted;

      await expect(
        vaultFactory.setAsyncVaultTemplate(ethers.ZeroAddress)
      ).to.be.reverted;
    });
  });

  describe("Create Sync Vault", function () {
    it("Should create a sync vault", async function () {
      const tx = await vaultFactory.connect(creator).createSyncVault(
        await mockAsset.getAddress(),
        "Real Estate Vault",
        "REV",
        CATEGORY_REAL_ESTATE
      );
      const receipt = await tx.wait();

      // Find VaultCreated event
      const vaultCreatedEvent = receipt.logs.find(log => {
        try {
          const parsed = vaultFactory.interface.parseLog(log);
          return parsed.name === "VaultCreated";
        } catch {
          return false;
        }
      });

      expect(vaultCreatedEvent).to.not.be.undefined;
      const vaultAddress = vaultCreatedEvent.args.vault;

      // Verify vault was created
      const vaultInfo = await vaultFactory.getVaultInfo(vaultAddress);
      expect(vaultInfo.active).to.be.true;
      expect(vaultInfo.vaultType).to.equal(VaultType.SYNC);
      expect(vaultInfo.name).to.equal("Real Estate Vault");
      expect(vaultInfo.symbol).to.equal("REV");
    });

    it("Should emit VaultCreated event", async function () {
      const tx = await vaultFactory.connect(creator).createSyncVault(
        await mockAsset.getAddress(),
        "Real Estate Vault",
        "REV",
        CATEGORY_REAL_ESTATE
      );
      const receipt = await tx.wait();

      const vaultCreatedEvent = receipt.logs.find(log => {
        try {
          const parsed = vaultFactory.interface.parseLog(log);
          return parsed.name === "VaultCreated";
        } catch {
          return false;
        }
      });

      expect(vaultCreatedEvent.args.asset).to.equal(await mockAsset.getAddress());
      expect(vaultCreatedEvent.args.category).to.equal(CATEGORY_REAL_ESTATE);
      expect(vaultCreatedEvent.args.vaultType).to.equal(VaultType.SYNC);
      expect(vaultCreatedEvent.args.creator).to.equal(creator.address);
    });

    it("Should register vault in registry", async function () {
      const tx = await vaultFactory.connect(creator).createSyncVault(
        await mockAsset.getAddress(),
        "Real Estate Vault",
        "REV",
        CATEGORY_REAL_ESTATE
      );
      const receipt = await tx.wait();

      const vaultCreatedEvent = receipt.logs.find(log => {
        try {
          const parsed = vaultFactory.interface.parseLog(log);
          return parsed.name === "VaultCreated";
        } catch {
          return false;
        }
      });

      const vaultAddress = vaultCreatedEvent.args.vault;
      const vaultInfo = await vaultFactory.getVaultInfo(vaultAddress);

      expect(vaultInfo.vault).to.equal(vaultAddress);
      expect(vaultInfo.asset).to.equal(await mockAsset.getAddress());
      expect(vaultInfo.category).to.equal(CATEGORY_REAL_ESTATE);
      expect(vaultInfo.creator).to.equal(creator.address);
      expect(vaultInfo.active).to.be.true;
    });

    it("Should add vault to category list", async function () {
      const tx = await vaultFactory.connect(creator).createSyncVault(
        await mockAsset.getAddress(),
        "Real Estate Vault",
        "REV",
        CATEGORY_REAL_ESTATE
      );
      const receipt = await tx.wait();

      const vaultCreatedEvent = receipt.logs.find(log => {
        try {
          const parsed = vaultFactory.interface.parseLog(log);
          return parsed.name === "VaultCreated";
        } catch {
          return false;
        }
      });

      const vaults = await vaultFactory.getVaultsByCategory(CATEGORY_REAL_ESTATE);
      expect(vaults.length).to.equal(1);
      expect(vaults[0]).to.equal(vaultCreatedEvent.args.vault);
    });

    it("Should increment vault count", async function () {
      const countBefore = await vaultFactory.vaultCount();

      await vaultFactory.connect(creator).createSyncVault(
        await mockAsset.getAddress(),
        "Real Estate Vault",
        "REV",
        CATEGORY_REAL_ESTATE
      );

      const countAfter = await vaultFactory.vaultCount();
      expect(countAfter).to.equal(countBefore + 1n);
    });

    it("Should only allow vault creator role", async function () {
      await expect(
        vaultFactory.connect(user1).createSyncVault(
          await mockAsset.getAddress(),
          "Real Estate Vault",
          "REV",
          CATEGORY_REAL_ESTATE
        )
      ).to.be.reverted;
    });

    it("Should fail with invalid asset", async function () {
      await expect(
        vaultFactory.connect(creator).createSyncVault(
          ethers.ZeroAddress,
          "Real Estate Vault",
          "REV",
          CATEGORY_REAL_ESTATE
        )
      ).to.be.reverted;
    });

    it("Should fail with empty name", async function () {
      await expect(
        vaultFactory.connect(creator).createSyncVault(
          await mockAsset.getAddress(),
          "",
          "REV",
          CATEGORY_REAL_ESTATE
        )
      ).to.be.reverted;
    });

    it("Should fail with empty symbol", async function () {
      await expect(
        vaultFactory.connect(creator).createSyncVault(
          await mockAsset.getAddress(),
          "Real Estate Vault",
          "",
          CATEGORY_REAL_ESTATE
        )
      ).to.be.reverted;
    });

    it("Should fail if template not set", async function () {
      const newFactory = await (await ethers.getContractFactory("VaultFactory")).deploy(admin.address);
      
      await expect(
        newFactory.connect(creator).createSyncVault(
          await mockAsset.getAddress(),
          "Real Estate Vault",
          "REV",
          CATEGORY_REAL_ESTATE
        )
      ).to.be.reverted;
    });
  });

  describe("Create Async Vault", function () {
    it("Should create an async vault", async function () {
      const tx = await vaultFactory.connect(creator).createAsyncVault(
        await mockAsset.getAddress(),
        "Fine Art Vault",
        "FAV",
        CATEGORY_FINE_ART,
        24 * 60 * 60, // Deposit settlement
        7 * 24 * 60 * 60 // Redeem settlement
      );
      const receipt = await tx.wait();

      const vaultCreatedEvent = receipt.logs.find(log => {
        try {
          const parsed = vaultFactory.interface.parseLog(log);
          return parsed.name === "VaultCreated";
        } catch {
          return false;
        }
      });

      expect(vaultCreatedEvent).to.not.be.undefined;
      const vaultAddress = vaultCreatedEvent.args.vault;

      const vaultInfo = await vaultFactory.getVaultInfo(vaultAddress);
      expect(vaultInfo.active).to.be.true;
      expect(vaultInfo.vaultType).to.equal(VaultType.ASYNC);
    });

    it("Should set settlement period for async vault", async function () {
      const tx = await vaultFactory.connect(creator).createAsyncVault(
        await mockAsset.getAddress(),
        "Fine Art Vault",
        "FAV",
        CATEGORY_FINE_ART,
        24 * 60 * 60,
        7 * 24 * 60 * 60
      );
      const receipt = await tx.wait();

      const vaultCreatedEvent = receipt.logs.find(log => {
        try {
          const parsed = vaultFactory.interface.parseLog(log);
          return parsed.name === "VaultCreated";
        } catch {
          return false;
        }
      });

      const vaultAddress = vaultCreatedEvent.args.vault;
      const AsyncVault = await ethers.getContractFactory("AsyncVault");
      const asyncVault = AsyncVault.attach(vaultAddress);

      const settlementPeriod = await asyncVault.settlementPeriod();
      expect(settlementPeriod).to.equal(7 * 24 * 60 * 60);
    });
  });

  describe("Create Vault (Generic)", function () {
    it("Should create vault using generic function", async function () {
      const params = {
        asset: await mockAsset.getAddress(),
        name: "Generic Vault",
        symbol: "GV",
        category: CATEGORY_REAL_ESTATE,
        vaultType: VaultType.SYNC,
        depositSettlement: 0,
        redeemSettlement: 0
      };

      const tx = await vaultFactory.connect(creator).createVault(params);
      const receipt = await tx.wait();

      const vaultCreatedEvent = receipt.logs.find(log => {
        try {
          const parsed = vaultFactory.interface.parseLog(log);
          return parsed.name === "VaultCreated";
        } catch {
          return false;
        }
      });

      expect(vaultCreatedEvent).to.not.be.undefined;
    });
  });

  describe("Category Plugin Management", function () {
    it("Should allow category manager to register plugin", async function () {
      const pluginAddress = ethers.Wallet.createRandom().address;

      await vaultFactory.registerCategoryPlugin(CATEGORY_REAL_ESTATE, pluginAddress);

      const registeredPlugin = await vaultFactory.getCategoryPlugin(CATEGORY_REAL_ESTATE);
      expect(registeredPlugin).to.equal(pluginAddress);
    });

    it("Should emit CategoryPluginRegistered event", async function () {
      const pluginAddress = ethers.Wallet.createRandom().address;

      await expect(vaultFactory.registerCategoryPlugin(CATEGORY_REAL_ESTATE, pluginAddress))
        .to.emit(vaultFactory, "CategoryPluginRegistered")
        .withArgs(CATEGORY_REAL_ESTATE, pluginAddress);
    });

    it("Should only allow category manager to register plugins", async function () {
      const pluginAddress = ethers.Wallet.createRandom().address;

      await expect(
        vaultFactory.connect(user1).registerCategoryPlugin(CATEGORY_REAL_ESTATE, pluginAddress)
      ).to.be.reverted;
    });

    it("Should reject zero address for plugin", async function () {
      await expect(
        vaultFactory.registerCategoryPlugin(CATEGORY_REAL_ESTATE, ethers.ZeroAddress)
      ).to.be.reverted;
    });
  });

  describe("Layer 1 Configuration", function () {
    it("Should allow admin to set identity registry", async function () {
      const registry = ethers.Wallet.createRandom().address;

      await vaultFactory.setIdentityRegistry(registry);

      expect(await vaultFactory.identityRegistry()).to.equal(registry);
    });

    it("Should allow admin to set compliance module", async function () {
      const compliance = ethers.Wallet.createRandom().address;

      await vaultFactory.setComplianceModule(compliance);

      expect(await vaultFactory.complianceModule()).to.equal(compliance);
    });

    it("Should allow admin to set circuit breaker module", async function () {
      const cb = ethers.Wallet.createRandom().address;

      await vaultFactory.setCircuitBreakerModule(cb);

      expect(await vaultFactory.circuitBreakerModule()).to.equal(cb);
    });

    it("Should allow admin to set yield distributor", async function () {
      const yd = ethers.Wallet.createRandom().address;

      await vaultFactory.setYieldDistributor(yd);

      expect(await vaultFactory.yieldDistributor()).to.equal(yd);
    });

    it("Should allow admin to set redemption manager", async function () {
      const rm = ethers.Wallet.createRandom().address;

      await vaultFactory.setRedemptionManager(rm);

      expect(await vaultFactory.redemptionManager()).to.equal(rm);
    });

    it("Should emit Layer1Configured event", async function () {
      const registry = ethers.Wallet.createRandom().address;

      await expect(vaultFactory.setIdentityRegistry(registry))
        .to.emit(vaultFactory, "Layer1Configured")
        .withArgs("IdentityRegistry", registry);
    });

    it("Should only allow admin to configure", async function () {
      const registry = ethers.Wallet.createRandom().address;

      await expect(
        vaultFactory.connect(user1).setIdentityRegistry(registry)
      ).to.be.reverted;
    });

    it("Should reject zero address for configuration", async function () {
      await expect(vaultFactory.setIdentityRegistry(ethers.ZeroAddress)).to.be.reverted;
      await expect(vaultFactory.setComplianceModule(ethers.ZeroAddress)).to.be.reverted;
      await expect(vaultFactory.setCircuitBreakerModule(ethers.ZeroAddress)).to.be.reverted;
      await expect(vaultFactory.setYieldDistributor(ethers.ZeroAddress)).to.be.reverted;
      await expect(vaultFactory.setRedemptionManager(ethers.ZeroAddress)).to.be.reverted;
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      // Create some vaults
      await vaultFactory.connect(creator).createSyncVault(
        await mockAsset.getAddress(),
        "Vault 1",
        "V1",
        CATEGORY_REAL_ESTATE
      );

      await vaultFactory.connect(creator).createSyncVault(
        await mockAsset.getAddress(),
        "Vault 2",
        "V2",
        CATEGORY_REAL_ESTATE
      );

      await vaultFactory.connect(creator).createAsyncVault(
        await mockAsset.getAddress(),
        "Vault 3",
        "V3",
        CATEGORY_FINE_ART,
        86400,
        604800
      );
    });

    it("Should get vault info", async function () {
      const vaults = await vaultFactory.getVaultsByCategory(CATEGORY_REAL_ESTATE);
      const vaultInfo = await vaultFactory.getVaultInfo(vaults[0]);

      expect(vaultInfo.name).to.equal("Vault 1");
      expect(vaultInfo.symbol).to.equal("V1");
    });

    it("Should get vaults by category", async function () {
      const realEstateVaults = await vaultFactory.getVaultsByCategory(CATEGORY_REAL_ESTATE);
      expect(realEstateVaults.length).to.equal(2);

      const fineArtVaults = await vaultFactory.getVaultsByCategory(CATEGORY_FINE_ART);
      expect(fineArtVaults.length).to.equal(1);
    });

    it("Should get all vaults", async function () {
      const allVaults = await vaultFactory.getAllVaults();
      expect(allVaults.length).to.equal(3);
    });

    it("Should get vault count", async function () {
      const count = await vaultFactory.vaultCount();
      expect(count).to.equal(3);
    });

    it("Should get vault address from allVaults", async function () {
      const vaultAddress = await vaultFactory.allVaults(0);
      expect(vaultAddress).to.not.equal(ethers.ZeroAddress);
    });
  });

  describe("Multiple Vaults", function () {
    it("Should create multiple vaults with different categories", async function () {
      const categories = [
        CATEGORY_REAL_ESTATE,
        CATEGORY_FINE_ART,
        ethers.keccak256(ethers.toUtf8Bytes("CARBON_CREDIT"))
      ];

      const vaultAddresses = [];

      for (const category of categories) {
        const tx = await vaultFactory.connect(creator).createSyncVault(
          await mockAsset.getAddress(),
          `Vault ${category}`,
          `V${category.slice(2, 6)}`,
          category
        );
        const receipt = await tx.wait();

        const vaultCreatedEvent = receipt.logs.find(log => {
          try {
            const parsed = vaultFactory.interface.parseLog(log);
            return parsed.name === "VaultCreated";
          } catch {
            return false;
          }
        });

        vaultAddresses.push(vaultCreatedEvent.args.vault);
      }

      expect(await vaultFactory.vaultCount()).to.equal(3);

      for (let i = 0; i < categories.length; i++) {
        const vaults = await vaultFactory.getVaultsByCategory(categories[i]);
        expect(vaults.length).to.equal(1);
        expect(vaults[0]).to.equal(vaultAddresses[i]);
      }
    });
  });
});
