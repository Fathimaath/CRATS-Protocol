const { ethers } = require("hardhat");

async function main() {
  const REGISTRY_ADDR = "0xd8B1417b0afd98407732daB038931dB116d61648";
  const registry = await ethers.getContractAt("IdentityRegistry", REGISTRY_ADDR);
  const sbtAddr = await registry.identitySBT();
  const sbt = await ethers.getContractAt("IdentitySBT", sbtAddr);

  console.log("Checking jurisdiction 826 on SBT:", sbtAddr);
  
  // Adding 826 (UK) to allowed jurisdictions
  try {
      const tx = await sbt.addJurisdiction(826, { gasLimit: 200000 });
      await tx.wait();
      console.log("Jurisdiction 826 added successfully.");
  } catch (e) {
      console.log("Failed to add jurisdiction (maybe already added or no permission):", e.message);
  }

  // Also ensuring Registry has MANAGER role
  const ID_ROLE = ethers.id("IDENTITY_MANAGER_ROLE");
  if (!(await sbt.hasRole(ID_ROLE, REGISTRY_ADDR))) {
    await (await sbt.grantRole(ID_ROLE, REGISTRY_ADDR)).wait();
    console.log("Registry granted IDENTITY_MANAGER_ROLE.");
  }
}

main().catch(console.error);
