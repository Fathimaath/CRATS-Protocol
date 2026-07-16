const hre = require("hardhat");

async function main() {
    console.log("\n" + "=".repeat(80));
    console.log("   CRATS PROTOCOL - CARBON CREDIT LIFECYCLE WORKFLOW");
    console.log("=".repeat(80) + "\n");

    const steps = [
        "scripts/workflow/17.carbon_asset_tokenization_L2.js",
        "scripts/workflow/18.carbon_vault_listing_L3.js",
        "scripts/workflow/19.carbon_investment_primary_L3.js",
        "scripts/workflow/20.carbon_p2p_secondary_L4.js",
        "scripts/workflow/21.carbon_retirement_L3.js",
        "scripts/workflow/22.carbon_registry_sync_update_L2.js"
    ];

    const startTime = Date.now();

    for (let i = 0; i < steps.length; i++) {
        const stepFile = steps[i];
        console.log(`\n▶️  [STEP ${i + 1}/${steps.length}] Executing: ${stepFile.split('/').pop()}`);
        
        try {
            await hre.run("run", { script: stepFile, network: hre.network.name });
            console.log(`✅ [STEP ${i + 1}/${steps.length}] Success`);
        } catch (error) {
            console.error(`\n❌ [STEP ${i + 1}/${steps.length}] FAILED: ${stepFile}`);
            console.error(error);
            process.exit(1);
        }
    }

    const duration = (Date.now() - startTime) / 1000;
    console.log("\n" + "=".repeat(80));
    console.log(`🎉 CARBON LIFECYCLE WORKFLOW VERIFIED SUCCESSFULLY IN ${duration.toFixed(2)}s`);
    console.log("=".repeat(80) + "\n");
}

main().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
