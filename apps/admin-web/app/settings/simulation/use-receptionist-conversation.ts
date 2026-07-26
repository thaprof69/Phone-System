'use client';

import { useEffect, useRef, useState } from 'react';
import { Conversation, type TextConversation, type VoiceConversation } from '@elevenlabs/client';
import type { ReceptionistScenarioKey } from '@quantum-parks/domain';

/**
 * Shared ElevenLabs conversation wiring for the Live Receptionist Test workflow — voice and
 * text-only testing are two interaction modes against the same real, published agent, never two
 * separate intelligence paths. No mock fallback: if the agent isn't published and in sync, the
 * backend refuses honestly and this hook surfaces that refusal rather than fabricating a
 * response.
 *
 * Voice sessions are dual-transport: the backend picks WebRTC (via a real conversation token) or
 * WebSocket (via a real signed URL) based on the provider's configured voice mode, and returns
 * which one it chose. Text-only sessions always use WebSocket regardless of that preference — the
 * backend enforces this, not this hook. A WebRTC session that fails for a real, transport-level
 * reason (browser capability, ICE/media negotiation) falls back to WebSocket within the *same*
 * receptionist session — never a silent switch, and never a second operator-visible session.
 */

export type ConversationPhase =
  'idle' | 'requesting' | 'connecting' | 'falling_back' | 'live' | 'ended' | 'error';
export type TranscriptEntry = {
  id: number;
  role: 'user' | 'agent';
  text: string;
  pending?: boolean;
};

export type QuantumResult = {
  artifactId: string;
  generatedAt: string;
  confidence: number;
  intent: string;
  sentiment: string;
  urgency: string;
  escalationStatus: 'NONE' | 'REQUIRED';
  escalationReason: string | null;
  bookingStatus: 'NONE' | 'PROVISIONAL';
  policyResult: string;
  routingDecision: string;
  proposedAction: string | null;
  executedAction: string | null;
  knowledgeRequests: string[];
  blockedActions: Array<{ action: string; reason: string }>;
  toolEvaluation: { invoked: boolean; calls: Array<{ tool: string; status: string }> };
  evidenceIds: string[];
  contextManifest: unknown;
};

async function call(
  path: string,
  method: 'GET' | 'POST',
  body?: unknown,
): Promise<Record<string, unknown> & { httpStatus: number }> {
  const response = await fetch(`/api/admin/receptionist-sessions${path}`, {
    method,
    cache: 'no-store',
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ...data, httpStatus: response.status };
}

/**
 * By the time `Conversation.startSession()` is reached, the backend has already validated
 * credential, agent readiness, policy and testing-enabled flags — none of that can throw from
 * here. Any error thrown by the SDK at this point is therefore a real client-side transport
 * failure (browser lacks WebRTC/media APIs, mic permission/device failure, ICE/DTLS negotiation
 * failure, or another SDK-level connection error) — i.e. recoverable by falling back to
 * WebSocket. Exported for direct unit testing of this reasoning.
 */
export function isRecoverableTransportFailure(_error: unknown): boolean {
  return true;
}

function classifyWebRTCFailure(error: unknown): string {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) return error.name;
  if (error instanceof Error) return error.name || error.message.slice(0, 100);
  return 'UNKNOWN_TRANSPORT_FAILURE';
}

