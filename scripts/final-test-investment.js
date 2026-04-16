const { ethers } = require("hardhat");

const { ethers } = require("hardhat");

const IDENTITY_REGISTRY_ADDR = ethers.getAddress("0xd8B1417b0afd98407732daB038931dB116d61648");
const USDT_ADDR = ethers.getAddress("0x89D2F8Be6900222a7f341C61b8fA0190777B8Cb8");
const VAULT_FACTORY_ADDR = ethers.getAddress("0xEb8d904725457f871283356e8a048D3e8De6d46f");

async function main() {
  const [treasury] = await ethers.getSigners();
  const investorWallet = treasury.address; 
  
  console.log("--- Starting Real Investment Test ---");
  console.log("Treasury:", treasury.address);

  // Dynamically get a vault
  const vaultFactory = await ethers.getContractAt("VaultFactory", VAULT_FACTORY_ADDR);
  const vaultCount = await vaultFactory.getVaultCount();
  if (vaultCount === 0n) throw new Error("No vaults found.");
  
  const vaultAddr = ethers.getAddress(await vaultFactory.allVaults(vaultCount - 1n));
  console.log("Testing with latest Vault:", vaultAddr);

  const registry = await ethers.getContractAt("IdentityRegistry", IDENTITY_REGISTRY_ADDR);
  const vault = await ethers.getContractAt("SyncVault", vaultAddr);
  const usdt = await ethers.getContractAt("ERC20", USDT_ADDR);

  // 1. Ensure Compliance (God-Mode Logic for Treasury)
  console.log("Checking compliance status...");
  const treasuryVerified = await registry.isVerified(treasury.address);
  const vaultVerified = await registry.isVerified(vaultAddr);
  
  console.log(`Treasury Verified: ${treasuryVerified}`);
  console.log(`Vault Verified: ${vaultVerified}`);

  // 2. Fund & Approve USDT
  const amount = ethers.parseUnits("0.05", 6); // 0.05 USDT
  console.log(`Approving ${ethers.formatUnits(amount, 6)} USDT...`);
  const approveTx = await usdt.approve(vaultAddr, amount);
  await approveTx.wait();
  console.log("USDT Approved.");

  // 3. Deposit
  console.log("Executing Deposit...");
  try {
    const depositTx = await vault.deposit(amount, investorWallet, { gasLimit: 1000000 });
    console.log("Deposit Transaction Sent:", depositTx.hash);
    const receipt = await depositTx.wait();
    console.log("✅ Investment Successful! Block:", receipt.blockNumber);
    
    const shares = await vault.balanceOf(investorWallet);
    console.log(`Vault Shares Balance for ${investorWallet}: ${ethers.formatUnits(shares, 18)}`);
  } catch (error) {
    console.error("❌ Investment Reverted:", error.message);
    process.exit(1);
  }
}

main().catch(console.error);
