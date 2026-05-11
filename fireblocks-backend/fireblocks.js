const { FireblocksSDK } = require('fireblocks-sdk');
const fs = require('fs');
require('dotenv').config();

const apiPrivateKey = fs.readFileSync(process.env.FIREBLOCKS_API_PRIVATE_KEY_PATH || './fireblocks_secret.key', 'utf8');
const fireblocks = new FireblocksSDK(apiPrivateKey, process.env.FIREBLOCKS_API_KEY, process.env.FIREBLOCKS_BASE_URL);

/**
 * Creates a new vault account for a user.
 */
async function createVaultAccount(name) {
    return await fireblocks.createVaultAccount(name);
}

/**
 * Creates an asset wallet (e.g. ETH_TEST5) in a vault.
 */
async function createAssetWallet(vaultId, assetId) {
    return await fireblocks.createAssetWallet(vaultId, assetId);
}

/**
 * Submits a transaction to Fireblocks.
 * Handles both regular transfers and CONTRACT_CALLs.
 */
async function submitTransaction(args) {
    try {
        // Sanitize CONTRACT_CALL destination if needed
        if (args.operation === 'CONTRACT_CALL' && args.destination && args.destination.type === 'ONE_TIME_ADDRESS') {
            const address = args.destination.id || (args.destination.oneTimeAddress && args.destination.oneTimeAddress.address) || args.destination.oneTimeAddress;
            if (address) {
                args.destination.oneTimeAddress = { address: address };
                delete args.destination.id;
            }
        }

        const result = await fireblocks.createTransaction(args);
        return result;
    } catch (error) {
        if (error.response && error.response.data) {
            console.error('Fireblocks API Error Details:', JSON.stringify(error.response.data, null, 2));
        }
        throw error;
    }
}

/**
 * Gets transaction details by ID.
 */
async function getTransactionById(txId) {
    return await fireblocks.getTransactionById(txId);
}

/**
 * Gets vault account details.
 */
async function getVaultAccountById(vaultId) {
    return await fireblocks.getVaultAccountById(vaultId);
}

module.exports = {
    fireblocks,
    createVaultAccount,
    createAssetWallet,
    submitTransaction,
    getTransactionById,
    getVaultAccountById
};
