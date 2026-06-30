const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

// ANSI color escape codes for beautiful output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
  gray: "\x1b[90m"
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve));

function getCategoryName(categoryHash) {
  const categories = {
    [hre.ethers.id("REAL_ESTATE")]: "REAL_ESTATE",
    [hre.ethers.id("CORPORATE_BOND")]: "CORPORATE_BOND",
    [hre.ethers.id("PRIVATE_CREDIT")]: "PRIVATE_CREDIT",
    [hre.ethers.id("FINE_ART")]: "FINE_ART"
  };
  return categories[categoryHash] || `UNKNOWN (${categoryHash.substring(0, 10)}...)`;
}

function getValuationMethodName(methodIndex) {
  const methods = [
    "FULL_APPRAISAL",
    "DESKTOP_APPRAISAL",
    "DCF_MODEL",
    "MARKET_COMPARABLE",
    "AUDIT_VERIFIED",
    "INCOME_STATEMENT"
  ];
  return methods[methodIndex] || `METHOD_${methodIndex}`;
}

function getNAVStateName(stateIndex) {
  const states = ["FRESH", "WARNING", "CRITICAL", "STALE"];
  return states[stateIndex] || `STATE_${stateIndex}`;
}

function getDisputeStatusName(statusIndex) {
  const statuses = ["NONE", "OPEN", "RESOLVED", "EXPIRED"];
  return statuses[statusIndex] || `STATUS_${statusIndex}`;
}

async function main() {
  console.log(`${colors.bright}${colors.cyan}`);
  console.log("======================================================================");
  console.log("   CRATS PROTOCOL - NET ASSET VALUE (NAV) & DISPUTE WORKFLOW CLI   ");
  console.log("======================================================================");
  console.log(colors.reset);

  const networkName = hre.network.name;
  const [deployer] = await hre.ethers.getSigners();

  console.log(`${colors.bright}Network :${colors.reset} ${colors.green}${networkName}${colors.reset}`);
  console.log(`${colors.bright}Signer  :${colors.reset} ${colors.yellow}${deployer.address}${colors.reset}\n`);

  // Load deployment file
  const deploymentFile = path.join(process.cwd(), "deployments", `${networkName}-deployment.json`);
  if (!fs.existsSync(deploymentFile)) {
    console.log(`${colors.red}Error: Deployment file not found for network: ${networkName}${colors.reset}`);
    process.exit(1);
  }

  let deployment;
  try {
    deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  } catch (e) {
    console.log(`${colors.red}Error parsing deployment file: ${e.message}${colors.reset}`);
    process.exit(1);
  }

  const contracts = deployment.contracts;
  if (!contracts.navOracle || !contracts.assetFactory) {
    console.log(`${colors.red}Error: Required contract addresses missing in deployment registry.${colors.reset}`);
    process.exit(1);
  }

  // Attach contracts
  const assetFactory = await hre.ethers.getContractAt("AssetFactory", contracts.assetFactory);
  const navOracle = await hre.ethers.getContractAt("NAVOracle", contracts.navOracle);
  
  let navScheduler;
  if (contracts.navScheduler) {
    navScheduler = await hre.ethers.getContractAt("NAVScheduler", contracts.navScheduler);
  } else {
    console.log(`${colors.yellow}Warning: NAVScheduler not found in deployment info. Some features will be disabled.${colors.reset}`);
  }

  let disputeResolver;
  if (contracts.disputeResolver) {
    disputeResolver = await hre.ethers.getContractAt("DisputeResolver", contracts.disputeResolver);
  } else {
    console.log(`${colors.yellow}Warning: DisputeResolver not found in deployment info. Dispute features will be disabled.${colors.reset}`);
  }

  let usdc;
  const usdcAddr = await navOracle.usdc();
  if (usdcAddr !== hre.ethers.ZeroAddress) {
    usdc = await hre.ethers.getContractAt("MockUSDC", usdcAddr);
  }

  // Main interaction loop
  let running = true;
  while (running) {
    console.log(`\n${colors.bright}--- NAV WORKFLOW ACTIONS ---${colors.reset}`);
    console.log(`1. View Status & Schedules of All Deployed Assets`);
    console.log(`2. Register Asset in NAVScheduler`);
    console.log(`3. Submit New NAV Valuation (Issuer)`);
    console.log(`4. File a NAV Challenge / Dispute (Locks USDC Stake)`);
    console.log(`5. Resolve an Active Dispute (via DisputeResolver)`);
    console.log(`6. Simulate Chainlink Upkeep Keeper (Check & Flag Schedules)`);
    console.log(`7. Configure Challenger Reward settings`);
    console.log(`8. Initialize Default schedules on NAVOracle`);
    console.log(`9. Exit`);

    const choice = await askQuestion(`\n${colors.bright}Choose an option (1-9): ${colors.reset}`);

    switch (choice.trim()) {
      case "1":
        await viewAssetStatuses(assetFactory, navOracle, navScheduler, disputeResolver);
        break;
      case "2":
        if (!navScheduler) {
          console.log(`${colors.red}NAVScheduler contract is not deployed or configured.${colors.reset}`);
          break;
        }
        await registerAssetInScheduler(assetFactory, navScheduler);
        break;
      case "3":
        await submitNAV(assetFactory, navOracle);
        break;
      case "4":
        await fileDispute(assetFactory, navOracle, usdc, deployer);
        break;
      case "5":
        if (!disputeResolver) {
          console.log(`${colors.red}DisputeResolver contract is not deployed or configured.${colors.reset}`);
          break;
        }
        await resolveDisputeFlow(navOracle, disputeResolver);
        break;
      case "6":
        if (!navScheduler) {
          console.log(`${colors.red}NAVScheduler contract is not deployed or configured.${colors.reset}`);
          break;
        }
        await simulateUpkeep(navScheduler);
        break;
      case "7":
        if (!disputeResolver) {
          console.log(`${colors.red}DisputeResolver contract is not deployed or configured.${colors.reset}`);
          break;
        }
        await configureReward(disputeResolver);
        break;
      case "8":
        if (!navScheduler) {
          console.log(`${colors.red}NAVScheduler contract is not deployed or configured.${colors.reset}`);
          break;
        }
        await initializeSchedules(navScheduler);
        break;
      case "9":
        running = false;
        console.log(`\n${colors.green}Exiting NAV CLI Workflow tool. Goodbye!${colors.reset}`);
        rl.close();
        break;
      default:
        console.log(`${colors.red}Invalid option. Please choose 1 to 9.${colors.reset}`);
    }
  }
}

