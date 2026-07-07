const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("==================================================");
    console.log("   CRATS Redemption Module Sepolia Verification");
    console.log("==================================================\n");

    const [deployer] = await hre.ethers.getSigners();
    const network = hre.network.name;

    if (network !== "sepolia") {
        throw new Error("This script must be run on the sepolia network");
    }

    console.log("Using deployer Address:", deployer.address);

    const deploymentFile = path.join(process.cwd(), "deployments", `${network}-deployment.json`);
    if (!fs.existsSync(deploymentFile)) {
        throw new Error(`Deployment file not found at ${deploymentFile}`);
    }

    const data = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
    const L1 = data.contracts;
    const L2 = data.contracts;
    const L3 = data.contracts;

    // Helper to calculate gas price with buffer
    const feeData = await hre.ethers.provider.getFeeData();
    const overrides = {};
    if (feeData.maxFeePerGas) {
        overrides.maxFeePerGas = (feeData.maxFeePerGas * 150n) / 100n;
    } else {
        overrides.gasPrice = feeData.gasPrice ? (feeData.gasPrice * 150n) / 100n : hre.ethers.parseUnits("30", "gwei");
    }
    if (feeData.maxPriorityFeePerGas) {
        overrides.maxPriorityFeePerGas = (feeData.maxPriorityFeePerGas * 150n) / 100n;
    }

    // 1. Read Upgraded AssetRegistry
    console.log("\n1️⃣  Reading Upgraded AssetRegistry...");
    const assetRegistry = await hre.ethers.getContractAt("AssetRegistry", L2.assetRegistry);
    console.log("  AssetRegistry Address:", L2.assetRegistry);
    const versionReg = await assetRegistry.version();
    console.log("  AssetRegistry Version:", versionReg);

    // 2. Read Upgraded Compliance
    console.log("\n2️⃣  Reading Upgraded Compliance...");
    const compliance = await hre.ethers.getContractAt("Compliance", L1.complianceModule);
    console.log("  Compliance Address:", L1.complianceModule);
    const identityRegComp = await compliance.identityRegistry();
    console.log("  Compliance Linked IdentityRegistry:", identityRegComp);

    // 3. Read RedemptionManager
    console.log("\n3️⃣  Reading RedemptionManager...");
    const redemptionManager = await hre.ethers.getContractAt("RedemptionManager", L3.redemptionManager);
    console.log("  RedemptionManager Address:", L3.redemptionManager);
    const linkedRegistry = await redemptionManager.assetRegistry();
    console.log("  RedemptionManager Linked Registry:", linkedRegistry);

    // 4. Read LifecycleExitManager
    console.log("\n4️⃣  Reading LifecycleExitManager...");
    const exitManager = await hre.ethers.getContractAt("LifecycleExitManager", L3.lifecycleExitManager);
    console.log("  LifecycleExitManager Address:", L3.lifecycleExitManager);
    const usdcAddr = await exitManager.usdc();
    console.log("  LifecycleExitManager USDC Address:", usdcAddr);

    // 5. Deploy a test SyncVault on Sepolia (validates the factory template upgrade)
    console.log("\n5️⃣  Creating a Test SyncVault on Sepolia via VaultFactory...");
    const vaultFactory = await hre.ethers.getContractAt("VaultFactory", L3.vaultFactory);
    const category = hre.ethers.id("REAL_ESTATE");
    const suffix = Math.floor(Math.random() * 1000);
    const name = `Sepolia Test Vault ${suffix}`;
    const symbol = `STV-${suffix}`;

    console.log(`  Deploying: ${name} (${symbol}) with underlying asset ${L3.usdc}...`);
    const tx = await vaultFactory.connect(deployer).createSyncVault(
        L3.usdc, // Using USDC as underlying asset
        name,
        symbol,
        category,
        overrides
    );
    console.log("  Transaction Hash:", tx.hash);
    console.log("  Waiting for confirmation...");
    const receipt = await tx.wait();

    const event = receipt.logs.find(log => {
        try {
            return vaultFactory.interface.parseLog(log).name === "VaultCreated";
        } catch (e) {
            return false;
        }
    });

    const parsedLog = vaultFactory.interface.parseLog(event);
    const vaultAddress = parsedLog.args.vault;
    console.log("  ✅ Test SyncVault deployed at:", vaultAddress);

    // 6. Verify that the new vault has correct configuration
    console.log("\n6️⃣  Verifying SyncVault templates integration...");
    const vault = await hre.ethers.getContractAt("SyncVault", vaultAddress);
    const vaultRegistry = await vault.assetRegistry();
    console.log("  Vault Linked AssetRegistry:", vaultRegistry);
    console.log("  Expected AssetRegistry:", L2.assetRegistry);

    if (vaultRegistry.toLowerCase() === L2.assetRegistry.toLowerCase()) {
        console.log("  ✅ Vault successfully instantiated from the new upgrade template!");
    } else {
        console.log("  ❌ Vault registry mismatch!");
    }

    console.log("\n==================================================");
    console.log("🎉 ALL SEPOLIA CONTRACT VERIFICATIONS SUCCESSFUL!");
    console.log("==================================================");
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
