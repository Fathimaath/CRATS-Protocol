const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, 'crats.db');
const db = new Database(dbPath);

// Initialize database schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE,
    vault_id TEXT,
    wallet_address TEXT,
    kyc_status TEXT DEFAULT 'PENDING',
    sbt_minted BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    owner_id TEXT,
    token_address TEXT,
    vault_address TEXT,
    name TEXT,
    symbol TEXT,
    category TEXT,
    status TEXT DEFAULT 'DEPLOYED',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(owner_id) REFERENCES users(id)
  );
`);

module.exports = db;