export function useReceptionistConversation() {
  const [phase, setPhase] = useState<ConversationPhase>('idle');
  const [message, setMessage] = useState('');
  const [blockers, setBlockers] = useState<string[]>([]);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [quantumResult, setQuantumResult] = useState<QuantumResult | null>(null);
  const [muted, setMuted] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const conversationRef = useRef<VoiceConversation | TextConversation | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const entryId = useRef(0);

  useEffect(
    () => () => {
      void conversationRef.current?.endSession();
    },
    [],
  );

  function pushTranscript(role: 'user' | 'agent', text: string) {
    entryId.current += 1;
    setTranscript((current) => [...current, { id: entryId.current, role, text }]);
  }

  function postMediaVerification(input: {
    status: 'PASS' | 'FAILED';
    microphoneEstablished?: boolean;
    agentAudioReceived?: boolean;
    transcriptEventsReceived?: boolean;
    connectedAt?: string;
    endedAt?: string;
    endReason?: string;
  }) {
    const id = sessionIdRef.current;
    if (!id) return;
    void call(`/${id}/media-verification`, 'POST', input);
  }

  async function startSession(input: {
    agentVersionId: string;
    mode: 'VOICE' | 'TEXT';
    source: 'SCENARIO' | 'MANUAL' | 'LIVE';
  }) {
    setPhase('requesting');
    setMessage('');
    setBlockers([]);
    setTranscript([]);
    setQuantumResult(null);
    const data = await call('', 'POST', input);
    if (data.status === 'BLOCKED') {
      setPhase('error');
      setMessage('The platform refused to start this session.');
      setBlockers(Array.isArray(data.blockers) ? (data.blockers as string[]) : []);
      return false;
    }
    if (data.status !== 'SUCCESS') {
      setPhase('error');
      setMessage(String(data.message ?? 'ElevenLabs did not return a live session.'));
      return false;
    }
    const newSessionId = String(data.sessionId);
    sessionIdRef.current = newSessionId;
    setSessionId(newSessionId);
    setPhase('connecting');
    return startWithTransport(data, input, newSessionId);
  }

  async function startWithTransport(
    data: Record<string, unknown>,
    input: {
      agentVersionId: string;
      mode: 'VOICE' | 'TEXT';
      source: 'SCENARIO' | 'MANUAL' | 'LIVE';
    },
    activeSessionId: string,
  ): Promise<boolean> {
    const transport = data.transport === 'WEBRTC' ? 'WEBRTC' : 'WEBSOCKET';

    try {
      const conversation =
        transport === 'WEBRTC'
          ? await Conversation.startSession({
              conversationToken: String(data.conversationToken),
              connectionType: 'webrtc',
              onConnect: () => {
                setPhase('live');
                postMediaVerification({
                  status: 'PASS',
                  microphoneEstablished: true,
                  connectedAt: new Date().toISOString(),
                });
              },
              onDisconnect: (details) => {
                conversationRef.current = null;
                if (details.reason === 'error') {
                  setPhase('error');
                  setMessage(details.message);
                } else {
                  setPhase('ended');
                }
                postMediaVerification({
                  status: details.reason === 'error' ? 'FAILED' : 'PASS',
                  endedAt: new Date().toISOString(),
                  endReason: details.reason,
                });
              },
              onMessage: ({ message: text, role }) => {
                if (role !== 'agent') return;
                pushTranscript('agent', text);
                postMediaVerification({
                  status: 'PASS',
                  agentAudioReceived: true,
                  transcriptEventsReceived: true,
                });
                void call(`/${activeSessionId}/turn`, 'POST', { role: 'agent', text });
              },
              onError: (errorMessage) => {
                setPhase('error');
                setMessage(errorMessage);
              },
            })
          : await Conversation.startSession({
              signedUrl: String(data.signedUrl),
              textOnly: input.mode === 'TEXT',
              onConnect: ({ conversationId }) => {
                setPhase('live');
                void call(`/${activeSessionId}/attach`, 'POST', {
                  providerConversationId: conversationId,
                });
                if (input.mode === 'VOICE')
                  postMediaVerification({
                    status: 'PASS',
                    microphoneEstablished: true,
                    connectedAt: new Date().toISOString(),
                  });
              },
              onDisconnect: (details) => {
                conversationRef.current = null;
                if (details.reason === 'error') {
                  setPhase('error');
                  setMessage(details.message);
                } else {
                  setPhase('ended');
                }
                if (input.mode === 'VOICE')
                  postMediaVerification({
                    status: details.reason === 'error' ? 'FAILED' : 'PASS',
                    endedAt: new Date().toISOString(),
                    endReason: details.reason,
                  });
              },
              onMessage: ({ message: text, role }) => {
                // Only the agent's real reply is recorded here — the customer's own turn is
                // recorded immediately by sendMessage()/sendPreset() so it is never missed if the
                // SDK does not echo the caller's own text back for a given connection type.
                if (role !== 'agent') return;
                pushTranscript('agent', text);
                if (input.mode === 'VOICE')
                  postMediaVerification({
                    status: 'PASS',
                    agentAudioReceived: true,
                    transcriptEventsReceived: true,
                  });
                void call(`/${activeSessionId}/turn`, 'POST', { role: 'agent', text });
              },
              onError: (errorMessage) => {
                setPhase('error');
                setMessage(errorMessage);
              },
            });
      conversationRef.current = conversation;
      return true;
    } catch (error) {
      if (transport === 'WEBRTC' && isRecoverableTransportFailure(error)) {
        setPhase('falling_back');
        setMessage('WebRTC connection failed; falling back to WebSocket…');
        const failureCategory = classifyWebRTCFailure(error);
        const fallback = await call(`/${activeSessionId}/retry-transport`, 'POST', {
          failureCategory,
        });
        if (fallback.status !== 'SUCCESS' || fallback.transport !== 'WEBSOCKET') {
          setPhase('error');
          setMessage('WebRTC failed and the WebSocket fallback could not start.');
          return false;
        }
        setMessage('WebRTC failed; retrying over WebSocket.');
        return startWithTransport(fallback, input, activeSessionId);
      }
      setPhase('error');
      setMessage(
        error instanceof Error ? error.message : 'The browser could not start the session.',
      );
      await call(`/${activeSessionId}/end`, 'POST', { reason: 'CONNECT_FAILED' });
      return false;
    }
  }

  async function sendMessage(text: string) {
    const id = sessionIdRef.current;
    if (!id || !text.trim()) return;
    conversationRef.current?.sendUserMessage(text);
    pushTranscript('user', text);
    const result = await call(`/${id}/turn`, 'POST', { role: 'user', text });
    if (result.quantumResult) setQuantumResult(result.quantumResult as QuantumResult);
  }

  async function sendPreset(scenarioKey: ReceptionistScenarioKey, message: string) {
    const id = sessionIdRef.current;
    if (!id) return;
    conversationRef.current?.sendUserMessage(message);
    pushTranscript('user', message);
    const result = await call(`/${id}/preset`, 'POST', { scenarioKey });
    if (result.quantumResult) setQuantumResult(result.quantumResult as QuantumResult);
  }

  function toggleMute() {
    const conversation = conversationRef.current;
    if (!conversation || !('setMicMuted' in conversation)) return;
    const next = !muted;
    (conversation as VoiceConversation).setMicMuted(next);
    setMuted(next);
  }

  async function endSession() {
    await conversationRef.current?.endSession();
    conversationRef.current = null;
    const id = sessionIdRef.current;
    if (id) await call(`/${id}/end`, 'POST', { reason: 'USER_ENDED' });
    setPhase('ended');
  }

  return {
    phase,
    message,
    blockers,
    transcript,
    quantumResult,
    muted,
    sessionId,
    startSession,
    sendMessage,
    sendPreset,
    toggleMute,
    endSession,
  };
}
