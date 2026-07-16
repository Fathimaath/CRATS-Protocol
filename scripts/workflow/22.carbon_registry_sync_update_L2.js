const { getDeploymentInfo, saveWorkflowResult } = require("./helpers");
const hre = require("hardhat");

async function main() {
    console.log("\n--- Step 22: Carbon Registry Sync & NAV Update (L2) ---");
    const deployment = await getDeploymentInfo();
    const [deployer, issuer, investor] = await hre.ethers.getSigners();

    if (!deployment.contracts.carbonToken) {
        throw new Error("Carbon Token not deployed. Run Step 17 first.");
    }

    const carbonVault = await hre.ethers.getContractAt("SyncVault", deployment.contracts.carbonVault);
    const carbonMetadataStore = await hre.ethers.getContractAt("CarbonAssetMetadataStore", deployment.contracts.carbonMetadataStore);
    const navOracle = await hre.ethers.getContractAt("NAVOracle", deployment.contracts.navOracle);

    // 1. Update Annual Monitoring Report
    console.log("1. Updating Annual Monitoring Report hash...");
    const newReportHash = hre.ethers.id("MONITORING_REPORT_2026_HASH");
    await (await carbonMetadataStore.connect(deployer).updateMonitoringReport(
        deployment.contracts.carbonToken,
        newReportHash,
        Math.floor(Date.now() / 1000)
    )).wait();
    console.log("  ✅ Monitoring report updated in CarbonAssetMetadataStore.");

    // 2. Submit new NAV value: $16.50 (+10% appreciation)
    console.log("2. Submitting appreciated NAV to NAVOracle ($16.50)...");
    const assetId = hre.ethers.zeroPadValue(deployment.contracts.carbonToken, 32);
    const newNav = hre.ethers.parseEther("16.5"); // $16.50
    const porHash = hre.ethers.id("IMMOBILIZATION_PROOF_HASH_UPDATED");

    const tx = await navOracle.connect(deployer).submitNAV(
        assetId,
        newNav,
        Math.floor(Date.now() / 1000),
        porHash,
        3 // ValuationMethod.MARKET_COMPARABLE
    );
    await tx.wait();
    console.log("  ✅ Appreciated NAV submitted to NAVOracle.");

    // 3. Verify totalAssets() and vault share price update
    console.log("3. Verifying updated share pricing on SyncVault...");
    const totalAssetsVal = await carbonVault.totalAssets();
    const totalSupplyVal = await carbonVault.totalSupply();
    const vaultSharePrice = totalSupplyVal > 0n ? (totalAssetsVal * 10n ** 18n) / totalSupplyVal : 10n ** 18n;

    console.log(`  Vault Total Assets (denominated in USDC): ${hre.ethers.formatEther(totalAssetsVal)} USDC`);
    console.log(`  Vault Total Share Supply: ${hre.ethers.formatEther(totalSupplyVal)} vCARBON`);
    console.log(`  vCARBON Share Price: $${hre.ethers.formatEther(vaultSharePrice)}`);

    await saveWorkflowResult(22, {
        name: "Carbon Registry Sync & NAV Update",
        txHash: tx.hash,
        contract: deployment.contracts.navOracle,
        details: `NAV updated to $16.50; Vault Share Price: $${hre.ethers.formatEther(vaultSharePrice)}`,
        layer: "L2"
    });
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
