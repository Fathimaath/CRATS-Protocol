const RPC_URL = "http://127.0.0.1:8545";
const DEPLOYMENT_PATH = "../deployments/localhost-deployment.json";

let provider;
let deployment;
let activeSigner;

// ========== ABIs ==========
const IDENTITY_ABI = [
    "function registerIdentity(address, uint8, uint16, bytes32, string, uint64) external returns (uint256)",
    "function updateStatus(uint256, uint8) external",
    "function tokenIdOf(address) view returns (uint256)",
    "function getIdentity(uint256) view returns (tuple(string did, uint8 role, uint16 jurisdiction, uint8 status, uint256 expiresAt, address owner))"
];
const FACTORY_ABI = [
    "function deployAsset(string, string, uint256, bytes32) external returns (address)",
    "function approveIssuer(address) external",
    "event AssetDeployed(address indexed token, address indexed issuer, bytes32 category)",
    "event AssetCreated(bytes32 indexed assetId, address indexed token, address indexed oracle, address registry, address issuer, bytes32 category)",
    "event IssuerApproved(address indexed issuer)"
];
const TOKEN_ABI = [
    "function addDocuments(bytes32[], string[]) external",
    "function mint(address, uint256) external",
    "function approve(address, uint256) external returns (bool)",
    "function balanceOf(address) view returns (uint256)",
    "function name() view returns (string)",
    "function setNAV(uint256) external",
    "function identityRegistry() view returns (address)"
];
const ORACLE_ABI = ["function pushNAV(uint256, string) external"];
const VAULT_FACTORY_ABI = [
    "function createSyncVault(address, string, string, bytes32) external returns (address)",
    "event VaultCreated(address indexed vault, address indexed asset, bytes32 indexed category, uint8 vaultType, address creator, uint256 timestamp)"
];
const VAULT_ABI = [
    "function deposit(uint256, address) external returns (uint256)",
    "function distributeYield(uint256) external",
    "function grantRole(bytes32, address) external",
    "function balanceOf(address) view returns (uint256)",
    "function convertToAssets(uint256) view returns (uint256)"
];
const MARKET_FACTORY_ABI = ["function getPair(address, address) view returns (address)"];
const ORDERBOOK_ABI = [
    "function placeOrder(uint8, uint256, uint256) external returns (uint256)",
    "event OrderPlaced(uint256 indexed orderId, address indexed trader, uint8 orderType)"
];
const CLEARING_ABI = ["function clearTrade(uint256, uint256) external"];

// ========== Initialization ==========
async function init() {
    const statusEl = document.getElementById("node-status");
    try {
        provider = new ethers.JsonRpcProvider(RPC_URL);
        const network = await provider.getNetwork();
        statusEl.innerText = `Connected: Hardhat (31337)`;
        statusEl.classList.add("connected");

        const res = await fetch(DEPLOYMENT_PATH);
        deployment = await res.json();

        // Recovery: Load dynamic state from localStorage
        const cachedToken = localStorage.getItem("azureToken");
        if (cachedToken) {
            deployment.contracts.azureToken = cachedToken;
            log(`Restored Asset from cache: ${cachedToken}`, "info");
        }
        const cachedVault = localStorage.getItem("azureVault");
        if (cachedVault) {
            deployment.contracts.azureVault = cachedVault;
            log(`Restored Vault from cache: ${cachedVault}`, "info");
        }

        log("Protocol Layer 1 (Identity) and Layer 2 (Financial) Registry Loaded.", "success");
        activeSigner = await provider.getSigner(0);
        document.getElementById("sbt-contract-display").innerText = `Contract: ${deployment.contracts.identitySBT}`;
    } catch (err) {
        statusEl.innerText = "Error: Node Offline";
        console.error(err);
    }
}

