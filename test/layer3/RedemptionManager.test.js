const { expect } = require("chai");
const { ethers } = require("hardhat");

// Role constants
const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
const PROCESSOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PROCESSOR_ROLE"));
const VAULT_ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("VAULT_ADMIN_ROLE"));

// Redemption status enum
const RedemptionStatus = {
  PENDING: 0,
  PROCESSING: 1,
  READY: 2,
  CLAIMED: 3,
  CANCELLED: 4,
  EXPIRED: 5
};

// Queue status enum
const QueueStatus = {
  OPEN: 0,
  PROCESSING: 1,
  CLOSED: 2,
  SETTLED: 3
};

describe("Layer 3 - RedemptionManager", function () {
  let redemptionManager, mockVault, mockAsset, identityRegistry;
  let admin, processor, vaultAdmin, investor1, investor2, random;

  const INITIAL_SUPPLY = ethers.parseEther("1000000");
  const REDEEM_AMOUNT = ethers.parseEther("500");
  const BASIS_POINTS = 10000n;

  beforeEach(async function () {
    [admin, processor, vaultAdmin, investor1, investor2, random] = await ethers.getSigners();

    // Deploy mock ERC20 asset
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockAsset = await MockERC20.deploy("Mock Asset", "MCK");
    await mockAsset.waitForDeployment();

    // Deploy mock vault
    const MockVault = await ethers.getContractFactory("MockVault");
    mockVault = await MockVault.deploy();
    await mockVault.waitForDeployment();

    // Deploy mock IdentityRegistry
    const IdentityRegistry = await ethers.getContractFactory(
      "contracts/identity/IdentityRegistry.sol:IdentityRegistry"
    );
    identityRegistry = await IdentityRegistry.deploy();
    await identityRegistry.waitForDeployment();

    // Deploy RedemptionManager
    const RedemptionManager = await ethers.getContractFactory("RedemptionManager");
    redemptionManager = await RedemptionManager.deploy(admin.address);
    await redemptionManager.waitForDeployment();

    // Setup roles
    await redemptionManager.grantRole(PROCESSOR_ROLE, processor.address);
    await redemptionManager.grantRole(VAULT_ADMIN_ROLE, vaultAdmin.address);

    // Mint assets to users for testing
    await mockAsset.mint(investor1.address, INITIAL_SUPPLY);
    await mockAsset.mint(investor2.address, INITIAL_SUPPLY);

    // Mint vault shares to investors (simulate deposit)
    await mockVault.mint(investor1.address, INITIAL_SUPPLY);
    await mockVault.mint(investor2.address, INITIAL_SUPPLY);
  });

  describe("Initialization", function () {
    it("Should grant admin role to deployer", async function () {
      expect(await redemptionManager.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
    });

    it("Should grant processor role to deployer", async function () {
      expect(await redemptionManager.hasRole(PROCESSOR_ROLE, admin.address)).to.be.true;
    });

    it("Should grant vault admin role to deployer", async function () {
      expect(await redemptionManager.hasRole(VAULT_ADMIN_ROLE, admin.address)).to.be.true;
    });

    it("Should return version", async function () {
      expect(await redemptionManager.version()).to.equal("3.0.0");
    });

    it("Should set default constants", async function () {
      expect(await redemptionManager.BASIS_POINTS()).to.equal(10000);
      expect(await redemptionManager.DEFAULT_GATE_PERCENTAGE()).to.equal(2500); // 25%
      expect(await redemptionManager.DEFAULT_PERIOD_DURATION()).to.equal(7 * 24 * 60 * 60); // 7 days
      expect(await redemptionManager.DEFAULT_CLAIM_PERIOD()).to.equal(30 * 24 * 60 * 60); // 30 days
    });
  });

  describe("Request Redemption", function () {
    it("Should create redemption request", async function () {
      await mockAsset.connect(investor1).approve(await mockVault.getAddress(), REDEEM_AMOUNT);

      const tx = await redemptionManager.connect(investor1).requestRedemption(
        await mockVault.getAddress(),
        REDEEM_AMOUNT
      );
      const receipt = await tx.wait();

      // Find RedemptionRequested event
      const requestEvent = receipt.logs.find(log => {
        try {
          const parsed = redemptionManager.interface.parseLog(log);
          return parsed.name === "RedemptionRequested";
        } catch {
          return false;
        }
      });

      expect(requestEvent).to.not.be.undefined;
      const requestId = requestEvent.args.requestId;

      // Verify request was created
      const request = await redemptionManager.redemptionRequests(await mockVault.getAddress(), requestId);
      expect(request.investor).to.equal(investor1.address);
      expect(request.shares).to.equal(REDEEM_AMOUNT);
      expect(request.status).to.equal(RedemptionStatus.PENDING);
    });

    it("Should emit RedemptionRequested event", async function () {
      const tx = await redemptionManager.connect(investor1).requestRedemption(
        await mockVault.getAddress(),
        REDEEM_AMOUNT
      );
      const receipt = await tx.wait();

      const requestEvent = receipt.logs.find(log => {
        try {
          const parsed = redemptionManager.interface.parseLog(log);
          return parsed.name === "RedemptionRequested";
        } catch {
          return false;
        }
      });

      expect(requestEvent.args.vault).to.equal(await mockVault.getAddress());
      expect(requestEvent.args.investor).to.equal(investor1.address);
      expect(requestEvent.args.shares).to.equal(REDEEM_AMOUNT);
    });

    it("Should increment request ID", async function () {
      await redemptionManager.connect(investor1).requestRedemption(
        await mockVault.getAddress(),
        REDEEM_AMOUNT
      );

      const nextId = await redemptionManager.nextRequestId(await mockVault.getAddress());
      expect(nextId).to.equal(1);

      // Second request
      await redemptionManager.connect(investor1).requestRedemption(
        await mockVault.getAddress(),
        REDEEM_AMOUNT
      );

      const nextId2 = await redemptionManager.nextRequestId(await mockVault.getAddress());
      expect(nextId2).to.equal(2);
    });

    it("Should add request ID to vault's request list", async function () {
      await redemptionManager.connect(investor1).requestRedemption(
        await mockVault.getAddress(),
        REDEEM_AMOUNT
      );

      const requestIds = await redemptionManager.getVaultRequestIds(await mockVault.getAddress());
      expect(requestIds.length).to.equal(1);
    });

    it("Should fail with invalid vault", async function () {
      await expect(
        redemptionManager.connect(investor1).requestRedemption(
          ethers.ZeroAddress,
          REDEEM_AMOUNT
        )
      ).to.be.reverted;
    });

    it("Should fail with zero shares", async function () {
      await expect(
        redemptionManager.connect(investor1).requestRedemption(
          await mockVault.getAddress(),
          0
        )
      ).to.be.reverted;
    });
  });

  describe("Process Redemption", function () {
    let requestId;

    beforeEach(async function () {
      await redemptionManager.connect(investor1).requestRedemption(
        await mockVault.getAddress(),
        REDEEM_AMOUNT
      );

      const nextId = await redemptionManager.nextRequestId(await mockVault.getAddress());
      requestId = nextId - 1n;
    });

    it("Should process redemption request", async function () {
      const assets = ethers.parseEther("490");

      await redemptionManager.connect(processor).processRedemption(
        await mockVault.getAddress(),
        requestId,
        assets
      );

      const request = await redemptionManager.redemptionRequests(await mockVault.getAddress(), requestId);
      expect(request.assets).to.equal(assets);
      expect(request.status).to.equal(RedemptionStatus.READY);
      expect(request.processor).to.equal(processor.address);
    });

    it("Should emit RedemptionProcessed event", async function () {
      const assets = ethers.parseEther("490");

      await expect(
        redemptionManager.connect(processor).processRedemption(
          await mockVault.getAddress(),
          requestId,
          assets
        )
      )
        .to.emit(redemptionManager, "RedemptionProcessed")
        .withArgs(await mockVault.getAddress(), requestId, assets, processor.address);
    });

    it("Should only allow processor role", async function () {
      await expect(
        redemptionManager.connect(investor1).processRedemption(
          await mockVault.getAddress(),
          requestId,
          ethers.parseEther("490")
        )
      ).to.be.reverted;
    });

    it("Should fail with invalid status (not PENDING)", async function () {
      const assets = ethers.parseEther("490");

      await redemptionManager.connect(processor).processRedemption(
        await mockVault.getAddress(),
        requestId,
        assets
      );

      // Try to process again
      await expect(
        redemptionManager.connect(processor).processRedemption(
          await mockVault.getAddress(),
          requestId,
          assets
        )
      ).to.be.reverted;
    });

    it("Should fail with invalid request ID", async function () {
      const invalidId = 999;

      await expect(
        redemptionManager.connect(processor).processRedemption(
          await mockVault.getAddress(),
          invalidId,
          ethers.parseEther("490")
        )
      ).to.be.reverted;
    });
  });

  describe("Process Batch Redemptions", function () {
    let requestIds = [];

    beforeEach(async function () {
      // Create multiple redemption requests
      await redemptionManager.connect(investor1).requestRedemption(
        await mockVault.getAddress(),
        REDEEM_AMOUNT
      );

      await redemptionManager.connect(investor2).requestRedemption(
        await mockVault.getAddress(),
        REDEEM_AMOUNT
      );

      const nextId = await redemptionManager.nextRequestId(await mockVault.getAddress());
      requestIds = [nextId - 2n, nextId - 1n];
    });

    it("Should process batch redemptions pro-rata", async function () {
      const totalAssets = ethers.parseEther("900");

      await redemptionManager.connect(processor).processBatchRedemptions(
        await mockVault.getAddress(),
        requestIds,
        totalAssets
      );

      const request1 = await redemptionManager.redemptionRequests(await mockVault.getAddress(), requestIds[0]);
      const request2 = await redemptionManager.redemptionRequests(await mockVault.getAddress(), requestIds[1]);

      expect(request1.status).to.equal(RedemptionStatus.READY);
      expect(request2.status).to.equal(RedemptionStatus.READY);
      expect(request1.assets).to.be.closeTo(totalAssets / 2n, ethers.parseEther("1"));
      expect(request2.assets).to.be.closeTo(totalAssets / 2n, ethers.parseEther("1"));
    });

    it("Should emit RedemptionProcessed events for each request", async function () {
      const totalAssets = ethers.parseEther("900");

      const tx = await redemptionManager.connect(processor).processBatchRedemptions(
        await mockVault.getAddress(),
        requestIds,
        totalAssets
      );
      const receipt = await tx.wait();

      const processedEvents = receipt.logs.filter(log => {
        try {
          const parsed = redemptionManager.interface.parseLog(log);
          return parsed.name === "RedemptionProcessed";
        } catch {
          return false;
        }
      });

      expect(processedEvents.length).to.equal(2);
    });

    it("Should only allow processor role", async function () {
      await expect(
        redemptionManager.connect(investor1).processBatchRedemptions(
          await mockVault.getAddress(),
          requestIds,
          ethers.parseEther("900")
        )
      ).to.be.reverted;
    });

    it("Should fail with invalid request status", async function () {
      // Process first request
      await redemptionManager.connect(processor).processRedemption(
        await mockVault.getAddress(),
        requestIds[0],
        ethers.parseEther("450")
      );

      const totalAssets = ethers.parseEther("900");

      await expect(
        redemptionManager.connect(processor).processBatchRedemptions(
          await mockVault.getAddress(),
          requestIds,
          totalAssets
        )
      ).to.be.reverted;
    });
  });

  describe("Claim Redemption", function () {
    let requestId;

    beforeEach(async function () {
      await redemptionManager.connect(investor1).requestRedemption(
        await mockVault.getAddress(),
        REDEEM_AMOUNT
      );

      const nextId = await redemptionManager.nextRequestId(await mockVault.getAddress());
      requestId = nextId - 1n;

      // Process the redemption
      const assets = ethers.parseEther("490");
      await redemptionManager.connect(processor).processRedemption(
        await mockVault.getAddress(),
        requestId,
        assets
      );

      // Transfer vault shares to redemption manager (simulate vault transfer)
      await mockVault.connect(investor1).transfer(await redemptionManager.getAddress(), assets);
    });

    it("Should claim redeemed assets", async function () {
      const investorBalanceBefore = await mockVault.balanceOf(investor1.address);

      await redemptionManager.connect(investor1).claimRedemption(
        await mockVault.getAddress(),
        requestId
      );

      const investorBalanceAfter = await mockVault.balanceOf(investor1.address);
      expect(investorBalanceAfter - investorBalanceBefore).to.equal(ethers.parseEther("490"));
    });

    it("Should update request status to CLAIMED", async function () {
      await redemptionManager.connect(investor1).claimRedemption(
        await mockVault.getAddress(),
        requestId
      );

      const request = await redemptionManager.redemptionRequests(await mockVault.getAddress(), requestId);
      expect(request.status).to.equal(RedemptionStatus.CLAIMED);
    });

    it("Should emit RedemptionClaimed event", async function () {
      const assets = ethers.parseEther("490");

      await expect(
        redemptionManager.connect(investor1).claimRedemption(
          await mockVault.getAddress(),
          requestId
        )
      )
        .to.emit(redemptionManager, "RedemptionClaimed")
        .withArgs(await mockVault.getAddress(), requestId, investor1.address, assets);
    });

    it("Should only allow investor to claim", async function () {
      await expect(
        redemptionManager.connect(investor2).claimRedemption(
          await mockVault.getAddress(),
          requestId
        )
      ).to.be.reverted;
    });

    it("Should fail if not ready", async function () {
      // Create new request but don't process it
      await redemptionManager.connect(investor2).requestRedemption(
        await mockVault.getAddress(),
        REDEEM_AMOUNT
      );

      const nextId = await redemptionManager.nextRequestId(await mockVault.getAddress());
      const newRequestId = nextId - 1n;

      await expect(
        redemptionManager.connect(investor2).claimRedemption(
          await mockVault.getAddress(),
          newRequestId
        )
      ).to.be.reverted;
    });

    it("Should fail if claim period expired", async function () {
      // Fast forward time beyond claim period (30 days)
      const claimPeriod = await redemptionManager.DEFAULT_CLAIM_PERIOD();
      await ethers.provider.send("evm_increaseTime", [Number(claimPeriod) + 1]);
      await ethers.provider.send("evm_mine");

      await expect(
        redemptionManager.connect(investor1).claimRedemption(
          await mockVault.getAddress(),
          requestId
        )
      ).to.be.reverted;
    });
  });

  describe("Cancel Redemption", function () {
    let requestId;

    beforeEach(async function () {
      await redemptionManager.connect(investor1).requestRedemption(
        await mockVault.getAddress(),
        REDEEM_AMOUNT
      );

      const nextId = await redemptionManager.nextRequestId(await mockVault.getAddress());
      requestId = nextId - 1n;
    });

    it("Should cancel redemption request", async function () {
      await redemptionManager.connect(investor1).cancelRedemption(
        await mockVault.getAddress(),
        requestId
      );

      const request = await redemptionManager.redemptionRequests(await mockVault.getAddress(), requestId);
      expect(request.status).to.equal(RedemptionStatus.CANCELLED);
    });

    it("Should emit RedemptionCancelled event", async function () {
      await expect(
        redemptionManager.connect(investor1).cancelRedemption(
          await mockVault.getAddress(),
          requestId
        )
      )
        .to.emit(redemptionManager, "RedemptionCancelled")
        .withArgs(await mockVault.getAddress(), requestId, investor1.address);
    });

    it("Should only allow investor to cancel", async function () {
      await expect(
        redemptionManager.connect(investor2).cancelRedemption(
          await mockVault.getAddress(),
          requestId
        )
      ).to.be.reverted;
    });

    it("Should fail if already processing", async function () {
      await redemptionManager.connect(processor).processRedemption(
        await mockVault.getAddress(),
        requestId,
        ethers.parseEther("490")
      );

      await expect(
        redemptionManager.connect(investor1).cancelRedemption(
          await mockVault.getAddress(),
          requestId
        )
      ).to.be.reverted;
    });
  });

  describe("Redemption Gates", function () {
    it("Should set redemption gate", async function () {
      const gatePercentage = 2500n; // 25%
      const periodDuration = 7n * 24n * 60n * 60n; // 7 days

      await redemptionManager.connect(vaultAdmin).setRedemptionGate(
        await mockVault.getAddress(),
        gatePercentage,
        periodDuration
      );

      const gate = await redemptionManager.redemptionGates(await mockVault.getAddress());
      expect(gate.gatePercentage).to.equal(gatePercentage);
      expect(gate.periodDuration).to.equal(periodDuration);
      expect(gate.active).to.be.true;
    });

    it("Should emit RedemptionGateSet event", async function () {
      const gatePercentage = 2500n;
      const periodDuration = 7n * 24n * 60n * 60n;

      await expect(
        redemptionManager.connect(vaultAdmin).setRedemptionGate(
          await mockVault.getAddress(),
          gatePercentage,
          periodDuration
        )
      )
        .to.emit(redemptionManager, "RedemptionGateSet")
        .withArgs(await mockVault.getAddress(), gatePercentage, periodDuration);
    });

    it("Should only allow vault admin to set gate", async function () {
      await expect(
        redemptionManager.connect(investor1).setRedemptionGate(
          await mockVault.getAddress(),
          2500n,
          604800n
        )
      ).to.be.reverted;
    });

    it("Should fail with gate percentage too high", async function () {
      await expect(
        redemptionManager.connect(vaultAdmin).setRedemptionGate(
          await mockVault.getAddress(),
          10001n, // > 100%
          604800n
        )
      ).to.be.reverted;
    });

    it("Should fail with zero period", async function () {
      await expect(
        redemptionManager.connect(vaultAdmin).setRedemptionGate(
          await mockVault.getAddress(),
          2500n,
          0
        )
      ).to.be.reverted;
    });

    it("Should disable redemption gate", async function () {
      await redemptionManager.connect(vaultAdmin).setRedemptionGate(
        await mockVault.getAddress(),
        2500n,
        604800n
      );

      await redemptionManager.connect(vaultAdmin).disableRedemptionGate(await mockVault.getAddress());

      const gate = await redemptionManager.redemptionGates(await mockVault.getAddress());
      expect(gate.active).to.be.false;
    });
  });

  describe("Redemption Queue Management", function () {
    it("Should create redemption queue", async function () {
      const totalShares = ethers.parseEther("1000");
      const totalAssets = ethers.parseEther("950");

      const tx = await redemptionManager.connect(vaultAdmin).createRedemptionQueue(
        await mockVault.getAddress(),
        totalShares,
        totalAssets
      );
      const receipt = await tx.wait();

      const queueCreatedEvent = receipt.logs.find(log => {
        try {
          const parsed = redemptionManager.interface.parseLog(log);
          return parsed.name === "RedemptionQueueCreated";
        } catch {
          return false;
        }
      });

      expect(queueCreatedEvent).to.not.be.undefined;
      const queueId = queueCreatedEvent.args.queueId;

      const queue = await redemptionManager.getRedemptionQueue(await mockVault.getAddress(), queueId);
      expect(queue.totalShares).to.equal(totalShares);
      expect(queue.totalAssets).to.equal(totalAssets);
      expect(queue.status).to.equal(QueueStatus.OPEN);
    });

    it("Should emit RedemptionQueueCreated event", async function () {
      const totalShares = ethers.parseEther("1000");
      const totalAssets = ethers.parseEther("950");

      const tx = await redemptionManager.connect(vaultAdmin).createRedemptionQueue(
        await mockVault.getAddress(),
        totalShares,
        totalAssets
      );
      const receipt = await tx.wait();

      const queueCreatedEvent = receipt.logs.find(log => {
        try {
          const parsed = redemptionManager.interface.parseLog(log);
          return parsed.name === "RedemptionQueueCreated";
        } catch {
          return false;
        }
      });

      expect(queueCreatedEvent.args.totalShares).to.equal(totalShares);
      expect(queueCreatedEvent.args.totalAssets).to.equal(totalAssets);
    });

    it("Should only allow vault admin to create queue", async function () {
      await expect(
        redemptionManager.connect(investor1).createRedemptionQueue(
          await mockVault.getAddress(),
          ethers.parseEther("1000"),
          ethers.parseEther("950")
        )
      ).to.be.reverted;
    });

    it("Should fail with zero shares", async function () {
      await expect(
        redemptionManager.connect(vaultAdmin).createRedemptionQueue(
          await mockVault.getAddress(),
          0,
          ethers.parseEther("950")
        )
      ).to.be.reverted;
    });

    it("Should fail with zero assets", async function () {
      await expect(
        redemptionManager.connect(vaultAdmin).createRedemptionQueue(
          await mockVault.getAddress(),
          ethers.parseEther("1000"),
          0
        )
      ).to.be.reverted;
    });

    it("Should close redemption queue", async function () {
      const tx = await redemptionManager.connect(vaultAdmin).createRedemptionQueue(
        await mockVault.getAddress(),
        ethers.parseEther("1000"),
        ethers.parseEther("950")
      );
      const receipt = await tx.wait();

      const queueCreatedEvent = receipt.logs.find(log => {
        try {
          const parsed = redemptionManager.interface.parseLog(log);
          return parsed.name === "RedemptionQueueCreated";
        } catch {
          return false;
        }
      });

      const queueId = queueCreatedEvent.args.queueId;

      await redemptionManager.connect(processor).closeRedemptionQueue(
        await mockVault.getAddress(),
        queueId
      );

      const queue = await redemptionManager.getRedemptionQueue(await mockVault.getAddress(), queueId);
      expect(queue.status).to.equal(QueueStatus.CLOSED);
    });

    it("Should only allow processor to close queue", async function () {
      const tx = await redemptionManager.connect(vaultAdmin).createRedemptionQueue(
        await mockVault.getAddress(),
        ethers.parseEther("1000"),
        ethers.parseEther("950")
      );
      const receipt = await tx.wait();

      const queueCreatedEvent = receipt.logs.find(log => {
        try {
          const parsed = redemptionManager.interface.parseLog(log);
          return parsed.name === "RedemptionQueueCreated";
        } catch {
          return false;
        }
      });

      const queueId = queueCreatedEvent.args.queueId;

      await expect(
        redemptionManager.connect(investor1).closeRedemptionQueue(
          await mockVault.getAddress(),
          queueId
        )
      ).to.be.reverted;
    });

    it("Should settle redemption queue", async function () {
      const tx = await redemptionManager.connect(vaultAdmin).createRedemptionQueue(
        await mockVault.getAddress(),
        ethers.parseEther("1000"),
        ethers.parseEther("950")
      );
      const receipt = await tx.wait();

      const queueCreatedEvent = receipt.logs.find(log => {
        try {
          const parsed = redemptionManager.interface.parseLog(log);
          return parsed.name === "RedemptionQueueCreated";
        } catch {
          return false;
        }
      });

      const queueId = queueCreatedEvent.args.queueId;

      // Close first
      await redemptionManager.connect(processor).closeRedemptionQueue(
        await mockVault.getAddress(),
        queueId
      );

      // Then settle
      await redemptionManager.connect(processor).settleRedemptionQueue(
        await mockVault.getAddress(),
        queueId
      );

      const queue = await redemptionManager.getRedemptionQueue(await mockVault.getAddress(), queueId);
      expect(queue.status).to.equal(QueueStatus.SETTLED);
      expect(queue.processedAt).to.be.greaterThan(0);
    });
  });

  describe("View Functions", function () {
    let requestId;

    beforeEach(async function () {
      await redemptionManager.connect(investor1).requestRedemption(
        await mockVault.getAddress(),
        REDEEM_AMOUNT
      );

      const nextId = await redemptionManager.nextRequestId(await mockVault.getAddress());
      requestId = nextId - 1n;
    });

    it("Should get redemption request", async function () {
      const request = await redemptionManager.getRedemptionRequest(await mockVault.getAddress(), requestId);
      expect(request.investor).to.equal(investor1.address);
      expect(request.shares).to.equal(REDEEM_AMOUNT);
    });

    it("Should get vault request IDs", async function () {
      const requestIds = await redemptionManager.getVaultRequestIds(await mockVault.getAddress());
      expect(requestIds.length).to.equal(1);
    });

    it("Should get pending requests count", async function () {
      const count = await redemptionManager.getPendingRequestsCount(await mockVault.getAddress());
      expect(count).to.equal(1);
    });

    it("Should get ready requests count", async function () {
      let count = await redemptionManager.getReadyRequestsCount(await mockVault.getAddress());
      expect(count).to.equal(0);

      // Process the request
      await redemptionManager.connect(processor).processRedemption(
        await mockVault.getAddress(),
        requestId,
        ethers.parseEther("490")
      );

      count = await redemptionManager.getReadyRequestsCount(await mockVault.getAddress());
      expect(count).to.equal(1);
    });
  });

  describe("Configuration", function () {
    it("Should allow admin to set vault registry", async function () {
      const registry = ethers.Wallet.createRandom().address;

      await redemptionManager.setVaultRegistry(registry);

      expect(await redemptionManager.vaultRegistry()).to.equal(registry);
    });

    it("Should allow admin to set identity registry", async function () {
      const registry = ethers.Wallet.createRandom().address;

      await redemptionManager.setIdentityRegistry(registry);

      expect(await redemptionManager.identityRegistry()).to.equal(registry);
    });

    it("Should only allow admin to configure", async function () {
      const registry = ethers.Wallet.createRandom().address;

      await expect(
        redemptionManager.connect(investor1).setVaultRegistry(registry)
      ).to.be.reverted;
      
      await expect(
        redemptionManager.connect(investor1).setIdentityRegistry(registry)
      ).to.be.reverted;
    });

    it("Should reject zero address for configuration", async function () {
      await expect(redemptionManager.setVaultRegistry(ethers.ZeroAddress)).to.be.reverted;
      await expect(redemptionManager.setIdentityRegistry(ethers.ZeroAddress)).to.be.reverted;
    });
  });

  describe("Multiple Redemptions", function () {
    it("Should handle multiple redemption requests", async function () {
      // Create multiple requests
      await redemptionManager.connect(investor1).requestRedemption(
        await mockVault.getAddress(),
        REDEEM_AMOUNT
      );

      await redemptionManager.connect(investor1).requestRedemption(
        await mockVault.getAddress(),
        REDEEM_AMOUNT
      );

      await redemptionManager.connect(investor2).requestRedemption(
        await mockVault.getAddress(),
        REDEEM_AMOUNT
      );

      const requestIds = await redemptionManager.getVaultRequestIds(await mockVault.getAddress());
      expect(requestIds.length).to.equal(3);

      const pendingCount = await redemptionManager.getPendingRequestsCount(await mockVault.getAddress());
      expect(pendingCount).to.equal(3);
    });
  });
});
