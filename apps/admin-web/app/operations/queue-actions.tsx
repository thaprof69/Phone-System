'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Banner, Button, ConfirmDialog, SelectField, TextArea } from '@quantum-parks/ui';

/**
 * Queue actions.
 *
 * Each control calls the platform and reports the outcome it got back. Transitions are
 * validated server-side against the current state, so a stale row cannot be used to
 * complete something that was already cancelled — and when that happens it is shown as
 * a conflict rather than a success.
 */

type Kind = 'callbacks' | 'tasks' | 'handoffs' | 'messages';

type Outcome =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'ok'; message: string }
  | { kind: 'refused'; message: string };

const OWNERS = [
  { value: '', label: 'Unassigned' },
  { value: 'elena.rocha', label: 'Elena Rocha (Operations)' },
  { value: 'bruno.castro', label: 'Bruno Castro (Quality)' },
  { value: 'filipe.sousa', label: 'Filipe Sousa (Privacy)' },
];

export function QueueActions({
  kind,
  id,
  status,
  owners,
}: {
  kind: Kind;
  id: string;
  status: string;
  owners?: Array<{ id: string; displayName: string }>;
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const [note, setNote] = useState('');
  const [owner, setOwner] = useState('');

  const closed = ['COMPLETED', 'CANCELLED', 'EXPIRED', 'DELIVERED'].includes(status);
  const busy = outcome.kind === 'working';

  async function act(body: Record<string, unknown>, success: string) {
    setOutcome({ kind: 'working' });
    try {
      const response = await fetch(`/api/admin/operations/${kind}/${id}/transition`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => ({}))) as {
        status?: string;
        currentState?: string;
        issues?: Array<{ path: string; message: string }>;
        callbackCreated?: boolean;
        channelChanged?: boolean;
        attemptNumber?: number;
        message?: string;
      };

      if (data.status === 'UPDATED' || data.status === 'RETRIED') {
        const extras = [
          data.callbackCreated ? 'A callback was created for the caller.' : '',
          data.channelChanged ? 'Sent on a different channel.' : '',
          data.attemptNumber ? `Attempt ${data.attemptNumber}.` : '',
        ]
          .filter(Boolean)
          .join(' ');
        setOutcome({ kind: 'ok', message: `${success} ${extras}`.trim() });
        setNote('');
        router.refresh();
        return;
      }
      if (data.status === 'CONFLICT') {
        setOutcome({
          kind: 'refused',
          message: `This is already ${String(data.currentState ?? 'in another state').toLowerCase()}, so that change was refused.`,
        });
        router.refresh();
        return;
      }
      if (data.status === 'INVALID' && data.issues) {
        setOutcome({
          kind: 'refused',
          message: data.issues.map((issue) => issue.message).join(' · '),
        });
        return;
      }
      setOutcome({
        kind: 'refused',
        message: data.message ?? `The platform returned ${response.status}.`,
      });
    } catch {
      setOutcome({
        kind: 'refused',
        message: 'The operations service is not reachable. Nothing changed.',
      });
    }
  }

  const ownerOptions =
    owners && owners.length > 0
      ? [
          { value: '', label: 'Unassigned' },
          ...owners.map((person) => ({ value: person.id, label: person.displayName })),
        ]
      : OWNERS;

  return (
    <div className="queue-actions">
      {outcome.kind === 'ok' ? (
        <Banner tone="good" title="Done">
          {outcome.message}
        </Banner>
      ) : null}
      {outcome.kind === 'refused' ? (
        <Banner tone="warning" title="That change was refused">
          {outcome.message}
        </Banner>
      ) : null}

      {kind === 'handoffs' ? (
        <div className="queue-action-row">
          <Button
            size="small"
            variant="secondary"
            type="button"
            disabled={busy || closed}
            onClick={() => {
              void act({ action: 'COMPLETE' }, 'Recorded as answered.');
            }}
          >
            Mark answered
          </Button>
          <Button
            size="small"
            variant="danger"
            type="button"
            disabled={busy || closed}
            onClick={() => {
              void act(
                { action: 'FAIL', note: note.trim() || undefined },
                'Recorded as unanswered.',
              );
            }}
          >
            Mark unanswered
          </Button>
          <span className="evidence-note">
            Marking a transfer unanswered creates the callback the caller is owed.
          </span>
        </div>
      ) : null}

      {kind === 'messages' ? (
        <div className="queue-action-row">
          <Button
            size="small"
            variant="secondary"
            type="button"
            disabled={busy || status === 'DELIVERED'}
            onClick={() => {
              void act({ action: 'RETRY' }, 'A new delivery attempt was queued.');
            }}
          >
            Retry
          </Button>
          <Button
            size="small"
            variant="secondary"
            type="button"
            disabled={busy || status === 'DELIVERED'}
            onClick={() => {
              void act({ action: 'RETRY', channel: 'SMS' }, 'Queued on SMS instead.');
            }}
          >
            Retry on SMS
          </Button>
          <ConfirmDialog
            title="Cancel this message?"
            description="The customer will not receive it. The record of the attempt is kept."
            confirmLabel="Cancel the message"
            trigger={
              <Button
                size="small"
                variant="ghost"
                type="button"
                disabled={busy || status === 'DELIVERED'}
              >
                Cancel
              </Button>
            }
            onConfirm={() => act({ action: 'CANCEL' }, 'Cancelled.')}
          />
        </div>
      ) : null}

      {kind === 'callbacks' || kind === 'tasks' ? (
        <>
          <div className="queue-action-row">
            <SelectField
              id={`owner-${id}`}
              label="Assign to"
              options={ownerOptions}
              value={owner}
              disabled={busy || closed}
              onChange={(event) => {
                setOwner(event.target.value);
                if (event.target.value) {
                  void act({ action: 'ASSIGN', ownerId: event.target.value }, 'Assigned.');
                }
              }}
            />
            <Button
              size="small"
              variant="secondary"
              type="button"
              disabled={busy || closed || status === 'IN_PROGRESS'}
              onClick={() => {
                void act({ action: 'START' }, 'Marked in progress.');
              }}
            >
              Start
            </Button>
            <Button
              size="small"
              variant="secondary"
              type="button"
              disabled={busy || closed}
              onClick={() => {
                void act({ action: 'REPRIORITISE', priority: 'HIGH' }, 'Priority raised to high.');
              }}
            >
              Raise priority
            </Button>
            {closed ? (
              <Button
                size="small"
                variant="secondary"
                type="button"
                disabled={busy}
                onClick={() => {
                  void act({ action: 'REOPEN' }, 'Reopened.');
                }}
              >
                Reopen
              </Button>
            ) : (
              <ConfirmDialog
                title="Cancel this work?"
                description="It will no longer appear as outstanding. The record is kept and it can be reopened."
                confirmLabel="Cancel it"
                trigger={
                  <Button size="small" variant="ghost" type="button" disabled={busy}>
                    Cancel
                  </Button>
                }
                onConfirm={() => act({ action: 'CANCEL' }, 'Cancelled.')}
              />
            )}
          </div>

          {!closed ? (
            <div className="queue-complete">
              <TextArea
                id={`note-${id}`}
                label="What was done"
                hint="Required to complete. Recorded as the evidence for closing this work."
                rows={2}
                value={note}
                disabled={busy}
                onChange={(event) => setNote(event.target.value)}
              />
              <Button
                variant="primary"
                type="button"
                disabled={busy || note.trim().length < 4}
                onClick={() => {
                  void act({ action: 'COMPLETE', note: note.trim() }, 'Completed.');
                }}
              >
                Complete with evidence
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
