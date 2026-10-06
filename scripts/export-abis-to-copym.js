const fs = require('fs');
const path = require('path');

const cratsArtifactsDir = path.join(__dirname, '..', 'artifacts');
const copymAbiDir = 'c:/Users/anask/Desktop/CPM/copym-platform/backend/config/abi';

// Define the comprehensive mapping of contracts to their respective layers
const layerMapping = {
  'layer1-identity': [
    { name: 'IdentityRegistry', rel: 'contracts/identity/IdentityRegistry.sol/IdentityRegistry.json' },
    { name: 'IdentitySBT', rel: 'contracts/identity/IdentitySBT.sol/IdentitySBT.json' },
    { name: 'KYCProvidersRegistry', rel: 'contracts/identity/KYCProvidersRegistry.sol/KYCProvidersRegistry.json' },
    { name: 'InvestorRightsRegistry', rel: 'contracts/identity/InvestorRightsRegistry.sol/InvestorRightsRegistry.json' },
    { name: 'ComplianceModule', rel: 'contracts/compliance/Compliance.sol/Compliance.json' },
    { name: 'Compliance', rel: 'contracts/compliance/Compliance.sol/Compliance.json' },
    { name: 'TravelRuleModule', rel: 'contracts/compliance/TravelRuleModule.sol/TravelRuleModule.json' },
    { name: 'CircuitBreakerModule', rel: 'contracts/compliance/CircuitBreakerModule.sol/CircuitBreakerModule.json' },
    { name: 'SanctionsOracle', rel: 'contracts/compliance/SanctionsOracle.sol/SanctionsOracle.json' }
  ],
  'layer2-asset': [
    { name: 'AssetToken', rel: 'contracts/asset/AssetToken.sol/AssetToken.json' },
    { name: 'AssetFactory', rel: 'contracts/asset/AssetFactory.sol/AssetFactory.json' },
    { name: 'AssetRegistry', rel: 'contracts/asset/AssetRegistry.sol/AssetRegistry.json' },
    { name: 'AssetOracle', rel: 'contracts/asset/AssetOracle.sol/AssetOracle.json' },
    { name: 'CircuitBreakerModule', rel: 'contracts/asset/CircuitBreakerModule.sol/CircuitBreakerModule.json' },
    { name: 'OwnershipSyncManager', rel: 'contracts/asset/OwnershipSyncManager.sol/OwnershipSyncManager.json' },
    { name: 'RealEstatePlugin', rel: 'contracts/asset/plugins/RealEstatePlugin.sol/RealEstatePlugin.json' },
    { name: 'FineArtPlugin', rel: 'contracts/asset/plugins/FineArtPlugin.sol/FineArtPlugin.json' },
    { name: 'CarbonCreditPlugin', rel: 'contracts/asset/plugins/CarbonCreditPlugin.sol/CarbonCreditPlugin.json' },
    { name: 'CarbonRetirementPlugin', rel: 'contracts/asset/plugins/CarbonRetirementPlugin.sol/CarbonRetirementPlugin.json' },
    { name: 'CarbonBatchManager', rel: 'contracts/asset/carbon/CarbonBatchManager.sol/CarbonBatchManager.json' },
    { name: 'CarbonAssetMetadataStore', rel: 'contracts/asset/carbon/CarbonAssetMetadataStore.sol/CarbonAssetMetadataStore.json' },
    { name: 'DMSRegistry', rel: 'contracts/asset/DMSRegistry.sol/DMSRegistry.json' }
  ],
  'layer3-financial': [
    { name: 'SyncVault', rel: 'contracts/vault/SyncVault.sol/SyncVault.json' },
    { name: 'AsyncVault', rel: 'contracts/vault/AsyncVault.sol/AsyncVault.json' },
    { name: 'BaseVault', rel: 'contracts/vault/BaseVault.sol/BaseVault.json' },
    { name: 'VaultFactory', rel: 'contracts/financial/VaultFactory.sol/VaultFactory.json' },
    { name: 'YieldDistributor', rel: 'contracts/financial/YieldDistributor.sol/YieldDistributor.json' },
    { name: 'FeeEngine', rel: 'contracts/financial/FeeEngine.sol/FeeEngine.json' },
    { name: 'NAVOracle', rel: 'contracts/market/NAVOracle.sol/NAVOracle.json' },
    { name: 'NAVScheduler', rel: 'contracts/market/NAVScheduler.sol/NAVScheduler.json' },
    { name: 'DisputeResolver', rel: 'contracts/market/DisputeResolver.sol/DisputeResolver.json' },
    { name: 'RedemptionManager', rel: 'contracts/financial/RedemptionManager.sol/RedemptionManager.json' },
    { name: 'LifecycleExitManager', rel: 'contracts/financial/LifecycleExitManager.sol/LifecycleExitManager.json' },
    { name: 'CarbonRetirementManager', rel: 'contracts/financial/CarbonRetirementManager.sol/CarbonRetirementManager.json' },
    { name: 'GovernanceMultisig', rel: 'contracts/financial/GovernanceMultisig.sol/GovernanceMultisig.json' }
  ],
  'layer4-market': [
    { name: 'MarketplaceFactory', rel: 'contracts/market/MarketplaceFactory.sol/MarketplaceFactory.json' },
    { name: 'OrderBookEngine', rel: 'contracts/market/OrderBookEngine.sol/OrderBookEngine.json' },
    { name: 'SettlementEngine', rel: 'contracts/market/SettlementEngine.sol/SettlementEngine.json' },
    { name: 'ClearingHouse', rel: 'contracts/market/ClearingHouse.sol/ClearingHouse.json' },
    { name: 'PriceOracle', rel: 'contracts/market/PriceOracle.sol/PriceOracle.json' },
    { name: 'AMMPool', rel: 'contracts/market/AMMPool.sol/AMMPool.json' },
    { name: 'BestExecution', rel: 'contracts/market/BestExecution.sol/BestExecution.json' },
    { name: 'ComplianceGate', rel: 'contracts/market/ComplianceGate.sol/ComplianceGate.json' },
    { name: 'LiquidityManager', rel: 'contracts/market/LiquidityManager.sol/LiquidityManager.json' },
    { name: 'MarketSurveillance', rel: 'contracts/market/MarketSurveillance.sol/MarketSurveillance.json' },
    { name: 'MatchingEngine', rel: 'contracts/market/MatchingEngine.sol/MatchingEngine.json' },
    { name: 'MEVProtection', rel: 'contracts/market/MEVProtection.sol/MEVProtection.json' },
    { name: 'TimelockController', rel: '@openzeppelin/contracts/governance/TimelockController.sol/TimelockController.json' },
    { name: 'Timelock', rel: '@openzeppelin/contracts/governance/TimelockController.sol/TimelockController.json' }
  ],
  'interfaces': [
    { name: 'ISyncVault', rel: 'contracts/interfaces/vault/ISyncVault.sol/ISyncVault.json' },
    { name: 'IAsyncVault', rel: 'contracts/interfaces/vault/IAsyncVault.sol/IAsyncVault.json' },
    { name: 'IVaultFactory', rel: 'contracts/interfaces/financial/IVaultFactory.sol/IVaultFactory.json' },
    { name: 'IAssetToken', rel: 'contracts/interfaces/asset/IAssetToken.sol/IAssetToken.json' },
    { name: 'IAssetFactory', rel: 'contracts/interfaces/asset/IAssetFactory.sol/IAssetFactory.json' },
    { name: 'IAssetRegistry', rel: 'contracts/interfaces/asset/IAssetRegistry.sol/IAssetRegistry.json' },
    { name: 'IIdentityRegistry', rel: 'contracts/interfaces/identity/IIdentityRegistry.sol/IIdentityRegistry.json' },
    { name: 'IIdentitySBT', rel: 'contracts/interfaces/identity/IIdentitySBT.sol/IIdentitySBT.json' },
    { name: 'IKYCProvidersRegistry', rel: 'contracts/interfaces/identity/IKYCProvidersRegistry.sol/IKYCProvidersRegistry.json' },
    { name: 'ICompliance', rel: 'contracts/interfaces/compliance/ICompliance.sol/ICompliance.json' },
    { name: 'IFeeEngine', rel: 'contracts/interfaces/financial/IFeeEngine.sol/IFeeEngine.json' },
    { name: 'INAVOracle', rel: 'contracts/interfaces/financial/INAVOracle.sol/INAVOracle.json' },
    { name: 'IRedemptionManager', rel: 'contracts/interfaces/financial/IRedemptionManager.sol/IRedemptionManager.json' },
    { name: 'IYieldDistributor', rel: 'contracts/interfaces/financial/IYieldDistributor.sol/IYieldDistributor.json' },
    { name: 'ITravelRuleModule', rel: 'contracts/interfaces/compliance/ITravelRuleModule.sol/ITravelRuleModule.json' },
    { name: 'IInvestorRightsRegistry', rel: 'contracts/interfaces/identity/IInvestorRightsRegistry.sol/IInvestorRightsRegistry.json' },
    { name: 'IERC7540', rel: 'contracts/interfaces/standards/IERC7540.sol/IERC7540.json' },
    { name: 'IERC20', rel: '@openzeppelin/contracts/token/ERC20/IERC20.sol/IERC20.json' },
    { name: 'ERC20', rel: '@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json' },
    { name: 'AggregatorV3Interface', rel: 'contracts/interfaces/standards/AggregatorV3Interface.sol/AggregatorV3Interface.json' }
  ]
};