// Option 1: View Asset Statuses
async function viewAssetStatuses(assetFactory, navOracle, navScheduler, disputeResolver) {
  console.log(`\n${colors.cyan}Fetching assets from AssetFactory...${colors.reset}`);
  
  // Try-catch loop to fetch all assets
  const deployedAssets = [];
  let index = 0;
  while (true) {
    try {
      const assetAddr = await assetFactory.allAssets(index);
      deployedAssets.push(assetAddr);
      index++;
    } catch (e) {
      break;
    }
  }

  if (deployedAssets.length === 0) {
    console.log(`${colors.yellow}No assets found registered in AssetFactory.${colors.reset}`);
    return;
  }

  console.log(`\nFound ${deployedAssets.length} assets. Retrieving details...\n`);

  for (const assetAddr of deployedAssets) {
    const assetToken = await hre.ethers.getContractAt("AssetToken", assetAddr);
    const name = await assetToken.name();
    const symbol = await assetToken.symbol();
    const assetId = hre.ethers.zeroPadValue(assetAddr, 32);

    const assetInfo = await assetFactory.assets(assetAddr);
    const categoryName = getCategoryName(assetInfo.category);

    // Get Active Submission
    const sub = await navOracle.activeSubmission(assetId);
    const state = await navOracle.getNAVState(assetId);
    const isDisputed = await navOracle.activeDispute(assetId);

    console.log(`${colors.bright}${colors.blue}=== Asset: ${name} (${symbol}) ===${colors.reset}`);
    console.log(`  ${colors.bright}Token Address :${colors.reset} ${assetAddr}`);
    console.log(`  ${colors.bright}Asset ID      :${colors.reset} ${assetId}`);
    console.log(`  ${colors.bright}Asset Class   :${colors.reset} ${categoryName}`);
    console.log(`  ${colors.bright}Current NAV   :${colors.reset} $${hre.ethers.formatUnits(sub.assetValue, 18)} (18 decimals)`);
    console.log(`  ${colors.bright}NAV State     :${colors.reset} ${getNAVStateColor(state)}${getNAVStateName(state)}${colors.reset}`);
    console.log(`  ${colors.bright}Last Updated  :${colors.reset} ${sub.submittedAt > 0 ? new Date(Number(sub.submittedAt) * 1000).toLocaleString() : "Never"}`);
    console.log(`  ${colors.bright}Method Used   :${colors.reset} ${getValuationMethodName(sub.method)}`);
    console.log(`  ${colors.bright}Under Dispute :${colors.reset} ${isDisputed ? `${colors.red}YES ⚠️${colors.reset}` : `${colors.green}NO${colors.reset}`}`);

    if (isDisputed) {
      const stake = await navOracle.challengeStakes(assetId);
      console.log(`    ${colors.yellow}Challenger  :${colors.reset} ${stake.challenger}`);
      console.log(`    ${colors.yellow}Stake Locked:${colors.reset} ${hre.ethers.formatUnits(stake.amount, 6)} USDC`);
    }

    if (navScheduler) {
      const isReg = await navScheduler.isRegistered(assetId);
      console.log(`  ${colors.bright}Scheduler Reg :${colors.reset} ${isReg ? `${colors.green}Registered${colors.reset}` : `${colors.gray}Not Registered${colors.reset}`}`);
      if (isReg) {
        const schedStatus = await navScheduler.getAssetScheduleStatus(assetId);
        console.log(`    Days since val  : ${schedStatus.daysSinceLastValuation} days`);
        console.log(`    Max allowed days: ${schedStatus.maxIntervalDays} days`);
        console.log(`    Violation status: ${schedStatus.scheduleViolated ? `${colors.red}VIOLATION ⚠️${colors.reset}` : `${colors.green}Compliant${colors.reset}`}`);
      }
    }
    console.log("");
  }
}

