const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");

describe("AssetRegistry", function () {
  async function deployAssetRegistryFixture() {
    const [owner, operator, user1] = await ethers.getSigners();

    // Deploy AssetRegistry
    const AssetRegistry = await ethers.getContractFactory("AssetRegistry");
    const assetRegistry = await AssetRegistry.deploy(owner.address);

    // Add operator
    await assetRegistry.connect(owner).addOperator(operator.address);

    return { assetRegistry, owner, operator, user1 };
  }

  describe("Deployment", function () {
    it("Should deploy successfully", async function () {
      const { assetRegistry } = await loadFixture(deployAssetRegistryFixture);
      expect(await assetRegistry.documentCount()).to.equal(0);
    });

    it("Should set the right owner as operator", async function () {
      const { assetRegistry, owner } = await loadFixture(deployAssetRegistryFixture);
      expect(await assetRegistry.isOperator(owner.address)).to.be.true;
    });

    it("Should have correct version", async function () {
      const { assetRegistry } = await loadFixture(deployAssetRegistryFixture);
      const version = await assetRegistry.version();
      expect(version).to.equal("3.0.0");
    });
  });

  describe("Operator Management", function () {
    it("Should add operator", async function () {
      const { assetRegistry, owner, user1 } = await loadFixture(deployAssetRegistryFixture);

      await expect(
        assetRegistry.connect(owner).addOperator(user1.address)
      ).to.not.be.reverted;

      expect(await assetRegistry.isOperator(user1.address)).to.be.true;
    });

    it("Should remove operator", async function () {
      const { assetRegistry, owner, operator } = await loadFixture(deployAssetRegistryFixture);

      await assetRegistry.connect(owner).removeOperator(operator.address);
      expect(await assetRegistry.isOperator(operator.address)).to.be.false;
    });

    it("Should fail when non-owner tries to add operator", async function () {
      const { assetRegistry, user1 } = await loadFixture(deployAssetRegistryFixture);

      await expect(
        assetRegistry.connect(user1).addOperator(user1.address)
      ).to.be.reverted;
    });
  });

  describe("Document Management", function () {
    it("Should upload document", async function () {
      const { assetRegistry, operator } = await loadFixture(deployAssetRegistryFixture);

      const docHash = ethers.id("document-content");
      const docType = "TITLE_DEED";
      const metadata = ethers.toUtf8Bytes("metadata");

      await expect(
        assetRegistry.connect(operator).uploadDocument(docHash, docType, metadata)
      ).to.emit(assetRegistry, "DocumentUploaded");

      expect(await assetRegistry.documentCount()).to.equal(1);
    });

    it("Should fail to upload document with zero hash", async function () {
      const { assetRegistry, operator } = await loadFixture(deployAssetRegistryFixture);

      await expect(
        assetRegistry.connect(operator).uploadDocument(ethers.ZeroHash, "TITLE_DEED", ethers.toUtf8Bytes("meta"))
      ).to.be.revertedWith("AssetRegistry: Hash cannot be zero");
    });

    it("Should fail to upload document with empty type", async function () {
      const { assetRegistry, operator } = await loadFixture(deployAssetRegistryFixture);

      await expect(
        assetRegistry.connect(operator).uploadDocument(ethers.id("doc"), "", ethers.toUtf8Bytes("meta"))
      ).to.be.reverted;
    });

    it("Should fail when non-operator tries to upload", async function () {
      const { assetRegistry, user1 } = await loadFixture(deployAssetRegistryFixture);

      await expect(
        assetRegistry.connect(user1).uploadDocument(ethers.id("doc"), "TITLE_DEED", ethers.toUtf8Bytes("meta"))
      ).to.be.reverted;
    });

    it("Should get document by hash", async function () {
      const { assetRegistry, operator } = await loadFixture(deployAssetRegistryFixture);

      const docHash = ethers.id("document-content");
      const docType = "TITLE_DEED";

      await assetRegistry.connect(operator).uploadDocument(docHash, docType, ethers.toUtf8Bytes("meta"));

      const doc = await assetRegistry.getDocument(docHash);
      expect(doc.docHash).to.equal(docHash);
      expect(doc.docType).to.equal(docType);
    });

    it("Should get document by index", async function () {
      const { assetRegistry, operator } = await loadFixture(deployAssetRegistryFixture);

      await assetRegistry.connect(operator).uploadDocument(ethers.id("doc1"), "TITLE_DEED", ethers.toUtf8Bytes("m1"));
      await assetRegistry.connect(operator).uploadDocument(ethers.id("doc2"), "APPRAISAL", ethers.toUtf8Bytes("m2"));

      const doc = await assetRegistry.getDocumentByIndex(1);
      expect(doc.docType).to.equal("APPRAISAL");
    });

    it("Should get documents by type", async function () {
      const { assetRegistry, operator } = await loadFixture(deployAssetRegistryFixture);

      await assetRegistry.connect(operator).uploadDocument(ethers.id("doc1"), "TITLE_DEED", ethers.toUtf8Bytes("m1"));
      await assetRegistry.connect(operator).uploadDocument(ethers.id("doc2"), "TITLE_DEED", ethers.toUtf8Bytes("m2"));
      await assetRegistry.connect(operator).uploadDocument(ethers.id("doc3"), "APPRAISAL", ethers.toUtf8Bytes("m3"));

      const docs = await assetRegistry.getDocumentsByType("TITLE_DEED");
      expect(docs.length).to.equal(2);
    });

    it("Should verify document", async function () {
      const { assetRegistry, owner, operator } = await loadFixture(deployAssetRegistryFixture);

      const docHash = ethers.id("document-content");
      await assetRegistry.connect(operator).uploadDocument(docHash, "TITLE_DEED", ethers.toUtf8Bytes("meta"));

      await expect(
        assetRegistry.connect(owner).verifyDocument(docHash)
      ).to.emit(assetRegistry, "DocumentVerified");

      const doc = await assetRegistry.getDocument(docHash);
      expect(doc.verified).to.be.true;
    });

    it("Should fail to verify non-existent document", async function () {
      const { assetRegistry, owner } = await loadFixture(deployAssetRegistryFixture);

      await expect(
        assetRegistry.connect(owner).verifyDocument(ethers.ZeroHash)
      ).to.be.revertedWith("AssetRegistry: Document not found");
    });
  });

  describe("Proof of Reserve (POR)", function () {
    it("Should submit POR attestation", async function () {
      const { assetRegistry, operator } = await loadFixture(deployAssetRegistryFixture);

      const assetValue = ethers.parseEther("1000000");
      const docHash = ethers.id("por-document");
      const signature = ethers.toUtf8Bytes("custodian-signature");

      await expect(
        assetRegistry.connect(operator).submitPOR(assetValue, docHash, signature)
      ).to.emit(assetRegistry, "PORSubmitted");

      expect(await assetRegistry.porCount()).to.equal(1);
    });

    it("Should fail to submit POR with zero value", async function () {
      const { assetRegistry, operator } = await loadFixture(deployAssetRegistryFixture);

      await expect(
        assetRegistry.connect(operator).submitPOR(0, ethers.id("doc"), ethers.toUtf8Bytes("sig"))
      ).to.be.revertedWith("AssetRegistry: Asset value must be positive");
    });

    it("Should fail to submit POR without signature", async function () {
      const { assetRegistry, operator } = await loadFixture(deployAssetRegistryFixture);

      await expect(
        assetRegistry.connect(operator).submitPOR(ethers.parseEther("1000"), ethers.id("doc"), "0x")
      ).to.be.revertedWith("AssetRegistry: Signature required");
    });

    it("Should fail when non-operator tries to submit POR", async function () {
      const { assetRegistry, user1 } = await loadFixture(deployAssetRegistryFixture);

      await expect(
        assetRegistry.connect(user1).submitPOR(ethers.parseEther("1000"), ethers.id("doc"), ethers.toUtf8Bytes("sig"))
      ).to.be.reverted;
    });

    it("Should get POR attestation by ID", async function () {
      const { assetRegistry, operator } = await loadFixture(deployAssetRegistryFixture);

      const assetValue = ethers.parseEther("1000000");
      await assetRegistry.connect(operator).submitPOR(assetValue, ethers.id("doc"), ethers.toUtf8Bytes("sig"));

      const por = await assetRegistry.getPORAttestation(0);
      expect(por.assetValue).to.equal(assetValue);
      expect(por.verified).to.be.false;
    });

    it("Should get latest POR", async function () {
      const { assetRegistry, operator } = await loadFixture(deployAssetRegistryFixture);

      await assetRegistry.connect(operator).submitPOR(ethers.parseEther("1000"), ethers.id("doc1"), ethers.toUtf8Bytes("sig1"));
      await assetRegistry.connect(operator).submitPOR(ethers.parseEther("2000"), ethers.id("doc2"), ethers.toUtf8Bytes("sig2"));

      const latest = await assetRegistry.getLatestPOR();
      expect(latest.assetValue).to.equal(ethers.parseEther("2000"));
    });

    it("Should verify POR", async function () {
      const { assetRegistry, owner, operator } = await loadFixture(deployAssetRegistryFixture);

      await assetRegistry.connect(operator).submitPOR(ethers.parseEther("1000"), ethers.id("doc"), ethers.toUtf8Bytes("sig"));

      await expect(
        assetRegistry.connect(owner).verifyPOR(0)
      ).to.emit(assetRegistry, "PORVerified");

      const por = await assetRegistry.getPORAttestation(0);
      expect(por.verified).to.be.true;
    });
  });

  describe("Asset Event Logging", function () {
    it("Should log asset event", async function () {
      const { assetRegistry, operator } = await loadFixture(deployAssetRegistryFixture);

      const eventType = "VALUATION_UPDATE";
      const dataHash = ethers.id("valuation-data");

      await expect(
        assetRegistry.connect(operator).logAssetEvent(eventType, dataHash)
      ).to.emit(assetRegistry, "AssetEventLogged");

      expect(await assetRegistry.eventCount()).to.equal(1);
    });

    it("Should get asset event", async function () {
      const { assetRegistry, operator } = await loadFixture(deployAssetRegistryFixture);

      const eventType = "VALUATION_UPDATE";
      const dataHash = ethers.id("valuation-data");

      await assetRegistry.connect(operator).logAssetEvent(eventType, dataHash);

      const event = await assetRegistry.getAssetEvent(0);
      expect(event.eventType).to.equal(eventType);
      expect(event.dataHash).to.equal(dataHash);
    });

    it("Should fail when non-operator tries to log event", async function () {
      const { assetRegistry, user1 } = await loadFixture(deployAssetRegistryFixture);

      await expect(
        assetRegistry.connect(user1).logAssetEvent("EVENT", ethers.id("data"))
      ).to.be.reverted;
    });
  });

  describe("Get Functions", function () {
    it("Should return zero for non-existent document", async function () {
      const { assetRegistry } = await loadFixture(deployAssetRegistryFixture);

      await expect(
        assetRegistry.getDocument(ethers.ZeroHash)
      ).to.be.revertedWith("AssetRegistry: Document not found");
    });

    it("Should fail to get document with out of bounds index", async function () {
      const { assetRegistry } = await loadFixture(deployAssetRegistryFixture);

      await expect(
        assetRegistry.getDocumentByIndex(0)
      ).to.be.revertedWith("AssetRegistry: Index out of bounds");
    });

    it("Should fail to get POR with out of bounds index", async function () {
      const { assetRegistry } = await loadFixture(deployAssetRegistryFixture);

      await expect(
        assetRegistry.getPORAttestation(0)
      ).to.be.revertedWith("AssetRegistry: POR not found");
    });

    it("Should fail to get latest POR when none exist", async function () {
      const { assetRegistry } = await loadFixture(deployAssetRegistryFixture);

      await expect(
        assetRegistry.getLatestPOR()
      ).to.be.revertedWith("AssetRegistry: No POR attestations");
    });
  });

  describe("Full Document Flow", function () {
    it("Should complete full document upload, verification, and retrieval flow", async function () {
      const { assetRegistry, owner, operator } = await loadFixture(deployAssetRegistryFixture);

      // Upload multiple documents
      await assetRegistry.connect(operator).uploadDocument(
        ethers.id("title-deed"),
        "TITLE_DEED",
        ethers.toUtf8Bytes("metadata1")
      );

      await assetRegistry.connect(operator).uploadDocument(
        ethers.id("appraisal"),
        "APPRAISAL",
        ethers.toUtf8Bytes("metadata2")
      );

      // Verify documents
      await assetRegistry.connect(owner).verifyDocument(ethers.id("title-deed"));

      // Get documents by type
      const titleDeeds = await assetRegistry.getDocumentsByType("TITLE_DEED");
      expect(titleDeeds.length).to.equal(1);
      expect(titleDeeds[0].verified).to.be.true;

      // Get document by index
      const doc = await assetRegistry.getDocumentByIndex(0);
      expect(doc.docType).to.equal("TITLE_DEED");

      // Verify counts
      expect(await assetRegistry.documentCount()).to.equal(2);
    });
  });

  describe("Full POR Flow", function () {
    it("Should complete full POR submission, verification, and retrieval flow", async function () {
      const { assetRegistry, owner, operator } = await loadFixture(deployAssetRegistryFixture);

      // Submit multiple POR attestations
      await assetRegistry.connect(operator).submitPOR(
        ethers.parseEther("1000000"),
        ethers.id("por-doc-1"),
        ethers.toUtf8Bytes("signature1")
      );

      await assetRegistry.connect(operator).submitPOR(
        ethers.parseEther("1500000"),
        ethers.id("por-doc-2"),
        ethers.toUtf8Bytes("signature2")
      );

      // Verify first POR
      await assetRegistry.connect(owner).verifyPOR(0);

      // Get POR attestations
      const por0 = await assetRegistry.getPORAttestation(0);
      const por1 = await assetRegistry.getPORAttestation(1);

      expect(por0.assetValue).to.equal(ethers.parseEther("1000000"));
      expect(por0.verified).to.be.true;
      expect(por1.assetValue).to.equal(ethers.parseEther("1500000"));
      expect(por1.verified).to.be.false;

      // Get latest POR
      const latest = await assetRegistry.getLatestPOR();
      expect(latest.assetValue).to.equal(ethers.parseEther("1500000"));

      // Verify count
      expect(await assetRegistry.porCount()).to.equal(2);
    });
  });
});
