const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const ethers = require("hardhat").ethers;

describe("SyncVault (ERC-4626)", function () {
  async function deployVaultFixture() {
    const [owner, user1, user2] = await ethers.getSigners();

    // Deploy mock asset token (ERC-20)
    const MockToken = await ethers.getContractFactory("MockERC20");
    const asset = await MockToken.deploy("Mock Asset", "MCK");
    await asset.waitForDeployment();

    // Mint tokens to users
    await asset.mint(user1.address, ethers.parseEther("10000"));
    await asset.mint(user2.address, ethers.parseEther("10000"));

    // Deploy SyncVault
    const SyncVault = await ethers.getContractFactory("SyncVault");
    const vault = await SyncVault.deploy(
      await asset.getAddress(),
      "Sync Vault Share",
      "svMCK",
      owner.address
    );
    await vault.waitForDeployment();

    // Approve vault to spend tokens
    await asset.connect(user1).approve(await vault.getAddress(), ethers.parseEther("10000"));
    await asset.connect(user2).approve(await vault.getAddress(), ethers.parseEther("10000"));

    return { vault, asset, owner, user1, user2 };
  }

  describe("Deployment", function () {
    it("Should set the correct asset address", async function () {
      const { vault, asset } = await loadFixture(deployVaultFixture);
      expect(await vault.asset()).to.equal(await asset.getAddress());
    });

    it("Should set the correct admin", async function () {
      const { vault, owner } = await loadFixture(deployVaultFixture);
      expect(await vault.hasRole(await vault.DEFAULT_ADMIN_ROLE(), owner.address)).to.be.true;
    });
  });

  describe("Deposits", function () {
    it("Should accept deposits and mint shares", async function () {
      const { vault, asset, user1 } = await loadFixture(deployVaultFixture);

      const depositAmount = ethers.parseEther("1000");
      await vault.connect(user1).deposit(depositAmount, user1.address);

      expect(await vault.balanceOf(user1.address)).to.be.closeTo(depositAmount, 1);
      expect(await asset.balanceOf(await vault.getAddress())).to.equal(depositAmount);
    });

    it("Should calculate shares correctly", async function () {
      const { vault, asset, user1, user2 } = await loadFixture(deployVaultFixture);

      // First deposit
      await vault.connect(user1).deposit(ethers.parseEther("1000"), user1.address);

      // Second deposit should get same rate
      await vault.connect(user2).deposit(ethers.parseEther("500"), user2.address);

      const shares1 = await vault.balanceOf(user1.address);
      const shares2 = await vault.balanceOf(user2.address);

      // Ratio should be 2:1 (1000:500)
      expect(shares1 * 2n / shares2).to.be.closeTo(2n, 100);
    });

    it("Should revert if not approved", async function () {
      const { vault, asset } = await loadFixture(deployVaultFixture);

      await expect(
        vault.deposit(ethers.parseEther("1000"), asset.getAddress())
      ).to.be.reverted;
    });
  });

  describe("Redemptions", function () {
    it("Should redeem shares for assets", async function () {
      const { vault, asset, user1 } = await loadFixture(deployVaultFixture);

      const depositAmount = ethers.parseEther("1000");
      await vault.connect(user1).deposit(depositAmount, user1.address);

      const shares = await vault.balanceOf(user1.address);
      await vault.connect(user1).approve(await vault.getAddress(), shares);
      await vault.connect(user1).redeem(shares, user1.address, user1.address);

      expect(await vault.balanceOf(user1.address)).to.equal(0);
      expect(await asset.balanceOf(user1.address)).to.be.greaterThan(depositAmount - ethers.parseEther("10"));
    });

    it("Should handle partial redemptions", async function () {
      const { vault, asset, user1 } = await loadFixture(deployVaultFixture);

      await vault.connect(user1).deposit(ethers.parseEther("1000"), user1.address);

      const shares = await vault.balanceOf(user1.address);
      const halfShares = shares / 2n;

      await vault.connect(user1).approve(await vault.getAddress(), halfShares);
      await vault.connect(user1).redeem(halfShares, user1.address, user1.address);

      expect(await vault.balanceOf(user1.address)).to.be.closeTo(halfShares, 1);
    });
  });

  describe("Yield Distribution", function () {
    it("Should increase share price when yield is distributed", async function () {
      const { vault, asset, owner, user1 } = await loadFixture(deployVaultFixture);

      // User deposits
      await vault.connect(user1).deposit(ethers.parseEther("1000"), user1.address);

      // Distribute yield (simulate rental income)
      const yieldAmount = ethers.parseEther("50");
      await asset.mint(owner.address, yieldAmount);
      await asset.connect(owner).approve(await vault.getAddress(), yieldAmount);
      await vault.connect(owner).distributeYield(yieldAmount);

      // Share price should increase
      const totalAssets = await vault.totalAssets();
      const totalSupply = await vault.totalSupply();

      // New depositor should get fewer shares for same amount
      await vault.connect(user1).deposit(ethers.parseEther("1000"), user1.address);
      const newShares = await vault.balanceOf(user1.address);

      // Should have less than 2x shares (due to yield)
      expect(newShares).to.be.lessThan(ethers.parseEther("2000"));
    });
  });

  describe("Conversions", function () {
    it("Should convert assets to shares correctly", async function () {
      const { vault, asset, user1 } = await loadFixture(deployVaultFixture);

      await vault.connect(user1).deposit(ethers.parseEther("1000"), user1.address);

      const assets = ethers.parseEther("100");
      const shares = await vault.convertToShares(assets);

      expect(shares).to.be.closeTo(assets, 1);
    });

    it("Should convert shares to assets correctly", async function () {
      const { vault, asset, user1 } = await loadFixture(deployVaultFixture);

      await vault.connect(user1).deposit(ethers.parseEther("1000"), user1.address);

      const shares = ethers.parseEther("100");
      const assets = await vault.convertToAssets(shares);

      expect(assets).to.be.closeTo(shares, 1);
    });
  });

  describe("Emergency Functions", function () {
    it("Should allow admin to emergency withdraw", async function () {
      const { vault, asset, owner, user1 } = await loadFixture(deployVaultFixture);

      await vault.connect(user1).deposit(ethers.parseEther("1000"), user1.address);

      const ownerBalanceBefore = await asset.balanceOf(owner.address);
      await vault.connect(owner).emergencyWithdraw(ethers.parseEther("100"), owner.address);
      const ownerBalanceAfter = await asset.balanceOf(owner.address);

      expect(ownerBalanceAfter - ownerBalanceBefore).to.equal(ethers.parseEther("100"));
    });

    it("Should prevent non-admin from emergency withdraw", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);

      await expect(
        vault.connect(user1).emergencyWithdraw(ethers.parseEther("100"), user1.address)
      ).to.be.reverted;
    });
  });
});
