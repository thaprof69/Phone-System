import { createHash } from 'node:crypto';
import { createDatabase, digitalLinks, providerWorkspaces, voiceAgents } from './index.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const { db, pool } = createDatabase(databaseUrl);

const existingWorkspace = await db.query.providerWorkspaces.findFirst();
if (!existingWorkspace) {
  await db.insert(providerWorkspaces).values({
    environment: 'development',
    providerWorkspaceId: 'workspace_synthetic',
    region: 'eu-simulator',
    displayName: 'Synthetic ElevenLabs workspace',
    synthetic: true,
  });
}
const existingAgent = await db.query.voiceAgents.findFirst();
if (!existingAgent) {
  await db.insert(voiceAgents).values({
    name: 'Quantum Parks Receptionist (Synthetic)',
    purpose: 'Deterministic local development and acceptance testing',
    synthetic: true,
  });
}
const localHandoffToken = 'qp_local_handoff_token_000000000001';
await db
  .insert(digitalLinks)
  .values({
    purpose: 'CUSTOMER_REGISTRATION',
    destinationKey: 'customer-web-registration',
    tokenHash: createHash('sha256').update(localHandoffToken).digest('hex'),
    expiresAt: new Date('2099-01-01T00:00:00.000Z'),
  })
  .onConflictDoNothing();
await pool.end();
console.log(
  `Synthetic seed complete (${createHash('sha256').update('quantum-parks-synthetic-v1').digest('hex')}); local handoff token: ${localHandoffToken}.`,
);
