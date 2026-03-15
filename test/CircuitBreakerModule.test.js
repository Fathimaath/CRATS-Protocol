const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");

describe("CircuitBreakerModule", function () {
  async function deployCircuitBreakerFixture() {
    const [owner, regulator, operator, user1] = await ethers.getSigners();

    // Deploy CircuitBreakerModule
    const CircuitBreakerModule = await ethers.getContractFactory("CircuitBreakerModule");
    const circuitBreaker = await CircuitBreakerModule.deploy(owner.address);

    // Grant REGULATOR_ROLE
    const REGULATOR_ROLE = ethers.id("REGULATOR_ROLE");
    await circuitBreaker.grantRole(REGULATOR_ROLE, regulator.address);

    // Add operator
    await circuitBreaker.connect(owner).addOperator(operator.address);

    return { circuitBreaker, owner, regulator, operator, user1 };
  }

  describe("Deployment", function () {
    it("Should deploy successfully", async function () {
      const { circuitBreaker } = await loadFixture(deployCircuitBreakerFixture);
      expect(await circuitBreaker.marketWideHalt()).to.be.false;
    });

    it("Should set the right owner as operator", async function () {
      const { circuitBreaker, owner } = await loadFixture(deployCircuitBreakerFixture);
      expect(await circuitBreaker.isOperator(owner.address)).to.be.true;
    });
  });

  describe("Market-Wide Trading Halt", function () {
    it("Should activate market-wide halt", async function () {
      const { circuitBreaker, regulator } = await loadFixture(deployCircuitBreakerFixture);

      const reason = ethers.id("Market volatility");
      const duration = 86400; // 1 day

      await expect(
        circuitBreaker.connect(regulator).activateMarketHalt(reason, duration)
      ).to.emit(circuitBreaker, "MarketHaltActivated");

      expect(await circuitBreaker.marketWideHalt()).to.be.true;
    });

    it("Should deactivate market-wide halt", async function () {
      const { circuitBreaker, regulator } = await loadFixture(deployCircuitBreakerFixture);

      await circuitBreaker.connect(regulator).activateMarketHalt(ethers.id("Test"), 86400);
      
      await expect(
        circuitBreaker.connect(regulator).deactivateMarketHalt()
      ).to.emit(circuitBreaker, "MarketHaltDeactivated");

      expect(await circuitBreaker.marketWideHalt()).to.be.false;
    });

    it("Should fail when non-regulator tries to activate halt", async function () {
      const { circuitBreaker, user1 } = await loadFixture(deployCircuitBreakerFixture);

      await expect(
        circuitBreaker.connect(user1).activateMarketHalt(ethers.id("Test"), 86400)
      ).to.be.reverted;
    });

    it("Should fail to activate with zero duration", async function () {
      const { circuitBreaker, regulator } = await loadFixture(deployCircuitBreakerFixture);

      await expect(
        circuitBreaker.connect(regulator).activateMarketHalt(ethers.id("Test"), 0)
      ).to.be.revertedWith("CircuitBreaker: Duration must be positive");
    });

    it("Should check trading allowed during halt", async function () {
      const { circuitBreaker, regulator } = await loadFixture(deployCircuitBreakerFixture);

      const asset = ethers.Wallet.createRandom().address;

      // Before halt - trading allowed
      expect(await circuitBreaker.checkTradingAllowed(asset)).to.be.true;

      // Activate halt
      await circuitBreaker.connect(regulator).activateMarketHalt(ethers.id("Test"), 86400);

      // During halt - trading not allowed
      expect(await circuitBreaker.checkTradingAllowed(asset)).to.be.false;
    });
  });

  describe("Asset-Specific Trading Halt", function () {
    it("Should activate asset-specific halt", async function () {
      const { circuitBreaker, regulator } = await loadFixture(deployCircuitBreakerFixture);

      const asset = ethers.Wallet.createRandom().address;
      const reason = ethers.id("Asset suspension");

      await expect(
        circuitBreaker.connect(regulator).activateAssetHalt(asset, reason, 86400)
      ).to.emit(circuitBreaker, "AssetHaltActivated");

      expect(await circuitBreaker.assetHalted(asset)).to.be.true;
    });

    it("Should deactivate asset-specific halt", async function () {
      const { circuitBreaker, regulator } = await loadFixture(deployCircuitBreakerFixture);

      const asset = ethers.Wallet.createRandom().address;
      await circuitBreaker.connect(regulator).activateAssetHalt(asset, ethers.id("Test"), 86400);

      await expect(
        circuitBreaker.connect(regulator).deactivateAssetHalt(asset)
      ).to.emit(circuitBreaker, "AssetHaltDeactivated");

      expect(await circuitBreaker.assetHalted(asset)).to.be.false;
    });

    it("Should fail when non-regulator tries to activate asset halt", async function () {
      const { circuitBreaker, user1 } = await loadFixture(deployCircuitBreakerFixture);

      const asset = ethers.Wallet.createRandom().address;
      await expect(
        circuitBreaker.connect(user1).activateAssetHalt(asset, ethers.id("Test"), 86400)
      ).to.be.reverted;
    });
  });

  describe("Price Limits (Limit Up/Down)", function () {
    it("Should set asset price limits", async function () {
      const { circuitBreaker, operator } = await loadFixture(deployCircuitBreakerFixture);

      const asset = ethers.Wallet.createRandom().address;
      const limitUpBps = 1000; // 10%
      const limitDownBps = 1000; // 10%
      const priceBandPeriod = 86400; // 1 day

      await expect(
        circuitBreaker.connect(operator).setAssetLimits(asset, limitUpBps, limitDownBps, priceBandPeriod)
      ).to.emit(circuitBreaker, "AssetLimitsSet");

      const limits = await circuitBreaker.assetLimits(asset);
      expect(limits.limitUpBps).to.equal(limitUpBps);
      expect(limits.limitDownBps).to.equal(limitDownBps);
    });

    it("Should update reference price", async function () {
      const { circuitBreaker, operator } = await loadFixture(deployCircuitBreakerFixture);

      const asset = ethers.Wallet.createRandom().address;
      await circuitBreaker.connect(operator).setAssetLimits(asset, 1000, 1000, 86400);

      const referencePrice = ethers.parseEther("100");

      await expect(
        circuitBreaker.connect(operator).updateReferencePrice(asset, referencePrice)
      ).to.emit(circuitBreaker, "ReferencePriceUpdated");
    });

    it("Should check price limits correctly", async function () {
      const { circuitBreaker, operator } = await loadFixture(deployCircuitBreakerFixture);

      const asset = ethers.Wallet.createRandom().address;
      const limitUpBps = 1000; // 10%
      const limitDownBps = 1000; // 10%
      const priceBandPeriod = 86400;

      await circuitBreaker.connect(operator).setAssetLimits(asset, limitUpBps, limitDownBps, priceBandPeriod);
      await circuitBreaker.connect(operator).updateReferencePrice(asset, ethers.parseEther("100"));

      // Price within limits (105 = +5%, within 10%)
      let result = await circuitBreaker.checkPriceLimits(asset, ethers.parseEther("105"));
      expect(result[0]).to.be.true;

      // Price above limit up (115 = +15%, exceeds 10%)
      result = await circuitBreaker.checkPriceLimits(asset, ethers.parseEther("115"));
      expect(result[0]).to.be.false;

      // Price below limit down (85 = -15%, exceeds 10%)
      result = await circuitBreaker.checkPriceLimits(asset, ethers.parseEther("85"));
      expect(result[0]).to.be.false;
    });

    it("Should allow any price when reference price is 0", async function () {
      const { circuitBreaker, operator } = await loadFixture(deployCircuitBreakerFixture);

      const asset = ethers.Wallet.createRandom().address;
      await circuitBreaker.connect(operator).setAssetLimits(asset, 1000, 1000, 86400);

      const result = await circuitBreaker.checkPriceLimits(asset, ethers.parseEther("1000"));
      expect(result[0]).to.be.true;
      expect(result[1]).to.equal("No reference price set");
    });

    it("Should fail when non-operator tries to set limits", async function () {
      const { circuitBreaker, user1 } = await loadFixture(deployCircuitBreakerFixture);

      const asset = ethers.Wallet.createRandom().address;
      await expect(
        circuitBreaker.connect(user1).setAssetLimits(asset, 1000, 1000, 86400)
      ).to.be.reverted;
    });

    it("Should fail with limit too high", async function () {
      const { circuitBreaker, operator } = await loadFixture(deployCircuitBreakerFixture);

      const asset = ethers.Wallet.createRandom().address;
      await expect(
        circuitBreaker.connect(operator).setAssetLimits(asset, 6000, 1000, 86400) // 60% > 50% max
      ).to.be.revertedWith("CircuitBreaker: Limit up too high");
    });
  });

  describe("Operator Management", function () {
    it("Should add operator", async function () {
      const { circuitBreaker, owner, user1 } = await loadFixture(deployCircuitBreakerFixture);

      await expect(
        circuitBreaker.connect(owner).addOperator(user1.address)
      ).to.not.be.reverted;

      expect(await circuitBreaker.isOperator(user1.address)).to.be.true;
    });

    it("Should remove operator", async function () {
      const { circuitBreaker, owner, operator } = await loadFixture(deployCircuitBreakerFixture);

      expect(await circuitBreaker.isOperator(operator.address)).to.be.true;

      await circuitBreaker.connect(owner).removeOperator(operator.address);

      expect(await circuitBreaker.isOperator(operator.address)).to.be.false;
    });

    it("Should fail when non-owner tries to add operator", async function () {
      const { circuitBreaker, user1 } = await loadFixture(deployCircuitBreakerFixture);

      await expect(
        circuitBreaker.connect(user1).addOperator(user1.address)
      ).to.be.reverted;
    });
  });

  describe("View Functions", function () {
    it("Should return correct version", async function () {
      const { circuitBreaker } = await loadFixture(deployCircuitBreakerFixture);
      const version = await circuitBreaker.version();
      expect(version).to.equal("3.0.0");
    });

    it("Should check if address is regulator", async function () {
      const { circuitBreaker, regulator, user1 } = await loadFixture(deployCircuitBreakerFixture);

      expect(await circuitBreaker.isRegulator(regulator.address)).to.be.true;
      expect(await circuitBreaker.isRegulator(user1.address)).to.be.false;
    });
  });

  describe("Full Circuit Breaker Flow", function () {
    it("Should complete full halt and price limit flow", async function () {
      const { circuitBreaker, regulator, operator } = await loadFixture(deployCircuitBreakerFixture);

      const asset = ethers.Wallet.createRandom().address;

      // Set price limits
      await circuitBreaker.connect(operator).setAssetLimits(asset, 1000, 1000, 86400);
      await circuitBreaker.connect(operator).updateReferencePrice(asset, ethers.parseEther("100"));

      // Activate market halt
      await circuitBreaker.connect(regulator).activateMarketHalt(ethers.id("Emergency"), 3600);

      // Trading should be halted
      expect(await circuitBreaker.checkTradingAllowed(asset)).to.be.false;

      // Wait for halt to expire
      await time.increase(3601);

      // Trading should be allowed again
      expect(await circuitBreaker.checkTradingAllowed(asset)).to.be.true;

      // Price within limits should pass
      const result = await circuitBreaker.checkPriceLimits(asset, ethers.parseEther("105"));
      expect(result[0]).to.be.true;
    });
  });
});
