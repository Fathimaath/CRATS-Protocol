const { getDeploymentInfo, saveWorkflowResult } = require("./helpers");
const hre = require("hardhat");

async function main() {
    console.log("\n--- Step 19: Carbon Investment / Primary Market (L3) ---");
    const deployment = await getDeploymentInfo();
    const [deployer, issuer, investor] = await hre.ethers.getSigners();
    const treasury = deployer; // Deployer acts as treasury here

    if (!deployment.contracts.carbonVault) {
        throw new Error("Carbon Vault not deployed. Run Step 18 first.");
    }

    const carbonVault = await hre.ethers.getContractAt("SyncVault", deployment.contracts.carbonVault);
    const carbonToken = await hre.ethers.getContractAt("AssetToken", deployment.contracts.carbonToken);
    const usdc = await hre.ethers.getContractAt("MockERC20", deployment.contracts.usdc);

    // Buy 1,000 VCARBON tokens at $15/token = $15,000 USDC paid
    const tokenAmount = hre.ethers.parseEther("1000");
    const usdcAmount = hre.ethers.parseUnits("15000", 6); // USDC uses 6 decimals typically, but let's check decimals or use 18 if mock is 18.
    // Wait, let's verify mock USDC decimals. In MockERC20 standard, it defaults to 18 decimals.
    // Let's query usdc.decimals() to be safe!
    const usdcDecimals = await usdc.decimals();
    const usdcPaid = hre.ethers.parseUnits("15000", usdcDecimals);

    // Ensure Treasury (deployer) is registered in IdentityRegistry so it can hold the asset tokens
    const identityRegistry = await hre.ethers.getContractAt("IdentityRegistry", deployment.contracts.identityRegistry);
    const identitySBT = await hre.ethers.getContractAt("IdentitySBT", deployment.contracts.identitySBT);
    const existingTreasuryTokenId = await identitySBT.tokenIdOf(treasury.address);
    if (existingTreasuryTokenId === 0n || existingTreasuryTokenId === 0) {
        console.log("Registering Treasury in IdentityRegistry for compliance...");
        const roleInstitutional = 3;
        const jurisdiction = 826;
        const did = `did:crats:treasury-${treasury.address.toLowerCase()}`;
        const didHash = hre.ethers.id(did);
        const expiresAt = Math.floor(Date.now() / 1000) + (10 * 365 * 24 * 60 * 60);

        await (await identityRegistry.connect(deployer).registerIdentity(
            treasury.address,
            roleInstitutional,
            jurisdiction,
            didHash,
            did,
            expiresAt
        )).wait();

        const tokenId = await identitySBT.tokenIdOf(treasury.address);
        await (await identitySBT.connect(deployer).updateStatus(tokenId, 2)).wait();
        console.log("✅ Treasury verified in IdentityRegistry.");
    }

    console.log("Simulating Carbon Primary Market Flow:");
    console.log(" 1. Minting USDC to Investor...");
    await (await usdc.connect(investor).mint(investor.address, usdcPaid)).wait();

    console.log(" 2. Investor sending USDC to Treasury...");
    await (await usdc.connect(investor).transfer(treasury.address, usdcPaid)).wait();

    console.log(" 3. Issuer transferring Carbon tokens to Treasury...");
    await (await carbonToken.connect(issuer).transfer(treasury.address, tokenAmount)).wait();

    console.log(" 4. Treasury approving Vault to spend VCARBON...");
    await (await carbonToken.connect(treasury).approve(deployment.contracts.carbonVault, tokenAmount)).wait();

    console.log(" 5. Treasury calling depositFromTreasury...");
    // Grant OPERATOR_ROLE to treasury (deployer) on vault
    const OPERATOR_ROLE = await carbonVault.OPERATOR_ROLE();
    const hasRole = await carbonVault.hasRole(OPERATOR_ROLE, treasury.address);
    if (!hasRole) {
        await (await carbonVault.connect(issuer).grantRole(OPERATOR_ROLE, treasury.address)).wait();
    }

    const tx = await carbonVault.connect(treasury).depositFromTreasury(
        tokenAmount,
        investor.address,
        usdcPaid
    );
    await tx.wait();

    const shares = await carbonVault.balanceOf(investor.address);
    console.log("✅ Investor Shares:", hre.ethers.formatEther(shares), "vCARBON");

    // Fetch holdings view
    const carbonMetadataStore = await hre.ethers.getContractAt("CarbonAssetMetadataStore", deployment.contracts.carbonMetadataStore);
    const view = await carbonMetadataStore.getCarbonHoldingView(
        deployment.contracts.carbonToken,
        deployment.contracts.carbonVault,
        investor.address
    );
    console.log("Holdings View from CarbonAssetMetadataStore:");
    console.log("  Vault Shares:", hre.ethers.formatEther(view.vaultShares));
    console.log("  Credit Equivalent (tCO2e):", hre.ethers.formatEther(view.creditEquivalent));
    console.log("  Ownership Basis Points (BPS):", view.pctBps.toString());
    console.log("  Available to Retire (tCO2e):", hre.ethers.formatEther(view.availableToRetire));

    await saveWorkflowResult(19, {
        name: "Carbon Primary Investment",
        txHash: tx.hash,
        contract: deployment.contracts.carbonVault,
        details: `Investor deposited 15,000 USDC for 1,000 vCARBON shares`,
        layer: "L3"
    });
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
