import { describe, expect, it, vi } from 'vitest';
import {
  isLiveProviderConversation,
  providerConversationChannel,
  providerConversationEndedAt,
  providerConversationStartedAt,
} from './provider-conversation-monitor.service.js';

describe('provider conversation monitoring', () => {
  it.each(['initiated', 'in-progress', 'IN-PROGRESS'])(
    'treats %s as a provider-authoritative live state',
    (status) => {
      expect(isLiveProviderConversation(status)).toBe(true);
    },
  );

  it.each(['processing', 'done', 'failed'])('does not show %s as a live call', (status) => {
    expect(isLiveProviderConversation(status)).toBe(false);
  });

  it('classifies unlinked ElevenLabs JavaScript SDK sessions as chat', () => {
    expect(providerConversationChannel('js_sdk')).toBe('CHAT');
  });

  it('uses the authoritative local session mode when a provider source is ambiguous', () => {
    expect(providerConversationChannel('js_sdk', 'VOICE')).toBe('CALL');
    expect(providerConversationChannel('telephony', 'TEXT')).toBe('CHAT');
  });

  it('derives stable call timing from provider data', () => {
    const conversation = {
      conversationId: 'conv-1',
      agentId: 'agent-1',
      status: 'done',
      startTimeUnixSeconds: 1_700_000_000,
      durationSeconds: 42,
    };
    expect(providerConversationStartedAt(conversation).toISOString()).toBe(
      '2023-11-14T22:13:20.000Z',
    );
    expect(providerConversationEndedAt(conversation).toISOString()).toBe(
      '2023-11-14T22:14:02.000Z',
    );
  });

  it('uses metadata timing when the list response omits it', () => {
    const conversation = {
      conversationId: 'conv-1',
      agentId: 'agent-1',
      status: 'done',
    };
    expect(
      providerConversationEndedAt(conversation, {
        start_time_unix_secs: 1_700_000_000,
        call_duration_secs: 10,
      }).toISOString(),
    ).toBe('2023-11-14T22:13:30.000Z');
  });

  it('falls back to current time only when the provider supplies no timing', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-28T12:00:00.000Z'));
    expect(
      providerConversationStartedAt({
        conversationId: 'conv-1',
        agentId: 'agent-1',
        status: 'in-progress',
      }).toISOString(),
    ).toBe('2026-07-28T12:00:00.000Z');
    vi.useRealTimers();
  });
});
