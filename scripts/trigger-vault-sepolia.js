const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    const deploymentFile = path.resolve(__dirname, "../deployments/sepolia-deployment.json");
    const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
    const [deployer] = await hre.ethers.getSigners();
    
    console.log("Using deployer address:", deployer.address);
    console.log("VaultFactory address:", deployment.contracts.vaultFactory);
    
    const vaultFactory = await hre.ethers.getContractAt("VaultFactory", deployment.contracts.vaultFactory);
    
    const mockAsset = deployment.contracts.usdc; // Use USDC as the underlying asset
    const randomSuffix = Math.floor(Math.random() * 1000);
    const vaultName = `E2E Test Vault ${randomSuffix}`;
    const vaultSymbol = `E2E-V${randomSuffix}`;
    const category = hre.ethers.id("REAL_ESTATE");
    
    console.log(`Deploying new SyncVault on Sepolia: ${vaultName} (${vaultSymbol})...`);
    
    const tx = await vaultFactory.connect(deployer).createSyncVault(
        mockAsset,
        vaultName,
        vaultSymbol,
        category
    );
    
    console.log("Transaction Hash:", tx.hash);
    console.log("Waiting for block confirmation on Sepolia...");
    const receipt = await tx.wait();
    
    // Find VaultCreated event
    const event = receipt.logs.find(log => {
        try {
            return vaultFactory.interface.parseLog(log).name === "VaultCreated";
        } catch (e) {
            return false;
        }
    });
    
    const parsedLog = vaultFactory.interface.parseLog(event);
    const vaultAddress = parsedLog.args.vault;
    
    console.log("✅ SyncVault successfully deployed on Sepolia!");
    console.log("Vault Address:", vaultAddress);
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
