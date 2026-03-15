const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");

describe("IdentitySBT", function () {
  const CHAIN_ID_ETH = 1;
  const CHAIN_ID_POLYGON = 137;
  const JURISDICTION_US = 840;
  const JURISDICTION_UK = 826;

  async function deployIdentitySBTFixture() {
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

    return { identitySBT, kycRegistry, owner, kycProvider, user1, user2, regulator };
  }

  async function mintIdentity(identitySBT, kycProvider, user, role = 1) {
    const chainAddresses = [{
      chainId: CHAIN_ID_ETH,
      wallet: user.address,
      isActive: true,
      addedAt: 0
    }];

    const didHash = ethers.id("did-document-" + user.address);
    const did = "did:crats:" + user.address.slice(2);

    await identitySBT.connect(kycProvider).mintIdentity(
      user.address,
      didHash,
      did,
      chainAddresses,
      role,
      JURISDICTION_US,
      false
    );
  }

  describe("Deployment", function () {
    it("Should deploy successfully", async function () {
      const { identitySBT, owner } = await loadFixture(deployIdentitySBTFixture);
      expect(await identitySBT.name()).to.equal("CRATS Identity");
      expect(await identitySBT.symbol()).to.equal("CRATS-ID");
    });

    it("Should set the right owner", async function () {
      const { identitySBT, owner } = await loadFixture(deployIdentitySBTFixture);
      expect(await identitySBT.hasRole(await identitySBT.DEFAULT_ADMIN_ROLE(), owner.address)).to.be.true;
    });
  });

  describe("Minting Identity", function () {
    it("Should mint a new identity SBT", async function () {
      const { identitySBT, kycProvider, user1 } = await loadFixture(deployIdentitySBTFixture);

      await mintIdentity(identitySBT, kycProvider, user1);

      const tokenId = await identitySBT.getTokenId(user1.address);
      expect(tokenId).to.be.greaterThan(0);

      const identity = await identitySBT.getIdentityData(tokenId);
      expect(identity.role).to.equal(1); // Investor
      expect(identity.jurisdiction).to.equal(JURISDICTION_US);
      expect(identity.status).to.equal(2); // Verified
    });

    it("Should fail to mint to zero address", async function () {
      const { identitySBT, kycProvider } = await loadFixture(deployIdentitySBTFixture);

      const chainAddresses = [{
        chainId: CHAIN_ID_ETH,
        wallet: ethers.ZeroAddress,
        isActive: true,
        addedAt: 0
      }];

      await expect(
        identitySBT.connect(kycProvider).mintIdentity(
          ethers.ZeroAddress,
          ethers.ZeroHash,
          "did:crats:0",
          chainAddresses,
          1,
          JURISDICTION_US,
          false
        )
      ).to.be.revertedWith("IdentitySBT: Cannot mint to zero address");
    });

    it("Should fail to mint if wallet already has identity", async function () {
      const { identitySBT, kycProvider, user1 } = await loadFixture(deployIdentitySBTFixture);

      await mintIdentity(identitySBT, kycProvider, user1);

      await expect(mintIdentity(identitySBT, kycProvider, user1))
        .to.be.revertedWith("IdentitySBT: Wallet already has identity");
    });

    it("Should fail to mint without chain addresses", async function () {
      const { identitySBT, kycProvider, user1 } = await loadFixture(deployIdentitySBTFixture);

      await expect(
        identitySBT.connect(kycProvider).mintIdentity(
          user1.address,
          ethers.ZeroHash,
          "did:crats:test",
          [],
          1,
          JURISDICTION_US,
          false
        )
      ).to.be.revertedWith("IdentitySBT: Must have at least one chain address");
    });

    it("Should fail to mint with invalid jurisdiction", async function () {
      const { identitySBT, kycProvider, user1 } = await loadFixture(deployIdentitySBTFixture);

      const chainAddresses = [{
        chainId: CHAIN_ID_ETH,
        wallet: user1.address,
        isActive: true,
        addedAt: 0
      }];

      await expect(
        identitySBT.connect(kycProvider).mintIdentity(
          user1.address,
          ethers.ZeroHash,
          "did:crats:test",
          chainAddresses,
          1,
          0, // Invalid jurisdiction
          false
        )
      ).to.be.revertedWith("IdentitySBT: Invalid jurisdiction");
    });

    it("Should fail when non-KYC provider tries to mint", async function () {
      const { identitySBT, user1, user2 } = await loadFixture(deployIdentitySBTFixture);

      const chainAddresses = [{
        chainId: CHAIN_ID_ETH,
        wallet: user2.address,
        isActive: true,
        addedAt: 0
      }];

      await expect(
        identitySBT.connect(user1).mintIdentity(
          user2.address,
          ethers.ZeroHash,
          "did:crats:test",
          chainAddresses,
          1,
          JURISDICTION_US,
          false
        )
      ).to.be.reverted; // Reverts with "Caller is not authorized"
    });
  });

  describe("Soulbound (Non-transferable)", function () {
    it("Should prevent transferFrom", async function () {
      const { identitySBT, kycProvider, user1, user2 } = await loadFixture(deployIdentitySBTFixture);

      await mintIdentity(identitySBT, kycProvider, user1);

      const tokenId = await identitySBT.getTokenId(user1.address);

      await expect(
        identitySBT.connect(user1).transferFrom(user1.address, user2.address, tokenId)
      ).to.be.revertedWith("IdentitySBT: Transfers not allowed (soulbound)");
    });

    it("Should prevent safeTransferFrom", async function () {
      const { identitySBT, kycProvider, user1, user2 } = await loadFixture(deployIdentitySBTFixture);

      await mintIdentity(identitySBT, kycProvider, user1);

      const tokenId = await identitySBT.getTokenId(user1.address);

      await expect(
        identitySBT.connect(user1).safeTransferFrom(user1.address, user2.address, tokenId)
      ).to.be.revertedWith("IdentitySBT: Transfers not allowed (soulbound)");
    });

    it("Should prevent transfer via _update override", async function () {
      const { identitySBT, kycProvider, user1, user2 } = await loadFixture(deployIdentitySBTFixture);

      await mintIdentity(identitySBT, kycProvider, user1);

      const tokenId = await identitySBT.getTokenId(user1.address);

      // Try to transfer - should fail because _update is overridden
      await expect(
        identitySBT.connect(user1).transferFrom(user1.address, user2.address, tokenId)
      ).to.be.reverted;
    });
  });

  describe("Add Chain Address", function () {
    it("Should add a new chain address to identity", async function () {
      const { identitySBT, kycProvider, user1 } = await loadFixture(deployIdentitySBTFixture);

      await mintIdentity(identitySBT, kycProvider, user1);

      const tokenId = await identitySBT.getTokenId(user1.address);

      await identitySBT.connect(kycProvider).addChainAddress(
        tokenId,
        CHAIN_ID_POLYGON,
        user1.address
      );

      const chainAddresses = await identitySBT.getChainAddresses(tokenId);
      expect(chainAddresses.length).to.equal(2);
      expect(chainAddresses[1].chainId).to.equal(CHAIN_ID_POLYGON);
    });

    it("Should fail to add duplicate chain", async function () {
      const { identitySBT, kycProvider, user1 } = await loadFixture(deployIdentitySBTFixture);

      await mintIdentity(identitySBT, kycProvider, user1);

      const tokenId = await identitySBT.getTokenId(user1.address);

      await expect(
        identitySBT.connect(kycProvider).addChainAddress(
          tokenId,
          CHAIN_ID_ETH,
          user1.address
        )
      ).to.be.revertedWith("IdentitySBT: Chain already exists");
    });

    it("Should fail when non-authorized tries to add chain address", async function () {
      const { identitySBT, kycProvider, user1, user2 } = await loadFixture(deployIdentitySBTFixture);

      await mintIdentity(identitySBT, kycProvider, user1);

      const tokenId = await identitySBT.getTokenId(user1.address);

      await expect(
        identitySBT.connect(user2).addChainAddress(
          tokenId,
          CHAIN_ID_POLYGON,
          user1.address
        )
      ).to.be.revertedWith("IdentitySBT: Caller is not authorized");
    });
  });

  describe("Update Role", function () {
    it("Should update investor role", async function () {
      const { identitySBT, kycProvider, user1 } = await loadFixture(deployIdentitySBTFixture);

      await mintIdentity(identitySBT, kycProvider, user1, 1); // Investor

      const tokenId = await identitySBT.getTokenId(user1.address);

      await identitySBT.connect(kycProvider).updateRole(tokenId, 2); // Qualified

      const identity = await identitySBT.getIdentityData(tokenId);
      expect(identity.role).to.equal(2);
    });

    it("Should emit RoleUpdated event", async function () {
      const { identitySBT, kycProvider, user1 } = await loadFixture(deployIdentitySBTFixture);

      await mintIdentity(identitySBT, kycProvider, user1, 1);

      const tokenId = await identitySBT.getTokenId(user1.address);

      await expect(identitySBT.connect(kycProvider).updateRole(tokenId, 2))
        .to.emit(identitySBT, "RoleUpdated")
        .withArgs(tokenId, 1, 2);
    });
  });

  describe("Update Jurisdiction", function () {
    it("Should update jurisdiction", async function () {
      const { identitySBT, kycProvider, user1 } = await loadFixture(deployIdentitySBTFixture);

      await mintIdentity(identitySBT, kycProvider, user1);

      const tokenId = await identitySBT.getTokenId(user1.address);

      await identitySBT.connect(kycProvider).updateJurisdiction(tokenId, JURISDICTION_UK);

      const identity = await identitySBT.getIdentityData(tokenId);
      expect(identity.jurisdiction).to.equal(JURISDICTION_UK);
    });

    it("Should fail to update to invalid jurisdiction", async function () {
      const { identitySBT, kycProvider, user1 } = await loadFixture(deployIdentitySBTFixture);

      await mintIdentity(identitySBT, kycProvider, user1);

      const tokenId = await identitySBT.getTokenId(user1.address);

      await expect(
        identitySBT.connect(kycProvider).updateJurisdiction(tokenId, 0)
      ).to.be.revertedWith("IdentitySBT: Invalid jurisdiction");
    });
  });

  describe("Freeze/Unfreeze Identity", function () {
    it("Should freeze an identity", async function () {
      const { identitySBT, kycProvider, user1 } = await loadFixture(deployIdentitySBTFixture);

      await mintIdentity(identitySBT, kycProvider, user1);

      const tokenId = await identitySBT.getTokenId(user1.address);

      await identitySBT.connect(kycProvider).freezeIdentity(tokenId);

      const identity = await identitySBT.getIdentityData(tokenId);
      expect(identity.isFrozen).to.be.true;
    });

    it("Should unfreeze an identity", async function () {
      const { identitySBT, kycProvider, user1 } = await loadFixture(deployIdentitySBTFixture);

      await mintIdentity(identitySBT, kycProvider, user1);

      const tokenId = await identitySBT.getTokenId(user1.address);

      await identitySBT.connect(kycProvider).freezeIdentity(tokenId);
      await identitySBT.connect(kycProvider).unfreezeIdentity(tokenId);

      const identity = await identitySBT.getIdentityData(tokenId);
      expect(identity.isFrozen).to.be.false;
    });

    it("Should return false for isVerified when frozen", async function () {
      const { identitySBT, kycProvider, user1 } = await loadFixture(deployIdentitySBTFixture);

      await mintIdentity(identitySBT, kycProvider, user1);

      const tokenId = await identitySBT.getTokenId(user1.address);

      expect(await identitySBT.isVerified(tokenId)).to.be.true;

      await identitySBT.connect(kycProvider).freezeIdentity(tokenId);

      expect(await identitySBT.isVerified(tokenId)).to.be.false;
    });
  });

  describe("Revoke Identity", function () {
    it("Should revoke (burn) an identity", async function () {
      const { identitySBT, kycProvider, user1 } = await loadFixture(deployIdentitySBTFixture);

      await mintIdentity(identitySBT, kycProvider, user1);

      const tokenId = await identitySBT.getTokenId(user1.address);

      await identitySBT.connect(kycProvider).revokeIdentity(tokenId);

      const identity = await identitySBT.getIdentityData(tokenId);
      expect(identity.status).to.equal(4); // Revoked
    });

    it("Should emit IdentityRevoked event", async function () {
      const { identitySBT, kycProvider, user1 } = await loadFixture(deployIdentitySBTFixture);

      await mintIdentity(identitySBT, kycProvider, user1);

      const tokenId = await identitySBT.getTokenId(user1.address);

      await expect(identitySBT.connect(kycProvider).revokeIdentity(tokenId))
        .to.emit(identitySBT, "IdentityRevoked")
        .withArgs(tokenId);
    });
  });

  describe("Get Total Identities", function () {
    it("Should return correct total identities", async function () {
      const { identitySBT, kycProvider, user1, user2 } = await loadFixture(deployIdentitySBTFixture);

      expect(await identitySBT.getTotalIdentities()).to.equal(0);

      await mintIdentity(identitySBT, kycProvider, user1);
      expect(await identitySBT.getTotalIdentities()).to.equal(1);

      await mintIdentity(identitySBT, kycProvider, user2);
      expect(await identitySBT.getTotalIdentities()).to.equal(2);
    });
  });
});
