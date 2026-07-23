import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './migrations',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://quantum_parks:quantum_parks@localhost:5432/quantum_parks',
  },
  strict: true,
  verbose: true,
});
