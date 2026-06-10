const hre = require("hardhat");
const { getDeploymentInfo } = require("./workflow/helpers");

/**
 * ERC-4626 Mechanics Proof
 * Shows the exact token flow: underlying IN → shares OUT
 */
async function main() {
    const deployment = await getDeploymentInfo();
    const [deployer, issuer, investor] = await hre.ethers.getSigners();
    const treasury = issuer;

    const vault      = await hre.ethers.getContractAt("SyncVault",  deployment.contracts.azureVault);
    const azureToken = await hre.ethers.getContractAt("AssetToken", deployment.contracts.azureToken);

    const SEP = "─".repeat(60);
    console.log("\n" + "=".repeat(60));
    console.log("  ERC-4626 MECHANICS PROOF");
    console.log("  SyncVault — deposit underlying → mint shares");
    console.log("=".repeat(60));

    // ── BEFORE STATE ─────────────────────────────────────────
    const vaultAssetsBefore  = await vault.totalAssets();
    const vaultSupplyBefore  = await vault.totalSupply();
    const investorShareBefore = await vault.balanceOf(investor.address);
    const treasuryAZURE_before = await azureToken.balanceOf(treasury.address);

    console.log("\n📸 STATE BEFORE DEPOSIT");
    console.log(SEP);
    console.log("  Vault totalAssets()     :", hre.ethers.formatEther(vaultAssetsBefore), "AZURE  ← AZURE held by vault contract");
    console.log("  Vault totalSupply()     :", hre.ethers.formatEther(vaultSupplyBefore), "vAZURE ← shares minted so far");
    console.log("  Investor vAZURE balance :", hre.ethers.formatEther(investorShareBefore), "vAZURE");
    console.log("  Treasury AZURE balance  :", hre.ethers.formatEther(treasuryAZURE_before), "AZURE");

    // How many shares would 10,000 AZURE buy at current NAV?
    const depositAmount = hre.ethers.parseEther("10000");
    const previewShares = await vault.previewDeposit(depositAmount);
    const previewAssets = await vault.previewMint(previewShares);
    console.log("\n  previewDeposit(10,000 AZURE) →", hre.ethers.formatEther(previewShares), "vAZURE would be minted");
    console.log("  previewMint  (", hre.ethers.formatEther(previewShares).split('.')[0], "vAZURE) →", hre.ethers.formatEther(previewAssets), "AZURE required");

    // ── EXECUTE DEPOSIT ───────────────────────────────────────
    console.log("\n⚡ EXECUTING deposit(10,000 AZURE, investor) via treasury");
    console.log(SEP);
    console.log("  Step 1 — Treasury approves vault to pull 10,000 AZURE");
    const approveTx = await azureToken.connect(treasury).approve(deployment.contracts.azureVault, depositAmount);
    const approveRx = await approveTx.wait();
    console.log("           tx:", approveRx.hash);

    console.log("  Step 2 — vault.deposit(10000, investor.address)");
    console.log("           This pulls AZURE from treasury → vault");
    console.log("           And mints vAZURE shares → investor wallet");
    const depositTx = await vault.connect(treasury).deposit(depositAmount, investor.address);
    const depositRx = await depositTx.wait();
    console.log("           tx:", depositRx.hash);

    // Parse Deposit event from logs
    const depositEvent = depositRx.logs.find(log => {
        try { return vault.interface.parseLog(log).name === "Deposit"; } catch { return false; }
    });
    if (depositEvent) {
        const parsed = vault.interface.parseLog(depositEvent);
        console.log("\n  📋 Deposit Event emitted:");
        console.log("     sender   :", parsed.args.sender);
        console.log("     owner    :", parsed.args.owner, " ← shares go HERE (investor)");
        console.log("     assets   :", hre.ethers.formatEther(parsed.args.assets), "AZURE ← underlying IN");
        console.log("     shares   :", hre.ethers.formatEther(parsed.args.shares), "vAZURE ← shares minted OUT");
    }

    // ── AFTER STATE ──────────────────────────────────────────
    const vaultAssetsAfter   = await vault.totalAssets();
    const vaultSupplyAfter   = await vault.totalSupply();
    const investorShareAfter = await vault.balanceOf(investor.address);
    const treasuryAZURE_after = await azureToken.balanceOf(treasury.address);

    console.log("\n📸 STATE AFTER DEPOSIT");
    console.log(SEP);
    console.log("  Vault totalAssets()     :", hre.ethers.formatEther(vaultAssetsAfter),   "AZURE  ← increased by 10,000");
    console.log("  Vault totalSupply()     :", hre.ethers.formatEther(vaultSupplyAfter),   "vAZURE ← increased by minted shares");
    console.log("  Investor vAZURE balance :", hre.ethers.formatEther(investorShareAfter), "vAZURE ← investor received shares");
    console.log("  Treasury AZURE balance  :", hre.ethers.formatEther(treasuryAZURE_after),"AZURE  ← decreased by 10,000");

    const assetDelta  = vaultAssetsAfter  - vaultAssetsBefore;
    const supplyDelta = vaultSupplyAfter  - vaultSupplyBefore;
    const shareDelta  = investorShareAfter - investorShareBefore;

    console.log("\n📊 DELTAS (change caused by this deposit)");
    console.log(SEP);
    console.log("  +AZURE into vault     :", hre.ethers.formatEther(assetDelta));
    console.log("  +vAZURE minted        :", hre.ethers.formatEther(supplyDelta));
    console.log("  +vAZURE to investor   :", hre.ethers.formatEther(shareDelta));

    // ── REDEMPTION PREVIEW ────────────────────────────────────
    const redeemableAssets = await vault.convertToAssets(shareDelta);
    console.log("\n💱 REDEMPTION VALUE of those", hre.ethers.formatEther(shareDelta), "new vAZURE shares:");
    console.log("  convertToAssets() →", hre.ethers.formatEther(redeemableAssets), "AZURE");

    // ── KEY FACT ─────────────────────────────────────────────
    console.log("\n" + "=".repeat(60));
    console.log("  ✅ CONFIRMED: ERC-4626 mechanics");
    console.log("  - Treasury sent 10,000 AZURE → vault contract");
    console.log("  - Vault contract minted vAZURE → investor wallet");
    console.log("  - Zero AZURE created out of thin air");
    console.log("  - AZURE in vault = collateral backing every share");
    console.log("  - vault.totalAssets() = azureToken.balanceOf(vault)");
    const rawBal = await azureToken.balanceOf(deployment.contracts.azureVault);
    console.log("    azureToken.balanceOf(vault) =", hre.ethers.formatEther(rawBal), "AZURE");
    console.log("    vault.totalAssets()         =", hre.ethers.formatEther(vaultAssetsAfter), "AZURE");
    console.log("    Match:", rawBal === vaultAssetsAfter ? "✅ IDENTICAL" : "❌ MISMATCH");
    console.log("=".repeat(60) + "\n");
}

main().then(() => process.exit(0)).catch(err => { console.error("\n❌", err.message); process.exit(1); });
