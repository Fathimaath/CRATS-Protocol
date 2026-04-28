const hre = require("hardhat");
async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const kycRegistryAddr = "0x514C0FC489a1d323df0203853dCe030b0eB5CE6f";
  console.log("Authorizing Deployer:", deployer.address);
  const KYCRegistry = await hre.ethers.getContractAt("KYCProvidersRegistry", kycRegistryAddr);
  const tx = await KYCRegistry.addProvider(deployer.address, { gasPrice: hre.ethers.parseUnits("25", "gwei") });
  console.log("Tx sent:", tx.hash);
  await tx.wait();
  console.log("✅ SUCCESS: Provider Approved");
}
main().catch(console.error);
