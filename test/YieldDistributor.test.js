const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const ethers = require("hardhat").ethers;

describe("YieldDistributor", function () {
  async function deployYieldFixture() {
    const [owner, distributor, vault, user1] = await ethers.getSigners();

    // Deploy mock asset
    const MockToken = await ethers.getContractFactory("MockERC20");
    const asset = await MockToken.deploy("Mock Asset", "MCK");
    await asset.waitForDeployment();

    // Deploy YieldDistributor
    const YieldDistributor = await ethers.getContractFactory("YieldDistributor");
    const yieldDist = await YieldDistributor.deploy(owner.address);
    await yieldDist.waitForDeployment();

    // Grant distributor role
    const DISTRIBUTOR_ROLE = await yieldDist.DISTRIBUTOR_ROLE();
    await yieldDist.connect(owner).grantRole(DISTRIBUTOR_ROLE, distributor.address);

    // Mint tokens to distributor
    await asset.mint(distributor.address, ethers.parseEther("100000"));

    return { yieldDist, asset, owner, distributor, vault, user1 };
  }

  describe("Deployment", function () {
    it("Should set the correct admin", async function () {
      const { yieldDist, owner } = await loadFixture(deployYieldFixture);
      expect(await yieldDist.hasRole(await yieldDist.DEFAULT_ADMIN_ROLE(), owner.address)).to.be.true;
    });
  });

  describe("Yield Schedule Management", function () {
    it("Should create a yield schedule", async function () {
      const { yieldDist, asset, owner, vault } = await loadFixture(deployYieldFixture);

      const tx = await yieldDist.connect(owner).createYieldSchedule(
        vault.address,
        "Monthly Rent",
        await asset.getAddress(),
        ethers.parseEther("1000"),
        30 * 24 * 60 * 60, // 30 days
        0 // RENTAL_INCOME
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => log.fragment?.name === "YieldScheduleCreated");
      const scheduleId = event.args.scheduleId;

      const schedule = await yieldDist.getYieldSchedule(vault.address, scheduleId);
      expect(schedule.name).to.equal("Monthly Rent");
      expect(schedule.active).to.be.true;
    });

    it("Should emit YieldScheduleCreated event", async function () {
      const { yieldDist, asset, owner, vault } = await loadFixture(deployYieldFixture);

      await expect(
        yieldDist.connect(owner).createYieldSchedule(
          vault.address,
          "Monthly Rent",
          await asset.getAddress(),
          ethers.parseEther("1000"),
          30 * 24 * 60 * 60,
          0
        )
      )
        .to.emit(yieldDist, "YieldScheduleCreated");
    });

    it("Should allow updating yield schedule", async function () {
      const { yieldDist, asset, owner, vault } = await loadFixture(deployYieldFixture);

      const tx = await yieldDist.connect(owner).createYieldSchedule(
        vault.address,
        "Monthly Rent",
        await asset.getAddress(),
        ethers.parseEther("1000"),
        30 * 24 * 60 * 60,
        0
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => log.fragment?.name === "YieldScheduleCreated");
      const scheduleId = event.args.scheduleId;

      await yieldDist.connect(owner).updateYieldSchedule(
        vault.address,
        scheduleId,
        ethers.parseEther("1500"),
        15 * 24 * 60 * 60
      );

      const schedule = await yieldDist.getYieldSchedule(vault.address, scheduleId);
      expect(schedule.amount).to.equal(ethers.parseEther("1500"));
      expect(schedule.frequency).to.equal(15 * 24 * 60 * 60);
    });

    it("Should allow deactivating yield schedule", async function () {
      const { yieldDist, asset, owner, vault } = await loadFixture(deployYieldFixture);

      const tx = await yieldDist.connect(owner).createYieldSchedule(
        vault.address,
        "Monthly Rent",
        await asset.getAddress(),
        ethers.parseEther("1000"),
        30 * 24 * 60 * 60,
        0
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => log.fragment?.name === "YieldScheduleCreated");
      const scheduleId = event.args.scheduleId;

      await yieldDist.connect(owner).deactivateYieldSchedule(vault.address, scheduleId);

      const schedule = await yieldDist.getYieldSchedule(vault.address, scheduleId);
      expect(schedule.active).to.be.false;
    });
  });

  describe("Yield Distribution", function () {
    it("Should distribute yield to vault", async function () {
      const { yieldDist, asset, distributor, vault } = await loadFixture(deployYieldFixture);

      const tx = await yieldDist.createYieldSchedule(
        vault.address,
        "Monthly Rent",
        await asset.getAddress(),
        ethers.parseEther("1000"),
        30 * 24 * 60 * 60,
        0
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => log.fragment?.name === "YieldScheduleCreated");
      const scheduleId = event.args.scheduleId;

      await asset.connect(distributor).approve(await yieldDist.getAddress(), ethers.parseEther("1000"));

      await yieldDist.connect(distributor).distributeYield(
        vault.address,
        ethers.parseEther("1000"),
        scheduleId
      );

      const pendingYield = await yieldDist.getPendingYield(vault.address);
      expect(pendingYield).to.equal(ethers.parseEther("1000"));
    });

    it("Should emit YieldDistributed event", async function () {
      const { yieldDist, asset, distributor, vault } = await loadFixture(deployYieldFixture);

      const tx = await yieldDist.createYieldSchedule(
        vault.address,
        "Monthly Rent",
        await asset.getAddress(),
        ethers.parseEther("1000"),
        30 * 24 * 60 * 60,
        0
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => log.fragment?.name === "YieldScheduleCreated");
      const scheduleId = event.args.scheduleId;

      await asset.connect(distributor).approve(await yieldDist.getAddress(), ethers.parseEther("1000"));

      await expect(
        yieldDist.connect(distributor).distributeYield(
          vault.address,
          ethers.parseEther("1000"),
          scheduleId
        )
      )
        .to.emit(yieldDist, "YieldDistributed");
    });

    it("Should update schedule on distribution", async function () {
      const { yieldDist, asset, distributor, vault } = await loadFixture(deployYieldFixture);

      const tx = await yieldDist.createYieldSchedule(
        vault.address,
        "Monthly Rent",
        await asset.getAddress(),
        ethers.parseEther("1000"),
        30 * 24 * 60 * 60,
        0
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => log.fragment?.name === "YieldScheduleCreated");
      const scheduleId = event.args.scheduleId;

      await asset.connect(distributor).approve(await yieldDist.getAddress(), ethers.parseEther("1000"));

      const beforeDist = await yieldDist.getYieldSchedule(vault.address, scheduleId);
      await yieldDist.connect(distributor).distributeYield(
        vault.address,
        ethers.parseEther("1000"),
        scheduleId
      );
      const afterDist = await yieldDist.getYieldSchedule(vault.address, scheduleId);

      expect(afterDist.lastDistribution).to.be.greaterThan(beforeDist.lastDistribution);
    });

    it("Should track yield history", async function () {
      const { yieldDist, asset, distributor, vault } = await loadFixture(deployYieldFixture);

      const tx = await yieldDist.createYieldSchedule(
        vault.address,
        "Monthly Rent",
        await asset.getAddress(),
        ethers.parseEther("1000"),
        30 * 24 * 60 * 60,
        0
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => log.fragment?.name === "YieldScheduleCreated");
      const scheduleId = event.args.scheduleId;

      await asset.connect(distributor).approve(await yieldDist.getAddress(), ethers.parseEther("1000"));
      await yieldDist.connect(distributor).distributeYield(
        vault.address,
        ethers.parseEther("1000"),
        scheduleId
      );

      const history = await yieldDist.getYieldHistory(vault.address, scheduleId);
      expect(history.length).to.equal(1);
      expect(history[0].amount).to.equal(ethers.parseEther("1000"));
    });
  });

  describe("View Functions", function () {
    it("Should return yield schedule details", async function () {
      const { yieldDist, asset, owner, vault } = await loadFixture(deployYieldFixture);

      const tx = await yieldDist.connect(owner).createYieldSchedule(
        vault.address,
        "Monthly Rent",
        await asset.getAddress(),
        ethers.parseEther("1000"),
        30 * 24 * 60 * 60,
        0
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => log.fragment?.name === "YieldScheduleCreated");
      const scheduleId = event.args.scheduleId;

      const schedule = await yieldDist.getYieldSchedule(vault.address, scheduleId);
      expect(schedule.name).to.equal("Monthly Rent");
      expect(schedule.amount).to.equal(ethers.parseEther("1000"));
      expect(schedule.frequency).to.equal(30 * 24 * 60 * 60);
    });

    it("Should check if yield is due", async function () {
      const { yieldDist, asset, owner, vault } = await loadFixture(deployYieldFixture);

      const tx = await yieldDist.connect(owner).createYieldSchedule(
        vault.address,
        "Monthly Rent",
        await asset.getAddress(),
        ethers.parseEther("1000"),
        30 * 24 * 60 * 60,
        0
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => log.fragment?.name === "YieldScheduleCreated");
      const scheduleId = event.args.scheduleId;

      // Not due yet
      let isDue = await yieldDist.isYieldDue(vault.address, scheduleId);
      expect(isDue).to.be.false;

      // Fast forward 31 days
      await time.increase(31 * 24 * 60 * 60);

      // Now due
      isDue = await yieldDist.isYieldDue(vault.address, scheduleId);
      expect(isDue).to.be.true;
    });
  });

  describe("Emergency Functions", function () {
    it("Should allow admin to emergency withdraw", async function () {
      const { yieldDist, asset, owner, distributor } = await loadFixture(deployYieldFixture);

      await asset.connect(distributor).transfer(await yieldDist.getAddress(), ethers.parseEther("500"));

      const ownerBalanceBefore = await asset.balanceOf(owner.address);
      await yieldDist.connect(owner).emergencyWithdraw(
        await asset.getAddress(),
        ethers.parseEther("500"),
        owner.address
      );
      const ownerBalanceAfter = await asset.balanceOf(owner.address);

      expect(ownerBalanceAfter - ownerBalanceBefore).to.equal(ethers.parseEther("500"));
    });

    it("Should prevent non-admin from emergency withdraw", async function () {
      const { yieldDist, asset, distributor } = await loadFixture(deployYieldFixture);

      await expect(
        yieldDist.connect(distributor).emergencyWithdraw(
          await asset.getAddress(),
          ethers.parseEther("500"),
          distributor.address
        )
      ).to.be.reverted;
    });
  });
});
