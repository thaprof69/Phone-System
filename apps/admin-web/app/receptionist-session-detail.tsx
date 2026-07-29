import { Banner, Panel, StatusPill, formatDateTime, humaniseState } from '@quantum-parks/ui';
import { apiGet } from '../lib/api';
import type { QuantumResult } from './settings/simulation/use-receptionist-conversation';

export type ReceptionistSessionDetail = {
  session: {
    id: string;
    label: string;
    mode: string;
    purpose: string;
    source: string;
    status: string;
    startedBy: string;
    createdAt: string;
    endedAt: string | null;
    endReason: string | null;
    messageCount: number;
    synthetic: boolean;
  };
  turns: Array<{ id: string; sequence: number; speaker: string; content: string }>;
  quantumResult: QuantumResult | null;
};

export function loadReceptionistSession(sessionId: string) {
  return apiGet<ReceptionistSessionDetail | null>(`/receptionist-sessions/${sessionId}`, {
    purpose: 'QUALITY_REVIEW',
  });
}

export function ReceptionistSessionEvidence({
  detail,
  userLabel,
}: {
  detail: ReceptionistSessionDetail;
  userLabel: string;
}) {
  const { session, turns, quantumResult } = detail;

  return (
    <>
      <Panel title="Session">
        <div className="quantum-result-grid">
          <StatusPill tone="neutral">Mode: {humaniseState(session.mode)}</StatusPill>
          <StatusPill tone="neutral">Purpose: {humaniseState(session.purpose)}</StatusPill>
          <StatusPill tone="neutral">Source: {humaniseState(session.source)}</StatusPill>
          <StatusPill tone="neutral">{session.messageCount} messages</StatusPill>
          <p className="cell-sub">
            Started {formatDateTime(session.createdAt)} by {session.startedBy}
          </p>
          {session.endedAt ? (
            <p className="cell-sub">
              Ended {formatDateTime(session.endedAt)}
              {session.endReason ? ` · ${session.endReason}` : ''}
            </p>
          ) : null}
        </div>
      </Panel>

      <div className="live-test-columns">
        <Panel title="Transcript" eyebrow={`${turns.length} messages`}>
          {turns.length ? (
            <ul className="transcript-list">
              {turns.map((turn) => (
                <li
                  key={turn.id}
                  className={`transcript-entry transcript-${turn.speaker.toLowerCase()}`}
                >
                  <p className="cell-sub">{turn.speaker === 'USER' ? userLabel : 'Receptionist'}</p>
                  <p>{turn.content}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="capability-note">No transcript recorded for this session.</p>
          )}
        </Panel>

        <Panel title="Quantum Result">
          {quantumResult ? (
            <div className="quantum-result-grid">
              <StatusPill tone={quantumResult.escalationStatus === 'REQUIRED' ? 'danger' : 'good'}>
                Escalation: {quantumResult.escalationStatus}
              </StatusPill>
              <StatusPill
                tone={quantumResult.bookingStatus === 'PROVISIONAL' ? 'warning' : 'neutral'}
              >
                Booking: {quantumResult.bookingStatus}
              </StatusPill>
              <StatusPill tone="neutral">
                Confidence: {Math.round(quantumResult.confidence * 100)}%
              </StatusPill>
              <StatusPill tone="neutral">
                Last action: {quantumResult.proposedAction ?? quantumResult.intent}
              </StatusPill>
              <p>
                <strong>Routing decision:</strong> {quantumResult.routingDecision}
              </p>
              <p>
                <strong>Policy result:</strong> {quantumResult.policyResult}
              </p>
              {quantumResult.blockedActions.length > 0 ? (
                <Banner tone="warning" title="Blocked actions">
                  <ul>
                    {quantumResult.blockedActions.map((blocked) => (
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
                      evidenceIds: quantumResult.evidenceIds,
                      knowledgeRequests: quantumResult.knowledgeRequests,
                      toolEvaluation: quantumResult.toolEvaluation,
                      artifactId: quantumResult.artifactId,
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
            </div>
          ) : (
            <p className="capability-note">No evaluation recorded for this session yet.</p>
          )}
        </Panel>
      </div>
    </>
  );
}
