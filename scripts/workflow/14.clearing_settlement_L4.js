const { getDeploymentInfo, saveWorkflowResult } = require("./helpers");
const hre = require("hardhat");

/**
 * Step 14: Clearing & Settlement (L4)
 * Simulates clearing via ClearingHouse and settlement on Engine.
 */
async function main() {
    console.log("\n--- Step 14: Clearing & Settlement (L4) ---");
    const deployment = await getDeploymentInfo();
    const [deployer, issuer, investor, buyer] = await hre.ethers.getSigners();

    const orderBook = await hre.ethers.getContractAt("OrderBookEngine", deployment.contracts.orderBookEngine);
    const clearingHouse = await hre.ethers.getContractAt("ClearingHouse", deployment.contracts.clearingHouse);
    
    const orderId = deployment.contracts.lastOrderId;
    if (!orderId) {
        throw new Error("No order found. Run Step 13 first.");
    }

    const azureVault = await hre.ethers.getContractAt("SyncVault", deployment.contracts.azureVault);
    
    // Amount to fill: 100 shares (same as order amount)
    const fillAmount = hre.ethers.parseEther("100");
    
    console.log("Approving OrderBookEngine to spend investor's vAZURE...");
    await (await azureVault.connect(investor).approve(deployment.contracts.orderBookEngine, fillAmount)).wait();

    console.log("Filling Order (Simulation)...");
    // In a real scenario, the Matching Engine would pair this with a Sell order.
    // Here we simulate the fill by calling fillOrder directly.
    const fillTx = await orderBook.connect(investor).fillOrder(orderId, fillAmount);
    await fillTx.wait();

    console.log("Clearing Trade in ClearingHouse...");
    const tradeId = hre.ethers.id("TRADE_" + Date.now());
    const clearTx = await clearingHouse.clearTrade(
        tradeId,
        buyer.address,
        investor.address,
        deployment.contracts.azureVault,
        deployment.contracts.usdc,
        fillAmount,
        hre.ethers.parseUnits("1.05", 18)
    );
    await clearTx.wait();

    console.log("✅ Trade cleared and settled.");
    console.log("Secondary market lifecycle complete!");

    await saveWorkflowResult(14, {
        name: "Clearing & Settlement",
        txHash: clearTx.hash || fillTx.hash,
        contract: deployment.contracts.clearingHouse,
        details: `Matched trade settled: Buyer Account 3, Seller Investor`,
        layer: "L4"
    });
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
