'use client';

import { useEffect, useState } from 'react';
import { RECEPTIONIST_PRESET_SCENARIOS } from '@quantum-parks/domain';
import {
  useReceptionistConversation,
  type ConversationPhase,
} from './use-receptionist-conversation';

type MicrophoneState = 'unknown' | 'prompt' | 'granted' | 'denied' | 'unsupported';

type ProviderReadinessSummary = {
  connected: boolean;
  agentVerified: boolean;
  latestDiagnosticsStatus: 'PASS' | 'WARNING' | 'FAIL' | 'NOT_CONFIGURED' | null;
  latestDiagnosticsAt: string | null;
};

function phaseLabel(phase: ConversationPhase): string {
  switch (phase) {
    case 'idle':
      return 'Disconnected';
    case 'requesting':
      return 'Requesting session';
    case 'connecting':
      return 'Connecting';
    case 'falling_back':
      return 'Retrying over WebSocket';
    case 'live':
      return 'Connected';
    case 'ended':
      return 'Disconnected';
    case 'error':
      return 'Error';
  }
}

function traceLines(phase: ConversationPhase, mode: 'VOICE' | 'TEXT' | null): string[] {
  if (phase === 'idle') return ['Session idle. Start a voice call or send a chat message.'];

  const lines = ['Approved agent version selected.', 'Server session requested.'];
  if (phase === 'requesting') return lines;

  lines.push('Short-lived ElevenLabs access issued.');
  lines.push(mode === 'VOICE' ? 'Voice connection starting.' : 'Chat connection starting.');
  if (phase === 'connecting') return lines;
  if (phase === 'falling_back') return [...lines, 'WebRTC failed. Retrying over WebSocket.'];
  if (phase === 'live') return [...lines, 'Connected. Conversation active.'];
  if (phase === 'ended') return [...lines, 'Disconnected. Session persistence completed.'];
  return [...lines, 'Connection failed.'];
}

function statusTone(value: string): string {
  if (['ready', 'final', 'connected', 'granted', 'none'].includes(value.toLowerCase()))
    return 'good';
  if (['error', 'denied', 'required', 'not ready', 'partial'].includes(value.toLowerCase()))
    return 'danger';
  if (
    [
      'prompt',
      'provisional',
      'analysing',
      'requesting session',
      'connecting',
      'retrying over websocket',
    ].includes(value.toLowerCase())
  ) {
    return 'warning';
  }
  return 'neutral';
}

