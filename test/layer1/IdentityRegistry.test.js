const { expect } = require("chai");
const { ethers } = require("hardhat");
const { registerIdentity, DEFAULT_VALUES, deployUpgradeable } = require("../helpers/fixtures");

// CRATSConfig constants
const KYC_PROVIDER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("KYC_PROVIDER_ROLE"));
const REGULATOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("REGULATOR_ROLE"));

describe("Layer 1 - IdentityRegistry", function () {
  let identityRegistry, identitySBT, kycRegistry, kycProvider, admin, user1, user2, regulator;

  beforeEach(async function () {
    [admin, user1, user2, , , , kycProvider, , regulator] = await ethers.getSigners();

    // Deploy KYCProvidersRegistry
    kycRegistry = await deployUpgradeable("KYCProvidersRegistry", [admin.address]);

    // Register and approve kycProvider
    await kycRegistry.registerProvider(kycProvider.address, "Test Provider");
    await kycRegistry.approveProvider(kycProvider.address);

    // Deploy IdentitySBT
    identitySBT = await deployUpgradeable("IdentitySBT", ["CRATS Identity", "CRATSID", admin.address]);

    // Deploy IdentityRegistry
    identityRegistry = await deployUpgradeable("IdentityRegistry", [
      admin.address,
      await identitySBT.getAddress(),
      await kycRegistry.getAddress()
    ]);

    // Setup KYC provider role on both contracts
    await identityRegistry.grantRole(KYC_PROVIDER_ROLE, kycProvider.address);
    await identityRegistry.grantRole(REGULATOR_ROLE, regulator.address);
    
    // Grant IDENTITY_MANAGER_ROLE to both kycProvider AND identityRegistry on IdentitySBT
    const IDENTITY_MANAGER_ROLE = await identitySBT.IDENTITY_MANAGER_ROLE();
    await identitySBT.grantRole(IDENTITY_MANAGER_ROLE, kycProvider.address);
    await identitySBT.grantRole(IDENTITY_MANAGER_ROLE, await identityRegistry.getAddress());
    
    // Grant REGULATOR_ROLE to regulator on IdentitySBT (for direct calls)
    await identitySBT.grantRole(REGULATOR_ROLE, regulator.address);
    // Grant REGULATOR_ROLE to identityRegistry contract (for identityRegistry.freeze() calls)
    await identitySBT.grantRole(REGULATOR_ROLE, await identityRegistry.getAddress());
  });

  describe("Initialization", function () {
    it("Should initialize correctly", async function () {
      expect(await identityRegistry.identitySBT()).to.equal(await identitySBT.getAddress());
      expect(await identityRegistry.kycProvidersRegistry()).to.equal(await kycRegistry.getAddress());
    });

    it("Should grant admin role", async function () {
      const DEFAULT_ADMIN_ROLE = await identityRegistry.DEFAULT_ADMIN_ROLE();
      expect(await identityRegistry.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
    });
  });

  describe("Identity Registration", function () {
    it("Should register identity through registry", async function () {
      await identityRegistry.grantRole(KYC_PROVIDER_ROLE, kycProvider.address);

      const didHash = ethers.keccak256(ethers.toUtf8Bytes("did:crats:user1"));
      const expiresAt = Math.floor(Date.now() / 1000) + 63072000;

      const tx = await identityRegistry.connect(kycProvider).registerIdentity(
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
          const parsed = identityRegistry.interface.parseLog(log);
          return parsed.name === "IdentityRegistered";
        } catch { return false; }
      });

      expect(event).to.not.be.undefined;
    });

    it("Should only allow approved KYC providers", async function () {
      const didHash = ethers.keccak256(ethers.toUtf8Bytes("did:crats:user1"));
      const expiresAt = Math.floor(Date.now() / 1000) + 63072000;

      // user1 is NOT an approved KYC provider, so this should fail
      await expect(
        identityRegistry.connect(user1).registerIdentity(
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

  describe("Verification Checks", function () {
    it("Should return false for unverified wallet", async function () {
      expect(await identityRegistry.isVerified(user1.address)).to.be.false;
    });

    it("Should return true for verified wallet", async function () {
      await registerIdentity(
        identitySBT,
        identityRegistry,
        kycProvider,
        user1,
        DEFAULT_VALUES.jurisdictionUS,
        DEFAULT_VALUES.roleInvestor
      );

      expect(await identityRegistry.isVerified(user1.address)).to.be.true;
    });

    it("Should get identity data", async function () {
      await registerIdentity(
        identitySBT,
        identityRegistry,
        kycProvider,
        user1,
        DEFAULT_VALUES.jurisdictionUS,
        DEFAULT_VALUES.roleInvestor
      );

      const identity = await identityRegistry.getIdentity(user1.address);
      expect(identity.role).to.equal(DEFAULT_VALUES.roleInvestor);
      expect(identity.jurisdiction).to.equal(DEFAULT_VALUES.jurisdictionUS);
    });

    it("Should revert for unregistered wallet", async function () {
      await expect(
        identityRegistry.getIdentity(user1.address)
      ).to.be.reverted;
    });
  });

  describe("Identity Updates", function () {
    beforeEach(async function () {
      await registerIdentity(
        identitySBT,
        identityRegistry,
        kycProvider,
        user1,
        DEFAULT_VALUES.jurisdictionUS,
        DEFAULT_VALUES.roleInvestor
      );
    });

    it("Should update role", async function () {
      await identityRegistry.connect(kycProvider).updateRole(user1.address, DEFAULT_VALUES.roleQualified);

      const identity = await identityRegistry.getIdentity(user1.address);
      expect(identity.role).to.equal(DEFAULT_VALUES.roleQualified);
    });

    it("Should update jurisdiction", async function () {
      await identityRegistry.connect(kycProvider).updateJurisdiction(user1.address, DEFAULT_VALUES.jurisdictionUK);

      const identity = await identityRegistry.getIdentity(user1.address);
      expect(identity.jurisdiction).to.equal(DEFAULT_VALUES.jurisdictionUK);
    });

    it("Should update status", async function () {
      await identityRegistry.connect(kycProvider).updateStatus(user1.address, DEFAULT_VALUES.statusSuspended);

      const identity = await identityRegistry.getIdentity(user1.address);
      expect(identity.status).to.equal(DEFAULT_VALUES.statusSuspended);
    });

    it("Should update expiry", async function () {
      const newExpiry = Math.floor(Date.now() / 1000) + 100000000;
      await identityRegistry.connect(kycProvider).updateExpiry(user1.address, newExpiry);

      const identity = await identityRegistry.getIdentity(user1.address);
      expect(identity.expiresAt).to.equal(newExpiry);
    });

    it("Should add chain address", async function () {
      await identityRegistry.connect(kycProvider).addChainAddress(
        user1.address,
        137, // Polygon
        user2.address
      );

      const identity = await identityRegistry.getIdentity(user1.address);
      expect(identity.chainAddresses.length).to.equal(2);
    });
  });

  describe("Regulatory Functions", function () {
    beforeEach(async function () {
      await registerIdentity(
        identitySBT,
        identityRegistry,
        kycProvider,
        user1,
        DEFAULT_VALUES.jurisdictionUS,
        DEFAULT_VALUES.roleInvestor
      );
    });

    it("Should freeze wallet (regulator only)", async function () {
      await identityRegistry.connect(regulator).freeze(user1.address);

      expect(await identityRegistry.isVerified(user1.address)).to.be.false;
    });

    it("Should unfreeze wallet (regulator only)", async function () {
      await identityRegistry.connect(regulator).freeze(user1.address);
      await identityRegistry.connect(regulator).unfreeze(user1.address);

      expect(await identityRegistry.isVerified(user1.address)).to.be.true;
    });

    it("Should revoke wallet (regulator only)", async function () {
      await identityRegistry.connect(regulator).revoke(user1.address);

      expect(await identityRegistry.isVerified(user1.address)).to.be.false;
    });
  });

  describe("Configuration", function () {
    it("Should update IdentitySBT address", async function () {
      const DEFAULT_ADMIN_ROLE = await identityRegistry.DEFAULT_ADMIN_ROLE();
      await identityRegistry.grantRole(DEFAULT_ADMIN_ROLE, admin.address);

      const newSBT = await deployUpgradeable("IdentitySBT", ["New Identity", "NEWID", admin.address]);

      await identityRegistry.setIdentitySBT(await newSBT.getAddress());
      expect(await identityRegistry.identitySBT()).to.equal(await newSBT.getAddress());
    });

    it("Should update KYC registry address", async function () {
      const newKYC = await deployUpgradeable("KYCProvidersRegistry", [admin.address]);

      await identityRegistry.setKYCRegistry(await newKYC.getAddress());
      expect(await identityRegistry.kycProvidersRegistry()).to.equal(await newKYC.getAddress());
    });
  });
});
