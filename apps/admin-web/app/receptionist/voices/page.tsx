import Link from 'next/link';
import {
  Banner,
  DataTable,
  DefinitionList,
  EmptyState,
  FilterBar,
  MetricCard,
  MetricGrid,
  Panel,
  SearchInput,
  SelectField,
  StatusPill,
  formatDateTime,
  formatNumber,
  humaniseState,
  type Column,
} from '@quantum-parks/ui';
import { DomainPage, LoadFailure } from '../../domain-page';
import { apiGet } from '../../../lib/api';
import { matchesSearch, readParam, type SearchParams } from '../../../lib/list-view';
import type { AgentListRow, MissionControl, VoiceRow } from '../../../lib/types';
import { ApproveVoiceButton, AssignVoiceForm, RefreshCatalogueButton } from './voice-actions';

export const dynamic = 'force-dynamic';

export default async function VoicesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const [voicesResponse, missionResponse, agentsResponse] = await Promise.all([
    apiGet<{ status: string; data: VoiceRow[] }>('/voices', { purpose: 'RELEASE_MANAGEMENT' }),
    apiGet<MissionControl>('/mission-control', { purpose: 'OPERATIONS' }),
    apiGet<{ items: AgentListRow[] }>('/agents', { purpose: 'RELEASE_MANAGEMENT' }),
  ]);

  if (!voicesResponse.ok) {
    return (
      <DomainPage
        eyebrow="Receptionist"
        title="Voice library"
        description="Provider voices, approvals and per-language assignments."
      >
        <LoadFailure subject="Voice library" reason={voicesResponse.reason} />
      </DomainPage>
    );
  }

  const all = voicesResponse.data.data ?? [];
  const assignments = missionResponse.ok ? missionResponse.data.receptionist.voiceAssignments : [];
  const assignedNames = new Set(
    assignments.map((assignment) => assignment.voiceName).filter(Boolean),
  );

  const languageOf = (voice: VoiceRow) => String(voice.metadata?.language ?? '');
  const categoryOf = (voice: VoiceRow) => String(voice.metadata?.category ?? '');

  const language = readParam(params, 'language');
  const availability = readParam(params, 'availability');
  const search = readParam(params, 'q');

  const rows = all.filter((voice) => {
    if (language && languageOf(voice) !== language) return false;
    if (availability === 'unavailable' && voice.available) return false;
    if (availability === 'approved' && !voice.approved) return false;
    if (availability === 'assigned' && !assignedNames.has(voice.name)) return false;
    return matchesSearch(voice, search, [
      (item) => item.name,
      (item) => String(item.metadata?.accent ?? ''),
      (item) => item.providerVoiceId,
    ]);
  });

  const unavailable = all.filter((voice) => !voice.available);
  const unavailableAssigned = all.filter(
    (voice) => !voice.available && assignedNames.has(voice.name),
  );
  const languages = [...new Set(all.map(languageOf).filter(Boolean))].sort();

  const agentOptions = agentsResponse.ok
    ? agentsResponse.data.items
        .filter((agent) => agent.versionId)
        .map((agent) => ({
          value: agent.versionId as string,
          label: `${agent.name} v${agent.version} (${humaniseState(agent.state ?? '')})`,
        }))
    : [];

  const compareIds = new Set(
    (Array.isArray(params.compare) ? params.compare[0] : params.compare)
      ?.split(',')
      .filter(Boolean) ?? [],
  );
  const compareVoices = all.filter((voice) => compareIds.has(voice.id));

  const columns: Column<VoiceRow>[] = [
    {
      key: 'name',
      header: 'Voice',
      render: (voice) => (
        <>
          {voice.name}
          <small className="cell-sub">
            {humaniseState(categoryOf(voice))} · {String(voice.metadata?.useCase ?? '—')}
          </small>
        </>
      ),
    },
    {
      key: 'language',
      header: 'Language',
      render: (voice) => (languageOf(voice) || '—').toUpperCase(),
    },
    {
      key: 'availability',
      header: 'Availability',
      render: (voice) => (
        <StatusPill tone={voice.available ? 'good' : 'danger'}>
          {voice.available ? 'Available' : 'Unavailable'}
        </StatusPill>
      ),
    },
    {
      key: 'approval',
      header: 'Approval',
      render: (voice) =>
        voice.approved ? (
          <StatusPill tone="good">Approved</StatusPill>
        ) : (
          <span className="muted-cell">Not approved</span>
        ),
    },
    {
      key: 'assigned',
      header: 'Assigned',
      render: (voice) =>
        assignedNames.has(voice.name) ? (
          <StatusPill tone="info">In use</StatusPill>
        ) : (
          <span className="muted-cell">—</span>
        ),
    },
    {
      key: 'custom',
      header: 'Ownership',
      render: (voice) =>
        voice.custom ? (
          <>
            Cloned
            {voice.consent ? (
              <small className="cell-sub">
                {voice.consent.valid ? 'Consent valid' : 'Consent expired or revoked'} to{' '}
                {formatDateTime(voice.consent.validUntil)}
              </small>
            ) : (
              <small className="cell-sub">No consent record</small>
            )}
          </>
        ) : (
          'Provider catalogue'
        ),
      priority: 'secondary',
    },
    {
      key: 'verified',
      header: 'Last checked',
      render: (voice) => formatDateTime(voice.lastVerifiedAt),
      priority: 'secondary',
    },
    {
      key: 'compare',
      header: 'Compare',
      render: (voice) => {
        const next = new Set(compareIds);
        if (next.has(voice.id)) next.delete(voice.id);
        else next.add(voice.id);
        const query = new URLSearchParams();
        if (next.size > 0) query.set('compare', [...next].join(','));
        return (
          <Link
            className="row-link"
            href={`/receptionist/voices?${query.toString()}`}
            scroll={false}
          >
            {compareIds.has(voice.id) ? 'Remove' : 'Add'}
          </Link>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (voice) => (
        <details className="row-actions">
          <summary>Manage</summary>
          <div className="row-actions-body">
            {!voice.approved ? (
              <ApproveVoiceButton
                voiceId={voice.id}
                custom={voice.custom}
                consentValid={voice.consent?.valid ?? false}
              />
            ) : (
              <p className="muted-cell">Already approved.</p>
            )}
            {voice.approved && voice.available ? (
              <AssignVoiceForm voiceId={voice.id} agentVersions={agentOptions} />
            ) : null}
          </div>
        </details>
      ),
    },
  ];

  return (
    <DomainPage
      eyebrow="Receptionist"
      title="Voice library"
      description="Voices the provider offers, which are approved for use, and which language each is assigned to."
      meta={<StatusPill tone="neutral">{formatNumber(all.length)} voices</StatusPill>}
    >
      {unavailableAssigned.length > 0 ? (
        <Banner
          tone="danger"
          title={`${formatNumber(unavailableAssigned.length)} assigned voices are unavailable`}
        >
          The provider no longer offers a voice this agent references. Calls in that language will
          fall back if a fallback is configured, or fail if not.
        </Banner>
      ) : null}

      <MetricGrid>
        <MetricCard
          label="Available"
          value={formatNumber(all.filter((voice) => voice.available).length)}
          detail={`${formatNumber(unavailable.length)} unavailable`}
          tone={unavailable.length > 0 ? 'warning' : 'good'}
        />
        <MetricCard
          label="Approved for use"
          value={formatNumber(all.filter((voice) => voice.approved).length)}
          detail="Cleared by a reviewer for caller-facing use"
        />
        <MetricCard
          label="Assigned"
          value={formatNumber(assignments.length)}
          detail="Language and fallback slots filled"
        />
        <MetricCard
          label="Custom voices"
          value={formatNumber(all.filter((voice) => voice.custom).length)}
          detail="Require recorded speaker consent"
          tone="info"
        />
      </MetricGrid>

      <Panel
        title="Current assignments"
        eyebrow="By language"
        description="Each language has a primary voice and, where configured, a fallback used when the primary is unavailable."
      >
        {assignments.length === 0 ? (
          <EmptyState
            title="No voices assigned"
            detail="Assign a voice per language before publishing a release."
          />
        ) : (
          <div className="voice-assignment-row">
            {assignments.map((assignment) => (
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
        )}
      </Panel>

      {compareVoices.length >= 2 ? (
        <Panel
          title="Comparison"
          eyebrow={`${formatNumber(compareVoices.length)} voices`}
          description="Selected from the catalogue below using each row's Compare link."
          action={
            <Link className="row-link" href="/receptionist/voices">
              Clear comparison
            </Link>
          }
        >
          <div className="voice-compare-grid">
            {compareVoices.map((voice) => (
              <div className="voice-compare-card" key={voice.id}>
                <strong>{voice.name}</strong>
                <DefinitionList
                  items={[
                    { term: 'Language', value: languageOf(voice).toUpperCase() || '—' },
                    { term: 'Category', value: humaniseState(categoryOf(voice)) },
                    { term: 'Gender', value: humaniseState(String(voice.metadata?.gender ?? '—')) },
                    { term: 'Accent', value: String(voice.metadata?.accent ?? '—') },
                    {
                      term: 'Use case',
                      value: humaniseState(String(voice.metadata?.useCase ?? '—')),
                    },
                    {
                      term: 'Availability',
                      value: voice.available ? 'Available' : 'Unavailable',
                    },
                    {
                      term: 'Approval',
                      value: voice.approved ? 'Approved' : 'Not approved',
                    },
                    {
                      term: 'Ownership',
                      value: voice.custom ? 'Cloned voice' : 'Provider catalogue',
                    },
                    {
                      term: 'Consent',
                      value: !voice.custom
                        ? 'Not applicable'
                        : voice.consent
                          ? voice.consent.valid
                            ? `Valid to ${formatDateTime(voice.consent.validUntil)}`
                            : 'Expired or revoked'
                          : 'No record',
                    },
                    {
                      term: 'Assignments',
                      value:
                        voice.assignments.length > 0
                          ? voice.assignments
                              .map(
                                (assignment) =>
                                  `${assignment.language.toUpperCase()} · ${humaniseState(assignment.environment)}${assignment.fallback ? ' (fallback)' : ''}`,
                              )
                              .join(', ')
                          : 'None',
                    },
                    { term: 'Last checked', value: formatDateTime(voice.lastVerifiedAt) },
                  ]}
                />
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      <Panel
        title="Provider catalogue"
        description="Pull the latest voices this workspace's provider offers."
      >
        <RefreshCatalogueButton />
      </Panel>

      <FilterBar
        action="/receptionist/voices"
        resetHref="/receptionist/voices"
        label="Filter voices"
      >
        <SearchInput
          label="Search"
          placeholder="Name, accent or provider id"
          {...(search ? { defaultValue: search } : {})}
        />
        <SelectField
          id="language"
          label="Language"
          placeholder="All languages"
          options={languages.map((value) => ({ value, label: value.toUpperCase() }))}
          {...(language ? { defaultValue: language } : {})}
        />
        <SelectField
          id="availability"
          label="Show"
          placeholder="All voices"
          options={[
            { value: 'approved', label: 'Approved only' },
            { value: 'assigned', label: 'Assigned only' },
            { value: 'unavailable', label: 'Unavailable only' },
          ]}
          {...(availability ? { defaultValue: availability } : {})}
        />
      </FilterBar>

      <Panel
        title={`${formatNumber(rows.length)} ${rows.length === 1 ? 'voice' : 'voices'}`}
        eyebrow={rows.length === all.length ? 'Full catalogue' : 'Filtered'}
      >
        <DataTable
          caption="Voices with their language, availability, approval and assignment state"
          columns={columns}
          rows={rows}
          getRowKey={(voice) => voice.id}
          empty={
            <EmptyState
              title={
                all.length === 0 ? 'No voices in the catalogue' : 'No voices match these filters'
              }
              detail={
                all.length === 0
                  ? 'Refresh the catalogue from the provider to populate this list.'
                  : 'Adjust or clear the filters to see more voices.'
              }
            />
          }
        />
      </Panel>
    </DomainPage>
  );
}
