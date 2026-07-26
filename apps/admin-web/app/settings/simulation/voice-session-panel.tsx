'use client';

import { useEffect, useRef, useState } from 'react';
import { Conversation, type TextConversation, type VoiceConversation } from '@elevenlabs/client';
import { Banner, Button, SelectField, StatusPill } from '@quantum-parks/ui';

/**
 * A real, live ElevenLabs Conversational AI voice call over the browser microphone —
 * distinct from "Run tests" above, which drives ElevenLabs' own automated test
 * evaluation and never opens a live audio session. The signed URL is a 15-minute,
 * single-use credential issued by the backend for this call only; the permanent
 * ElevenLabs API key never reaches this page.
 */

type Phase = 'idle' | 'requesting' | 'connecting' | 'live' | 'ended' | 'error';
type TranscriptEntry = { id: number; role: 'user' | 'agent'; text: string };

async function call(
  path: string,
  method: 'GET' | 'POST',
  body?: unknown,
): Promise<Record<string, unknown> & { httpStatus: number }> {
  const response = await fetch(`/api/admin/voice-sessions${path}`, {
    method,
    cache: 'no-store',
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ...data, httpStatus: response.status };
}

function phaseLabel(phase: Phase): string {
  switch (phase) {
    case 'idle':
      return 'Not connected';
    case 'requesting':
      return 'Requesting session';
    case 'connecting':
      return 'Connecting';
    case 'live':
      return 'Live';
    case 'ended':
      return 'Call ended';
    case 'error':
      return 'Error';
  }
}

export function VoiceSessionPanel({
  agentVersions,
}: {
  agentVersions: Array<{ value: string; label: string }>;
}) {
  const [agentVersionId, setAgentVersionId] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState('');
  const [blockers, setBlockers] = useState<string[]>([]);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const conversationRef = useRef<VoiceConversation | TextConversation | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const entryId = useRef(0);

  useEffect(
    () => () => {
      void conversationRef.current?.endSession();
    },
    [],
  );

  async function start() {
    if (!agentVersionId) {
      setMessage('Select a published agent version first.');
      return;
    }
    setPhase('requesting');
    setMessage('');
    setBlockers([]);
    setTranscript([]);
    const data = await call('', 'POST', { agentVersionId });
    if (data.status === 'BLOCKED') {
      setPhase('error');
      setMessage('The platform refused to start a live call.');
      setBlockers(Array.isArray(data.blockers) ? (data.blockers as string[]) : []);
      return;
    }
    if (data.status !== 'SUCCESS' || typeof data.signedUrl !== 'string') {
      setPhase('error');
      setMessage(String(data.message ?? 'ElevenLabs did not return a live session.'));
      return;
    }
    const sessionId = String(data.sessionId);
    sessionIdRef.current = sessionId;
    setPhase('connecting');
    try {
      const conversation = await Conversation.startSession({
        signedUrl: data.signedUrl,
        onConnect: ({ conversationId }) => {
          setPhase('live');
          void call(`/${sessionId}/attach`, 'POST', { providerConversationId: conversationId });
        },
        onDisconnect: (details) => {
          conversationRef.current = null;
          if (details.reason === 'error') {
            setPhase('error');
            setMessage(details.message);
            void call(`/${sessionId}/end`, 'POST', {
              reason: 'PROVIDER_ERROR',
              errorCode: 'PROVIDER_ERROR',
            });
          } else {
            setPhase('ended');
            void call(`/${sessionId}/end`, 'POST', { reason: 'DISCONNECTED' });
          }
        },
        onMessage: ({ message: text, role }) => {
          entryId.current += 1;
          setTranscript((current) => [...current, { id: entryId.current, role, text }]);
        },
        onError: (errorMessage) => {
          setPhase('error');
          setMessage(errorMessage);
        },
      });
      conversationRef.current = conversation;
    } catch (error) {
      setPhase('error');
      setMessage(error instanceof Error ? error.message : 'The browser could not start the call.');
      await call(`/${sessionId}/end`, 'POST', {
        reason: 'CONNECT_FAILED',
        errorCode: 'CONNECT_FAILED',
      });
    }
  }

  async function stop() {
    await conversationRef.current?.endSession();
    conversationRef.current = null;
    const sessionId = sessionIdRef.current;
    if (sessionId) await call(`/${sessionId}/end`, 'POST', { reason: 'USER_ENDED' });
    setPhase('ended');
  }

  const connecting = phase === 'connecting' || phase === 'requesting';
  const tone =
    phase === 'live' ? 'good' : phase === 'error' ? 'danger' : connecting ? 'warning' : 'neutral';

  return (
    <div className="inline-form">
      <p className="capability-note">
        This opens a real, live ElevenLabs voice call over your microphone — not a synthetic
        simulation. It requires the selected agent version to already be published and in sync with
        ElevenLabs.
      </p>
      <SelectField
        id="voice-session-agent-version"
        label="Agent version"
        placeholder="Select a published agent version"
        options={agentVersions}
        value={agentVersionId}
        onChange={(event) => setAgentVersionId(event.target.value)}
        disabled={phase === 'live' || connecting}
      />
      <div className="integration-actions">
        <StatusPill tone={tone}>{phaseLabel(phase)}</StatusPill>
        {phase === 'live' || phase === 'connecting' ? (
          <Button variant="secondary" onClick={() => void stop()}>
            End call
          </Button>
        ) : (
          <Button onClick={() => void start()} disabled={!agentVersionId || phase === 'requesting'}>
            Start voice call
          </Button>
        )}
      </div>
      {message ? (
        <>
          <Banner
            tone={phase === 'error' ? 'danger' : 'good'}
            title={phase === 'error' ? 'Refused' : 'Status'}
          >
            {message}
          </Banner>
          {blockers.length > 0 ? (
            <ul className="blocker-list">
              {blockers.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
      {transcript.length > 0 ? (
        <ul className="voice-transcript" aria-live="polite">
          {transcript.map((entry) => (
            <li key={entry.id}>
              <strong>{entry.role === 'user' ? 'Caller' : 'Agent'}:</strong> {entry.text}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