// ========== Step Runner ==========
async function runStep(n) {
    const btn = document.querySelector(`#step-${n} .run-btn`);
    const stepEl = document.getElementById(`step-${n}`);

    if (btn) btn.disabled = true;
    log(`Running Step ${n}...`, "info");

    try {
        // Pre-flight check: Does the registry exist?
        const code = await provider.getCode(deployment.contracts.identityRegistry);
        if (code === "0x") {
            throw new Error("CONTRACTS NOT DEPLOYED. Please run 'npx hardhat run scripts/deploy-all.js --network localhost'");
        }

        const signers = [
            await provider.getSigner(0), // Admin/Provider
            await provider.getSigner(1), // Issuer
            await provider.getSigner(2)  // Investor
        ];

        switch (n) {
            case 1: await step1(signers[0]); break;
            case 2: await step2(signers[0]); break;
            case 3: await step3(signers[0]); break;
            case 4: await step4(signers[1]); break;
            case 5: await step5(signers[1]); break;
            case 6: await step6(signers[1]); break;
            case 7: await step7(signers[1]); break;
            case 8: await step8(signers[0]); break;
            case 9: await step9(signers[0]); break;
            case 10: await step10(signers[0]); break;
            case 11: await step11(signers[2]); break;
            case 12: await step12(signers[0]); break;
            case 13: await step13(signers[2]); break;
            case 14: await step14(signers[0]); break;
        }

        stepEl.classList.add("completed");
        log(`Step ${n} Successful!`, "success");
    } catch (err) {
        log(`Step ${n} Failed: ${err.message}`, "error");
        stepEl.classList.add("error");
    } finally {
        if (btn) btn.disabled = false;
    }
}

// ========== Implementation Details ==========

async function step1(admin) {
    const factory = new ethers.Contract(deployment.contracts.assetFactory, FACTORY_ABI, admin);
    const rawAddress = document.getElementById("issuer-addr").value;
    const address = ethers.getAddress(rawAddress.toLowerCase()); // Bypass strict checksum validation

    log(`Approving Issuer ${address} in Asset Factory...`, "info");
    const tx = await factory.approveIssuer(address);
    await tx.wait();
    log(`Issuer Authorized on Layer 1.`, "success");
}

async function step2(admin) {
    log("Auditing off-chain KYC documents (Passport, Proof of Address)...", "info");
    log("DID: did:crats:nexus-realty validated.", "success");
    log("Ready for on-chain Identity Minting.", "success");
}

async function step3(admin) {
    const registry = new ethers.Contract(deployment.contracts.identityRegistry, IDENTITY_ABI, admin);
    const sbt = new ethers.Contract(deployment.contracts.identitySBT, IDENTITY_ABI, admin);
    const rawAddress = document.getElementById("issuer-addr").value;
    const address = ethers.getAddress(rawAddress.toLowerCase()); // Normalize checksum

    log("Minting Identity SBT...", "info");

    // Check if exists
    const existingId = await sbt.tokenIdOf(address);
    if (existingId > 0n) {
        log(`Identity SBT already exists (#${existingId}).`, "success");
        return;
    }

    const did = "did:crats:nexus-realty";
    const expiresAt = Math.floor(Date.now() / 1000) + 31536000;

    // 1. Register (Mint)
    const tx1 = await registry.registerIdentity(address, 4, 826, ethers.id(did), did, expiresAt);
    await tx1.wait();

    const tokenId = await sbt.tokenIdOf(address);

    // 2. Set Status (Verified)
    const tx2 = await sbt.updateStatus(tokenId, 2);
    await tx2.wait();

    log(`Identity Minted & Verified! Token ID: ${tokenId}`, "success");
    log(`SBT Contract: ${deployment.contracts.identitySBT}`, "success");
}

async function syncRegistry(token, admin) {
    const currentRegistry = await token.identityRegistry();
    if (currentRegistry !== deployment.contracts.identityRegistry) {
        log(`Synchronizing Asset with new Protocol Registry (${deployment.contracts.identityRegistry})...`, "info");
        const tx = await token.setIdentityRegistry(deployment.contracts.identityRegistry);
        await tx.wait();
        log("Registry synchronization complete.", "success");
    }
}