function getNAVStateColor(stateIndex) {
  switch (Number(stateIndex)) {
    case 0: return colors.green; // FRESH
    case 1: return colors.yellow; // WARNING
    case 2: return colors.magenta; // CRITICAL
    case 3: return colors.red; // STALE
    default: return colors.reset;
  }
}

// Option 2: Register Asset in NAVScheduler
async function registerAssetInScheduler(assetFactory, navScheduler) {
  const deployedAssets = [];
  let index = 0;
  while (true) {
    try {
      const assetAddr = await assetFactory.allAssets(index);
      deployedAssets.push(assetAddr);
      index++;
    } catch (e) {
      break;
    }
  }

  if (deployedAssets.length === 0) {
    console.log(`${colors.yellow}No assets found registered in AssetFactory.${colors.reset}`);
    return;
  }

  console.log(`\nAvailable Assets:`);
  for (let i = 0; i < deployedAssets.length; i++) {
    const assetToken = await hre.ethers.getContractAt("AssetToken", deployedAssets[i]);
    const name = await assetToken.name();
    const symbol = await assetToken.symbol();
    const isReg = await navScheduler.isRegistered(hre.ethers.zeroPadValue(deployedAssets[i], 32));
    console.log(`  ${i + 1}. ${name} (${symbol}) - Address: ${deployedAssets[i]} ${isReg ? "[Registered]" : ""}`);
  }

  const selection = await askQuestion(`\nSelect asset to register (1-${deployedAssets.length}) or enter custom address: `);
  let targetAddress;
  const selInt = parseInt(selection.trim(), 10);
  if (!isNaN(selInt) && selInt >= 1 && selInt <= deployedAssets.length) {
    targetAddress = deployedAssets[selInt - 1];
  } else {
    targetAddress = selection.trim();
  }

  if (!hre.ethers.isAddress(targetAddress)) {
    console.log(`${colors.red}Invalid contract address.${colors.reset}`);
    return;
  }

  const assetId = hre.ethers.zeroPadValue(targetAddress, 32);
  const isAlready = await navScheduler.isRegistered(assetId);
  if (isAlready) {
    console.log(`${colors.yellow}Asset is already registered in NAVScheduler.${colors.reset}`);
    return;
  }

  console.log(`Registering asset ${targetAddress}...`);
  try {
    const tx = await navScheduler.registerAsset(assetId);
    const receipt = await tx.wait();
    console.log(`${colors.green}✅ Asset registered successfully! Transaction hash: ${receipt.hash}${colors.reset}`);
  } catch (e) {
    console.log(`${colors.red}Transaction failed: ${e.message}${colors.reset}`);
  }
}

