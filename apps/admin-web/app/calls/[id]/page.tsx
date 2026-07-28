import Link from 'next/link';
import {
  Banner,
  Breadcrumbs,
  EmptyState,
  ErrorState,
  PageHeading,
  Panel,
  StatusPill,
  SyntheticBadge,
  formatDateTime,
  formatDuration,
  formatPercent,
  formatRelativeTime,
  humaniseState,
  toneForState,
} from '@quantum-parks/ui';
import { AppShell } from '../../shell';
import { apiGet } from '../../../lib/api';

export const dynamic = 'force-dynamic';

type Claim = { text: string; evidence_ids: string[] };

type CallDetail = {
  id: string;
  callStatus: 'COMPLETED' | 'FAILED';
  origin: 'LIVE' | 'SIMULATION' | 'SYNTHETIC';
  processingState: string;
  startedAt: string | null;
  endedAt: string | null;
  receivedAt: string;
  language: string | null;
  park: string | null;
  sensitive: boolean;
  synthetic: boolean;
  providerMetadata: Record<string, unknown> | null;
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | null;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  transcriptRevision: {
    id: string;
    revision: number;
    revisionType: string;
  } | null;
  transcriptTurns: Array<{
    id: string;
    sequence: number;
    speaker: string;
    content: string;
    startedAtMs: number | null;
  }>;
  summaries: Array<{
    id: string;
    summary: Record<string, unknown>;
    evidenceCoverage: string;
    createdAt: string;
  }>;
  classifications: Array<{
    id: string;
    primaryIntent: string;
    secondaryIntents: string[];
    confidence: string;
  }>;
  followUp: {
    caseStatus: 'OPEN' | 'CLOSED';
    sla: {
      status: 'BREACHED' | 'ON_TRACK' | 'NOT_SET' | 'MET' | 'NOT_REQUIRED';
      dueAt: string | null;
    };
    callback: {
      status: string;
      reason: string;
      dueAt: string | null;
      completedAt: string | null;
      returned: boolean;
    } | null;
    assignedOperator: { id: string; name: string } | null;
  };
};