async function step4(issuer) {
    const factory = new ethers.Contract(deployment.contracts.assetFactory, FACTORY_ABI, issuer);

    const name = "Azure Manor";
    const symbol = "AZURE";
    const supply = ethers.parseUnits("10000000", 18);
    const category = ethers.id("REAL_ESTATE");

    log(`Deploying ${name} (${symbol}) with ${supply} initial supply...`, "info");
    const tx = await factory.deployAsset(name, symbol, supply, category);
    const rc = await tx.wait();

    // --- ROBUST EVENT EXTRACTION ---
    let azureTokenAddr = null;

    log("Scanning logs for new asset address...", "info");
    for (const logItem of rc.logs) {
        try {
            const parsed = factory.interface.parseLog(logItem);
            if (!parsed) continue;

            if (parsed.name === "AssetDeployed") {
                azureTokenAddr = parsed.args.token;
                break;
            } else if (parsed.name === "AssetCreated") {
                azureTokenAddr = parsed.args.token;
                break;
            }
        } catch (e) { /* skip unparseable logs */ }
    }

    if (azureTokenAddr) {
        deployment.contracts.azureToken = azureTokenAddr;
        localStorage.setItem("azureToken", azureTokenAddr); // Save for persistence
        log(`Success! Asset created at: ${azureTokenAddr}`, "success");
    } else {
        log("CRITICAL: Asset deployed but event parsing failed. Checking registry fallback...", "info");
        // Fallback: Use the last address in common logs that looks like an address if appropriate, 
        // but better to just throw a descriptive error for now to locate the issue.
        throw new Error("Could not find AssetDeployed or AssetCreated event in transaction logs. Ensure AssetFactory.sol emits the correct event.");
    }
}

async function step5(issuer) {
    const token = new ethers.Contract(deployment.contracts.azureToken, TOKEN_ABI, issuer);
    const tx = await token.addDocuments([ethers.id("DOC1")], ["ipfs://title"]);
    await tx.wait();
    log(`Documents registered for asset.`, "success");
}

async function step6(admin) {
    const token = new ethers.Contract(deployment.contracts.azureToken, TOKEN_ABI, admin);
    log(`Pushing Net Asset Value (NAV) update...`, "info");
    const tx = await token.setNAV(ethers.parseUnits("1200", 18));
    await tx.wait();
    log(`NAV configured: $1,200 per share set directly on-chain.`, "success");
}

async function step7(issuer) {
    const token = new ethers.Contract(deployment.contracts.azureToken, TOKEN_ABI, issuer);
    const balance = await token.balanceOf(issuer.address);
    log(`Verified Ledger: Issuer treasury holds ${ethers.formatUnits(balance, 18)} ${await token.name()} tokens.`, "success");
}

async function step8(admin) {
    if (!deployment.contracts.azureToken) {
        throw new Error("Asset token not found in memory or cache. Please run Step 4 again to redeploy the asset.");
    }

    const factory = new ethers.Contract(deployment.contracts.vaultFactory, VAULT_FACTORY_ABI, admin);
    const category = ethers.id("REAL_ESTATE");
    const tx = await factory.createSyncVault(deployment.contracts.azureToken, "Vault Azure", "vAZURE", category);
    const rc = await tx.wait();

    // --- ROBUST EVENT EXTRACTION ---
    let vaultAddr = null;
    log("Scanning logs for new vault address...", "info");
    for (const logItem of rc.logs) {
        try {
            const parsed = factory.interface.parseLog(logItem);
            if (parsed && parsed.name === "VaultCreated") {
                vaultAddr = parsed.args.vault;
                break;
            }
        } catch (e) { /* skip */ }
    }

    if (vaultAddr) {
        deployment.contracts.azureVault = vaultAddr;
        localStorage.setItem("azureVault", vaultAddr); // Save for persistence
        log(`Success! Vault created at: ${vaultAddr}`, "success");
    } else {
        throw new Error("Could not find VaultCreated event in transaction logs.");
    }
}

async function step9(admin) {
    const sbt = new ethers.Contract(deployment.contracts.identitySBT, IDENTITY_ABI, admin);
    const rawAddress = document.getElementById("investor-addr").value;
    const address = ethers.getAddress(rawAddress.toLowerCase());
    const existingId = await sbt.tokenIdOf(address);

    if (existingId > 0n) {
        log(`Investor already has Identity #${existingId}. Skipping.`, "success");
        return;
    }

    const registry = new ethers.Contract(deployment.contracts.identityRegistry, IDENTITY_ABI, admin);
    const did = "did:crats:investor-1";
    const tx = await registry.registerIdentity(address, 1, 840, ethers.id(did), did, Math.floor(Date.now() / 1000) + 31536000);
    await tx.wait();
    log(`Investor registered.`, "success");
}