// Aliases mapping (e.g. layer1 -> layer1-identity)
const layerAliases = {
  'layer1': 'layer1-identity',
  'layer2': 'layer2-asset',
  'layer3': 'layer3-financial',
  'layer4': 'layer4-market',
  'layer4-marketplace': 'layer4-market'
};

function main() {
  console.log('>>> Exporting ABIs to copym-platform/backend/config/abi...');

  if (!fs.existsSync(copymAbiDir)) {
    fs.mkdirSync(copymAbiDir, { recursive: true });
  }

  const allExportedContracts = {};

  // Process primary layers
  for (const [layerDirName, contracts] of Object.entries(layerMapping)) {
    const targetDir = path.join(copymAbiDir, layerDirName);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const layerExports = [];

    for (const item of contracts) {
      const srcPath = path.join(cratsArtifactsDir, item.rel);
      if (!fs.existsSync(srcPath)) {
        console.warn(`⚠️ Source artifact not found: ${srcPath}`);
        continue;
      }

      const raw = fs.readFileSync(srcPath, 'utf8');
      const artifact = JSON.parse(raw);

      // Clean, well-structured artifact object
      const outputData = {
        _format: artifact._format || 'hh-sol-artifact-1',
        contractName: item.name,
        sourceName: artifact.sourceName,
        abi: artifact.abi,
        bytecode: artifact.bytecode || '0x',
        deployedBytecode: artifact.deployedBytecode || '0x'
      };

      const outPath = path.join(targetDir, `${item.name}.json`);
      fs.writeFileSync(outPath, JSON.stringify(outputData, null, 2), 'utf8');

      layerExports.push(item.name);
      allExportedContracts[item.name] = {
        layer: layerDirName,
        abi: artifact.abi
      };

      // Also copy root-level identity files for backward-compatibility with cratsIdentityService
      if (['IdentityRegistry', 'IdentitySBT', 'KYCProvidersRegistry'].includes(item.name)) {
        const rootOut = path.join(copymAbiDir, `${item.name}.json`);
        fs.writeFileSync(rootOut, JSON.stringify(outputData, null, 2), 'utf8');
      }
    }

    // Generate layer index.js
    const indexLines = [
      '// Auto-generated ABI exports for ' + layerDirName,
      'import fs from "fs";',
      'import path from "path";',
      'import { fileURLToPath } from "url";',
      '',
      'const __filename = fileURLToPath(import.meta.url);',
      'const __dirname = path.dirname(__filename);',
      '',
      'const loadAbi = (name) => {',
      '  const raw = fs.readFileSync(path.join(__dirname, `${name}.json`), "utf8");',
      '  const parsed = JSON.parse(raw);',
      '  return parsed.abi || parsed;',
      '};',
      ''
    ];

    layerExports.forEach(name => {
      indexLines.push(`export const ${name}ABI = loadAbi("${name}");`);
    });

    indexLines.push('');
    indexLines.push('export default {');
    layerExports.forEach(name => {
      indexLines.push(`  ${name}: ${name}ABI,`);
    });
    indexLines.push('};');

    fs.writeFileSync(path.join(targetDir, 'index.js'), indexLines.join('\n'), 'utf8');
    console.log(`✅ ${layerDirName}: ${layerExports.length} contract ABIs exported + index.js created`);
  }

  // Create alias directories (layer1, layer2, layer3, layer4) mirroring the content
  for (const [alias, sourceLayer] of Object.entries(layerAliases)) {
    const aliasDir = path.join(copymAbiDir, alias);
    const sourceDir = path.join(copymAbiDir, sourceLayer);
    if (!fs.existsSync(aliasDir)) {
      fs.mkdirSync(aliasDir, { recursive: true });
    }

    const files = fs.readdirSync(sourceDir);
    for (const f of files) {
      fs.copyFileSync(path.join(sourceDir, f), path.join(aliasDir, f));
    }
    console.log(`✅ Created alias directory: ${alias} (mirrors ${sourceLayer})`);
  }

  // Create root index.js in copym-platform/backend/config/abi/index.js
  const rootIndexLines = [
    '/**',
    ' * CRATS Protocol — Unified Smart Contract ABI Directory',
    ' * Auto-generated exports for all layers and individual contracts',
    ' */',
    'import fs from "fs";',
    'import path from "path";',
    'import { fileURLToPath } from "url";',
    'import { ethers } from "ethers";',
    '',
    'const __filename = fileURLToPath(import.meta.url);',
    'const __dirname = path.dirname(__filename);',
    '',
    '/**',
    ' * Loads full contract artifact (including ABI, bytecode, and metadata)',
    ' */',
    'export const getArtifact = (contractName, layer = null) => {',
    '  const possiblePaths = [',
    '    path.join(__dirname, `${contractName}.json`),',
    '    path.join(__dirname, "layer1-identity", `${contractName}.json`),',
    '    path.join(__dirname, "layer2-asset", `${contractName}.json`),',
    '    path.join(__dirname, "layer3-financial", `${contractName}.json`),',
    '    path.join(__dirname, "layer4-market", `${contractName}.json`),',
    '    path.join(__dirname, "interfaces", `${contractName}.json`),',
    '  ];',
    '  if (layer) {',
    '    possiblePaths.unshift(path.join(__dirname, layer, `${contractName}.json`));',
    '  }',
    '  for (const p of possiblePaths) {',
    '    if (fs.existsSync(p)) {',
    '      return JSON.parse(fs.readFileSync(p, "utf8"));',
    '    }',
    '  }',
    '  throw new Error(`Contract artifact not found for ${contractName}`);',
    '};',
    '',
    '/**',
    ' * Loads raw ABI array for ethers.Contract instantiation',
    ' */',
    'export const getABI = (contractName, layer = null) => {',
    '  const artifact = getArtifact(contractName, layer);',
    '  return artifact.abi || artifact;',
    '};',
    '',
    '/**',
    ' * Instantiates an ethers.js Contract helper',
    ' */',
    'export const getContract = (contractName, address, signerOrProvider, layer = null) => {',
    '  const abi = getABI(contractName, layer);',
    '  return new ethers.Contract(address, abi, signerOrProvider);',
    '};',
    ''
  ];

  // Add individual ABI helper exports
  const contractNames = Object.keys(allExportedContracts);
  contractNames.forEach(name => {
    rootIndexLines.push(`export const ${name}ABI = getABI("${name}");`);
  });

  rootIndexLines.push('');
  rootIndexLines.push('export default {');
  rootIndexLines.push('  getArtifact,');
  rootIndexLines.push('  getABI,');
  rootIndexLines.push('  getContract,');
  contractNames.forEach(name => {
    rootIndexLines.push(`  ${name}: ${name}ABI,`);
  });
  rootIndexLines.push('};');

  fs.writeFileSync(path.join(copymAbiDir, 'index.js'), rootIndexLines.join('\n'), 'utf8');
  console.log(`✅ Root index.js generated at ${path.join(copymAbiDir, 'index.js')}`);

  console.log('\n🎉 ALL ABIs EXPORTED TO COPYM BACKEND SUCCESSFULLY!');
}

main();