// Option 3: Submit New NAV Valuation
async function submitNAV(assetFactory, navOracle) {
  const deployedAssets = [];
  let index = 0;
  while (true) {
    try {
      const assetAddr = await assetFactory.allAssets(index);
      deployedAssets.push(assetAddr);
      index++;
    } catch (e) {
      break;
    }
  }

  if (deployedAssets.length === 0) {
    console.log(`${colors.yellow}No assets found registered in AssetFactory.${colors.reset}`);
    return;
  }

  console.log(`\nAvailable Assets:`);
  for (let i = 0; i < deployedAssets.length; i++) {
    const assetToken = await hre.ethers.getContractAt("AssetToken", deployedAssets[i]);
    const name = await assetToken.name();
    const symbol = await assetToken.symbol();
    console.log(`  ${i + 1}. ${name} (${symbol}) - Address: ${deployedAssets[i]}`);
  }

  const selection = await askQuestion(`Select asset (1-${deployedAssets.length}): `);
  const selInt = parseInt(selection.trim(), 10);
  if (isNaN(selInt) || selInt < 1 || selInt > deployedAssets.length) {
    console.log(`${colors.red}Invalid selection.${colors.reset}`);
    return;
  }

  const targetAddress = deployedAssets[selInt - 1];
  const assetId = hre.ethers.zeroPadValue(targetAddress, 32);

  const newValString = await askQuestion(`Enter new NAV value (e.g. 1.25): `);
  const newVal = hre.ethers.parseUnits(newValString.trim(), 18);

  console.log(`\nValuation Methods:`);
  console.log(`0. FULL_APPRAISAL`);
  console.log(`1. DESKTOP_APPRAISAL`);
  console.log(`2. DCF_MODEL`);
  console.log(`3. MARKET_COMPARABLE`);
  console.log(`4. AUDIT_VERIFIED`);
  console.log(`5. INCOME_STATEMENT`);
  const methodSelection = await askQuestion(`Choose method (0-5) [default 0]: `);
  const method = parseInt(methodSelection.trim(), 10) || 0;

  console.log(`Submitting NAV value to NAVOracle...`);
  try {
    const tx = await navOracle.submitNAV(
      assetId,
      newVal,
      Math.floor(Date.now() / 1000),
      hre.ethers.id("RICS_APPRAISAL_DOC_" + Date.now()),
      method
    );
    const receipt = await tx.wait();
    console.log(`${colors.green}✅ NAV updated successfully! Tx hash: ${receipt.hash}${colors.reset}`);
  } catch (e) {
    console.log(`${colors.red}Transaction failed: ${e.message}${colors.reset}`);
  }
}

