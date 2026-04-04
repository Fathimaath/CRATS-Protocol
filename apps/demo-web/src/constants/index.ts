export const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

export const IDENTITY_REGISTRY_ADDR = "0xd8B1417b0afd98407732daB038931dB116d61648";
export const IDENTITY_SBT_ADDR = "0x90d4894ce02155362fFC3cc2a295a9bC4B9d9c07";
export const ASSET_FACTORY_ADDR = "0xc991c1614c850795Dc844ce089f95338372710e8";
export const VAULT_FACTORY_ADDR = "0xEb8d904725457f871283356e8a048D3e8De6d46f";

export const CONTRACTS = {
  sepolia: {
    kycRegistry: "0x6FD25753C391e3f36BBA8CF614Cd2a947011a56E",
    identitySBT: "0x90d4894ce02155362fFC3cc2a295a9bC4B9d9c07",
    identityRegistry: "0xd8B1417b0afd98407732daB038931dB116d61648",
    complianceModule: "0xF8D1757f1DCA0699B3E8e22Ab28c34d5692f77b7",
    travelRuleModule: "0x0c21CB3DD577B8C0D1Af4f605798780402769bA9",
    investorRightsRegistry: "0x3DeC102590f69D769A981F36038c0045c8a24868",
    circuitBreaker: "0xF474da09a72Dbf9AFCF1F9a1E13FD474eC46168f",
    assetTokenTemplate: "0x1Ca9c4B5B06f2b77C574dd62f1AFbfeA4f6F7A7a",
    assetFactory: "0xc991c1614c850795Dc844ce089f95338372710e8",
    assetOracleTemplate: "0x9008fFA6b79455436Efbd5f097788676CaA67DB2",
    assetRegistryTemplate: "0xF07E0d7c8e2904E091E68123adFe8fE869064029",
    syncVaultTemplate: "0x31d6c02a91e4cc991e4cD40efE3038be15CBEA10",
    asyncVaultTemplate: "0x4d632Cd53b834C1D292f041006Ed118f8F54E59E",
    vaultFactory: "0xEb8d904725457f871283356e8a048D3e8De6d46f",
    yieldDistributor: "0x54C0f3A48a9D640B2937cfDE4C1C0D4D2f1F67eC",
    marketplaceFactory: "0xeA849878000E97d5FFcbeC7ae505c8A44f05ADa0",
    clearingHouse: "0xdB6676f99a5793FA219E0172c1efc0D7F64A529b"
  }
};

export const MOCK_ASSETS = [
  {
    id: 'AZURE',
    name: 'Azure Manor',
    category: 'Real Estate',
    price: '$1.00',
    supply: '10,000,000',
    nav: '$10,000,000',
    apr: '7.5%',
    image: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?q=80&w=600&auto=format&fit=crop'
  },
  {
    id: 'SUNSET',
    name: 'Sunset Heights',
    category: 'Real Estate',
    price: '$2.50',
    supply: '5,000,000',
    nav: '$12,500,000',
    apr: '6.2%',
    image: 'https://images.unsplash.com/photo-1600607687931-cebf1422ab87?q=80&w=600&auto=format&fit=crop'
  }
];
