const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Layer 2 - AssetRegistry", function () {
  let assetRegistry;
  let admin, operator, user;

  beforeEach(async function () {
    [admin, operator, user] = await ethers.getSigners();

    // Deploy AssetRegistry
    const AssetRegistry = await ethers.getContractFactory("AssetRegistry");
    const registryImpl = await AssetRegistry.deploy();
    await registryImpl.waitForDeployment();

    // Deploy proxy
    const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
    const initData = await registryImpl.interface.encodeFunctionData("initialize", [admin.address]);
    const proxy = await ERC1967Proxy.deploy(await registryImpl.getAddress(), initData);
    await proxy.waitForDeployment();

    assetRegistry = AssetRegistry.attach(await proxy.getAddress());

    // Add operator
    await assetRegistry.addOperator(operator.address);
  });

  describe("Initialization", function () {
    it("Should initialize correctly", async function () {
      expect(await assetRegistry.documentCount()).to.equal(0);
      expect(await assetRegistry.porCount()).to.equal(0);
    });

    it("Should grant admin role", async function () {
      const DEFAULT_ADMIN_ROLE = await assetRegistry.DEFAULT_ADMIN_ROLE();
      expect(await assetRegistry.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
    });

    it("Should add initial operator", async function () {
      expect(await assetRegistry.isOperator(admin.address)).to.be.true;
    });
  });

  describe("Document Management", function () {
    let docHash, docType;

    beforeEach(async function () {
      docHash = ethers.keccak256(ethers.toUtf8Bytes("document-content"));
      docType = "TITLE_DEED";
    });

    it("Should upload document", async function () {
      await assetRegistry.connect(operator).uploadDocument(docHash, docType, "0x");
      
      expect(await assetRegistry.documentCount()).to.equal(1);
      
      const doc = await assetRegistry.getDocument(docHash);
      expect(doc.docHash).to.equal(docHash);
      expect(doc.docType).to.equal(docType);
      expect(doc.verified).to.be.false;
    });

    it("Should only allow operator to upload", async function () {
      await expect(
        assetRegistry.connect(user).uploadDocument(docHash, docType, "0x")
      ).to.be.revertedWith("AssetRegistry: not operator");
    });

    it("Should reject duplicate document", async function () {
      await assetRegistry.connect(operator).uploadDocument(docHash, docType, "0x");
      
      await expect(
        assetRegistry.connect(operator).uploadDocument(docHash, docType, "0x")
      ).to.be.revertedWith("AssetRegistry: already exists");
    });

    it("Should verify document", async function () {
      await assetRegistry.connect(operator).uploadDocument(docHash, docType, "0x");
      await assetRegistry.verifyDocument(docHash);
      
      const doc = await assetRegistry.getDocument(docHash);
      expect(doc.verified).to.be.true;
    });

    it("Should only allow admin to verify", async function () {
      await assetRegistry.connect(operator).uploadDocument(docHash, docType, "0x");
      
      await expect(
        assetRegistry.connect(operator).verifyDocument(docHash)
      ).to.be.reverted;
    });

    it("Should get document by index", async function () {
      await assetRegistry.connect(operator).uploadDocument(docHash, docType, "0x");
      
      const doc = await assetRegistry.getDocumentByIndex(0);
      expect(doc.docHash).to.equal(docHash);
    });

    it("Should get documents by type", async function () {
      const docHash2 = ethers.keccak256(ethers.toUtf8Bytes("document-2"));
      
      await assetRegistry.connect(operator).uploadDocument(docHash, "TITLE_DEED", "0x");
      await assetRegistry.connect(operator).uploadDocument(docHash2, "TITLE_DEED", "0x");
      
      const docs = await assetRegistry.getDocumentsByType("TITLE_DEED");
      expect(docs.length).to.equal(2);
    });

    it("Should emit DocumentUploaded event", async function () {
      await expect(assetRegistry.connect(operator).uploadDocument(docHash, docType, "0x"))
        .to.emit(assetRegistry, "DocumentUploaded");
    });

    it("Should emit DocumentVerified event", async function () {
      await assetRegistry.connect(operator).uploadDocument(docHash, docType, "0x");
      
      await expect(assetRegistry.verifyDocument(docHash))
        .to.emit(assetRegistry, "DocumentVerified");
    });
  });

  describe("Proof of Reserve (POR)", function () {
    let assetValue, docHash, signature;

    beforeEach(async function () {
      assetValue = ethers.parseEther("1000000");
      docHash = ethers.keccak256(ethers.toUtf8Bytes("por-document"));
      signature = ethers.solidityPacked(["bytes32", "address"], [docHash, operator.address]);
    });

    it("Should submit POR attestation", async function () {
      await assetRegistry.connect(operator).submitPOR(assetValue, docHash, signature);
      
      expect(await assetRegistry.porCount()).to.equal(1);
      
      const por = await assetRegistry.getPORAttestation(0);
      expect(por.assetValue).to.equal(assetValue);
      expect(por.documentHash).to.equal(docHash);
      expect(por.verified).to.be.false;
    });

    it("Should only allow operator to submit POR", async function () {
      await expect(
        assetRegistry.connect(user).submitPOR(assetValue, docHash, signature)
      ).to.be.revertedWith("AssetRegistry: not operator");
    });

    it("Should verify POR", async function () {
      await assetRegistry.connect(operator).submitPOR(assetValue, docHash, signature);
      await assetRegistry.verifyPOR(0);
      
      const por = await assetRegistry.getPORAttestation(0);
      expect(por.verified).to.be.true;
    });

    it("Should only allow admin to verify POR", async function () {
      await assetRegistry.connect(operator).submitPOR(assetValue, docHash, signature);
      
      await expect(
        assetRegistry.connect(operator).verifyPOR(0)
      ).to.be.reverted;
    });

    it("Should get latest POR", async function () {
      await assetRegistry.connect(operator).submitPOR(assetValue, docHash, signature);
      
      const latest = await assetRegistry.getLatestPOR();
      expect(latest.assetValue).to.equal(assetValue);
    });

    it("Should emit PORSubmitted event", async function () {
      await expect(assetRegistry.connect(operator).submitPOR(assetValue, docHash, signature))
        .to.emit(assetRegistry, "PORSubmitted");
    });

    it("Should emit PORVerified event", async function () {
      await assetRegistry.connect(operator).submitPOR(assetValue, docHash, signature);
      
      await expect(assetRegistry.verifyPOR(0))
        .to.emit(assetRegistry, "PORVerified");
    });
  });

  describe("Asset Event Logging", function () {
    let eventType, dataHash;

    beforeEach(async function () {
      eventType = "VALUATION_UPDATE";
      dataHash = ethers.keccak256(ethers.toUtf8Bytes("event-data"));
    });

    it("Should log asset event", async function () {
      await assetRegistry.connect(operator).logAssetEvent(eventType, dataHash);
      
      expect(await assetRegistry.eventCount()).to.equal(1);
      
      const event = await assetRegistry.getAssetEvent(0);
      expect(event.eventType).to.equal(eventType);
      expect(event.dataHash).to.equal(dataHash);
    });

    it("Should only allow operator to log events", async function () {
      await expect(
        assetRegistry.connect(user).logAssetEvent(eventType, dataHash)
      ).to.be.revertedWith("AssetRegistry: not operator");
    });

    it("Should emit AssetEventLogged event", async function () {
      await expect(assetRegistry.connect(operator).logAssetEvent(eventType, dataHash))
        .to.emit(assetRegistry, "AssetEventLogged");
    });
  });

  describe("Operator Management", function () {
    it("Should add operator", async function () {
      await assetRegistry.addOperator(user.address);
      
      expect(await assetRegistry.isOperator(user.address)).to.be.true;
    });

    it("Should only allow admin to add operator", async function () {
      await expect(
        assetRegistry.connect(operator).addOperator(user.address)
      ).to.be.reverted;
    });

    it("Should remove operator", async function () {
      await assetRegistry.removeOperator(operator.address);
      
      expect(await assetRegistry.isOperator(operator.address)).to.be.false;
    });

    it("Should only allow admin to remove operator", async function () {
      await expect(
        assetRegistry.connect(operator).removeOperator(operator.address)
      ).to.be.reverted;
    });
  });

  describe("View Functions", function () {
    it("Should return version", async function () {
      expect(await assetRegistry.version()).to.equal("3.0.0");
    });
  });
});