// Option 4: File a NAV Challenge / Dispute
async function fileDispute(assetFactory, navOracle, usdc, deployer) {
  const deployedAssets = [];
  let index = 0;
  while (true) {
    try {
      const assetAddr = await assetFactory.allAssets(index);
      deployedAssets.push(assetAddr);
      index++;
    } catch (e) {
      break;
    }
  }

  if (deployedAssets.length === 0) {
    console.log(`${colors.yellow}No assets found registered in AssetFactory.${colors.reset}`);
    return;
  }

  console.log(`\nAvailable Assets to Challenge:`);
  for (let i = 0; i < deployedAssets.length; i++) {
    const assetToken = await hre.ethers.getContractAt("AssetToken", deployedAssets[i]);
    const name = await assetToken.name();
    const symbol = await assetToken.symbol();
    const isDisputed = await navOracle.activeDispute(hre.ethers.zeroPadValue(deployedAssets[i], 32));
    console.log(`  ${i + 1}. ${name} (${symbol}) ${isDisputed ? `${colors.red}[Dispute Active]${colors.reset}` : ""}`);
  }

  const selection = await askQuestion(`Select asset to challenge (1-${deployedAssets.length}): `);
  const selInt = parseInt(selection.trim(), 10);
  if (isNaN(selInt) || selInt < 1 || selInt > deployedAssets.length) {
    console.log(`${colors.red}Invalid selection.${colors.reset}`);
    return;
  }

  const targetAddress = deployedAssets[selInt - 1];
  const assetId = hre.ethers.zeroPadValue(targetAddress, 32);

  const isAlreadyDisputed = await navOracle.activeDispute(assetId);
  if (isAlreadyDisputed) {
    console.log(`${colors.red}Error: Dispute is already active for this asset.${colors.reset}`);
    return;
  }

  const challengeValString = await askQuestion(`Enter your challenged NAV value (e.g. 0.95): `);
  const challengeVal = hre.ethers.parseUnits(challengeValString.trim(), 18);

  const stakeAmount = await navOracle.challengeStakeAmount();
  console.log(`Required USDC stake: ${hre.ethers.formatUnits(stakeAmount, 6)} USDC`);

  if (!usdc) {
    console.log(`${colors.red}Error: USDC token contract is not configured on the oracle.${colors.reset}`);
    return;
  }

  // Check balance and approve
  const balance = await usdc.balanceOf(deployer.address);
  if (balance < stakeAmount) {
    console.log(`${colors.yellow}Deployer has insufficient USDC balance (${hre.ethers.formatUnits(balance, 6)} USDC). Minting mock USDC...${colors.reset}`);
    const mintTx = await usdc.mint(deployer.address, stakeAmount - balance);
    await mintTx.wait();
    console.log(`${colors.green}Minted required USDC stake amount!${colors.reset}`);
  }

  const allowance = await usdc.allowance(deployer.address, await navOracle.getAddress());
  if (allowance < stakeAmount) {
    console.log(`Approving NAVOracle to spend USDC stake...`);
    const approveTx = await usdc.approve(await navOracle.getAddress(), stakeAmount);
    await approveTx.wait();
    console.log(`${colors.green}Approved!${colors.reset}`);
  }

  // Generate and sign evidence hash
  const evidenceStr = `Evidence challenge for asset ${targetAddress} created at ${Date.now()}`;
  const evidenceHash = hre.ethers.id(evidenceStr);
  console.log(`Evidence hash: ${evidenceHash}`);
  
  console.log(`Signing evidence hash with your private key...`);
  const signature = await deployer.signMessage(hre.ethers.getBytes(evidenceHash));

  console.log(`Filing challenge...`);
  try {
    const tx = await navOracle.fileChallenge(
      assetId,
      challengeVal,
      evidenceHash,
      signature
    );
    const receipt = await tx.wait();
    console.log(`${colors.green}✅ Challenge filed successfully! Dispute is now OPEN. Tx hash: ${receipt.hash}${colors.reset}`);
  } catch (e) {
    console.log(`${colors.red}Transaction failed: ${e.message}${colors.reset}`);
  }
}

// Option 5: Resolve an Active Dispute
async function resolveDisputeFlow(navOracle, disputeResolver) {
  // Query all active disputes
  // Because we can't easily iterate all active disputes in contract memory, we read the active disputes based on registry assets
  // Wait, let's ask the user to input the asset ID or address they wish to resolve.
  const assetAddrInput = await askQuestion(`Enter the Asset Token address to resolve dispute for: `);
  if (!hre.ethers.isAddress(assetAddrInput.trim())) {
    console.log(`${colors.red}Invalid address.${colors.reset}`);
    return;
  }

  const assetId = hre.ethers.zeroPadValue(assetAddrInput.trim(), 32);
  const isDisputed = await navOracle.activeDispute(assetId);
  if (!isDisputed) {
    console.log(`${colors.red}No active dispute found for this asset ID.${colors.reset}`);
    return;
  }

  const stake = await navOracle.challengeStakes(assetId);
  const disputeRecord = await disputeResolver.previewResolution(assetId);

  console.log(`\nActive Dispute Details:`);
  console.log(`  Challenger     : ${stake.challenger}`);
  console.log(`  Locked Stake   : ${hre.ethers.formatUnits(stake.amount, 6)} USDC`);
  console.log(`  Challenger Val : $${hre.ethers.formatUnits(disputeRecord.stakeAmount, 18)} (18 dec)`);

  const resolvedValueString = await askQuestion(`\nEnter the accepted NAV resolved value (e.g. 1.05): `);
  const resolvedValue = hre.ethers.parseUnits(resolvedValueString.trim(), 18);

  const correctSelection = await askQuestion(`Is the challenger correct? (y/n): `);
  const challengerCorrect = correctSelection.trim().toLowerCase() === "y";

  const evidenceStr = `Dispute resolution audit at timestamp ${Date.now()}`;
  const evidenceHash = hre.ethers.id(evidenceStr);

  console.log(`Resolving challenge via DisputeResolver...`);
  try {
    const tx = await disputeResolver.resolveChallenge(
      assetId,
      resolvedValue,
      evidenceHash,
      challengerCorrect
    );
    const receipt = await tx.wait();
    console.log(`${colors.green}✅ Dispute RESOLVED successfully! Tx hash: ${receipt.hash}${colors.reset}`);
  } catch (e) {
    console.log(`${colors.red}Transaction failed: ${e.message}${colors.reset}`);
  }
}

