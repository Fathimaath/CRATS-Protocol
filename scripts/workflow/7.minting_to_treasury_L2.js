const { getDeploymentInfo, saveWorkflowResult } = require("./helpers");
const hre = require("hardhat");

/**
 * Step 7: Minting to Treasury (L2)
 * Mints the asset tokens to the Smart Treasury wallet.
 */
async function main() {
    console.log("\n--- Step 7: Minting to Treasury (L2) ---");
    const deployment = await getDeploymentInfo();
    const [deployer, issuer] = await hre.ethers.getSigners();
    
    // Simulation: Use an address as Treasury
    const treasuryAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // Signer 1

    if (!deployment.contracts.azureToken) {
        throw new Error("Azure Token not deployed. Run Step 4 first.");
    }

    const azureToken = await hre.ethers.getContractAt("AssetToken", deployment.contracts.azureToken);
    
    const amount = hre.ethers.parseEther("10000000"); // 10M
    
    console.log("Minting 10M AZURE to Treasury...");
    const tx = await azureToken.connect(issuer).mint(treasuryAddress, amount);
    await tx.wait();

    const balance = await azureToken.balanceOf(treasuryAddress);
    console.log("Treasury Balance:", hre.ethers.formatEther(balance), "AZURE");

    console.log("✅ Tokens minted to treasury successfully.");

    await saveWorkflowResult(7, {
        name: "Minting to Treasury",
        txHash: receipt.hash || tx.hash,
        contract: deployment.contracts.azureToken,
        details: `Amount: 10M AZURE minted to Issuer`,
        layer: "L2"
    });
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
