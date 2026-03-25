const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

// CRATSConfig constants
const REGULATOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("REGULATOR_ROLE"));
const COMPLIANCE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("COMPLIANCE_ROLE"));

describe("Layer 1/2 - CircuitBreakerModule", function () {
  let circuitBreaker;
  let admin, user1, regulator, compliance;

  beforeEach(async function () {
    [admin, user1, , regulator, compliance] = await ethers.getSigners();
    
    // Deploy compliance version of CircuitBreakerModule (NOT upgradeable)
    const CircuitBreakerModule = await ethers.getContractFactory("contracts/compliance/CircuitBreakerModule.sol:CircuitBreakerModule");
    circuitBreaker = await CircuitBreakerModule.deploy(admin.address);
    await circuitBreaker.waitForDeployment();

    // Setup roles
    await circuitBreaker.grantRole(REGULATOR_ROLE, regulator.address);
    await circuitBreaker.grantRole(COMPLIANCE_ROLE, compliance.address);
  });

  describe("Initialization", function () {
    it("Should initialize correctly", async function () {
      const DEFAULT_ADMIN_ROLE = await circuitBreaker.DEFAULT_ADMIN_ROLE();
      expect(await circuitBreaker.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
    });

    it("Should start with no market halt", async function () {
      expect(await circuitBreaker.marketWideHalt()).to.be.false;
    });
  });

  describe("Market-Wide Trading Halt", function () {
    it("Should activate market-wide halt", async function () {
      const reason = ethers.encodeBytes32String("Market emergency");
      const duration = 3600; // 1 hour

      const tx = await circuitBreaker.connect(regulator).activateMarketHalt(reason, duration);
      const receipt = await tx.wait();
      
      const event = receipt.logs.find(log => {
        try {
          const parsed = circuitBreaker.interface.parseLog(log);
          return parsed.name === "MarketHaltActivated";
        } catch { return false; }
      });

      expect(event).to.not.be.undefined;
      expect(await circuitBreaker.marketWideHalt()).to.be.true;
    });

    it("Should only allow regulator to activate market halt", async function () {
      const reason = ethers.encodeBytes32String("Market emergency");
      
      await expect(
        circuitBreaker.connect(user1).activateMarketHalt(reason, 3600)
      ).to.be.reverted;
    });

    it("Should store halt reason and expiry", async function () {
      const reason = ethers.encodeBytes32String("Market emergency");
      const duration = 3600;
      const startTime = await time.latest();

      await circuitBreaker.connect(regulator).activateMarketHalt(reason, duration);

      expect(await circuitBreaker.haltReason()).to.equal(reason);
      const haltExpiry = await circuitBreaker.haltExpiry();
      expect(haltExpiry).to.be.closeTo(startTime + duration, 10); // Allow 10s buffer
    });

    it("Should deactivate market-wide halt", async function () {
      const reason = ethers.encodeBytes32String("Market emergency");
      
      await circuitBreaker.connect(regulator).activateMarketHalt(reason, 3600);
      await circuitBreaker.connect(regulator).deactivateMarketHalt();

      expect(await circuitBreaker.marketWideHalt()).to.be.false;
      expect(await circuitBreaker.haltReason()).to.equal(ethers.ZeroHash);
      expect(await circuitBreaker.haltExpiry()).to.equal(0);
    });

    it("Should only allow regulator to deactivate market halt", async function () {
      const reason = ethers.encodeBytes32String("Market emergency");
      await circuitBreaker.connect(regulator).activateMarketHalt(reason, 3600);
      
      await expect(
        circuitBreaker.connect(user1).deactivateMarketHalt()
      ).to.be.reverted;
    });
  });

  describe("Asset-Specific Trading Halt", function () {
    let assetToken;

    beforeEach(async function () {
      // Deploy mock asset token
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      assetToken = await MockERC20.deploy("Test Asset", "TST");
    });

    it("Should activate asset-specific halt", async function () {
      const reason = ethers.encodeBytes32String("Asset emergency");
      const duration = 3600;

      const tx = await circuitBreaker.connect(regulator).activateAssetHalt(
        await assetToken.getAddress(),
        reason,
        duration
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          const parsed = circuitBreaker.interface.parseLog(log);
          return parsed.name === "AssetHaltActivated";
        } catch { return false; }
      });

      expect(event).to.not.be.undefined;
    });

    it("Should only allow regulator to activate asset halt", async function () {
      const reason = ethers.encodeBytes32String("Asset emergency");
      
      await expect(
        circuitBreaker.connect(user1).activateAssetHalt(await assetToken.getAddress(), reason, 3600)
      ).to.be.reverted;
    });

    it("Should track halt record for asset", async function () {
      const reason = ethers.encodeBytes32String("Asset emergency");
      const duration = 3600;
      const assetAddress = await assetToken.getAddress();

      await circuitBreaker.connect(regulator).activateAssetHalt(assetAddress, reason, duration);

      const haltRecord = await circuitBreaker.assetHaltRecords(assetAddress);
      expect(haltRecord.isHalted).to.be.true;
      expect(haltRecord.reason).to.equal(reason);
    });

    it("Should deactivate asset-specific halt", async function () {
      const reason = ethers.encodeBytes32String("Asset emergency");
      const assetAddress = await assetToken.getAddress();

      await circuitBreaker.connect(regulator).activateAssetHalt(assetAddress, reason, 3600);
      await circuitBreaker.connect(regulator).deactivateAssetHalt(assetAddress);

      const haltRecord = await circuitBreaker.assetHaltRecords(assetAddress);
      expect(haltRecord.isHalted).to.be.false;
    });

    it("Should only allow regulator to deactivate asset halt", async function () {
      const reason = ethers.encodeBytes32String("Asset emergency");
      const assetAddress = await assetToken.getAddress();

      await circuitBreaker.connect(regulator).activateAssetHalt(assetAddress, reason, 3600);
      
      await expect(
        circuitBreaker.connect(user1).deactivateAssetHalt(assetAddress)
      ).to.be.reverted;
    });
  });

  describe("Check Trading Allowed", function () {
    let assetToken;

    beforeEach(async function () {
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      assetToken = await MockERC20.deploy("Test Asset", "TST");
    });

    it("Should return true when no halts active", async function () {
      const result = await circuitBreaker.checkTradingAllowed.staticCall(await assetToken.getAddress());
      expect(result).to.be.true;
    });

    it("Should return false when market-wide halt active", async function () {
      const reason = ethers.encodeBytes32String("Market emergency");
      await circuitBreaker.connect(regulator).activateMarketHalt(reason, 3600);

      const result = await circuitBreaker.checkTradingAllowed.staticCall(await assetToken.getAddress());
      expect(result).to.be.false;
    });

    it("Should return false when asset-specific halt active", async function () {
      const reason = ethers.encodeBytes32String("Asset emergency");
      await circuitBreaker.connect(regulator).activateAssetHalt(await assetToken.getAddress(), reason, 3600);

      const result = await circuitBreaker.checkTradingAllowed.staticCall(await assetToken.getAddress());
      expect(result).to.be.false;
    });

    it("Should return true after market halt expires", async function () {
      const reason = ethers.encodeBytes32String("Brief halt");
      await circuitBreaker.connect(regulator).activateMarketHalt(reason, 1);

      await time.increase(2);

      const result = await circuitBreaker.checkTradingAllowed.staticCall(await assetToken.getAddress());
      expect(result).to.be.true;
    });

    it("Should return true after asset halt expires", async function () {
      const reason = ethers.encodeBytes32String("Brief halt");
      await circuitBreaker.connect(regulator).activateAssetHalt(await assetToken.getAddress(), reason, 1);

      await time.increase(2);

      const result = await circuitBreaker.checkTradingAllowed.staticCall(await assetToken.getAddress());
      expect(result).to.be.true;
    });
  });

  describe("Is Halted", function () {
    let assetToken;

    beforeEach(async function () {
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      assetToken = await MockERC20.deploy("Test Asset", "TST");
    });

    it("Should return false when no halts active", async function () {
      const result = await circuitBreaker.checkTradingAllowed.staticCall(await assetToken.getAddress());
      expect(result).to.be.true;
    });

    it("Should return true when market-wide halt active", async function () {
      const reason = ethers.encodeBytes32String("Market emergency");
      await circuitBreaker.connect(regulator).activateMarketHalt(reason, 3600);

      const result = await circuitBreaker.checkTradingAllowed.staticCall(await assetToken.getAddress());
      expect(result).to.be.false;
    });

    it("Should return true when asset-specific halt active", async function () {
      const reason = ethers.encodeBytes32String("Asset emergency");
      await circuitBreaker.connect(regulator).activateAssetHalt(await assetToken.getAddress(), reason, 3600);

      const result = await circuitBreaker.checkTradingAllowed.staticCall(await assetToken.getAddress());
      expect(result).to.be.false;
    });

    it("Should return false after halt expires", async function () {
      const reason = ethers.encodeBytes32String("Brief halt");
      await circuitBreaker.connect(regulator).activateMarketHalt(reason, 1);

      await time.increase(2);

      const result = await circuitBreaker.checkTradingAllowed.staticCall(await assetToken.getAddress());
      expect(result).to.be.true;
    });

    it("Should return false for one asset when another asset is halted", async function () {
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const assetToken2 = await MockERC20.deploy("Test Asset 2", "TST2");

      const reason = ethers.encodeBytes32String("Asset emergency");
      await circuitBreaker.connect(regulator).activateAssetHalt(await assetToken.getAddress(), reason, 3600);

      const result = await circuitBreaker.checkTradingAllowed.staticCall(await assetToken2.getAddress());
      expect(result).to.be.true;
    });
  });

  describe("Multiple Assets", function () {
    let assetToken1, assetToken2, assetToken3;

    beforeEach(async function () {
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      assetToken1 = await MockERC20.deploy("Asset 1", "A1");
      assetToken2 = await MockERC20.deploy("Asset 2", "A2");
      assetToken3 = await MockERC20.deploy("Asset 3", "A3");
    });

    it("Should halt multiple assets independently", async function () {
      const reason1 = ethers.encodeBytes32String("Asset 1 emergency");
      const reason2 = ethers.encodeBytes32String("Asset 2 emergency");

      await circuitBreaker.connect(regulator).activateAssetHalt(await assetToken1.getAddress(), reason1, 3600);
      await circuitBreaker.connect(regulator).activateAssetHalt(await assetToken2.getAddress(), reason2, 3600);

      const result1 = await circuitBreaker.checkTradingAllowed.staticCall(await assetToken1.getAddress());
      const result2 = await circuitBreaker.checkTradingAllowed.staticCall(await assetToken2.getAddress());
      const result3 = await circuitBreaker.checkTradingAllowed.staticCall(await assetToken3.getAddress());

      expect(result1).to.be.false;
      expect(result2).to.be.false;
      expect(result3).to.be.true;
    });

    it("Should allow selective asset halt deactivation", async function () {
      const reason = ethers.encodeBytes32String("Emergency");

      await circuitBreaker.connect(regulator).activateAssetHalt(await assetToken1.getAddress(), reason, 3600);
      await circuitBreaker.connect(regulator).activateAssetHalt(await assetToken2.getAddress(), reason, 3600);

      await circuitBreaker.connect(regulator).deactivateAssetHalt(await assetToken1.getAddress());

      const result1 = await circuitBreaker.checkTradingAllowed.staticCall(await assetToken1.getAddress());
      const result2 = await circuitBreaker.checkTradingAllowed.staticCall(await assetToken2.getAddress());

      expect(result1).to.be.true;
      expect(result2).to.be.false;
    });
  });

  describe("Events", function () {
    it("Should emit MarketHaltActivated event", async function () {
      const reason = ethers.encodeBytes32String("Market emergency");
      
      await expect(
        circuitBreaker.connect(regulator).activateMarketHalt(reason, 3600)
      ).to.emit(circuitBreaker, "MarketHaltActivated");
    });

    it("Should emit MarketHaltDeactivated event", async function () {
      const reason = ethers.encodeBytes32String("Market emergency");
      await circuitBreaker.connect(regulator).activateMarketHalt(reason, 3600);
      
      await expect(
        circuitBreaker.connect(regulator).deactivateMarketHalt()
      ).to.emit(circuitBreaker, "MarketHaltDeactivated");
    });

    it("Should emit AssetHaltActivated event", async function () {
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const assetToken = await MockERC20.deploy("Test Asset", "TST");
      const reason = ethers.encodeBytes32String("Asset emergency");
      
      await expect(
        circuitBreaker.connect(regulator).activateAssetHalt(await assetToken.getAddress(), reason, 3600)
      ).to.emit(circuitBreaker, "AssetHaltActivated");
    });

    it("Should emit AssetHaltDeactivated event", async function () {
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const assetToken = await MockERC20.deploy("Test Asset", "TST");
      const reason = ethers.encodeBytes32String("Asset emergency");
      
      await circuitBreaker.connect(regulator).activateAssetHalt(await assetToken.getAddress(), reason, 3600);
      
      await expect(
        circuitBreaker.connect(regulator).deactivateAssetHalt(await assetToken.getAddress())
      ).to.emit(circuitBreaker, "AssetHaltDeactivated");
    });
  });

  describe("Halt Record Structure", function () {
    it("Should return proper HaltRecord structure", async function () {
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const assetToken = await MockERC20.deploy("Test Asset", "TST");
      const reason = ethers.encodeBytes32String("Asset emergency");
      const duration = 3600;

      await circuitBreaker.connect(regulator).activateAssetHalt(await assetToken.getAddress(), reason, duration);

      const haltRecord = await circuitBreaker.assetHaltRecords(await assetToken.getAddress());
      
      // HaltRecord: [isHalted, reason, timestamp, initiator, expiry]
      expect(haltRecord[0]).to.be.true;
      expect(haltRecord[1]).to.equal(reason);
    });
  });

  describe("Edge Cases", function () {
    let assetToken;

    beforeEach(async function () {
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      assetToken = await MockERC20.deploy("Test Asset", "TST");
    });

    it("Should reject zero address asset", async function () {
      const reason = ethers.encodeBytes32String("Emergency");
      
      await expect(
        circuitBreaker.connect(regulator).activateAssetHalt(ethers.ZeroAddress, reason, 3600)
      ).to.be.revertedWith("CircuitBreaker: Asset cannot be zero address");
    });

    it("Should handle very short halt duration", async function () {
      const reason = ethers.encodeBytes32String("Brief halt");
      
      await circuitBreaker.connect(regulator).activateAssetHalt(await assetToken.getAddress(), reason, 1);
      
      const result1 = await circuitBreaker.checkTradingAllowed.staticCall(await assetToken.getAddress());
      expect(result1).to.be.false;
      
      await time.increase(2);
      
      const result2 = await circuitBreaker.checkTradingAllowed.staticCall(await assetToken.getAddress());
      expect(result2).to.be.true;
    });

    it("Should handle very long halt duration", async function () {
      const reason = ethers.encodeBytes32String("Long halt");
      const oneYear = 365 * 24 * 60 * 60;
      
      await circuitBreaker.connect(regulator).activateAssetHalt(await assetToken.getAddress(), reason, oneYear);
      
      const result = await circuitBreaker.checkTradingAllowed.staticCall(await assetToken.getAddress());
      expect(result).to.be.false;
    });

    it("Should allow reactivating halt after deactivation", async function () {
      const reason1 = ethers.encodeBytes32String("First emergency");
      const reason2 = ethers.encodeBytes32String("Second emergency");

      await circuitBreaker.connect(regulator).activateAssetHalt(await assetToken.getAddress(), reason1, 3600);
      await circuitBreaker.connect(regulator).deactivateAssetHalt(await assetToken.getAddress());
      await circuitBreaker.connect(regulator).activateAssetHalt(await assetToken.getAddress(), reason2, 3600);

      const result = await circuitBreaker.checkTradingAllowed.staticCall(await assetToken.getAddress());
      expect(result).to.be.false;
      
      const haltRecord = await circuitBreaker.assetHaltRecords(await assetToken.getAddress());
      expect(haltRecord[1]).to.equal(reason2);
    });
  });
});
