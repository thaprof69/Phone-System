'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Banner,
  Button,
  FormActions,
  SelectField,
  TextArea,
  humaniseState,
} from '@quantum-parks/ui';

/**
 * Mutating controls for calls and corrections.
 *
 * Every control reports exactly what the platform returned. Approving a correction
 * records the decision and its reason permanently in `correctionHistory`; it does not
 * silently rewrite the transcript, summary or classification it targets — those remain
 * AI-attributed artifacts, and splicing a human edit into them under a fabricated
 * provider and model would misrepresent whose judgement produced the content.
 */

type Outcome =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'ok'; message: string }
  | { kind: 'refused'; message: string; reasons?: string[] };

async function call(
  path: string,
  body?: unknown,
): Promise<Record<string, unknown> & { httpStatus: number }> {
  const response = await fetch(`/api/admin/calls/${path}`, {
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
    return { kind: 'refused', message: 'That target no longer exists on this call.' };
  }
  if (status === 'CONFLICT') {
    return {
      kind: 'refused',
      message: `This correction is already ${humaniseState(String(data.currentStatus ?? 'decided')).toLowerCase()}, so that decision was refused.`,
    };
  }
  if (status === 'INVALID') {
    return {
      kind: 'refused',
      message: 'The platform rejected this as invalid.',
      reasons: Array.isArray(data.issues)
        ? (data.issues as Array<{ field?: string; message?: string }>).map(
            (issue) => `${issue.field ?? 'field'}: ${issue.message ?? ''}`,
          )
        : [],
    };
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
      <>
        <Banner tone="danger" title="Refused">
          {outcome.message}
        </Banner>
        {outcome.reasons && outcome.reasons.length > 0 ? (
          <ul className="blocker-list">
            {outcome.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : null}
      </>
    );
  }
  return null;
}

export type CorrectionTarget = { value: string; label: string; recordId: string };

export function ProposeCorrectionForm({
  conversationId,
  targets,
}: {
  conversationId: string;
  targets: CorrectionTarget[];
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const [targetKey, setTargetKey] = useState(targets[0]?.value ?? '');
  const [reason, setReason] = useState('');
  const [proposedValue, setProposedValue] = useState('{\n  \n}');
  const busy = outcome.kind === 'working';

  async function propose() {
    const target = targets.find((item) => item.value === targetKey);
    if (!target) {
      setOutcome({ kind: 'refused', message: 'Select what this correction is about.' });
      return;
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(proposedValue) as Record<string, unknown>;
    } catch {
      setOutcome({ kind: 'refused', message: 'The proposed value is not valid JSON.' });
      return;
    }
    setOutcome({ kind: 'working' });
    const [targetType] = target.value.split(':');
    const data = await call(`${conversationId}/corrections`, {
      targetType,
      targetRecordId: target.recordId,
      reason,
      proposedValue: parsed,
    });
    const refusal = refusalFrom(data);
    if (refusal) {
      setOutcome(refusal);
      return;
    }
    setOutcome({ kind: 'ok', message: 'Correction proposed and awaiting review.' });
    setReason('');
    router.refresh();
  }

  if (targets.length === 0) {
    return (
      <p className="muted-cell">
        Nothing on this call has a transcript, summary or classification yet to correct.
      </p>
    );
  }

  return (
    <div className="inline-form">
      <OutcomeNotice outcome={outcome} />
      <SelectField
        id={`correction-target-${conversationId}`}
        label="What is this about"
        options={targets}
        value={targetKey}
        onChange={(event) => setTargetKey(event.target.value)}
      />
      <TextArea
        id={`correction-reason-${conversationId}`}
        label="Reason"
        rows={2}
        hint="Recorded permanently, whichever way this is decided."
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <TextArea
        id={`correction-value-${conversationId}`}
        label="Proposed value (JSON)"
        rows={6}
        hint="What the corrected content should say."
        value={proposedValue}
        onChange={(event) => setProposedValue(event.target.value)}
      />
      <FormActions>
        <Button onClick={() => void propose()} disabled={busy || reason.trim().length < 8}>
          Propose correction
        </Button>
      </FormActions>
    </div>
  );
}

export function DecideCorrectionForm({
  correctionId,
  alreadyDecided,
}: {
  correctionId: string;
  /** The correction's current status. Anything other than PROPOSED means decided. */
  alreadyDecided: string;
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const [decision, setDecision] = useState('APPROVE');
  const [reason, setReason] = useState('');
  const busy = outcome.kind === 'working';

  async function decide() {
    setOutcome({ kind: 'working' });
    const data = await call(`corrections/${correctionId}/decision`, {
      decision,
      reason: reason.trim(),
    });
    const refusal = refusalFrom(data);
    if (refusal) {
      setOutcome(refusal);
      return;
    }
    setOutcome({
      kind: 'ok',
      message: decision === 'APPROVE' ? 'Approved.' : 'Rejected.',
    });
    setReason('');
    router.refresh();
  }

  // `router.refresh()` above flips `alreadyDecided` away from PROPOSED the instant a
  // decision succeeds, which would otherwise replace this very confirmation with an
  // "already decided" notice in the same render. Once this component has recorded its
  // own success locally, that takes precedence over what the next server render says.
  if (alreadyDecided !== 'PROPOSED' && outcome.kind !== 'ok') {
    return (
      <div className="inline-form">
        <OutcomeNotice outcome={outcome} />
        <p className="muted-cell">
          This correction is already {humaniseState(alreadyDecided).toLowerCase()}.
        </p>
      </div>
    );
  }

  return (
    <div className="inline-form">
      <OutcomeNotice outcome={outcome} />
      <SelectField
        id={`decide-correction-${correctionId}`}
        label="Decision"
        options={[
          { value: 'APPROVE', label: 'Approve' },
          { value: 'REJECT', label: 'Reject' },
        ]}
        value={decision}
        onChange={(event) => setDecision(event.target.value)}
      />
      <TextArea
        id={`decide-correction-reason-${correctionId}`}
        label="Reason"
        rows={2}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <FormActions>
        <Button onClick={() => void decide()} disabled={busy || reason.trim().length < 8}>
          Record decision
        </Button>
      </FormActions>
    </div>
  );
}

export function RunReconciliationButton() {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const busy = outcome.kind === 'working';

  async function run() {
    setOutcome({ kind: 'working' });
    const data = await call('reconciliation/run');
    const refusal = refusalFrom(data);
    if (refusal) {
      setOutcome(refusal);
      return;
    }
    setOutcome({
      kind: 'ok',
      message:
        data.status === 'QUEUED'
          ? 'Reconciliation queued with the workflow engine.'
          : 'Accepted, but the workflow engine is temporarily unavailable — nothing was queued.',
    });
    router.refresh();
  }

  return (
    <div className="inline-form">
      <OutcomeNotice outcome={outcome} />
      <Button variant="secondary" onClick={() => void run()} disabled={busy}>
        Run reconciliation now
      </Button>
    </div>
  );
}
