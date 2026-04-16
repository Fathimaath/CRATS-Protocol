const { ethers } = require("hardhat");

const IDENTITY_REGISTRY_ADDR = "0xd8B1417b0afd98407732daB038931dB116d61648";
const TREASURY_ADDR = "0x5537dbc19eeE936A615B151c8C5983FBF735C583";
// Vault address from the screenshot or common vaults
// The user clicked "Open Position" on a vault.
// Let's check the IdentityRegistry state for the Treasury and common Vaults.

async function main() {
  const [deployer] = await ethers.getSigners();
  const registry = await ethers.getContractAt("IdentityRegistry", IDENTITY_REGISTRY_ADDR);
  const sbtAddr = await registry.identitySBT();
  const sbt = await ethers.getContractAt("IdentitySBT", sbtAddr);
  
  console.log("Registry:", IDENTITY_REGISTRY_ADDR);
  console.log("SBT:", sbtAddr);
  console.log("Treasury:", TREASURY_ADDR);

  const check = async (addr, name) => {
    const isVerified = await registry.isVerified(addr);
    const tokenId = await sbt.tokenIdOf(addr);
    console.log(`${name} (${addr}): Verified=${isVerified}, TokenID=${tokenId}`);
    if (tokenId > 0) {
      const data = await sbt.getIdentity(tokenId);
      console.log(`  - Status: ${data.status}, Expires: ${new Date(Number(data.expiresAt) * 1000).toISOString()}, Frozen: ${data.isFrozen}`);
    }
  };

  await check(TREASURY_ADDR, "Treasury");
  
  // Let's find some vaults from the VaultFactory
  const factoryAddr = "0xEb8d904725457f871283356e8a048D3e8De6d46f";
  const factory = await ethers.getContractAt("VaultFactory", factoryAddr);
  const count = await factory.getVaultCount();
  console.log(`\nFound ${count} vaults in factory.`);
  for (let i = 0; i < count; i++) {
    const v = await factory.allVaults(i);
    await check(v, `Vault ${i}`);
  }
}

main().catch(console.error);