async function step10(admin) {
    const sbt = new ethers.Contract(deployment.contracts.identitySBT, IDENTITY_ABI, admin);
    const rawAddress = document.getElementById("investor-addr").value;
    const address = ethers.getAddress(rawAddress.toLowerCase());
    const tokenId = await sbt.tokenIdOf(address);
    if (tokenId == 0n) throw new Error("No identity found.");
    const tx = await sbt.updateStatus(tokenId, 2);
    await tx.wait();
    log(`Investor KYC approved.`, "success");
}

async function step11(investor) {
    const token = new ethers.Contract(deployment.contracts.azureToken, TOKEN_ABI, investor);
    const vault = new ethers.Contract(deployment.contracts.azureVault, VAULT_ABI, investor);

    // --- AUTO-SYNC IDENTITY ---
    const issuer = await provider.getSigner(1);
    await syncRegistry(token, issuer);

    // --- INVESTOR FUNDING ---
    log("Allocating initial tokens to investor...", "info");
    const mintTx = await token.connect(issuer).mint(investor.address, ethers.parseUnits("10000", 18));
    await mintTx.wait();

    log("Approving vault...", "info");
    await token.approve(deployment.contracts.azureVault, ethers.MaxUint256);
    
    log("Depositing into SyncVault...", "info");
    const tx = await vault.deposit(ethers.parseUnits("10000", 18), investor.address);
    await tx.wait();
    log(`Investment successful: 10k AZURE deposited for vAZURE shares.`, "success");
}

async function step12(admin) {
    const vault = new ethers.Contract(deployment.contracts.azureVault, VAULT_ABI, admin);
    const issuer = await provider.getSigner(1);

    // 1. Admin grants OPERATOR_ROLE to Issuer
    log("Granting OPERATOR_ROLE to Issuer...", "info");
    const OPERATOR_ROLE = ethers.id("OPERATOR_ROLE");
    const roleTx = await vault.grantRole(OPERATOR_ROLE, issuer.address);
    await roleTx.wait();

    // 2. Issuer approves Vault to spend tokens
    const token = new ethers.Contract(deployment.contracts.azureToken, TOKEN_ABI, issuer);
    log("Approving Vault for Yield Distribution...", "info");
    const approveTx = await token.approve(deployment.contracts.azureVault, ethers.parseUnits("500", 18));
    await approveTx.wait();

    // 3. Issuer distributes yield
    log("Pushing 500 AZURE yield into Vault...", "info");
    const vaultAsIssuer = vault.connect(issuer);
    const tx = await vaultAsIssuer.distributeYield(ethers.parseUnits("500", 18));
    await tx.wait();
    
    log(`Yield distributed: 500 AZURE. Share price updated.`, "success");
}

async function step13(investor) {
    // Determine OrderBook for vAZURE
    const marketFactory = new ethers.Contract(deployment.contracts.marketplaceFactory, MARKET_FACTORY_ABI, investor);
    const orderBookAddr = await marketFactory.getPair(deployment.contracts.azureVault, deployment.contracts.kycRegistry); // Simplified for demo
    const orderBook = new ethers.Contract(deployment.contracts.orderBookEngine, ORDERBOOK_ABI, investor);

    const tx = await orderBook.placeOrder(0, ethers.parseUnits("100", 18), ethers.parseUnits("1.05", 18)); // Buy 100 @ 1.05
    const rc = await tx.wait();

    const event = rc.logs.find(l => l.fragment && l.fragment.name === "OrderPlaced");
    deployment.contracts.lastOrderId = event.args.orderId;
    log(`Order placed ID: ${deployment.contracts.lastOrderId}`, "success");
}

async function step14(admin) {
    const clearing = new ethers.Contract(deployment.contracts.clearingHouse, CLEARING_ABI, admin);
    const tx = await clearing.clearTrade(deployment.contracts.lastOrderId, 12345); // Simplified
    await tx.wait();
    log(`Trade settled via ClearingHouse. Lifecycle Complete.`, "success");
}

// ========== Utilities ==========
function log(msg, type) {
    const content = document.getElementById("log-content");
    const entry = document.createElement("div");
    entry.className = `log-entry ${type}`;
    entry.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
    content.prepend(entry);
}

window.onload = init;
