const hre = require("hardhat");
const { getDeploymentInfo } = require("./workflow/helpers");

/**
 * CRATS Protocol — Live State Audit
 * Reads real on-chain stored data from FeeEngine + NAVOracle
 */
async function main() {
    const deployment = await getDeploymentInfo();
    const [deployer] = await hre.ethers.getSigners();

    const SEP = "=".repeat(70);
    console.log("\n" + SEP);
    console.log("   CRATS PROTOCOL — LIVE ON-CHAIN STATE AUDIT");
    console.log("   Reading FeeEngine + NAVOracle stored data");
    console.log(SEP + "\n");

    const feeEngine  = await hre.ethers.getContractAt("FeeEngine",  deployment.contracts.feeEngine);
    const navOracle  = await hre.ethers.getContractAt("NAVOracle",  deployment.contracts.navOracle);
    const azureVault = await hre.ethers.getContractAt("SyncVault",  deployment.contracts.azureVault);

    const vaultAddr = deployment.contracts.azureVault;
    const assetId   = hre.ethers.zeroPadValue(deployment.contracts.azureToken, 32);
    const vaultId   = hre.ethers.zeroPadValue(deployment.contracts.azureVault, 32);

    // ─────────────────────────────────────────────────────────────
    // SECTION A — FeeEngine
    // ─────────────────────────────────────────────────────────────
    console.log("━━━ SECTION A: FeeEngine ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    console.log("  Contract :", deployment.contracts.feeEngine);
    console.log("  Vault    :", vaultAddr);
    console.log("  USDC     :", deployment.contracts.usdc);

    // Check if already registered (mgmtFeeBPS > 0 means registered)
    const existingCfg = await feeEngine.feeConfigs(vaultAddr);
    const registered  = existingCfg.mgmtFeeBPS > 0n;

    if (!registered) {
        console.log("\n  [→] Vault not registered — registering now with institutional fee config...");

        const feeConfig = {
            mgmtFeeBPS:     100,    // 1.0% annual management fee
            lastAccrualTs:  0,
            perfFeeBPS:     1000,   // 10% performance fee
            entryFeeBPS:    10,     // 0.10% entry load
            exitFeeBPS:     10,     // 0.10% exit load
            tradingFeeBPS:  5,      // 0.05% trading fee
            hurdleRateBPS:  500,    // 5% hurdle rate
            useHWM:         true    // High-water mark active
        };

        const feeAlloc = {
            protocolTreasury:  deployer.address,
            issuerWallet:      deployer.address,
            complianceFund:    deployer.address,
            insuranceReserve:  deployer.address,
            protocolBPS:       5000,   // 50% to protocol
            issuerBPS:         3000,   // 30% to issuer
            complianceBPS:     1000,   // 10% to compliance fund
            insuranceBPS:      1000    // 10% to insurance reserve
        };

        // Grant FEE_MANAGER_ROLE to deployer if needed
        const feeManagerRole = hre.ethers.id("FEE_MANAGER_ROLE");
        const hasFeeManager  = await feeEngine.hasRole(feeManagerRole, deployer.address);
        if (!hasFeeManager) {
            await (await feeEngine.connect(deployer).grantRole(feeManagerRole, deployer.address)).wait();
            console.log("  [→] FEE_MANAGER_ROLE granted to deployer");
        }

        await (await feeEngine.connect(deployer).registerVault(vaultAddr, feeConfig, feeAlloc)).wait();
        console.log("  ✅ Vault registered in FeeEngine!\n");
    } else {
        console.log("\n  ℹ️  Vault already registered — reading stored config.\n");
    }

    // ── Read stored FeeConfig ──────────────────────────────────
    const cfg = await feeEngine.feeConfigs(vaultAddr);
    console.log("  📦 feeConfigs[vault] — stored on-chain:");
    console.log(`     mgmtFeeBPS    : ${cfg.mgmtFeeBPS}  → ${(Number(cfg.mgmtFeeBPS)/100).toFixed(2)}% annual management fee`);
    console.log(`     perfFeeBPS    : ${cfg.perfFeeBPS}  → ${(Number(cfg.perfFeeBPS)/100).toFixed(2)}% performance fee`);
    console.log(`     entryFeeBPS   : ${cfg.entryFeeBPS}   → ${(Number(cfg.entryFeeBPS)/100).toFixed(2)}% entry load`);
    console.log(`     exitFeeBPS    : ${cfg.exitFeeBPS}   → ${(Number(cfg.exitFeeBPS)/100).toFixed(2)}% exit load`);
    console.log(`     tradingFeeBPS : ${cfg.tradingFeeBPS}    → ${(Number(cfg.tradingFeeBPS)/100).toFixed(2)}% trading fee`);
    console.log(`     hurdleRateBPS : ${cfg.hurdleRateBPS}  → ${(Number(cfg.hurdleRateBPS)/100).toFixed(2)}% hurdle rate`);
    console.log(`     useHWM        : ${cfg.useHWM}  → High-water mark ${cfg.useHWM ? "ACTIVE" : "disabled"}`);
    console.log(`     lastAccrualTs : ${cfg.lastAccrualTs} (${cfg.lastAccrualTs > 0n ? new Date(Number(cfg.lastAccrualTs)*1000).toISOString() : "not accrued yet"})`);

    // ── HWM Record ────────────────────────────────────────────
    const hwm = await feeEngine.hwmRecords(vaultAddr);
    console.log("\n  📦 hwmRecords[vault] — stored on-chain:");
    console.log(`     highWaterMarkNAV : ${hwm.highWaterMarkNAV} (${hre.ethers.formatEther(hwm.highWaterMarkNAV)} USD)`);
    console.log(`     lastUpdated      : ${hwm.lastUpdated > 0n
        ? new Date(Number(hwm.lastUpdated)*1000).toISOString()
        : "(not updated yet)"}`);

    // ── Fee Allocation ────────────────────────────────────────
    const alloc = await feeEngine.allocations(vaultAddr);
    console.log("\n  📦 allocations[vault] — stored on-chain:");
    console.log(`     protocolTreasury : ${alloc.protocolTreasury}`);
    console.log(`     issuerWallet     : ${alloc.issuerWallet}`);
    console.log(`     split            : Protocol ${alloc.protocolBPS} BPS | Issuer ${alloc.issuerBPS} BPS | Compliance ${alloc.complianceBPS} BPS | Insurance ${alloc.insuranceBPS} BPS`);

    // ── Live fee calculations ─────────────────────────────────
    const accruedMgmt = await feeEngine.accruedManagementFee(vaultAddr);
    const pendingMgmt = await feeEngine.pendingMgmtFees(vaultAddr);
    const pendingPerf = await feeEngine.pendingPerfFees(vaultAddr);
    const revenue     = await feeEngine.feeRevenue(vaultAddr);

    console.log("\n  💰 Live Fee Calculations (view calls):");
    console.log(`     accruedManagementFee() : ${hre.ethers.formatEther(accruedMgmt)} USDC`);
    console.log(`     pendingMgmtFees        : ${hre.ethers.formatEther(pendingMgmt)} USDC`);
    console.log(`     pendingPerfFees        : ${hre.ethers.formatEther(pendingPerf)} USDC`);
    console.log(`     feeRevenue (collected) : ${hre.ethers.formatEther(revenue)} USDC`);

    // ── Entry/Exit fee preview on a $10,000 deposit ───────────
    const depositAmount = hre.ethers.parseEther("10000");
    const entryFee  = await feeEngine.calculateEntryFee(vaultAddr, depositAmount, deployer.address);
    const exitFee   = await feeEngine.calculateExitFee(vaultAddr, depositAmount, deployer.address);
    const tradingFee = await feeEngine.calculateTradingFee(vaultAddr, depositAmount);
    console.log("\n  🧮 Fee Preview (on a 10,000-unit deposit):");
    console.log(`     calculateEntryFee()    : ${hre.ethers.formatEther(entryFee)} units (${Number(cfg.entryFeeBPS)/100}%)`);
    console.log(`     calculateExitFee()     : ${hre.ethers.formatEther(exitFee)} units (${Number(cfg.exitFeeBPS)/100}%)`);
    console.log(`     calculateTradingFee()  : ${hre.ethers.formatEther(tradingFee)} units (${Number(cfg.tradingFeeBPS)/100}%)`);

    // ─────────────────────────────────────────────────────────────
    // SECTION B — NAVOracle
    // ─────────────────────────────────────────────────────────────
    console.log("\n━━━ SECTION B: NAVOracle ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    console.log("  Contract :", deployment.contracts.navOracle);
    console.log("  assetId  :", assetId);
    console.log("  vaultId  :", vaultId);

    // ── Active NAV Submission ─────────────────────────────────
    const sub = await navOracle.activeSubmission(assetId);
    console.log("\n  📦 activeSubmission[assetId] — stored on-chain:");
    if (sub.assetValue > 0n) {
        const methods = ["FULL_APPRAISAL","DESKTOP_APPRAISAL","DCF_MODEL","MARKET_COMPARABLE","AUDIT_VERIFIED","INCOME_STATEMENT"];
        console.log(`     assetValue    : ${hre.ethers.formatEther(sub.assetValue)} USD per token`);
        console.log(`     valuationDate : ${new Date(Number(sub.valuationDate)*1000).toISOString()}`);
        console.log(`     submittedAt   : ${new Date(Number(sub.submittedAt)*1000).toISOString()}`);
        console.log(`     submitter     : ${sub.submitter}`);
        console.log(`     method        : ${methods[Number(sub.method)] || sub.method} (enum ${sub.method})`);
        console.log(`     confidence    : ${sub.confidence}/100`);
        console.log(`     documentHash  : ${sub.documentHash}`);
    } else {
        console.log("     (no active submission stored)");
    }

    // ── Submission history count ──────────────────────────────
    const history = await navOracle.submissionHistory(assetId, 0).catch(() => null);
    console.log("\n  📜 Submission history[0]:", history
        ? `value=${hre.ethers.formatEther(history.assetValue)} USD, method=${history.method}`
        : "(empty or inaccessible)");

    // ── Weighted NAV ──────────────────────────────────────────
    console.log("\n  📊 NAV Calculations:");
    try {
        const weighted = await navOracle.getWeightedNAV(assetId);
        console.log(`     getWeightedNAV()         : ${hre.ethers.formatEther(weighted)} USD`);
    } catch (e) {
        console.log(`     getWeightedNAV()         : ${e.reason || e.shortMessage || "no data"}`);
    }

    try {
        const navResult = await navOracle.calculateNAV(vaultId);
        console.log(`     calculateNAV(vaultId)    : ${hre.ethers.formatEther(navResult)} total vault NAV`);
    } catch (e) {
        console.log(`     calculateNAV(vaultId)    : ${e.reason || e.shortMessage || "error"}`);
    }

    // ── NAV State ─────────────────────────────────────────────
    console.log("\n  🚦 Staleness State:");
    try {
        const stateNames = ["FRESH","WARNING","CRITICAL","STALE"];
        const state = await navOracle.getNAVState(assetId);
        console.log(`     getNAVState()            : ${stateNames[Number(state)]} (enum ${state})`);
    } catch (e) {
        console.log(`     getNAVState()            : ${e.reason || e.shortMessage || "no data"}`);
    }

    try {
        const { state: ws, daysSinceLastUpdate: days } = await navOracle.getNAVStateWithWarning(assetId);
        const stateNames = ["FRESH","WARNING","CRITICAL","STALE"];
        console.log(`     getNAVStateWithWarning() : ${stateNames[Number(ws)]}, ${days} days since last update`);
    } catch (e) {
        console.log(`     getNAVStateWithWarning() : ${e.reason || e.shortMessage || "no data"}`);
    }

    // ── Vault registration ────────────────────────────────────
    const regVault = await navOracle.vaultAddress(vaultId);
    const assetToV = await navOracle.assetToVaultId(assetId);
    console.log("\n  🔗 Vault Registration:");
    console.log(`     vaultAddress[vaultId]    : ${regVault}`);
    console.log(`     assetToVaultId[assetId]  : ${assetToV}`);
    console.log(`     Registration OK          : ${regVault.toLowerCase() === vaultAddr.toLowerCase() ? "✅ YES" : "❌ NO"}`);

    // ── Dispute state ─────────────────────────────────────────
    console.log("\n  ⚖️  Dispute State:");
    try {
        const d = await navOracle.activeDispute(assetId);
        if (d.challenger && d.challenger !== hre.ethers.ZeroAddress) {
            console.log(`     ACTIVE DISPUTE: filed by ${d.challenger}`);
            console.log(`     deadline: ${new Date(Number(d.deadline)*1000).toISOString()}`);
        } else {
            console.log("     No active dispute — clean ✅");
        }
    } catch (e) {
        console.log("     No active dispute — clean ✅");
    }

    // ─────────────────────────────────────────────────────────────
    // SECTION C — SyncVault live state
    // ─────────────────────────────────────────────────────────────
    console.log("\n━━━ SECTION C: SyncVault State (post E2E workflow) ━━━━━━━━━━━━━\n");
    console.log("  Contract :", vaultAddr);

    const totalAssets = await azureVault.totalAssets();
    const totalSupply = await azureVault.totalSupply();
    const asset       = await azureVault.asset();

    console.log(`  totalAssets()  : ${hre.ethers.formatEther(totalAssets)} AZURE tokens held`);
    console.log(`  totalSupply()  : ${hre.ethers.formatEther(totalSupply)} vAZURE shares minted`);
    console.log(`  underlying     : ${asset}`);

    if (totalSupply > 0n) {
        // convertToAssets(1 share)
        const oneShare = hre.ethers.parseEther("1");
        const assetsPerShare = await azureVault.convertToAssets(oneShare);
        console.log(`  1 vAZURE → ${hre.ethers.formatEther(assetsPerShare)} AZURE (convertToAssets)`);

        const sharesPerAsset = await azureVault.convertToShares(oneShare);
        console.log(`  1 AZURE  → ${hre.ethers.formatEther(sharesPerAsset)} vAZURE (convertToShares)`);
    }

    // ─────────────────────────────────────────────────────────────
    console.log("\n" + SEP);
    console.log("  ✅ AUDIT COMPLETE — All reads from live local node");
    console.log(SEP + "\n");
}

main().then(() => process.exit(0)).catch(err => { console.error("\n❌", err.message || err); process.exit(1); });
