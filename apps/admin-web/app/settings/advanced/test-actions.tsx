'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Banner,
  Button,
  CheckboxField,
  FormActions,
  SelectField,
  TextArea,
  TextField,
  humaniseState,
} from '@quantum-parks/ui';

/**
 * Mutating controls for Test Studio.
 *
 * Every control reports exactly what the platform returned. Starting a run or creating
 * a case never advances its own display to a state the server did not grant — release
 * gates are enforced server-side, and this interface cannot bypass them.
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
  const response = await fetch(`/api/admin/tests/${path}`, {
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
  if (status === 'NOT_FOUND') {
    return { kind: 'refused', message: String(data.message ?? 'That record does not exist.') };
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

const RISK_LEVELS = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
];

const DEFINITION_TEMPLATE = JSON.stringify(
  {
    scenario: 'Describe what the caller says and what the receptionist must do',
    language: 'en',
    expectedFacts: ['State the fact the answer must contain'],
    prohibitedClaims: ['booking changed', 'payment received', 'refund issued'],
    passCriteria: { minimumPassRate: 0.8 },
  },
  null,
  2,
);

export function CreateTestCaseForm() {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const [name, setName] = useState('');
  const [testType, setTestType] = useState('SAFETY');
  const [riskLevel, setRiskLevel] = useState('MEDIUM');
  const [definition, setDefinition] = useState(DEFINITION_TEMPLATE);
  const busy = outcome.kind === 'working';

  async function create() {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(definition) as Record<string, unknown>;
    } catch {
      setOutcome({ kind: 'refused', message: 'The definition is not valid JSON.' });
      return;
    }
    setOutcome({ kind: 'working' });
    const data = await call('cases', { name, testType, riskLevel, definition: parsed });
    const refusal = refusalFrom(data);
    if (refusal) {
      setOutcome(refusal);
      return;
    }
    setOutcome({ kind: 'ok', message: `"${name}" created as version 1.` });
    setName('');
    router.refresh();
  }

  return (
    <div className="inline-form">
      <OutcomeNotice outcome={outcome} />
      <TextField
        id="test-case-name"
        label="Name"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <SelectField
        id="test-case-type"
        label="Suite"
        options={[
          { value: 'SAFETY', label: 'Safety' },
          { value: 'KNOWLEDGE', label: 'Knowledge grounding' },
          { value: 'ROUTING', label: 'Routing and transfers' },
          { value: 'TOOL', label: 'Tool contracts' },
          { value: 'LANGUAGE', label: 'Language' },
          { value: 'BEHAVIOUR', label: 'Conversation behaviour' },
          { value: 'REGRESSION', label: 'Regression' },
        ]}
        value={testType}
        onChange={(event) => setTestType(event.target.value)}
      />
      <SelectField
        id="test-case-risk"
        label="Risk"
        options={RISK_LEVELS}
        value={riskLevel}
        onChange={(event) => setRiskLevel(event.target.value)}
        hint="High and critical risk cases must pass every attempt to clear a release gate."
      />
      <TextArea
        id="test-case-definition"
        label="Definition (JSON)"
        rows={10}
        hint="The scenario, expected facts, prohibited claims and pass criteria the run is evaluated against."
        value={definition}
        onChange={(event) => setDefinition(event.target.value)}
      />
      <FormActions>
        <Button onClick={() => void create()} disabled={busy || name.trim().length < 3}>
          Create test case
        </Button>
      </FormActions>
    </div>
  );
}

export function RunTestsForm({
  agentVersions,
  testCases,
}: {
  agentVersions: Array<{ value: string; label: string }>;
  testCases: Array<{ id: string; versionId: string; name: string; riskLevel: string }>;
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const [agentVersionId, setAgentVersionId] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [repeatCount, setRepeatCount] = useState('1');
  const busy = outcome.kind === 'working';

  function toggle(versionId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(versionId)) next.delete(versionId);
      else next.add(versionId);
      return next;
    });
  }

  async function run() {
    if (!agentVersionId) {
      setOutcome({ kind: 'refused', message: 'Select an agent version to run against.' });
      return;
    }
    if (selected.size === 0) {
      setOutcome({ kind: 'refused', message: 'Select at least one test case.' });
      return;
    }
    setOutcome({ kind: 'working' });
    const data = await call('runs', {
      agentVersionId,
      testVersionIds: [...selected],
      repeatCount: Number(repeatCount),
    });
    const refusal = refusalFrom(data);
    if (refusal) {
      setOutcome(refusal);
      return;
    }
    setOutcome({
      kind: 'ok',
      message: `Run started against ${selected.size} case${selected.size === 1 ? '' : 's'}, repeated ${repeatCount} time${repeatCount === '1' ? '' : 's'} each.`,
    });
    router.refresh();
  }

  return (
    <div className="inline-form">
      <OutcomeNotice outcome={outcome} />
      <SelectField
        id="run-agent-version"
        label="Agent version"
        placeholder="Select an agent version"
        options={agentVersions}
        value={agentVersionId}
        onChange={(event) => setAgentVersionId(event.target.value)}
        hint="Only a release in Testing or Test failed can accept a new run."
      />
      <TextField
        id="run-repeat-count"
        label="Repeat count"
        type="number"
        min={1}
        max={50}
        value={repeatCount}
        onChange={(event) => setRepeatCount(event.target.value)}
        hint="A non-deterministic system needs repetition to mean anything; a single pass proves nothing."
      />
      <fieldset className="form-fieldset">
        <legend>Test cases</legend>
        <div className="test-case-checklist">
          {testCases.map((test) => (
            <CheckboxField
              key={test.versionId}
              id={`run-case-${test.versionId}`}
              label={`${test.name} (${humaniseState(test.riskLevel)})`}
              checked={selected.has(test.versionId)}
              onChange={() => toggle(test.versionId)}
            />
          ))}
        </div>
      </fieldset>
      <FormActions>
        <Button onClick={() => void run()} disabled={busy}>
          Run tests
        </Button>
      </FormActions>
    </div>
  );
}

export function SyncRunButton({ runId }: { runId: string }) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const busy = outcome.kind === 'working';

  async function sync() {
    setOutcome({ kind: 'working' });
    const data = await call(`runs/${runId}/sync`);
    const refusal = refusalFrom(data);
    if (refusal) {
      setOutcome(refusal);
      return;
    }
    setOutcome({ kind: 'ok', message: 'Synced with the provider’s latest result.' });
    router.refresh();
  }

  return (
    <div className="inline-form">
      <OutcomeNotice outcome={outcome} />
      <Button variant="secondary" onClick={() => void sync()} disabled={busy}>
        Sync with provider
      </Button>
    </div>
  );
}
