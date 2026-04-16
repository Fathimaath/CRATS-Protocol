const { ethers } = require("hardhat");

async function main() {
  const REGISTRY_ADDR = "0xd8B1417b0afd98407732daB038931dB116d61648";
  const TREASURY_ADDR = "0x5537dbc19eeE936A615B151c8C5983FBF735C583";
  
  const registry = await ethers.getContractAt("IdentityRegistry", REGISTRY_ADDR);
  const sbtAddr = await registry.identitySBT();
  const kycRegAddr = await registry.kycProvidersRegistry();
  
  console.log("Registry Addr:", REGISTRY_ADDR);
  console.log("SBT Addr (from Registry):", sbtAddr);
  console.log("KYC Registry Addr (from Registry):", kycRegAddr);

  const sbt = await ethers.getContractAt("IdentitySBT", sbtAddr);
  const kycReg = await ethers.getContractAt("KYCProvidersRegistry", kycRegAddr);

  // 1. Roles on Registry
  const KYC_PROVIDER_ROLE = ethers.id("KYC_PROVIDER_ROLE");
  const hasKycRole = await registry.hasRole(KYC_PROVIDER_ROLE, TREASURY_ADDR);
  console.log("Treasury has KYC_PROVIDER_ROLE on Registry:", hasKycRole);

  // 2. Status on KYC Registry
  const isApproved = await kycReg.isProviderApproved(TREASURY_ADDR);
  console.log("Treasury is approved provider on KYC Registry:", isApproved);

  // 3. Roles on SBT
  const IDENTITY_MANAGER_ROLE = ethers.id("IDENTITY_MANAGER_ROLE");
  const registryHasSbtRole = await sbt.hasRole(IDENTITY_MANAGER_ROLE, REGISTRY_ADDR);
  console.log("Registry has IDENTITY_MANAGER_ROLE on SBT:", registryHasSbtRole);

  // 4. Check if Vault already has identity
  const VAULT_ADDR = "0x62B754143cdD84CEfF8cCf04DBeAba4B12A32E63";
  const tokenId = await sbt.tokenIdOf(VAULT_ADDR);
  console.log("Vault TokenID:", tokenId.toString());
  
  const isVerified = await sbt.isVerified(VAULT_ADDR);
  console.log("Vault isVerified:", isVerified);

  // 5. Simulation
  console.log("Simulating Registry.registerIdentity call...");
  const did = `did:crats:sepolia:${VAULT_ADDR.toLowerCase()}`;
  const didHash = ethers.id(did);
  const expiresAt = Math.floor(Date.now() / 1000) + 315360000;

  try {
      // Just a dry run of the encoding
      const data = registry.interface.encodeFunctionData("registerIdentity", [
          VAULT_ADDR,
          3,
          826,
          didHash,
          did,
          expiresAt
      ]);
      console.log("Encoded Data:", data);
  } catch (e) {
      console.log("Encoding failed:", e.message);
  }
}

main().catch(console.error);
