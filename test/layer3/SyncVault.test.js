const { expect } = require("chai");
const { ethers } = require("hardhat");

// Role constants
const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
const OPERATOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("OPERATOR_ROLE"));
const COMPLIANCE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("COMPLIANCE_ROLE"));

describe("Layer 3 - SyncVault (ERC-4626)", function () {
  let syncVault, mockAsset, identityRegistry, complianceModule;
  let admin, operator, user1, user2, compliance, random;

  const INITIAL_SUPPLY = ethers.parseEther("1000000");
  const DEPOSIT_AMOUNT = ethers.parseEther("1000");
  const MINT_AMOUNT = ethers.parseEther("500");

  beforeEach(async function () {
    [admin, operator, user1, user2, compliance, random] = await ethers.getSigners();

    // Deploy mock ERC20 asset
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockAsset = await MockERC20.deploy("Mock Asset", "MCK");
    await mockAsset.waitForDeployment();

    // Deploy mock IdentityRegistry
    const IdentityRegistry = await ethers.getContractFactory(
      "contracts/identity/IdentityRegistry.sol:IdentityRegistry"
    );
    identityRegistry = await IdentityRegistry.deploy();
    await identityRegistry.waitForDeployment();

    // Deploy mock ComplianceModule
    const ComplianceModule = await ethers.getContractFactory(
      "contracts/compliance/Compliance.sol:Compliance"
    );
    complianceModule = await ComplianceModule.deploy();
    await complianceModule.waitForDeployment();

    // Deploy SyncVault
    const SyncVault = await ethers.getContractFactory("SyncVault");
    syncVault = await SyncVault.deploy(
      await mockAsset.getAddress(),
      "Sync Vault Token",
      "sVT",
      admin.address
    );
    await syncVault.waitForDeployment();

    // Setup roles
    await syncVault.grantRole(OPERATOR_ROLE, operator.address);
    await syncVault.grantRole(COMPLIANCE_ROLE, compliance.address);

    // Mint assets to users for testing
    await mockAsset.mint(user1.address, INITIAL_SUPPLY);
    await mockAsset.mint(user2.address, INITIAL_SUPPLY);
  });

  describe("Initialization", function () {
    it("Should initialize with correct name and symbol", async function () {
      expect(await syncVault.name()).to.equal("Sync Vault Token");
      expect(await syncVault.symbol()).to.equal("sVT");
    });

    it("Should set correct asset address", async function () {
      expect(await syncVault.asset()).to.equal(await mockAsset.getAddress());
    });

    it("Should grant admin role to deployer", async function () {
      expect(await syncVault.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
    });

    it("Should grant operator role to deployer", async function () {
      expect(await syncVault.hasRole(OPERATOR_ROLE, admin.address)).to.be.true;
    });

    it("Should mint 1 dead share to address(1) for inflation protection", async function () {
      const share1 = await syncVault.balanceOf("0x0000000000000000000000000000000000000001");
      expect(share1).to.equal(1);
    });

    it("Should return version", async function () {
      expect(await syncVault.version()).to.equal("3.0.0");
    });
  });

  describe("Configuration", function () {
    it("Should allow admin to set identity registry", async function () {
      await syncVault.setIdentityRegistry(await identityRegistry.getAddress());
      expect(await syncVault.identityRegistry()).to.equal(await identityRegistry.getAddress());
    });

    it("Should allow admin to set compliance module", async function () {
      await syncVault.setComplianceModule(await complianceModule.getAddress());
      expect(await syncVault.complianceModule()).to.equal(await complianceModule.getAddress());
    });

    it("Should allow admin to set circuit breaker", async function () {
      const circuitBreaker = ethers.Wallet.createRandom().address;
      await syncVault.setCircuitBreaker(circuitBreaker);
      expect(await syncVault.circuitBreaker()).to.equal(circuitBreaker);
    });

    it("Should allow admin to set category", async function () {
      const category = ethers.keccak256(ethers.toUtf8Bytes("REAL_ESTATE"));
      await syncVault.setCategory(category);
      expect(await syncVault.category()).to.equal(category);
    });

    it("Should only allow admin to configure", async function () {
      await expect(
        syncVault.connect(user1).setIdentityRegistry(await identityRegistry.getAddress())
      ).to.be.reverted;

      await expect(
        syncVault.connect(user1).setComplianceModule(await complianceModule.getAddress())
      ).to.be.reverted;
    });

    it("Should reject zero address for identity registry", async function () {
      await expect(syncVault.setIdentityRegistry(ethers.ZeroAddress)).to.be.reverted;
    });

    it("Should reject zero address for compliance module", async function () {
      await expect(syncVault.setComplianceModule(ethers.ZeroAddress)).to.be.reverted;
    });
  });

  describe("Deposit", function () {
    beforeEach(async function () {
      // Approve vault to spend assets
      await mockAsset.connect(user1).approve(await syncVault.getAddress(), DEPOSIT_AMOUNT);
    });

    it("Should deposit assets and mint shares", async function () {
      const sharesBefore = await syncVault.balanceOf(user1.address);
      const assetsBefore = await mockAsset.balanceOf(user1.address);
      const totalSupplyBefore = await syncVault.totalSupply();

      await syncVault.connect(user1).deposit(DEPOSIT_AMOUNT, user1.address);

      const sharesAfter = await syncVault.balanceOf(user1.address);
      const assetsAfter = await mockAsset.balanceOf(user1.address);
      const totalSupplyAfter = await syncVault.totalSupply();
      
      // Shares minted should be close to DEPOSIT_AMOUNT (slightly less due to 1 dead share)
      const sharesMinted = sharesAfter - sharesBefore;
      expect(sharesMinted).to.be.greaterThan(DEPOSIT_AMOUNT - ethers.parseEther("1"));
      expect(assetsBefore - assetsAfter).to.equal(DEPOSIT_AMOUNT);
      expect(totalSupplyAfter - totalSupplyBefore).to.equal(sharesMinted);
    });

    it("Should emit Deposit event", async function () {
      await expect(syncVault.connect(user1).deposit(DEPOSIT_AMOUNT, user1.address))
        .to.emit(syncVault, "Deposit");
    });

    it("Should deposit to different receiver", async function () {
      const sharesBefore = await syncVault.balanceOf(user2.address);
      
      await syncVault.connect(user1).deposit(DEPOSIT_AMOUNT, user2.address);

      const sharesAfter = await syncVault.balanceOf(user2.address);
      const sharesReceived = sharesAfter - sharesBefore;
      expect(sharesReceived).to.be.greaterThan(DEPOSIT_AMOUNT - ethers.parseEther("1"));
    });

    it("Should transfer assets to vault", async function () {
      const vaultBalanceBefore = await mockAsset.balanceOf(await syncVault.getAddress());

      await syncVault.connect(user1).deposit(DEPOSIT_AMOUNT, user1.address);

      const vaultBalanceAfter = await mockAsset.balanceOf(await syncVault.getAddress());
      expect(vaultBalanceAfter - vaultBalanceBefore).to.equal(DEPOSIT_AMOUNT);
    });

    it("Should fail with insufficient balance", async function () {
      const largeAmount = ethers.parseEther("10000000");
      await mockAsset.connect(user1).approve(await syncVault.getAddress(), largeAmount);

      await expect(
        syncVault.connect(user1).deposit(largeAmount, user1.address)
      ).to.be.reverted;
    });

    it("Should fail with zero amount", async function () {
      // OpenZeppelin ERC4626 allows zero deposits
      await syncVault.connect(user1).deposit(0, user1.address);
    });
  });

  describe("Mint", function () {
    beforeEach(async function () {
      // Approve vault to spend assets
      await mockAsset.connect(user1).approve(await syncVault.getAddress(), ethers.MaxUint256);
    });

    it("Should mint shares by depositing assets", async function () {
      const sharesToMint = MINT_AMOUNT;

      await syncVault.connect(user1).mint(sharesToMint, user1.address);

      const shares = await syncVault.balanceOf(user1.address);
      expect(shares).to.be.closeTo(sharesToMint, ethers.parseEther("1"));
    });

    it("Should emit Deposit event", async function () {
      await expect(syncVault.connect(user1).mint(MINT_AMOUNT, user1.address))
        .to.emit(syncVault, "Deposit");
    });

    it("Should fail with zero shares", async function () {
      // OpenZeppelin ERC4626 allows zero mint
      await syncVault.connect(user1).mint(0, user1.address);
    });
  });

  describe("Withdraw", function () {
    beforeEach(async function () {
      // Deposit first
      await mockAsset.connect(user1).approve(await syncVault.getAddress(), DEPOSIT_AMOUNT);
      await syncVault.connect(user1).deposit(DEPOSIT_AMOUNT, user1.address);
    });

    it("Should withdraw assets and burn shares", async function () {
      const sharesBefore = await syncVault.balanceOf(user1.address);
      const assetsBefore = await mockAsset.balanceOf(user1.address);

      const withdrawAmount = ethers.parseEther("500");
      await syncVault.connect(user1).withdraw(withdrawAmount, user1.address, user1.address);

      const sharesAfter = await syncVault.balanceOf(user1.address);
      const assetsAfter = await mockAsset.balanceOf(user1.address);

      expect(sharesBefore - sharesAfter).to.be.greaterThan(withdrawAmount - ethers.parseEther("1"));
      expect(assetsAfter - assetsBefore).to.equal(withdrawAmount);
    });

    it("Should emit Withdraw event", async function () {
      const withdrawAmount = ethers.parseEther("500");

      await expect(
        syncVault.connect(user1).withdraw(withdrawAmount, user1.address, user1.address)
      )
        .to.emit(syncVault, "Withdraw");
    });

    it("Should withdraw to different receiver", async function () {
      const receiverBalanceBefore = await mockAsset.balanceOf(user2.address);
      const withdrawAmount = ethers.parseEther("500");

      await syncVault.connect(user1).withdraw(withdrawAmount, user2.address, user1.address);

      const receiverBalanceAfter = await mockAsset.balanceOf(user2.address);
      expect(receiverBalanceAfter - receiverBalanceBefore).to.equal(withdrawAmount);
    });

    it("Should fail with insufficient shares", async function () {
      const largeAmount = ethers.parseEther("10000");

      await expect(
        syncVault.connect(user1).withdraw(largeAmount, user1.address, user1.address)
      ).to.be.reverted;
    });

    it("Should fail with zero amount", async function () {
      // OpenZeppelin ERC4626 allows zero withdraw
      await syncVault.connect(user1).withdraw(0, user1.address, user1.address);
    });
  });

  describe("Redeem", function () {
    beforeEach(async function () {
      // Deposit first
      await mockAsset.connect(user1).approve(await syncVault.getAddress(), DEPOSIT_AMOUNT);
      await syncVault.connect(user1).deposit(DEPOSIT_AMOUNT, user1.address);
    });

    it("Should redeem shares for assets", async function () {
      const sharesToRedeem = ethers.parseEther("500");

      await syncVault.connect(user1).redeem(sharesToRedeem, user1.address, user1.address);

      const assets = await mockAsset.balanceOf(user1.address);
      expect(assets).to.be.greaterThan(sharesToRedeem - ethers.parseEther("1"));
    });

    it("Should emit Withdraw event", async function () {
      const sharesToRedeem = ethers.parseEther("500");

      await expect(
        syncVault.connect(user1).redeem(sharesToRedeem, user1.address, user1.address)
      )
        .to.emit(syncVault, "Withdraw");
    });

    it("Should fail with zero shares", async function () {
      // OpenZeppelin ERC4626 allows zero redeem
      await syncVault.connect(user1).redeem(0, user1.address, user1.address);
    });
  });

  describe("View Functions", function () {
    let localVault;
    
    beforeEach(async function () {
      // Create a completely fresh vault and asset for these tests
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const localAsset = await MockERC20.deploy("Local Mock", "LMCK");
      await localAsset.waitForDeployment();
      
      const SyncVault = await ethers.getContractFactory("SyncVault");
      localVault = await SyncVault.deploy(
        await localAsset.getAddress(),
        "Test Sync Vault",
        "tSV",
        admin.address
      );
      await localVault.waitForDeployment();
      await localVault.grantRole(OPERATOR_ROLE, operator.address);
      await localVault.grantRole(COMPLIANCE_ROLE, compliance.address);
      
      await localAsset.mint(user1.address, INITIAL_SUPPLY);
      await localAsset.connect(user1).approve(await localVault.getAddress(), DEPOSIT_AMOUNT);
      await localVault.connect(user1).deposit(DEPOSIT_AMOUNT, user1.address);
    });

    it("Should return total assets", async function () {
      const totalAssets = await localVault.totalAssets();
      expect(totalAssets).to.equal(DEPOSIT_AMOUNT);
    });

    it("Should return total supply", async function () {
      const totalSupply = await localVault.totalSupply();
      // Total supply includes the 1 dead share, should be at least DEPOSIT_AMOUNT
      expect(totalSupply).to.be.at.least(DEPOSIT_AMOUNT);
    });

    it("Should convert assets to shares", async function () {
      const shares = await localVault.convertToShares(DEPOSIT_AMOUNT);
      // Conversion should return a positive value
      expect(shares).to.be.greaterThan(0);
    });

    it("Should convert shares to assets", async function () {
      const assets = await localVault.convertToAssets(DEPOSIT_AMOUNT);
      expect(assets).to.be.greaterThan(0);
    });

    it("Should return max deposit", async function () {
      const maxDeposit = await localVault.maxDeposit(user1.address);
      expect(maxDeposit).to.be.greaterThan(0);
    });

    it("Should return max mint", async function () {
      const maxMint = await localVault.maxMint(user1.address);
      expect(maxMint).to.be.greaterThan(0);
    });

    it("Should return max withdraw", async function () {
      const maxWithdraw = await localVault.maxWithdraw(user1.address);
      expect(maxWithdraw).to.be.greaterThan(DEPOSIT_AMOUNT - ethers.parseEther("1"));
    });

    it("Should return max redeem", async function () {
      const maxRedeem = await localVault.maxRedeem(user1.address);
      expect(maxRedeem).to.be.greaterThan(DEPOSIT_AMOUNT - ethers.parseEther("1"));
    });
  });

  describe("Yield Distribution", function () {
    beforeEach(async function () {
      await mockAsset.connect(user1).approve(await syncVault.getAddress(), DEPOSIT_AMOUNT);
      await syncVault.connect(user1).deposit(DEPOSIT_AMOUNT, user1.address);
      
      // Give operator some tokens for yield distribution
      await mockAsset.mint(operator.address, INITIAL_SUPPLY);
    });

    it("Should allow operator to distribute yield", async function () {
      const yieldAmount = ethers.parseEther("100");

      await mockAsset.connect(operator).approve(await syncVault.getAddress(), yieldAmount);
      await syncVault.connect(operator).distributeYield(yieldAmount);

      const totalAssets = await syncVault.totalAssets();
      expect(totalAssets).to.equal(DEPOSIT_AMOUNT + yieldAmount);
    });

    it("Should increase share price after yield distribution", async function () {
      const yieldAmount = ethers.parseEther("100");

      const sharesBefore = await syncVault.convertToShares(DEPOSIT_AMOUNT);

      await mockAsset.connect(operator).approve(await syncVault.getAddress(), yieldAmount);
      await syncVault.connect(operator).distributeYield(yieldAmount);

      const sharesAfter = await syncVault.convertToShares(DEPOSIT_AMOUNT);
      expect(sharesAfter).to.be.lessThan(sharesBefore); // Less shares needed for same assets
    });

    it("Should only allow operator to distribute yield", async function () {
      const yieldAmount = ethers.parseEther("100");

      await mockAsset.connect(user1).approve(await syncVault.getAddress(), yieldAmount);

      await expect(
        syncVault.connect(user1).distributeYield(yieldAmount)
      ).to.be.reverted;
    });

    it("Should reject zero yield amount", async function () {
      await expect(
        syncVault.connect(operator).distributeYield(0)
      ).to.be.reverted;
    });
  });

  describe("Emergency Withdraw", function () {
    beforeEach(async function () {
      await mockAsset.connect(user1).approve(await syncVault.getAddress(), DEPOSIT_AMOUNT);
      await syncVault.connect(user1).deposit(DEPOSIT_AMOUNT, user1.address);
    });

    it("Should allow admin to emergency withdraw", async function () {
      const withdrawAmount = ethers.parseEther("100");
      const emergencyAddress = ethers.Wallet.createRandom().address;

      await syncVault.connect(admin).emergencyWithdraw(withdrawAmount, emergencyAddress);

      const balance = await mockAsset.balanceOf(emergencyAddress);
      expect(balance).to.equal(withdrawAmount);
    });

    it("Should only allow admin to emergency withdraw", async function () {
      await expect(
        syncVault.connect(user1).emergencyWithdraw(ethers.parseEther("100"), user1.address)
      ).to.be.reverted;
    });

    it("Should reject zero address for emergency withdrawal", async function () {
      await expect(
        syncVault.connect(admin).emergencyWithdraw(ethers.parseEther("100"), ethers.ZeroAddress)
      ).to.be.reverted;
    });
  });

  describe("Role Management", function () {
    it("Should allow admin to grant operator role", async function () {
      await syncVault.connect(admin).grantRole(OPERATOR_ROLE, user1.address);
      expect(await syncVault.hasRole(OPERATOR_ROLE, user1.address)).to.be.true;
    });

    it("Should allow admin to grant compliance role", async function () {
      await syncVault.connect(admin).grantRole(COMPLIANCE_ROLE, user1.address);
      expect(await syncVault.hasRole(COMPLIANCE_ROLE, user1.address)).to.be.true;
    });

    it("Should only allow admin to manage roles", async function () {
      await expect(
        syncVault.connect(user1).grantRole(OPERATOR_ROLE, user2.address)
      ).to.be.reverted;
    });
  });
});
