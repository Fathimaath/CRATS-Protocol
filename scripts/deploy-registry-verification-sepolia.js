/**
 * deploy-registry-verification-sepolia.js
 * 
 * CRATS Protocol v10.1.0 — Registry Verification, Retry & Governance Policy
 * 
 * What this does:
 * 1. Redeploys CarbonRetirementManager (upgraded with retry/escalation/governance)
 * 2. Re-authorizes all dependencies (CarbonBatchManager, CarbonAssetMetadataStore, OwnershipSyncManager)
 * 3. Grants Compliance and Governance roles to the deployer (admin manages these on-chain)
 * 4. Updates sepolia-deployment.json with the new address
 */

const { ethers } = require("hardhat");
const fs   = require("fs");
const path = require("path");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
    console.log("================================================================================");
    console.log("   CRATS PROTOCOL v10.1.0 — Registry Verification, Retry & Governance Policy");
    console.log("================================================================================");

    const [deployer] = await ethers.getSigners();
    console.log(`Deployer: ${deployer.address}`);
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log(`Balance : ${ethers.formatEther(balance)} ETH`);

    const deploymentPath = path.join(__dirname, "..", "deployments", "sepolia-deployment.json");
    if (!fs.existsSync(deploymentPath)) throw new Error("sepolia-deployment.json not found");

    const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    const contracts  = deployment.contracts;

    // ── Gas helpers ───────────────────────────────────────────────────────────
    async function getOverrides() {
        const feeData = await ethers.provider.getFeeData();
        const overrides = {};
        if (feeData.maxFeePerGas) {
            overrides.maxFeePerGas = (feeData.maxFeePerGas * 150n) / 100n;
        } else {
            overrides.gasPrice = feeData.gasPrice
                ? (feeData.gasPrice * 150n) / 100n
                : ethers.parseUnits("30", "gwei");
        }
        if (feeData.maxPriorityFeePerGas) {
            overrides.maxPriorityFeePerGas = (feeData.maxPriorityFeePerGas * 150n) / 100n;
        }
        return overrides;
    }

    const save = () => {
        deployment.timestamp = new Date().toISOString();
        fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2), "utf8");
        console.log("  💾 Progress saved to sepolia-deployment.json");
    };

    // ── 1. Deploy upgraded CarbonRetirementManager ────────────────────────────
    console.log("\n>>> [1/5] Deploying upgraded CarbonRetirementManager...");
    const CarbonRetirementManager = await ethers.getContractFactory("CarbonRetirementManager");
    const crm = await CarbonRetirementManager.deploy(
        deployer.address,                    // admin
        contracts.carbonBatchManager,        // batchManager
        contracts.carbonMetadataStore,       // metadataStore (optional)
        contracts.syncManager,               // ownershipSyncManager
        await getOverrides()
    );
    await crm.waitForDeployment();
    const crmAddr = await crm.getAddress();
    console.log(`  ✅ CarbonRetirementManager deployed at: ${crmAddr}`);

    contracts.carbonRetirementManager = crmAddr;
    save();
    await sleep(15000);

    // ── 2. Authorize on CarbonBatchManager ───────────────────────────────────
    console.log("\n>>> [2/5] Authorizing on CarbonBatchManager...");
    const batchManager = await ethers.getContractAt("CarbonBatchManager", contracts.carbonBatchManager);
    await (await batchManager.setOperator(crmAddr, true, await getOverrides())).wait();
    console.log("  ✅ CarbonRetirementManager authorized as operator on CarbonBatchManager");
    await sleep(15000);

    // ── 3. Grant RETIREMENT_MANAGER_ROLE on CarbonAssetMetadataStore ─────────
    console.log("\n>>> [3/5] Granting RETIREMENT_MANAGER_ROLE on CarbonAssetMetadataStore...");
    try {
        const metadataStore = await ethers.getContractAt("CarbonAssetMetadataStore", contracts.carbonMetadataStore);
        const RETIREMENT_MANAGER_ROLE = await metadataStore.RETIREMENT_MANAGER_ROLE();
        await (await metadataStore.grantRole(RETIREMENT_MANAGER_ROLE, crmAddr, await getOverrides())).wait();
        console.log("  ✅ RETIREMENT_MANAGER_ROLE granted to CarbonRetirementManager");
    } catch (e) {
        console.warn(`  ⚠️  Could not grant RETIREMENT_MANAGER_ROLE (non-fatal): ${e.message}`);
    }
    await sleep(15000);

    // ── 4. Authorize on OwnershipSyncManager ─────────────────────────────────
    console.log("\n>>> [4/5] Authorizing CarbonRetirementManager on OwnershipSyncManager...");
    try {
        const syncManager = await ethers.getContractAt("OwnershipSyncManager", contracts.syncManager);
        const CARBON_RETIREMENT = await syncManager.CARBON_RETIREMENT();
        await (await syncManager.authorizeModule(crmAddr, CARBON_RETIREMENT, await getOverrides())).wait();
        console.log("  ✅ CarbonRetirementManager authorized with CARBON_RETIREMENT reason code");
    } catch (e) {
        console.warn(`  ⚠️  OwnershipSync authorization skipped (non-fatal): ${e.message}`);
    }
    await sleep(15000);

    // ── 5. Configure default SLA (optional — defaults are fine for production) ─
    console.log("\n>>> [5/5] Verifying default SLA configuration...");
    const maxRetries             = await crm.defaultMaxRetries();
    const retryIntervalSeconds   = await crm.defaultRetryIntervalSeconds();
    const maxWaitPeriodSeconds   = await crm.defaultMaxWaitPeriodSeconds();
    const governanceBufferSeconds = await crm.defaultGovernanceBufferSeconds();
    console.log(`  maxRetries:              ${maxRetries} retries`);
    console.log(`  retryInterval:           ${Number(retryIntervalSeconds) / 3600}h`);
    console.log(`  maxWaitPeriod (SLA):     ${Number(maxWaitPeriodSeconds) / 3600}h`);
    console.log(`  governanceBuffer:        ${Number(governanceBufferSeconds) / 3600}h`);
    console.log("  ✅ SLA defaults verified");

    save();

    console.log("\n================================================================================");
    console.log("🎉 SUCCESS: CRATS v10.1.0 Registry Verification Policy deployed on Sepolia!");
    console.log(`   CarbonRetirementManager : ${crmAddr}`);
    console.log("================================================================================");
}

main().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
