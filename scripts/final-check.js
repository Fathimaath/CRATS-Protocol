const { ethers } = require("hardhat");

async function main() {
  const regAddr = "0xd8B1417b0afd98407732daB038931dB116d61648";
  const treasuryAddr = "0x5537dbc19eeE936A615B151c8C5983FBF735C583";
  const vaultAddr = "0x96C7C9E3d3570F2848ca83dEBC3d515f43C533f5";

  console.log("Checking bytecode for Registry at:", regAddr);
  let code = await ethers.provider.getCode(regAddr);
  console.log("Registry bytecode length:", code.length);

  const registry = await ethers.getContractAt("IdentityRegistry", regAddr);
  
  try {
    const sbtAddr = await registry.identitySBT();
    console.log("Registry's SBT address:", sbtAddr);
    
    code = await ethers.provider.getCode(sbtAddr);
    console.log("SBT bytecode length:", code.length);
    
    const isTreasuryVerified = await registry.isVerified(treasuryAddr);
    console.log("Is Treasury Verified:", isTreasuryVerified);

    const isVaultVerified = await registry.isVerified(vaultAddr);
    console.log("Is Vault Verified:", isVaultVerified);

  } catch (err) {
    console.error("Error calling registry:", err.message);
  }
}

main().catch(console.error);
