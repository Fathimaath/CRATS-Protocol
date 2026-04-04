const hre = require("hardhat");

/**
 * CRATS Protocol - End-to-End Workflow Verification
 * 
 * This script runs all 14 workflow steps in order to verify the 
 * complete asset lifecycle from onboarding to secondary market settlement.
 */

async function main() {
  console.log("\n" + "=".repeat(80));
  console.log("   CRATS PROTOCOL - END-TO-END WORKFLOW VERIFICATION");
  console.log("=".repeat(80) + "\n");

  const steps = [
    "scripts/workflow/1.issuer_onboarding_identity_registry_L1.js",
    "scripts/workflow/2.kyc_verification_L1.js",
    "scripts/workflow/3.sbt_minting_L1.js",
    "scripts/workflow/4.asset_tokenization_L2.js",
    "scripts/workflow/5.asset_document_registry_L2.js",
    "scripts/workflow/6.oracle_nav_configuration_L2.js",
    "scripts/workflow/7.minting_to_treasury_L2.js",
    "scripts/workflow/8.listing_creating_vault_contract_L3.js",
    "scripts/workflow/9.investor_onboarding_L1.js",
    "scripts/workflow/10.investor_sbt_minting_L1.js",
    "scripts/workflow/11.investment_primary_market_L3.js",
    "scripts/workflow/12.yield_distribution_L3.js",
    "scripts/workflow/13.secondary_market_order_L4.js",
    "scripts/workflow/14.clearing_settlement_L4.js"
  ];

  const startTime = Date.now();

  for (let i = 0; i < steps.length; i++) {
    const stepFile = steps[i];
    console.log(`\n▶️  [STEP ${i + 1}/14] Executing: ${stepFile.split('/').pop()}`);
    
    try {
      await hre.run("run", { script: stepFile, network: hre.network.name });
      console.log(`✅ [STEP ${i + 1}/14] Success`);
    } catch (error) {
      console.error(`\n❌ [STEP ${i + 1}/14] FAILED: ${stepFile}`);
      console.error(error);
      process.exit(1);
    }
  }

  const duration = (Date.now() - startTime) / 1000;
  console.log("\n" + "=".repeat(80));
  console.log(`🎉 FULL WORKFLOW VERIFIED SUCCESSFULLY IN ${duration.toFixed(2)}s`);
  console.log("=".repeat(80) + "\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
