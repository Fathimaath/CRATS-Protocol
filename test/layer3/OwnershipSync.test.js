const { expect } = require("chai");
const { ethers } = require("hardhat");
const { 
  deployAndInitializeLayer1, 
  deployLayer2Fixtures, 
  registerIdentity, 
  DEFAULT_VALUES,
  deployUpgradeable
} = require("../helpers/fixtures");

describe("Layer 3 - OwnershipSync & Beneficial Ownership (BOR)", function () {
  let assetRegistry, syncManager, vault, assetToken;
  let admin, compliance, investor1, investor2, operator, kycProvider;
  let identityRegistry, complianceModule, circuitBreaker;

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    admin = signers[0];
    investor1 = signers[1];
    investor2 = signers[2];
    operator = signers[3];
    compliance = signers[4];
    kycProvider = signers[5];

    // 1. Deploy L1
    const l1 = await deployAndInitializeLayer1();
    identityRegistry = l1.identityRegistry;
    complianceModule = l1.complianceModule;

    // Register admin's identity
    await registerIdentity(l1.identitySBT, identityRegistry, kycProvider, admin, DEFAULT_VALUES.jurisdictionUS, 4);

    // 2. Deploy L2 fixtures (including AssetRegistry and token templates)
    const l2 = await deployLayer2Fixtures(l1);
    assetRegistry = l2.assetRegistry;

    // Configure compliance provider role
    const COMPLIANCE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("COMPLIANCE_ROLE"));
    await complianceModule.grantRole(COMPLIANCE_ROLE, compliance.address);

    // 3. Deploy L3 OwnershipSyncManager
    const OwnershipSyncManager = await ethers.getContractFactory("OwnershipSyncManager");
    syncManager = await OwnershipSyncManager.deploy(admin.address, await assetRegistry.getAddress());
    await syncManager.waitForDeployment();

    // Grant SYNC_MANAGER_ROLE to syncManager in AssetRegistry
    const SYNC_MANAGER_ROLE = await assetRegistry.SYNC_MANAGER_ROLE();
    await assetRegistry.connect(admin).grantRole(SYNC_MANAGER_ROLE, await syncManager.getAddress());

    // 4. Deploy L2 AssetToken (using AssetFactory)
    await l2.assetFactory.connect(admin).approveIssuer(admin.address);
    const categoryId = l2.CATEGORY_ID_REAL_ESTATE;
    const tx = await l2.assetFactory.connect(admin).deployAsset(
      "Mock Asset",
      "MKA",
      ethers.parseEther("1000"),
      categoryId
    );
    const receipt = await tx.wait();
    const event = receipt.logs.find(log => {
      try {
        return l2.assetFactory.interface.parseLog(log).name === "AssetDeployed";
      } catch (e) {
        return false;
      }
    });
    const assetAddress = l2.assetFactory.interface.parseLog(event).args.token;
    assetToken = await ethers.getContractAt("AssetToken", assetAddress);

    // 5. Deploy L3 SyncVault
    const SyncVault = await ethers.getContractFactory("SyncVault");
    const vaultImpl = await SyncVault.deploy();
    await vaultImpl.waitForDeployment();

    const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
    const vaultInit = SyncVault.interface.encodeFunctionData("initialize", [
      assetAddress,
      "Sync Vault",
      "sVT",
      admin.address,
      await assetRegistry.getAddress(),
      await syncManager.getAddress()
    ]);
    const vaultProxy = await ERC1967Proxy.deploy(await vaultImpl.getAddress(), vaultInit);
    await vaultProxy.waitForDeployment();
    vault = await ethers.getContractAt("SyncVault", await vaultProxy.getAddress());

    // Setup identities for compliance
    await registerIdentity(l1.identitySBT, identityRegistry, kycProvider, investor1, DEFAULT_VALUES.jurisdictionUS, DEFAULT_VALUES.roleInvestor);
    await registerIdentity(l1.identitySBT, identityRegistry, kycProvider, investor2, DEFAULT_VALUES.jurisdictionUS, DEFAULT_VALUES.roleInvestor);
    await registerIdentity(l1.identitySBT, identityRegistry, kycProvider, { address: await vault.getAddress() }, DEFAULT_VALUES.jurisdictionUS, DEFAULT_VALUES.roleInvestor);

    // Register vault in AssetRegistry
    await assetRegistry.connect(admin).registerVault(assetAddress, await vault.getAddress());

    // Mint underlying assets to investor1
    await assetToken.connect(admin).mint(investor1.address, ethers.parseEther("1000"));
  });

  describe("OwnershipSyncManager Authorization & Middleware Routing", function () {
    it("Should reject direct registry updates from unauthorized addresses", async function () {
      await expect(
        assetRegistry.connect(investor1).updateBeneficialOwnership(
          await assetToken.getAddress(),
          await vault.getAddress(),
          investor1.address,
          100
        )
      ).to.be.revertedWithCustomError(assetRegistry, "AccessControlUnauthorizedAccount");
    });

    it("Should allow registered vaults to route updates", async function () {
      const amount = ethers.parseEther("100");
      
      // Approve and deposit to trigger base vault hook routing
      await assetToken.connect(investor1).approve(await vault.getAddress(), amount);
      
      await expect(vault.connect(investor1).deposit(amount, investor1.address))
        .to.emit(syncManager, "SyncRouted");

      // Verify registry has updated beneficial ownership balance
      const record = await assetRegistry.getBeneficialOwner(
        await assetToken.getAddress(),
        await vault.getAddress(),
        investor1.address
      );
      expect(record.vaultShares).to.be.greaterThan(0);
    });

    it("Should allow admin to authorize a custom module", async function () {
      const customModule = operator;
      const reasonCode = ethers.id("P2P_SETTLEMENT");

      await syncManager.connect(admin).authorizeModule(customModule.address, reasonCode);

      // Verify authorization
      expect(await syncManager.authorizedModules(customModule.address)).to.be.true;
      expect(await syncManager.callerReasonCodes(customModule.address)).to.equal(reasonCode);

      // Call update via module
      await expect(
        syncManager.connect(customModule).updateBeneficialOwnership(
          await assetToken.getAddress(),
          await vault.getAddress(),
          investor2.address,
          ethers.parseEther("50")
        )
      ).to.emit(syncManager, "SyncRouted")
       .withArgs(customModule.address, await assetToken.getAddress(), await vault.getAddress(), investor2.address, ethers.parseEther("50"), reasonCode);

      // Verify registry state
      const record = await assetRegistry.getBeneficialOwner(
        await assetToken.getAddress(),
        await vault.getAddress(),
        investor2.address
      );
      expect(record.vaultShares).to.equal(ethers.parseEther("50"));
    });

    it("Should prevent unauthorized modules from calling syncManager", async function () {
      await expect(
        syncManager.connect(investor2).updateBeneficialOwnership(
          await assetToken.getAddress(),
          await vault.getAddress(),
          investor2.address,
          100
        )
      ).to.be.revertedWith("OwnershipSyncManager: unauthorized caller");
    });
  });

  describe("P2P Transfers and Beneficial Ownership Updates", function () {
    it("Should update beneficial ownership for sender and receiver upon vault share transfer", async function () {
      const depositAmount = ethers.parseEther("200");
      const transferAmount = ethers.parseEther("50");

      // 1. Investor1 deposits
      await assetToken.connect(investor1).approve(await vault.getAddress(), depositAmount);
      await vault.connect(investor1).deposit(depositAmount, investor1.address);

      const bal1Before = await vault.balanceOf(investor1.address);
      const bal2Before = await vault.balanceOf(investor2.address);

      // 2. Perform transfer from investor1 to investor2
      await vault.connect(investor1).transfer(investor2.address, transferAmount);

      const bal1After = await vault.balanceOf(investor1.address);
      const bal2After = await vault.balanceOf(investor2.address);

      // 3. Verify on-chain beneficial ownership records in AssetRegistry match the new vault share balances
      const record1 = await assetRegistry.getBeneficialOwner(
        await assetToken.getAddress(),
        await vault.getAddress(),
        investor1.address
      );
      const record2 = await assetRegistry.getBeneficialOwner(
        await assetToken.getAddress(),
        await vault.getAddress(),
        investor2.address
      );

      expect(record1.vaultShares).to.equal(bal1After);
      expect(record2.vaultShares).to.equal(bal2After);
      expect(record1.vaultShares).to.equal(bal1Before - transferAmount);
      expect(record2.vaultShares).to.equal(bal2Before + transferAmount);
    });
  });
});
