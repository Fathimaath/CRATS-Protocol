const hre = require("hardhat");

async function main() {
  const [admin, valuer, otherUser] = await hre.ethers.getSigners();
  console.log("Admin address:", admin.address);

  // Deploy FeeEngine mock or use admin address as dummy
  const dummyFeeEngine = admin.address;

  console.log("\n>>> Deploying NAVOracle on local node...");
  const NAVOracle = await hre.ethers.getContractFactory("NAVOracle");
  const navOracle = await hre.upgrades.deployProxy(
    NAVOracle,
    [dummyFeeEngine, admin.address],
    { initializer: "initialize", kind: "uups" }
  );
  await navOracle.waitForDeployment();
  const navOracleAddress = await navOracle.getAddress();
  console.log("NAVOracle deployed at:", navOracleAddress);

  // Grant valuer role
  const VALUER_ROLE = await navOracle.VALUER_ROLE();
  await navOracle.grantRole(VALUER_ROLE, valuer.address);
  console.log("Granted VALUER_ROLE to:", valuer.address);

  // 1. Verify that enforceStalenessCircuitBreaker reverts on unregistered asset
  const unregisteredAssetId = hre.ethers.id("UNREGISTERED_ASSET");
  console.log("\nTesting enforceStalenessCircuitBreaker on unregistered asset...");
  try {
    await navOracle.enforceStalenessCircuitBreaker(unregisteredAssetId);
    console.error("❌ Error: Did not revert on unregistered asset!");
    process.exit(1);
  } catch (e) {
    console.log("✅ Successfully reverted as expected:", e.message);
  }

  // 2. Register a vault and asset
  const assetId = hre.ethers.id("ASSET_1");
  const vaultId = hre.ethers.id("VAULT_1");
  const dummyVault = otherUser.address; // dummy vault address
  const weightConfig = {
    appraisalWeight: 1000,
    dcfWeight: 0,
    incomeWeight: 0,
    compWeight: 0,
    appraisalMaxAge: 30 * 24 * 60 * 60, // 30 days
    dcfMaxAge: 0,
    incomeMaxAge: 0,
    compMaxAge: 0
  };

  console.log("\nRegistering mock vault in NAVOracle...");
  await navOracle.registerVault(vaultId, dummyVault, assetId, weightConfig);
  console.log("Vault registered.");

  // 3. Verify enforceStalenessCircuitBreaker reverts if no submission exists
  console.log("\nTesting enforceStalenessCircuitBreaker on registered asset with no submissions...");
  try {
    await navOracle.enforceStalenessCircuitBreaker(assetId);
    console.error("❌ Error: Did not revert when no submission exists!");
    process.exit(1);
  } catch (e) {
    console.log("✅ Successfully reverted as expected:", e.message);
  }

  // 4. Submit initial NAV
  console.log("\nSubmitting initial NAV...");
  const valuationDate = Math.floor(Date.now() / 1000);
  await navOracle.connect(valuer).submitNAV(
    assetId,
    hre.ethers.parseUnits("1.50", 18),
    valuationDate,
    hre.ethers.id("DOC_1"),
    0
  );
  console.log("Initial NAV submitted.");

  // 5. Verify it does not pause when NAV is fresh
  console.log("\nCalling enforceStalenessCircuitBreaker when NAV is fresh...");
  await navOracle.enforceStalenessCircuitBreaker(assetId);
  console.log("Is Paused:", await navOracle.paused() ? "❌ Yes (Unexpected)" : "✅ No (Expected)");

  // 6. Fast forward block time to make it stale
  console.log("\nIncreasing blockchain time to make NAV stale (31 days)...");
  await hre.ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]);
  await hre.ethers.provider.send("evm_mine");

  // 7. Verify it pauses now
  console.log("\nCalling enforceStalenessCircuitBreaker when NAV is stale...");
  await navOracle.enforceStalenessCircuitBreaker(assetId);
  const isPaused = await navOracle.paused();
  console.log("Is Paused:", isPaused ? "✅ Yes (Expected)" : "❌ No (Unexpected)");
  if (!isPaused) {
    console.error("❌ Error: Contract did not pause on stale NAV!");
    process.exit(1);
  }

  // 8. Verify unpause works
  console.log("\nCalling unpause as admin...");
  await navOracle.connect(admin).unpause();
  const isPausedAfter = await navOracle.paused();
  console.log("Is Paused after unpause:", isPausedAfter ? "❌ Yes (Unexpected)" : "✅ No (Expected)");
  if (isPausedAfter) {
    console.error("❌ Error: Contract remained paused after unpause!");
    process.exit(1);
  }

  console.log("\n🎉 Local node verification successful!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
