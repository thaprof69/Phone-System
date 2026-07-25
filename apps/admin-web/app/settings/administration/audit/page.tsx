import {
  DataTable,
  EmptyState,
  FilterBar,
  JsonInspector,
  Panel,
  SearchInput,
  SelectField,
  StatusPill,
  TechnicalDetails,
  formatChecksum,
  formatDateTime,
  formatNumber,
  formatRelativeTime,
  humaniseState,
  type Column,
  type Tone,
} from '@quantum-parks/ui';
import { SettingsPage } from '../../settings-page';
import { apiGet } from '../../../../lib/api';
import { matchesSearch, readParam, type SearchParams } from '../../../../lib/list-view';

export const dynamic = 'force-dynamic';

type AuditEvent = {
  sequence: number;
  eventId: string;
  occurredAt: string;
  actorType: string;
  actorId: string | null;
  action: string;
  aggregateType: string;
  aggregateId: string;
  purpose: string;
  classification: string;
  payload: Record<string, unknown>;
  previousHash: string | null;
  eventHash: string;
};

function classificationTone(classification: string): Tone {
  if (classification === 'RESTRICTED') return 'danger';
  if (classification === 'CONFIDENTIAL') return 'warning';
  return 'neutral';
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const response = await apiGet<{ items: AuditEvent[] }>('/audit?limit=200', {
    purpose: 'PRIVACY_AUDIT',
  });

  if (!response.ok) {
    return (
      <SettingsPage
        eyebrow="Administration"
        title="Audit"
        description="The record of who changed what, and why."
      >
        <Panel title="Audit unavailable">
          <EmptyState title="Audit could not be read" detail={response.reason} />
        </Panel>
      </SettingsPage>
    );
  }

  const all = response.data.items;
  const actorType = readParam(params, 'actor');
  const purpose = readParam(params, 'purpose');
  const search = readParam(params, 'q');

  const rows = all.filter((event) => {
    if (actorType && event.actorType !== actorType) return false;
    if (purpose && event.purpose !== purpose) return false;
    return matchesSearch(event, search, [
      (item) => item.action,
      (item) => item.aggregateType,
      (item) => item.aggregateId,
    ]);
  });

  const purposes = [...new Set(all.map((event) => event.purpose))].sort();

  // The log is hash-chained: each entry commits to the previous hash. A broken link
  // means the sequence was tampered with or a write was lost, so it is checked here
  // rather than assumed.
  const ordered = [...all].sort((left, right) => left.sequence - right.sequence);
  const brokenLinks = ordered.filter((event, index) => {
    if (index === 0) return false;
    return event.previousHash !== ordered[index - 1]?.eventHash;
  });

  const columns: Column<AuditEvent>[] = [
    {
      key: 'occurredAt',
      header: 'When',
      render: (event) => (
        <>
          {formatDateTime(event.occurredAt)}
          <small className="cell-sub">{formatRelativeTime(event.occurredAt)}</small>
        </>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (event) => (
        <>
          {humaniseState(event.action)}
          <small className="cell-sub">{humaniseState(event.aggregateType)}</small>
        </>
      ),
    },
    {
      key: 'actor',
      header: 'Actor',
      render: (event) => (
        <>
          {humaniseState(event.actorType)}
          {event.actorId ? <small className="cell-sub">{event.actorId.slice(0, 8)}</small> : null}
        </>
      ),
    },
    {
      key: 'purpose',
      header: 'Purpose',
      render: (event) => humaniseState(event.purpose),
    },
    {
      key: 'classification',
      header: 'Classification',
      render: (event) => (
        <StatusPill tone={classificationTone(event.classification)}>
          {humaniseState(event.classification)}
        </StatusPill>
      ),
      priority: 'secondary',
    },
    {
      key: 'sequence',
      header: 'Sequence',
      align: 'end',
      render: (event) => formatNumber(event.sequence),
      priority: 'secondary',
    },
  ];

  return (
    <SettingsPage
      eyebrow="Administration"
      title="Audit"
      description="An append-only, hash-chained record of every change. Entries cannot be edited or removed without breaking the chain."
      meta={
        <StatusPill tone={brokenLinks.length === 0 ? 'good' : 'danger'}>
          {brokenLinks.length === 0 ? 'Chain intact' : `${brokenLinks.length} broken links`}
        </StatusPill>
      }
    >
      <FilterBar
        action="/settings/administration/audit"
        resetHref="/settings/administration/audit"
        label="Filter audit events"
      >
        <SearchInput
          label="Search"
          placeholder="Action, object type or id"
          {...(search ? { defaultValue: search } : {})}
        />
        <SelectField
          id="actor"
          label="Actor type"
          placeholder="Any actor"
          options={['USER', 'SYSTEM', 'PROVIDER'].map((value) => ({
            value,
            label: humaniseState(value),
          }))}
          {...(actorType ? { defaultValue: actorType } : {})}
        />
        <SelectField
          id="purpose"
          label="Purpose"
          placeholder="Any purpose"
          options={purposes.map((value) => ({ value, label: humaniseState(value) }))}
          {...(purpose ? { defaultValue: purpose } : {})}
        />
      </FilterBar>

      <Panel
        title={`${formatNumber(rows.length)} events`}
        eyebrow="Most recent first"
        description="Every entry records the actor, the declared purpose and the classification of what was touched."
      >
        <DataTable
          caption="Audit events with their action, actor, purpose and classification"
          columns={columns}
          rows={rows.slice(0, 50)}
          getRowKey={(event) => event.eventId}
          empty={
            <EmptyState
              title={all.length === 0 ? 'No audit events' : 'No events match these filters'}
              detail={
                all.length === 0
                  ? 'Events are appended as changes are made.'
                  : 'Adjust or clear the filters to see more events.'
              }
            />
          }
        />
        {rows.length > 50 ? (
          <p className="evidence-note">
            Showing the 50 most recent of {formatNumber(rows.length)} matching events.
          </p>
        ) : null}
      </Panel>

      <TechnicalDetails summary="Chain verification">
        <dl className="technical-grid">
          <div>
            <dt>Entries checked</dt>
            <dd>{formatNumber(ordered.length)}</dd>
          </div>
          <div>
            <dt>Broken links</dt>
            <dd>{formatNumber(brokenLinks.length)}</dd>
          </div>
          <div>
            <dt>Latest hash</dt>
            <dd>{formatChecksum(ordered[ordered.length - 1]?.eventHash ?? null)}</dd>
          </div>
        </dl>
        {rows[0] ? <JsonInspector label="Most recent payload" value={rows[0].payload} /> : null}
      </TechnicalDetails>
    </SettingsPage>
  );
}
