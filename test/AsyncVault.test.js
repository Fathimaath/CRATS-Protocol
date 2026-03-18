const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const ethers = require("hardhat").ethers;

describe("AsyncVault (ERC-7540)", function () {
  async function deployVaultFixture() {
    const [owner, fulfiller, user1, user2] = await ethers.getSigners();

    // Deploy mock asset token
    const MockToken = await ethers.getContractFactory("MockERC20");
    const asset = await MockToken.deploy("Mock Asset", "MCK");
    await asset.waitForDeployment();

    // Mint tokens to users
    await asset.mint(user1.address, ethers.parseEther("10000"));
    await asset.mint(user2.address, ethers.parseEther("10000"));

    // Deploy AsyncVault
    const AsyncVault = await ethers.getContractFactory("AsyncVault");
    const vault = await AsyncVault.deploy(
      await asset.getAddress(),
      "Async Vault Share",
      "avMCK",
      owner.address
    );
    await vault.waitForDeployment();

    // Grant fulfiller role
    const FULFILLER_ROLE = await vault.FULFILLER_ROLE();
    await vault.connect(owner).grantRole(FULFILLER_ROLE, fulfiller.address);

    // Approve vault to spend tokens
    await asset.connect(user1).approve(await vault.getAddress(), ethers.parseEther("10000"));
    await asset.connect(user2).approve(await vault.getAddress(), ethers.parseEther("10000"));

    return { vault, asset, owner, fulfiller, user1, user2 };
  }

  describe("Deployment", function () {
    it("Should set the correct asset address", async function () {
      const { vault, asset } = await loadFixture(deployVaultFixture);
      expect(await vault.asset()).to.equal(await asset.getAddress());
    });

    it("Should set the correct settlement period", async function () {
      const { vault } = await loadFixture(deployVaultFixture);
      expect(await vault.settlementPeriod()).to.equal(24 * 60 * 60); // 24 hours
    });
  });

  describe("Async Deposits", function () {
    it("Should accept deposit requests", async function () {
      const { vault, asset, user1 } = await loadFixture(deployVaultFixture);

      const depositAmount = ethers.parseEther("1000");
      await vault.connect(user1).requestDeposit(depositAmount, user1.address, user1.address);

      const pendingAssets = await vault.pendingDepositRequest(0, user1.address);
      expect(pendingAssets).to.equal(depositAmount);

      // Assets should be transferred to vault
      expect(await asset.balanceOf(await vault.getAddress())).to.equal(depositAmount);
    });

    it("Should emit DepositRequest event", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);

      await expect(
        vault.connect(user1).requestDeposit(ethers.parseEther("1000"), user1.address, user1.address)
      )
        .to.emit(vault, "DepositRequest")
        .withArgs(
          user1.address,
          user1.address,
          0,
          user1.address,
          ethers.parseEther("1000")
        );
    });

    it("Should allow operator to request deposit", async function () {
      const { vault, user1, user2 } = await loadFixture(deployVaultFixture);

      // Set user2 as operator for user1
      await vault.connect(user1).setOperator(user2.address, true);

      await vault.connect(user2).requestDeposit(
        ethers.parseEther("500"),
        user1.address,
        user1.address
      );

      const pendingAssets = await vault.pendingDepositRequest(0, user1.address);
      expect(pendingAssets).to.equal(ethers.parseEther("500"));
    });

    it("Should prevent non-operator from requesting deposit", async function () {
      const { vault, user1, user2 } = await loadFixture(deployVaultFixture);

      await expect(
        vault.connect(user2).requestDeposit(
          ethers.parseEther("500"),
          user1.address,
          user1.address
        )
      ).to.be.revertedWith("AsyncVault: Invalid caller");
    });
  });

  describe("Deposit Fulfillment", function () {
    it("Should fulfill deposit requests", async function () {
      const { vault, asset, fulfiller, user1 } = await loadFixture(deployVaultFixture);

      const depositAmount = ethers.parseEther("1000");
      await vault.connect(user1).requestDeposit(depositAmount, user1.address, user1.address);

      // Fulfill the request
      await vault.connect(fulfiller).fulfillDeposit(user1.address, depositAmount);

      const claimableAssets = await vault.claimableDepositRequest(0, user1.address);
      expect(claimableAssets).to.equal(depositAmount);
    });

    it("Should prevent non-fulfiller from fulfilling", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);

      await vault.connect(user1).requestDeposit(ethers.parseEther("1000"), user1.address, user1.address);

      await expect(
        vault.connect(user1).fulfillDeposit(user1.address, ethers.parseEther("1000"))
      ).to.be.reverted;
    });

    it("Should allow partial fulfillment", async function () {
      const { vault, fulfiller, user1 } = await loadFixture(deployVaultFixture);

      const depositAmount = ethers.parseEther("1000");
      await vault.connect(user1).requestDeposit(depositAmount, user1.address, user1.address);

      // Partial fulfillment
      await vault.connect(fulfiller).fulfillDeposit(user1.address, ethers.parseEther("500"));

      const claimableAssets = await vault.claimableDepositRequest(0, user1.address);
      expect(claimableAssets).to.equal(ethers.parseEther("500"));

      // Remaining should still be pending
      const pendingAssets = await vault.pendingDepositRequest(0, user1.address);
      expect(pendingAssets).to.equal(ethers.parseEther("500"));
    });
  });

  describe("Claiming Deposits", function () {
    it("Should allow claiming shares after fulfillment", async function () {
      const { vault, fulfiller, user1 } = await loadFixture(deployVaultFixture);

      const depositAmount = ethers.parseEther("1000");
      await vault.connect(user1).requestDeposit(depositAmount, user1.address, user1.address);
      await vault.connect(fulfiller).fulfillDeposit(user1.address, depositAmount);

      // Claim shares
      await vault.connect(user1).deposit(depositAmount, user1.address, user1.address);

      const shares = await vault.balanceOf(user1.address);
      expect(shares).to.be.closeTo(depositAmount, 1);
    });

    it("Should prevent claiming before fulfillment", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);

      await vault.connect(user1).requestDeposit(ethers.parseEther("1000"), user1.address, user1.address);

      // Try to claim without fulfillment
      await expect(
        vault.connect(user1).deposit(ethers.parseEther("1000"), user1.address, user1.address)
      ).to.be.reverted;
    });
  });

  describe("Async Redemptions", function () {
    it("Should accept redeem requests", async function () {
      const { vault, fulfiller, user1 } = await loadFixture(deployVaultFixture);

      // First deposit to get shares
      await vault.connect(user1).requestDeposit(ethers.parseEther("1000"), user1.address, user1.address);
      await vault.connect(fulfiller).fulfillDeposit(user1.address, ethers.parseEther("1000"));
      await vault.connect(user1).deposit(ethers.parseEther("1000"), user1.address, user1.address);

      // Request redemption
      const shares = ethers.parseEther("500");
      await vault.connect(user1).requestRedeem(shares, user1.address, user1.address);

      const pendingShares = await vault.pendingRedeemRequest(0, user1.address);
      expect(pendingShares).to.equal(shares);
    });

    it("Should transfer shares to vault on redeem request", async function () {
      const { vault, fulfiller, user1 } = await loadFixture(deployVaultFixture);

      // Deposit
      await vault.connect(user1).requestDeposit(ethers.parseEther("1000"), user1.address, user1.address);
      await vault.connect(fulfiller).fulfillDeposit(user1.address, ethers.parseEther("1000"));
      await vault.connect(user1).deposit(ethers.parseEther("1000"), user1.address, user1.address);

      const sharesBefore = await vault.balanceOf(user1.address);

      // Request redemption
      await vault.connect(user1).requestRedeem(ethers.parseEther("500"), user1.address, user1.address);

      const sharesAfter = await vault.balanceOf(user1.address);
      expect(sharesAfter).to.equal(sharesBefore - ethers.parseEther("500"));
    });

    it("Should fulfill redeem requests", async function () {
      const { vault, fulfiller, user1 } = await loadFixture(deployVaultFixture);

      // Deposit
      await vault.connect(user1).requestDeposit(ethers.parseEther("1000"), user1.address, user1.address);
      await vault.connect(fulfiller).fulfillDeposit(user1.address, ethers.parseEther("1000"));
      await vault.connect(user1).deposit(ethers.parseEther("1000"), user1.address, user1.address);

      // Request redemption
      await vault.connect(user1).requestRedeem(ethers.parseEther("500"), user1.address, user1.address);

      // Fulfill
      await vault.connect(fulfiller).fulfillRedeem(user1.address, ethers.parseEther("500"));

      const claimableShares = await vault.claimableRedeemRequest(0, user1.address);
      expect(claimableShares).to.equal(ethers.parseEther("500"));
    });

    it("Should allow claiming assets after fulfillment", async function () {
      const { vault, asset, fulfiller, user1 } = await loadFixture(deployVaultFixture);

      // Deposit
      await vault.connect(user1).requestDeposit(ethers.parseEther("1000"), user1.address, user1.address);
      await vault.connect(fulfiller).fulfillDeposit(user1.address, ethers.parseEther("1000"));
      await vault.connect(user1).deposit(ethers.parseEther("1000"), user1.address, user1.address);

      // Request and fulfill redemption
      await vault.connect(user1).requestRedeem(ethers.parseEther("500"), user1.address, user1.address);
      await vault.connect(fulfiller).fulfillRedeem(user1.address, ethers.parseEther("500"));

      const assetsBefore = await asset.balanceOf(user1.address);

      // Claim
      await vault.connect(user1).redeem(ethers.parseEther("500"), user1.address, user1.address);

      const assetsAfter = await asset.balanceOf(user1.address);
      expect(assetsAfter - assetsBefore).to.be.greaterThan(ethers.parseEther("100"));
    });
  });

  describe("Operator Management", function () {
    it("Should allow setting operators", async function () {
      const { vault, user1, user2 } = await loadFixture(deployVaultFixture);

      await vault.connect(user1).setOperator(user2.address, true);

      const isOperator = await vault.isOperator(user1.address, user2.address);
      expect(isOperator).to.be.true;
    });

    it("Should emit OperatorSet event", async function () {
      const { vault, user1, user2 } = await loadFixture(deployVaultFixture);

      await expect(
        vault.connect(user1).setOperator(user2.address, true)
      )
        .to.emit(vault, "OperatorSet")
        .withArgs(user1.address, user2.address, true);
    });

    it("Should allow revoking operators", async function () {
      const { vault, user1, user2 } = await loadFixture(deployVaultFixture);

      await vault.connect(user1).setOperator(user2.address, true);
      await vault.connect(user1).setOperator(user2.address, false);

      const isOperator = await vault.isOperator(user1.address, user2.address);
      expect(isOperator).to.be.false;
    });
  });

  describe("Settlement Period", function () {
    it("Should allow admin to set settlement period", async function () {
      const { vault, owner } = await loadFixture(deployVaultFixture);

      await vault.connect(owner).setSettlementPeriod(48 * 60 * 60); // 48 hours

      expect(await vault.settlementPeriod()).to.equal(48 * 60 * 60);
    });

    it("Should allow anyone to set settlement period (public function)", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);

      // Note: In production, this should be restricted to admin only
      await vault.connect(user1).setSettlementPeriod(48 * 60 * 60);

      expect(await vault.settlementPeriod()).to.equal(48 * 60 * 60);
    });
  });

  describe("Emergency Functions", function () {
    it("Should allow admin to emergency withdraw", async function () {
      const { vault, asset, owner, user1 } = await loadFixture(deployVaultFixture);

      await vault.connect(user1).requestDeposit(ethers.parseEther("1000"), user1.address, user1.address);

      const ownerBalanceBefore = await asset.balanceOf(owner.address);
      await vault.connect(owner).emergencyWithdraw(ethers.parseEther("100"), owner.address);
      const ownerBalanceAfter = await asset.balanceOf(owner.address);

      expect(ownerBalanceAfter - ownerBalanceBefore).to.equal(ethers.parseEther("100"));
    });
  });
});
