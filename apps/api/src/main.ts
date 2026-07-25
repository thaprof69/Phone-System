import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { loadConfiguration, rateLimitPerMinute, runtimeSecret } from '@quantum-parks/config';
import { AppModule } from './app.module.js';
import { ValidationExceptionFilter } from './security/validation.filter.js';

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
// Strict by default: only an explicitly local or automated-test environment is
// relaxed. See `rateLimitPerMinute` for why staging is treated as production.
await app.register(rateLimit, { max: rateLimitPerMinute(), timeWindow: '1 minute' });
// A body that fails its schema is the caller's mistake, so it answers 400 with the
// offending fields rather than a 500 that says nothing.
app.useGlobalFilters(new ValidationExceptionFilter());
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
