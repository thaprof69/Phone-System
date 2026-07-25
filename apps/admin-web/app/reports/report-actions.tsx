'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Banner, Button } from '@quantum-parks/ui';

/**
 * Mutating controls for report definitions and runs.
 *
 * A manual run computes the same aggregate-fact lineage the analytics series query
 * uses and records it against a new run. There is no report-rendering integration,
 * so a run this triggers never claims to have produced a file — it reports what it
 * actually computed and leaves the artefact column honestly empty.
 */

type Outcome =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'ok'; message: string }
  | { kind: 'refused'; message: string };

async function call(
  path: string,
  body?: unknown,
): Promise<Record<string, unknown> & { httpStatus: number }> {
  const response = await fetch(`/api/admin/reports/${path}`, {
    method: 'POST',
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ...data, httpStatus: response.status };
}

function refusalFrom(data: Record<string, unknown> & { httpStatus: number }): Outcome | null {
  const status = typeof data.status === 'string' ? data.status : undefined;
  if (status === 'NOT_FOUND') {
    return { kind: 'refused', message: 'That report no longer exists.' };
  }
  if (status === 'CONFLICT') {
    return { kind: 'refused', message: String(data.message ?? 'This is already in that state.') };
  }
  if (data.httpStatus === 403) {
    return { kind: 'refused', message: 'You do not have permission to make this change.' };
  }
  if (data.httpStatus >= 400) {
    return {
      kind: 'refused',
      message: String(data.message ?? `The service returned ${data.httpStatus}.`),
    };
  }
  return null;
}

function OutcomeNotice({ outcome }: { outcome: Outcome }) {
  if (outcome.kind === 'ok') {
    return (
      <Banner tone="good" title="Saved">
        {outcome.message}
      </Banner>
    );
  }
  if (outcome.kind === 'refused') {
    return (
      <Banner tone="danger" title="Refused">
        {outcome.message}
      </Banner>
    );
  }
  return null;
}

export function ReportScheduleToggle({
  definitionId,
  active,
}: {
  definitionId: string;
  active: boolean;
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const busy = outcome.kind === 'working';

  async function toggle() {
    setOutcome({ kind: 'working' });
    const data = await call(`${definitionId}/schedule`, { active: !active });
    const refusal = refusalFrom(data);
    if (refusal) {
      setOutcome(refusal);
      return;
    }
    setOutcome({ kind: 'ok', message: active ? 'Schedule paused.' : 'Schedule resumed.' });
    router.refresh();
  }

  return (
    <div className="inline-form">
      <OutcomeNotice outcome={outcome} />
      <Button variant="secondary" onClick={() => void toggle()} disabled={busy}>
        {active ? 'Pause schedule' : 'Resume schedule'}
      </Button>
    </div>
  );
}

export function RunReportButton({ definitionId }: { definitionId: string }) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const busy = outcome.kind === 'working';

  async function run() {
    setOutcome({ kind: 'working' });
    const data = await call(`${definitionId}/run`);
    const refusal = refusalFrom(data);
    if (refusal) {
      setOutcome(refusal);
      return;
    }
    setOutcome({ kind: 'ok', message: 'Run recorded against the last 7 days of aggregate data.' });
    router.refresh();
  }

  return (
    <div className="inline-form">
      <OutcomeNotice outcome={outcome} />
      <Button onClick={() => void run()} disabled={busy}>
        Run now
      </Button>
    </div>
  );
}

export function RetryReportRunButton({ runId }: { runId: string }) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const busy = outcome.kind === 'working';

  async function retry() {
    setOutcome({ kind: 'working' });
    const data = await call(`runs/${runId}/retry`);
    const refusal = refusalFrom(data);
    if (refusal) {
      setOutcome(refusal);
      return;
    }
    setOutcome({ kind: 'ok', message: 'Retried over the same period.' });
    router.refresh();
  }

  return (
    <div className="inline-form">
      <OutcomeNotice outcome={outcome} />
      <Button variant="secondary" onClick={() => void retry()} disabled={busy}>
        Retry
      </Button>
    </div>
  );
}
