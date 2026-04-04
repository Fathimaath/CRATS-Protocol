const { getDeploymentInfo, saveWorkflowResult } = require("./helpers");
const hre = require("hardhat");

/**
 * Step 11: Investment / Primary Market (L3)
 * Investor deposits into the "Azure Manor Vault".
 */
async function main() {
    console.log("\n--- Step 11: Investment / Primary Market (L3) ---");
    const deployment = await getDeploymentInfo();
    const [deployer, issuer, investor] = await hre.ethers.getSigners();
    const treasury = issuer; // In this simulation, issuer is treasury

    if (!deployment.contracts.azureVault) {
        throw new Error("Azure Vault not deployed. Run Step 8 first.");
    }

    const azureVault = await hre.ethers.getContractAt("SyncVault", deployment.contracts.azureVault);
    const azureToken = await hre.ethers.getContractAt("AssetToken", deployment.contracts.azureToken);
    
    // Amount to invest: $10,000 (10k tokens)
    const amount = hre.ethers.parseEther("10000");

    console.log("Simulating Backend Process:");
    console.log(" 1. Transferring AZURE from Treasury to Vault...");
    const transferTx = await azureToken.connect(treasury).transfer(deployment.contracts.azureVault, amount);
    await transferTx.wait();

    console.log(" 2. Minting Shares (vAZURE) to Investor...");
    // Direct deposit simulation: In a real scenario, the investor deposits USDC 
    // and the backend converts it. Here we simulate the final share minting.
    const depositTx = await azureVault.connect(investor).deposit(amount, investor.address);
    await depositTx.wait();

    const shares = await azureVault.balanceOf(investor.address);
    console.log("✅ Investor Shares:", hre.ethers.formatEther(shares), "vAZURE");

    await saveWorkflowResult(11, {
        name: "Investment (Primary)",
        txHash: depositTx.hash || transferTx.hash,
        contract: deployment.contracts.azureVault,
        details: `Investor deposited 10k AZURE for vAZURE shares`,
        layer: "L3"
    });
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
