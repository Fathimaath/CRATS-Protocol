const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { Interface, encodeBytes32String, parseUnits, id } = require('ethers');
require('dotenv').config();

const db = require('./database');
const fb = require('./fireblocks');
const bc = require('./blockchain');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// --- Helper Functions ---
const getUserById = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);
const getUserByUsername = (username) => db.prepare('SELECT * FROM users WHERE username = ?').get(username);

app.get('/', (req, res) => res.json({ message: 'CRATS Backend is running' }));

app.post('/api/register', async (req, res) => {
    const { username } = req.body;
    try {
        const existingUser = getUserByUsername(username);
        if (existingUser) return res.json(existingUser);
        const vault = await fb.createVaultAccount(username);
        const asset = await fb.createAssetWallet(vault.id, 'ETH_TEST5');
        const userId = uuidv4();
        db.prepare('INSERT INTO users (id, username, vault_id, wallet_address) VALUES (?, ?, ?, ?)')
            .run(userId, username, vault.id, asset.address);
        res.json({ id: userId, username, vault_id: vault.id, wallet_address: asset.address });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/kyc', async (req, res) => {
    const { userId } = req.body;
    const user = getUserById(userId);
    try {
        await bc.registerKYC(user.wallet_address);
        await bc.mintSBT(user.wallet_address);
        db.prepare('UPDATE users SET kyc_status = ?, sbt_minted = ? WHERE id = ?').run('COMPLETED', 1, userId);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/tokenize', async (req, res) => {
    const { userId, name, symbol, supply, category } = req.body;
    console.log('DEBUG: Tokenizing:', { name, symbol, supply, category });
    
    const user = getUserById(userId);
    try {
        await bc.approveIssuer(user.wallet_address);

        // USE LIMITED ABI TO AVOID OVERLOAD AMBIGUITY
        const iface = new Interface([
            "function deployAsset(string name, string symbol, uint256 initialSupply, bytes32 category) external returns (address)"
        ]);
        
        const catId = id((category || 'REAL_ESTATE').toUpperCase().replace(/\s+/g, '_'));
        const supplyVal = parseUnits(supply || "0", 18);

        const data = iface.encodeFunctionData('deployAsset', [
            String(name),
            String(symbol),
            supplyVal,
            catId
        ]);

        const tx = await fb.submitTransaction({
            operation: 'CONTRACT_CALL',
            assetId: 'ETH_TEST5',
            source: { type: 'VAULT_ACCOUNT', id: process.env.TREASURY_VAULT_ID },
            destination: { type: 'ONE_TIME_ADDRESS', id: process.env.ASSET_FACTORY },
            amount: '0',
            extraParameters: { contractCallData: data },
            note: `Institutional Tokenization: ${name} (Issuer: ${user.username})`
        });

        // Track the asset deployment in the database
        const assetId = uuidv4();
        db.prepare('INSERT INTO assets (id, owner_id, name, symbol, category, status) VALUES (?, ?, ?, ?, ?, ?)')
            .run(assetId, userId, name, symbol, category, 'DEPLOYED');

        res.json({ success: true, transaction_id: tx.id });
    } catch (error) {
        console.error('Tokenize Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/list', async (req, res) => {
    const { userId, assetTokenAddress, name, symbol, category } = req.body;
    const user = getUserById(userId);
    try {
        await bc.grantVaultCreatorRole(user.wallet_address);
        
        // USE LIMITED ABI
        const iface = new Interface([
            "function createSyncVault(address assetToken, string name, string symbol, bytes32 category) external returns (address)"
        ]);

        const catId = id((category || 'REAL_ESTATE').toUpperCase().replace(/\s+/g, '_'));
        const data = iface.encodeFunctionData('createSyncVault', [
            assetTokenAddress || '0x0000000000000000000000000000000000000000',
            String(name),
            String(symbol),
            catId
        ]);

        const tx = await fb.submitTransaction({
            operation: 'CONTRACT_CALL',
            assetId: 'ETH_TEST5',
            source: { type: 'VAULT_ACCOUNT', id: user.vault_id },
            destination: { type: 'ONE_TIME_ADDRESS', id: process.env.VAULT_FACTORY },
            amount: '0',
            extraParameters: { contractCallData: data },
            note: `Listing ${name}`
        });
        res.json({ success: true, transaction_id: tx.id });
    } catch (error) {
        console.error('List Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/assets/:userId', (req, res) => {
    try {
        const assets = db.prepare('SELECT * FROM assets WHERE owner_id = ?').all(req.params.userId);
        res.json(assets);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => console.log(`Server running on ${PORT}`));
