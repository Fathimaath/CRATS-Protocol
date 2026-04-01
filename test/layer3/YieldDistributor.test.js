const { expect } = require("chai");
const { ethers } = require("hardhat");

// Role constants
const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
const DISTRIBUTOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("DISTRIBUTOR_ROLE"));
const VAULT_CREATOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("VAULT_CREATOR_ROLE"));

// Yield types
const YieldType = {
  RENTAL_INCOME: 0,
  DIVIDEND: 1,
  INTEREST: 2,
  ROYALTY: 3,
  CAPITAL_GAINS: 4,
  REFINANCING: 5,
  OTHER: 6
};

describe("Layer 3 - YieldDistributor", function () {
  let yieldDistributor, mockAsset, mockVault;
  let admin, distributor, vaultCreator, user1, user2;

  const INITIAL_SUPPLY = ethers.parseEther("1000000");
  const YIELD_AMOUNT = ethers.parseEther("100");
  const FREQUENCY = 30 * 24 * 60 * 60; // 30 days

  beforeEach(async function () {
    [admin, distributor, vaultCreator, user1, user2] = await ethers.getSigners();

    // Deploy mock ERC20 asset
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockAsset = await MockERC20.deploy("Mock Asset", "MCK");
    await mockAsset.waitForDeployment();

    // Deploy mock vault (simple contract that can receive tokens)
    const MockVault = await ethers.getContractFactory("MockVault");
    mockVault = await MockVault.deploy();
    await mockVault.waitForDeployment();

    // Deploy YieldDistributor
    const YieldDistributor = await ethers.getContractFactory("YieldDistributor");
    yieldDistributor = await YieldDistributor.deploy(admin.address);
    await yieldDistributor.waitForDeployment();

    // Setup roles
    await yieldDistributor.grantRole(DISTRIBUTOR_ROLE, distributor.address);
    await yieldDistributor.grantRole(VAULT_CREATOR_ROLE, vaultCreator.address);

    // Mint assets to users for testing
    await mockAsset.mint(distributor.address, INITIAL_SUPPLY);
    await mockAsset.mint(vaultCreator.address, INITIAL_SUPPLY);
  });

  describe("Initialization", function () {
    it("Should grant admin role to deployer", async function () {
      expect(await yieldDistributor.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
    });

    it("Should grant distributor role to deployer", async function () {
      expect(await yieldDistributor.hasRole(DISTRIBUTOR_ROLE, admin.address)).to.be.true;
    });

    it("Should grant vault creator role to deployer", async function () {
      expect(await yieldDistributor.hasRole(VAULT_CREATOR_ROLE, admin.address)).to.be.true;
    });

    it("Should return version", async function () {
      expect(await yieldDistributor.version()).to.equal("3.0.0");
    });
  });

  describe("Create Yield Schedule", function () {
    it("Should create a yield schedule", async function () {
      const tx = await yieldDistributor.connect(vaultCreator).createYieldSchedule(
        await mockVault.getAddress(),
        "Monthly Rent",
        await mockAsset.getAddress(),
        YIELD_AMOUNT,
        FREQUENCY,
        YieldType.RENTAL_INCOME
      );
      const receipt = await tx.wait();

      // Find YieldScheduleCreated event
      const scheduleCreatedEvent = receipt.logs.find(log => {
        try {
          const parsed = yieldDistributor.interface.parseLog(log);
          return parsed.name === "YieldScheduleCreated";
        } catch {
          return false;
        }
      });

      expect(scheduleCreatedEvent).to.not.be.undefined;
      const scheduleId = scheduleCreatedEvent.args.scheduleId;

      // Verify schedule was created
      const schedule = await yieldDistributor.getYieldSchedule(await mockVault.getAddress(), scheduleId);
      expect(schedule.name).to.equal("Monthly Rent");
      expect(schedule.active).to.be.true;
      expect(schedule.yieldType).to.equal(YieldType.RENTAL_INCOME);
    });

    it("Should emit YieldScheduleCreated event", async function () {
      const tx = await yieldDistributor.connect(vaultCreator).createYieldSchedule(
        await mockVault.getAddress(),
        "Monthly Rent",
        await mockAsset.getAddress(),
        YIELD_AMOUNT,
        FREQUENCY,
        YieldType.RENTAL_INCOME
      );
      const receipt = await tx.wait();

      const scheduleCreatedEvent = receipt.logs.find(log => {
        try {
          const parsed = yieldDistributor.interface.parseLog(log);
          return parsed.name === "YieldScheduleCreated";
        } catch {
          return false;
        }
      });

      expect(scheduleCreatedEvent.args.vault).to.equal(await mockVault.getAddress());
      expect(scheduleCreatedEvent.args.name).to.equal("Monthly Rent");
      expect(scheduleCreatedEvent.args.yieldType).to.equal(YieldType.RENTAL_INCOME);
      expect(scheduleCreatedEvent.args.amount).to.equal(YIELD_AMOUNT);
      expect(scheduleCreatedEvent.args.frequency).to.equal(FREQUENCY);
    });

    it("Should set nextDue timestamp", async function () {
      const tx = await yieldDistributor.connect(vaultCreator).createYieldSchedule(
        await mockVault.getAddress(),
        "Monthly Rent",
        await mockAsset.getAddress(),
        YIELD_AMOUNT,
        FREQUENCY,
        YieldType.RENTAL_INCOME
      );
      const receipt = await tx.wait();

      const scheduleCreatedEvent = receipt.logs.find(log => {
        try {
          const parsed = yieldDistributor.interface.parseLog(log);
          return parsed.name === "YieldScheduleCreated";
        } catch {
          return false;
        }
      });

      const scheduleId = scheduleCreatedEvent.args.scheduleId;
      const schedule = await yieldDistributor.getYieldSchedule(await mockVault.getAddress(), scheduleId);

      expect(schedule.nextDue).to.be.greaterThan(schedule.lastDistribution);
    });

    it("Should add schedule ID to vault's schedule list", async function () {
      const tx = await yieldDistributor.connect(vaultCreator).createYieldSchedule(
        await mockVault.getAddress(),
        "Monthly Rent",
        await mockAsset.getAddress(),
        YIELD_AMOUNT,
        FREQUENCY,
        YieldType.RENTAL_INCOME
      );
      const receipt = await tx.wait();

      const scheduleCreatedEvent = receipt.logs.find(log => {
        try {
          const parsed = yieldDistributor.interface.parseLog(log);
          return parsed.name === "YieldScheduleCreated";
        } catch {
          return false;
        }
      });

      const scheduleId = scheduleCreatedEvent.args.scheduleId;
      const scheduleIds = await yieldDistributor.getVaultScheduleIds(await mockVault.getAddress());
      
      expect(scheduleIds.length).to.equal(1);
      expect(scheduleIds[0]).to.equal(scheduleId);
    });

    it("Should only allow vault creator role", async function () {
      await expect(
        yieldDistributor.connect(user1).createYieldSchedule(
          await mockVault.getAddress(),
          "Monthly Rent",
          await mockAsset.getAddress(),
          YIELD_AMOUNT,
          FREQUENCY,
          YieldType.RENTAL_INCOME
        )
      ).to.be.reverted;
    });

    it("Should fail with invalid vault address", async function () {
      await expect(
        yieldDistributor.connect(vaultCreator).createYieldSchedule(
          ethers.ZeroAddress,
          "Monthly Rent",
          await mockAsset.getAddress(),
          YIELD_AMOUNT,
          FREQUENCY,
          YieldType.RENTAL_INCOME
        )
      ).to.be.reverted;
    });

    it("Should fail with invalid token address", async function () {
      await expect(
        yieldDistributor.connect(vaultCreator).createYieldSchedule(
          await mockVault.getAddress(),
          "Monthly Rent",
          ethers.ZeroAddress,
          YIELD_AMOUNT,
          FREQUENCY,
          YieldType.RENTAL_INCOME
        )
      ).to.be.reverted;
    });

    it("Should fail with zero frequency", async function () {
      await expect(
        yieldDistributor.connect(vaultCreator).createYieldSchedule(
          await mockVault.getAddress(),
          "Monthly Rent",
          await mockAsset.getAddress(),
          YIELD_AMOUNT,
          0,
          YieldType.RENTAL_INCOME
        )
      ).to.be.reverted;
    });
  });

  describe("Update Yield Schedule", function () {
    let scheduleId;

    beforeEach(async function () {
      const tx = await yieldDistributor.connect(vaultCreator).createYieldSchedule(
        await mockVault.getAddress(),
        "Monthly Rent",
        await mockAsset.getAddress(),
        YIELD_AMOUNT,
        FREQUENCY,
        YieldType.RENTAL_INCOME
      );
      const receipt = await tx.wait();

      const scheduleCreatedEvent = receipt.logs.find(log => {
        try {
          const parsed = yieldDistributor.interface.parseLog(log);
          return parsed.name === "YieldScheduleCreated";
        } catch {
          return false;
        }
      });

      scheduleId = scheduleCreatedEvent.args.scheduleId;
    });

    it("Should update yield schedule amount and frequency", async function () {
      const newAmount = ethers.parseEther("200");
      const newFrequency = 60 * 24 * 60 * 60; // 60 days

      await yieldDistributor.connect(vaultCreator).updateYieldSchedule(
        await mockVault.getAddress(),
        scheduleId,
        newAmount,
        newFrequency
      );

      const schedule = await yieldDistributor.getYieldSchedule(await mockVault.getAddress(), scheduleId);
      expect(schedule.amount).to.equal(newAmount);
      expect(schedule.frequency).to.equal(newFrequency);
    });

    it("Should emit YieldScheduleUpdated event", async function () {
      const newAmount = ethers.parseEther("200");
      const newFrequency = 60 * 24 * 60 * 60;

      await expect(
        yieldDistributor.connect(vaultCreator).updateYieldSchedule(
          await mockVault.getAddress(),
          scheduleId,
          newAmount,
          newFrequency
        )
      )
        .to.emit(yieldDistributor, "YieldScheduleUpdated")
        .withArgs(await mockVault.getAddress(), scheduleId, newAmount, newFrequency);
    });

    it("Should only allow vault creator role", async function () {
      await expect(
        yieldDistributor.connect(user1).updateYieldSchedule(
          await mockVault.getAddress(),
          scheduleId,
          YIELD_AMOUNT,
          FREQUENCY
        )
      ).to.be.reverted;
    });

    it("Should fail with inactive schedule", async function () {
      await yieldDistributor.connect(vaultCreator).deactivateYieldSchedule(
        await mockVault.getAddress(),
        scheduleId
      );

      await expect(
        yieldDistributor.connect(vaultCreator).updateYieldSchedule(
          await mockVault.getAddress(),
          scheduleId,
          YIELD_AMOUNT,
          FREQUENCY
        )
      ).to.be.reverted;
    });
  });

  describe("Deactivate Yield Schedule", function () {
    let scheduleId;

    beforeEach(async function () {
      const tx = await yieldDistributor.connect(vaultCreator).createYieldSchedule(
        await mockVault.getAddress(),
        "Monthly Rent",
        await mockAsset.getAddress(),
        YIELD_AMOUNT,
        FREQUENCY,
        YieldType.RENTAL_INCOME
      );
      const receipt = await tx.wait();

      const scheduleCreatedEvent = receipt.logs.find(log => {
        try {
          const parsed = yieldDistributor.interface.parseLog(log);
          return parsed.name === "YieldScheduleCreated";
        } catch {
          return false;
        }
      });

      scheduleId = scheduleCreatedEvent.args.scheduleId;
    });

    it("Should deactivate yield schedule", async function () {
      await yieldDistributor.connect(vaultCreator).deactivateYieldSchedule(
        await mockVault.getAddress(),
        scheduleId
      );

      const schedule = await yieldDistributor.getYieldSchedule(await mockVault.getAddress(), scheduleId);
      expect(schedule.active).to.be.false;
    });

    it("Should emit YieldScheduleDeactivated event", async function () {
      await expect(
        yieldDistributor.connect(vaultCreator).deactivateYieldSchedule(
          await mockVault.getAddress(),
          scheduleId
        )
      )
        .to.emit(yieldDistributor, "YieldScheduleDeactivated")
        .withArgs(await mockVault.getAddress(), scheduleId);
    });

    it("Should only allow vault creator role", async function () {
      await expect(
        yieldDistributor.connect(user1).deactivateYieldSchedule(
          await mockVault.getAddress(),
          scheduleId
        )
      ).to.be.reverted;
    });

    it("Should fail with already inactive schedule", async function () {
      await yieldDistributor.connect(vaultCreator).deactivateYieldSchedule(
        await mockVault.getAddress(),
        scheduleId
      );

      await expect(
        yieldDistributor.connect(vaultCreator).deactivateYieldSchedule(
          await mockVault.getAddress(),
          scheduleId
        )
      ).to.be.reverted;
    });
  });

  describe("Distribute Yield", function () {
    let scheduleId;

    beforeEach(async function () {
      const tx = await yieldDistributor.connect(vaultCreator).createYieldSchedule(
        await mockVault.getAddress(),
        "Monthly Rent",
        await mockAsset.getAddress(),
        YIELD_AMOUNT,
        FREQUENCY,
        YieldType.RENTAL_INCOME
      );
      const receipt = await tx.wait();

      const scheduleCreatedEvent = receipt.logs.find(log => {
        try {
          const parsed = yieldDistributor.interface.parseLog(log);
          return parsed.name === "YieldScheduleCreated";
        } catch {
          return false;
        }
      });

      scheduleId = scheduleCreatedEvent.args.scheduleId;

      // Approve tokens
      await mockAsset.connect(distributor).approve(await yieldDistributor.getAddress(), INITIAL_SUPPLY);
    });

    it("Should distribute yield to vault", async function () {
      const vaultBalanceBefore = await mockAsset.balanceOf(await mockVault.getAddress());

      await yieldDistributor.connect(distributor).distributeYield(
        await mockVault.getAddress(),
        YIELD_AMOUNT,
        scheduleId
      );

      const vaultBalanceAfter = await mockAsset.balanceOf(await mockVault.getAddress());
      expect(vaultBalanceAfter - vaultBalanceBefore).to.equal(YIELD_AMOUNT);
    });

    it("Should update pending yield tracking", async function () {
      await yieldDistributor.connect(distributor).distributeYield(
        await mockVault.getAddress(),
        YIELD_AMOUNT,
        scheduleId
      );

      const pending = await yieldDistributor.pendingYield(await mockVault.getAddress());
      expect(pending).to.equal(YIELD_AMOUNT);
    });

    it("Should update total distributed tracking", async function () {
      await yieldDistributor.connect(distributor).distributeYield(
        await mockVault.getAddress(),
        YIELD_AMOUNT,
        scheduleId
      );

      const total = await yieldDistributor.totalDistributed(await mockVault.getAddress());
      expect(total).to.equal(YIELD_AMOUNT);
    });

    it("Should update schedule lastDistribution and nextDue", async function () {
      const scheduleBefore = await yieldDistributor.getYieldSchedule(await mockVault.getAddress(), scheduleId);

      await yieldDistributor.connect(distributor).distributeYield(
        await mockVault.getAddress(),
        YIELD_AMOUNT,
        scheduleId
      );

      const scheduleAfter = await yieldDistributor.getYieldSchedule(await mockVault.getAddress(), scheduleId);
      expect(scheduleAfter.lastDistribution).to.be.greaterThan(scheduleBefore.lastDistribution);
      expect(scheduleAfter.nextDue).to.be.greaterThan(scheduleBefore.nextDue);
    });

    it("Should emit YieldDistributed event", async function () {
      await expect(
        yieldDistributor.connect(distributor).distributeYield(
          await mockVault.getAddress(),
          YIELD_AMOUNT,
          scheduleId
        )
      )
        .to.emit(yieldDistributor, "YieldDistributed")
        .withArgs(await mockVault.getAddress(), scheduleId, YIELD_AMOUNT, distributor.address, YieldType.RENTAL_INCOME);
    });

    it("Should add to yield history", async function () {
      await yieldDistributor.connect(distributor).distributeYield(
        await mockVault.getAddress(),
        YIELD_AMOUNT,
        scheduleId
      );

      const history = await yieldDistributor.getYieldHistory(await mockVault.getAddress(), scheduleId);
      expect(history.length).to.equal(1);
      expect(history[0].amount).to.equal(YIELD_AMOUNT);
      expect(history[0].distributor).to.equal(distributor.address);
    });

    it("Should only allow distributor role", async function () {
      await expect(
        yieldDistributor.connect(user1).distributeYield(
          await mockVault.getAddress(),
          YIELD_AMOUNT,
          scheduleId
        )
      ).to.be.reverted;
    });

    it("Should fail with invalid vault", async function () {
      await expect(
        yieldDistributor.connect(distributor).distributeYield(
          ethers.ZeroAddress,
          YIELD_AMOUNT,
          scheduleId
        )
      ).to.be.reverted;
    });

    it("Should fail with zero amount", async function () {
      await expect(
        yieldDistributor.connect(distributor).distributeYield(
          await mockVault.getAddress(),
          0,
          scheduleId
        )
      ).to.be.reverted;
    });

    it("Should fail with inactive schedule", async function () {
      await yieldDistributor.connect(vaultCreator).deactivateYieldSchedule(
        await mockVault.getAddress(),
        scheduleId
      );

      await expect(
        yieldDistributor.connect(distributor).distributeYield(
          await mockVault.getAddress(),
          YIELD_AMOUNT,
          scheduleId
        )
      ).to.be.reverted;
    });
  });

  describe("View Functions", function () {
    let scheduleId;

    beforeEach(async function () {
      const tx = await yieldDistributor.connect(vaultCreator).createYieldSchedule(
        await mockVault.getAddress(),
        "Monthly Rent",
        await mockAsset.getAddress(),
        YIELD_AMOUNT,
        FREQUENCY,
        YieldType.RENTAL_INCOME
      );
      const receipt = await tx.wait();

      const scheduleCreatedEvent = receipt.logs.find(log => {
        try {
          const parsed = yieldDistributor.interface.parseLog(log);
          return parsed.name === "YieldScheduleCreated";
        } catch {
          return false;
        }
      });

      scheduleId = scheduleCreatedEvent.args.scheduleId;
    });

    it("Should get yield schedule details", async function () {
      const schedule = await yieldDistributor.getYieldSchedule(await mockVault.getAddress(), scheduleId);

      expect(schedule.name).to.equal("Monthly Rent");
      expect(schedule.amount).to.equal(YIELD_AMOUNT);
      expect(schedule.frequency).to.equal(FREQUENCY);
      expect(schedule.active).to.be.true;
    });

    it("Should get yield history", async function () {
      await mockAsset.connect(distributor).approve(await yieldDistributor.getAddress(), YIELD_AMOUNT);
      await yieldDistributor.connect(distributor).distributeYield(
        await mockVault.getAddress(),
        YIELD_AMOUNT,
        scheduleId
      );

      const history = await yieldDistributor.getYieldHistory(await mockVault.getAddress(), scheduleId);
      expect(history.length).to.equal(1);
    });

    it("Should get latest yield payment", async function () {
      await mockAsset.connect(distributor).approve(await yieldDistributor.getAddress(), YIELD_AMOUNT);
      await yieldDistributor.connect(distributor).distributeYield(
        await mockVault.getAddress(),
        YIELD_AMOUNT,
        scheduleId
      );

      const latest = await yieldDistributor.getLatestYieldPayment(await mockVault.getAddress(), scheduleId);
      expect(latest.amount).to.equal(YIELD_AMOUNT);
    });

    it("Should fail to get latest payment with no history", async function () {
      await expect(
        yieldDistributor.getLatestYieldPayment(await mockVault.getAddress(), scheduleId)
      ).to.be.reverted;
    });

    it("Should get vault schedule IDs", async function () {
      const scheduleIds = await yieldDistributor.getVaultScheduleIds(await mockVault.getAddress());
      expect(scheduleIds.length).to.equal(1);
    });

    it("Should check if yield is due", async function () {
      const isDue = await yieldDistributor.isYieldDue(await mockVault.getAddress(), scheduleId);
      // Initially not due since nextDue is in the future
      expect(isDue).to.be.false;
    });

    it("Should get pending yield", async function () {
      const pending = await yieldDistributor.pendingYield(await mockVault.getAddress());
      expect(pending).to.equal(0); // No distributions yet
    });

    it("Should get total distributed", async function () {
      const total = await yieldDistributor.totalDistributed(await mockVault.getAddress());
      expect(total).to.equal(0); // No distributions yet
    });
  });

  describe("Configuration", function () {
    it("Should allow admin to set vault registry", async function () {
      const registry = ethers.Wallet.createRandom().address;

      await yieldDistributor.setVaultRegistry(registry);

      expect(await yieldDistributor.vaultRegistry()).to.equal(registry);
    });

    it("Should allow admin to set investor rights registry", async function () {
      const registry = ethers.Wallet.createRandom().address;

      await yieldDistributor.setInvestorRightsRegistry(registry);

      expect(await yieldDistributor.investorRightsRegistry()).to.equal(registry);
    });

    it("Should only allow admin to configure", async function () {
      const registry = ethers.Wallet.createRandom().address;

      await expect(
        yieldDistributor.connect(user1).setVaultRegistry(registry)
      ).to.be.reverted;
    });

    it("Should reject zero address for configuration", async function () {
      await expect(yieldDistributor.setVaultRegistry(ethers.ZeroAddress)).to.be.reverted;
      await expect(yieldDistributor.setInvestorRightsRegistry(ethers.ZeroAddress)).to.be.reverted;
    });
  });

  describe("Emergency Withdraw", function () {
    beforeEach(async function () {
      // Transfer some tokens to yield distributor
      await mockAsset.mint(await yieldDistributor.getAddress(), INITIAL_SUPPLY);
    });

    it("Should allow admin to emergency withdraw", async function () {
      const withdrawAmount = ethers.parseEther("100");
      const emergencyAddress = ethers.Wallet.createRandom().address;

      await yieldDistributor.connect(admin).emergencyWithdraw(
        await mockAsset.getAddress(),
        withdrawAmount,
        emergencyAddress
      );

      const balance = await mockAsset.balanceOf(emergencyAddress);
      expect(balance).to.equal(withdrawAmount);
    });

    it("Should only allow admin to emergency withdraw", async function () {
      await expect(
        yieldDistributor.connect(user1).emergencyWithdraw(
          await mockAsset.getAddress(),
          ethers.parseEther("100"),
          user1.address
        )
      ).to.be.reverted;
    });

    it("Should reject zero address for emergency withdrawal", async function () {
      await expect(
        yieldDistributor.connect(admin).emergencyWithdraw(
          await mockAsset.getAddress(),
          ethers.parseEther("100"),
          ethers.ZeroAddress
        )
      ).to.be.reverted;
    });
  });

  describe("Multiple Yield Schedules", function () {
    let scheduleId1, scheduleId2;

    beforeEach(async function () {
      const tx1 = await yieldDistributor.connect(vaultCreator).createYieldSchedule(
        await mockVault.getAddress(),
        "Monthly Rent",
        await mockAsset.getAddress(),
        YIELD_AMOUNT,
        FREQUENCY,
        YieldType.RENTAL_INCOME
      );
      const receipt1 = await tx1.wait();
      const event1 = receipt1.logs.find(log => {
        try {
          const parsed = yieldDistributor.interface.parseLog(log);
          return parsed.name === "YieldScheduleCreated";
        } catch {
          return false;
        }
      });
      scheduleId1 = event1.args.scheduleId;

      const tx2 = await yieldDistributor.connect(vaultCreator).createYieldSchedule(
        await mockVault.getAddress(),
        "Annual Dividend",
        await mockAsset.getAddress(),
        ethers.parseEther("500"),
        365 * 24 * 60 * 60,
        YieldType.DIVIDEND
      );
      const receipt2 = await tx2.wait();
      const event2 = receipt2.logs.find(log => {
        try {
          const parsed = yieldDistributor.interface.parseLog(log);
          return parsed.name === "YieldScheduleCreated";
        } catch {
          return false;
        }
      });
      scheduleId2 = event2.args.scheduleId;

      await mockAsset.connect(distributor).approve(await yieldDistributor.getAddress(), INITIAL_SUPPLY);
    });

    it("Should manage multiple schedules per vault", async function () {
      const scheduleIds = await yieldDistributor.getVaultScheduleIds(await mockVault.getAddress());
      expect(scheduleIds.length).to.equal(2);
    });

    it("Should distribute yield for different schedules", async function () {
      await yieldDistributor.connect(distributor).distributeYield(
        await mockVault.getAddress(),
        YIELD_AMOUNT,
        scheduleId1
      );

      await yieldDistributor.connect(distributor).distributeYield(
        await mockVault.getAddress(),
        ethers.parseEther("500"),
        scheduleId2
      );

      const history1 = await yieldDistributor.getYieldHistory(await mockVault.getAddress(), scheduleId1);
      const history2 = await yieldDistributor.getYieldHistory(await mockVault.getAddress(), scheduleId2);

      expect(history1.length).to.equal(1);
      expect(history2.length).to.equal(1);
      expect(history1[0].yieldType).to.equal(YieldType.RENTAL_INCOME);
      expect(history2[0].yieldType).to.equal(YieldType.DIVIDEND);
    });
  });
});
