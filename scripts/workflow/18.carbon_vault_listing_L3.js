const { getDeploymentInfo, saveDeploymentInfo, saveWorkflowResult } = require("./helpers");
const hre = require("hardhat");

async function main() {
    console.log("\n--- Step 18: Carbon Vault Listing & Setup (L3) ---");
    const deployment = await getDeploymentInfo();
    const [deployer, issuer] = await hre.ethers.getSigners();

    if (!deployment.contracts.carbonToken) {
        throw new Error("Carbon Token not deployed. Run Step 17 first.");
    }

    const vaultFactory = await hre.ethers.getContractAt("VaultFactory", deployment.contracts.vaultFactory);
    const navOracle = await hre.ethers.getContractAt("NAVOracle", deployment.contracts.navOracle);
    const feeEngine = await hre.ethers.getContractAt("FeeEngine", deployment.contracts.feeEngine);

    let vaultAddress = deployment.contracts.carbonVault;
    let needsDeployment = !vaultAddress;
    if (vaultAddress) {
        try {
            const vaultCheck = await hre.ethers.getContractAt("SyncVault", vaultAddress);
            const currentAsset = await vaultCheck.asset();
            if (currentAsset.toLowerCase() !== deployment.contracts.carbonToken.toLowerCase()) {
                console.log(" Underlying asset of existing vault does not match the newly deployed carbonToken. Redeploying vault.");
                needsDeployment = true;
                vaultAddress = "";
            }
        } catch (e) {
            needsDeployment = true;
            vaultAddress = "";
        }
    }
    let receiptHash = "";

    if (needsDeployment) {
        // Ensure issuer has VAULT_CREATOR_ROLE
        const vaultCreatorRole = hre.ethers.id("VAULT_CREATOR_ROLE");
        const hasCreatorRole = await vaultFactory.hasRole(vaultCreatorRole, issuer.address);
        if (!hasCreatorRole) {
            console.log("Granting VAULT_CREATOR_ROLE to issuer...");
            await (await vaultFactory.connect(deployer).grantRole(vaultCreatorRole, issuer.address)).wait();
        }

        const CATEGORY_ID = hre.ethers.id("CARBON_CREDIT");
        console.log("Creating SyncVault for VCARBON...");
        const tx = await vaultFactory.connect(issuer).createSyncVault(
            deployment.contracts.carbonToken,
            "Verra Carbon Vault",
            "vCARBON",
            CATEGORY_ID
        );
        const receipt = await tx.wait();
        receiptHash = receipt.hash || tx.hash;

        // Find VaultCreated event
        const event = receipt.logs.find(log => {
            try {
                return vaultFactory.interface.parseLog(log).name === "VaultCreated";
            } catch (e) {
                return false;
            }
        });

        vaultAddress = vaultFactory.interface.parseLog(event).args.vault;
        console.log("✅ SyncVault for Carbon deployed at:", vaultAddress);

        // Save to deployment info
        deployment.contracts.carbonVault = vaultAddress;
        await saveDeploymentInfo(deployment);
    } else {
        console.log(`ℹ️ Carbon Vault already created at: ${vaultAddress}.`);
    }

    const vault = await hre.ethers.getContractAt("SyncVault", vaultAddress);

    // Register SyncVault in NAVOracle
    const vaultId = hre.ethers.zeroPadValue(vaultAddress, 32);
    const assetId = hre.ethers.zeroPadValue(deployment.contracts.carbonToken, 32);
    const registeredVaultAddress = await navOracle.vaultAddress(vaultId);
    if (registeredVaultAddress === hre.ethers.ZeroAddress) {
        console.log("Registering SyncVault in NAVOracle...");
        const weightConfig = {
            appraisalWeight: 0,
            dcfWeight: 0,
            incomeWeight: 0,
            compWeight: 100,
            appraisalMaxAge: 365 * 24 * 60 * 60,
            dcfMaxAge: 365 * 24 * 60 * 60,
            incomeMaxAge: 365 * 24 * 60 * 60,
            compMaxAge: 30 * 24 * 60 * 60
        };
        await (await navOracle.connect(deployer).registerVault(vaultId, vaultAddress, assetId, weightConfig)).wait();
        console.log("✅ SyncVault registered in NAVOracle.");
    }

    // Configure FeeEngine for vault
    console.log("Configuring FeeEngine for Carbon Vault...");
    const feeConfig = {
        mgmtFeeBPS: 200, // 2% management fee
        lastAccrualTs: Math.floor(Date.now() / 1000),
        perfFeeBPS: 2000, // 20% performance fee
        entryFeeBPS: 100, // 1% entry fee
        exitFeeBPS: 100, // 1% exit fee
        tradingFeeBPS: 0,
        hurdleRateBPS: 0,
        useHWM: false
    };
    const feeAllocation = {
        protocolTreasury: deployment.deployer || deployer.address,
        issuerWallet: issuer.address,
        complianceFund: deployer.address,
        insuranceReserve: deployer.address,
        protocolBPS: 5000, // 50%
        issuerBPS: 5000,   // 50%
        complianceBPS: 0,
        insuranceBPS: 0
    };
    
    // Check if registered
    let isFeeRegistered = false;
    try {
        const config = await feeEngine.feeConfigs(vaultAddress);
        isFeeRegistered = config.mgmtFeeBPS > 0;
    } catch (e) {}

    if (!isFeeRegistered) {
        await (await feeEngine.connect(deployer).registerVault(vaultAddress, feeConfig, feeAllocation)).wait();
        console.log("✅ Carbon Vault registered in FeeEngine.");
    }

    // Set NAVOracle on Vault
    const currentNavOracleOnVault = await vault.navOracle();
    if (currentNavOracleOnVault !== deployment.contracts.navOracle) {
        console.log("Setting NAVOracle on SyncVault...");
        await (await vault.connect(issuer).setNavOracle(deployment.contracts.navOracle)).wait();
        await (await vault.connect(issuer).setAssetId(assetId)).wait();
        console.log("✅ NAVOracle set on SyncVault.");
    }

    // Set Treasury on Vault
    console.log("Setting Treasury on SyncVault...");
    await (await vault.connect(issuer).setTreasury(deployer.address)).wait(); // Set deployer as treasury for mock purposes

    // Verify in IdentityRegistry for compliance
    const identityRegistry = await hre.ethers.getContractAt("IdentityRegistry", deployment.contracts.identityRegistry);
    const identitySBT = await hre.ethers.getContractAt("IdentitySBT", deployment.contracts.identitySBT);
    const existingVaultTokenId = await identitySBT.tokenIdOf(vaultAddress);
    if (existingVaultTokenId === 0n || existingVaultTokenId === 0) {
        console.log("Registering Carbon Vault in IdentityRegistry for compliance...");
        const roleInstitutional = 3;
        const jurisdiction = 826;
        const did = `did:crats:carbon-vault-${vaultAddress.toLowerCase()}`;
        const didHash = hre.ethers.id(did);
        const expiresAt = Math.floor(Date.now() / 1000) + (10 * 365 * 24 * 60 * 60);

        await (await identityRegistry.connect(deployer).registerIdentity(
            vaultAddress,
            roleInstitutional,
            jurisdiction,
            didHash,
            did,
            expiresAt
        )).wait();

        const vaultTokenId = await identitySBT.tokenIdOf(vaultAddress);
        await (await identitySBT.connect(deployer).updateStatus(vaultTokenId, 2)).wait();
        console.log("✅ Carbon Vault verified in IdentityRegistry.");
    }

    await saveWorkflowResult(18, {
        name: "Carbon Vault Setup",
        txHash: receiptHash || hre.ethers.ZeroHash,
        contract: vaultAddress,
        details: `SyncVault (vCARBON) setup completed`,
        layer: "L3"
    });
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
