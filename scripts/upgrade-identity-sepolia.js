const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;

  console.log("Deployer:", deployer.address);
  console.log("Network:", network);

  if (network !== "sepolia") {
    throw new Error("This script is specifically for Sepolia network upgrades.");
  }

  const deploymentFile = path.resolve(__dirname, "../deployments/sepolia-deployment.json");
  const existing = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  const identitySbtProxy = existing.contracts.identitySBT;
  const identityRegistryProxy = existing.contracts.identityRegistry;

  if (!identitySbtProxy || !identityRegistryProxy) {
    throw new Error("Missing identitySBT or identityRegistry address in sepolia-deployment.json");
  }

  const feeData = await hre.ethers.provider.getFeeData();
  const txOverrides = {
    maxFeePerGas: feeData.maxFeePerGas
      ? (feeData.maxFeePerGas * 2n)
      : hre.ethers.parseUnits("100", "gwei"),
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
      ? (feeData.maxPriorityFeePerGas * 2n)
      : hre.ethers.parseUnits("5", "gwei")
  };

  console.log("\n>>> Upgrading IdentitySBT on Sepolia...");
  const IdentitySBT = await hre.ethers.getContractFactory("IdentitySBT");
  await hre.upgrades.upgradeProxy(identitySbtProxy, IdentitySBT, {
    kind: "uups",
    txOverrides
  });
  const identitySbtImpl = await hre.upgrades.erc1967.getImplementationAddress(identitySbtProxy);
  console.log("IdentitySBT implementation:", identitySbtImpl);

  console.log("\n>>> Upgrading IdentityRegistry on Sepolia...");
  const IdentityRegistry = await hre.ethers.getContractFactory("IdentityRegistry");
  await hre.upgrades.upgradeProxy(identityRegistryProxy, IdentityRegistry, {
    kind: "uups",
    txOverrides
  });
  const identityRegistryImpl = await hre.upgrades.erc1967.getImplementationAddress(identityRegistryProxy);
  console.log("IdentityRegistry implementation:", identityRegistryImpl);

  existing.contracts.identitySBTImpl = identitySbtImpl;
  existing.contracts.identityRegistryImpl = identityRegistryImpl;
  existing.timestamp = new Date().toISOString();
  fs.writeFileSync(deploymentFile, JSON.stringify(existing, null, 2));

  console.log("\nUpdated sepolia-deployment.json with new identity implementation addresses.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
