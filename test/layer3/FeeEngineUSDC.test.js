const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
const FEE_MANAGER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("FEE_MANAGER_ROLE"));
const DISTRIBUTOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("DISTRIBUTOR_ROLE"));
const CHECKPOINT_ROLE = ethers.keccak256(ethers.toUtf8Bytes("CHECKPOINT_ROLE"));

describe("Layer 3 - FeeEngine & SyncVault USDC Fee Flow", function () {
  let feeEngine, syncVault, mockAsset, mockUSDC, identityRegistry, complianceModule;
  let admin, feeManager, distributor, protocolTreasury, issuerWallet, complianceFund, insuranceReserve, user1;

  const INITIAL_SUPPLY = ethers.parseEther("1000000"); // 18 decimals (RWA)
  const INITIAL_USDC = ethers.parseUnits("10000", 6); // 6 decimals (USDC)
  const DEPOSIT_AMOUNT = ethers.parseEther("1000"); // 18 decimals (RWA)

  beforeEach(async function () {
    [
      admin,
      feeManager,
      distributor,
      protocolTreasury,
      issuerWallet,
      complianceFund,
      insuranceReserve,
      user1
    ] = await ethers.getSigners();

    // 1. Deploy Mock RWA Asset (18 decimals)
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockAsset = await MockERC20.deploy("Mock RWA Token", "RWA");
    await mockAsset.waitForDeployment();

    // 2. Deploy Mock USDC (6 decimals)
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    mockUSDC = await MockUSDC.deploy();
    await mockUSDC.waitForDeployment();

    // 3. Deploy mock IdentityRegistry
    const IdentityRegistry = await ethers.getContractFactory(
      "contracts/identity/IdentityRegistry.sol:IdentityRegistry"
    );
    identityRegistry = await IdentityRegistry.deploy();
    await identityRegistry.waitForDeployment();

    // 4. Deploy mock ComplianceModule
    const ComplianceModule = await ethers.getContractFactory(
      "contracts/compliance/Compliance.sol:Compliance"
    );
    complianceModule = await ComplianceModule.deploy();
    await complianceModule.waitForDeployment();

    // 5. Deploy FeeEngine as proxy
    const FeeEngine = await ethers.getContractFactory("FeeEngine");
    feeEngine = await upgrades.deployProxy(
      FeeEngine,
      [admin.address, await mockUSDC.getAddress(), admin.address],
      { kind: "uups" }
    );

    // 6. Deploy SyncVault template and Clone
    const SyncVault = await ethers.getContractFactory("SyncVault");
    const syncVaultTemplate = await SyncVault.deploy();
    await syncVaultTemplate.waitForDeployment();

    const cleanAddress = (await syncVaultTemplate.getAddress()).toLowerCase().replace(/^0x/, "");
    const initCode = `0x602d8060093d393df3363d3d373d3d3d363d73${cleanAddress}5af43d82803e903d91602b57fd5bf3`;
    const tx = await admin.sendTransaction({ data: initCode });
    const receipt = await tx.wait();
    
    syncVault = SyncVault.attach(receipt.contractAddress);
    await syncVault.initialize(
      await mockAsset.getAddress(),
      "Sync Vault Token",
      "sVT",
      admin.address,
      await feeEngine.getAddress()
    );

    // Setup vault settings (default to address(0) to skip compliance in unit tests)
    await syncVault.connect(admin).setFeeEngine(await feeEngine.getAddress());

    // Setup roles in FeeEngine
    await feeEngine.grantRole(FEE_MANAGER_ROLE, feeManager.address);
    await feeEngine.grantRole(DISTRIBUTOR_ROLE, distributor.address);

    // Configure Vault Fees and Allocations in FeeEngine
    const config = {
      mgmtFeeBPS: 0,
      lastAccrualTs: 0,
      perfFeeBPS: 0,
      entryFeeBPS: 100, // 1.0% (100 BPS)
      exitFeeBPS: 50,  // 0.5% (50 BPS)
      tradingFeeBPS: 0,
      hurdleRateBPS: 0,
      useHWM: false
    };

    const allocation = {
      protocolTreasury: protocolTreasury.address,
      issuerWallet: issuerWallet.address,
      complianceFund: complianceFund.address,
      insuranceReserve: insuranceReserve.address,
      protocolBPS: 4000,   // 40%
      issuerBPS: 4000,     // 40%
      complianceBPS: 1000, // 10%
      insuranceBPS: 1000   // 10%
    };

    await feeEngine.connect(feeManager).registerVault(
      await syncVault.getAddress(),
      config,
      allocation
    );

    // Mint tokens to user1
    await mockAsset.mint(user1.address, INITIAL_SUPPLY);
    await mockUSDC.mint(user1.address, INITIAL_USDC);
  });

  describe("On-chain USDC Fee Collection (Deposit & Mint)", function () {
    it("Should successfully calculate, scale, and pull USDC entry fee during deposit", async function () {
      const vaultAddress = await syncVault.getAddress();
      const feeEngineAddress = await feeEngine.getAddress();

      // Approve RWA token to vault
      await mockAsset.connect(user1).approve(vaultAddress, DEPOSIT_AMOUNT);
      
      // Approve USDC to vault (for the entry fee)
      // Deposit = 1000 RWA (18 decimals).
      // Entry fee BPS = 100 (1.0%) -> 10 RWA (18 decimals) equivalent.
      // Scaling: 10 RWA (18 dec) -> 10 USDC (6 dec) = 10,000,000 units.
      const expectedFeeUSDC = ethers.parseUnits("10", 6);
      await mockUSDC.connect(user1).approve(vaultAddress, expectedFeeUSDC);

      const userAssetBefore = await mockAsset.balanceOf(user1.address);
      const userUSDCBefore = await mockUSDC.balanceOf(user1.address);
      const feeEngineUSDCBefore = await mockUSDC.balanceOf(feeEngineAddress);

      await syncVault.connect(user1).deposit(DEPOSIT_AMOUNT, user1.address);

      const userAssetAfter = await mockAsset.balanceOf(user1.address);
      const userUSDCAfter = await mockUSDC.balanceOf(user1.address);
      const feeEngineUSDCAfter = await mockUSDC.balanceOf(feeEngineAddress);

      // Verify asset transfer
      expect(userAssetBefore - userAssetAfter).to.equal(DEPOSIT_AMOUNT);
      // Verify USDC fee was pulled
      expect(userUSDCBefore - userUSDCAfter).to.equal(expectedFeeUSDC);
      expect(feeEngineUSDCAfter - feeEngineUSDCBefore).to.equal(expectedFeeUSDC);

      // Verify FeeEngine tracked the revenue
      expect(await feeEngine.feeRevenue(vaultAddress)).to.equal(expectedFeeUSDC);
    });

    it("Should successfully scale and pull USDC entry fee during mint", async function () {
      const vaultAddress = await syncVault.getAddress();
      const feeEngineAddress = await feeEngine.getAddress();

      // We want to mint 500 shares.
      // Since SyncVault is 1:1, minting 500 shares requires depositing 500 RWA.
      const sharesToMint = ethers.parseEther("500");
      const expectedAsset = ethers.parseEther("500");
      const expectedFeeUSDC = ethers.parseUnits("5", 6); // 1.0% of 500 = 5 USDC

      await mockAsset.connect(user1).approve(vaultAddress, expectedAsset);
      await mockUSDC.connect(user1).approve(vaultAddress, expectedFeeUSDC);

      await syncVault.connect(user1).mint(sharesToMint, user1.address);

      expect(await mockUSDC.balanceOf(feeEngineAddress)).to.equal(expectedFeeUSDC);
      expect(await feeEngine.feeRevenue(vaultAddress)).to.equal(expectedFeeUSDC);
    });
  });

  describe("On-chain USDC Fee Collection (Withdraw & Redeem)", function () {
    beforeEach(async function () {
      const vaultAddress = await syncVault.getAddress();
      // Setup: user1 deposits 1000 RWA first
      await mockAsset.connect(user1).approve(vaultAddress, DEPOSIT_AMOUNT);
      const entryFeeUSDC = ethers.parseUnits("10", 6);
      await mockUSDC.connect(user1).approve(vaultAddress, entryFeeUSDC);
      await syncVault.connect(user1).deposit(DEPOSIT_AMOUNT, user1.address);
    });

    it("Should successfully pull USDC exit fee during withdraw", async function () {
      const vaultAddress = await syncVault.getAddress();
      const feeEngineAddress = await feeEngine.getAddress();

      // Withdraw 400 RWA. Exit fee is 0.5% = 2 RWA = 2 USDC.
      const withdrawAmount = ethers.parseEther("400");
      const expectedExitFeeUSDC = ethers.parseUnits("2", 6);

      // User needs to approve SyncVault to spend USDC for the exit fee
      await mockUSDC.connect(user1).approve(vaultAddress, expectedExitFeeUSDC);

      const feeEngineUSDCBefore = await mockUSDC.balanceOf(feeEngineAddress);

      // Perform Withdraw (user1 is both owner and caller)
      await syncVault.connect(user1).withdraw(withdrawAmount, user1.address, user1.address);

      const feeEngineUSDCAfter = await mockUSDC.balanceOf(feeEngineAddress);
      expect(feeEngineUSDCAfter - feeEngineUSDCBefore).to.equal(expectedExitFeeUSDC);
      expect(await feeEngine.feeRevenue(vaultAddress)).to.equal(
        ethers.parseUnits("10", 6) + expectedExitFeeUSDC // 10 from deposit + 2 from withdraw
      );
    });

    it("Should successfully pull USDC exit fee during redeem", async function () {
      const vaultAddress = await syncVault.getAddress();
      const feeEngineAddress = await feeEngine.getAddress();

      // Redeem 200 shares. Equivalent to 200 RWA. Exit fee is 0.5% = 1 USDC.
      const sharesToRedeem = ethers.parseEther("200");
      const expectedExitFeeUSDC = ethers.parseUnits("1", 6);

      await mockUSDC.connect(user1).approve(vaultAddress, expectedExitFeeUSDC);

      const feeEngineUSDCBefore = await mockUSDC.balanceOf(feeEngineAddress);

      await syncVault.connect(user1).redeem(sharesToRedeem, user1.address, user1.address);

      const feeEngineUSDCAfter = await mockUSDC.balanceOf(feeEngineAddress);
      expect(feeEngineUSDCAfter - feeEngineUSDCBefore).to.equal(expectedExitFeeUSDC);
    });
  });

  describe("USDC Fee Distribution", function () {
    beforeEach(async function () {
      const vaultAddress = await syncVault.getAddress();
      // Setup: accumulate 10 USDC entry fee in FeeEngine
      await mockAsset.connect(user1).approve(vaultAddress, DEPOSIT_AMOUNT);
      const entryFeeUSDC = ethers.parseUnits("10", 6);
      await mockUSDC.connect(user1).approve(vaultAddress, entryFeeUSDC);
      await syncVault.connect(user1).deposit(DEPOSIT_AMOUNT, user1.address);
    });

    it("Should distribute accumulated USDC fees to allocation wallets", async function () {
      const vaultAddress = await syncVault.getAddress();

      // feeRevenue should be 10 USDC (10,000,000 units)
      expect(await feeEngine.feeRevenue(vaultAddress)).to.equal(ethers.parseUnits("10", 6));

      // Allocation balances before
      const protocolBefore = await mockUSDC.balanceOf(protocolTreasury.address);
      const issuerBefore = await mockUSDC.balanceOf(issuerWallet.address);
      const complianceBefore = await mockUSDC.balanceOf(complianceFund.address);
      const insuranceBefore = await mockUSDC.balanceOf(insuranceReserve.address);

      // Distribute Fees (distributor role calls it)
      await feeEngine.connect(distributor).distributeFees(vaultAddress);

      // Allocation balances after
      const protocolAfter = await mockUSDC.balanceOf(protocolTreasury.address);
      const issuerAfter = await mockUSDC.balanceOf(issuerWallet.address);
      const complianceAfter = await mockUSDC.balanceOf(complianceFund.address);
      const insuranceAfter = await mockUSDC.balanceOf(insuranceReserve.address);

      // Expected shares:
      // protocol BPS = 4000 (40%) -> 4 USDC
      // issuer BPS = 4000 (40%) -> 4 USDC
      // compliance BPS = 1000 (10%) -> 1 USDC
      // insurance BPS = 1000 (10%) -> 1 USDC
      expect(protocolAfter - protocolBefore).to.equal(ethers.parseUnits("4", 6));
      expect(issuerAfter - issuerBefore).to.equal(ethers.parseUnits("4", 6));
      expect(complianceAfter - complianceBefore).to.equal(ethers.parseUnits("1", 6));
      expect(insuranceAfter - insuranceBefore).to.equal(ethers.parseUnits("1", 6));

      // feeRevenue should be cleared to 0
      expect(await feeEngine.feeRevenue(vaultAddress)).to.equal(0);
    });
  });
});
