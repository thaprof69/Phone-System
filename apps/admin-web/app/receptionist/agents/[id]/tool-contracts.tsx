'use client';

import { useState } from 'react';
import {
  Banner,
  Button,
  DataTable,
  DefinitionList,
  Drawer,
  EmptyState,
  Panel,
  StatusPill,
  TechnicalDetails,
  formatDateTime,
  formatLatency,
  formatNumber,
  humaniseState,
  type Column,
  type Tone,
} from '@quantum-parks/ui';

/**
 * Governed tool contracts.
 *
 * Tools are code-owned. There is no control here to define one, because a tool that
 * could be given an arbitrary URL or method would hand the voice runtime a route to an
 * unreviewed system. What this surface offers is inspection, enablement per agent, and
 * a contract test.
 */

export type ToolContractRow = {
  key: string;
  displayName: string;
  purpose: string;
  endpoint: string;
  method: string;
  inputFields: Array<{ name: string; type: string; required: boolean; description: string }>;
  outputFields: Array<{ name: string; type: string; description: string }>;
  authentication: string;
  verification: string;
  verificationRule: string;
  risk: string;
  writeLike: boolean;
  timeoutMs: number;
  fallbackWording: string;
  environments: string[];
  owner: string;
  registered: boolean;
  invocationCount: number;
  lastInvokedAt: string | null;
  lastResultStatus: string | null;
};

type TestResult = {
  toolKey: string;
  passed: boolean;
  observedStatus: string;
  latencyMs: number;
  assertion: string;
  safeMessage: string | null;
  testedAt: string;
};

function riskTone(risk: string): Tone {
  if (risk === 'HIGH') return 'danger';
  if (risk === 'MEDIUM') return 'warning';
  return 'neutral';
}

