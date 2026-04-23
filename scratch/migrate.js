import { config } from 'dotenv';
import { resolve } from 'path';
import { migrateSchema } from '../app/lib/db.js';

// Load env vars
config({ path: resolve('.env.local') });

async function run() {
  try {
    await migrateSchema();
    console.log('Migration successful.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

run();
