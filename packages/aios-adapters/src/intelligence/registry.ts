import { AnthropicAdapter } from './anthropic.js';
import { GeminiAdapter } from './gemini.js';
import { OpenAICompatibleAdapter } from './openai-compatible.js';
import type { IntelligenceProviderAdapter, IntelligenceProviderKey } from './contract.js';

/**
 * Base URLs are overridable by environment so a deployment can point at a regional
 * endpoint (notably Qwen/DashScope) or a recorded-response server in tests.
 *
 * Overrides are commonly written as a bare host (`https://api.anthropic.com`) rather
 * than including the version segment, so the required segment is appended when it is
 * missing. Without this, a host-only override silently produces 404s on every call.
 */
function baseUrl(envKey: string, fallback: string, versionSegment: string) {
  const value = process.env[envKey];
  if (!value || !value.trim()) return fallback;
  const trimmed = value.trim().replace(/\/+$/, '');
  const segments = versionSegment.split('/').filter(Boolean);
  // Already carries the version path (e.g. ".../v1" or ".../compatible-mode/v1").
  if (trimmed.endsWith(`/${segments.join('/')}`)) return trimmed;
  return `${trimmed}/${segments.join('/')}`;
}

export function createIntelligenceAdapter(
  provider: IntelligenceProviderKey,
): IntelligenceProviderAdapter {
  switch (provider) {
    case 'OPENAI':
      return new OpenAICompatibleAdapter(
        'OPENAI',
        baseUrl('OPENAI_BASE_URL', 'https://api.openai.com/v1', 'v1'),
      );
    case 'DEEPSEEK':
      return new OpenAICompatibleAdapter(
        'DEEPSEEK',
        baseUrl('DEEPSEEK_BASE_URL', 'https://api.deepseek.com/v1', 'v1'),
      );
    case 'KIMI':
      return new OpenAICompatibleAdapter(
        'KIMI',
        baseUrl('KIMI_BASE_URL', 'https://api.moonshot.ai/v1', 'v1'),
      );
    case 'QWEN':
      return new OpenAICompatibleAdapter(
        'QWEN',
        baseUrl(
          'QWEN_BASE_URL',
          'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
          'compatible-mode/v1',
        ),
      );
    case 'ANTHROPIC':
      return new AnthropicAdapter(
        baseUrl('ANTHROPIC_BASE_URL', 'https://api.anthropic.com/v1', 'v1'),
      );
    case 'GEMINI':
      return new GeminiAdapter(
        baseUrl('GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta', 'v1beta'),
      );
    default: {
      const exhaustive: never = provider;
      throw new Error(`No intelligence adapter for provider ${String(exhaustive)}`);
    }
  }
}

/**
 * Server-side fallback catalogue, used only when a provider's live model list cannot
 * be reached. The browser never supplies model names; a submodel is always validated
 * against the provider (or this registry) before it is saved or executed.
 */
export const PROVIDER_MODEL_REGISTRY: Record<IntelligenceProviderKey, readonly string[]> = {
  OPENAI: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o3-mini'],
  ANTHROPIC: [
    'claude-sonnet-4-5',
    'claude-opus-4-1',
    'claude-3-7-sonnet-latest',
    'claude-3-5-haiku-latest',
  ],
  DEEPSEEK: ['deepseek-chat', 'deepseek-reasoner'],
  KIMI: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k', 'kimi-k2-0711-preview'],
  QWEN: ['qwen-max', 'qwen-plus', 'qwen-turbo'],
  GEMINI: ['gemini-2.0-flash', 'gemini-2.5-pro', 'gemini-2.5-flash'],
};
