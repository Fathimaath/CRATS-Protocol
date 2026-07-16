const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("Deploying Redemption Manager and Lifecycle Exit Manager on Localhost...");
    const [deployer] = await hre.ethers.getSigners();
    const network = "localhost";

    const deploymentFile = path.join(process.cwd(), "deployments", `${network}-deployment.json`);
    const data = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
    const contracts = data.contracts;

    // 1. Deploy RedemptionManager
    const RedemptionManager = await hre.ethers.getContractFactory("RedemptionManager");
    const rm = await RedemptionManager.deploy(deployer.address);
    await rm.waitForDeployment();
    const rmAddr = await rm.getAddress();
    console.log("  RedemptionManager deployed at:", rmAddr);
    contracts.redemptionManager = rmAddr;

    // Link AssetRegistry on RedemptionManager
    await (await rm.setAssetRegistry(contracts.assetRegistry)).wait();
    console.log("  Linked AssetRegistry on RedemptionManager");

    // 2. Deploy LifecycleExitManager (UUPS Proxy)
    const LifecycleExitManager = await hre.ethers.getContractFactory("LifecycleExitManager");
    const exitProxy = await hre.upgrades.deployProxy(LifecycleExitManager, [deployer.address, contracts.usdc, contracts.assetRegistry], {
        kind: "uups"
    });
    await exitProxy.waitForDeployment();
    const exitAddr = await exitProxy.getAddress();
    console.log("  LifecycleExitManager deployed at:", exitAddr);
    contracts.lifecycleExitManager = exitAddr;

    fs.writeFileSync(deploymentFile, JSON.stringify(data, null, 2));
    console.log("💾 Saved updated localhost addresses.");
}

main().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
