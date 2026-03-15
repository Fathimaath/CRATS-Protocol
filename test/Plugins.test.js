const {
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");

describe("Plugins - Fine Art & Carbon Credit", function () {
  describe("FineArtPlugin", function () {
    async function deployFineArtPluginFixture() {
      const FineArtPlugin = await ethers.getContractFactory("FineArtPlugin");
      const plugin = await FineArtPlugin.deploy();
      return { plugin };
    }

    describe("Category Information", function () {
      it("Should return correct category ID", async function () {
        const { plugin } = await loadFixture(deployFineArtPluginFixture);
        const categoryId = await plugin.getCategoryId();
        expect(categoryId).to.equal(ethers.id("FINE_ART"));
      });

      it("Should return correct category name", async function () {
        const { plugin } = await loadFixture(deployFineArtPluginFixture);
        const name = await plugin.getCategoryName();
        expect(name).to.equal("Fine Art");
      });
    });

    describe("Document Requirements", function () {
      it("Should return required documents", async function () {
        const { plugin } = await loadFixture(deployFineArtPluginFixture);
        const docs = await plugin.getRequiredDocuments();
        expect(docs.length).to.equal(6);
        expect(docs[0]).to.equal("PROVENANCE");
        expect(docs[1]).to.equal("AUTHENTICATION");
        expect(docs[2]).to.equal("APPRAISAL");
        expect(docs[3]).to.equal("INSURANCE");
        expect(docs[4]).to.equal("CONDITION_REPORT");
        expect(docs[5]).to.equal("CUSTODY_ATTESTATION");
      });
    });

    describe("Validation", function () {
      it("Should validate creation", async function () {
        const { plugin } = await loadFixture(deployFineArtPluginFixture);
        const issuer = ethers.Wallet.createRandom().address;
        const categoryData = "0x" + "00".repeat(128);
        const [valid] = await plugin.validateCreation(issuer, categoryData);
        expect(valid).to.be.true;
      });

      it("Should validate documents", async function () {
        const { plugin } = await loadFixture(deployFineArtPluginFixture);
        const docHashes = [ethers.id("1"), ethers.id("2"), ethers.id("3"), ethers.id("4")];
        const docTypes = ["PROVENANCE", "AUTHENTICATION", "APPRAISAL", "INSURANCE"];
        const [valid] = await plugin.validateDocuments(docHashes, docTypes);
        expect(valid).to.be.true;
      });

      it("Should validate valuation", async function () {
        const { plugin } = await loadFixture(deployFineArtPluginFixture);
        const [valid] = await plugin.validateValuation(ethers.parseEther("1000"), ethers.toUtf8Bytes("data"));
        expect(valid).to.be.true;
      });
    });
  });

  describe("CarbonCreditPlugin", function () {
    async function deployCarbonCreditPluginFixture() {
      const CarbonCreditPlugin = await ethers.getContractFactory("CarbonCreditPlugin");
      const plugin = await CarbonCreditPlugin.deploy();
      return { plugin };
    }

    describe("Category Information", function () {
      it("Should return correct category ID", async function () {
        const { plugin } = await loadFixture(deployCarbonCreditPluginFixture);
        const categoryId = await plugin.getCategoryId();
        expect(categoryId).to.equal(ethers.id("CARBON_CREDIT"));
      });

      it("Should return correct category name", async function () {
        const { plugin } = await loadFixture(deployCarbonCreditPluginFixture);
        const name = await plugin.getCategoryName();
        expect(name).to.equal("Carbon Credit");
      });
    });

    describe("Document Requirements", function () {
      it("Should return required documents", async function () {
        const { plugin } = await loadFixture(deployCarbonCreditPluginFixture);
        const docs = await plugin.getRequiredDocuments();
        expect(docs.length).to.equal(5);
        expect(docs[0]).to.equal("REGISTRY_CERT");
        expect(docs[1]).to.equal("PROJECT_DOCS");
        expect(docs[2]).to.equal("ISSUANCE_CERT");
        expect(docs[3]).to.equal("VERIFICATION_REPORT");
        expect(docs[4]).to.equal("RETIREMENT_CHECK");
      });
    });

    describe("Validation", function () {
      it("Should validate creation", async function () {
        const { plugin } = await loadFixture(deployCarbonCreditPluginFixture);
        const issuer = ethers.Wallet.createRandom().address;
        const categoryData = "0x" + "00".repeat(128);
        const [valid] = await plugin.validateCreation(issuer, categoryData);
        expect(valid).to.be.true;
      });

      it("Should validate documents", async function () {
        const { plugin } = await loadFixture(deployCarbonCreditPluginFixture);
        const docHashes = [ethers.id("1"), ethers.id("2"), ethers.id("3"), ethers.id("4"), ethers.id("5")];
        const docTypes = ["REGISTRY_CERT", "PROJECT_DOCS", "ISSUANCE_CERT", "VERIFICATION_REPORT", "RETIREMENT_CHECK"];
        const [valid] = await plugin.validateDocuments(docHashes, docTypes);
        expect(valid).to.be.true;
      });

      it("Should validate valuation", async function () {
        const { plugin } = await loadFixture(deployCarbonCreditPluginFixture);
        const [valid] = await plugin.validateValuation(ethers.parseEther("10000"), ethers.toUtf8Bytes("data"));
        expect(valid).to.be.true;
      });
    });
  });
});
