const hre = require("hardhat");

async function main() {
    const vaultAddress = '0x7b62b22eAB928EcD03B3a8DF12386659596975ef';
    const assetTokenAddress = '0xFc4CD6fa703F9492D10E0E14495341525841A439';
    const investor = '0x2c0e0553deB2Bc7744aB8a9917fD104146B56d65';
    const treasury = '0x2c0e0553deB2Bc7744aB8a9917fD104146B56d65'; // Wait, let's check who the treasury is
    
    const treasuryAddress = '0x08a9a44dA0BF5eD6bF9027da175dd60949f17d6d';
    console.log("Treasury address:", treasuryAddress);
    
    const vault = await hre.ethers.getContractAt("SyncVault", vaultAddress);
    const assetToken = await hre.ethers.getContractAt("AssetToken", assetTokenAddress);

    // Let's impersonate treasury
    await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [treasuryAddress],
    });

    const treasurySigner = await hre.ethers.getSigner(treasuryAddress);

    // Let's send some gas to treasury so it can transact
    const [deployer] = await hre.ethers.getSigners();
    await deployer.sendTransaction({
        to: treasuryAddress,
        value: hre.ethers.parseEther("1.0"),
    });

    // Check balances
    const assetBalance = await assetToken.balanceOf(treasuryAddress);
    console.log(`Treasury RWA asset balance: ${hre.ethers.formatEther(assetBalance)}`);

    const amount = hre.ethers.parseEther("100");
    
    console.log("Approving vault to spend RWA tokens...");
    await (await assetToken.connect(treasurySigner).approve(vaultAddress, amount)).wait();
    console.log("Approval succeeded.");

    // Check if vault has operator role for treasury
    const operatorRole = await vault.OPERATOR_ROLE();
    const isOperator = await vault.hasRole(operatorRole, treasuryAddress);
    console.log("Is treasury operator?", isOperator);

    // Impersonate fee engine to see config if needed
    const feeEngineAddress = await vault.feeEngine();
    console.log("Fee Engine:", feeEngineAddress);

    // Try calling deposit(amount, investor)
    console.log("Attempting deposit(amount, investor)...");
    try {
        const tx = await vault.connect(treasurySigner).deposit(amount, investor);
        await tx.wait();
        console.log("✅ deposit succeeded!");
    } catch (err) {
        console.error("❌ deposit failed!");
        console.error(err);
    }

    // Try calling depositFromTreasury(amount, investor, usdcAmountPaid)
    console.log("\nAttempting depositFromTreasury(amount, investor, 100)...");
    try {
        const tx = await vault.connect(treasurySigner).depositFromTreasury(amount, investor, hre.ethers.parseUnits("100", 6));
        await tx.wait();
        console.log("✅ depositFromTreasury succeeded!");
    } catch (err) {
        console.error("❌ depositFromTreasury failed!");
        console.error(err);
    }
}

main().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
