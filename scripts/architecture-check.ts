import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = process.cwd();
const excluded = new Set([
  'node_modules',
  '.git',
  '.next',
  '.terraform',
  'dist',
  'coverage',
  '.turbo',
]);
const sourceExtensions = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const violations: string[] = [];

async function files(directory: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory)) {
    if (excluded.has(entry)) continue;
    const absolute = join(directory, entry);
    const info = await stat(absolute);
    if (info.isDirectory()) result.push(...(await files(absolute)));
    else result.push(absolute);
  }
  return result;
}

for (const absolute of await files(root)) {
  const path = relative(root, absolute);
  if (!sourceExtensions.test(path)) continue;
  const content = await readFile(absolute, 'utf8');

  if (/apps\/(admin-web|customer-web)\//.test(path)) {
    for (const forbidden of [
      '@quantum-parks/db',
      '@quantum-parks/elevenlabs',
      'pg',
      'drizzle-orm',
    ]) {
      if (content.includes(`from '${forbidden}`) || content.includes(`from \"${forbidden}`)) {
        violations.push(
          `${path}: browser application imports forbidden server dependency ${forbidden}`,
        );
      }
    }
    if (/ELEVENLABS_(API_KEY|WEBHOOK_SECRET)/.test(content)) {
      violations.push(`${path}: browser application references permanent provider secret`);
    }
  }

  if (/packages\/domain\//.test(path) && /(elevenlabs|convai|provider-dto)/i.test(content)) {
    violations.push(`${path}: domain package leaks provider terminology or DTOs`);
  }

  const isAiosAdapter = path.startsWith('packages/aios-adapters/');
  const isFitnessRule = path === 'scripts/architecture-check.ts';
  const isHostedAiosImplementation =
    path === 'apps/api/src/services/aios-platform.service.ts' ||
    path === 'apps/api/src/services/intelligence-routing.service.ts' ||
    path.startsWith('packages/aios/');
  if (!isAiosAdapter && !isFitnessRule) {
    if (/api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com/.test(content))
      violations.push(`${path}: direct AI provider HTTP use is forbidden outside AIOS adapters`);
    if (
      /from ['"](?:openai|@anthropic-ai\/sdk|@google\/generative-ai|@aws-sdk\/client-bedrock-runtime)['"]/.test(
        content,
      )
    )
      violations.push(`${path}: AI provider SDK import is forbidden outside AIOS adapters`);
  }
  if (
    !isHostedAiosImplementation &&
    !isFitnessRule &&
    content.includes("from '@quantum-parks/aios-adapters'")
  )
    violations.push(`${path}: application code may not depend directly on AIOS provider adapters`);
  if (
    !isAiosAdapter &&
    !isFitnessRule &&
    /(OPENAI_API_KEY|ANTHROPIC_API_KEY|GOOGLE_API_KEY|GEMINI_API_KEY)/.test(content)
  )
    violations.push(`${path}: AI provider credentials may only be resolved inside AIOS adapters`);

  if (/\.(skip|only)\(|describe\.skip|test\.todo|it\.todo/.test(content)) {
    violations.push(`${path}: skipped, exclusive, or pending test is forbidden`);
  }
}

for (const forbiddenPath of ['media-gateway', 'live-stt', 'live-tts', 'turn-engine', 'pbx']) {
  const matches = (await files(root)).filter((path) =>
    relative(root, path).toLowerCase().includes(forbiddenPath),
  );
  if (matches.length > 0) violations.push(`forbidden primary component path: ${forbiddenPath}`);
}

for (const required of [
  'AGENTS.md',
  'PLANS.md',
  'docs/qa/release-evidence.md',
  'docs/product/requirements-traceability.md',
  'docs/architecture/compliance-matrix.md',
]) {
  try {
    await stat(join(root, required));
  } catch {
    violations.push(`missing required governance artifact: ${required}`);
  }
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Architecture fitness checks passed.');
