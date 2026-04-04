const { getDeploymentInfo, saveDeploymentInfo, saveWorkflowResult } = require("./helpers");
const hre = require("hardhat");

/**
 * Step 13: Secondary Market Order (L4)
 * Places a buy order on the OrderBookEngine.
 */
async function main() {
    console.log("\n--- Step 13: Secondary Market Order (L4) ---");
    const deployment = await getDeploymentInfo();
    const [deployer, issuer, investor, buyer] = await hre.ethers.getSigners(); // Signer 3

    if (!deployment.contracts.azureToken) {
        throw new Error("Azure Token not deployed. Run Step 4 first.");
    }

    const orderBook = await hre.ethers.getContractAt("OrderBookEngine", deployment.contracts.orderBookEngine);
    
    // Order Parameters
    const baseToken = deployment.contracts.azureVault;
    const quoteToken = "0x0000000000000000000000000000000000000000"; // Simulation: Native ETH or mock stable
    const amount = hre.ethers.parseEther("100");
    const price = hre.ethers.parseUnits("1.05", 18); // Asking for $1.05
    const isBuy = true;
    const expiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour

    console.log("Placing Buy Order for 100 AZURE at $1.05...");
    const tx = await orderBook.connect(buyer).placeOrder(
        baseToken,
        quoteToken,
        amount,
        price,
        isBuy,
        expiry
    );
    const receipt = await tx.wait();

    // Find OrderPlaced event
    const event = receipt.logs.find(log => {
        try {
            return orderBook.interface.parseLog(log).name === "OrderPlaced";
        } catch (e) {
            return false;
        }
    });

    const orderId = orderBook.interface.parseLog(event).args.orderId;
    console.log("✅ Order placed successfully. ID:", orderId);

    // Save to deployment info
    deployment.contracts.lastOrderId = orderId;
    await saveDeploymentInfo(deployment);

    await saveWorkflowResult(13, {
        name: "Secondary Market Order",
        txHash: receipt.hash || tx.hash,
        contract: deployment.contracts.orderBookEngine,
        details: `Buy Order for 100 vAZURE @ $1.05`,
        layer: "L4"
    });
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
