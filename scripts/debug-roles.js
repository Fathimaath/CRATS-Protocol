const { ethers } = require("hardhat");

const IDENTITY_REGISTRY_ADDR = "0xd8B1417b0afd98407732daB038931dB116d61648";
const IDENTITY_SBT_ADDR = "0x89D5E7A99966C44C938F9DF01272D1E16D61648"; // I need to verify this
const ASSET_ADDR = "0x557D0eba3FffD5eAE0Fa4745aB87686d10473362";

async function main() {
  const [deployer] = await ethers.getSigners();
  
  const registry = await ethers.getContractAt("IdentityRegistry", IDENTITY_REGISTRY_ADDR);
  const sbtAddr = await registry.identitySBT();
  console.log("IdentitySBT Address from Registry:", sbtAddr);
  
  const sbt = await ethers.getContractAt("IdentitySBT", sbtAddr);
  
  const tokenId = await sbt.tokenIdOf(ASSET_ADDR);
  console.log(`Asset ${ASSET_ADDR} TokenID:`, tokenId.toString());
  
  const managerRole = await sbt.IDENTITY_MANAGER_ROLE();
  const hasRole = await sbt.hasRole(managerRole, IDENTITY_REGISTRY_ADDR);
  console.log(`Does Registry have IDENTITY_MANAGER_ROLE on SBT?`, hasRole);

  const kycRole = ethers.keccak256(ethers.toUtf8Bytes("KYC_PROVIDER_ROLE")); // Assuming this is the role string
  const hasKycRole = await registry.hasRole(kycRole, deployer.address);
  console.log(`Does Deployer ${deployer.address} have KYC_PROVIDER_ROLE on Registry?`, hasKycRole);
}

main().catch(console.error);
