'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Banner,
  Button,
  CheckboxField,
  Fieldset,
  FormActions,
  SelectField,
  StatusPill,
  TechnicalDetails,
  TextArea,
  TextField,
  formatCurrencyFromMicros,
  humaniseState,
} from '@quantum-parks/ui';

/**
 * Mutating controls for AI infrastructure.
 *
 * Every one of these reports what the platform actually returned. A refusal is shown as
 * a refusal with its reasons, never swallowed into a generic failure and never
 * presented as a success. The server revalidates on every call, so nothing here can
 * decide on the browser's behalf that an action was allowed.
 */

type Outcome =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'ok'; message: string }
  | { kind: 'refused'; message: string; reasons?: string[] };

const ENVIRONMENTS = [
  { value: 'development', label: 'Development' },
  { value: 'staging', label: 'Staging' },
  { value: 'production', label: 'Production' },
];

async function call(
  path: string,
  body?: unknown,
): Promise<Record<string, unknown> & { httpStatus: number }> {
  const response = await fetch(`/api/admin/ai/${path}`, {
    method: 'POST',
    // Fastify rejects an empty body that declares a JSON content type, so the header
    // is sent only when there is something to send.
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ...data, httpStatus: response.status };
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
    // The reason list sits outside the banner: `Banner` renders its children inside a
    // paragraph, and a list nested in a paragraph is invalid markup that browsers
    // silently reparent.
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

export type RouteCheckFailure = { check: string; message: string };

/**
 * A failed route condition, as the platform reports it.
 *
 * Route validation answers with `failures: [{check, message}]`; model approval and
 * budget validation answer with `blockers: string[]`. Both are read here so a refusal
 * always arrives with its reasons attached rather than as a bare "refused".
 */
function failuresFrom(data: Record<string, unknown>): string[] {
  if (Array.isArray(data.blockers)) return data.blockers as string[];
  if (Array.isArray(data.failures)) {
    return (data.failures as RouteCheckFailure[]).map(
      (failure) => `${failure.check}: ${failure.message}`,
    );
  }
  return [];
}

/** Reads a refusal out of any of the shapes the platform uses for one. */
function refusalFrom(data: Record<string, unknown> & { httpStatus: number }): Outcome | null {
  const status = typeof data.status === 'string' ? data.status : undefined;
  if (status === 'BLOCKED') {
    return {
      kind: 'refused',
      message: 'The platform refused this because conditions are not met.',
      reasons: failuresFrom(data),
    };
  }
  if (status === 'CONFLICT') {
    return {
      kind: 'refused',
      message: `This is already ${humaniseState(String(data.currentState ?? 'in another state')).toLowerCase()}, so that change was refused.`,
    };
  }
  if (status === 'FORBIDDEN') {
    return { kind: 'refused', message: String(data.message ?? 'That is not permitted.') };
  }
  if (status === 'NOT_FOUND') {
    return { kind: 'refused', message: 'That record no longer exists.' };
  }
  // A schema rejection: the request never reached the workflow.
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

/* ------------------------------------------------------------------ models */

export function ModelApprovalActions({
  modelId,
  modelLabel,
  available,
}: {
  modelId: string;
  modelLabel: string;
  available: boolean;
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const [environment, setEnvironment] = useState('development');
  const [reason, setReason] = useState('');
  const busy = outcome.kind === 'working';

  async function decide(approved: boolean) {
    if (reason.trim().length < 8) {
      setOutcome({
        kind: 'refused',
        message:
          'A reason of at least eight characters is required. It is recorded in the audit trail.',
      });
      return;
    }
    setOutcome({ kind: 'working' });
    const data = await call(`models/${modelId}/approval`, {
      environment,
      approved,
      reason: reason.trim(),
    });
    const refusal = refusalFrom(data);
    if (refusal) {
      setOutcome(refusal);
      return;
    }
    setOutcome({
      kind: 'ok',
      message: `${modelLabel} is now ${approved ? 'approved' : 'not approved'} for ${environment}.`,
    });
    setReason('');
    router.refresh();
  }

  async function toggleAvailability() {
    setOutcome({ kind: 'working' });
    const data = await call(`models/${modelId}/availability`, { available: !available });
    const refusal = refusalFrom(data);
    if (refusal) {
      setOutcome(refusal);
      return;
    }
    setOutcome({
      kind: 'ok',
      message: available
        ? 'Marked unavailable. Routes pointing at it will now fail validation.'
        : 'Marked available.',
    });
    router.refresh();
  }

  return (
    <div className="inline-form">
      <OutcomeNotice outcome={outcome} />
      <Fieldset legend={`Approval for ${modelLabel}`}>
        <SelectField
          id={`environment-${modelId}`}
          label="Environment"
          options={ENVIRONMENTS}
          value={environment}
          onChange={(event) => setEnvironment(event.target.value)}
        />
        <TextArea
          id={`reason-${modelId}`}
          label="Reason"
          rows={2}
          hint="Recorded against the decision. Approval and refusal both need one."
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <FormActions>
          <Button onClick={() => void decide(true)} disabled={busy}>
            Approve
          </Button>
          <Button variant="secondary" onClick={() => void decide(false)} disabled={busy}>
            Refuse
          </Button>
          <Button variant="ghost" onClick={() => void toggleAvailability()} disabled={busy}>
            {available ? 'Mark unavailable' : 'Mark available'}
          </Button>
        </FormActions>
      </Fieldset>
      <p className="field-hint">
        Production approval additionally requires a production-eligible provider, verified
        structured output and a model the provider still offers. The platform checks all of them
        again when you submit.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ routes */

export type RouteOption = { value: string; label: string; disabled?: boolean };

export function RouteBuilder({
  routeId,
  routeLabel,
  connections,
  models,
}: {
  routeId: string;
  routeLabel: string;
  connections: RouteOption[];
  models: RouteOption[];
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const [environment, setEnvironment] = useState('development');
  const [primaryConnection, setPrimaryConnection] = useState('');
  const [primaryModel, setPrimaryModel] = useState('');
  const [fallbackConnection, setFallbackConnection] = useState('');
  const [fallbackModel, setFallbackModel] = useState('');
  const [timeoutMs, setTimeoutMs] = useState('15000');
  const [retries, setRetries] = useState('1');
  const [confidence, setConfidence] = useState('0.6');
  const [costCeiling, setCostCeiling] = useState('');
  const [blockers, setBlockers] = useState<RouteCheckFailure[]>([]);
  const busy = outcome.kind === 'working';

  async function create() {
    if (!primaryConnection || !primaryModel) {
      setOutcome({ kind: 'refused', message: 'A primary connection and model are required.' });
      return;
    }
    setOutcome({ kind: 'working' });
    setBlockers([]);
    const data = await call(`routes/${routeId}/versions`, {
      environment,
      providerConnectionId: primaryConnection,
      modelId: primaryModel,
      ...(fallbackConnection && fallbackModel
        ? {
            fallbackProviderConnectionId: fallbackConnection,
            fallbackModelId: fallbackModel,
          }
        : {}),
      timeoutMs: Number(timeoutMs),
      maximumRetries: Number(retries),
      confidenceThreshold: Number(confidence),
      ...(costCeiling ? { maximumCostMicros: Math.round(Number(costCeiling) * 1_000_000) } : {}),
    });
    const refusal = refusalFrom(data);
    if (refusal) {
      setOutcome(refusal);
      return;
    }

    // A draft is deliberately allowed to be invalid — that is what a draft is for. The
    // platform returns the validation alongside it so the author learns immediately what
    // would stop it activating, rather than at activation.
    const created = (data.routeVersion ?? {}) as { version?: number };
    const validation = (data.validation ?? {}) as {
      valid?: boolean;
      failures?: RouteCheckFailure[];
    };
    setBlockers(validation.failures ?? []);
    setOutcome({
      kind: 'ok',
      message: `Draft version ${String(created.version ?? '')} created for ${routeLabel}. It is not serving traffic until it is activated${
        validation.valid === false ? ', and it cannot be activated yet' : ''
      }.`,
    });
    router.refresh();
  }

  return (
    <div className="inline-form">
      <OutcomeNotice outcome={outcome} />
      {blockers.length > 0 ? (
        <>
          <Banner tone="warning" title="This draft cannot be activated yet">
            Each unmet condition is listed below. Fix them and create another version.
          </Banner>
          <ul className="blocker-list">
            {blockers.map((failure) => (
              <li key={failure.check}>
                <code className="inline-code">{failure.check}</code> {failure.message}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <Fieldset legend="Primary candidate">
        <SelectField
          id={`route-env-${routeId}`}
          label="Environment"
          options={ENVIRONMENTS}
          value={environment}
          onChange={(event) => setEnvironment(event.target.value)}
        />
        <SelectField
          id={`route-primary-connection-${routeId}`}
          label="Provider connection"
          placeholder="Select a connection"
          options={connections}
          value={primaryConnection}
          onChange={(event) => setPrimaryConnection(event.target.value)}
        />
        <SelectField
          id={`route-primary-model-${routeId}`}
          label="Model"
          placeholder="Select a model"
          options={models}
          value={primaryModel}
          onChange={(event) => setPrimaryModel(event.target.value)}
        />
      </Fieldset>

      <Fieldset
        legend="Fallback candidate"
        description="Optional. A fallback identical to the primary will fail validation and cannot be activated — it would add no resilience while appearing to."
      >
        <SelectField
          id={`route-fallback-connection-${routeId}`}
          label="Fallback connection"
          placeholder="No fallback"
          options={connections}
          value={fallbackConnection}
          onChange={(event) => setFallbackConnection(event.target.value)}
        />
        <SelectField
          id={`route-fallback-model-${routeId}`}
          label="Fallback model"
          placeholder="No fallback"
          options={models}
          value={fallbackModel}
          onChange={(event) => setFallbackModel(event.target.value)}
        />
      </Fieldset>

      <Fieldset legend="Limits">
        <TextField
          id={`route-timeout-${routeId}`}
          label="Timeout in milliseconds"
          type="number"
          min={500}
          max={120000}
          value={timeoutMs}
          onChange={(event) => setTimeoutMs(event.target.value)}
        />
        <TextField
          id={`route-retries-${routeId}`}
          label="Maximum retries"
          type="number"
          min={0}
          max={5}
          value={retries}
          onChange={(event) => setRetries(event.target.value)}
        />
        <TextField
          id={`route-confidence-${routeId}`}
          label="Confidence threshold"
          type="number"
          min={0}
          max={1}
          step={0.05}
          hint="Results below this are treated as unverified rather than accepted."
          value={confidence}
          onChange={(event) => setConfidence(event.target.value)}
        />
        <TextField
          id={`route-cost-${routeId}`}
          label="Cost ceiling per run (GBP)"
          type="number"
          min={0}
          step={0.0001}
          hint="Leave empty for no per-run ceiling."
          value={costCeiling}
          onChange={(event) => setCostCeiling(event.target.value)}
        />
      </Fieldset>

      <FormActions>
        <Button onClick={() => void create()} disabled={busy}>
          Create draft version
        </Button>
      </FormActions>
    </div>
  );
}

export function RouteVersionActions({
  versionId,
  state,
  environment,
}: {
  versionId: string;
  state: string;
  environment: string;
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const [validation, setValidation] = useState<{
    valid: boolean;
    failures: RouteCheckFailure[];
  } | null>(null);
  const busy = outcome.kind === 'working';

  async function validate() {
    setOutcome({ kind: 'working' });
    const response = await fetch(`/api/admin/ai/route-versions/${versionId}/validate`);
    const data = (await response.json().catch(() => ({}))) as {
      valid?: boolean;
      failures?: RouteCheckFailure[];
    };
    setValidation({ valid: Boolean(data.valid), failures: data.failures ?? [] });
    setOutcome({ kind: 'idle' });
  }

  async function activate() {
    setOutcome({ kind: 'working' });
    const data = await call(`route-versions/${versionId}/activate`);
    const refusal = refusalFrom(data);
    if (refusal) {
      // Activation revalidates, so a refusal here is current truth rather than the
      // preview's. Show the conditions it actually returned.
      if (Array.isArray(data.failures)) {
        setValidation({ valid: false, failures: data.failures as RouteCheckFailure[] });
      }
      setOutcome(refusal);
      return;
    }
    setOutcome({ kind: 'ok', message: `Serving ${environment} traffic.` });
    router.refresh();
  }

  async function disable() {
    setOutcome({ kind: 'working' });
    const data = await call(`route-versions/${versionId}/disable`);
    const refusal = refusalFrom(data);
    if (refusal) {
      setOutcome(refusal);
      return;
    }
    setOutcome({ kind: 'ok', message: 'Disabled. It is no longer serving traffic.' });
    router.refresh();
  }

  return (
    <div className="inline-form">
      <OutcomeNotice outcome={outcome} />
      {validation ? (
        validation.valid ? (
          <Banner tone="good" title="Every condition holds">
            This is checked again at activation, so a model deprecated in the meantime would still
            stop it.
          </Banner>
        ) : (
          <>
            <Banner tone="warning" title="This route cannot serve traffic yet">
              Each unmet condition is listed below.
            </Banner>
            <ul className="blocker-list">
              {validation.failures.map((failure) => (
                <li key={failure.check}>
                  <code className="inline-code">{failure.check}</code> {failure.message}
                </li>
              ))}
            </ul>
          </>
        )
      ) : null}
      <FormActions>
        <Button variant="secondary" onClick={() => void validate()} disabled={busy}>
          Check conditions
        </Button>
        {state !== 'ACTIVE' ? (
          <Button onClick={() => void activate()} disabled={busy}>
            Activate
          </Button>
        ) : (
          <Button variant="danger" onClick={() => void disable()} disabled={busy}>
            Disable
          </Button>
        )}
      </FormActions>
    </div>
  );
}

/* --------------------------------------------------------------- artefacts */

const TRANSITIONS = [
  { value: 'SUBMIT', label: 'Submit for review' },
  { value: 'APPROVE', label: 'Approve' },
  { value: 'REJECT', label: 'Reject' },
  { value: 'ACTIVATE', label: 'Activate' },
  { value: 'ROLLBACK', label: 'Roll back' },
];

export function ArtefactActions({
  kind,
  versionId,
  state,
  codeOwned,
}: {
  kind: 'prompt' | 'schema' | 'taxonomy';
  versionId: string;
  state: string;
  codeOwned?: boolean;
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const [action, setAction] = useState('SUBMIT');
  const [reason, setReason] = useState('');
  const busy = outcome.kind === 'working';

  if (codeOwned) {
    return (
      <StatusPill tone="neutral" title="Registered by the build; not editable at runtime">
        Code-owned
      </StatusPill>
    );
  }

  async function transition() {
    if (reason.trim().length < 8) {
      setOutcome({
        kind: 'refused',
        message: 'A reason of at least eight characters is required.',
      });
      return;
    }
    setOutcome({ kind: 'working' });
    const data = await call(`artefacts/${kind}/${versionId}/transition`, {
      action,
      reason: reason.trim(),
    });
    const refusal = refusalFrom(data);
    if (refusal) {
      setOutcome(refusal);
      router.refresh();
      return;
    }
    setOutcome({
      kind: 'ok',
      message: `Moved from ${humaniseState(String(data.from ?? state)).toLowerCase()} to ${humaniseState(String(data.to ?? '')).toLowerCase()}.`,
    });
    setReason('');
    router.refresh();
  }

  return (
    <div className="inline-form">
      <OutcomeNotice outcome={outcome} />
      <SelectField
        id={`artefact-action-${versionId}`}
        label="Action"
        options={TRANSITIONS}
        value={action}
        onChange={(event) => setAction(event.target.value)}
      />
      <TextArea
        id={`artefact-reason-${versionId}`}
        label="Reason"
        rows={2}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <FormActions>
        <Button onClick={() => void transition()} disabled={busy}>
          Apply
        </Button>
      </FormActions>
      <TechnicalDetails summary="Which transitions are legal">
        <p>
          The platform holds the state machine. Submitting an already-approved version, or approving
          your own draft where two-person approval is configured, is refused with the current state
          rather than silently ignored.
        </p>
      </TechnicalDetails>
    </div>
  );
}

/* ----------------------------------------------------------------- budgets */

const SCOPES = [
  { value: 'ENVIRONMENT', label: 'Whole environment' },
  { value: 'PROVIDER', label: 'One provider connection' },
  { value: 'MODEL', label: 'One model' },
  { value: 'CAPABILITY', label: 'One capability' },
];

export function BudgetForm({
  existing,
  scopeOptions,
}: {
  existing?: {
    id: string;
    key: string;
    environment: string;
    scopeType: string;
    scopeId: string | null;
    perRequestLimitMicros: number | null;
    dailyLimitMicros: number | null;
    monthlyLimitMicros: number | null;
    currency: string;
    active: boolean;
  };
  scopeOptions: RouteOption[];
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  // Every policy renders a form, and a closed `<details>` still contributes its
  // controls to the document. Without a per-instance prefix the page would carry five
  // elements sharing one `budget-key` id, and each label would point at the first.
  const field = (name: string) => `budget-${existing?.id ?? 'new'}-${name}`;
  const pounds = (micros: number | null | undefined) =>
    micros === null || micros === undefined ? '' : String(micros / 1_000_000);

  const [key, setKey] = useState(existing?.key ?? '');
  const [environment, setEnvironment] = useState(existing?.environment ?? 'development');
  const [scopeType, setScopeType] = useState(existing?.scopeType ?? 'ENVIRONMENT');
  const [scopeId, setScopeId] = useState(existing?.scopeId ?? '');
  const [perRequest, setPerRequest] = useState(pounds(existing?.perRequestLimitMicros));
  const [daily, setDaily] = useState(pounds(existing?.dailyLimitMicros));
  const [monthly, setMonthly] = useState(pounds(existing?.monthlyLimitMicros));
  const [active, setActive] = useState(existing?.active ?? true);
  const busy = outcome.kind === 'working';

  const micros = (value: string) =>
    value.trim() === '' ? undefined : Math.round(Number(value) * 1_000_000);

  async function save() {
    setOutcome({ kind: 'working' });
    const data = await call('budgets', {
      key: key.trim(),
      environment,
      scopeType,
      ...(scopeType === 'ENVIRONMENT' || !scopeId ? {} : { scopeId }),
      ...(micros(perRequest) === undefined ? {} : { perRequestLimitMicros: micros(perRequest) }),
      ...(micros(daily) === undefined ? {} : { dailyLimitMicros: micros(daily) }),
      ...(micros(monthly) === undefined ? {} : { monthlyLimitMicros: micros(monthly) }),
      // GBP throughout. Costs are held in micros so sub-penny per-call amounts stay exact.
      currency: 'GBP',
      active,
    });
    const refusal = refusalFrom(data);
    if (refusal) {
      setOutcome(refusal);
      return;
    }
    setOutcome({
      kind: 'ok',
      message: `${key} saved with a daily limit of ${formatCurrencyFromMicros(micros(daily) ?? null)}.`,
    });
    router.refresh();
  }

  return (
    <div className="inline-form">
      <OutcomeNotice outcome={outcome} />
      <Fieldset legend={existing ? `Edit ${existing.key}` : 'New budget policy'}>
        <TextField
          id={field('key')}
          label="Key"
          hint="Stable identifier. Saving with an existing key for the same environment updates that policy."
          value={key}
          onChange={(event) => setKey(event.target.value)}
          readOnly={Boolean(existing)}
        />
        <SelectField
          id={field('environment')}
          label="Environment"
          options={ENVIRONMENTS}
          value={environment}
          onChange={(event) => setEnvironment(event.target.value)}
          disabled={Boolean(existing)}
        />
        <SelectField
          id={field('scope-type')}
          label="Scope"
          options={SCOPES}
          value={scopeType}
          onChange={(event) => setScopeType(event.target.value)}
        />
        {scopeType !== 'ENVIRONMENT' ? (
          <SelectField
            id={field('scope-id')}
            label="Applies to"
            placeholder="Select"
            options={scopeOptions}
            value={scopeId}
            onChange={(event) => setScopeId(event.target.value)}
          />
        ) : null}
      </Fieldset>

      <Fieldset legend="Limits in pounds">
        <TextField
          id={field('per-request')}
          label="Per request"
          type="number"
          min={0}
          step={0.0001}
          hint="Must sit at or below the daily limit — a single call that could exhaust the day is not a limit."
          value={perRequest}
          onChange={(event) => setPerRequest(event.target.value)}
        />
        <TextField
          id={field('daily')}
          label="Daily"
          type="number"
          min={0}
          step={0.01}
          value={daily}
          onChange={(event) => setDaily(event.target.value)}
        />
        <TextField
          id={field('monthly')}
          label="Monthly"
          type="number"
          min={0}
          step={0.01}
          value={monthly}
          onChange={(event) => setMonthly(event.target.value)}
        />
        <CheckboxField
          id={field('active')}
          label="Enforce this policy"
          hint="An inactive policy is recorded but does not stop spend."
          checked={active}
          onChange={(event) => setActive(event.target.checked)}
        />
      </Fieldset>

      <FormActions>
        <Button onClick={() => void save()} disabled={busy || key.trim().length < 3}>
          Save policy
        </Button>
      </FormActions>
    </div>
  );
}
