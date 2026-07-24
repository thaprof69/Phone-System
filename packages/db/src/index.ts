import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

export * from './schema.js';

export function createDatabase(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl, max: 20 });
  return { db: drizzle(pool, { schema }), pool };
}

/** The schema-aware Drizzle instance, for modules that receive a connection. */
export type Database = ReturnType<typeof createDatabase>['db'];
