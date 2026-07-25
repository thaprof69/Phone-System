'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Banner, Button, FormActions, SelectField, TextArea, TextField } from '@quantum-parks/ui';

/**
 * Mutating controls for Administration: feature flags, retention policies,
 * legal holds and role assignment.
 *
 * Every control reports exactly what the platform returned. A retention policy
 * cannot be activated without a prior recorded approval, and granting a role that
 * would let one person both author and approve the same artefact is refused
 * server-side — this interface cannot talk its way around either gate.
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
  const response = await fetch(`/api/admin/administration/${path}`, {
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
    return { kind: 'refused', message: 'That record no longer exists.' };
  }
  if (status === 'CONFLICT') {
    return { kind: 'refused', message: String(data.message ?? 'This is already in that state.') };
  }
  if (status === 'BLOCKED') {
    return {
      kind: 'refused',
      message: 'The platform refused this because conditions are not met.',
      reasons: Array.isArray(data.blockers) ? (data.blockers as string[]) : [],
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

export function ToggleFeatureFlagForm({ flagId, enabled }: { flagId: string; enabled: boolean }) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const [reason, setReason] = useState('');
  const busy = outcome.kind === 'working';

  async function toggle() {
    setOutcome({ kind: 'working' });
    const data = await call(`feature-flags/${flagId}`, { enabled: !enabled, reason });
    const refusal = refusalFrom(data);
    if (refusal) {
      setOutcome(refusal);
      return;
    }
    setOutcome({ kind: 'ok', message: enabled ? 'Disabled.' : 'Enabled.' });
    setReason('');
    router.refresh();
  }

  return (
    <div className="inline-form">
      <OutcomeNotice outcome={outcome} />
      <TextArea
        id={`flag-reason-${flagId}`}
        label="Reason"
        rows={2}
        hint="Recorded permanently in the audit log."
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <FormActions>
        <Button
          variant={enabled ? 'secondary' : 'primary'}
          onClick={() => void toggle()}
          disabled={busy || reason.trim().length < 8}
        >
          {enabled ? 'Disable' : 'Enable'}
        </Button>
      </FormActions>
    </div>
  );
}

export function ApproveRetentionPolicyForm({
  policyId,
  approved,
}: {
  policyId: string;
  approved: boolean;
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const [reason, setReason] = useState('');
  const busy = outcome.kind === 'working';

  async function approve() {
    setOutcome({ kind: 'working' });
    const data = await call(`retention/${policyId}/approve`, { reason });
    const refusal = refusalFrom(data);
    if (refusal) {
      setOutcome(refusal);
      return;
    }
    setOutcome({ kind: 'ok', message: 'Approved.' });
    setReason('');
    router.refresh();
  }

  // Always mounted rather than swapped for a plain label: a successful approval
  // flips `approved` on the very next server render, which would otherwise take
  // this confirmation down with it.
  if (approved && outcome.kind !== 'ok') {
    return (
      <div className="inline-form">
        <OutcomeNotice outcome={outcome} />
        <p className="muted-cell">Already approved.</p>
      </div>
    );
  }

  return (
    <div className="inline-form">
      <OutcomeNotice outcome={outcome} />
      <TextArea
        id={`retention-approve-reason-${policyId}`}
        label="Approval reason"
        rows={2}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <FormActions>
        <Button onClick={() => void approve()} disabled={busy || reason.trim().length < 8}>
          Approve
        </Button>
      </FormActions>
    </div>
  );
}

export function SetRetentionActiveForm({
  policyId,
  active,
  approved,
}: {
  policyId: string;
  active: boolean;
  approved: boolean;
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const [reason, setReason] = useState('');
  const busy = outcome.kind === 'working';

  async function toggle() {
    setOutcome({ kind: 'working' });
    const data = await call(`retention/${policyId}/active`, { active: !active, reason });
    const refusal = refusalFrom(data);
    if (refusal) {
      setOutcome(refusal);
      return;
    }
    setOutcome({ kind: 'ok', message: active ? 'Deactivated.' : 'Activated.' });
    setReason('');
    router.refresh();
  }

  return (
    <div className="inline-form">
      <OutcomeNotice outcome={outcome} />
      {!active && !approved ? (
        <p className="muted-cell">An unapproved policy cannot be enforced.</p>
      ) : null}
      <TextArea
        id={`retention-active-reason-${policyId}`}
        label="Reason"
        rows={2}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <FormActions>
        <Button
          variant={active ? 'secondary' : 'primary'}
          onClick={() => void toggle()}
          disabled={busy || reason.trim().length < 8 || (!active && !approved)}
        >
          {active ? 'Deactivate enforcement' : 'Activate enforcement'}
        </Button>
      </FormActions>
    </div>
  );
}

export function PlaceLegalHoldForm() {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const [scopeType, setScopeType] = useState('CONVERSATION');
  const [scopeId, setScopeId] = useState('');
  const [reason, setReason] = useState('');
  const busy = outcome.kind === 'working';

  async function place() {
    setOutcome({ kind: 'working' });
    const data = await call('legal-holds', { scopeType, scopeId: scopeId.trim(), reason });
    const refusal = refusalFrom(data);
    if (refusal) {
      setOutcome(refusal);
      return;
    }
    setOutcome({ kind: 'ok', message: 'Legal hold placed.' });
    setScopeId('');
    setReason('');
    router.refresh();
  }

  return (
    <div className="inline-form">
      <OutcomeNotice outcome={outcome} />
      <SelectField
        id="legal-hold-scope-type"
        label="What this covers"
        options={[
          { value: 'CONVERSATION', label: 'A call' },
          { value: 'KNOWLEDGE_ASSET', label: 'A knowledge asset' },
        ]}
        value={scopeType}
        onChange={(event) => setScopeType(event.target.value)}
      />
      <TextField
        id="legal-hold-scope-id"
        label="Record ID"
        value={scopeId}
        onChange={(event) => setScopeId(event.target.value)}
        hint="The exact identifier of the call or knowledge asset this hold covers."
      />
      <TextArea
        id="legal-hold-reason"
        label="Reason"
        rows={2}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <FormActions>
        <Button
          onClick={() => void place()}
          disabled={busy || scopeId.trim().length < 8 || reason.trim().length < 8}
        >
          Place legal hold
        </Button>
      </FormActions>
    </div>
  );
}

export function ReleaseLegalHoldForm({ holdId, released }: { holdId: string; released: boolean }) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const [reason, setReason] = useState('');
  const busy = outcome.kind === 'working';

  async function release() {
    setOutcome({ kind: 'working' });
    const data = await call(`legal-holds/${holdId}/release`, { reason });
    const refusal = refusalFrom(data);
    if (refusal) {
      setOutcome(refusal);
      return;
    }
    setOutcome({ kind: 'ok', message: 'Released.' });
    setReason('');
    router.refresh();
  }

  if (released && outcome.kind !== 'ok') {
    return (
      <div className="inline-form">
        <OutcomeNotice outcome={outcome} />
        <p className="muted-cell">Already released.</p>
      </div>
    );
  }

  return (
    <div className="inline-form">
      <OutcomeNotice outcome={outcome} />
      <TextArea
        id={`legal-hold-release-reason-${holdId}`}
        label="Release reason"
        rows={2}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <FormActions>
        <Button
          variant="secondary"
          onClick={() => void release()}
          disabled={busy || reason.trim().length < 8}
        >
          Release hold
        </Button>
      </FormActions>
    </div>
  );
}

export function UserRoleManager({
  userId,
  roleOptions,
  heldRoleIds,
}: {
  userId: string;
  roleOptions: Array<{ id: string; name: string }>;
  heldRoleIds: string[];
}) {
  const router = useRouter();
  const [overrides, setOverrides] = useState<Record<string, 'held' | 'not-held'>>({});
  const [busyRoleId, setBusyRoleId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Outcome>({ kind: 'idle' });
  const heldSet = new Set(heldRoleIds);

  async function toggle(roleId: string, currentlyHeld: boolean) {
    setBusyRoleId(roleId);
    setNotice({ kind: 'working' });
    const data = currentlyHeld
      ? await call('roles/revoke', { userId, roleId })
      : await call('roles/assign', { userId, roleId });
    setBusyRoleId(null);
    const refusal = refusalFrom(data);
    if (refusal) {
      setNotice(refusal);
      return;
    }
    setOverrides((current) => ({ ...current, [roleId]: currentlyHeld ? 'not-held' : 'held' }));
    setNotice({ kind: 'ok', message: currentlyHeld ? 'Role revoked.' : 'Role granted.' });
    router.refresh();
  }

  return (
    <div className="inline-form">
      <OutcomeNotice outcome={notice} />
      <ul className="role-manager-list">
        {roleOptions.map((role) => {
          const overridden = overrides[role.id];
          const held = overridden ? overridden === 'held' : heldSet.has(role.id);
          return (
            <li key={role.id} className="role-manager-row">
              <span>{role.name}</span>
              <Button
                variant={held ? 'secondary' : 'primary'}
                onClick={() => void toggle(role.id, held)}
                disabled={busyRoleId === role.id}
              >
                {held ? 'Revoke' : 'Grant'}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
