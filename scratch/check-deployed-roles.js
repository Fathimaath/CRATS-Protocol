const hre = require("hardhat");

async function main() {
    const exitManagerAddr = "0xC8af899eac24F755704a1ad287fCe62b77929a6c";
    console.log(`Checking roles on LifecycleExitManager at ${exitManagerAddr} on Sepolia...`);

    const [deployer] = await hre.ethers.getSigners();
    console.log("Local deployer wallet address:", deployer.address);

    const exitManager = await hre.ethers.getContractAt("LifecycleExitManager", exitManagerAddr);

    const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000";
    const GUARDIAN_ROLE = hre.ethers.solidityPackedKeccak256(["string"], ["GUARDIAN_ROLE"]);
    const timelockAddr = "0x8DAEEf03a41ACd48c01A6Cca0684991fFDF525D8";

    // Query roles
    const deployerHasAdmin = await exitManager.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
    const deployerHasGuardian = await exitManager.hasRole(GUARDIAN_ROLE, deployer.address);

    const timelockHasAdmin = await exitManager.hasRole(DEFAULT_ADMIN_ROLE, timelockAddr);
    const timelockHasGuardian = await exitManager.hasRole(GUARDIAN_ROLE, timelockAddr);

    console.log("\nResults:");
    console.log(`- Deployer has DEFAULT_ADMIN_ROLE: ${deployerHasAdmin}`);
    console.log(`- Deployer has GUARDIAN_ROLE: ${deployerHasGuardian}`);
    console.log(`- Timelock (${timelockAddr}) has DEFAULT_ADMIN_ROLE: ${timelockHasAdmin}`);
    console.log(`- Timelock (${timelockAddr}) has GUARDIAN_ROLE: ${timelockHasGuardian}`);

    // Let's also check USDC and AssetRegistry address variables configured in the contract
    try {
        const usdcAddress = await exitManager.usdc();
        const assetRegistryAddress = await exitManager.assetRegistry();
        console.log(`\nConfigured USDC address in contract: ${usdcAddress}`);
        console.log(`Configured AssetRegistry address in contract: ${assetRegistryAddress}`);
    } catch (err) {
        console.log("Error querying usdc/assetRegistry variables:", err.message);
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
