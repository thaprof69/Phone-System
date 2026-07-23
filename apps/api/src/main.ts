import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { loadConfiguration, runtimeSecret } from '@quantum-parks/config';
import { OpenAIResponsesProvider } from '@quantum-parks/intelligence';
import { AppModule } from './app.module.js';

const configuration = loadConfiguration();
runtimeSecret('LOCAL_ELEVENLABS_API_KEY', 'synthetic-api-key');
runtimeSecret('LOCAL_ELEVENLABS_WEBHOOK_SECRET', 'synthetic-webhook-secret');
runtimeSecret('LOCAL_TOOL_TOKEN', 'synthetic-tool-token');
runtimeSecret('METRICS_TOKEN', 'synthetic-metrics-token');
if (configuration.ENRICHMENT_PROVIDER === 'openai-responses') {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !configuration.OPENAI_MODEL) {
    console.warn(
      'OpenAI enrichment is configured but its runtime secret or model is unavailable; call ingestion will continue and readiness will remain degraded.',
    );
  } else {
    const health = await new OpenAIResponsesProvider({
      apiKey,
      model: configuration.OPENAI_MODEL,
      ...(process.env.OPENAI_BASE_URL ? { baseUrl: process.env.OPENAI_BASE_URL } : {}),
    }).health();
    if (health.status !== 'SUCCESS' || !health.data.structuredOutputs) {
      console.warn(
        'Configured OpenAI enrichment model did not pass the startup capability check; call ingestion remains available.',
      );
    }
  }
}

const adapter = new FastifyAdapter({
  logger: true,
  bodyLimit: 1_048_576,
  requestIdHeader: 'x-correlation-id',
});
const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, { rawBody: true });
await app.register(helmet, { contentSecurityPolicy: true });
await app.register(cors, {
  origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:3001').split(','),
  credentials: true,
});
await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
app.setGlobalPrefix('v1', { exclude: ['health', 'ready', 'metrics'] });
app.enableShutdownHooks();
const document = SwaggerModule.createDocument(
  app,
  new DocumentBuilder()
    .setTitle('Quantum Parks API')
    .setDescription('Authoritative control and intelligence plane for the ElevenLabs receptionist')
    .setVersion('1.0')
    .addBearerAuth()
    .build(),
);
SwaggerModule.setup('docs', app, document);
await app.listen(Number(process.env.PORT ?? 4000), '0.0.0.0');
