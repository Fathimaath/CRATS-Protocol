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
  const proxyAddress = existing.contracts.navOracle;

  if (!proxyAddress) {
    throw new Error("No navOracle address found in sepolia-deployment.json");
  }

  console.log("Existing NAVOracle Proxy Address:", proxyAddress);

  // Dynamic gas price calculation
  const feeData = await hre.ethers.provider.getFeeData();
  let gasPrice = feeData.gasPrice;
  if (gasPrice) {
    gasPrice = (gasPrice * 130n) / 100n; // 30% buffer
  } else {
    gasPrice = hre.ethers.parseUnits("30", "gwei"); // Fallback
  }
  console.log(`Using gas price: ${hre.ethers.formatUnits(gasPrice, "gwei")} Gwei`);
  const txOverrides = { gasPrice };

  console.log("\n>>> Upgrading NAVOracle implementation on Sepolia...");
  const NAVOracle = await hre.ethers.getContractFactory("NAVOracle");
  
  // Perform the upgrade
  const upgraded = await hre.upgrades.upgradeProxy(proxyAddress, NAVOracle, {
    txOverrides,
    kind: "uups"
  });
  await upgraded.waitForDeployment();
  console.log("Upgrade transaction submitted and confirmed.");

  // Get implementation address
  const implAddress = await hre.upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log("New NAVOracle Implementation Address:", implAddress);

  // Store addresses in deployment json
  existing.contracts.navOracleImpl = implAddress;
  existing.timestamp = new Date().toISOString();
  fs.writeFileSync(deploymentFile, JSON.stringify(existing, null, 2));
  console.log("Updated sepolia-deployment.json with implementation address.");

  console.log("\n🎉 Upgrade to Sepolia complete!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
