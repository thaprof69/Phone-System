import Link from 'next/link';
import {
  Banner,
  DataTable,
  EmptyState,
  ErrorState,
  MetricCard,
  MetricGrid,
  PageHeading,
  Panel,
  StatusPill,
  SyntheticBadge,
  TechnicalDetails,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatPercent,
  formatRelativeTime,
  humaniseState,
  toneForState,
  type Column,
  type Tone,
} from '@quantum-parks/ui';
import { AppShell } from './shell';
import { DomainNav } from './domain-nav';
import { apiGet } from '../lib/api';
import type { MissionControl, RecentCall } from '../lib/types';

export const dynamic = 'force-dynamic';

export default async function MissionControlPage() {
  const response = await apiGet<MissionControl>('/mission-control', { purpose: 'OPERATIONS' });

  if (!response.ok) {
    return (
      <AppShell>
        <PageHeading
          eyebrow="Mission Control"
          title={greeting()}
          description="Live state of the Quantum Parks receptionist."
        />
        <DomainNav />
        <ErrorState
          detail={`${response.reason}. Live state cannot be shown until the operations service responds.`}
        />
      </AppShell>
    );
  }

  const data = response.data;
  const { receptionist, runtime, today, attention, readiness } = data;
  const simulator = runtime.capabilityMode !== 'live';

  const columns: Column<RecentCall>[] = [
    {
      key: 'time',
      header: 'Time',
      render: (row) => (
        <>
          {formatDateTime(row.startedAt)}
          <small className="cell-sub">{formatRelativeTime(row.startedAt)}</small>
        </>
      ),
    },
    { key: 'park', header: 'Park', render: (row) => titleCase(row.park) },
    {
      key: 'language',
      header: 'Language',
      render: (row) => (row.language ?? '—').toUpperCase(),
      priority: 'secondary',
    },
    {
      key: 'intent',
      header: 'Reason',
      render: (row) => (row.intent ? humaniseState(row.intent) : 'Not classified'),
    },
    {
      key: 'outcome',
      header: 'Outcome',
      render: (row) =>
        row.outcome ? (
          <StatusPill tone={outcomeTone(row.outcome)}>{humaniseState(row.outcome)}</StatusPill>
        ) : (
          '—'
        ),
    },
    {
      key: 'duration',
      header: 'Duration',
      align: 'end',
      render: (row) => formatDuration(row.durationSeconds),
      priority: 'secondary',
    },
    {
      key: 'processing',
      header: 'Processing',
      render: (row) => (
        <StatusPill tone={toneForState(row.processingState)}>
          {humaniseState(row.processingState)}
        </StatusPill>
      ),
      priority: 'secondary',
    },
  ];

  return (
    <AppShell
      environmentLabel={`${titleCase(runtime.environment)} · ${simulator ? 'simulator' : 'live runtime'}`}
    >
      <PageHeading
        eyebrow="Mission Control"
        title={greeting()}
        description="What the receptionist is doing right now, and what needs a person."
        meta={
          <>
            <StatusPill tone={receptionist.activeVersion ? 'good' : 'danger'}>
              {receptionist.activeVersion ? 'Receptionist live' : 'No live version'}
            </StatusPill>
            {receptionist.synthetic ? <SyntheticBadge /> : null}
          </>
        }
        actions={
          <Link className="button secondary" href="/alerts">
            View all alerts
          </Link>
        }
      />

      <DomainNav badges={{ '/alerts': attention.length }} />

      {simulator ? (
        <Banner
          tone="info"
          title="This environment uses the deterministic simulator"
          action={
            <Link className="button ghost small" href="/administration/voice-runtime">
              Voice runtime
            </Link>
          }
        >
          Calls, voices and test results shown here are synthetic. No production traffic is routed.
        </Banner>
      ) : null}

      <Panel
        title={receptionist.name}
        eyebrow="Current release"
        action={
          <Link className="button secondary" href="/receptionist/agents">
            Open Agent Studio
          </Link>
        }
      >
        <div className="status-grid">
          <div>
            <p className="eyebrow">Live version</p>
            <strong>
              {receptionist.activeVersion
                ? `Version ${receptionist.activeVersion.version}`
                : 'None published'}
            </strong>
            <span>
              {receptionist.publishedAt
                ? `Published ${formatRelativeTime(receptionist.publishedAt)}`
                : 'Never published'}
            </span>
          </div>
          <div>
            <p className="eyebrow">Provider synchronisation</p>
            <StatusPill tone={toneForState(receptionist.syncState)}>
              {humaniseState(receptionist.syncState)}
            </StatusPill>
            <span>
              {receptionist.verifiedAt
                ? `Last checked ${formatRelativeTime(receptionist.verifiedAt)}`
                : 'Not yet verified against the provider'}
            </span>
          </div>
          <div>
            <p className="eyebrow">Languages</p>
            <strong>
              {receptionist.languages.length > 0
                ? receptionist.languages.map((code) => code.toUpperCase()).join(' · ')
                : 'None configured'}
            </strong>
            <span>{receptionist.voiceAssignments.length} voice assignments</span>
          </div>
          <div>
            <p className="eyebrow">Voice runtime</p>
            <StatusPill tone={toneForState(runtime.status)}>
              {humaniseState(runtime.status)}
            </StatusPill>
            <span>
              {runtime.productionRoutingEnabled
                ? 'Production routing enabled'
                : 'Production routing not enabled'}
            </span>
          </div>
          <div>
            <p className="eyebrow">In the pipeline</p>
            <strong>
              {receptionist.awaitingPublication
                ? `Version ${receptionist.awaitingPublication.version} passed tests`
                : receptionist.draftVersion
                  ? `Version ${receptionist.draftVersion.version} in draft`
                  : 'Nothing pending'}
            </strong>
            <span>
              {receptionist.awaitingPublication
                ? 'Awaiting publication approval'
                : receptionist.draftVersion
                  ? 'Not yet submitted for review'
                  : 'No unreleased work'}
            </span>
          </div>
        </div>

        {receptionist.voiceAssignments.length > 0 ? (
          <div className="voice-assignment-row">
            {receptionist.voiceAssignments.map((assignment) => (
              <span
                className={assignment.available ? 'voice-chip' : 'voice-chip unavailable'}
                key={`${assignment.language}-${assignment.fallback ? 'fallback' : 'primary'}`}
              >
                <strong>{assignment.language.toUpperCase()}</strong>
                {assignment.voiceName ?? 'Unassigned'}
                {assignment.fallback ? <em>fallback</em> : null}
                {assignment.available ? null : <em className="danger">unavailable</em>}
              </span>
            ))}
          </div>
        ) : null}
      </Panel>

      <h2 className="section-title">Today</h2>
      <MetricGrid>
        <MetricCard
          label="Calls received"
          value={formatNumber(today.callsReceived)}
          detail={`${formatNumber(today.callsCompleted)} fully processed`}
          href="/calls"
        />
        <MetricCard
          label="Answered by the receptionist"
          value={
            today.knowledgeAnswerRate === null
              ? 'No data yet'
              : formatPercent(today.knowledgeAnswerRate)
          }
          detail={
            today.knowledgeAnswerRate === null
              ? 'No call today carries an outcome'
              : 'Resolved without a transfer or callback'
          }
          tone={rateTone(today.knowledgeAnswerRate, 0.7, 0.5)}
        />
        <MetricCard
          label="Transferred"
          value={today.transferRate === null ? 'No data yet' : formatPercent(today.transferRate)}
          detail={`${formatNumber(today.transfers)} calls passed to a person`}
          href="/operations/handoffs"
        />
        <MetricCard
          label="Unresolved"
          value={formatNumber(today.unresolved)}
          detail="Knowledge gap, disconnect or technical failure"
          tone={today.unresolved > 0 ? 'warning' : 'good'}
          href="/calls"
        />
        <MetricCard
          label="Callbacks overdue"
          value={formatNumber(today.callbacksDue)}
          detail={`${formatNumber(today.callbacksOpen)} open in total`}
          tone={today.callbacksDue > 0 ? 'danger' : 'good'}
          href="/operations/callbacks?due=overdue"
        />
        <MetricCard
          label="Open staff tasks"
          value={formatNumber(today.openTasks)}
          detail="Raised from calls, awaiting completion"
          tone={today.openTasks > 0 ? 'warning' : 'good'}
          href="/operations/tasks"
        />
        <MetricCard
          label="Failed processing"
          value={formatNumber(today.failedProcessing)}
          detail={`${formatNumber(today.partialProcessing)} only partly processed`}
          tone={today.failedProcessing > 0 ? 'danger' : 'good'}
          href="/calls/failed"
        />
        <MetricCard
          label="Tests"
          value={humaniseState(today.testStatus)}
          detail={
            today.testFailures > 0
              ? `${formatNumber(today.testFailures)} failing checks`
              : 'No failing checks on the last completed run'
          }
          tone={today.testFailures > 0 ? 'danger' : toneForState(today.testStatus)}
          href="/quality/runs"
        />
      </MetricGrid>

      <div className="mission-columns">
        <Panel
          title="Needs attention"
          eyebrow={`${attention.length} open items`}
          description="Ordered by severity. Each item links to where it can be resolved."
        >
          {attention.length === 0 ? (
            <EmptyState
              title="Nothing needs attention"
              detail="No drift, failed publication, overdue work or failing test is currently outstanding."
            />
          ) : (
            <ul className="attention-list">
              {attention.map((item) => (
                <li key={item.id} className={`attention-item severity-${item.severity}`}>
                  <Link href={item.href}>
                    <span className="attention-count">{formatNumber(item.count)}</span>
                    <span className="attention-body">
                      <strong>{item.title}</strong>
                      <span>{item.detail}</span>
                    </span>
                    <span className="attention-severity">{item.severity}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="mission-rail">
          <Panel
            title="Readiness"
            eyebrow="Can this carry production traffic?"
            action={
              <Link className="button ghost small" href="/administration/readiness">
                Details
              </Link>
            }
          >
            <div className="readiness-summary">
              <StatusPill tone={toneForState(readiness.state)}>
                {humaniseState(readiness.state)}
              </StatusPill>
              <p>
                {readiness.allowed
                  ? 'All server-enforced gates currently pass.'
                  : `${readiness.blockers.length} ${
                      readiness.blockers.length === 1 ? 'blocker is' : 'blockers are'
                    } preventing production routing.`}
              </p>
            </div>
            <dl className="readiness-domains">
              {Object.entries(readiness.domains).map(([domain, state]) => (
                <div key={domain}>
                  <dt>{READINESS_DOMAIN_LABELS[domain] ?? humaniseState(domain)}</dt>
                  <dd>
                    <StatusPill tone={toneForState(state)}>{humaniseState(state)}</StatusPill>
                  </dd>
                </div>
              ))}
            </dl>
            {readiness.blockers.length > 0 ? (
              <>
                <p className="readiness-blockers-title">Top blockers</p>
                <ul className="readiness-blockers">
                  {readiness.blockers.slice(0, 3).map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
                {readiness.blockers.length > 3 ? (
                  <Link className="more-link" href="/administration/readiness">
                    {readiness.blockers.length - 3} more
                  </Link>
                ) : null}
              </>
            ) : null}
          </Panel>

          {data.insight ? (
            <Panel
              title="What callers are asking"
              eyebrow={`Last 7 days · ${formatNumber(data.insight.evidenceCalls)} classified calls`}
            >
              <ol className="intent-list">
                {data.insight.topIntents.map((entry) => (
                  <li key={entry.intent}>
                    <span>{humaniseState(entry.intent)}</span>
                    <strong>{formatNumber(entry.count)}</strong>
                  </li>
                ))}
              </ol>
              {data.insight.knowledgeGap ? (
                <div className="insight-gap">
                  <p className="eyebrow">Most asked question with no approved answer</p>
                  <strong>{data.insight.knowledgeGap.title}</strong>
                  <span>
                    Asked {formatNumber(data.insight.knowledgeGap.frequency)} times ·{' '}
                    {data.insight.knowledgeGap.language.toUpperCase()}
                  </span>
                  <Link className="more-link" href="/knowledge/gaps">
                    Review knowledge gaps
                  </Link>
                </div>
              ) : null}
            </Panel>
          ) : null}
        </div>
      </div>

      <Panel
        title="Recent calls"
        eyebrow="Most recent first"
        action={
          <Link className="button ghost small" href="/calls">
            All calls
          </Link>
        }
      >
        <DataTable
          caption="The twelve most recent calls with their reason, outcome and processing state"
          columns={columns}
          rows={data.recentCalls}
          getRowKey={(row) => row.id}
          rowHref={(row) => `/calls/${row.id}`}
          empty={
            <EmptyState
              title="No calls recorded yet"
              detail="Calls appear here once the voice runtime delivers a post-call webhook."
            />
          }
        />
      </Panel>

      <TechnicalDetails>
        <dl className="technical-grid">
          <div>
            <dt>Generated at</dt>
            <dd>{data.generatedAt}</dd>
          </div>
          <div>
            <dt>Environment</dt>
            <dd>{runtime.environment}</dd>
          </div>
          <div>
            <dt>Provider capability mode</dt>
            <dd>{runtime.capabilityMode}</dd>
          </div>
          <div>
            <dt>Active agent version id</dt>
            <dd>{receptionist.activeVersion?.id ?? '—'}</dd>
          </div>
          <div>
            <dt>Readiness state</dt>
            <dd>{readiness.state}</dd>
          </div>
        </dl>
      </TechnicalDetails>
    </AppShell>
  );
}

/**
 * Operator-facing names for the four readiness domains. "AIOS" is an internal
 * architecture name and belongs in technical detail, not on the homepage.
 */
const READINESS_DOMAIN_LABELS: Record<string, string> = {
  voiceRuntime: 'Voice runtime',
  aios: 'AI infrastructure',
  platform: 'Platform',
  productionRouting: 'Production routing',
};

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function titleCase(value: string | null): string {
  if (!value) return '—';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function rateTone(value: number | null, good: number, warning: number): Tone {
  // No evidence is not a bad score: an absent rate stays neutral rather than red.
  if (value === null) return 'neutral';
  if (value >= good) return 'good';
  if (value >= warning) return 'warning';
  return 'danger';
}

function outcomeTone(outcome: string): Tone {
  if (outcome === 'RESOLVED_BY_AGENT' || outcome === 'TRANSFER_COMPLETED') return 'good';
  if (outcome === 'TECHNICAL_FAILURE' || outcome === 'TRANSFER_FAILED_CALLBACK_CREATED')
    return 'danger';
  if (outcome === 'UNRESOLVED_KNOWLEDGE_GAP' || outcome === 'CUSTOMER_DISCONNECTED')
    return 'warning';
  return 'info';
}
