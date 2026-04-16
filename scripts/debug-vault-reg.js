const { ethers } = require("hardhat");

async function main() {
  const REGISTRY_ADDR = "0xd8B1417b0afd98407732daB038931dB116d61648";
  const VAULT_ADDR = "0x62B754143cdD84CEfF8cCf04DBeAba4B12A32E63";
  const TREASURY_ADDR = "0x5537dbc19eeE936A615B151c8C5983FBF735C583";
  
  const registry = await ethers.getContractAt("IdentityRegistry", REGISTRY_ADDR);
  const sbtAddr = await registry.identitySBT();
  const sbt = await ethers.getContractAt("IdentitySBT", sbtAddr);
  
  console.log("Registry:", REGISTRY_ADDR);
  console.log("SBT:", sbtAddr);
  console.log("Vault:", VAULT_ADDR);
  console.log("Treasury:", TREASURY_ADDR);

  // Check if vault is already registered
  const tokenId = await sbt.tokenIdOf(VAULT_ADDR);
  console.log("Current Token ID for Vault:", tokenId.toString());

  // Check roles again
  const KYC_ROLE = ethers.id("KYC_PROVIDER_ROLE");
  console.log("Treasury has KYC_ROLE on Registry:", await registry.hasRole(KYC_ROLE, TREASURY_ADDR));
  
  const KYC_REG_ADDR = await registry.kycProvidersRegistry();
  const kycReg = await ethers.getContractAt("KYCProvidersRegistry", KYC_REG_ADDR);
  console.log("Treasury is approved provider:", await kycReg.isProviderApproved(TREASURY_ADDR));

  // Check jurisdiction
  const isValidJ = await sbt.callStatic.locked(0).catch(() => true); // Just to check if SBT responds
  // IdentitySBT.sol: mapping(uint16 => bool) private _allowedJurisdictions; is private.
  // But wait! Is there a public check? No.
  
  // Let's try to simulate the call
  const did = `did:crats:sepolia:${VAULT_ADDR.toLowerCase()}`;
  const expiresAt = Math.floor(Date.now() / 1000) + (10 * 365 * 24 * 60 * 60);
  const didHash = ethers.id(did);
  
  console.log("Simulating registerIdentity...");
  try {
    // We impersonate the treasury if possible, or just use the default account if it matches
    // But here we are on Sepolia, so we can't impersonate.
    // We just check for common pitfalls.
    
    if (tokenId > 0n) {
        console.log("REASON: Vault already has a token ID. Registration will revert.");
    }
  } catch (e) {
    console.log("Simulation failed:", e.message);
  }
}

main().catch(console.error);
