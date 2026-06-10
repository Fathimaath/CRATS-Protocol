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
    
    const identityRegistry = await hre.ethers.getContractAt("IdentityRegistry", deployment.contracts.identityRegistry);
    const identitySBT = await hre.ethers.getContractAt("IdentitySBT", deployment.contracts.identitySBT);
    
    // Configure compliance on OrderBookEngine if not already configured
    const currentRegistry = await orderBook.identityRegistry();
    if (currentRegistry === hre.ethers.ZeroAddress) {
        console.log("Configuring compliance on OrderBookEngine...");
        await (await orderBook.connect(deployer).setComplianceConfig(
            deployment.contracts.identityRegistry,
            deployment.contracts.complianceModule
        )).wait();
    }

    // Check if buyer is verified, if not onboard them
    const existingTokenId = await identitySBT.tokenIdOf(buyer.address);
    if (existingTokenId == 0) {
        console.log("Onboarding buyer...");
        const roleInvestor = 1;
        const jurisdiction = 250;
        const did = "did:crats:buyer-bob";
        const didHash = hre.ethers.id(did);
        const expiresAt = Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60);

        console.log("  Registering buyer identity...");
        const regTx = await identityRegistry.connect(deployer).registerIdentity(
            buyer.address,
            roleInvestor,
            jurisdiction,
            didHash,
            did,
            expiresAt
        );
        await regTx.wait();

        const tokenId = await identitySBT.tokenIdOf(buyer.address);
        console.log("  Verifying buyer KYC status...");
        await (await identitySBT.connect(deployer).updateStatus(tokenId, 2)).wait();
        console.log("✅ Buyer onboarded and verified.");
    }

    const quoteToken = deployment.contracts.usdc;
    const usdc = await hre.ethers.getContractAt("MockERC20", quoteToken);
    
    // Mint 1000 USDC to buyer
    const mintAmount = hre.ethers.parseEther("1000");
    console.log("Minting 1000 USDC to Buyer...");
    await (await usdc.connect(buyer).mint(buyer.address, mintAmount)).wait();

    // Approve OrderBookEngine to spend buyer's USDC
    console.log("Approving OrderBookEngine to spend buyer's USDC...");
    await (await usdc.connect(buyer).approve(deployment.contracts.orderBookEngine, mintAmount)).wait();

    // Order Parameters
    const baseToken = deployment.contracts.azureVault;
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
