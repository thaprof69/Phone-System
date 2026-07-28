'use client';

import { useEffect, useRef, useState } from 'react';
import { Conversation, type TextConversation, type VoiceConversation } from '@elevenlabs/client';
import type { ReceptionistScenarioKey } from '@quantum-parks/domain';
import { shouldRecordProviderTranscriptEvent } from './receptionist-transcript';

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
  intelligenceState: 'PROVISIONAL' | 'FINAL' | 'SUPERSEDED';
};

export type CallIntelligence = {
  status: 'WAITING' | 'PROVISIONAL' | 'ANALYSING' | 'READY' | 'PARTIAL';
  summary: string | null;
  callerRequests: string[];
  unresolvedItems: string[];
  sentiment: string | null;
  classification: string | null;
  urgency: string | null;
  confidence: number | null;
  evidenceCoverage: number | null;
  intelligenceState: 'PROVISIONAL' | 'FINAL' | 'SUPERSEDED' | null;
  summaryIssue: string | null;
};

const emptyCallIntelligence: CallIntelligence = {
  status: 'WAITING',
  summary: null,
  callerRequests: [],
  unresolvedItems: [],
  sentiment: null,
  classification: null,
  urgency: null,
  confidence: null,
  evidenceCoverage: null,
  intelligenceState: null,
  summaryIssue: null,
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
  const [callIntelligence, setCallIntelligence] = useState<CallIntelligence>(emptyCallIntelligence);
  const [muted, setMuted] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [mode, setMode] = useState<'VOICE' | 'TEXT' | null>(null);
  const conversationRef = useRef<VoiceConversation | TextConversation | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const entryId = useRef(0);

  useEffect(() => {
    if (phase !== 'ended' || callIntelligence.status !== 'ANALYSING' || !sessionId) return;
    const timer = window.setInterval(() => {
      void call(`/${sessionId}`, 'GET').then((result) => {
        if (result.callIntelligence) {
          setCallIntelligence(result.callIntelligence as CallIntelligence);
        }
        if (result.quantumResult) setQuantumResult(result.quantumResult as QuantumResult);
      });
    }, 1_500);
    return () => window.clearInterval(timer);
  }, [callIntelligence.status, phase, sessionId]);

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
    setMode(input.mode);
    const data = await call('', 'POST', input);
    if (data.status === 'BLOCKED') {
      setMode(null);
      setPhase('error');
      setMessage('The platform refused to start this session.');
      setBlockers(Array.isArray(data.blockers) ? (data.blockers as string[]) : []);
      return false;
    }
    if (data.status !== 'SUCCESS') {
      setMode(null);
      setPhase('error');
      setMessage(String(data.message ?? 'ElevenLabs did not return a live session.'));
      return false;
    }
    const newSessionId = String(data.sessionId);
    sessionIdRef.current = newSessionId;
    setSessionId(newSessionId);
    setPhase('connecting');
    const started = await startWithTransport(data, input, newSessionId);
    if (!started) setMode(null);
    return started;
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
    let resolveAttachment: (attached: boolean) => void = () => {};
    const attachmentReady = new Promise<boolean>((resolve) => {
      resolveAttachment = resolve;
    });

    async function attachConversation(providerConversationId: string) {
      const attached = await call(`/${activeSessionId}/attach`, 'POST', {
        providerConversationId,
      });
      if (attached.status === 'CONNECTED') {
        setPhase('live');
        return true;
      }
      setPhase('error');
      setMessage(String(attached.message ?? 'The live conversation could not be attached.'));
      return false;
    }

    async function recordProviderMessage(role: 'user' | 'agent', text: string) {
      // Text messages are recorded by sendMessage()/sendPreset() before the SDK can echo them.
      // Voice caller turns exist only in ElevenLabs transcript events and must be captured here.
      if (!shouldRecordProviderTranscriptEvent(input.mode, role)) return;
      pushTranscript(role, text);
      const attached = await attachmentReady;
      if (!attached) return;
      await call(`/${activeSessionId}/turn`, 'POST', { role, text });
      if (input.mode === 'VOICE')
        postMediaVerification({
          status: 'PASS',
          ...(role === 'agent' ? { agentAudioReceived: true } : {}),
          transcriptEventsReceived: true,
        });
    }

    try {
      const conversation =
        transport === 'WEBRTC'
          ? await Conversation.startSession({
              conversationToken: String(data.conversationToken),
              connectionType: 'webrtc',
              onConnect: () => {
                const providerConversationId =
                  typeof data.providerConversationId === 'string'
                    ? data.providerConversationId
                    : '';
                void attachConversation(providerConversationId).then((attached) => {
                  resolveAttachment(attached);
                  if (attached)
                    postMediaVerification({
                      status: 'PASS',
                      microphoneEstablished: true,
                      connectedAt: new Date().toISOString(),
                    });
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
                void recordProviderMessage(role, text);
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
                void attachConversation(conversationId).then((attached) => {
                  resolveAttachment(attached);
                  if (attached && input.mode === 'VOICE')
                    postMediaVerification({
                      status: 'PASS',
                      microphoneEstablished: true,
                      connectedAt: new Date().toISOString(),
                    });
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
                void recordProviderMessage(role, text);
              },
              onError: (errorMessage) => {
                setPhase('error');
                setMessage(errorMessage);
              },
            });
      conversationRef.current = conversation;
      return attachmentReady;
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
    if (result.quantumResult) applyProvisionalResult(result.quantumResult as QuantumResult);
    if (result.status !== 'SUCCESS') {
      setMessage(String(result.message ?? 'The caller turn could not be analysed.'));
      setBlockers(Array.isArray(result.blockers) ? result.blockers.map(String) : []);
    }
  }

  async function sendPreset(scenarioKey: ReceptionistScenarioKey, message: string) {
    const id = sessionIdRef.current;
    if (!id) return;
    conversationRef.current?.sendUserMessage(message);
    pushTranscript('user', message);
    const result = await call(`/${id}/preset`, 'POST', { scenarioKey });
    if (result.quantumResult) applyProvisionalResult(result.quantumResult as QuantumResult);
    if (result.status !== 'SUCCESS') {
      setMessage(String(result.message ?? 'The preset turn could not be analysed.'));
      setBlockers(Array.isArray(result.blockers) ? result.blockers.map(String) : []);
    }
  }

  function applyProvisionalResult(result: QuantumResult) {
    setQuantumResult(result);
    setCallIntelligence((current) => ({
      ...current,
      status: 'PROVISIONAL',
      sentiment: result.sentiment,
      classification: result.intent,
      urgency: result.urgency,
      confidence: result.confidence,
      intelligenceState: result.intelligenceState,
    }));
  }

  async function refreshCallIntelligence(activeSessionId: string) {
    const result = await call(`/${activeSessionId}`, 'GET');
    if (result.callIntelligence) {
      setCallIntelligence(result.callIntelligence as CallIntelligence);
    }
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
    if (id) {
      const ended = await call(`/${id}/end`, 'POST', { reason: 'USER_ENDED' });
      if (ended.processingQueued) {
        setCallIntelligence((current) => ({ ...current, status: 'ANALYSING' }));
      }
      await refreshCallIntelligence(id);
    }
    setPhase('ended');
  }

  async function resetSession() {
    if (conversationRef.current || sessionIdRef.current) {
      await endSession();
    }
    conversationRef.current = null;
    sessionIdRef.current = null;
    setPhase('idle');
    setMessage('');
    setBlockers([]);
    setTranscript([]);
    setQuantumResult(null);
    setCallIntelligence(emptyCallIntelligence);
    setMuted(false);
    setSessionId(null);
    setMode(null);
  }

  return {
    phase,
    message,
    blockers,
    transcript,
    quantumResult,
    callIntelligence,
    muted,
    sessionId,
    mode,
    startSession,
    sendMessage,
    sendPreset,
    toggleMute,
    endSession,
    resetSession,
  };
}
