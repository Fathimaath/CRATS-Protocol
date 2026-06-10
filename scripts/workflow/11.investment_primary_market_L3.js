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

    const usdc = await hre.ethers.getContractAt("MockERC20", deployment.contracts.usdc);

    console.log("Simulating Primary Market Flow:");
    console.log(" 1. Minting USDC to Investor...");
    await (await usdc.connect(investor).mint(investor.address, amount)).wait();

    console.log(" 2. Investor transferring USDC to Treasury...");
    const payTx = await usdc.connect(investor).transfer(treasury.address, amount);
    await payTx.wait();

    console.log(" 3. Treasury approving Vault to spend AZURE...");
    const approveTx = await azureToken.connect(treasury).approve(deployment.contracts.azureVault, amount);
    await approveTx.wait();

    console.log(" 4. Treasury depositing AZURE into Vault to mint Shares (vAZURE) directly to Investor wallet...");
    const depositTx = await azureVault.connect(treasury).deposit(amount, investor.address);
    await depositTx.wait();

    const shares = await azureVault.balanceOf(investor.address);
    console.log("✅ Investor Shares:", hre.ethers.formatEther(shares), "vAZURE");

    await saveWorkflowResult(11, {
        name: "Investment (Primary)",
        txHash: depositTx.hash || payTx.hash,
        contract: deployment.contracts.azureVault,
        details: `Investor deposited 10k AZURE for vAZURE shares`,
        layer: "L3"
    });
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
