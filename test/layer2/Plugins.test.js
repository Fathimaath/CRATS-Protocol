const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Layer 2 - Plugins", function () {
  let realEstatePlugin, fineArtPlugin, carbonCreditPlugin;

  beforeEach(async function () {
    const RealEstatePlugin = await ethers.getContractFactory("RealEstatePlugin");
    realEstatePlugin = await RealEstatePlugin.deploy();
    await realEstatePlugin.waitForDeployment();

    const FineArtPlugin = await ethers.getContractFactory("FineArtPlugin");
    fineArtPlugin = await FineArtPlugin.deploy();
    await fineArtPlugin.waitForDeployment();

    const CarbonCreditPlugin = await ethers.getContractFactory("CarbonCreditPlugin");
    carbonCreditPlugin = await CarbonCreditPlugin.deploy();
    await carbonCreditPlugin.waitForDeployment();
  });

  describe("RealEstatePlugin", function () {
    describe("Identification", function () {
      it("Should return category ID", async function () {
        const categoryId = await realEstatePlugin.getCategoryId();
        expect(categoryId).to.equal(ethers.keccak256(ethers.toUtf8Bytes("REAL_ESTATE")));
      });

      it("Should return category name", async function () {
        expect(await realEstatePlugin.getCategoryName()).to.equal("Real Estate");
      });
    });

    describe("Document Requirements", function () {
      it("Should return required documents", async function () {
        const docs = await realEstatePlugin.getRequiredDocuments();
        expect(docs.length).to.equal(2);
        expect(docs[0]).to.equal("TITLE_DEED");
        expect(docs[1]).to.equal("APPRAISAL");
      });

      it("Should validate documents with all required docs", async function () {
        const docs = [
          { docType: "TITLE_DEED", docHash: ethers.keccak256(ethers.toUtf8Bytes("title")) },
          { docType: "APPRAISAL", docHash: ethers.keccak256(ethers.toUtf8Bytes("appraisal")) }
        ];
        
        const result = await realEstatePlugin.validateDocuments.staticCall(docs);
        expect(result).to.be.true;
      });

      it("Should reject documents missing title deed", async function () {
        const docs = [
          { docType: "APPRAISAL", docHash: ethers.keccak256(ethers.toUtf8Bytes("appraisal")) }
        ];
        
        await expect(
          realEstatePlugin.validateDocuments.staticCall(docs)
        ).to.be.revertedWith("RealEstate: Title Deed required");
      });

      it("Should reject documents missing appraisal", async function () {
        const docs = [
          { docType: "TITLE_DEED", docHash: ethers.keccak256(ethers.toUtf8Bytes("title")) }
        ];
        
        await expect(
          realEstatePlugin.validateDocuments.staticCall(docs)
        ).to.be.revertedWith("RealEstate: Appraisal required");
      });
    });

    describe("Creation Validation", function () {
      it("Should validate creation with valid params", async function () {
        const params = {
          name: "Test Property",
          symbol: "TPROP",
          initialSupply: ethers.parseEther("1000000"),
          categoryId: "REAL_ESTATE"
        };
        
        const result = await realEstatePlugin.validateCreation.staticCall(
          ethers.Wallet.createRandom().address,
          params
        );
        expect(result).to.be.true;
      });

      it("Should reject creation with empty name", async function () {
        const params = {
          name: "",
          symbol: "TPROP",
          initialSupply: ethers.parseEther("1000000"),
          categoryId: "REAL_ESTATE"
        };
        
        await expect(
          realEstatePlugin.validateCreation.staticCall(ethers.Wallet.createRandom().address, params)
        ).to.be.revertedWith("RealEstate: Name required");
      });

      it("Should reject creation with empty symbol", async function () {
        const params = {
          name: "Test Property",
          symbol: "",
          initialSupply: ethers.parseEther("1000000"),
          categoryId: "REAL_ESTATE"
        };
        
        await expect(
          realEstatePlugin.validateCreation.staticCall(ethers.Wallet.createRandom().address, params)
        ).to.be.revertedWith("RealEstate: Symbol required");
      });

      it("Should reject creation with zero supply", async function () {
        const params = {
          name: "Test Property",
          symbol: "TPROP",
          initialSupply: 0,
          categoryId: "REAL_ESTATE"
        };
        
        await expect(
          realEstatePlugin.validateCreation.staticCall(ethers.Wallet.createRandom().address, params)
        ).to.be.revertedWith("RealEstate: Supply required");
      });

      it("Should reject creation with wrong category", async function () {
        const params = {
          name: "Test Property",
          symbol: "TPROP",
          initialSupply: ethers.parseEther("1000000"),
          categoryId: "FINE_ART"
        };
        
        await expect(
          realEstatePlugin.validateCreation.staticCall(ethers.Wallet.createRandom().address, params)
        ).to.be.revertedWith("RealEstate: Invalid category");
      });
    });
  });

  describe("FineArtPlugin", function () {
    describe("Identification", function () {
      it("Should return category ID", async function () {
        const categoryId = await fineArtPlugin.getCategoryId();
        expect(categoryId).to.equal(ethers.keccak256(ethers.toUtf8Bytes("FINE_ART")));
      });

      it("Should return category name", async function () {
        expect(await fineArtPlugin.getCategoryName()).to.equal("Fine Art");
      });
    });

    describe("Document Requirements", function () {
      it("Should return required documents", async function () {
        const docs = await fineArtPlugin.getRequiredDocuments();
        expect(docs.length).to.equal(2);
        expect(docs[0]).to.equal("AUTHENTICATION");
        expect(docs[1]).to.equal("INSURANCE");
      });

      it("Should validate documents with all required docs", async function () {
        const docs = [
          { docType: "AUTHENTICATION", docHash: ethers.keccak256(ethers.toUtf8Bytes("auth")) },
          { docType: "INSURANCE", docHash: ethers.keccak256(ethers.toUtf8Bytes("insurance")) }
        ];
        
        const result = await fineArtPlugin.validateDocuments.staticCall(docs);
        expect(result).to.be.true;
      });

      it("Should reject documents missing authentication", async function () {
        const docs = [
          { docType: "INSURANCE", docHash: ethers.keccak256(ethers.toUtf8Bytes("insurance")) }
        ];
        
        await expect(
          fineArtPlugin.validateDocuments.staticCall(docs)
        ).to.be.revertedWith("FineArt: Authentication required");
      });

      it("Should reject documents missing insurance", async function () {
        const docs = [
          { docType: "AUTHENTICATION", docHash: ethers.keccak256(ethers.toUtf8Bytes("auth")) }
        ];
        
        await expect(
          fineArtPlugin.validateDocuments.staticCall(docs)
        ).to.be.revertedWith("FineArt: Insurance required");
      });
    });

    describe("Creation Validation", function () {
      it("Should validate creation with valid params", async function () {
        const params = {
          name: "Monet Painting",
          symbol: "MONET",
          initialSupply: ethers.parseEther("1000"),
          categoryId: "FINE_ART"
        };
        
        const result = await fineArtPlugin.validateCreation.staticCall(
          ethers.Wallet.createRandom().address,
          params
        );
        expect(result).to.be.true;
      });

      it("Should reject creation with zero supply", async function () {
        const params = {
          name: "Monet Painting",
          symbol: "MONET",
          initialSupply: 0,
          categoryId: "FINE_ART"
        };
        
        await expect(
          fineArtPlugin.validateCreation.staticCall(ethers.Wallet.createRandom().address, params)
        ).to.be.revertedWith("FineArt: Supply required");
      });

      it("Should reject creation with wrong category", async function () {
        const params = {
          name: "Monet Painting",
          symbol: "MONET",
          initialSupply: ethers.parseEther("1000"),
          categoryId: "REAL_ESTATE"
        };
        
        await expect(
          fineArtPlugin.validateCreation.staticCall(ethers.Wallet.createRandom().address, params)
        ).to.be.revertedWith("FineArt: Invalid category");
      });
    });
  });

  describe("CarbonCreditPlugin", function () {
    describe("Identification", function () {
      it("Should return category ID", async function () {
        const categoryId = await carbonCreditPlugin.getCategoryId();
        expect(categoryId).to.equal(ethers.keccak256(ethers.toUtf8Bytes("CARBON_CREDIT")));
      });

      it("Should return category name", async function () {
        expect(await carbonCreditPlugin.getCategoryName()).to.equal("Carbon Credit");
      });
    });

    describe("Document Requirements", function () {
      it("Should return required documents", async function () {
        const docs = await carbonCreditPlugin.getRequiredDocuments();
        expect(docs.length).to.equal(1);
        expect(docs[0]).to.equal("VERIFICATION_REPORT");
      });

      it("Should validate documents with required doc", async function () {
        const docs = [
          { docType: "VERIFICATION_REPORT", docHash: ethers.keccak256(ethers.toUtf8Bytes("report")) }
        ];
        
        const result = await carbonCreditPlugin.validateDocuments.staticCall(docs);
        expect(result).to.be.true;
      });

      it("Should reject documents missing verification report", async function () {
        const docs = [
          { docType: "OTHER_DOC", docHash: ethers.keccak256(ethers.toUtf8Bytes("other")) }
        ];
        
        await expect(
          carbonCreditPlugin.validateDocuments.staticCall(docs)
        ).to.be.revertedWith("CarbonCredit: Verification Report required");
      });
    });

    describe("Creation Validation", function () {
      it("Should validate creation with valid params", async function () {
        const params = {
          name: "Forest Carbon Project",
          symbol: "FOREST",
          initialSupply: ethers.parseEther("100000"),
          categoryId: "CARBON_CREDIT"
        };
        
        const result = await carbonCreditPlugin.validateCreation.staticCall(
          ethers.Wallet.createRandom().address,
          params
        );
        expect(result).to.be.true;
      });

      it("Should reject creation with zero supply", async function () {
        const params = {
          name: "Forest Carbon Project",
          symbol: "FOREST",
          initialSupply: 0,
          categoryId: "CARBON_CREDIT"
        };
        
        await expect(
          carbonCreditPlugin.validateCreation.staticCall(ethers.Wallet.createRandom().address, params)
        ).to.be.revertedWith("CarbonCredit: Supply required");
      });

      it("Should reject creation with wrong category", async function () {
        const params = {
          name: "Forest Carbon Project",
          symbol: "FOREST",
          initialSupply: ethers.parseEther("100000"),
          categoryId: "REAL_ESTATE"
        };
        
        await expect(
          carbonCreditPlugin.validateCreation.staticCall(ethers.Wallet.createRandom().address, params)
        ).to.be.revertedWith("CarbonCredit: Invalid category");
      });
    });
  });
});
