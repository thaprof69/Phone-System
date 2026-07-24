import {
  DataTable,
  EmptyState,
  Panel,
  StatusPill,
  formatNumber,
  humaniseState,
  type Column,
  type Tone,
} from '@quantum-parks/ui';
import { DomainPage, LoadFailure } from '../../domain-page';
import { apiGet } from '../../../lib/api';
import type { TestRow, TestRunRow } from '../../../lib/types';

export const dynamic = 'force-dynamic';

type Suite = {
  key: string;
  label: string;
  description: string;
  mandatory: boolean;
  cases: TestRow[];
  highRisk: number;
};

/**
 * Suites are the grouping a release gate evaluates. They are derived from the test
 * type recorded on each case rather than stored separately, so a new case joins its
 * suite automatically instead of silently sitting outside every gate.
 */
const SUITE_DEFINITIONS: Array<{
  key: string;
  label: string;
  description: string;
  mandatory: boolean;
}> = [
  {
    key: 'SAFETY',
    label: 'Safety',
    description:
      'Disclosure, payment refusal, refusal to claim a completed action, and sensitive-interaction handling.',
    mandatory: true,
  },
  {
    key: 'KNOWLEDGE',
    label: 'Knowledge grounding',
    description: 'Answers come from approved knowledge, and unknown figures are declined.',
    mandatory: true,
  },
  {
    key: 'ROUTING',
    label: 'Routing and transfers',
    description: 'Calls reach the right queue, and a failed transfer creates a callback.',
    mandatory: true,
  },
  {
    key: 'TOOL',
    label: 'Tool contracts',
    description: 'Permitted tools are invoked correctly and prohibited tools are never called.',
    mandatory: true,
  },
  {
    key: 'LANGUAGE',
    label: 'Language',
    description:
      'The receptionist answers in the caller’s language and does not switch unprompted.',
    mandatory: false,
  },
  {
    key: 'BEHAVIOUR',
    label: 'Conversation behaviour',
    description: 'After-hours handling, interruptions, silence and the approved closing wording.',
    mandatory: false,
  },
  {
    key: 'REGRESSION',
    label: 'Regression',
    description: 'Previously corrected answers that must not regress.',
    mandatory: false,
  },
];

function riskTone(count: number): Tone {
  return count > 0 ? 'danger' : 'neutral';
}

export default async function TestSuitesPage() {
  const response = await apiGet<{ tests: TestRow[]; runs: TestRunRow[] }>('/test-suites', {
    purpose: 'RELEASE_MANAGEMENT',
  });

  if (!response.ok) {
    return (
      <DomainPage
        eyebrow="Quality"
        title="Test suites"
        description="Grouped tests, including the suites mandatory for release."
      >
        <LoadFailure subject="Test suites" reason={response.reason} />
      </DomainPage>
    );
  }

  const tests = response.data.tests;
  const suites: Suite[] = SUITE_DEFINITIONS.map((definition) => {
    const cases = tests.filter((test) => test.testType === definition.key);
    return {
      ...definition,
      cases,
      highRisk: cases.filter((test) => test.riskLevel === 'HIGH').length,
    };
  }).filter((suite) => suite.cases.length > 0);

  const uncategorised = tests.filter(
    (test) => !SUITE_DEFINITIONS.some((definition) => definition.key === test.testType),
  );

  const columns: Column<Suite>[] = [
    {
      key: 'label',
      header: 'Suite',
      render: (suite) => (
        <>
          {suite.label}
          <small className="cell-sub">{suite.description}</small>
        </>
      ),
    },
    {
      key: 'mandatory',
      header: 'Release gate',
      render: (suite) =>
        suite.mandatory ? (
          <StatusPill tone="danger">Mandatory</StatusPill>
        ) : (
          <StatusPill tone="neutral">Advisory</StatusPill>
        ),
    },
    {
      key: 'cases',
      header: 'Cases',
      align: 'end',
      render: (suite) => formatNumber(suite.cases.length),
    },
    {
      key: 'highRisk',
      header: 'High risk',
      align: 'end',
      render: (suite) => (
        <StatusPill tone={riskTone(suite.highRisk)}>{formatNumber(suite.highRisk)}</StatusPill>
      ),
    },
  ];

  return (
    <DomainPage
      eyebrow="Quality"
      title="Test suites"
      description="Test cases grouped into the suites a release gate evaluates. Mandatory suites must pass before publication."
      meta={
        <StatusPill tone="neutral">
          {formatNumber(suites.filter((suite) => suite.mandatory).length)} mandatory suites
        </StatusPill>
      }
    >
      <Panel
        title="Suites"
        eyebrow="Derived from test type"
        description="A case joins its suite by its recorded type, so no case sits outside every gate by accident."
      >
        <DataTable
          caption="Test suites with whether they gate a release, how many cases they hold and how many are high risk"
          columns={columns}
          rows={suites}
          getRowKey={(suite) => suite.key}
          rowHref={(suite) => `/quality/test-cases?type=${suite.key}`}
          empty={
            <EmptyState title="No suites" detail="Suites appear once test cases are defined." />
          }
        />
      </Panel>

      {uncategorised.length > 0 ? (
        <Panel
          title="Cases outside a known suite"
          eyebrow={`${formatNumber(uncategorised.length)} cases`}
          description="These carry a test type this platform does not map to a suite, so no gate evaluates them."
        >
          <ul className="plain-list">
            {uncategorised.map((test) => (
              <li key={test.id}>
                {test.name} <code className="inline-code">{test.testType}</code>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </DomainPage>
  );
}
