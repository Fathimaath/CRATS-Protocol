const { ethers } = require('ethers');
require('dotenv').config();

// Contract ABIs
const IdentityRegistryABI = require('../artifacts/contracts/identity/IdentityRegistry.sol/IdentityRegistry.json').abi;
const IdentitySBTABI = require('../artifacts/contracts/identity/IdentitySBT.sol/IdentitySBT.json').abi;
const AssetFactoryABI = require('../artifacts/contracts/asset/AssetFactory.sol/AssetFactory.json').abi;
const VaultFactoryABI = require('../artifacts/contracts/financial/VaultFactory.sol/VaultFactory.json').abi;

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const adminWallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider);

// Contract Instances
// Note: We use IDENTITY_REGISTRY instead of KYC_REGISTRY
const identityRegistry = new ethers.Contract(process.env.IDENTITY_REGISTRY || '0xb3f00a86c30Ab89857feD6eb0d0c267B22036Df6', IdentityRegistryABI, adminWallet);
const identitySBT = new ethers.Contract(process.env.IDENTITY_SBT, IdentitySBTABI, adminWallet);
const assetFactory = new ethers.Contract(process.env.ASSET_FACTORY, AssetFactoryABI, adminWallet);
const vaultFactory = new ethers.Contract(process.env.VAULT_FACTORY, VaultFactoryABI, adminWallet);

/**
 * Registers a user identity in the IdentityRegistry.
 * This effectively "completes KYC" for the user.
 * @param {string} userAddress - The address to register.
 * @returns {Promise<ethers.TransactionResponse>}
 */
async function registerKYC(userAddress) {
    try {
        // Source: IdentityRegistry.sol registerIdentity signature
        // primaryWallet, role, jurisdiction, didHash, did, expiresAt
        const role = 1; // Investor
        const jurisdiction = 1; // Generic
        const didHash = ethers.id(userAddress);
        const did = `did:crats:${userAddress}`;
        const expiresAt = Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60); // 1 year

        const tx = await identityRegistry.registerIdentity(
            userAddress,
            role,
            jurisdiction,
            didHash,
            did,
            expiresAt
        );
        await tx.wait();
        return tx;
    } catch (error) {
        console.error('Error registering KYC in IdentityRegistry:', error);
        throw error;
    }
}

/**
 * Mints an Identity SBT to a user.
 * (Note: IdentityRegistry already mints the SBT internally in registerIdentity)
 * This function can be used if manual minting is required or for verification.
 */
async function mintSBT(userAddress) {
    // IdentityRegistry.registerIdentity already handles this.
    return { hash: 'IdentityRegistry handled minting' };
}

/**
 * Approves a user's address as an issuer in the AssetFactory.
 */
async function approveIssuer(userAddress) {
    try {
        const tx = await assetFactory.approveIssuer(userAddress);
        await tx.wait();
        return tx;
    } catch (error) {
        console.error('Error approving issuer:', error);
        throw error;
    }
}

/**
 * Grants VAULT_CREATOR_ROLE to a user in the VaultFactory.
 */
async function grantVaultCreatorRole(userAddress) {
    try {
        const ROLE = await vaultFactory.VAULT_CREATOR_ROLE();
        const tx = await vaultFactory.grantRole(ROLE, userAddress);
        await tx.wait();
        return tx;
    } catch (error) {
        console.error('Error granting vault creator role:', error);
        throw error;
    }
}

module.exports = {
    provider,
    adminWallet,
    identityRegistry,
    identitySBT,
    assetFactory,
    vaultFactory,
    registerKYC,
    mintSBT,
    approveIssuer,
    grantVaultCreatorRole
};
