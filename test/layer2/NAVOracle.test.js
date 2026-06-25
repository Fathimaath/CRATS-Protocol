const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("Layer 2 - NAVOracle Upgrade & Fix", function () {
  let navOracle;
  let admin, valuer, otherUser;
  let dummyFeeEngine;
  let dummyVault;

  const appraisalMaxAge = 30 * 24 * 60 * 60; // 30 days
  const weightConfig = {
    appraisalWeight: 1000,
    dcfWeight: 0,
    incomeWeight: 0,
    compWeight: 0,
    appraisalMaxAge: appraisalMaxAge,
    dcfMaxAge: 0,
    incomeMaxAge: 0,
    compMaxAge: 0
  };

  beforeEach(async function () {
    [admin, valuer, otherUser, dummyFeeEngine, dummyVault] = await ethers.getSigners();

    // Deploy NAVOracle using upgrades proxy
    const NAVOracle = await ethers.getContractFactory("NAVOracle");
    navOracle = await upgrades.deployProxy(
      NAVOracle,
      [dummyFeeEngine.address, admin.address],
      { initializer: "initialize", kind: "uups" }
    );
    await navOracle.waitForDeployment();

    // Grant valuer role
    const VALUER_ROLE = await navOracle.VALUER_ROLE();
    await navOracle.grantRole(VALUER_ROLE, valuer.address);
  });

  describe("enforceStalenessCircuitBreaker security checks", function () {
    it("should revert if asset is not registered", async function () {
      const unregisteredAssetId = ethers.id("UNREGISTERED_ASSET");
      await expect(
        navOracle.enforceStalenessCircuitBreaker(unregisteredAssetId)
      ).to.be.revertedWith("Asset not registered");
    });

    it("should revert if asset is registered but has no submissions yet", async function () {
      const assetId = ethers.id("ASSET_NO_SUBMISSION");
      const vaultId = ethers.id("VAULT_NO_SUBMISSION");
      
      // Register vault/asset
      await navOracle.registerVault(vaultId, dummyVault.address, assetId, weightConfig);

      await expect(
        navOracle.enforceStalenessCircuitBreaker(assetId)
      ).to.be.revertedWith("No submission exists");
    });

    it("should not pause if asset is registered and NAV is fresh", async function () {
      const assetId = ethers.id("ASSET_FRESH");
      const vaultId = ethers.id("VAULT_FRESH");
      
      await navOracle.registerVault(vaultId, dummyVault.address, assetId, weightConfig);
      
      // Submit NAV (fresh at current block timestamp)
      const valuationDate = await time.latest();
      await navOracle.connect(valuer).submitNAV(
        assetId,
        ethers.parseUnits("1.50", 18),
        valuationDate,
        ethers.id("DOC_HASH"),
        0 // ValuationMethod.FULL_APPRAISAL
      );

      // Call circuit breaker
      await navOracle.enforceStalenessCircuitBreaker(assetId);
      expect(await navOracle.paused()).to.be.false;
    });

    it("should pause if asset is registered, has submission, but is STALE", async function () {
      const assetId = ethers.id("ASSET_STALE");
      const vaultId = ethers.id("VAULT_STALE");
      
      await navOracle.registerVault(vaultId, dummyVault.address, assetId, weightConfig);
      
      // Submit NAV
      const valuationDate = await time.latest();
      await navOracle.connect(valuer).submitNAV(
        assetId,
        ethers.parseUnits("1.50", 18),
        valuationDate,
        ethers.id("DOC_HASH"),
        0
      );

      // Fast forward past CRITICAL_THRESHOLD (30 days) to make it stale
      // CRITICAL_THRESHOLD is 30 days in NAVOracle.sol
      await time.increase(30 * 24 * 60 * 60 + 1);

      // Call circuit breaker - should succeed and pause the contract
      await expect(navOracle.enforceStalenessCircuitBreaker(assetId))
        .to.emit(navOracle, "CircuitBreakerTriggered")
        .withArgs(assetId);

      expect(await navOracle.paused()).to.be.true;
    });
  });

  describe("Unpause mechanism", function () {
    let assetId;
    let vaultId;

    beforeEach(async function () {
      assetId = ethers.id("ASSET_UNPAUSE_TEST");
      vaultId = ethers.id("VAULT_UNPAUSE_TEST");
      await navOracle.registerVault(vaultId, dummyVault.address, assetId, weightConfig);

      // Submit and make it stale
      await navOracle.connect(valuer).submitNAV(
        assetId,
        ethers.parseUnits("1.50", 18),
        await time.latest(),
        ethers.id("DOC_HASH"),
        0
      );
      await time.increase(31 * 24 * 60 * 60);

      // Trigger pause
      await navOracle.enforceStalenessCircuitBreaker(assetId);
      expect(await navOracle.paused()).to.be.true;
    });

    it("should revert if non-admin tries to unpause", async function () {
      await expect(
        navOracle.connect(otherUser).unpause()
      ).to.be.revertedWithCustomError(navOracle, "AccessControlUnauthorizedAccount");
    });

    it("should allow admin to unpause and allow submitNAV again", async function () {
      // Unpause
      await navOracle.connect(admin).unpause();
      expect(await navOracle.paused()).to.be.false;

      // Check that NAV submission works again
      await expect(
        navOracle.connect(valuer).submitNAV(
          assetId,
          ethers.parseUnits("1.60", 18),
          await time.latest(),
          ethers.id("DOC_HASH"),
          0
        )
      ).to.emit(navOracle, "NAVSubmitted");
    });
  });
});
