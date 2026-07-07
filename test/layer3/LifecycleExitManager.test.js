const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployUpgradeable, registerIdentity, DEFAULT_VALUES } = require("../helpers/fixtures");

describe("Layer 3 - LifecycleExitManager", function () {
    let usdc, assetToken, assetRegistry, compliance, vault, exitManager, identityRegistry;
    let admin, guardian, investor1, investor2, kycProvider;

    const SETTLEMENT_AMOUNT = ethers.parseUnits("1000", 6); // 1000 USDC (6 decimals)
    const INITIAL_SUPPLY = ethers.parseEther("100"); // 100 shares

    beforeEach(async function () {
        [admin, guardian, investor1, investor2, kycProvider] = await ethers.getSigners();

        // 1. Deploy USDC (6 decimals)
        const MockUSDC = await ethers.getContractFactory("MockUSDC");
        usdc = await MockUSDC.deploy();
        await usdc.waitForDeployment();

        // 2. Deploy Layer 1 using deployUpgradeable
        const kycRegistry = await deployUpgradeable("KYCProvidersRegistry", [admin.address]);
        const identitySBT = await deployUpgradeable("IdentitySBT", ["CRATS Identity", "CRATSID", admin.address]);
        identityRegistry = await deployUpgradeable("IdentityRegistry", [
            admin.address,
            await identitySBT.getAddress(),
            await kycRegistry.getAddress()
        ]);
        compliance = await deployUpgradeable("contracts/compliance/Compliance.sol:Compliance", [
            admin.address,
            await identityRegistry.getAddress()
        ]);

        // Setup roles
        const IDENTITY_MANAGER_ROLE = await identitySBT.IDENTITY_MANAGER_ROLE();
        await identitySBT.grantRole(IDENTITY_MANAGER_ROLE, kycProvider.address);

        // Register identities using the fixtures helper
        await registerIdentity(identitySBT, identityRegistry, kycProvider, investor1, DEFAULT_VALUES.jurisdictionUS, DEFAULT_VALUES.roleInvestor);
        await registerIdentity(identitySBT, identityRegistry, kycProvider, investor2, DEFAULT_VALUES.jurisdictionUS, DEFAULT_VALUES.roleInvestor);

        // 4. Deploy AssetRegistry using deployUpgradeable
        assetRegistry = await deployUpgradeable("AssetRegistry", [admin.address]);

        // 5. Deploy AssetToken (18 decimals)
        const AssetToken = await ethers.getContractFactory("AssetToken");
        const tokenImpl = await AssetToken.deploy();
        await tokenImpl.waitForDeployment();

        const circuitBreaker = await deployUpgradeable("contracts/asset/CircuitBreakerModule.sol:CircuitBreakerModule", [admin.address]);

        const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
        const tokenInit = tokenImpl.interface.encodeFunctionData("initialize", [
            "Mock Asset",
            "MKA",
            admin.address,
            await identityRegistry.getAddress(),
            await compliance.getAddress(),
            await circuitBreaker.getAddress()
        ]);
        const tokenProxy = await ERC1967Proxy.deploy(await tokenImpl.getAddress(), tokenInit);
        await tokenProxy.waitForDeployment();
        assetToken = await ethers.getContractAt("AssetToken", await tokenProxy.getAddress());

        // 6. Deploy SyncVault
        const SyncVault = await ethers.getContractFactory("SyncVault");
        const vaultImpl = await SyncVault.deploy();
        await vaultImpl.waitForDeployment();

        const vaultInit = SyncVault.interface.encodeFunctionData("initialize", [
            await assetToken.getAddress(),
            "Sync Vault",
            "sVT",
            admin.address,
            await assetRegistry.getAddress()
        ]);
        const vaultProxy = await ERC1967Proxy.deploy(await vaultImpl.getAddress(), vaultInit);
        await vaultProxy.waitForDeployment();
        vault = await ethers.getContractAt("SyncVault", await vaultProxy.getAddress());

        // Onboard the vault contract itself in the identity registry so it can receive asset tokens
        await registerIdentity(identitySBT, identityRegistry, kycProvider, { address: await vault.getAddress() }, DEFAULT_VALUES.jurisdictionUS, DEFAULT_VALUES.roleInvestor);

        // Register the vault in AssetRegistry so it has VAULT_ROLE to sync owners
        await assetRegistry.connect(admin).registerVault(await assetToken.getAddress(), await vault.getAddress());

        // Configure compliance module on SyncVault
        await vault.connect(admin).setComplianceModule(await compliance.getAddress());

        // Mint initial tokens to investors
        await assetToken.connect(admin).mint(investor1.address, ethers.parseEther("60"));
        await assetToken.connect(admin).mint(investor2.address, ethers.parseEther("40"));

        // Setup vault shares (simulate deposits)
        await assetToken.connect(investor1).approve(await vault.getAddress(), ethers.MaxUint256);
        await assetToken.connect(investor2).approve(await vault.getAddress(), ethers.MaxUint256);

        await vault.connect(investor1).deposit(ethers.parseEther("60"), investor1.address);
        await vault.connect(investor2).deposit(ethers.parseEther("40"), investor2.address);

        // 7. Deploy LifecycleExitManager
        const LifecycleExitManager = await ethers.getContractFactory("LifecycleExitManager");
        const exitImpl = await LifecycleExitManager.deploy();
        await exitImpl.waitForDeployment();

        const exitInit = LifecycleExitManager.interface.encodeFunctionData("initialize", [
            admin.address,
            await usdc.getAddress(),
            await assetRegistry.getAddress()
        ]);
        const exitProxy = await ERC1967Proxy.deploy(await exitImpl.getAddress(), exitInit);
        await exitProxy.waitForDeployment();
        exitManager = await ethers.getContractAt("LifecycleExitManager", await exitProxy.getAddress());

        // Grant GUARDIAN_ROLE to guardian account
        const GUARDIAN_ROLE = await exitManager.GUARDIAN_ROLE();
        await exitManager.grantRole(GUARDIAN_ROLE, guardian.address);

        // Mint USDC to admin for settlement
        await usdc.mint(admin.address, SETTLEMENT_AMOUNT);
        await usdc.connect(admin).approve(await exitManager.getAddress(), SETTLEMENT_AMOUNT);
    });

    describe("Settlement Verification", function () {
        it("Should verify settlement and pull USDC funds", async function () {
            await expect(exitManager.verifySettlement(await vault.getAddress(), SETTLEMENT_AMOUNT))
                .to.emit(exitManager, "SettlementVerified")
                .withArgs(await vault.getAddress(), SETTLEMENT_AMOUNT, anyValue => true);

            const exitInfo = await exitManager.vaultExits(await vault.getAddress());
            expect(exitInfo.status).to.equal(1); // ExitStatus.VERIFIED
            expect(exitInfo.settlementAmount).to.equal(SETTLEMENT_AMOUNT);

            const balance = await usdc.balanceOf(await exitManager.getAddress());
            expect(balance).to.equal(SETTLEMENT_AMOUNT);
        });

        it("Should fail if vault is zero address", async function () {
            await expect(exitManager.verifySettlement(ethers.ZeroAddress, SETTLEMENT_AMOUNT))
                .to.be.revertedWith("LifecycleExitManager: invalid vault");
        });

        it("Should fail if amount is zero", async function () {
            await expect(exitManager.verifySettlement(await vault.getAddress(), 0))
                .to.be.revertedWith("LifecycleExitManager: amount must be positive");
        });
    });

    describe("Guardian Pause and Resume Checkpoint", function () {
        beforeEach(async function () {
            await exitManager.verifySettlement(await vault.getAddress(), SETTLEMENT_AMOUNT);
        });

        it("Should allow guardian to pause exit pre-distribution", async function () {
            await expect(exitManager.connect(guardian).pauseExit(await vault.getAddress()))
                .to.emit(exitManager, "ExitPaused")
                .withArgs(await vault.getAddress(), anyValue => true);

            const exitInfo = await exitManager.vaultExits(await vault.getAddress());
            expect(exitInfo.status).to.equal(2); // ExitStatus.PAUSED
        });

        it("Should prevent execution when paused", async function () {
            await exitManager.connect(guardian).pauseExit(await vault.getAddress());
            await expect(exitManager.executeExit(await vault.getAddress()))
                .to.be.revertedWith("LifecycleExitManager: exit not verified or is paused");
        });

        it("Should allow guardian to resume exit", async function () {
            await exitManager.connect(guardian).pauseExit(await vault.getAddress());
            await expect(exitManager.connect(guardian).resumeExit(await vault.getAddress()))
                .to.emit(exitManager, "ExitResumed")
                .withArgs(await vault.getAddress(), anyValue => true);

            const exitInfo = await exitManager.vaultExits(await vault.getAddress());
            expect(exitInfo.status).to.equal(1); // ExitStatus.VERIFIED
        });
    });

    describe("Exit Execution & Escrow Release", function () {
        beforeEach(async function () {
            await exitManager.verifySettlement(await vault.getAddress(), SETTLEMENT_AMOUNT);

            // Grant roles on vault and token to exit manager so it can burn programmatically
            const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
            await vault.grantRole(DEFAULT_ADMIN_ROLE, await exitManager.getAddress());
            await assetToken.grantRole(DEFAULT_ADMIN_ROLE, await exitManager.getAddress());
        });

        it("Should execute exit and distribute USDC pro-rata", async function () {
            const balance1Before = await usdc.balanceOf(investor1.address);
            const balance2Before = await usdc.balanceOf(investor2.address);

            await expect(exitManager.executeExit(await vault.getAddress()))
                .to.emit(exitManager, "LifecycleExitExecuted")
                .withArgs(await vault.getAddress(), SETTLEMENT_AMOUNT, anyValue => true);

            // Entitlements:
            // investor1: 60% of 1000 USDC = 600 USDC
            // investor2: 40% of 1000 USDC = 400 USDC
            const balance1After = await usdc.balanceOf(investor1.address);
            const balance2After = await usdc.balanceOf(investor2.address);

            expect(balance1After - balance1Before).to.equal(ethers.parseUnits("600", 6));
            expect(balance2After - balance2Before).to.equal(ethers.parseUnits("400", 6));

            // Verify vault is closed
            expect(await vault.isClosed()).to.be.true;

            // Verify shares are burned
            expect(await vault.balanceOf(investor1.address)).to.equal(0);
            expect(await vault.balanceOf(investor2.address)).to.equal(0);

            // Verify asset tokens are burned
            expect(await assetToken.balanceOf(investor1.address)).to.equal(0);
            expect(await assetToken.balanceOf(investor2.address)).to.equal(0);
        });

        it("Should escrow funds for restricted investors", async function () {
            // Grant Compliance role to deployer to restrict holder
            const COMPLIANCE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("COMPLIANCE_ROLE"));
            await compliance.grantRole(COMPLIANCE_ROLE, admin.address);

            const reasonCode = ethers.id("COMPLIANCE_HOLD");
            const evidenceHash = ethers.id("hold_evidence");
            await compliance.restrictHolder(await assetToken.getAddress(), investor2.address, reasonCode, 3600, evidenceHash);

            const balance1Before = await usdc.balanceOf(investor1.address);
            const balance2Before = await usdc.balanceOf(investor2.address);

            await exitManager.executeExit(await vault.getAddress());

            const balance1After = await usdc.balanceOf(investor1.address);
            const balance2After = await usdc.balanceOf(investor2.address);

            // investor1 gets paid directly
            expect(balance1After - balance1Before).to.equal(ethers.parseUnits("600", 6));
            // investor2 gets 0 directly
            expect(balance2After - balance2Before).to.equal(0);

            // Check that investor2 has escrowed funds in the exit manager
            const escrowed = await exitManager.escrowedSettlements(await vault.getAddress(), investor2.address);
            expect(escrowed).to.equal(ethers.parseUnits("400", 6));

            // Try claiming before restriction is lifted - should fail
            await expect(exitManager.connect(investor2).claimEscrow(await vault.getAddress()))
                .to.be.revertedWith("LifecycleExitManager: investor still restricted");

            // Lift restriction
            await compliance.removeRestriction(await assetToken.getAddress(), investor2.address, "clear");

            // Claim escrowed funds
            await expect(exitManager.connect(investor2).claimEscrow(await vault.getAddress()))
                .to.emit(exitManager, "EscrowClaimed")
                .withArgs(await vault.getAddress(), investor2.address, ethers.parseUnits("400", 6));

            const balance2Final = await usdc.balanceOf(investor2.address);
            expect(balance2Final - balance2Before).to.equal(ethers.parseUnits("400", 6));
        });
    });
});
