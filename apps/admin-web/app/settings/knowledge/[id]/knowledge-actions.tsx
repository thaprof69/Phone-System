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
 * Mutating controls for one knowledge asset.
 *
 * Every control reports exactly what the platform returned. A refusal is shown with its
 * reason; the interface never advances its own display to a state the server did not
 * grant, and a successful edit or decision always comes from a fresh server response.
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
  const response = await fetch(`/api/admin/knowledge/${path}`, {
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
  if (status === 'BLOCKED') {
    return {
      kind: 'refused',
      message: 'The platform refused this because conditions are not met.',
      reasons: Array.isArray(data.blockers) ? (data.blockers as string[]) : [],
    };
  }
  if (status === 'CONFLICT') {
    return {
      kind: 'refused',
      message: `This is already ${humaniseState(String(data.currentState ?? 'in another state')).toLowerCase()}, so that change was refused.`,
    };
  }
  if (status === 'NOT_FOUND') return { kind: 'refused', message: 'That record no longer exists.' };
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

/** Authors a new version. Live content is passed in as the starting point to edit. */
export function KnowledgeEditor({
  assetId,
  liveContent,
  hasOpenDraft,
  openDraftMessage,
}: {
  assetId: string;
  liveContent: string;
  /** Whether the server-rendered data already shows an open draft or review. */
  hasOpenDraft: boolean;
  openDraftMessage?: string | undefined;
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const [content, setContent] = useState(liveContent);
  const [changeReason, setChangeReason] = useState('');
  const busy = outcome.kind === 'working';

  async function save() {
    setOutcome({ kind: 'working' });
    const data = await call(`${assetId}/versions`, { content, changeReason: changeReason.trim() });
    const refusal = refusalFrom(data);
    if (refusal) {
      setOutcome(refusal);
      return;
    }
    setOutcome({
      kind: 'ok',
      message: `Draft version ${String((data.version as { version?: number } | undefined)?.version ?? '')} created. It is not visible to callers until it is reviewed and approved.`,
    });
    setChangeReason('');
    router.refresh();
  }

  // `router.refresh()` above re-fetches the page after a successful save, which flips
  // `hasOpenDraft` from false to true — since the version just created *is* now the
  // open draft. Without this override the confirmation would be replaced by the
  // "already open" notice in the same instant it appeared. Once this component has
  // recorded its own success locally, that local state takes precedence over whatever
  // the next server render says.
  if (hasOpenDraft && outcome.kind !== 'ok') {
    return (
      <div className="inline-form">
        <OutcomeNotice outcome={outcome} />
        <Banner tone="info" title="A draft is already open">
          {openDraftMessage}
        </Banner>
      </div>
    );
  }

  return (
    <div className="inline-form">
      <OutcomeNotice outcome={outcome} />
      <TextArea
        id={`knowledge-content-${assetId}`}
        label="Content"
        rows={10}
        value={content}
        onChange={(event) => setContent(event.target.value)}
      />
      <TextArea
        id={`knowledge-reason-${assetId}`}
        label="Reason for this change"
        rows={2}
        hint="Recorded against the version and shown to whoever reviews it."
        value={changeReason}
        onChange={(event) => setChangeReason(event.target.value)}
      />
      <FormActions>
        <Button onClick={() => void save()} disabled={busy || changeReason.trim().length < 8}>
          Save as new draft
        </Button>
      </FormActions>
    </div>
  );
}

export function SubmitForReviewButton({ versionId }: { versionId: string }) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const busy = outcome.kind === 'working';

  async function submit() {
    setOutcome({ kind: 'working' });
    const data = await call(`versions/${versionId}/submit`);
    const refusal = refusalFrom(data);
    if (refusal) {
      setOutcome(refusal);
      return;
    }
    setOutcome({ kind: 'ok', message: 'Submitted for review.' });
    router.refresh();
  }

  return (
    <div className="inline-form">
      <OutcomeNotice outcome={outcome} />
      <Button onClick={() => void submit()} disabled={busy}>
        Submit for review
      </Button>
    </div>
  );
}

const DECISIONS = [
  { value: 'APPROVE', label: 'Approve' },
  { value: 'REJECT', label: 'Reject, back to draft' },
];

export function ReviewDecision({
  versionId,
  requiresIndependentApprover,
}: {
  versionId: string;
  requiresIndependentApprover: boolean;
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const [decision, setDecision] = useState('APPROVE');
  const [reason, setReason] = useState('');
  const busy = outcome.kind === 'working';

  async function decide() {
    setOutcome({ kind: 'working' });
    const data = await call(`versions/${versionId}/decision`, {
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
      message: decision === 'APPROVE' ? 'Approved.' : 'Rejected and returned to draft.',
    });
    setReason('');
    router.refresh();
  }

  return (
    <div className="inline-form">
      <OutcomeNotice outcome={outcome} />
      {requiresIndependentApprover ? (
        <Banner tone="warning" title="Independent approval required">
          This is high-risk content. The platform refuses an approval from the person who authored
          it, regardless of who submits this form.
        </Banner>
      ) : null}
      <SelectField
        id={`decision-${versionId}`}
        label="Decision"
        options={DECISIONS}
        value={decision}
        onChange={(event) => setDecision(event.target.value)}
      />
      <TextArea
        id={`decision-reason-${versionId}`}
        label="Reason"
        rows={2}
        hint="Recorded in the audit trail regardless of the decision."
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

export function RetrySyncButton({ syncId }: { syncId: string }) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const busy = outcome.kind === 'working';

  async function retry() {
    setOutcome({ kind: 'working' });
    const data = await call(`syncs/${syncId}/retry`);
    const refusal = refusalFrom(data);
    if (refusal) {
      setOutcome(refusal);
      return;
    }
    setOutcome({
      kind: 'ok',
      message:
        data.status === 'QUEUED'
          ? 'Retry queued. The local approved content is what will be sent.'
          : 'Retry accepted, but the publication workflow is temporarily unavailable.',
    });
    router.refresh();
  }

  return (
    <div className="inline-form">
      <OutcomeNotice outcome={outcome} />
      <Button variant="secondary" onClick={() => void retry()} disabled={busy}>
        Retry synchronisation
      </Button>
    </div>
  );
}

export function AssignmentForm({
  versionId,
  assetLanguage,
  agentVersions,
}: {
  versionId: string;
  assetLanguage: string;
  agentVersions: Array<{ value: string; label: string }>;
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const [agentVersionId, setAgentVersionId] = useState('');
  const [park, setPark] = useState('');
  const busy = outcome.kind === 'working';

  async function assign(active: boolean) {
    if (!agentVersionId) {
      setOutcome({ kind: 'refused', message: 'Select an agent version to assign this to.' });
      return;
    }
    setOutcome({ kind: 'working' });
    const data = await call(`versions/${versionId}/assignments`, {
      agentVersionId,
      language: assetLanguage,
      active,
      ...(park.trim() ? { park: park.trim() } : {}),
    });
    const refusal = refusalFrom(data);
    if (refusal) {
      setOutcome(refusal);
      return;
    }
    setOutcome({
      kind: 'ok',
      message: active ? 'Assigned and active.' : 'Assignment saved, marked inactive.',
    });
    router.refresh();
  }

  return (
    <div className="inline-form">
      <OutcomeNotice outcome={outcome} />
      <SelectField
        id={`assign-agent-${versionId}`}
        label="Agent version"
        placeholder="Select an agent version"
        options={agentVersions}
        value={agentVersionId}
        onChange={(event) => setAgentVersionId(event.target.value)}
      />
      <FormActions>
        <Button onClick={() => void assign(true)} disabled={busy}>
          Assign and activate
        </Button>
        <Button variant="secondary" onClick={() => void assign(false)} disabled={busy}>
          Save inactive
        </Button>
      </FormActions>
      <p className="field-hint">
        Assigned in {assetLanguage.toUpperCase()} — the asset&rsquo;s own language. The platform
        refuses a mismatched language.
      </p>
    </div>
  );
}
