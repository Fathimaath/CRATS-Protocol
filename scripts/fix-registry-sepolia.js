const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const ASSET_FACTORY_ADDR = "0xc991c1614c850795Dc844ce089f95338372710e8";
  
  console.log("\n1️⃣ Deploying AssetRegistry Proxy...");
  const AssetRegistry = await hre.ethers.getContractFactory("AssetRegistry");
  const assetRegistry = await hre.upgrades.deployProxy(AssetRegistry, [deployer.address], { kind: "uups" });
  await assetRegistry.waitForDeployment();
  const assetRegistryAddress = await assetRegistry.getAddress();
  console.log("✅ AssetRegistry Proxy:", assetRegistryAddress);

  console.log("\n2️⃣ Linking to AssetFactory...");
  const assetFactory = await hre.ethers.getContractAt("AssetFactory", ASSET_FACTORY_ADDR);
  await (await assetFactory.setAssetRegistry(assetRegistryAddress)).wait();
  console.log("✅ Linked to Factory");

  console.log("\n3️⃣ Authorizing Factory in Registry...");
  await (await assetRegistry.addOperator(ASSET_FACTORY_ADDR)).wait();
  console.log("✅ Factory Authorized");

  console.log("\n🚀 All set! Update your constants/index.ts with:");
  console.log(`ASSET_REGISTRY_ADDR = "${assetRegistryAddress}"`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