export function ToolContracts({
  contracts,
  undocumented,
  enabledKeys,
}: {
  contracts: ToolContractRow[];
  undocumented: string[];
  enabledKeys: string[];
}) {
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [inspected, setInspected] = useState<ToolContractRow | null>(null);

  async function runTest(key: string) {
    setTesting(key);
    setFailure(null);
    try {
      const response = await fetch(`/api/admin/tools/${key}/test`, { method: 'POST' });
      const body = (await response.json().catch(() => ({}))) as
        ({ status: 'TESTED' } & TestResult) | { status?: string; message?: string };
      if (response.ok && body.status === 'TESTED') {
        setResults((current) => ({ ...current, [key]: body as TestResult }));
        return;
      }
      setFailure(
        'message' in body && body.message ? body.message : 'The contract test could not be run.',
      );
    } catch {
      setFailure('The operations service is not reachable, so no test was run.');
    } finally {
      setTesting(null);
    }
  }

  const columns: Column<ToolContractRow>[] = [
    {
      key: 'name',
      header: 'Tool',
      render: (tool) => (
        <>
          {tool.displayName}
          <small className="cell-sub">{tool.purpose}</small>
        </>
      ),
    },
    {
      key: 'enabled',
      header: 'On this agent',
      render: (tool) =>
        enabledKeys.includes(tool.key) ? (
          <StatusPill tone="good">Enabled</StatusPill>
        ) : (
          <span className="muted-cell">Not enabled</span>
        ),
    },
    {
      key: 'risk',
      header: 'Risk',
      render: (tool) => (
        <StatusPill tone={riskTone(tool.risk)}>{humaniseState(tool.risk)}</StatusPill>
      ),
    },
    {
      key: 'verification',
      header: 'Verification',
      render: (tool) => humaniseState(tool.verification),
    },
    {
      key: 'effect',
      header: 'Effect',
      render: (tool) => (tool.writeLike ? 'Changes state' : 'Read only'),
      priority: 'secondary',
    },
    {
      key: 'test',
      header: 'Contract test',
      render: (tool) => {
        const result = results[tool.key];
        if (result) {
          return (
            <>
              <StatusPill tone={result.passed ? 'good' : 'danger'}>
                {result.passed ? 'Pass' : 'Fail'}
              </StatusPill>
              <small className="cell-sub">
                {result.observedStatus} · {formatLatency(result.latencyMs)}
              </small>
            </>
          );
        }
        return (
          <Button
            size="small"
            variant="ghost"
            type="button"
            disabled={testing !== null || !tool.registered}
            onClick={() => {
              void runTest(tool.key);
            }}
          >
            {testing === tool.key ? 'Testing…' : 'Run test'}
          </Button>
        );
      },
    },
    {
      key: 'inspect',
      header: 'Contract',
      render: (tool) => (
        <Button size="small" variant="ghost" type="button" onClick={() => setInspected(tool)}>
          Inspect
        </Button>
      ),
    },
  ];

  return (
    <>
      <Banner tone="info" title="Tools are code-owned">
        A tool is a typed handler registered in this platform, not a URL someone can enter. There is
        no control here to create one, because a tool that accepted an arbitrary endpoint would give
        the voice runtime a route to an unreviewed system.
      </Banner>

      {failure ? (
        <Banner tone="danger" title="The contract test did not run">
          {failure}
        </Banner>
      ) : null}

      {undocumented.length > 0 ? (
        <Banner
          tone="warning"
          title={`${undocumented.length} registered tools have no published contract`}
        >
          The runtime can call these but no contract describes them: {undocumented.join(', ')}.
        </Banner>
      ) : null}

      <Panel
        title={`${formatNumber(contracts.length)} governed tools`}
        eyebrow="Registered and contracted"
        description="A contract test asserts the behaviour that matters: a guarded tool must decline an unverified probe, and no tool may invent a result."
      >
        <DataTable
          caption="Tool contracts with their risk, verification requirement, effect and contract-test result"
          columns={columns}
          rows={contracts}
          getRowKey={(tool) => tool.key}
          empty={
            <EmptyState
              title="No tools registered"
              detail="Tools are registered in code and appear here automatically."
            />
          }
        />
      </Panel>

      <Drawer
        title={inspected?.displayName ?? 'Tool contract'}
        description={inspected?.purpose}
        open={inspected !== null}
        onOpenChange={(open) => {
          if (!open) setInspected(null);
        }}
      >
        {inspected ? (
          <>
            <DefinitionList
              columns={1}
              items={[
                {
                  term: 'Code-owned name',
                  value: <code className="inline-code">{inspected.key}</code>,
                },
                { term: 'Owner', value: inspected.owner },
                { term: 'Risk', value: humaniseState(inspected.risk) },
                {
                  term: 'Effect',
                  value: inspected.writeLike ? 'Changes state' : 'Read only',
                  hint: inspected.writeLike
                    ? 'Requires an idempotency key, so a retry cannot duplicate the effect.'
                    : 'Safe to retry.',
                },
                {
                  term: 'Verification',
                  value: humaniseState(inspected.verification),
                  hint: inspected.verificationRule,
                },
                { term: 'Authentication', value: inspected.authentication },
                { term: 'Timeout', value: formatLatency(inspected.timeoutMs) },
                {
                  term: 'Environments',
                  value: inspected.environments.map(humaniseState).join(', '),
                },
                {
                  term: 'If it fails',
                  value: inspected.fallbackWording,
                  hint: 'The receptionist says this rather than guessing an answer.',
                },
                {
                  term: 'Times called',
                  value: formatNumber(inspected.invocationCount),
                  hint: inspected.lastInvokedAt
                    ? `Last ${formatDateTime(inspected.lastInvokedAt)} · ${humaniseState(inspected.lastResultStatus)}`
                    : 'Never called on this platform.',
                },
              ]}
            />

            <h3 className="drawer-subheading">Input</h3>
            <ul className="schema-list">
              {inspected.inputFields.map((field) => (
                <li key={field.name}>
                  <code className="inline-code">{field.name}</code>
                  <span className="schema-type">{field.type}</span>
                  {field.required ? <StatusPill tone="warning">Required</StatusPill> : null}
                  <small>{field.description}</small>
                </li>
              ))}
            </ul>

            <h3 className="drawer-subheading">Output</h3>
            <ul className="schema-list">
              {inspected.outputFields.map((field) => (
                <li key={field.name}>
                  <code className="inline-code">{field.name}</code>
                  <span className="schema-type">{field.type}</span>
                  <small>{field.description}</small>
                </li>
              ))}
            </ul>

            <TechnicalDetails summary="Endpoint">
              <dl className="technical-grid">
                <div>
                  <dt>Method and path</dt>
                  <dd>
                    {inspected.method} {inspected.endpoint}
                  </dd>
                </div>
                <div>
                  <dt>Registered in this build</dt>
                  <dd>{String(inspected.registered)}</dd>
                </div>
              </dl>
            </TechnicalDetails>
          </>
        ) : null}
      </Drawer>
    </>
  );
}
