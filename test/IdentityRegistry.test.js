const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");

describe("IdentityRegistry", function () {
  const CHAIN_ID_ETH = 1;
  const CHAIN_ID_POLYGON = 137;
  const JURISDICTION_US = 840;

  async function deployIdentityRegistryFixture() {
    const [owner, kycProvider, user1, user2, regulator] = await ethers.getSigners();

    // Deploy KYCProvidersRegistry
    const KYCRegistry = await ethers.getContractFactory("KYCProvidersRegistry");
    const kycRegistry = await KYCRegistry.deploy();

    // Register and approve KYC provider
    await kycRegistry.registerProvider(kycProvider.address, "Test KYC Provider");
    await kycRegistry.approveProvider(kycProvider.address);

    // Deploy IdentitySBT
    const IdentitySBT = await ethers.getContractFactory("IdentitySBT");
    const identitySBT = await IdentitySBT.deploy(owner.address, await kycRegistry.getAddress());

    // Deploy IdentityRegistry
    const IdentityRegistry = await ethers.getContractFactory("IdentityRegistry");
    const identityRegistry = await IdentityRegistry.deploy(
      owner.address,
      await identitySBT.getAddress(),
      await kycRegistry.getAddress()
    );

    // Grant regulator role
    const REGULATOR_ROLE = ethers.id("REGULATOR_ROLE");
    await identityRegistry.grantRole(REGULATOR_ROLE, regulator.address);

    // Grant IDENTITY_MANAGER_ROLE to IdentityRegistry so it can call mintIdentity
    const IDENTITY_MANAGER_ROLE = ethers.id("IDENTITY_MANAGER_ROLE");
    await identitySBT.grantRole(IDENTITY_MANAGER_ROLE, await identityRegistry.getAddress());

    return { identityRegistry, identitySBT, kycRegistry, owner, kycProvider, user1, user2, regulator };
  }

  async function registerIdentity(identityRegistry, kycProvider, user, role = 1) {
    const chainAddresses = [{
      chainId: CHAIN_ID_ETH,
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
      JURISDICTION_US,
      false
    );
  }

  async function signAddChainAddressMessage(signer, chainId, newWalletAddress, tokenId) {
    const messageHash = ethers.solidityPackedKeccak256(
      ["string", "uint256", "address", "uint256"],
      ["CRATS:LinkWallet:", chainId, newWalletAddress, tokenId]
    );
    // ECDSA.recover expects the raw hash, not the Ethereum signed version
    const signature = await signer.signMessage(ethers.getBytes(messageHash));
    return signature;
  }

  describe("Deployment", function () {
    it("Should deploy successfully", async function () {
      const { identityRegistry } = await loadFixture(deployIdentityRegistryFixture);
      expect(await identityRegistry.getTotalIdentities()).to.equal(0);
    });
  });

  describe("Register Identity", function () {
    it("Should register a new identity", async function () {
      const { identityRegistry, kycProvider, user1 } = await loadFixture(deployIdentityRegistryFixture);

      await registerIdentity(identityRegistry, kycProvider, user1);

      const tokenId = await identityRegistry.getTokenId(user1.address);
      expect(tokenId).to.be.greaterThan(0);

      const isVerified = await identityRegistry.isVerified(user1.address);
      expect(isVerified).to.be.true;
    });

    it("Should emit IdentityRegistered event", async function () {
      const { identityRegistry, kycProvider, user1 } = await loadFixture(deployIdentityRegistryFixture);

      const didHash = ethers.id("did-document-" + user1.address);

      const chainAddresses = [{
        chainId: CHAIN_ID_ETH,
        wallet: user1.address,
        isActive: true,
        addedAt: 0
      }];

      await expect(
        identityRegistry.connect(kycProvider).registerIdentity(
          user1.address,
          didHash,
          "did:crats:" + user1.address.slice(2),
          chainAddresses,
          1,
          JURISDICTION_US,
          false
        )
      ).to.emit(identityRegistry, "IdentityRegistered");
    });

    it("Should fail to register if wallet already has identity", async function () {
      const { identityRegistry, kycProvider, user1 } = await loadFixture(deployIdentityRegistryFixture);

      await registerIdentity(identityRegistry, kycProvider, user1);

      await expect(
        registerIdentity(identityRegistry, kycProvider, user1)
      ).to.be.revertedWith("IdentityRegistry: Wallet already registered");
    });

    it("Should fail when non-KYC provider tries to register", async function () {
      const { identityRegistry, user1, user2 } = await loadFixture(deployIdentityRegistryFixture);

      const chainAddresses = [{
        chainId: CHAIN_ID_ETH,
        wallet: user2.address,
        isActive: true,
        addedAt: 0
      }];

      await expect(
        identityRegistry.connect(user1).registerIdentity(
          user2.address,
          ethers.ZeroHash,
          "did:crats:test",
          chainAddresses,
          1,
          JURISDICTION_US,
          false
        )
      ).to.be.reverted;
    });
  });

  describe("Is Verified", function () {
    it("Should return false for unregistered wallet", async function () {
      const { identityRegistry, user1 } = await loadFixture(deployIdentityRegistryFixture);

      const isVerified = await identityRegistry.isVerified(user1.address);
      expect(isVerified).to.be.false;
    });

    it("Should return true for verified wallet", async function () {
      const { identityRegistry, kycProvider, user1 } = await loadFixture(deployIdentityRegistryFixture);

      await registerIdentity(identityRegistry, kycProvider, user1);

      const isVerified = await identityRegistry.isVerified(user1.address);
      expect(isVerified).to.be.true;
    });

    it("Should return false for frozen wallet", async function () {
      const { identityRegistry, identitySBT, kycProvider, user1, regulator } = await loadFixture(deployIdentityRegistryFixture);

      await registerIdentity(identityRegistry, kycProvider, user1);

      const tokenId = await identityRegistry.getTokenId(user1.address);
      await identitySBT.connect(kycProvider).freezeIdentity(tokenId);

      const isVerified = await identityRegistry.isVerified(user1.address);
      expect(isVerified).to.be.false;
    });
  });

  describe("Get Identity", function () {
    it("Should return identity data for wallet", async function () {
      const { identityRegistry, kycProvider, user1 } = await loadFixture(deployIdentityRegistryFixture);

      await registerIdentity(identityRegistry, kycProvider, user1);

      const identity = await identityRegistry.getIdentity(user1.address);
      expect(identity.jurisdiction).to.equal(JURISDICTION_US);
      expect(identity.role).to.equal(1);
    });

    it("Should fail for wallet without identity", async function () {
      const { identityRegistry, user1 } = await loadFixture(deployIdentityRegistryFixture);

      await expect(
        identityRegistry.getIdentity(user1.address)
      ).to.be.revertedWith("IdentityRegistry: Wallet has no identity");
    });
  });

  describe("Get Role", function () {
    it("Should return investor role", async function () {
      const { identityRegistry, kycProvider, user1 } = await loadFixture(deployIdentityRegistryFixture);

      await registerIdentity(identityRegistry, kycProvider, user1, 1);

      const role = await identityRegistry.getRole(user1.address);
      expect(role).to.equal(1);
    });

    it("Should return qualified role", async function () {
      const { identityRegistry, kycProvider, user1 } = await loadFixture(deployIdentityRegistryFixture);

      await registerIdentity(identityRegistry, kycProvider, user1, 2);

      const role = await identityRegistry.getRole(user1.address);
      expect(role).to.equal(2);
    });
  });

  describe("Get Jurisdiction", function () {
    it("Should return jurisdiction code", async function () {
      const { identityRegistry, kycProvider, user1 } = await loadFixture(deployIdentityRegistryFixture);

      await registerIdentity(identityRegistry, kycProvider, user1);

      const jurisdiction = await identityRegistry.getJurisdiction(user1.address);
      expect(jurisdiction).to.equal(JURISDICTION_US);
    });
  });

  describe("Freeze Account", function () {
    it("Should freeze an account", async function () {
      const { identityRegistry, kycProvider, user1, regulator } = await loadFixture(deployIdentityRegistryFixture);

      await registerIdentity(identityRegistry, kycProvider, user1);

      await identityRegistry.connect(regulator).freezeAccount(user1.address);

      const isFrozen = await identityRegistry.isFrozen(user1.address);
      expect(isFrozen).to.be.true;
    });

    it("Should emit AccountFrozen event", async function () {
      const { identityRegistry, kycProvider, user1, regulator } = await loadFixture(deployIdentityRegistryFixture);

      await registerIdentity(identityRegistry, kycProvider, user1);

      const tokenId = await identityRegistry.getTokenId(user1.address);

      await expect(identityRegistry.connect(regulator).freezeAccount(user1.address))
        .to.emit(identityRegistry, "AccountFrozen")
        .withArgs(user1.address, tokenId);
    });

    it("Should fail when non-regulator tries to freeze", async function () {
      const { identityRegistry, kycProvider, user1, user2 } = await loadFixture(deployIdentityRegistryFixture);

      await registerIdentity(identityRegistry, kycProvider, user1);

      await expect(
        identityRegistry.connect(user2).freezeAccount(user1.address)
      ).to.be.reverted;
    });
  });

  describe("Unfreeze Account", function () {
    it("Should unfreeze an account", async function () {
      const { identityRegistry, kycProvider, user1, regulator } = await loadFixture(deployIdentityRegistryFixture);

      await registerIdentity(identityRegistry, kycProvider, user1);
      await identityRegistry.connect(regulator).freezeAccount(user1.address);
      await identityRegistry.connect(regulator).unfreezeAccount(user1.address);

      const isFrozen = await identityRegistry.isFrozen(user1.address);
      expect(isFrozen).to.be.false;
    });

    it("Should emit AccountUnfrozen event", async function () {
      const { identityRegistry, kycProvider, user1, regulator } = await loadFixture(deployIdentityRegistryFixture);

      await registerIdentity(identityRegistry, kycProvider, user1);
      await identityRegistry.connect(regulator).freezeAccount(user1.address);

      const tokenId = await identityRegistry.getTokenId(user1.address);

      await expect(identityRegistry.connect(regulator).unfreezeAccount(user1.address))
        .to.emit(identityRegistry, "AccountUnfrozen")
        .withArgs(user1.address, tokenId);
    });
  });

  describe("Update Role", function () {
    it("Should update investor role", async function () {
      const { identityRegistry, kycProvider, user1 } = await loadFixture(deployIdentityRegistryFixture);

      await registerIdentity(identityRegistry, kycProvider, user1, 1);

      await identityRegistry.connect(kycProvider).updateRole(user1.address, 2);

      const role = await identityRegistry.getRole(user1.address);
      expect(role).to.equal(2);
    });
  });

  describe("Update Jurisdiction", function () {
    it("Should update jurisdiction", async function () {
      const { identityRegistry, kycProvider, user1 } = await loadFixture(deployIdentityRegistryFixture);

      await registerIdentity(identityRegistry, kycProvider, user1);

      await identityRegistry.connect(kycProvider).updateJurisdiction(user1.address, 826); // UK

      const jurisdiction = await identityRegistry.getJurisdiction(user1.address);
      expect(jurisdiction).to.equal(826);
    });
  });

  describe("Add Chain Address", function () {
    it("Should add a chain address with valid signature", async function () {
      const { identityRegistry, identitySBT, kycProvider, user1 } = await loadFixture(deployIdentityRegistryFixture);

      await registerIdentity(identityRegistry, kycProvider, user1);

      const tokenId = await identityRegistry.getTokenId(user1.address);

      // Create a new wallet for Polygon
      const polygonWallet = ethers.Wallet.createRandom();

      // Sign the message with the new wallet
      const signature = await signAddChainAddressMessage(
        polygonWallet,
        CHAIN_ID_POLYGON,
        polygonWallet.address,
        tokenId
      );

      // Add chain address
      await identityRegistry.connect(kycProvider).addChainAddress(
        user1.address,
        CHAIN_ID_POLYGON,
        polygonWallet.address,
        signature
      );

      // Verify the chain address was added
      const chainAddresses = await identitySBT.getChainAddresses(tokenId);
      expect(chainAddresses.length).to.equal(2);
      expect(chainAddresses[1].chainId).to.equal(CHAIN_ID_POLYGON);
      expect(chainAddresses[1].wallet).to.equal(polygonWallet.address);
    });

    it("Should fail with invalid signature", async function () {
      const { identityRegistry, kycProvider, user1, user2 } = await loadFixture(deployIdentityRegistryFixture);

      await registerIdentity(identityRegistry, kycProvider, user1);

      const tokenId = await identityRegistry.getTokenId(user1.address);

      // Create a random wallet that will be added
      const polygonWallet = ethers.Wallet.createRandom();

      // user2 signs instead of the polygon wallet - should fail
      const signature = await signAddChainAddressMessage(
        user2,
        CHAIN_ID_POLYGON,
        polygonWallet.address,
        tokenId
      );

      await expect(
        identityRegistry.connect(kycProvider).addChainAddress(
          user1.address,
          CHAIN_ID_POLYGON,
          polygonWallet.address,
          signature
        )
      ).to.be.revertedWith("IdentityRegistry: Invalid signature");
    });

    it("Should fail with zero address", async function () {
      const { identityRegistry, kycProvider, user1 } = await loadFixture(deployIdentityRegistryFixture);

      await registerIdentity(identityRegistry, kycProvider, user1);

      const tokenId = await identityRegistry.getTokenId(user1.address);

      const signature = await signAddChainAddressMessage(
        user1,
        CHAIN_ID_POLYGON,
        ethers.ZeroAddress,
        tokenId
      );

      await expect(
        identityRegistry.connect(kycProvider).addChainAddress(
          user1.address,
          CHAIN_ID_POLYGON,
          ethers.ZeroAddress,
          signature
        )
      ).to.be.revertedWith("IdentityRegistry: Invalid wallet address");
    });

    it("Should fail when adding same wallet as primary", async function () {
      const { identityRegistry, kycProvider, user1 } = await loadFixture(deployIdentityRegistryFixture);

      await registerIdentity(identityRegistry, kycProvider, user1);

      const tokenId = await identityRegistry.getTokenId(user1.address);

      const signature = await signAddChainAddressMessage(
        user1,
        CHAIN_ID_POLYGON,
        user1.address,
        tokenId
      );

      await expect(
        identityRegistry.connect(kycProvider).addChainAddress(
          user1.address,
          CHAIN_ID_POLYGON,
          user1.address,
          signature
        )
      ).to.be.revertedWith("IdentityRegistry: New wallet must be different");
    });
  });

  describe("Get Total Identities", function () {
    it("Should return correct total identities", async function () {
      const { identityRegistry, kycProvider, user1, user2 } = await loadFixture(deployIdentityRegistryFixture);

      expect(await identityRegistry.getTotalIdentities()).to.equal(0);

      await registerIdentity(identityRegistry, kycProvider, user1);
      expect(await identityRegistry.getTotalIdentities()).to.equal(1);

      await registerIdentity(identityRegistry, kycProvider, user2);
      expect(await identityRegistry.getTotalIdentities()).to.equal(2);
    });
  });
});
