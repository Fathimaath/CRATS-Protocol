const { getDeploymentInfo, saveWorkflowResult } = require("./helpers");
const hre = require("hardhat");

async function main() {
    console.log("\n--- Step 20: Carbon P2P Secondary Market Trade (L4) ---");
    const deployment = await getDeploymentInfo();
    const [deployer, issuer, investor, buyer] = await hre.ethers.getSigners();

    if (!deployment.contracts.carbonToken) {
        throw new Error("Carbon Token not deployed. Run Step 17 first.");
    }

    const orderBook = await hre.ethers.getContractAt("OrderBookEngine", deployment.contracts.orderBookEngine);
    const clearingHouse = await hre.ethers.getContractAt("ClearingHouse", deployment.contracts.clearingHouse);
    const identityRegistry = await hre.ethers.getContractAt("IdentityRegistry", deployment.contracts.identityRegistry);
    const identitySBT = await hre.ethers.getContractAt("IdentitySBT", deployment.contracts.identitySBT);
    const carbonVault = await hre.ethers.getContractAt("SyncVault", deployment.contracts.carbonVault);
    const usdc = await hre.ethers.getContractAt("MockERC20", deployment.contracts.usdc);

    // Onboard buyer if not already done in Step 13
    const existingTokenId = await identitySBT.tokenIdOf(buyer.address);
    if (existingTokenId == 0n || existingTokenId == 0) {
        console.log("Onboarding buyer...");
        const roleInvestor = 1;
        const jurisdiction = 250;
        const did = "did:crats:buyer-bob";
        const didHash = hre.ethers.id(did);
        const expiresAt = Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60);

        await (await identityRegistry.connect(deployer).registerIdentity(
            buyer.address,
            roleInvestor,
            jurisdiction,
            didHash,
            did,
            expiresAt
        )).wait();

        const tokenId = await identitySBT.tokenIdOf(buyer.address);
        await (await identitySBT.connect(deployer).updateStatus(tokenId, 2)).wait();
        console.log("✅ Buyer onboarded and verified.");
    }

    // Configure compliance on OrderBookEngine if not already done
    const currentRegistry = await orderBook.identityRegistry();
    if (currentRegistry === hre.ethers.ZeroAddress) {
        await (await orderBook.connect(deployer).setComplianceConfig(
            deployment.contracts.identityRegistry,
            deployment.contracts.complianceModule
        )).wait();
    }

    // Sell 200 shares
    const tradeShares = hre.ethers.parseEther("200");
    const pricePerShare = hre.ethers.parseUnits("15.5", 18); // Asking for $15.50
    const quoteToken = deployment.contracts.usdc;
    const usdcDecimals = await usdc.decimals();
    const tradeQuoteAmount = hre.ethers.parseUnits("3100", usdcDecimals); // 200 shares * $15.50 = $3100

    console.log("1. Minting USDC to Buyer for P2P trade...");
    await (await usdc.connect(buyer).mint(buyer.address, tradeQuoteAmount)).wait();
    await (await usdc.connect(buyer).approve(deployment.contracts.orderBookEngine, tradeQuoteAmount)).wait();

    console.log("2. Investor approving OrderBookEngine to spend vCARBON shares...");
    await (await carbonVault.connect(investor).approve(deployment.contracts.orderBookEngine, tradeShares)).wait();

    console.log("3. Buyer placing Buy Order...");
    const tx = await orderBook.connect(buyer).placeOrder(
        deployment.contracts.carbonVault,
        quoteToken,
        tradeShares,
        pricePerShare,
        true, // isBuy
        Math.floor(Date.now() / 1000) + 3600
    );
    const receipt = await tx.wait();

    const event = receipt.logs.find(log => {
        try {
            return orderBook.interface.parseLog(log).name === "OrderPlaced";
        } catch (e) {
            return false;
        }
    });
    const orderId = orderBook.interface.parseLog(event).args.orderId;

    console.log("4. Investor filling order...");
    await (await orderBook.connect(investor).fillOrder(orderId, tradeShares)).wait();

    console.log("5. Clearing P2P trade in ClearingHouse...");
    const tradeId = hre.ethers.id("CARBON_P2P_" + Date.now());
    await (await clearingHouse.clearTrade(
        tradeId,
        buyer.address,
        investor.address,
        deployment.contracts.carbonVault,
        quoteToken,
        tradeShares,
        pricePerShare
    )).wait();

    console.log("✅ P2P Trade cleared and settled.");

    // Query holdings view for both to verify update
    const carbonMetadataStore = await hre.ethers.getContractAt("CarbonAssetMetadataStore", deployment.contracts.carbonMetadataStore);
    const sellerView = await carbonMetadataStore.getCarbonHoldingView(
        deployment.contracts.carbonToken,
        deployment.contracts.carbonVault,
        investor.address
    );
    const buyerView = await carbonMetadataStore.getCarbonHoldingView(
        deployment.contracts.carbonToken,
        deployment.contracts.carbonVault,
        buyer.address
    );

    console.log("\nBeneficial Ownership Register (BOR) Update Verification:");
    console.log("Investor (Seller):");
    console.log("  Shares Remaining:", hre.ethers.formatEther(sellerView.vaultShares), "vCARBON");
    console.log("  Proportional Credits:", hre.ethers.formatEther(sellerView.creditEquivalent), "tCO2e");
    console.log("Buyer:");
    console.log("  Shares Acquired:", hre.ethers.formatEther(buyerView.vaultShares), "vCARBON");
    console.log("  Proportional Credits:", hre.ethers.formatEther(buyerView.creditEquivalent), "tCO2e");

    await saveWorkflowResult(20, {
        name: "Carbon P2P Trade",
        txHash: tx.hash,
        contract: deployment.contracts.clearingHouse,
        details: `Investor sold 200 vCARBON shares to Buyer at $15.50/share`,
        layer: "L4"
    });
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
