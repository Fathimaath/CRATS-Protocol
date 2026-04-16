const { ethers } = require("hardhat");

async function main() {
  const regAddr = "0xd8B1417b0afd98407732daB038931dB116d61648";
  const treasuryAddr = "0x5537dbc19eeE936A615B151c8C5983FBF735C583";
  const registry = await ethers.getContractAt("IdentityRegistry", regAddr);
  
  const KYC_PROVIDER_ROLE = ethers.id("KYC_PROVIDER_ROLE");
  const hasRole = await registry.hasRole(KYC_PROVIDER_ROLE, treasuryAddr);
  console.log("Treasury has KYC_PROVIDER_ROLE on Registry:", hasRole);
  
  const admin = await registry.getRoleMember(ethers.id("DEFAULT_ADMIN_ROLE"), 0).catch(() => "unknown");
  console.log("Registry Admin:", admin);
}

main().catch(console.error);
