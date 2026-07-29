import {
  Activity,
  BrainCircuit,
  FlaskConical,
  MessageSquareText,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react';
import {
  DataTable,
  EmptyState,
  FilterBar,
  Pagination,
  Panel,
  SearchInput,
  SelectField,
  StatusPill,
  formatDateTime,
  formatNumber,
  humaniseState,
  toneForState,
  type Column,
} from '@quantum-parks/ui';
import { DomainPage, LoadFailure } from '../domain-page';
import { apiGet } from '../../lib/api';
import {
  DEFAULT_PAGE_SIZE,
  buildHref,
  matchesSearch,
  paginate,
  readNumber,
  readParam,
  readSort,
  sortRows,
  type SearchParams,
} from '../../lib/list-view';
import type { CallIntelligence } from '../settings/simulation/use-receptionist-conversation';
import { ChatTestConsole } from './chat-test-console';

export const dynamic = 'force-dynamic';

type ProviderReadinessSummary = {
  connected: boolean;
  agentVerified: boolean;
  agentVersionId: string | null;
  latestDiagnosticsStatus: 'PASS' | 'WARNING' | 'FAIL' | 'NOT_CONFIGURED' | null;
  latestDiagnosticsAt: string | null;
};

type ReceptionistSessionRow = {
  id: string;
  label: string;
  mode: 'VOICE' | 'TEXT';
  status: string;
  source: string;
  createdAt: string;
  endedAt: string | null;
  messageCount: number;
  conversationId: string | null;
  escalationStatus: 'NONE' | 'REQUIRED' | null;
  synthetic: boolean;
};

type ChatSessionDetail = {
  session: ReceptionistSessionRow;
  turns: Array<{ id: string; sequence: number; speaker: string; content: string }>;
  callIntelligence: CallIntelligence;
};

type ChatRow = {
  id: string;
  label: string;
  status: string;
  createdAt: string;
  endedAt: string | null;
  messageCount: number;
  summary: string | null;
  sentiment: string | null;
  classification: string | null;
  urgency: string | null;
  confidence: number | null;
  escalationStatus: 'NONE' | 'REQUIRED' | null;
  conversationId: string | null;
  lastMessage: string | null;
  source: string;
  synthetic: boolean;
  demo: boolean;
};

const DETAIL_LIMIT = 100;

export default async function ChatPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const [sessionsResponse, readinessResponse] = await Promise.all([
    apiGet<ReceptionistSessionRow[]>('/receptionist-sessions', { purpose: 'QUALITY_REVIEW' }),
    apiGet<ProviderReadinessSummary>('/admin/integrations/elevenlabs/readiness-summary', {
      purpose: 'QUALITY_REVIEW',
    }),
  ]);

  const liveAgentVersionId = readinessResponse.ok ? readinessResponse.data.agentVersionId : null;
  const loadError = !readinessResponse.ok ? readinessResponse.reason : null;

  if (!sessionsResponse.ok) {
    return (
      <DomainPage
        eyebrow="Chat"
        title="Captured chats"
        description="Website and app chats captured from the ElevenLabs agent, with the same review evidence as phone calls."
      >
        <LoadFailure subject="Chat sessions" reason={sessionsResponse.reason} />
      </DomainPage>
    );
  }

  const textSessions = sessionsResponse.data.filter((session) => session.mode === 'TEXT');
  const detailResponses = await Promise.all(
    textSessions.slice(0, DETAIL_LIMIT).map((session) =>
      apiGet<ChatSessionDetail | null>(`/receptionist-sessions/${session.id}`, {
        purpose: 'QUALITY_REVIEW',
      }),
    ),
  );
  const detailById = new Map(
    detailResponses.flatMap((response) =>
      response.ok && response.data ? [[response.data.session.id, response.data] as const] : [],
    ),
  );
  const recordedRows: ChatRow[] = textSessions.map((session) => {
    const detail = detailById.get(session.id);
    const lastTurn = detail?.turns.at(-1);
    return {
      id: session.id,
      label: session.label,
      status: session.status,
      createdAt: session.createdAt,
      endedAt: session.endedAt,
      messageCount: session.messageCount,
      summary: detail?.callIntelligence.summary ?? detail?.callIntelligence.summaryIssue ?? null,
      sentiment: detail?.callIntelligence.sentiment ?? null,
      classification: detail?.callIntelligence.classification ?? null,
      urgency: detail?.callIntelligence.urgency ?? null,
      confidence: detail?.callIntelligence.confidence ?? null,
      escalationStatus: session.escalationStatus,
      conversationId: session.conversationId,
      lastMessage: lastTurn
        ? `${lastTurn.speaker === 'USER' ? 'Operator' : 'Agent'}: ${lastTurn.content}`
        : null,
      source: session.source,
      synthetic: session.synthetic,
      demo: false,
    };
  });
  const demoRows = process.env.QP_ENVIRONMENT === 'production' ? [] : buildDemoChatRows(new Date());
  const rows = [...recordedRows, ...demoRows];

  const search = readParam(params, 'q');
  const status = readParam(params, 'status');
  const sentiment = readParam(params, 'sentiment');
  const classification = readParam(params, 'classification');
  const source = readParam(params, 'source');

  const filtered = rows.filter((row) => {
    if (status && row.status !== status) return false;
    if (sentiment && row.sentiment !== sentiment) return false;
    if (classification && row.classification !== classification) return false;
    if (source && row.source !== source) return false;
    return matchesSearch(row, search, [
      (item) => item.label,
      (item) => item.summary,
      (item) => item.lastMessage,
      (item) => item.classification,
      (item) => item.sentiment,
      (item) => item.source,
    ]);
  });

  const sort = readSort(params, 'createdAt');
  const sorted = sortRows(filtered, sort, {
    chat: (row) => row.label,
    createdAt: (row) => Date.parse(row.createdAt),
    status: (row) => row.status,
    classification: (row) => row.classification,
    sentiment: (row) => row.sentiment,
    messages: (row) => row.messageCount,
    confidence: (row) => row.confidence,
    source: (row) => row.source,
  });
  const page = readNumber(params, 'page', 1);
  const pagedRows = paginate(sorted, page, DEFAULT_PAGE_SIZE);

  const activeChats = recordedRows.filter((row) => row.status === 'ACTIVE');
  const analysedChats = recordedRows.filter(
    (row) => row.summary || row.classification || row.sentiment,
  );
  const needsCare = recordedRows.filter(
    (row) => row.sentiment === 'NEGATIVE' || row.escalationStatus === 'REQUIRED',
  );
  const statuses = uniqueOptions(rows.map((row) => row.status));
  const sentiments = uniqueOptions(rows.map((row) => row.sentiment));
  const classifications = uniqueOptions(rows.map((row) => row.classification));
  const sources = uniqueOptions(rows.map((row) => row.source));

  const columns: Column<ChatRow>[] = [
    {
      key: 'chat',
      header: 'Chat',
      sortable: true,
      width: '34%',
      render: (row) => (
        <span className="call-list-title">
          {row.summary?.trim() || row.lastMessage?.trim() || row.label}
        </span>
      ),
    },
    {
      key: 'classification',
      header: 'Classification',
      sortable: true,
      render: (row) => humanise(row.classification),
    },
    {
      key: 'sentiment',
      header: 'Sentiment',
      sortable: true,
      render: (row) => humanise(row.sentiment),
    },
    {
      key: 'createdAt',
      header: 'Started',
      sortable: true,
      render: (row) => formatDateTime(row.createdAt),
    },
    {
      key: 'messages',
      header: 'Messages',
      sortable: true,
      render: (row) => formatNumber(row.messageCount),
      priority: 'secondary',
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (row) => (
        <StatusPill tone={row.status === 'ACTIVE' ? 'warning' : toneForState(row.status)}>
          {humaniseState(row.status)}
        </StatusPill>
      ),
    },
    {
      key: 'source',
      header: 'Origin',
      sortable: true,
      render: (row) => (
        <StatusPill tone={row.demo ? 'neutral' : row.source === 'LIVE' ? 'good' : 'neutral'}>
          {row.demo ? 'Demo' : humaniseState(row.source)}
        </StatusPill>
      ),
      priority: 'secondary',
    },
  ];

  return (
    <DomainPage
      eyebrow="Chat"
      title="Captured chats"
      description="Website and app chats captured from the ElevenLabs agent, with summary, sentiment, classification, urgency and live operator chat."
      meta={
        <StatusPill tone="neutral">
          {formatNumber(recordedRows.length)} recorded
          {demoRows.length ? ` · ${formatNumber(demoRows.length)} demo` : ''}
        </StatusPill>
      }
    >
      <section className="calls-command chat-command" aria-labelledby="chat-command-title">
        <div className="calls-command-heading">
          <div>
            <p className="eyebrow">Live operations</p>
            <h2 id="chat-command-title">Chat mission control</h2>
            <p>
              Live website/app chat uses the ElevenLabs signed-url text channel. Quantum captures
              transcript evidence and evaluates it against approved knowledge.
            </p>
          </div>
          <div className="chat-command-actions">
            <span className="calls-command-updated">
              {readinessResponse.ok && readinessResponse.data.agentVersionId
                ? 'Live agent ready'
                : 'Agent sync required'}
            </span>
            <ChatTestConsole
              agentVersionId={liveAgentVersionId}
              readiness={readinessResponse.ok ? readinessResponse.data : null}
              loadError={loadError}
            />
          </div>
        </div>
        <div className="calls-command-metrics chat-command-metrics">
          <Metric
            icon={MessageSquareText}
            label="Captured chats"
            value={formatNumber(recordedRows.length)}
            detail="Text sessions stored"
          />
          <Metric
            icon={Activity}
            label="Active now"
            value={formatNumber(activeChats.length)}
            detail="Still connected"
          />
          <Metric
            icon={BrainCircuit}
            label="Analysed"
            value={formatNumber(analysedChats.length)}
            detail="Has AI evidence"
          />
          <Metric
            icon={ShieldAlert}
            label="Needs care"
            value={formatNumber(needsCare.length)}
            detail="Negative or escalated"
          />
          <Metric
            icon={FlaskConical}
            label="Demo records"
            value={formatNumber(demoRows.length)}
            detail="Layout preview only"
          />
        </div>
      </section>

      <FilterBar action="/chat" resetHref="/chat" label="Search chats">
        <SearchInput
          label="Search"
          placeholder="Summary, message, sentiment, classification"
          {...(search ? { defaultValue: search } : {})}
        />
        <SelectField
          id="status"
          label="Status"
          placeholder="Any status"
          options={statuses.map((value) => ({ value, label: humaniseState(value) }))}
          {...(status ? { defaultValue: status } : {})}
        />
        <SelectField
          id="sentiment"
          label="Sentiment"
          placeholder="Any sentiment"
          options={sentiments.map((value) => ({ value, label: humanise(value) }))}
          {...(sentiment ? { defaultValue: sentiment } : {})}
        />
        <SelectField
          id="classification"
          label="Classification"
          placeholder="Any classification"
          options={classifications.map((value) => ({ value, label: humanise(value) }))}
          {...(classification ? { defaultValue: classification } : {})}
        />
        <SelectField
          id="source"
          label="Origin"
          placeholder="Any origin"
          options={sources.map((value) => ({
            value,
            label: value === 'DEMO' ? 'Demo' : humaniseState(value),
          }))}
          {...(source ? { defaultValue: source } : {})}
        />
      </FilterBar>

      <Panel
        title={`${formatNumber(sorted.length)} ${sorted.length === 1 ? 'chat' : 'chats'}`}
        eyebrow={filtered.length === rows.length ? 'All records' : 'Filtered'}
      >
        <DataTable
          caption="Chats with their summary, classification, sentiment, start time, message count and status"
          columns={columns}
          rows={pagedRows}
          getRowKey={(row) => row.id}
          rowHref={(row) => (row.demo ? undefined : `/chat/${row.id}`)}
          sort={sort}
          buildSortHref={(key, direction) =>
            buildHref('/chat', params, { sort: key, dir: direction, page: undefined })
          }
          empty={
            <EmptyState
              title={
                rows.length === 0 ? 'No live chats recorded yet' : 'No chats match these filters'
              }
              detail={
                rows.length === 0
                  ? 'Live text conversations appear here once an operator connects to the published ElevenLabs chat agent.'
                  : 'Adjust or clear the filters to see more records.'
              }
            />
          }
        />
        <Pagination
          page={page}
          pageSize={DEFAULT_PAGE_SIZE}
          total={sorted.length}
          buildHref={(next) => buildHref('/chat', params, { page: next })}
        />
      </Panel>
    </DomainPage>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="calls-command-metric chat-command-metric">
      <span className="calls-command-metric-icon" aria-hidden="true">
        <Icon size={17} />
      </span>
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
        <em>{detail}</em>
      </span>
    </article>
  );
}