export default async function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const response = await apiGet<CallDetail>(`/calls/${encodeURIComponent(id)}`, {
    purpose: 'QUALITY_REVIEW',
  });

  if (!response.ok) {
    return (
      <AppShell>
        <Breadcrumbs trail={[{ label: 'Calls', href: '/calls' }, { label: 'Call' }]} />
        <PageHeading eyebrow="Call" title="Call record" />
        <ErrorState detail={response.reason} />
      </AppShell>
    );
  }

  const call = response.data;
  const summary = call.summaries[0];
  const classification = call.classifications[0];
  const summaryBody = summary?.summary as
    | {
        purpose?: Claim;
        caller_requests?: Claim[];
        information_provided?: Claim[];
        unresolved_items?: Claim[];
        unconfirmed_requests?: Claim[];
      }
    | undefined;
  const durationSeconds = callDurationSeconds(call);
  const callbackLabel = call.followUp.callback
    ? humaniseState(call.followUp.callback.status)
    : 'Not requested';
  const ownerLabel = call.followUp.assignedOperator?.name ?? 'Unassigned';
  const reasonLabel = classification
    ? humaniseState(classification.primaryIntent)
    : 'Not classified';
  const nextAction = deriveNextAction(call, summaryBody);

  return (
    <AppShell>
      <Breadcrumbs trail={[{ label: 'Calls', href: '/calls' }, { label: reasonLabel }]} />
      <PageHeading
        eyebrow="Call record"
        title={summaryBody?.purpose?.text ?? reasonLabel}
        description={`${formatDateTime(call.receivedAt)} · ${titleCase(call.park)} · ${(call.language ?? '—').toUpperCase()} · ${formatDuration(durationSeconds)}`}
        meta={
          <>
            <StatusPill tone={toneForState(call.callStatus)}>
              {humaniseState(call.callStatus)}
            </StatusPill>
            <StatusPill tone={toneForState(call.followUp.caseStatus)}>
              {humaniseState(call.followUp.caseStatus)}
            </StatusPill>
            {call.origin === 'SYNTHETIC' ? (
              <SyntheticBadge />
            ) : (
              <StatusPill tone={call.origin === 'SIMULATION' ? 'info' : 'neutral'}>
                {humaniseState(call.origin)}
              </StatusPill>
            )}
          </>
        }
        actions={
          <Link className="button secondary" href="/calls">
            Back to calls
          </Link>
        }
      />

      {call.callStatus === 'FAILED' ? (
        <Banner tone="danger" title="This call record is incomplete">
          The transcript remains authoritative, but summary or classification information may be
          missing.
        </Banner>
      ) : null}

      <dl className="operator-call-strip" aria-label="Call at a glance">
        <CallFact label="Reason" value={reasonLabel} />
        <CallFact
          label="Sentiment"
          value={call.sentiment ? humaniseState(call.sentiment) : 'Not available'}
          tone={
            call.sentiment === 'NEGATIVE'
              ? 'danger'
              : call.sentiment === 'POSITIVE'
                ? 'good'
                : undefined
          }
        />
        <CallFact
          label="Urgency"
          value={call.urgency ? humaniseState(call.urgency) : 'Not available'}
          tone={call.urgency === 'HIGH' ? 'danger' : undefined}
        />
        <CallFact
          label="SLA"
          value={slaLabel(call.followUp.sla.status)}
          tone={slaTone(call.followUp.sla.status)}
        />
        <CallFact label="Callback" value={callbackLabel} />
        <CallFact label="Owner" value={ownerLabel} />
      </dl>

      <div className="operator-call-layout">
        <section className="operator-call-summary">
          <Panel title="Call summary" eyebrow="What the operator needs to know">
            {summaryBody ? (
              <div className="summary-body">
                <p className="summary-purpose">{summaryBody.purpose?.text}</p>
                <SummaryList
                  title="Caller needs"
                  items={summaryBody.caller_requests?.map((claim) => claim.text)}
                />
                <SummaryList
                  title="Information provided"
                  items={summaryBody.information_provided?.map((claim) => claim.text)}
                />
                <SummaryList
                  title="Still unresolved"
                  items={[
                    ...(summaryBody.unresolved_items ?? []),
                    ...(summaryBody.unconfirmed_requests ?? []),
                  ].map((claim) => claim.text)}
                />
              </div>
            ) : (
              <EmptyState
                title="No summary available"
                detail="Use the transcript below to review what was said."
              />
            )}
          </Panel>
        </section>

        <section className="operator-call-transcript">
          <Panel
            title="Call transcript"
            eyebrow={
              call.transcriptRevision
                ? `${humaniseState(call.transcriptRevision.revisionType)} transcript`
                : 'No transcript'
            }
          >
            {call.transcriptTurns.length === 0 ? (
              <EmptyState
                title="No transcript available"
                detail="A transcript appears after the call has been received and normalised."
              />
            ) : (
              <ol className="transcript">
                {call.transcriptTurns.map((turn) => {
                  const receptionist = turn.speaker.toUpperCase() === 'AGENT';
                  return (
                    <li key={turn.id} className={`turn turn-${turn.speaker.toLowerCase()}`}>
                      <div className="turn-meta">
                        <strong>{receptionist ? 'Receptionist' : 'Caller'}</strong>
                        {turn.startedAtMs !== null ? (
                          <span>{formatDuration(Math.round(turn.startedAtMs / 1000))}</span>
                        ) : null}
                      </div>
                      <p>{turn.content}</p>
                    </li>
                  );
                })}
              </ol>
            )}
          </Panel>
        </section>

        <aside className="operator-call-follow-up" aria-label="Follow-up">
          <Panel title="Follow-up" eyebrow="Ownership and customer commitment">
            <div
              className={`operator-next-action ${
                call.followUp.sla.status === 'BREACHED' ? 'is-urgent' : ''
              }`}
            >
              <span>Next action</span>
              <strong>{nextAction}</strong>
            </div>

            <dl className="operator-follow-up-list">
              <FollowUpFact
                term="Case"
                value={humaniseState(call.followUp.caseStatus)}
                tone={toneForState(call.followUp.caseStatus)}
              />
              <FollowUpFact
                term="SLA status"
                value={slaLabel(call.followUp.sla.status)}
                detail={
                  call.followUp.sla.dueAt
                    ? `Due ${formatDateTime(call.followUp.sla.dueAt)} (${formatRelativeTime(call.followUp.sla.dueAt)})`
                    : undefined
                }
                tone={slaTone(call.followUp.sla.status)}
              />
              <FollowUpFact
                term="Callback"
                value={callbackLabel}
                detail={call.followUp.callback?.reason}
                tone={
                  call.followUp.callback ? toneForState(call.followUp.callback.status) : 'neutral'
                }
              />
              <FollowUpFact
                term="Assigned operator"
                value={ownerLabel}
                tone={call.followUp.assignedOperator ? 'info' : 'neutral'}
              />
              <FollowUpFact
                term="Call returned"
                value={
                  !call.followUp.callback
                    ? 'Not required'
                    : call.followUp.callback.returned
                      ? 'Yes'
                      : 'Not yet'
                }
                detail={
                  call.followUp.callback?.completedAt
                    ? `Completed ${formatDateTime(call.followUp.callback.completedAt)}`
                    : undefined
                }
                tone={
                  call.followUp.callback?.returned
                    ? 'good'
                    : call.followUp.callback
                      ? 'warning'
                      : 'neutral'
                }
              />
            </dl>

            {call.followUp.caseStatus === 'OPEN' ? (
              <Link
                className="button secondary small"
                href={call.followUp.callback ? '/calls/callbacks' : '/calls/tasks'}
              >
                Manage follow-up
              </Link>
            ) : null}
          </Panel>
        </aside>
      </div>
    </AppShell>
  );
}

