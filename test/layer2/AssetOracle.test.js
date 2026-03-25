const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("Layer 2 - AssetOracle", function () {
  let assetOracle;
  let admin, signer1, signer2, signer3, user;

  beforeEach(async function () {
    [admin, signer1, signer2, signer3, user] = await ethers.getSigners();

    // Deploy AssetOracle
    const AssetOracle = await ethers.getContractFactory("AssetOracle");
    const oracleImpl = await AssetOracle.deploy();
    await oracleImpl.waitForDeployment();

    // Deploy proxy
    const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
    const initData = await oracleImpl.interface.encodeFunctionData("initialize", [admin.address]);
    const proxy = await ERC1967Proxy.deploy(await oracleImpl.getAddress(), initData);
    await proxy.waitForDeployment();

    assetOracle = AssetOracle.attach(await proxy.getAddress());

    // Add signers
    await assetOracle.addSigner(signer1.address);
    await assetOracle.addSigner(signer2.address);
    await assetOracle.addSigner(signer3.address);
  });

  describe("Initialization", function () {
    it("Should initialize correctly", async function () {
      expect(await assetOracle.currentNAV()).to.equal(0);
      expect(await assetOracle.lastNAV()).to.equal(0);
    });

    it("Should grant admin role", async function () {
      const DEFAULT_ADMIN_ROLE = await assetOracle.DEFAULT_ADMIN_ROLE();
      expect(await assetOracle.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
    });

    it("Should add initial signer", async function () {
      expect(await assetOracle.isSigner(admin.address)).to.be.true;
    });
  });

  describe("Signer Management", function () {
    it("Should add new signer", async function () {
      await assetOracle.addSigner(user.address);
      
      expect(await assetOracle.isSigner(user.address)).to.be.true;
    });

    it("Should only allow admin to add signers", async function () {
      await expect(
        assetOracle.connect(user).addSigner(user.address)
      ).to.be.reverted;
    });

    it("Should remove signer", async function () {
      await assetOracle.removeSigner(signer1.address);
      
      expect(await assetOracle.isSigner(signer1.address)).to.be.false;
    });

    it("Should only allow admin to remove signers", async function () {
      await expect(
        assetOracle.connect(user).removeSigner(signer1.address)
      ).to.be.reverted;
    });

    it("Should get all signers", async function () {
      const signers = await assetOracle.getSigners();
      
      expect(signers.length).to.equal(4); // admin + 3 signers
    });

    it("Should emit SignerAdded event", async function () {
      await expect(assetOracle.addSigner(user.address))
        .to.emit(assetOracle, "SignerAdded")
        .withArgs(user.address);
    });

    it("Should emit SignerRemoved event", async function () {
      await expect(assetOracle.removeSigner(signer1.address))
        .to.emit(assetOracle, "SignerRemoved")
        .withArgs(signer1.address);
    });
  });

  describe("NAV Proposal", function () {
    it("Should propose NAV", async function () {
      const newNAV = ethers.parseEther("100");
      
      await assetOracle.connect(signer1).proposeNAV(newNAV, "0x");
      
      const proposal = await assetOracle.getProposal(1);
      expect(proposal.proposedNAV).to.equal(newNAV);
      expect(proposal.executed).to.be.false;
    });

    it("Should only allow signers to propose NAV", async function () {
      const newNAV = ethers.parseEther("100");
      
      await expect(
        assetOracle.connect(user).proposeNAV(newNAV, "0x")
      ).to.be.revertedWith("AssetOracle: not signer");
    });

    it("Should reject invalid NAV", async function () {
      await expect(
        assetOracle.connect(signer1).proposeNAV(0, "0x")
      ).to.be.revertedWith("AssetOracle: invalid NAV");
    });

    it("Should emit NAVProposed event", async function () {
      const newNAV = ethers.parseEther("100");
      
      await expect(assetOracle.connect(signer1).proposeNAV(newNAV, "0x"))
        .to.emit(assetOracle, "NAVProposed");
    });
  });

  describe("NAV Approval", function () {
    beforeEach(async function () {
      await assetOracle.connect(signer1).proposeNAV(ethers.parseEther("100"), "0x");
    });

    it("Should approve NAV proposal", async function () {
      await assetOracle.connect(signer2).approveNAV(1);
      
      const proposal = await assetOracle.getProposal(1);
      expect(proposal.approvals).to.equal(1);
    });

    it("Should only allow signers to approve", async function () {
      await expect(
        assetOracle.connect(user).approveNAV(1)
      ).to.be.revertedWith("AssetOracle: not signer");
    });

    it("Should reject duplicate approval", async function () {
      await assetOracle.connect(signer2).approveNAV(1);
      
      await expect(
        assetOracle.connect(signer2).approveNAV(1)
      ).to.be.revertedWith("AssetOracle: already approved");
    });

    it("Should emit NAVApproved event", async function () {
      await expect(assetOracle.connect(signer2).approveNAV(1))
        .to.emit(assetOracle, "NAVApproved");
    });
  });

  describe("NAV Execution", function () {
    beforeEach(async function () {
      await assetOracle.connect(signer1).proposeNAV(ethers.parseEther("100"), "0x");
      await assetOracle.connect(signer2).approveNAV(1);
      await assetOracle.connect(signer3).approveNAV(1);
    });

    it("Should execute NAV after delay", async function () {
      await time.increase(24 * 60 * 60 + 1);
      
      await assetOracle.executeNAV(1);
      
      expect(await assetOracle.currentNAV()).to.equal(ethers.parseEther("100"));
    });

    it("Should reject execution before delay", async function () {
      await expect(
        assetOracle.executeNAV(1)
      ).to.be.revertedWith("AssetOracle: delay not met");
    });

    it("Should reject execution if not enough approvals", async function () {
      await assetOracle.connect(signer1).proposeNAV(ethers.parseEther("200"), "0x");
      await time.increase(24 * 60 * 60 + 1);
      
      await expect(
        assetOracle.executeNAV(2)
      ).to.be.revertedWith("AssetOracle: not enough approvals");
    });

    it("Should update lastNAV", async function () {
      await time.increase(24 * 60 * 60 + 1);
      await assetOracle.executeNAV(1);
      
      expect(await assetOracle.lastNAV()).to.equal(0);
    });

    it("Should emit NAVUpdated event", async function () {
      await time.increase(24 * 60 * 60 + 1);
      
      await expect(assetOracle.executeNAV(1))
        .to.emit(assetOracle, "NAVUpdated");
    });
  });

  describe("Chainlink PoR Configuration", function () {
    it("Should set Chainlink PoR feed", async function () {
      const feedAddress = ethers.Wallet.createRandom().address;
      const reserveRatio = 100;
      
      await assetOracle.setChainlinkPoRFeed(feedAddress, reserveRatio);
      
      expect(await assetOracle.chainlinkPoRFeed()).to.equal(feedAddress);
      expect(await assetOracle.requiredReserveRatio()).to.equal(reserveRatio);
    });

    it("Should only allow admin to set Chainlink PoR", async function () {
      await expect(
        assetOracle.connect(user).setChainlinkPoRFeed(ethers.Wallet.createRandom().address, 100)
      ).to.be.reverted;
    });

    it("Should emit ChainlinkPoRConfigured event", async function () {
      const feedAddress = ethers.Wallet.createRandom().address;
      const reserveRatio = 100;
      
      await expect(assetOracle.setChainlinkPoRFeed(feedAddress, reserveRatio))
        .to.emit(assetOracle, "ChainlinkPoRConfigured")
        .withArgs(feedAddress, reserveRatio);
    });
  });

  describe("View Functions", function () {
    it("Should return version", async function () {
      expect(await assetOracle.version()).to.equal("3.0.0");
    });

    it("Should return REQUIRED_APPROVALS", async function () {
      expect(await assetOracle.REQUIRED_APPROVALS()).to.equal(2);
    });

    it("Should return UPDATE_DELAY", async function () {
      expect(await assetOracle.UPDATE_DELAY()).to.equal(24 * 60 * 60); // 24 hours
    });

    it("Should get NAV", async function () {
      expect(await assetOracle.getNAV()).to.equal(0);
    });
  });
});
