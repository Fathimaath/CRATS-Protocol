const { getDeploymentInfo } = require("./helpers");
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

    console.log("Filling Order (Simulation)...");
    // In a real scenario, the Matching Engine would pair this with a Sell order.
    // Here we simulate the fill by calling fillOrder directly.
    const fillAmount = hre.ethers.parseEther("100");
    const fillTx = await orderBook.connect(investor).fillOrder(orderId, fillAmount);
    await fillTx.wait();

    console.log("Clearing Trade in ClearingHouse...");
    const tradeId = hre.ethers.id("TRADE_" + Date.now());
    const clearTx = await clearingHouse.clearTrade(
        tradeId,
        buyer.address,
        investor.address,
        deployment.contracts.azureToken,
        "0x0000000000000000000000000000000000000000",
        fillAmount,
        hre.ethers.parseUnits("1.05", 18)
    );
    await clearTx.wait();

    console.log("✅ Trade cleared and settled.");
    console.log("Secondary market lifecycle complete!");
}

main().catch(console.error);
