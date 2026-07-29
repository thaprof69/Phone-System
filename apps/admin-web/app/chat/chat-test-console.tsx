'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { MessageSquareText, PlugZap, RefreshCw, RotateCcw, Send, Square, X } from 'lucide-react';
import {
  useReceptionistConversation,
  type ConversationPhase,
} from '../settings/simulation/use-receptionist-conversation';

export type ProviderReadinessSummary = {
  connected: boolean;
  agentVerified: boolean;
  latestDiagnosticsStatus: 'PASS' | 'WARNING' | 'FAIL' | 'NOT_CONFIGURED' | null;
  latestDiagnosticsAt: string | null;
};

type SynchronizeState =
  | { status: 'idle'; message: null }
  | { status: 'working'; message: string }
  | { status: 'done'; message: string }
  | { status: 'error'; message: string };

function phaseLabel(phase: ConversationPhase): string {
  switch (phase) {
    case 'idle':
      return 'Idle';
    case 'requesting':
      return 'Requesting';
    case 'connecting':
      return 'Connecting';
    case 'falling_back':
      return 'Retrying';
    case 'live':
      return 'Connected';
    case 'ended':
      return 'Ended';
    case 'error':
      return 'Error';
  }
}

function humanise(value: string | null): string {
  if (!value) return 'Not available';
  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function ChatTestConsole({
  agentVersionId,
  readiness,
  loadError,
  triggerLabel = 'Test live chat',
  drawerEyebrow = 'Live ElevenLabs text channel',
  drawerTitle = 'Live chat console',
  drawerDescription = 'Test the published agent against the same approved knowledge used in production.',
  emptyTitle = 'Connect to the live agent',
  emptyDescription = 'Start a text-only ElevenLabs conversation, then ask a real customer-style question.',
  defaultPrompt = '',
  captureAgentResponseAfter,
  onCapturedAgentResponse,
}: {
  agentVersionId: string | null;
  readiness: ProviderReadinessSummary | null;
  loadError: string | null;
  triggerLabel?: string;
  drawerEyebrow?: string;
  drawerTitle?: string;
  drawerDescription?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  defaultPrompt?: string;
  captureAgentResponseAfter?: string;
  onCapturedAgentResponse?: (message: string) => void;
}) {
  const router = useRouter();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const capturedResponseIdRef = useRef<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [synchronize, setSynchronize] = useState<SynchronizeState>({
    status: 'idle',
    message: null,
  });
  const conversation = useReceptionistConversation();
  const busy =
    conversation.phase === 'requesting' ||
    conversation.phase === 'connecting' ||
    conversation.phase === 'falling_back';
  const ready = Boolean(agentVersionId && readiness?.connected && readiness.agentVerified);
  const connected = conversation.phase === 'live';
  const canType = !busy;
  const canConnect = Boolean(ready && !busy && !connected);
  const canSend = Boolean(ready && !busy && message.trim());
  const canRepairMapping = Boolean(
    !agentVersionId && readiness?.connected && readiness.agentVerified,
  );
  const readinessBlocker = !agentVersionId
    ? 'The verified ElevenLabs agent is not currently in sync with the approved local release.'
    : !readiness?.connected
      ? 'ElevenLabs is not connected.'
      : !readiness.agentVerified
        ? 'The published ElevenLabs agent has not been verified.'
        : null;

  useEffect(() => {
    if (!drawerOpen) return;
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [drawerOpen]);

  useEffect(() => {
    if (!captureAgentResponseAfter || !onCapturedAgentResponse) return;
    const promptIndex = conversation.transcript.findLastIndex(
      (entry) =>
        entry.role === 'user' && entry.text.trimStart().startsWith(captureAgentResponseAfter),
    );
    if (promptIndex < 0) return;
    const response = conversation.transcript
      .slice(promptIndex + 1)
      .findLast((entry) => entry.role === 'agent' && !entry.pending && entry.text.trim());
    if (!response || capturedResponseIdRef.current === response.id) return;
    capturedResponseIdRef.current = response.id;
    onCapturedAgentResponse(response.text);
  }, [captureAgentResponseAfter, conversation.transcript, onCapturedAgentResponse]);

  async function ensureChatSession(): Promise<boolean> {
    if (conversation.phase === 'live') return true;
    if (!agentVersionId) return false;
    return conversation.startSession({
      agentVersionId,
      mode: 'TEXT',
      source: 'LIVE',
      purpose: 'VALIDATION',
    });
  }

  async function connectLiveChat() {
    await ensureChatSession();
  }

  async function sendMessage() {
    const trimmed = message.trim();
    if (!trimmed || !(await ensureChatSession())) return;
    setMessage('');
    await conversation.sendMessage(trimmed);
  }

  async function repairLiveMapping() {
    setSynchronize({
      status: 'working',
      message: 'Republishing the approved release and checking the ElevenLabs read-back...',
    });
    try {
      const response = await fetch('/api/admin/integrations/elevenlabs/synchronize-active-agent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      const result = (await response.json().catch(() => ({}))) as {
        status?: string;
        message?: string;
      };
      if (result.status !== 'IN_SYNC') {
        setSynchronize({
          status: 'error',
          message:
            result.message ??
            'The provider read-back still differs from the approved release. Live chat remains blocked.',
        });
        return;
      }
      setSynchronize({
        status: 'done',
        message: 'The approved release now matches ElevenLabs. Refreshing live readiness...',
      });
      router.refresh();
    } catch {
      setSynchronize({
        status: 'error',
        message: 'The integration service could not be reached. Nothing was reported as live.',
      });
    }
  }

  const drawer =
    drawerOpen && typeof document !== 'undefined'
      ? createPortal(
          <div className="chat-drawer-layer">
            <button
              type="button"
              className="chat-drawer-scrim"
              aria-label="Close live chat drawer"
              onClick={() => setDrawerOpen(false)}
            />
            <aside
              className="chat-drawer"
              role="dialog"
              aria-modal="true"
              aria-labelledby="chat-console-title"
            >
              <section className="chat-console chat-console-drawer">
                <div className="chat-console-header">
                  <div>
                    <p className="eyebrow">{drawerEyebrow}</p>
                    <h2 id="chat-console-title">{drawerTitle}</h2>
                    <p>{drawerDescription}</p>
                  </div>
                  <div className="chat-drawer-header-actions">
                    <span className={`chat-state chat-state-${ready ? 'ready' : 'blocked'}`}>
                      {ready ? phaseLabel(conversation.phase) : 'Needs sync'}
                    </span>
                    <button
                      ref={closeButtonRef}
                      type="button"
                      className="icon-button"
                      onClick={() => setDrawerOpen(false)}
                      title="Close live chat"
                      aria-label="Close live chat"
                    >
                      <X size={18} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {loadError || conversation.message || conversation.blockers.length ? (
                  <div
                    className={`chat-console-message ${
                      loadError || conversation.phase === 'error' ? 'is-error' : ''
                    }`}
                    role={loadError || conversation.phase === 'error' ? 'alert' : 'status'}
                  >
                    <strong>
                      {loadError || conversation.phase === 'error' ? 'Refused' : 'Status'}
                    </strong>
                    <span>{loadError ?? conversation.message}</span>
                    {conversation.blockers.map((blocker) => (
                      <span key={blocker}>{blocker}</span>
                    ))}
                  </div>
                ) : null}

                {readinessBlocker ? (
                  <div className="chat-live-blocker" role="status">
                    <strong>Live chat needs attention</strong>
                    <span>{readinessBlocker}</span>
                    {canRepairMapping ? (
                      <button
                        type="button"
                        className="button secondary small"
                        disabled={synchronize.status === 'working'}
                        onClick={() => void repairLiveMapping()}
                      >
                        <RefreshCw size={15} aria-hidden="true" />
                        <span>
                          {synchronize.status === 'working'
                            ? 'Repairing connection'
                            : 'Repair live connection'}
                        </span>
                      </button>
                    ) : null}
                    {synchronize.message ? (
                      <small className={synchronize.status === 'error' ? 'is-error' : ''}>
                        {synchronize.message}
                      </small>
                    ) : null}
                  </div>
                ) : null}

                <div className="chat-console-body">
                  <div className="chat-transcript-window" aria-live="polite">
                    {conversation.transcript.length ? (
                      conversation.transcript.map((entry) => (
                        <article
                          className={`chat-bubble chat-bubble-${
                            entry.role === 'user' ? 'operator' : 'agent'
                          }`}
                          key={entry.id}
                        >
                          <span>{entry.role === 'user' ? 'Operator' : 'ElevenLabs agent'}</span>
                          <p>{entry.text}</p>
                        </article>
                      ))
                    ) : (
                      <div className="chat-empty">
                        <strong>{emptyTitle}</strong>
                        <p>{emptyDescription}</p>
                      </div>
                    )}
                  </div>

                  <aside className="chat-evaluation-panel" aria-label="Current chat evaluation">
                    <div>
                      <span>Session</span>
                      <strong>{conversation.sessionId ?? 'Not started'}</strong>
                    </div>
                    <div>
                      <span>Sentiment</span>
                      <strong>{humanise(conversation.callIntelligence.sentiment)}</strong>
                    </div>
                    <div>
                      <span>Classification</span>
                      <strong>{humanise(conversation.callIntelligence.classification)}</strong>
                    </div>
                    <div>
                      <span>Urgency</span>
                      <strong>{humanise(conversation.callIntelligence.urgency)}</strong>
                    </div>
                    <div>
                      <span>Confidence</span>
                      <strong>
                        {conversation.callIntelligence.confidence === null
                          ? 'Not available'
                          : `${Math.round(conversation.callIntelligence.confidence * 100)}%`}
                      </strong>
                    </div>
                    <div className="chat-evaluation-summary">
                      <span>Summary</span>
                      <p>
                        {conversation.callIntelligence.summary ??
                          (conversation.callIntelligence.status === 'ANALYSING'
                            ? 'Analysing the completed chat...'
                            : 'Summary appears after the chat has enough evidence or is ended.')}
                      </p>
                    </div>
                  </aside>
                </div>

                <form
                  className="chat-compose"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void sendMessage();
                  }}
                >
                  <label className="sr-only" htmlFor="operator-chat-message">
                    Operator chat message
                  </label>
                  <textarea
                    id="operator-chat-message"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        if (canSend) void sendMessage();
                      }
                    }}
                    placeholder={
                      connected
                        ? 'Type a live chat message...'
                        : defaultPrompt
                          ? 'Review the verification prompt, then connect and send...'
                          : 'Type a message, then connect and send...'
                    }
                    disabled={!canType}
                    rows={3}
                  />
                  <button
                    type="button"
                    disabled={!canConnect}
                    onClick={() => void connectLiveChat()}
                    title="Connect live ElevenLabs chat"
                    aria-label="Connect live ElevenLabs chat"
                  >
                    <PlugZap size={17} aria-hidden="true" />
                    <span>{busy ? 'Connecting' : connected ? 'Live' : 'Connect'}</span>
                  </button>
                  <button
                    type="submit"
                    disabled={!canSend}
                    title={connected ? 'Send message' : 'Connect and send message'}
                    aria-label={connected ? 'Send message' : 'Connect and send message'}
                  >
                    <Send size={17} aria-hidden="true" />
                    <span>{connected ? 'Send' : 'Connect & send'}</span>
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={!connected}
                    onClick={() => void conversation.endSession()}
                    title="End chat"
                    aria-label="End chat"
                  >
                    <Square size={16} aria-hidden="true" />
                    <span>End</span>
                  </button>
                  <button
                    type="button"
                    className="button ghost"
                    disabled={busy}
                    onClick={() => void conversation.resetSession()}
                    title="Start a fresh chat"
                    aria-label="Start a fresh chat"
                  >
                    <RotateCcw size={16} aria-hidden="true" />
                    <span>New</span>
                  </button>
                </form>
              </section>
            </aside>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        className="button primary chat-drawer-trigger"
        onClick={() => {
          if (defaultPrompt && !message.trim() && conversation.transcript.length === 0) {
            setMessage(defaultPrompt);
          }
          setDrawerOpen(true);
        }}
      >
        <MessageSquareText size={17} aria-hidden="true" />
        <span>{triggerLabel}</span>
      </button>
      {drawer}
    </>
  );
}
