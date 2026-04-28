const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;
  
  // ADDRESSES FROM PREVIOUS RUN Console Output
  const deployed = {
    kycRegistry: "0x3821a385b87B9E68452E3922Ddf174144d7d4cfb",
    identitySBT: "0x498b4BA71CD6A86261e3C86a248913122BD24Bb1",
    identityRegistry: "0x7Ea0b9e274C8F5Ef76B0D9db83d9d67D24496f93",
    complianceModule: "0x43ab162Cb6559D9Cea7Ef042dC892786B97191f9",
    assetFactory: "0xf07e33B8d7EFdB31072E93F4194a79E381dd7977",
    assetRegistry: "0x87BEa53c65D81862Db011526C789E37728687643",
    vaultFactory: "0x5c61B2ed0748B5164F3a5954E8cd5ed0eb3247Df",
  };

  const feeData = await hre.ethers.provider.getFeeData();
  const gasPrice = (feeData.gasPrice * 300n) / 100n; // 200% buffer (3x)
  console.log("Resuming with Gas Price:", hre.ethers.formatUnits(gasPrice, "gwei"), "gwei");

  try {
    // --- 🔹 PHASE 4: MARKETPLACE (L4) ---
    console.log("\n>>> [4/4] FINISHING LAYER 4 (MARKETPLACE)...");

    const MarketplaceFactory = await hre.ethers.getContractFactory("MarketplaceFactory");
    const marketplaceFactory = await MarketplaceFactory.deploy({ gasPrice }); 
    await marketplaceFactory.waitForDeployment();
    deployed.marketplaceFactory = await marketplaceFactory.getAddress();
    console.log("  ✅ MarketplaceFactory:", deployed.marketplaceFactory);

    const SettlementEngine = await hre.ethers.getContractFactory("SettlementEngine");
    const settlementEngine = await SettlementEngine.deploy({ gasPrice });
    await settlementEngine.waitForDeployment();
    deployed.settlementEngine = await settlementEngine.getAddress();

    const ClearingHouse = await hre.ethers.getContractFactory("ClearingHouse");
    const clearingHouse = await ClearingHouse.deploy({ gasPrice });
    await clearingHouse.waitForDeployment();
    deployed.clearingHouse = await clearingHouse.getAddress();

    console.log(">>> Configuring Links...");
    await (await settlementEngine.setComplianceConfig(deployed.identityRegistry, deployed.complianceModule, { gasPrice })).wait();
    await (await settlementEngine.authorizeSettler(deployed.clearingHouse, { gasPrice })).wait();
    await (await clearingHouse.setSettlementEngine(deployed.settlementEngine, { gasPrice })).wait();
    await (await clearingHouse.setIdentityRegistry(deployed.identityRegistry, { gasPrice })).wait();

    // --- 🚀 FINAL SAVING ---
    const deploymentFile = path.join(process.cwd(), "deployments", `${network}-deployment.json`);
    const deploymentInfo = {
      network,
      chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
      deployer: deployer.address,
      timestamp: new Date().toISOString(),
      contracts: deployed
    };

    fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));

    console.log("\n" + "=".repeat(80));
    console.log("🎉 SUCCESS: CRATS PROTOCOL FULLY RESUMED AND SAVED!");
    console.log("💾 Registry Saved to:", deploymentFile);
    console.log("=".repeat(80) + "\n");

  } catch (error) {
    console.error("\n❌ RESUME FAILED:");
    console.error(error);
  }
}

main();