function CallFact({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'good' | 'warning' | 'danger' | 'info' | 'neutral' | undefined;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={tone ? `tone-${tone}` : undefined}>{value}</dd>
    </div>
  );
}

function FollowUpFact({
  term,
  value,
  detail,
  tone,
}: {
  term: string;
  value: string;
  detail?: string | undefined;
  tone: 'good' | 'warning' | 'danger' | 'info' | 'neutral';
}) {
  return (
    <div>
      <dt>{term}</dt>
      <dd>
        <StatusPill tone={tone}>{value}</StatusPill>
        {detail ? <small>{detail}</small> : null}
      </dd>
    </div>
  );
}

function SummaryList({ title, items }: { title: string; items: string[] | undefined }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="summary-section">
      <p className="eyebrow">{title}</p>
      <ul>
        {[...new Set(items)].map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function callDurationSeconds(call: CallDetail): number | null {
  if (typeof call.providerMetadata?.call_duration_secs === 'number') {
    return call.providerMetadata.call_duration_secs;
  }
  if (!call.startedAt || !call.endedAt) return null;
  return Math.max(0, (Date.parse(call.endedAt) - Date.parse(call.startedAt)) / 1000);
}

function slaLabel(status: CallDetail['followUp']['sla']['status']): string {
  if (status === 'ON_TRACK') return 'On track';
  if (status === 'NOT_SET') return 'Not set';
  if (status === 'NOT_REQUIRED') return 'Not required';
  return humaniseState(status);
}

function slaTone(
  status: CallDetail['followUp']['sla']['status'],
): 'good' | 'warning' | 'danger' | 'neutral' {
  if (status === 'BREACHED') return 'danger';
  if (status === 'ON_TRACK' || status === 'NOT_SET') return 'warning';
  if (status === 'MET') return 'good';
  return 'neutral';
}

function deriveNextAction(
  call: CallDetail,
  summary:
    | {
        unresolved_items?: Claim[];
        unconfirmed_requests?: Claim[];
      }
    | undefined,
): string {
  if (call.followUp.sla.status === 'BREACHED') {
    return call.followUp.callback?.returned
      ? 'Review the breached SLA and close the remaining work.'
      : 'Return the customer call now. The SLA has been breached.';
  }
  if (call.followUp.caseStatus === 'OPEN' && !call.followUp.assignedOperator) {
    return 'Assign an operator to own the outstanding follow-up.';
  }
  if (call.followUp.callback && !call.followUp.callback.returned) {
    const owner = call.followUp.assignedOperator?.name ?? 'The assigned operator';
    return call.followUp.callback.dueAt
      ? `${owner} should return the call by ${formatDateTime(call.followUp.callback.dueAt)}.`
      : `${owner} should return the customer call.`;
  }
  if (call.followUp.caseStatus === 'OPEN') {
    return `${call.followUp.assignedOperator?.name ?? 'The assigned operator'} owns the remaining follow-up.`;
  }
  const unresolvedCount =
    (summary?.unresolved_items?.length ?? 0) + (summary?.unconfirmed_requests?.length ?? 0);
  return unresolvedCount > 0
    ? 'No follow-up is assigned. Review the unresolved items if action is still needed.'
    : 'No further action is required.';
}

function titleCase(value: string | null): string {
  if (!value) return 'All parks';
  return value.charAt(0).toUpperCase() + value.slice(1);
}
