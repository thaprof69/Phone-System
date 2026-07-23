import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { NativeConnection, Worker } from '@temporalio/worker';
import { loadConfiguration, runtimeSecret } from '@quantum-parks/config';
import { activities } from './activities.js';

loadConfiguration();
runtimeSecret('LOCAL_ELEVENLABS_API_KEY', 'synthetic-api-key');

const here = dirname(fileURLToPath(import.meta.url));
const connection = await NativeConnection.connect({
  address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233',
});
const worker = await Worker.create({
  connection,
  namespace: process.env.TEMPORAL_NAMESPACE ?? 'default',
  taskQueue: process.env.TEMPORAL_TASK_QUEUE ?? 'quantum-parks-post-call',
  workflowsPath: resolve(here, '../../../packages/workflows/dist/index.js'),
  activities,
});

const shutdown = async () => {
  worker.shutdown();
  await connection.close();
};
process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());

await worker.run();