function buildDemoChatRows(now: Date): ChatRow[] {
  const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();
  return [
    {
      id: 'demo-chat-booking',
      label: 'Family booking enquiry',
      status: 'ENDED',
      createdAt: ago(18),
      endedAt: ago(13),
      messageCount: 9,
      summary:
        'Family asked about weekend availability, age requirements and group pricing for Sintra.',
      sentiment: 'POSITIVE',
      classification: 'BOOKING_ENQUIRY',
      urgency: 'LOW',
      confidence: 0.94,
      escalationStatus: 'NONE',
      conversationId: null,
      lastMessage: 'Agent: I can explain the options and share the official booking link.',
      source: 'DEMO',
      synthetic: true,
      demo: true,
    },
    {
      id: 'demo-chat-accessibility',
      label: 'Accessibility support',
      status: 'ENDED',
      createdAt: ago(52),
      endedAt: ago(45),
      messageCount: 12,
      summary:
        'Visitor checked wheelchair access, accessible parking and companion arrangements at Porto.',
      sentiment: 'NEUTRAL',
      classification: 'ACCESSIBILITY_SUPPORT',
      urgency: 'MEDIUM',
      confidence: 0.91,
      escalationStatus: 'NONE',
      conversationId: null,
      lastMessage: 'Agent: I have listed the verified accessibility information for Porto.',
      source: 'DEMO',
      synthetic: true,
      demo: true,
    },
    {
      id: 'demo-chat-complaint',
      label: 'Delayed refund complaint',
      status: 'ENDED',
      createdAt: ago(96),
      endedAt: ago(88),
      messageCount: 15,
      summary:
        'Customer reported a delayed refund and requested a human review of the existing case.',
      sentiment: 'NEGATIVE',
      classification: 'COMPLAINT',
      urgency: 'HIGH',
      confidence: 0.97,
      escalationStatus: 'REQUIRED',
      conversationId: null,
      lastMessage:
        'Agent: I will route this for human review without claiming the refund is complete.',
      source: 'DEMO',
      synthetic: true,
      demo: true,
    },
    {
      id: 'demo-chat-hours',
      label: 'Opening hours',
      status: 'ENDED',
      createdAt: ago(141),
      endedAt: ago(138),
      messageCount: 6,
      summary: 'Visitor asked for today’s opening hours and last entry time at Lisboa.',
      sentiment: 'POSITIVE',
      classification: 'OPENING_HOURS',
      urgency: 'LOW',
      confidence: 0.96,
      escalationStatus: 'NONE',
      conversationId: null,
      lastMessage: 'Agent: Here are the approved opening and last-entry times for Lisboa.',
      source: 'DEMO',
      synthetic: true,
      demo: true,
    },
    {
      id: 'demo-chat-group',
      label: 'School group visit',
      status: 'ACTIVE',
      createdAt: ago(7),
      endedAt: null,
      messageCount: 5,
      summary: 'School organiser is checking group sizes, supervision ratios and catering options.',
      sentiment: 'NEUTRAL',
      classification: 'GROUP_BOOKING',
      urgency: 'MEDIUM',
      confidence: 0.88,
      escalationStatus: 'NONE',
      conversationId: null,
      lastMessage: 'Operator: Are weekday group packages available during term time?',
      source: 'DEMO',
      synthetic: true,
      demo: true,
    },
  ];
}

function uniqueOptions(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
}

function humanise(value: string | null): string {
  if (!value) return 'Not available';
  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
