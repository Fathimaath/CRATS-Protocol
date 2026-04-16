const { ethers } = require("hardhat");

const IDENTITY_REGISTRY_ADDR = "0xd8B1417b0afd98407732daB038931dB116d61648";
// The debug script showed this address:
const IDENTITY_SBT_ADDR = "0x90d4894ce02155362fFC3cc2a295a9bC4B9d9c07";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Fixing roles using:", deployer.address);

  const sbt = await ethers.getContractAt("IdentitySBT", IDENTITY_SBT_ADDR);
  const managerRole = ethers.keccak256(ethers.toUtf8Bytes("IDENTITY_MANAGER_ROLE"));

  console.log(`Checking if Registry ${IDENTITY_REGISTRY_ADDR} has IDENTITY_MANAGER_ROLE...`);
  const hasRole = await sbt.hasRole(managerRole, IDENTITY_REGISTRY_ADDR);
  
  if (!hasRole) {
    console.log("Granting IDENTITY_MANAGER_ROLE to Registry...");
    const tx = await sbt.grantRole(managerRole, IDENTITY_REGISTRY_ADDR, { gasLimit: 200000 });
    await tx.wait();
    console.log("✅ Role granted.");
  } else {
    console.log("✅ Registry already has IDENTITY_MANAGER_ROLE.");
  }
}

main().catch(console.error);
