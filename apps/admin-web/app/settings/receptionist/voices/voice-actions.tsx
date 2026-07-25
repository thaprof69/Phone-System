'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Banner,
  Button,
  CheckboxField,
  FormActions,
  SelectField,
  humaniseState,
} from '@quantum-parks/ui';

/**
 * Mutating controls for the voice library.
 *
 * Every control reports exactly what the platform returned. Approval of a cloned voice
 * is refused server-side when no valid consent record exists — the refusal reason is
 * shown, never swallowed into a generic failure.
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
  const response = await fetch(`/api/admin/voices/${path}`, {
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
  if (status === 'NOT_FOUND') return { kind: 'refused', message: 'That voice no longer exists.' };
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

export function ApproveVoiceButton({
  voiceId,
  custom,
  consentValid,
}: {
  voiceId: string;
  custom: boolean;
  consentValid: boolean;
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const busy = outcome.kind === 'working';

  async function approve() {
    setOutcome({ kind: 'working' });
    const data = await call(`${voiceId}/approve`);
    const refusal = refusalFrom(data);
    if (refusal) {
      setOutcome(refusal);
      return;
    }
    setOutcome({ kind: 'ok', message: 'Approved for caller-facing use.' });
    router.refresh();
  }

  return (
    <div className="inline-form">
      <OutcomeNotice outcome={outcome} />
      {custom && !consentValid ? (
        <p className="field-hint">
          This cloned voice has no currently valid consent on file. Approval will be refused until
          one is recorded.
        </p>
      ) : null}
      <Button variant="secondary" onClick={() => void approve()} disabled={busy}>
        Approve
      </Button>
    </div>
  );
}

export function AssignVoiceForm({
  voiceId,
  agentVersions,
}: {
  voiceId: string;
  agentVersions: Array<{ value: string; label: string }>;
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const [agentVersionId, setAgentVersionId] = useState('');
  const [language, setLanguage] = useState('en');
  const [environment, setEnvironment] = useState('development');
  const [fallback, setFallback] = useState(false);
  const busy = outcome.kind === 'working';

  async function assign() {
    if (!agentVersionId) {
      setOutcome({ kind: 'refused', message: 'Select an agent version to assign this voice to.' });
      return;
    }
    setOutcome({ kind: 'working' });
    const data = await call('assignments', {
      agentVersionId,
      voiceProfileId: voiceId,
      language,
      environment,
      fallback,
    });
    const refusal = refusalFrom(data);
    if (refusal) {
      setOutcome(refusal);
      return;
    }
    setOutcome({
      kind: 'ok',
      message: `Assigned as the ${fallback ? 'fallback' : 'primary'} voice for ${language.toUpperCase()} in ${humaniseState(environment).toLowerCase()}.`,
    });
    router.refresh();
  }

  return (
    <div className="inline-form">
      <OutcomeNotice outcome={outcome} />
      <SelectField
        id={`assign-agent-${voiceId}`}
        label="Agent version"
        placeholder="Select an agent version"
        options={agentVersions}
        value={agentVersionId}
        onChange={(event) => setAgentVersionId(event.target.value)}
      />
      <SelectField
        id={`assign-language-${voiceId}`}
        label="Language"
        options={[
          { value: 'en', label: 'English' },
          { value: 'pt', label: 'Portuguese' },
          { value: 'es', label: 'Spanish' },
          { value: 'fr', label: 'French' },
        ]}
        value={language}
        onChange={(event) => setLanguage(event.target.value)}
      />
      <SelectField
        id={`assign-environment-${voiceId}`}
        label="Environment"
        options={[
          { value: 'development', label: 'Development' },
          { value: 'staging', label: 'Staging' },
          { value: 'production', label: 'Production' },
        ]}
        value={environment}
        onChange={(event) => setEnvironment(event.target.value)}
        hint="Production requires a recorded native-speaker approval for the language."
      />
      <CheckboxField
        id={`assign-fallback-${voiceId}`}
        label="Fallback voice"
        hint="Used only when the primary voice for this language and environment is unavailable."
        checked={fallback}
        onChange={(event) => setFallback(event.target.checked)}
      />
      <FormActions>
        <Button onClick={() => void assign()} disabled={busy}>
          Assign
        </Button>
      </FormActions>
    </div>
  );
}

export function RefreshCatalogueButton() {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const busy = outcome.kind === 'working';

  async function refresh() {
    setOutcome({ kind: 'working' });
    const data = await call('refresh');
    const refusal = refusalFrom(data);
    if (refusal) {
      setOutcome(refusal);
      return;
    }
    setOutcome({
      kind: 'ok',
      message:
        typeof data.synchronized === 'number'
          ? `Synchronised ${data.synchronized} voices from the provider.`
          : 'Refreshed.',
    });
    router.refresh();
  }

  return (
    <div className="inline-form">
      <OutcomeNotice outcome={outcome} />
      <Button variant="secondary" onClick={() => void refresh()} disabled={busy}>
        Refresh from provider
      </Button>
    </div>
  );
}