// Option 6: Simulate Keeper Upkeep
async function simulateUpkeep(navScheduler) {
  console.log(`\n${colors.cyan}Simulating Chainlink Automation Keeper Upkeep...${colors.reset}`);
  
  try {
    // Call checkUpkeep off-chain
    const checkResult = await navScheduler.checkUpkeep("0x");
    console.log(`Upkeep Needed: ${checkResult.upkeepNeeded ? `${colors.yellow}Yes${colors.reset}` : `${colors.green}No (all schedules fresh)${colors.reset}`}`);

    if (checkResult.upkeepNeeded) {
      const decodedAssets = hre.ethers.AbiCoder.defaultAbiCoder().decode(["bytes32[]"], checkResult.performData)[0];
      console.log(`Assets requiring attention:`);
      for (const aid of decodedAssets) {
        console.log(`  - ${aid}`);
      }

      const proceed = await askQuestion(`Execute performUpkeep on-chain? (y/n) [default y]: `);
      if (proceed.trim() === "" || proceed.trim().toLowerCase() === "y") {
        console.log("Sending performUpkeep transaction...");
        const tx = await navScheduler.performUpkeep(checkResult.performData);
        const receipt = await tx.wait();
        console.log(`${colors.green}✅ Upkeep completed! Tx hash: ${receipt.hash}${colors.reset}`);
      }
    } else {
      // Manual single check option
      const manualId = await askQuestion("Enter an Asset ID to manually run checkAndFlag (or leave blank to go back): ");
      if (manualId.trim() !== "") {
        console.log(`Triggering checkAndFlag on ${manualId.trim()}...`);
        const tx = await navScheduler.checkAndFlag(manualId.trim());
        await tx.wait();
        console.log(`${colors.green}✅ Check performed!${colors.reset}`);
      }
    }
  } catch (e) {
    console.log(`${colors.red}Error: ${e.message}${colors.reset}`);
  }
}

// Option 7: Configure Reward
async function configureReward(disputeResolver) {
  const currentReward = await disputeResolver.rewardAmount();
  console.log(`Current Challenger Reward: ${hre.ethers.formatUnits(currentReward, 6)} USDC`);

  const amountStr = await askQuestion("Enter new reward amount in USDC (e.g. 100): ");
  if (amountStr.trim() === "") return;

  const rewardUnits = hre.ethers.parseUnits(amountStr.trim(), 6);
  console.log(`Setting reward to ${amountStr.trim()} USDC...`);
  try {
    const tx = await disputeResolver.setRewardAmount(rewardUnits);
    await tx.wait();
    console.log(`${colors.green}✅ Reward updated successfully!${colors.reset}`);
  } catch (e) {
    console.log(`${colors.red}Error: ${e.message}${colors.reset}`);
  }
}

// Option 8: Initialize default schedules
async function initializeSchedules(navScheduler) {
  console.log("Setting default schedules for REAL_ESTATE, CORPORATE_BOND, PRIVATE_CREDIT, FINE_ART...");
  try {
    const tx = await navScheduler.initializeDefaultSchedules();
    await tx.wait();
    console.log(`${colors.green}✅ Schedules initialized!${colors.reset}`);
  } catch (e) {
    console.log(`${colors.red}Error: ${e.message}${colors.reset}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
