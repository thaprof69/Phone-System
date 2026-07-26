import Link from 'next/link';
import {
  Panel,
  StatusPill,
  formatDateTime,
  formatRelativeTime,
  humaniseState,
} from '@quantum-parks/ui';

/**
 * Ported near-verbatim from Quantum Park Lite's `SessionRows`/`SessionDetail` — real,
 * persisted receptionist sessions, never hard-coded session cards.
 */

export type ReceptionistSessionRow = {
  id: string;
  label: string;
  mode: string;
  status: string;
  createdAt: string;
  escalationStatus?: 'NONE' | 'REQUIRED' | null;
};

export function SessionRows({ sessions }: { sessions: ReceptionistSessionRow[] }) {
  if (!sessions.length) {
    return <p className="capability-note">No receptionist test sessions yet.</p>;
  }
  return (
    <ul className="session-row-list">
      {sessions.map((session) => (
        <li key={session.id}>
          <Link href={`/settings/simulation/sessions/${session.id}`}>
            <p>{session.label}</p>
            <p className="cell-sub">
              {formatDateTime(session.createdAt)}
              <span> · {formatRelativeTime(session.createdAt)}</span>
            </p>
          </Link>
          <div className="integration-actions">
            <StatusPill tone={session.status === 'ACTIVE' ? 'warning' : 'neutral'}>
              {humaniseState(session.status)}
            </StatusPill>
            {session.escalationStatus ? (
              <StatusPill tone={session.escalationStatus === 'REQUIRED' ? 'danger' : 'good'}>
                Escalation {humaniseState(session.escalationStatus)}
              </StatusPill>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function RecentSessionsPanel({ sessions }: { sessions: ReceptionistSessionRow[] }) {
  return (
    <Panel
      title="Recent Sessions"
      description="Test and live sessions are persisted for review."
      action={
        <Link className="button secondary" href="/settings/simulation/sessions">
          View all sessions
        </Link>
      }
    >
      <SessionRows sessions={sessions.slice(0, 4)} />
    </Panel>
  );
}
