'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Banner, Button, StatusPill, humaniseState, toneForState } from '@quantum-parks/ui';

/**
 * Draft lifecycle controls.
 *
 * Every button here calls the platform and reports exactly what came back. A rejected
 * transition is shown as a rejection — the interface never advances its own display to
 * a state the server did not grant.
 */

type Result =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'ok'; message: string }
  | { kind: 'blocked'; message: string; issues?: string[] };

export function DraftActions({
  agentId,
  versionId,
  versionNumber,
  state,
  hasDraft,
}: {
  agentId: string;
  versionId: string;
  versionNumber: number;
  state: string;
  hasDraft: boolean;
}) {
  const router = useRouter();
  const [result, setResult] = useState<Result>({ kind: 'idle' });

  async function call(path: string, successMessage: string) {
    setResult({ kind: 'working' });
    try {
      const response = await fetch(`/api/admin/agents/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = (await response.json().catch(() => ({}))) as {
        status?: string;
        message?: string;
        issues?: Array<{ path: string; message: string }>;
        existingDraftId?: string;
        currentState?: string;
      };

      if (response.ok && (body.status === 'CREATED' || body.status === 'SUBMITTED')) {
        setResult({ kind: 'ok', message: successMessage });
        router.refresh();
        return;
      }
      if (body.status === 'CONFLICT') {
        setResult({
          kind: 'blocked',
          message: body.existingDraftId
            ? 'This agent already has an open draft. Finish or discard it before starting another.'
            : `This version is ${humaniseState(body.currentState ?? 'in another state')} and cannot make that transition.`,
        });
        return;
      }
      if (body.status === 'INVALID') {
        setResult({
          kind: 'blocked',
          message: 'The platform rejected this version as invalid.',
          ...(body.issues
            ? { issues: body.issues.map((issue) => `${issue.path}: ${issue.message}`) }
            : {}),
        });
        return;
      }
      setResult({
        kind: 'blocked',
        message: body.message ?? `The platform returned ${response.status}.`,
      });
    } catch {
      setResult({ kind: 'blocked', message: 'The operations service is not reachable.' });
    }
  }

  const busy = result.kind === 'working';
  const editable = state === 'DRAFT' || state === 'CHANGES_REQUESTED';

  return (
    <div className="draft-actions">
      <div className="draft-actions-row">
        <div>
          <p className="eyebrow">Editing</p>
          <strong>Version {versionNumber}</strong>
          <StatusPill tone={toneForState(state)}>{humaniseState(state)}</StatusPill>
        </div>
        <div className="draft-actions-buttons">
          {!hasDraft ? (
            <Button
              variant="primary"
              type="button"
              disabled={busy}
              onClick={() => {
                void call(`${agentId}/draft`, 'A new draft was created from this version.');
              }}
            >
              {busy ? 'Working…' : 'Start a new draft'}
            </Button>
          ) : null}
          {editable ? (
            <Button
              variant="secondary"
              type="button"
              disabled={busy}
              onClick={() => {
                void call(
                  `versions/${versionId}/submit`,
                  'Submitted for review. An approver other than the author must now sign it off.',
                );
              }}
            >
              {busy ? 'Working…' : 'Submit for review'}
            </Button>
          ) : null}
        </div>
      </div>

      {result.kind === 'ok' ? (
        <Banner tone="good" title="Done">
          {result.message}
        </Banner>
      ) : null}

      {result.kind === 'blocked' ? (
        <Banner tone="warning" title="That was not permitted">
          {result.message}
          {result.issues ? (
            <>
              {' '}
              <span className="evidence-note">{result.issues.join(' · ')}</span>
            </>
          ) : null}
        </Banner>
      ) : null}
    </div>
  );
}
