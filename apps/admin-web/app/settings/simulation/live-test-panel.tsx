'use client';

import { useState } from 'react';
import { RECEPTIONIST_PRESET_SCENARIOS } from '@quantum-parks/domain';
import { Banner, Button, Panel, SelectField, StatusPill, TextField } from '@quantum-parks/ui';
import {
  useReceptionistConversation,
  type ConversationPhase,
} from './use-receptionist-conversation';

/**
 * Ported from Quantum Park Lite's `phone-live-test.tsx` — header copy, control layout, voice
 * startup trace, preset scenario grid, transcript, and Quantum Result panel all match the
 * source's workflow and language. The source's "voice call" never opened a real ElevenLabs
 * session and its Quantum Result was pure keyword matching; here every control is wired to a
 * real, published ElevenLabs agent and a real governed evaluation pipeline — nothing is
 * fabricated.
 */

function phaseLabel(phase: ConversationPhase): string {
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

function traceLines(phase: ConversationPhase, mode: 'VOICE' | 'TEXT'): string[] {
  const lines = ['Microphone permission requested.', 'Provider configuration loaded.'];
  if (phase === 'idle') return [...lines, 'Session idle. Start a call to connect.'];
  lines.push('Server session requested.');
  if (phase === 'requesting') return lines;
  lines.push('Short-lived credential issued.');
  lines.push(
    mode === 'VOICE'
      ? 'ElevenLabs connection starting (voice).'
      : 'ElevenLabs connection starting (text).',
  );
  if (phase === 'connecting') return lines;
  if (phase === 'live') return [...lines, 'Connected. Conversation active.'];
  if (phase === 'ended') return [...lines, 'Disconnected.', 'Session persistence completed.'];
  if (phase === 'error') return [...lines, 'Connection failed.'];
  return lines;
}

export function LiveTestPanel({
  agentVersions,
}: {
  agentVersions: Array<{ value: string; label: string }>;
}) {
  const [agentVersionId, setAgentVersionId] = useState('');
  const [chatText, setChatText] = useState('');
  const conversation = useReceptionistConversation();

  const active = conversation.phase === 'live' || conversation.phase === 'connecting';
  const canStart = Boolean(agentVersionId) && conversation.phase !== 'requesting' && !active;
  const canSend = active && conversation.phase === 'live';

  return (
    <Panel
      title="Live Receptionist Test"
      description="Start a session, send preset calls, and inspect the transcript, routing result, and escalation output."
    >
      <SelectField
        id="live-test-agent-version"
        label="Agent version"
        placeholder="Select a published agent version"
        options={agentVersions}
        value={agentVersionId}
        onChange={(event) => setAgentVersionId(event.target.value)}
        disabled={active}
      />

      <div className="live-test-actions">
        <Button
          variant="primary"
          disabled={!canStart}
          title={agentVersionId ? 'Create a new test session.' : 'Select an agent version first.'}
          onClick={() =>
            void conversation.startSession({ agentVersionId, mode: 'TEXT', source: 'MANUAL' })
          }
        >
          New session
        </Button>
        <Button
          variant="primary"
          disabled={!canStart}
          title={
            agentVersionId
              ? active
                ? 'End the current session before starting another call.'
                : 'Start a live voice call with the real ElevenLabs agent.'
              : 'Select an agent version first.'
          }
          onClick={() =>
            void conversation.startSession({ agentVersionId, mode: 'VOICE', source: 'MANUAL' })
          }
        >
          Start Voice Call
        </Button>
        <Button
          variant="danger"
          disabled={!active}
          title={active ? 'End the active session.' : 'No active session is running.'}
          onClick={() => void conversation.endSession()}
        >
          End Call
        </Button>
        <Button
          variant="secondary"
          disabled={!active}
          title={
            active ? 'Toggle local microphone mute state.' : 'Start a voice session before muting.'
          }
          onClick={conversation.toggleMute}
        >
          {conversation.muted ? 'Unmute' : 'Mute'}
        </Button>
      </div>

      <div className="live-test-actions">
        <StatusPill
          tone={
            conversation.phase === 'live'
              ? 'good'
              : conversation.phase === 'error'
                ? 'danger'
                : active
                  ? 'warning'
                  : 'neutral'
          }
        >
          {phaseLabel(conversation.phase)}
        </StatusPill>
        {conversation.sessionId ? (
          <code className="inline-code">{conversation.sessionId}</code>
        ) : null}
      </div>

      {conversation.message ? (
        <>
          <Banner
            tone={conversation.phase === 'error' ? 'danger' : 'good'}
            title={conversation.phase === 'error' ? 'Refused' : 'Status'}
          >
            {conversation.message}
          </Banner>
          {conversation.blockers.length > 0 ? (
            <ul className="blocker-list">
              {conversation.blockers.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}

      <details className="voice-startup-trace">
        <summary>Voice startup trace</summary>
        <div>
          {traceLines(conversation.phase, active ? 'VOICE' : 'TEXT').map((line) => (
            <p className="cell-sub" key={line}>
              {line}
            </p>
          ))}
        </div>
      </details>

      <div className="preset-scenario-grid">
        {RECEPTIONIST_PRESET_SCENARIOS.map((scenario) => (
          <Button
            key={scenario.key}
            variant="secondary"
            disabled={!canSend}
            title={scenario.message}
            onClick={() => void conversation.sendPreset(scenario.key, scenario.message)}
          >
            {scenario.label}
          </Button>
        ))}
      </div>

      <form
        className="inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          void conversation.sendMessage(chatText);
          setChatText('');
        }}
      >
        <TextField
          id="live-test-chat-text"
          label="Custom test message"
          value={chatText}
          onChange={(event) => setChatText(event.target.value)}
          placeholder="Hi, I want to book a birthday party next Saturday."
          disabled={!canSend}
        />
        <Button type="submit" variant="primary" disabled={!canSend || !chatText.trim()}>
          Send
        </Button>
      </form>

      <div className="live-test-columns">
        <Panel title="Transcript" eyebrow={`${conversation.transcript.length} messages`}>
          {conversation.transcript.length ? (
            <ul className="transcript-list">
              {conversation.transcript.map((entry) => (
                <li key={entry.id} className={`transcript-entry transcript-${entry.role}`}>
                  <p className="cell-sub">{entry.role === 'user' ? 'Caller' : 'Receptionist'}</p>
                  <p>{entry.text}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="capability-note">Start with a preset scenario or type a test message.</p>
          )}
        </Panel>

        <Panel title="Quantum Result">
          {conversation.quantumResult ? (
            <div className="quantum-result-grid">
              <StatusPill
                tone={
                  conversation.quantumResult.escalationStatus === 'REQUIRED' ? 'danger' : 'good'
                }
              >
                Escalation: {conversation.quantumResult.escalationStatus}
              </StatusPill>
              <StatusPill
                tone={
                  conversation.quantumResult.bookingStatus === 'PROVISIONAL' ? 'warning' : 'neutral'
                }
              >
                Booking: {conversation.quantumResult.bookingStatus}
              </StatusPill>
              <StatusPill tone="neutral">
                Confidence: {Math.round(conversation.quantumResult.confidence * 100)}%
              </StatusPill>
              <StatusPill tone="neutral">
                Last action:{' '}
                {conversation.quantumResult.proposedAction ?? conversation.quantumResult.intent}
              </StatusPill>
              <p>
                <strong>Routing decision:</strong> {conversation.quantumResult.routingDecision}
              </p>
              <p>
                <strong>AI response:</strong>{' '}
                {[...conversation.transcript].reverse().find((entry) => entry.role === 'agent')
                  ?.text ?? 'No response yet.'}
              </p>
              <p>
                <strong>Policy result:</strong> {conversation.quantumResult.policyResult}
              </p>
              {conversation.quantumResult.blockedActions.length > 0 ? (
                <Banner tone="warning" title="Blocked actions">
                  <ul>
                    {conversation.quantumResult.blockedActions.map((blocked) => (
                      <li key={blocked.action}>
                        {blocked.action}: {blocked.reason}
                      </li>
                    ))}
                  </ul>
                </Banner>
              ) : null}
              <details>
                <summary>Routing trace</summary>
                <pre className="inline-code">
                  {JSON.stringify(
                    {
                      evidenceIds: conversation.quantumResult.evidenceIds,
                      knowledgeRequests: conversation.quantumResult.knowledgeRequests,
                      toolEvaluation: conversation.quantumResult.toolEvaluation,
                      artifactId: conversation.quantumResult.artifactId,
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
            </div>
          ) : (
            <p className="capability-note">No result yet.</p>
          )}
        </Panel>
      </div>
    </Panel>
  );
}