function humaniseIntelligenceValue(value: string | null): string {
  if (!value) return 'Not available';
  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function TestStatus({ value }: { value: string }) {
  return (
    <span className={`receptionist-test-status receptionist-test-status-${statusTone(value)}`}>
      {value}
    </span>
  );
}

export function LiveTestPanel({
  agentVersionId,
  readiness,
  loadError,
}: {
  agentVersionId: string | null;
  readiness: ProviderReadinessSummary | null;
  loadError: string | null;
}) {
  const [chatText, setChatText] = useState('');
  const [microphoneState, setMicrophoneState] = useState<MicrophoneState>('unknown');
  const conversation = useReceptionistConversation();

  useEffect(() => {
    if (!navigator.permissions?.query) {
      setMicrophoneState('unsupported');
      return;
    }

    let mounted = true;
    let permission: PermissionStatus | null = null;
    let updatePermission: (() => void) | null = null;

    void navigator.permissions
      .query({ name: 'microphone' as PermissionName })
      .then((result) => {
        permission = result;
        updatePermission = () => {
          if (mounted) setMicrophoneState(result.state);
        };
        updatePermission();
        result.addEventListener('change', updatePermission);
      })
      .catch(() => {
        if (mounted) setMicrophoneState('unsupported');
      });

    return () => {
      mounted = false;
      if (permission && updatePermission) {
        permission.removeEventListener('change', updatePermission);
      }
    };
  }, []);

  const busy =
    conversation.phase === 'requesting' ||
    conversation.phase === 'connecting' ||
    conversation.phase === 'falling_back';
  const live = conversation.phase === 'live';
  const voiceActive = live && conversation.mode === 'VOICE';
  const configured = Boolean(agentVersionId);
  const ready = Boolean(readiness?.connected && readiness.agentVerified && configured);
  const canChat = configured && !busy;
  const canStartVoice = configured && !busy && !voiceActive;

  async function startVoiceCall() {
    if (!agentVersionId) return;
    if (live) await conversation.resetSession();
    await conversation.startSession({
      agentVersionId,
      mode: 'VOICE',
      source: 'MANUAL',
    });
  }

  async function ensureChatSession(): Promise<boolean> {
    if (conversation.phase === 'live') return true;
    if (!agentVersionId) return false;
    return conversation.startSession({
      agentVersionId,
      mode: 'TEXT',
      source: 'MANUAL',
    });
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || !(await ensureChatSession())) return;
    await conversation.sendMessage(trimmed);
  }

  async function sendPreset(
    scenarioKey: (typeof RECEPTIONIST_PRESET_SCENARIOS)[number]['key'],
    message: string,
  ) {
    if (!(await ensureChatSession())) return;
    await conversation.sendPreset(scenarioKey, message);
  }

  return (
    <section className="receptionist-test" aria-label="Test Your AI Receptionist">
      <header className="receptionist-test-header">
        <div>
          <h1>Test Your AI Receptionist</h1>
          <p>
            Voice is powered by ElevenLabs. Business knowledge, policy, booking logic, and memory
            come from Quantum OS.
          </p>
        </div>
        <TestStatus value={ready ? 'Ready' : 'Not ready'} />
      </header>

      <div className="receptionist-test-body">
        <section className="receptionist-live-card" aria-label="Live Receptionist Test">
          <div className="receptionist-live-heading">
            <div>
              <h2>Live Receptionist Test</h2>
              <p>
                {conversation.sessionId ? (
                  <>
                    Voice and chat share session <code>{conversation.sessionId}</code>.
                  </>
                ) : (
                  'Start a new test by voice or chat.'
                )}
              </p>
            </div>
            <button
              type="button"
              className="receptionist-secondary-button"
              disabled={busy}
              onClick={() => void conversation.resetSession()}
            >
              New session
            </button>
          </div>

          <div className="receptionist-connection-line">
            <span>Microphone</span>
            <TestStatus value={microphoneState} />
            <span>Voice status: {phaseLabel(conversation.phase)}</span>
          </div>

          <div className="receptionist-call-controls">
            <button
              type="button"
              className="receptionist-call-button receptionist-call-start"
              disabled={!canStartVoice}
              onClick={() => void startVoiceCall()}
            >
              {busy && conversation.mode === 'VOICE' ? 'Starting...' : 'Start Voice Call'}
            </button>
            <button
              type="button"
              className="receptionist-call-button receptionist-call-end"
              disabled={!voiceActive}
              onClick={() => void conversation.endSession()}
            >
              End Call
            </button>
            <button
              type="button"
              className="receptionist-call-button receptionist-call-mute"
              disabled={!voiceActive}
              onClick={conversation.toggleMute}
            >
              {conversation.muted ? 'Unmute' : 'Mute'}
            </button>
          </div>

          {loadError || conversation.message ? (
            <div
              className={`receptionist-test-message ${
                loadError || conversation.phase === 'error' ? 'is-error' : ''
              }`}
              role={loadError || conversation.phase === 'error' ? 'alert' : 'status'}
            >
              <strong>{loadError || conversation.phase === 'error' ? 'Refused' : 'Status'}</strong>
              <span>{loadError ?? conversation.message}</span>
              {conversation.blockers.map((blocker) => (
                <span key={blocker}>{blocker}</span>
              ))}
            </div>
          ) : null}

          <details className="receptionist-trace">
            <summary>Voice startup trace</summary>
            <div>
              {traceLines(conversation.phase, conversation.mode).map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </details>

          <div className="receptionist-presets">
            {RECEPTIONIST_PRESET_SCENARIOS.map((scenario) => (
              <button
                key={scenario.key}
                type="button"
                disabled={!canChat}
                title={scenario.message}
                onClick={() => void sendPreset(scenario.key, scenario.message)}
              >
                {scenario.label}
              </button>
            ))}
          </div>

          <form
            className="receptionist-chat-form"
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage(chatText);
              setChatText('');
            }}
          >
            <label className="sr-only" htmlFor="live-test-chat-text">
              Test message
            </label>
            <input
              id="live-test-chat-text"
              value={chatText}
              onChange={(event) => setChatText(event.target.value)}
              placeholder="Hi, I want to book a birthday party next Saturday."
              disabled={!canChat}
            />
            <button type="submit" disabled={!canChat || !chatText.trim()}>
              Send
            </button>
          </form>
        </section>

        <div className="receptionist-results">
          <section className="receptionist-result-panel" aria-label="Transcript">
            <div className="receptionist-result-heading">
              <h2>Transcript</h2>
              <TestStatus value={voiceActive ? 'Voice live' : live ? 'Chat ready' : 'Chat idle'} />
            </div>
            <div className="receptionist-transcript">
              {conversation.transcript.length ? (
                conversation.transcript.map((entry) => (
                  <article key={entry.id}>
                    <strong>{entry.role === 'user' ? 'Caller' : 'Assistant'}</strong>
                    <p>{entry.text}</p>
                  </article>
                ))
              ) : (
                <p className="receptionist-empty">Start with a preset or type a test message.</p>
              )}
            </div>
          </section>

          <section className="receptionist-result-panel" aria-label="Call Intelligence">
            <div className="receptionist-result-heading">
              <h2>Call Intelligence</h2>
              <TestStatus
                value={
                  conversation.callIntelligence.status === 'READY'
                    ? 'Final'
                    : humaniseIntelligenceValue(conversation.callIntelligence.status)
                }
              />
            </div>
            <div className="receptionist-intelligence" aria-live="polite">
              <div className="receptionist-intelligence-summary">
                <span>Call summary</span>
                <p>
                  {conversation.callIntelligence.summary ??
                    (conversation.callIntelligence.status === 'ANALYSING'
                      ? 'Analysing the completed transcript...'
                      : conversation.callIntelligence.status === 'PARTIAL'
                        ? (conversation.callIntelligence.summaryIssue ??
                          'The AI Router did not produce a final summary.')
                        : 'The summary will appear after the call ends.')}
                </p>
                {conversation.callIntelligence.summaryIssue ? (
                  <a
                    className="receptionist-intelligence-link"
                    href="/settings/ai-providers/routing"
                  >
                    Open Model Routing
                  </a>
                ) : null}
              </div>
              <div className="receptionist-intelligence-metrics">
                <div>
                  <span>Sentiment</span>
                  <strong>
                    {humaniseIntelligenceValue(conversation.callIntelligence.sentiment)}
                  </strong>
                </div>
                <div>
                  <span>Classification</span>
                  <strong>
                    {humaniseIntelligenceValue(conversation.callIntelligence.classification)}
                  </strong>
                </div>
                <div>
                  <span>Urgency</span>
                  <strong>
                    {humaniseIntelligenceValue(conversation.callIntelligence.urgency)}
                  </strong>
                </div>
                <div>
                  <span>Confidence</span>
                  <strong>
                    {conversation.callIntelligence.confidence === null
                      ? 'Not available'
                      : `${Math.round(conversation.callIntelligence.confidence * 100)}%`}
                  </strong>
                </div>
              </div>
              {conversation.callIntelligence.callerRequests.length ? (
                <div>
                  <span>Caller needs</span>
                  <ul>
                    {conversation.callIntelligence.callerRequests.map((request) => (
                      <li key={request}>{request}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {conversation.callIntelligence.unresolvedItems.length ? (
                <div>
                  <span>Unresolved</span>
                  <ul>
                    {conversation.callIntelligence.unresolvedItems.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
