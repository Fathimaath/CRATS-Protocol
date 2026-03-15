const {
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");

describe("RealEstatePlugin", function () {
  async function deployRealEstatePluginFixture() {
    const RealEstatePlugin = await ethers.getContractFactory("RealEstatePlugin");
    const plugin = await RealEstatePlugin.deploy();
    return { plugin };
  }

  describe("Deployment", function () {
    it("Should deploy successfully", async function () {
      const { plugin } = await loadFixture(deployRealEstatePluginFixture);
      expect(await plugin.version()).to.equal("3.0.0");
    });
  });

  describe("Category Information", function () {
    it("Should return correct category ID", async function () {
      const { plugin } = await loadFixture(deployRealEstatePluginFixture);
      const categoryId = await plugin.getCategoryId();
      expect(categoryId).to.equal(ethers.id("REAL_ESTATE"));
    });

    it("Should return correct category name", async function () {
      const { plugin } = await loadFixture(deployRealEstatePluginFixture);
      const name = await plugin.getCategoryName();
      expect(name).to.equal("Real Estate");
    });
  });

  describe("Document Requirements", function () {
    it("Should return required documents", async function () {
      const { plugin } = await loadFixture(deployRealEstatePluginFixture);
      const docs = await plugin.getRequiredDocuments();
      expect(docs.length).to.equal(6);
      expect(docs[0]).to.equal("TITLE_DEED");
      expect(docs[1]).to.equal("APPRAISAL");
      expect(docs[2]).to.equal("INSURANCE");
      expect(docs[3]).to.equal("SPV_DOCS");
      expect(docs[4]).to.equal("ZONING_CERTIFICATE");
      expect(docs[5]).to.equal("CHAINLINK_POR_FEED");
    });

    it("Should return document requirements with validity periods", async function () {
      const { plugin } = await loadFixture(deployRealEstatePluginFixture);
      const requirements = await plugin.getDocumentRequirements();
      expect(requirements.length).to.equal(6);
      expect(requirements[0].required).to.be.true;
    });
  });

  describe("Validation", function () {
    it("Should validate creation with valid data", async function () {
      const { plugin } = await loadFixture(deployRealEstatePluginFixture);
      
      const issuer = ethers.Wallet.createRandom().address;
      const categoryData = "0x" + "00".repeat(128);

      const [valid, message] = await plugin.validateCreation(issuer, categoryData);
      expect(valid).to.be.true;
    });

    it("Should fail validation with invalid issuer", async function () {
      const { plugin } = await loadFixture(deployRealEstatePluginFixture);
      const categoryData = "0x" + "00".repeat(128);
      
      await expect(
        plugin.validateCreation(ethers.ZeroAddress, categoryData)
      ).to.be.revertedWith("RealEstate: Invalid issuer");
    });

    it("Should fail validation with empty category data", async function () {
      const { plugin } = await loadFixture(deployRealEstatePluginFixture);
      
      const issuer = ethers.Wallet.createRandom().address;
      await expect(
        plugin.validateCreation(issuer, "0x")
      ).to.be.revertedWith("RealEstate: Category data required");
    });

    it("Should validate documents", async function () {
      const { plugin } = await loadFixture(deployRealEstatePluginFixture);
      
      const docHashes = [
        ethers.id("doc1"),
        ethers.id("doc2"),
        ethers.id("doc3"),
        ethers.id("doc4"),
        ethers.id("doc5")
      ];
      const docTypes = ["TITLE_DEED", "APPRAISAL", "INSURANCE", "SPV_DOCS", "ZONING_CERTIFICATE"];

      const [valid, message] = await plugin.validateDocuments(docHashes, docTypes);
      expect(valid).to.be.true;
    });

    it("Should fail validation with missing required documents", async function () {
      const { plugin } = await loadFixture(deployRealEstatePluginFixture);
      
      const docHashes = [ethers.id("doc1")];
      const docTypes = ["APPRAISAL"];

      await expect(
        plugin.validateDocuments(docHashes, docTypes)
      ).to.be.reverted;
    });

    it("Should validate valuation", async function () {
      const { plugin } = await loadFixture(deployRealEstatePluginFixture);
      
      const proposedValue = ethers.parseEther("1000000");
      const valuationData = ethers.toUtf8Bytes("valuation-info");

      const [valid, message] = await plugin.validateValuation(proposedValue, valuationData);
      expect(valid).to.be.true;
    });

    it("Should fail valuation with zero value", async function () {
      const { plugin } = await loadFixture(deployRealEstatePluginFixture);
      
      await expect(
        plugin.validateValuation(0, ethers.toUtf8Bytes("data"))
      ).to.be.revertedWith("RealEstate: Value must be positive");
    });
  });

  describe("Chainlink PoR Configuration", function () {
    it("Should return default Chainlink PoR config", async function () {
      const { plugin } = await loadFixture(deployRealEstatePluginFixture);
      
      const [feedAddress, reserveRatio] = await plugin.getChainlinkPoRConfig();
      expect(feedAddress).to.equal(ethers.ZeroAddress);
      expect(reserveRatio).to.equal(10000); // 100%
    });
  });

  describe("Category Data Parsing", function () {
    it("Should parse category data", async function () {
      const { plugin } = await loadFixture(deployRealEstatePluginFixture);
      
      const data = "0x" + "00".repeat(128);
      const parsed = await plugin.parseCategoryData(data);
      expect(parsed).to.not.equal(ethers.ZeroHash);
    });

    it("Should fail to parse short data", async function () {
      const { plugin } = await loadFixture(deployRealEstatePluginFixture);
      
      await expect(
        plugin.parseCategoryData("0x1234")
      ).to.be.revertedWith("RealEstate: Data too short");
    });

    it("Should parse valuation data", async function () {
      const { plugin } = await loadFixture(deployRealEstatePluginFixture);
      
      const valuationInfo = await plugin.parseValuationData(ethers.toUtf8Bytes("data"));
      expect(valuationInfo.value).to.equal(0);
      expect(valuationInfo.timestamp).to.equal(0);
    });
  });
});
