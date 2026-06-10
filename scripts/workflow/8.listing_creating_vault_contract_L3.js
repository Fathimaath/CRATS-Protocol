const { getDeploymentInfo, saveDeploymentInfo, saveWorkflowResult } = require("./helpers");
const hre = require("hardhat");

/**
 * Step 8: Listing / Creating Vault Contract (L3)
 * Deploys a SyncVault for the "Azure Manor" asset.
 */
async function main() {
    console.log("\n--- Step 8: Listing / Creating Vault Contract (L3) ---");
    const deployment = await getDeploymentInfo();
    const [deployer, issuer] = await hre.ethers.getSigners();

    if (!deployment.contracts.azureToken) {
        throw new Error("Azure Token not deployed. Run Step 4 first.");
    }

    const vaultFactory = await hre.ethers.getContractAt("VaultFactory", deployment.contracts.vaultFactory);
    
    let vaultAddress = deployment.contracts.azureVault;
    let receiptHash = "";

    if (!vaultAddress) {
        // Ensure issuer has VAULT_CREATOR_ROLE
        const vaultCreatorRole = hre.ethers.id("VAULT_CREATOR_ROLE");
        const hasCreatorRole = await vaultFactory.hasRole(vaultCreatorRole, issuer.address);
        if (!hasCreatorRole) {
            console.log("Granting VAULT_CREATOR_ROLE to issuer...");
            await (await vaultFactory.connect(deployer).grantRole(vaultCreatorRole, issuer.address)).wait();
            console.log("✅ VAULT_CREATOR_ROLE granted to issuer.");
        }

        // Ensure vaultFactory has VAULT_FACTORY_ROLE on assetFactory
        const assetFactory = await hre.ethers.getContractAt("AssetFactory", deployment.contracts.assetFactory);
        const vaultFactoryRole = hre.ethers.id("VAULT_FACTORY_ROLE");
        const isVaultFactoryAuthorized = await assetFactory.hasRole(vaultFactoryRole, deployment.contracts.vaultFactory);
        if (!isVaultFactoryAuthorized) {
            console.log("Granting VAULT_FACTORY_ROLE to vaultFactory on assetFactory...");
            await (await assetFactory.connect(deployer).grantRole(vaultFactoryRole, deployment.contracts.vaultFactory)).wait();
            console.log("✅ VAULT_FACTORY_ROLE granted to vaultFactory.");
        }

        // Ensure assetFactory has OPERATOR_ROLE on assetRegistry
        const assetRegistry = await hre.ethers.getContractAt("AssetRegistry", deployment.contracts.assetRegistry);
        const operatorRole = hre.ethers.id("OPERATOR_ROLE");
        const isAssetFactoryOperator = await assetRegistry.hasRole(operatorRole, deployment.contracts.assetFactory);
        if (!isAssetFactoryOperator) {
            console.log("Granting OPERATOR_ROLE to assetFactory on assetRegistry...");
            await (await assetRegistry.connect(deployer).grantRole(operatorRole, deployment.contracts.assetFactory)).wait();
            console.log("✅ OPERATOR_ROLE granted to assetFactory.");
        }

        const categoryId = hre.ethers.id("REAL_ESTATE");
        
        console.log("Creating SyncVault for AZURE...");
        const tx = await vaultFactory.connect(issuer).createSyncVault(
            deployment.contracts.azureToken,
            "Azure Manor Vault",
            "vAZURE",
            categoryId
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
        console.log("✅ SyncVault deployed at:", vaultAddress);
        
        // Save to deployment info
        deployment.contracts.azureVault = vaultAddress;
        await saveDeploymentInfo(deployment);
    } else {
        console.log(`ℹ️ Vault already created at: ${vaultAddress}. Verifying registry states...`);
    }

    const navOracle = await hre.ethers.getContractAt("NAVOracle", deployment.contracts.navOracle);
    const vaultId = hre.ethers.zeroPadValue(vaultAddress, 32);
    const assetId = hre.ethers.zeroPadValue(deployment.contracts.azureToken, 32);

    // Register SyncVault in NAVOracle if not registered
    const registeredVaultAddress = await navOracle.vaultAddress(vaultId);
    if (registeredVaultAddress === hre.ethers.ZeroAddress) {
        console.log("Registering SyncVault in NAVOracle...");
        const weightConfig = {
            appraisalWeight: 100,
            dcfWeight: 0,
            incomeWeight: 0,
            compWeight: 0,
            appraisalMaxAge: 365 * 24 * 60 * 60,
            dcfMaxAge: 365 * 24 * 60 * 60,
            incomeMaxAge: 365 * 24 * 60 * 60,
            compMaxAge: 365 * 24 * 60 * 60
        };
        await (await navOracle.connect(deployer).registerVault(vaultId, vaultAddress, assetId, weightConfig)).wait();
        console.log("✅ SyncVault registered in NAVOracle.");
    } else {
        console.log("ℹ️ SyncVault already registered in NAVOracle.");
    }

    // Ensure vault is registered and verified in IdentityRegistry so that L2 transfers to it can pass compliance check
    const identityRegistry = await hre.ethers.getContractAt("IdentityRegistry", deployment.contracts.identityRegistry);
    const identitySBT = await hre.ethers.getContractAt("IdentitySBT", deployment.contracts.identitySBT);
    
    const existingVaultTokenId = await identitySBT.tokenIdOf(vaultAddress);
    if (existingVaultTokenId === 0n || existingVaultTokenId === 0) {
        console.log("Registering SyncVault in IdentityRegistry for compliance...");
        const roleInstitutional = 3;
        const jurisdiction = 826;
        const did = `did:crats:vault-${vaultAddress.toLowerCase()}`;
        const didHash = hre.ethers.id(did);
        const expiresAt = Math.floor(Date.now() / 1000) + (10 * 365 * 24 * 60 * 60); // 10 years expiration
        
        await (await identityRegistry.connect(deployer).registerIdentity(
            vaultAddress,
            roleInstitutional,
            jurisdiction,
            didHash,
            did,
            expiresAt
        )).wait();
        
        const vaultTokenId = await identitySBT.tokenIdOf(vaultAddress);
        console.log("Verifying SyncVault identity...");
        await (await identitySBT.connect(deployer).updateStatus(vaultTokenId, 2)).wait();
        console.log("✅ SyncVault verified in IdentityRegistry.");
    } else {
        // If registered, ensure status is VERIFIED (2)
        const identityData = await identitySBT.getIdentity(existingVaultTokenId);
        if (identityData.status !== 2n && identityData.status !== 2) {
            console.log("Updating SyncVault identity status to VERIFIED...");
            await (await identitySBT.connect(deployer).updateStatus(existingVaultTokenId, 2)).wait();
            console.log("✅ SyncVault verified in IdentityRegistry.");
        } else {
            console.log("ℹ️ SyncVault identity already verified in IdentityRegistry.");
        }
    }

    await saveWorkflowResult(8, {
        name: "Vault Creation",
        txHash: receiptHash || hre.ethers.ZeroHash,
        contract: vaultAddress,
        details: `SyncVault (ERC-4626) for AZURE`,
        layer: "L3"
    });
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
