const { expect } = require("chai");
const { ethers } = require("hardhat");
const { registerIdentity, DEFAULT_VALUES, deployUpgradeable } = require("../helpers/fixtures");

// CRATSConfig constants
const REGULATOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("REGULATOR_ROLE"));

describe("Layer 1 - IdentitySBT", function () {
  let identitySBT;
  let admin, user1, user2, user3, kycProvider, regulator;

  beforeEach(async function () {
    [admin, user1, user2, user3, , , kycProvider, , regulator] = await ethers.getSigners();
    
    identitySBT = await deployUpgradeable("IdentitySBT", ["CRATS Identity", "CRATSID", admin.address]);
  });

  describe("Initialization", function () {
    it("Should initialize with correct name and symbol", async function () {
      expect(await identitySBT.name()).to.equal("CRATS Identity");
      expect(await identitySBT.symbol()).to.equal("CRATSID");
    });

    it("Should grant admin role to deployer", async function () {
      const DEFAULT_ADMIN_ROLE = await identitySBT.DEFAULT_ADMIN_ROLE();
      expect(await identitySBT.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
    });

    it("Should grant identity manager role to admin", async function () {
      const IDENTITY_MANAGER_ROLE = await identitySBT.IDENTITY_MANAGER_ROLE();
      expect(await identitySBT.hasRole(IDENTITY_MANAGER_ROLE, admin.address)).to.be.true;
    });
  });

  describe("Identity Registration", function () {
    it("Should register identity successfully", async function () {
      const IDENTITY_MANAGER_ROLE = await identitySBT.IDENTITY_MANAGER_ROLE();
      await identitySBT.grantRole(IDENTITY_MANAGER_ROLE, kycProvider.address);

      const didHash = ethers.keccak256(ethers.toUtf8Bytes("did:crats:user1"));
      const expiresAt = Math.floor(Date.now() / 1000) + 63072000;

      const tx = await identitySBT.connect(kycProvider).registerIdentity(
        user1.address,
        DEFAULT_VALUES.roleInvestor,
        DEFAULT_VALUES.jurisdictionUS,
        didHash,
        "did:crats:user1",
        expiresAt
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          const parsed = identitySBT.interface.parseLog(log);
          return parsed.name === "IdentityMinted";
        } catch { return false; }
      });

      expect(event).to.not.be.undefined;
      expect(event.args.role).to.equal(DEFAULT_VALUES.roleInvestor);
      expect(event.args.jurisdiction).to.equal(DEFAULT_VALUES.jurisdictionUS);
    });

    it("Should only allow identity manager to register", async function () {
      const didHash = ethers.keccak256(ethers.toUtf8Bytes("did:crats:user1"));
      const expiresAt = Math.floor(Date.now() / 1000) + 63072000;

      await expect(
        identitySBT.connect(user1).registerIdentity(
          user1.address,
          DEFAULT_VALUES.roleInvestor,
          DEFAULT_VALUES.jurisdictionUS,
          didHash,
          "did:crats:user1",
          expiresAt
        )
      ).to.be.reverted;
    });

    it("Should prevent duplicate identities", async function () {
      const IDENTITY_MANAGER_ROLE = await identitySBT.IDENTITY_MANAGER_ROLE();
      await identitySBT.grantRole(IDENTITY_MANAGER_ROLE, kycProvider.address);

      const didHash = ethers.keccak256(ethers.toUtf8Bytes("did:crats:user1"));
      const expiresAt = Math.floor(Date.now() / 1000) + 63072000;

      await identitySBT.connect(kycProvider).registerIdentity(
        user1.address,
        DEFAULT_VALUES.roleInvestor,
        DEFAULT_VALUES.jurisdictionUS,
        didHash,
        "did:crats:user1",
        expiresAt
      );

      await expect(
        identitySBT.connect(kycProvider).registerIdentity(
          user1.address,
          DEFAULT_VALUES.roleInvestor,
          DEFAULT_VALUES.jurisdictionUS,
          didHash,
          "did:crats:user1",
          expiresAt
        )
      ).to.be.reverted;
    });
  });

  describe("Soulbound Properties", function () {
    beforeEach(async function () {
      await registerIdentity(
        identitySBT,
        null,
        kycProvider,
        user1,
        DEFAULT_VALUES.jurisdictionUS,
        DEFAULT_VALUES.roleInvestor
      );
    });

    it("Should return true for locked() - ERC-5192 compliance", async function () {
      const tokenId = await identitySBT.tokenIdOf(user1.address);
      expect(await identitySBT.locked(tokenId)).to.be.true;
    });

    it("Should prevent transfer of tokens", async function () {
      const tokenId = await identitySBT.tokenIdOf(user1.address);
      
      await expect(
        identitySBT.connect(user1).transferFrom(user1.address, user2.address, tokenId)
      ).to.be.revertedWith("IdentitySBT: soulbound, non-transferable");
    });

    it("Should prevent safe transfer of tokens", async function () {
      const tokenId = await identitySBT.tokenIdOf(user1.address);

      await expect(
        identitySBT.connect(user1).safeTransferFrom(user1.address, user2.address, tokenId)
      ).to.be.revertedWith("IdentitySBT: soulbound, non-transferable");
    });

    // Note: IdentitySBT doesn't have a burn function - soulbound tokens are non-transferable and non-burnable
  });

  describe("Identity Management", function () {
    beforeEach(async function () {
      await registerIdentity(
        identitySBT,
        null,
        kycProvider,
        user1,
        DEFAULT_VALUES.jurisdictionUS,
        DEFAULT_VALUES.roleInvestor
      );
    });

    it("Should update role", async function () {
      const tokenId = await identitySBT.tokenIdOf(user1.address);
      const IDENTITY_MANAGER_ROLE = await identitySBT.IDENTITY_MANAGER_ROLE();
      await identitySBT.grantRole(IDENTITY_MANAGER_ROLE, kycProvider.address);

      await identitySBT.connect(kycProvider).updateRole(tokenId, DEFAULT_VALUES.roleQualified);
      
      const identity = await identitySBT.getIdentity(tokenId);
      expect(identity.role).to.equal(DEFAULT_VALUES.roleQualified);
    });

    it("Should update jurisdiction", async function () {
      const tokenId = await identitySBT.tokenIdOf(user1.address);
      const IDENTITY_MANAGER_ROLE = await identitySBT.IDENTITY_MANAGER_ROLE();
      await identitySBT.grantRole(IDENTITY_MANAGER_ROLE, kycProvider.address);

      await identitySBT.connect(kycProvider).updateJurisdiction(tokenId, DEFAULT_VALUES.jurisdictionUK);
      
      const identity = await identitySBT.getIdentity(tokenId);
      expect(identity.jurisdiction).to.equal(DEFAULT_VALUES.jurisdictionUK);
    });

    it("Should update status", async function () {
      const tokenId = await identitySBT.tokenIdOf(user1.address);
      const IDENTITY_MANAGER_ROLE = await identitySBT.IDENTITY_MANAGER_ROLE();
      await identitySBT.grantRole(IDENTITY_MANAGER_ROLE, kycProvider.address);

      await identitySBT.connect(kycProvider).updateStatus(tokenId, DEFAULT_VALUES.statusSuspended);
      
      const identity = await identitySBT.getIdentity(tokenId);
      expect(identity.status).to.equal(DEFAULT_VALUES.statusSuspended);
    });

    it("Should update expiry", async function () {
      const tokenId = await identitySBT.tokenIdOf(user1.address);
      const IDENTITY_MANAGER_ROLE = await identitySBT.IDENTITY_MANAGER_ROLE();
      await identitySBT.grantRole(IDENTITY_MANAGER_ROLE, kycProvider.address);

      const newExpiry = Math.floor(Date.now() / 1000) + 100000000;
      await identitySBT.connect(kycProvider).updateExpiry(tokenId, newExpiry);
      
      const identity = await identitySBT.getIdentity(tokenId);
      expect(identity.expiresAt).to.equal(newExpiry);
    });

    it("Should freeze identity (regulator only)", async function () {
      const tokenId = await identitySBT.tokenIdOf(user1.address);
      await identitySBT.grantRole(REGULATOR_ROLE, regulator.address);

      await identitySBT.connect(regulator).freeze(tokenId);

      const identity = await identitySBT.getIdentity(tokenId);
      expect(identity.isFrozen).to.be.true;
    });

    it("Should unfreeze identity (regulator only)", async function () {
      const tokenId = await identitySBT.tokenIdOf(user1.address);
      await identitySBT.grantRole(REGULATOR_ROLE, regulator.address);

      await identitySBT.connect(regulator).freeze(tokenId);
      await identitySBT.connect(regulator).unfreeze(tokenId);

      const identity = await identitySBT.getIdentity(tokenId);
      expect(identity.isFrozen).to.be.false;
    });
  });

  describe("Multi-Chain Address Linking", function () {
    beforeEach(async function () {
      await registerIdentity(
        identitySBT,
        null,
        kycProvider,
        user1,
        DEFAULT_VALUES.jurisdictionUS,
        DEFAULT_VALUES.roleInvestor
      );
    });

    it("Should add chain address", async function () {
      const IDENTITY_MANAGER_ROLE = await identitySBT.IDENTITY_MANAGER_ROLE();
      await identitySBT.grantRole(IDENTITY_MANAGER_ROLE, kycProvider.address);

      const chainId = 137; // Polygon
      const tokenId = await identitySBT.tokenIdOf(user1.address);
      
      await identitySBT.connect(kycProvider).addChainAddress(
        tokenId,
        chainId,
        user3.address
      );

      const identity = await identitySBT.getIdentity(tokenId);

      expect(identity.chainAddresses.length).to.equal(2); // Primary + added
      expect(identity.chainAddresses[1].chainId).to.equal(chainId);
      expect(identity.chainAddresses[1].wallet).to.equal(user3.address);
    });

    it("Should prevent linking wallet that already has identity", async function () {
      await registerIdentity(
        identitySBT,
        null,
        kycProvider,
        user2,
        DEFAULT_VALUES.jurisdictionUS,
        DEFAULT_VALUES.roleInvestor
      );

      const IDENTITY_MANAGER_ROLE = await identitySBT.IDENTITY_MANAGER_ROLE();
      await identitySBT.grantRole(IDENTITY_MANAGER_ROLE, kycProvider.address);

      await expect(
        identitySBT.connect(kycProvider).addChainAddress(
          user1.address,
          137,
          user2.address
        )
      ).to.be.reverted;
    });
  });

  describe("Verification Status", function () {
    it("Should return false for unverified wallet", async function () {
      expect(await identitySBT.isVerified(user1.address)).to.be.false;
    });

    it("Should return true for verified wallet", async function () {
      await registerIdentity(
        identitySBT,
        null,
        kycProvider,
        user1,
        DEFAULT_VALUES.jurisdictionUS,
        DEFAULT_VALUES.roleInvestor
      );

      expect(await identitySBT.isVerified(user1.address)).to.be.true;
    });

    it("Should return false for expired identity", async function () {
      const expiredExpiry = Math.floor(Date.now() / 1000) - 1000; // Expired
      await registerIdentity(
        identitySBT,
        null,
        kycProvider,
        user1,
        DEFAULT_VALUES.jurisdictionUS,
        DEFAULT_VALUES.roleInvestor
      );

      const tokenId = await identitySBT.tokenIdOf(user1.address);
      const IDENTITY_MANAGER_ROLE = await identitySBT.IDENTITY_MANAGER_ROLE();
      await identitySBT.grantRole(IDENTITY_MANAGER_ROLE, kycProvider.address);
      await identitySBT.connect(kycProvider).updateExpiry(tokenId, expiredExpiry);

      expect(await identitySBT.isVerified(user1.address)).to.be.false;
    });

    it("Should return false for frozen identity", async function () {
      await registerIdentity(
        identitySBT,
        null,
        kycProvider,
        user1,
        DEFAULT_VALUES.jurisdictionUS,
        DEFAULT_VALUES.roleInvestor
      );

      const tokenId = await identitySBT.tokenIdOf(user1.address);
      await identitySBT.grantRole(REGULATOR_ROLE, regulator.address);
      await identitySBT.connect(regulator).freeze(tokenId);

      expect(await identitySBT.isVerified(user1.address)).to.be.false;
    });

    it("Should return false for revoked identity", async function () {
      await registerIdentity(
        identitySBT,
        null,
        kycProvider,
        user1,
        DEFAULT_VALUES.jurisdictionUS,
        DEFAULT_VALUES.roleInvestor
      );

      const tokenId = await identitySBT.tokenIdOf(user1.address);
      const IDENTITY_MANAGER_ROLE = await identitySBT.IDENTITY_MANAGER_ROLE();
      await identitySBT.grantRole(IDENTITY_MANAGER_ROLE, kycProvider.address);
      await identitySBT.connect(kycProvider).updateStatus(tokenId, DEFAULT_VALUES.statusRevoked);

      expect(await identitySBT.isVerified(user1.address)).to.be.false;
    });
  });

  describe("View Functions", function () {
    it("Should return correct token ID for wallet", async function () {
      await registerIdentity(
        identitySBT,
        null,
        kycProvider,
        user1,
        DEFAULT_VALUES.jurisdictionUS,
        DEFAULT_VALUES.roleInvestor
      );

      const tokenId = await identitySBT.tokenIdOf(user1.address);
      expect(tokenId).to.equal(1);
    });

    it("Should return 0 for wallet without identity", async function () {
      const tokenId = await identitySBT.tokenIdOf(user1.address);
      expect(tokenId).to.equal(0);
    });

    it("Should return identity data", async function () {
      await registerIdentity(
        identitySBT,
        null,
        kycProvider,
        user1,
        DEFAULT_VALUES.jurisdictionUS,
        DEFAULT_VALUES.roleInvestor
      );

      const tokenId = await identitySBT.tokenIdOf(user1.address);
      const identity = await identitySBT.getIdentity(tokenId);

      expect(identity.role).to.equal(DEFAULT_VALUES.roleInvestor);
      expect(identity.jurisdiction).to.equal(DEFAULT_VALUES.jurisdictionUS);
      expect(identity.status).to.equal(DEFAULT_VALUES.statusVerified);
    });

    it("Should return total identity count", async function () {
      await registerIdentity(
        identitySBT,
        null,
        kycProvider,
        user1,
        DEFAULT_VALUES.jurisdictionUS,
        DEFAULT_VALUES.roleInvestor
      );
      await registerIdentity(
        identitySBT,
        null,
        kycProvider,
        user2,
        DEFAULT_VALUES.jurisdictionUS,
        DEFAULT_VALUES.roleInvestor
      );

      expect(await identitySBT.getTotalIdentities()).to.equal(2);
    });
  });
});
