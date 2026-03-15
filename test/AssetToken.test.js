const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");

describe("AssetToken", function () {
  const INITIAL_SUPPLY = ethers.parseEther("1000000");
  const INITIAL_NAV = ethers.parseEther("100");

  async function deployAssetTokenFixture() {
    const [owner, operator, regulator, complianceManager, kycProvider, investor1, investor2] = await ethers.getSigners();

    // Deploy KYCProvidersRegistry (Layer 1)
    const KYCRegistry = await ethers.getContractFactory("KYCProvidersRegistry");
    const kycRegistry = await KYCRegistry.deploy();

    // Deploy IdentitySBT (Layer 1)
    const IdentitySBT = await ethers.getContractFactory("IdentitySBT");
    const identitySBT = await IdentitySBT.deploy(owner.address, await kycRegistry.getAddress());

    // Deploy IdentityRegistry (Layer 1)
    const IdentityRegistry = await ethers.getContractFactory("IdentityRegistry");
    const identityRegistry = await IdentityRegistry.deploy(
      owner.address,
      await identitySBT.getAddress(),
      await kycRegistry.getAddress()
    );

    // Deploy ComplianceModule (Layer 1)
    const ComplianceModule = await ethers.getContractFactory("ComplianceModule");
    const complianceModule = await ComplianceModule.deploy(
      owner.address,
      await identityRegistry.getAddress()
    );

    // Deploy CircuitBreakerModule (Layer 2)
    const CircuitBreakerModule = await ethers.getContractFactory("CircuitBreakerModule");
    const circuitBreaker = await CircuitBreakerModule.deploy(owner.address);

    // Deploy AssetToken template
    const AssetToken = await ethers.getContractFactory("AssetToken");
    const assetToken = await AssetToken.deploy(
      "Test Asset Token",
      "TST",
      owner.address
    );

    // Grant roles
    const OPERATOR_ROLE = ethers.id("OPERATOR_ROLE");
    const COMPLIANCE_ROLE = ethers.id("COMPLIANCE_ROLE");
    const REGULATOR_ROLE = ethers.id("REGULATOR_ROLE");

    await assetToken.grantRole(OPERATOR_ROLE, operator.address);
    await assetToken.grantRole(COMPLIANCE_ROLE, complianceManager.address);
    await assetToken.grantRole(REGULATOR_ROLE, regulator.address);

    // Configure dependencies
    await assetToken.setIdentityRegistry(await identityRegistry.getAddress());
    await assetToken.setComplianceModule(await complianceModule.getAddress());
    await assetToken.setCircuitBreaker(await circuitBreaker.getAddress());

    // Grant IDENTITY_MANAGER_ROLE to IdentityRegistry
    const IDENTITY_MANAGER_ROLE = ethers.id("IDENTITY_MANAGER_ROLE");
    await identitySBT.grantRole(IDENTITY_MANAGER_ROLE, await identityRegistry.getAddress());

    // Register and approve KYC provider
    await kycRegistry.registerProvider(kycProvider.address, "Test KYC Provider");
    await kycRegistry.approveProvider(kycProvider.address);

    return {
      assetToken,
      identityRegistry,
      identitySBT,
      kycRegistry,
      complianceModule,
      circuitBreaker,
      owner,
      operator,
      regulator,
      complianceManager,
      kycProvider,
      investor1,
      investor2
    };
  }

  async function registerIdentity(identityRegistry, kycProvider, user, role = 1) {
    const chainAddresses = [{
      chainId: 1,
      wallet: user.address,
      isActive: true,
      addedAt: 0
    }];

    const didHash = ethers.id("did-document-" + user.address);
    const did = "did:crats:" + user.address.slice(2);

    await identityRegistry.connect(kycProvider).registerIdentity(
      user.address,
      didHash,
      did,
      chainAddresses,
      role,
      840,
      false
    );
  }

  describe("Deployment", function () {
    it("Should deploy successfully", async function () {
      const { assetToken } = await loadFixture(deployAssetTokenFixture);
      expect(await assetToken.name()).to.equal("Test Asset Token");
      expect(await assetToken.symbol()).to.equal("TST");
    });

    it("Should set the right owner", async function () {
      const { assetToken, owner } = await loadFixture(deployAssetTokenFixture);
      expect(await assetToken.hasRole(await assetToken.DEFAULT_ADMIN_ROLE(), owner.address)).to.be.true;
    });

    it("Should have correct version", async function () {
      const { assetToken } = await loadFixture(deployAssetTokenFixture);
      const version = await assetToken.version();
      expect(version).to.equal("3.0.0");
    });
  });

  describe("Minting", function () {
    it("Should mint tokens to verified investor", async function () {
      const { assetToken, operator, investor1, identityRegistry, kycProvider } = await loadFixture(deployAssetTokenFixture);

      await registerIdentity(identityRegistry, kycProvider, investor1);

      const amount = ethers.parseEther("1000");
      await expect(
        assetToken.connect(operator).mint(investor1.address, amount)
      ).to.emit(assetToken, "TokensMinted");

      expect(await assetToken.balanceOf(investor1.address)).to.equal(amount);
    });

    it("Should fail to mint to zero address", async function () {
      const { assetToken, operator } = await loadFixture(deployAssetTokenFixture);
      
      await expect(
        assetToken.connect(operator).mint(ethers.ZeroAddress, ethers.parseEther("1000"))
      ).to.be.revertedWith("AssetToken: Mint to zero address");
    });

    it("Should fail to mint to unverified investor", async function () {
      const { assetToken, operator, investor1 } = await loadFixture(deployAssetTokenFixture);
      
      await expect(
        assetToken.connect(operator).mint(investor1.address, ethers.parseEther("1000"))
      ).to.be.revertedWith("AssetToken: Recipient not verified");
    });

    it("Should fail when non-operator tries to mint", async function () {
      const { assetToken, investor1 } = await loadFixture(deployAssetTokenFixture);
      
      await expect(
        assetToken.connect(investor1).mint(investor1.address, ethers.parseEther("1000"))
      ).to.be.reverted;
    });

    it("Should track total minted", async function () {
      const { assetToken, operator, investor1, identityRegistry, kycProvider } = await loadFixture(deployAssetTokenFixture);

      await registerIdentity(identityRegistry, kycProvider, investor1);

      await assetToken.connect(operator).mint(investor1.address, ethers.parseEther("1000"));
      await assetToken.connect(operator).mint(investor1.address, ethers.parseEther("500"));

      expect(await assetToken.totalMinted()).to.equal(ethers.parseEther("1500"));
    });
  });

  describe("Burning", function () {
    it("Should burn tokens", async function () {
      const { assetToken, operator, investor1, identityRegistry, kycProvider } = await loadFixture(deployAssetTokenFixture);

      await registerIdentity(identityRegistry, kycProvider, investor1);
      await assetToken.connect(operator).mint(investor1.address, ethers.parseEther("1000"));

      await expect(
        assetToken.connect(investor1).burn(ethers.parseEther("100"))
      ).to.emit(assetToken, "TokensBurned");

      expect(await assetToken.balanceOf(investor1.address)).to.equal(ethers.parseEther("900"));
    });

    it("Should burn from with allowance", async function () {
      const { assetToken, operator, investor1, investor2, identityRegistry, kycProvider } = await loadFixture(deployAssetTokenFixture);

      await registerIdentity(identityRegistry, kycProvider, investor1);
      await registerIdentity(identityRegistry, kycProvider, investor2);
      
      await assetToken.connect(operator).mint(investor1.address, ethers.parseEther("1000"));
      await assetToken.connect(investor1).approve(investor2.address, ethers.parseEther("100"));

      await expect(
        assetToken.connect(investor2).burnFrom(investor1.address, ethers.parseEther("100"))
      ).to.emit(assetToken, "TokensBurned");
    });

    it("Should track total burned", async function () {
      const { assetToken, operator, investor1, identityRegistry, kycProvider } = await loadFixture(deployAssetTokenFixture);

      await registerIdentity(identityRegistry, kycProvider, investor1);
      await assetToken.connect(operator).mint(investor1.address, ethers.parseEther("1000"));
      await assetToken.connect(investor1).burn(ethers.parseEther("100"));

      expect(await assetToken.totalBurned()).to.equal(ethers.parseEther("100"));
    });
  });

  describe("Force Transfer (ERC-7518)", function () {
    it("Should force transfer tokens", async function () {
      const { assetToken, operator, regulator, investor1, investor2, identityRegistry, kycProvider } = await loadFixture(deployAssetTokenFixture);

      await registerIdentity(identityRegistry, kycProvider, investor1);
      await registerIdentity(identityRegistry, kycProvider, investor2);
      
      await assetToken.connect(operator).mint(investor1.address, ethers.parseEther("1000"));

      const reasonCode = ethers.id("SANCTION");
      const evidence = ethers.toUtf8Bytes("Court order #12345");

      await expect(
        assetToken.connect(regulator).forceTransfer(
          investor1.address,
          investor2.address,
          ethers.parseEther("500"),
          reasonCode,
          evidence
        )
      ).to.emit(assetToken, "ForceTransferred");

      expect(await assetToken.balanceOf(investor2.address)).to.equal(ethers.parseEther("500"));
    });

    it("Should fail force transfer with insufficient balance", async function () {
      const { assetToken, operator, regulator, investor1, investor2, identityRegistry, kycProvider } = await loadFixture(deployAssetTokenFixture);

      await registerIdentity(identityRegistry, kycProvider, investor1);
      await registerIdentity(identityRegistry, kycProvider, investor2);
      
      await assetToken.connect(operator).mint(investor1.address, ethers.parseEther("100"));

      const reasonCode = ethers.id("SANCTION");
      
      await expect(
        assetToken.connect(regulator).forceTransfer(
          investor1.address,
          investor2.address,
          ethers.parseEther("500"),
          reasonCode,
          ethers.toUtf8Bytes("evidence")
        )
      ).to.be.revertedWith("AssetToken: Insufficient balance");
    });

    it("Should fail force transfer with invalid reason code", async function () {
      const { assetToken, operator, regulator, investor1, investor2, identityRegistry, kycProvider } = await loadFixture(deployAssetTokenFixture);

      await registerIdentity(identityRegistry, kycProvider, investor1);
      await registerIdentity(identityRegistry, kycProvider, investor2);
      
      await assetToken.connect(operator).mint(investor1.address, ethers.parseEther("1000"));

      const invalidReasonCode = ethers.id("INVALID_REASON");
      
      await expect(
        assetToken.connect(regulator).forceTransfer(
          investor1.address,
          investor2.address,
          ethers.parseEther("100"),
          invalidReasonCode,
          ethers.toUtf8Bytes("evidence")
        )
      ).to.be.revertedWith("AssetToken: Invalid reason code");
    });

    it("Should track force transfer history", async function () {
      const { assetToken, operator, regulator, investor1, investor2, identityRegistry, kycProvider } = await loadFixture(deployAssetTokenFixture);

      await registerIdentity(identityRegistry, kycProvider, investor1);
      await registerIdentity(identityRegistry, kycProvider, investor2);
      
      await assetToken.connect(operator).mint(investor1.address, ethers.parseEther("1000"));

      const reasonCode = ethers.id("SANCTION");
      await assetToken.connect(regulator).forceTransfer(
        investor1.address,
        investor2.address,
        ethers.parseEther("500"),
        reasonCode,
        ethers.toUtf8Bytes("evidence")
      );

      expect(await assetToken.getForceTransferCount()).to.equal(1);
    });

    it("Should fail force transfer when non-regulator tries", async function () {
      const { assetToken, operator, investor1, investor2, identityRegistry, kycProvider } = await loadFixture(deployAssetTokenFixture);

      await registerIdentity(identityRegistry, kycProvider, investor1);
      await registerIdentity(identityRegistry, kycProvider, investor2);
      
      await assetToken.connect(operator).mint(investor1.address, ethers.parseEther("1000"));

      await expect(
        assetToken.connect(operator).forceTransfer(
          investor1.address,
          investor2.address,
          ethers.parseEther("100"),
          ethers.id("SANCTION"),
          ethers.toUtf8Bytes("evidence")
        )
      ).to.be.reverted;
    });
  });

  describe("Freeze/Unfreeze", function () {
    it("Should freeze address", async function () {
      const { assetToken, complianceManager, investor1, identityRegistry, kycProvider } = await loadFixture(deployAssetTokenFixture);

      await registerIdentity(identityRegistry, kycProvider, investor1);

      await expect(
        assetToken.connect(complianceManager).freezeAddress(investor1.address)
      ).to.emit(assetToken, "AddressFrozen");

      expect(await assetToken.isFrozen(investor1.address)).to.be.true;
    });

    it("Should unfreeze address", async function () {
      const { assetToken, complianceManager, investor1, identityRegistry, kycProvider } = await loadFixture(deployAssetTokenFixture);

      await registerIdentity(identityRegistry, kycProvider, investor1);
      await assetToken.connect(complianceManager).freezeAddress(investor1.address);

      await expect(
        assetToken.connect(complianceManager).unfreezeAddress(investor1.address)
      ).to.emit(assetToken, "AddressFrozen");

      expect(await assetToken.isFrozen(investor1.address)).to.be.false;
    });

    it("Should prevent transfer from frozen address", async function () {
      const { assetToken, operator, complianceManager, investor1, investor2, identityRegistry, kycProvider } = await loadFixture(deployAssetTokenFixture);

      await registerIdentity(identityRegistry, kycProvider, investor1);
      await registerIdentity(identityRegistry, kycProvider, investor2);
      
      await assetToken.connect(operator).mint(investor1.address, ethers.parseEther("1000"));
      await assetToken.connect(complianceManager).freezeAddress(investor1.address);

      await expect(
        assetToken.connect(investor1).transfer(investor2.address, ethers.parseEther("100"))
      ).to.be.revertedWith("AssetToken: Sender frozen");
    });

    it("Should prevent transfer to frozen address", async function () {
      const { assetToken, operator, complianceManager, investor1, investor2, identityRegistry, kycProvider } = await loadFixture(deployAssetTokenFixture);

      await registerIdentity(identityRegistry, kycProvider, investor1);
      await registerIdentity(identityRegistry, kycProvider, investor2);
      
      await assetToken.connect(operator).mint(investor1.address, ethers.parseEther("1000"));
      await assetToken.connect(complianceManager).freezeAddress(investor2.address);

      await expect(
        assetToken.connect(investor1).transfer(investor2.address, ethers.parseEther("100"))
      ).to.be.revertedWith("AssetToken: Recipient frozen");
    });
  });

  describe("Trading Halt", function () {
    it("Should halt trading", async function () {
      const { assetToken, regulator } = await loadFixture(deployAssetTokenFixture);

      await expect(
        assetToken.connect(regulator).haltTrading(ethers.id("Emergency"))
      ).to.emit(assetToken, "TradingHalted");

      expect(await assetToken.isTradingHalted()).to.be.true;
    });

    it("Should resume trading", async function () {
      const { assetToken, regulator } = await loadFixture(deployAssetTokenFixture);

      await assetToken.connect(regulator).haltTrading(ethers.id("Emergency"));
      
      await expect(
        assetToken.connect(regulator).resumeTrading()
      ).to.emit(assetToken, "TradingResumed");

      expect(await assetToken.isTradingHalted()).to.be.false;
    });

    it("Should prevent transfer when trading halted", async function () {
      const { assetToken, operator, regulator, investor1, investor2, identityRegistry, kycProvider } = await loadFixture(deployAssetTokenFixture);

      await registerIdentity(identityRegistry, kycProvider, investor1);
      await registerIdentity(identityRegistry, kycProvider, investor2);
      
      await assetToken.connect(operator).mint(investor1.address, ethers.parseEther("1000"));
      await assetToken.connect(regulator).haltTrading(ethers.id("Emergency"));

      await expect(
        assetToken.connect(investor1).transfer(investor2.address, ethers.parseEther("100"))
      ).to.be.revertedWith("AssetToken: Trading halted");
    });
  });

  describe("Price Limits", function () {
    it("Should set price limits", async function () {
      const { assetToken, operator } = await loadFixture(deployAssetTokenFixture);

      await expect(
        assetToken.connect(operator).setPriceLimits(1000, 1000) // 10% up/down
      ).to.emit(assetToken, "PriceLimitsSet");
    });

    it("Should fail with limits too high", async function () {
      const { assetToken, operator } = await loadFixture(deployAssetTokenFixture);

      await expect(
        assetToken.connect(operator).setPriceLimits(6000, 1000) // 60% > 50% max
      ).to.be.revertedWith("AssetToken: Limit up too high");
    });
  });

  describe("Configuration", function () {
    it("Should set identity registry", async function () {
      const { assetToken, owner, identityRegistry } = await loadFixture(deployAssetTokenFixture);
      
      const newRegistry = ethers.Wallet.createRandom().address;
      await assetToken.connect(owner).setIdentityRegistry(newRegistry);
      
      expect(await assetToken.identityRegistry()).to.equal(newRegistry);
    });

    it("Should set compliance module", async function () {
      const { assetToken, owner } = await loadFixture(deployAssetTokenFixture);
      
      const newModule = ethers.Wallet.createRandom().address;
      await assetToken.connect(owner).setComplianceModule(newModule);
      
      expect(await assetToken.complianceModule()).to.equal(newModule);
    });

    it("Should set circuit breaker", async function () {
      const { assetToken, owner } = await loadFixture(deployAssetTokenFixture);
      
      const newCircuitBreaker = ethers.Wallet.createRandom().address;
      await assetToken.connect(owner).setCircuitBreaker(newCircuitBreaker);
      
      expect(await assetToken.circuitBreaker()).to.equal(newCircuitBreaker);
    });
  });

  describe("Soulbound (Non-transferable)", function () {
    it("Should allow transfer to verified investor", async function () {
      const { assetToken, operator, investor1, investor2, identityRegistry, kycProvider } = await loadFixture(deployAssetTokenFixture);

      await registerIdentity(identityRegistry, kycProvider, investor1);
      await registerIdentity(identityRegistry, kycProvider, investor2);
      
      await assetToken.connect(operator).mint(investor1.address, ethers.parseEther("1000"));

      // Transfer should work between verified investors
      await expect(
        assetToken.connect(investor1).transfer(investor2.address, ethers.parseEther("100"))
      ).to.not.be.reverted;
    });
  });
});
