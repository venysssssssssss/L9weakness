import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dataDir = path.join(__dirname, '../../data');

try {
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
} catch (error) {
    console.error("Failed to create data directory:", error);
}

const dbPath = path.join(dataDir, 'mtg.db');
let db: Database.Database;

try {
    db = new Database(dbPath);
    // Initialize tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS cards (
        id TEXT PRIMARY KEY,
        name TEXT,
        mana_cost TEXT,
        type_line TEXT,
        oracle_text TEXT,
        image_uri TEXT,
        power TEXT,
        toughness TEXT,
        colors TEXT,
        cmc REAL
      );
    `);
    console.log("Database initialized successfully.");
} catch (error) {
    console.error("Failed to initialize database:", error);
    process.exit(1); // Fatal error
}

export default db;
