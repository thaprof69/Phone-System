import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import { createDatabase } from './index.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const { db, pool } = createDatabase(databaseUrl);
await migrate(db, {
  migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)),
});
await pool.end();
console.log('Database migrations complete.');
