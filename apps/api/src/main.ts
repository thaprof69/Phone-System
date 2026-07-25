import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { loadConfiguration, runtimeSecret } from '@quantum-parks/config';
import { AppModule } from './app.module.js';

const configuration = loadConfiguration();
runtimeSecret('LOCAL_ELEVENLABS_API_KEY', 'synthetic-api-key');
runtimeSecret('LOCAL_ELEVENLABS_WEBHOOK_SECRET', 'synthetic-webhook-secret');
runtimeSecret('LOCAL_TOOL_TOKEN', 'synthetic-tool-token');
runtimeSecret('METRICS_TOKEN', 'synthetic-metrics-token');
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
// The production limit protects a caller-facing service from abuse. Outside production
// the same ceiling throttles the browser suite, whose pages then correctly render their
// degraded state and fail assertions for a reason that has nothing to do with the code
// under test. The limit is raised, not removed, so the behaviour is still exercised.
await app.register(rateLimit, {
  max: configuration.QP_ENVIRONMENT === 'production' ? 120 : 5_000,
  timeWindow: '1 minute',
});
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
