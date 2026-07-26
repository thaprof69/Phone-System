import {
  DataTable,
  EmptyState,
  FilterBar,
  Panel,
  SearchInput,
  SelectField,
  StatusPill,
  formatDate,
  formatNumber,
  humaniseState,
  type Column,
  type Tone,
} from '@quantum-parks/ui';
import { SettingsPage as DomainPage, LoadFailure } from '../../settings-page';
import { apiGet } from '../../../../lib/api';
import { matchesSearch, readParam, type SearchParams } from '../../../../lib/list-view';
import type { TestRow, TestRunRow } from '../../../../lib/types';
import { CreateTestCaseForm } from '../test-actions';

export const dynamic = 'force-dynamic';

function riskTone(risk: string): Tone {
  if (risk === 'HIGH') return 'danger';
  if (risk === 'MEDIUM') return 'warning';
  return 'neutral';
}

export default async function TestCasesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const response = await apiGet<{ tests: TestRow[]; runs: TestRunRow[] }>('/test-suites', {
    purpose: 'RELEASE_MANAGEMENT',
  });

  if (!response.ok) {
    return (
      <DomainPage
        eyebrow="Advanced"
        title="Scenarios"
        description="What each test asserts, at what risk level, in which language."
      >
        <LoadFailure subject="Test cases" reason={response.reason} />
      </DomainPage>
    );
  }

  const all = response.data.tests;
  const type = readParam(params, 'type');
  const risk = readParam(params, 'risk');
  const search = readParam(params, 'q');

  const rows = all.filter((test) => {
    if (type && test.testType !== type) return false;
    if (risk && test.riskLevel !== risk) return false;
    return matchesSearch(test, search, [(item) => item.name, (item) => item.testType]);
  });

  const types = [...new Set(all.map((test) => test.testType))].sort();
  const mandatory = all.filter((test) => test.riskLevel === 'HIGH');

  const columns: Column<TestRow>[] = [
    {
      key: 'name',
      header: 'Test case',
      render: (test) => (
        <>
          {test.name}
          <small className="cell-sub">{humaniseState(test.testType)}</small>
        </>
      ),
    },
    {
      key: 'risk',
      header: 'Risk',
      render: (test) => (
        <StatusPill tone={riskTone(test.riskLevel)}>{humaniseState(test.riskLevel)}</StatusPill>
      ),
    },
    {
      key: 'mandatory',
      header: 'Release requirement',
      render: (test) =>
        test.riskLevel === 'HIGH'
          ? 'Must pass every attempt'
          : test.riskLevel === 'MEDIUM'
            ? 'Must reach the pass threshold'
            : 'Advisory',
    },
    {
      key: 'created',
      header: 'Added',
      render: (test) => formatDate(test.createdAt),
      priority: 'secondary',
    },
  ];

  return (
    <DomainPage
      eyebrow="Advanced"
      title="Scenarios"
      description="What the receptionist is checked against before a release can reach callers."
      meta={
        <>
          <StatusPill tone="neutral">{formatNumber(all.length)} cases</StatusPill>
          <StatusPill tone="danger">{formatNumber(mandatory.length)} mandatory</StatusPill>
        </>
      }
    >
      <FilterBar
        action="/settings/advanced/scenarios"
        resetHref="/settings/advanced/scenarios"
        label="Filter test cases"
      >
        <SearchInput
          label="Search"
          placeholder="Test name"
          {...(search ? { defaultValue: search } : {})}
        />
        <SelectField
          id="type"
          label="Type"
          placeholder="All types"
          options={types.map((value) => ({ value, label: humaniseState(value) }))}
          {...(type ? { defaultValue: type } : {})}
        />
        <SelectField
          id="risk"
          label="Risk"
          placeholder="Any risk"
          options={['LOW', 'MEDIUM', 'HIGH'].map((value) => ({
            value,
            label: humaniseState(value),
          }))}
          {...(risk ? { defaultValue: risk } : {})}
        />
      </FilterBar>

      <Panel
        title="Create a test case"
        description="Saved as version 1. A future edit would create a new version rather than changing this one, so a run always points at the exact definition it was evaluated against."
      >
        <CreateTestCaseForm />
      </Panel>

      <Panel
        title={`${formatNumber(rows.length)} ${rows.length === 1 ? 'case' : 'cases'}`}
        eyebrow="High-risk cases must pass every attempt"
      >
        <DataTable
          caption="Test cases with their type, risk level and release requirement"
          columns={columns}
          rows={rows}
          getRowKey={(test) => test.id}
          empty={
            <EmptyState
              title={all.length === 0 ? 'No test cases defined' : 'No cases match these filters'}
              detail={
                all.length === 0
                  ? 'A release cannot be published without passing its mandatory suites.'
                  : 'Adjust or clear the filters to see more cases.'
              }
            />
          }
        />
      </Panel>
    </DomainPage>
  );
}
