const hre = require("hardhat");
const fs = require("fs");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  // 1. Load Solana Info
  let solanaInfo;
  try {
    solanaInfo = JSON.parse(fs.readFileSync("solana_info.json", "utf8"));
  } catch (e) {
    console.warn("solana_info.json not found, using defaults");
    solanaInfo = {
      assetName: "CRATS Real Estate #1",
      assetSymbol: "CRAT-RE1",
      mintAddress: "SOL_MINT_PLACEHOLDER"
    };
  }

  console.log(`Syncing with Solana Asset: ${solanaInfo.assetName} (${solanaInfo.mintAddress})`);

  // 2. Deploy SolanaMirrorToken (mCRAT)
  const MirrorToken = await hre.ethers.getContractFactory("SolanaMirrorToken");
  const mirror = await MirrorToken.deploy(); // Constructor takes no args
  await mirror.waitForDeployment();
  const mirrorAddress = await mirror.getAddress();
  console.log("SolanaMirrorToken deployed to:", mirrorAddress);

  // 3. Deploy SyncVault
  const SyncVault = await hre.ethers.getContractFactory("SyncVault");
  const vault = await SyncVault.deploy(); // Constructor disables initializers
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("SyncVault Implementation deployed to:", vaultAddress);

  // 4. Initialize SyncVault
  console.log("Initializing SyncVault...");
  const assetRegistry = deployer.address; // Placeholder
  const txInit = await vault.initialize(
    mirrorAddress,
    `Vault ${solanaInfo.assetName}`,
    `v${solanaInfo.assetSymbol}`,
    deployer.address,
    assetRegistry
  );
  await txInit.wait();
  console.log("SyncVault initialized.");

  // 5. Deploy ProofVerifier
  const ProofVerifier = await hre.ethers.getContractFactory("ProofVerifier");
  const verifier = await ProofVerifier.deploy(deployer.address); // deployer is operator
  await verifier.waitForDeployment();
  const verifierAddress = await verifier.getAddress();
  console.log("ProofVerifier deployed to:", verifierAddress);

  // 6. Setup ProofVerifier and Mirror
  console.log("Configuring ProofVerifier and Mirror...");
  const maxSupply = hre.ethers.parseUnits("1000", 18);
  await verifier.setup(mirrorAddress, vaultAddress, maxSupply);
  await mirror.setVerifier(verifierAddress);
  console.log("Configuration complete.");

  // 7. Execute Purchase Simulation (100 tokens)
  const investorAddress = "0x5537dbc19eeE936A615B151c8C5983FBF735C583";
  const amount = hre.ethers.parseUnits("100", 18);

  console.log(`Simulating purchase of 100 shares for ${investorAddress}...`);
  
  // Note: ProofVerifier.mintAndDeposit is the correct method name in ProofVerifier.sol
  const txProcess = await verifier.mintAndDeposit(investorAddress, amount);
  await txProcess.wait();

  console.log("------------------------------------------");
  console.log("SUCCESSFUL CROSS-CHAIN SYNC");
  console.log(`Investor ${investorAddress} now holds shares in ${solanaInfo.assetName} Vault.`);
  console.log("Vault Address:", vaultAddress);
  console.log("Mirror Token Address:", mirrorAddress);
  console.log("------------------------------------------");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
