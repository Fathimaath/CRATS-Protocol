const { getDeploymentInfo } = require("./workflow/helpers");
const hre = require("hardhat");

async function main() {
    console.log("\n--- Onboarding Platform Treasury Wallet to Identity Layer ---");
    const deployment = await getDeploymentInfo();
    const [deployer] = await hre.ethers.getSigners();
    
    const treasuryAddress = "0x08a9a44dA0BF5eD6bF9027da175dd60949f17d6d";
    console.log("Admin (KYC Provider):", deployer.address);
    console.log("Treasury Address:", treasuryAddress);

    const identityRegistry = await hre.ethers.getContractAt("IdentityRegistry", deployment.contracts.identityRegistry);
    const identitySBT = await hre.ethers.getContractAt("IdentitySBT", deployment.contracts.identitySBT);
    const kycRegistry = await hre.ethers.getContractAt("KYCProvidersRegistry", deployment.contracts.kycRegistry);

    // Ensure deployer is approved KYC provider
    const isProvider = await kycRegistry.isProviderApproved(deployer.address);
    if (!isProvider) {
        console.log("Authorizing deployer as KYC provider in KYCProvidersRegistry...");
        const providerInfo = await kycRegistry.getProviderInfo(deployer.address);
        if (providerInfo.status === 0n || providerInfo.status === 0) {
            console.log("  Registering provider...");
            await (await kycRegistry.connect(deployer).registerProvider(deployer.address, "Deployer KYC Provider")).wait();
        }
        console.log("  Approving provider...");
        await (await kycRegistry.connect(deployer).approveProvider(deployer.address)).wait();
        console.log("✅ Deployer authorized as KYC provider.");
    }

    // Ensure IdentityRegistry has IDENTITY_MANAGER_ROLE on IdentitySBT
    const identityManagerRole = await identitySBT.IDENTITY_MANAGER_ROLE();
    const hasManagerRole = await identitySBT.hasRole(identityManagerRole, deployment.contracts.identityRegistry);
    if (!hasManagerRole) {
        console.log("Granting IDENTITY_MANAGER_ROLE to IdentityRegistry on IdentitySBT...");
        await (await identitySBT.connect(deployer).grantRole(identityManagerRole, deployment.contracts.identityRegistry)).wait();
        console.log("✅ Role granted.");
    }
    
    // Check if already registered
    const existingTokenId = await identitySBT.tokenIdOf(treasuryAddress);
    if (existingTokenId != 0n && existingTokenId != 0) {
        console.log(`ℹ️ Treasury already registered with Token ID: ${existingTokenId}. Skipping.`);
        return;
    }
    
    const roleInstitutional = 3; // ROLE_INSTITUTIONAL
    const jurisdiction = 826;
    const did = `did:crats:treasury-vault-552`;
    const didHash = hre.ethers.id(did);
    const expiresAt = Math.floor(Date.now() / 1000) + (10 * 365 * 24 * 60 * 60); // 10 years expiry for Treasury

    console.log("Registering identity for Treasury wallet...");
    const tx = await identityRegistry.connect(deployer).registerIdentity(
        treasuryAddress,
        roleInstitutional,
        jurisdiction,
        didHash,
        did,
        expiresAt
    );
    const receipt = await tx.wait();
    console.log(`✅ Treasury wallet registered successfully in IdentityRegistry (Tx: ${receipt.hash}).`);
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
