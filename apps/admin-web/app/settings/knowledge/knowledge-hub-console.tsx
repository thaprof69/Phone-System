'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpenCheck,
  BrainCircuit,
  Check,
  CheckCircle2,
  Clock3,
  FileSpreadsheet,
  FileSearch,
  FileText,
  Globe2,
  Link2,
  LoaderCircle,
  MessageSquareText,
  PanelRightOpen,
  PhoneCall,
  Play,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { StatusPill } from '@quantum-parks/ui';

type KnowledgeRecord = {
  id: string;
  title: string;
  language: string;
  state?: string;
  versionId?: string;
};

type IngestItem = {
  id: string;
  title: string;
  kind: string;
  status: 'Analysing' | 'In review' | 'Blocked';
  summary: string;
  category: string;
  confidence: string;
  analysis?: DocumentAnalysis;
  error?: string;
};

type DocumentAnalysis = {
  shortSummary: string;
  detailedSummary: string;
  documentPurpose: string;
  topics: string[];
  keyFacts: Array<{ fact: string; evidenceQuote: string }>;
  ambiguities: string[];
  knowledgeContribution: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
};

const supportedSources = [
  ['PDF', 'Menus, policies, brochures', FileText, '.pdf'],
  ['Word', 'SOPs, scripts, handbooks', FileText, '.doc,.docx'],
  ['Sheets', 'Hours, rates, locations', FileSpreadsheet, '.csv,.xlsx'],
  ['Markdown', 'Versioned operational docs', FileText, '.md,.markdown'],
  ['Text', 'FAQs and approved snippets', MessageSquareText, '.txt'],
  ['URL', 'Public pages and help articles', Globe2, ''],
] as const;

const flowSteps: Array<{ label: string; icon: LucideIcon }> = [
  { label: 'Ingest', icon: Upload },
  { label: 'AI structure', icon: BrainCircuit },
  { label: 'Review', icon: ShieldCheck },
  { label: 'Knowledge layer', icon: BookOpenCheck },
  { label: 'AI/provider router', icon: Send },
  { label: 'ElevenLabs agent', icon: PhoneCall },
];

const knowledgeGaps = [
  {
    scenario: 'Caller asked whether a birthday package can be rescheduled after bad weather.',
    reason:
      'Approved knowledge states general booking terms but does not define weather-related party rescheduling.',
    suggestion: 'Add FAQ and escalation rule for weather-affected party bookings.',
    type: 'FAQ',
    priority: 'High',
  },
  {
    scenario: 'Caller requested sensory-friendly session details for a school group.',
    reason: 'Accessibility page mentions quiet times but has no group-specific operating boundary.',
    suggestion: 'Publish SOP with approved school group accessibility language and staff handoff.',
    type: 'SOP',
    priority: 'Medium',
  },
  {
    scenario: 'Caller challenged annual pass upgrade pricing.',
    reason: 'Pricing constraints exist, but no approved example covers upgrade disputes.',
    suggestion: 'Create voice example for pricing constraint and human escalation.',
    type: 'Voice example',
    priority: 'Medium',
  },
];

const businessFields = [
  ['Business name', 'Quantum Parks'],
  ['Services', 'Tickets, parties, memberships, accessibility support, lost property'],
  ['Hours', 'Seasonal hours, event exceptions, weather closures'],
  ['Locations', 'Main park, group entrance, accessible parking, guest services'],
  ['Escalation contacts', 'Duty manager, accessibility lead, bookings team, safety desk'],
  ['Pricing constraints', 'Quote only approved ranges; never promise refunds or discounts'],
  ['Operational boundaries', 'No card handling, no capacity-affecting booking action by default'],
] as const;

type BusinessFieldLabel =
  (typeof businessFields)[number][0] | 'Company voice' | 'Approved examples';

const initialBusinessFacts: Record<BusinessFieldLabel, string> = {
  ...Object.fromEntries(businessFields),
  'Company voice':
    'Helpful, calm, concise, and operationally honest. Explain next steps without claiming actions are complete until trusted systems confirm success.',
  'Approved examples':
    'For refund requests: acknowledge, state the approved boundary, and offer a guest-services handoff. For pricing: quote only approved ranges and avoid custom discounts.',
} as Record<BusinessFieldLabel, string>;

function CopilotSuggestion({
  suggestion,
  onApply,
  onDismiss,
}: {
  suggestion?: string | undefined;
  onApply: (suggestion: string) => void;
  onDismiss: () => void;
}) {
  if (!suggestion) return null;
  return (
    <div className="copilot-suggestion" role="status">
      <span>Copilot suggestion</span>
      <p>{suggestion}</p>
      <div className="copilot-suggestion-actions">
        <button type="button" onClick={() => onApply(suggestion)}>
          <Check size={14} />
          Apply
        </button>
        <button type="button" onClick={onDismiss}>
          <X size={14} />
          Dismiss
        </button>
      </div>
    </div>
  );
}

function removeSuggestion(
  suggestions: Partial<Record<BusinessFieldLabel, string>>,
  fieldLabel: BusinessFieldLabel,
) {
  const next = { ...suggestions };
  delete next[fieldLabel];
  return next;
}

export function KnowledgeHubConsole({
  records,
  unavailableReason,
}: {
  records: KnowledgeRecord[];
  unavailableReason: string | null;
}) {
  const [url, setUrl] = useState('https://quantumparks.example/guest-help');
  const [items, setItems] = useState<IngestItem[]>([]);
  const [activeItem, setActiveItem] = useState<IngestItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [businessFacts, setBusinessFacts] = useState(initialBusinessFacts);
  const [enhancingField, setEnhancingField] = useState<BusinessFieldLabel | null>(null);
  const [suggestions, setSuggestions] = useState<Partial<Record<BusinessFieldLabel, string>>>({});
  const [copilotError, setCopilotError] = useState<string | null>(null);
  const [message, setMessage] = useState(
    unavailableReason ?? 'Knowledge Hub is using local cockpit state for this preview.',
  );
  const [simulatorInput, setSimulatorInput] = useState(
    'Can I change a birthday party booking if it rains?',
  );
  const [simulatorAnswer, setSimulatorAnswer] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!drawerOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [drawerOpen]);

  const approvedCount = records.filter((record) => record.state === 'ACTIVE').length;
  const pendingCount = records.filter((record) =>
    ['DRAFT', 'IN_REVIEW', 'APPROVED'].includes(record.state ?? 'DRAFT'),
  ).length;
  const latestRecord = records[0];

  const extractionSummary = useMemo(
    () => [
      { label: 'Approved knowledge', value: String(approvedCount), detail: 'Local records active' },
      {
        label: 'Review queue',
        value: String(pendingCount + items.filter((item) => item.status === 'In review').length),
        detail: 'Drafts awaiting approval',
      },
      {
        label: 'Knowledge gaps',
        value: String(knowledgeGaps.length),
        detail: 'From call transcripts',
      },
      { label: 'Agent sync', value: 'Blocked', detail: 'Requires provider readiness' },
    ],
    [approvedCount, items, pendingCount],
  );

  function ingestUrl() {
    setMessage(
      `URL ingestion for ${url} is not connected yet. No page was fetched and nothing was published.`,
    );
  }

  function chooseFile(kind: string, accept: string) {
    if (!fileInput.current) return;
    fileInput.current.accept = accept;
    fileInput.current.dataset.kind = kind;
    fileInput.current.click();
  }

  async function stageFile(file: File) {
    const kind = fileInput.current?.dataset.kind ?? 'Document';
    const item: IngestItem = {
      id: `file-${Date.now()}`,
      title: file.name,
      kind,
      status: 'Analysing',
      summary: 'Extracting text and asking the configured Knowledge Hub route for analysis.',
      category: 'Analysing',
      confidence: 'Pending',
    };
    setItems((current) => [item, ...current]);
    setActiveItem(item);
    setMessage(`${file.name} is being analysed. Nothing will publish automatically.`);

    const form = new FormData();
    form.set('file', file);
    try {
      const response = await fetch('/api/admin/knowledge-copilot/analyse', {
        method: 'POST',
        body: form,
      });
      const payload = (await response.json().catch(() => ({}))) as {
        analysis?: DocumentAnalysis;
        message?: string;
      };
      if (!response.ok || !payload.analysis) {
        throw new Error(payload.message ?? 'The configured Knowledge Hub route refused the file.');
      }

      const analysed: IngestItem = {
        ...item,
        status: 'In review',
        summary: payload.analysis.shortSummary,
        category: payload.analysis.topics[0] ?? 'Company knowledge',
        confidence: payload.analysis.confidence,
        analysis: payload.analysis,
      };
      setItems((current) => current.map((entry) => (entry.id === item.id ? analysed : entry)));
      setActiveItem(analysed);
      setMessage(
        `${file.name} was analysed into a reviewable draft. Human approval is still required.`,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'The document could not be analysed.';
      const blocked: IngestItem = {
        ...item,
        status: 'Blocked',
        summary: reason,
        category: 'Analysis blocked',
        confidence: 'Not assessed',
        error: reason,
      };
      setItems((current) => current.map((entry) => (entry.id === item.id ? blocked : entry)));
      setActiveItem(blocked);
      setMessage(`${file.name} was not analysed: ${reason}`);
    }
  }

  async function enhanceField(fieldLabel: BusinessFieldLabel) {
    const currentText = businessFacts[fieldLabel].trim();
    if (currentText.length < 3) {
      setCopilotError('Add a little more detail before asking Copilot to enhance it.');
      return;
    }

    setEnhancingField(fieldLabel);
    setCopilotError(null);
    try {
      const response = await fetch('/api/admin/ai/intelligence/copilot/enhance', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fieldLabel,
          currentText,
          context: Object.entries(businessFacts)
            .filter(([label, value]) => label !== fieldLabel && value.trim())
            .slice(0, 8)
            .map(([label, value]) => ({ label, value })),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        suggestion?: string;
        message?: string;
      };
      if (!response.ok || !payload.suggestion) {
        throw new Error(payload.message ?? 'The configured AI Copilot route refused this request.');
      }
      setSuggestions((current) => ({ ...current, [fieldLabel]: payload.suggestion }));
    } catch (error) {
      setCopilotError(
        error instanceof Error ? error.message : 'Copilot is temporarily unavailable.',
      );
    } finally {
      setEnhancingField(null);
    }
  }

  function runSimulation() {
    setSimulatorAnswer(
      `Using approved knowledge, the agent should explain that party booking changes depend on the published weather policy, avoid promising a refund or capacity change, and offer a bookings-team handoff. Gap flagged: weather-specific party rescheduling still needs approval.`,
    );
    setMessage(
      'Simulator used the same approved knowledge boundary and voice guidance shown here.',
    );
  }

  return (
    <div className="knowledge-cockpit">
      <div className="notice warning" role="status">
        <AlertTriangle size={18} />
        <div>
          <strong>Operator control plane</strong>
          <p>
            ElevenLabs answers calls, but operators manage intelligence, review, approval, testing,
            and runtime publication here.
          </p>
        </div>
      </div>

      <section className="knowledge-flow" aria-label="Knowledge flow">
        {flowSteps.map(({ label, icon: Icon }) => (
          <div key={label}>
            <Icon size={17} />
            <span>{label}</span>
          </div>
        ))}
      </section>

      <div className="knowledge-metrics">
        {extractionSummary.map((metric) => (
          <article key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <p>{metric.detail}</p>
          </article>
        ))}
      </div>

      <div className="knowledge-grid">
        <section className="knowledge-panel knowledge-panel-wide">
          <header>
            <div>
              <p className="eyebrow">Primary entry point</p>
              <h2>Ingest company intelligence</h2>
            </div>
            <StatusPill tone="warning">Human approval required</StatusPill>
          </header>
          <div className="source-grid">
            {supportedSources.map(([label, detail, Icon, accept]) => (
              <button
                key={label}
                type="button"
                className="source-tile"
                onClick={() =>
                  label === 'URL'
                    ? setMessage('Enter a public URL below to stage it for extraction.')
                    : chooseFile(label, accept)
                }
              >
                <Icon size={18} />
                <strong>{label}</strong>
                <span>{detail}</span>
              </button>
            ))}
          </div>
          <input
            ref={fileInput}
            className="sr-only"
            type="file"
            aria-label="Choose a knowledge document"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void stageFile(file);
              event.target.value = '';
            }}
          />
          <div className="url-ingest">
            <label>
              <span>URL ingestion</span>
              <input value={url} onChange={(event) => setUrl(event.target.value)} />
            </label>
            <button className="button primary" type="button" onClick={ingestUrl}>
              <Link2 size={15} />
              Extract URL
            </button>
          </div>
        </section>

        <section className="knowledge-panel">
          <header>
            <div>
              <p className="eyebrow">Uploaded documents</p>
              <h2>Ingestion inventory</h2>
            </div>
          </header>
          <div className="document-window">
            {items.length > 0 ? (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`document-row ${item.id === activeItem?.id ? 'active' : ''}`}
                  onClick={() => {
                    setActiveItem(item);
                    setDrawerOpen(true);
                  }}
                  aria-label={`Open AI analysis for ${item.title}`}
                >
                  {item.status === 'Analysing' ? (
                    <LoaderCircle className="spin" size={17} />
                  ) : (
                    <FileText size={17} />
                  )}
                  <span className="document-main">
                    <strong>{item.title}</strong>
                    <small>
                      {item.kind} · {item.category}
                    </small>
                    <span>{item.summary}</span>
                  </span>
                  <span className="document-row-action">
                    <span className="document-state">{item.status}</span>
                    <PanelRightOpen size={16} aria-hidden="true" />
                  </span>
                </button>
              ))
            ) : (
              <div className="knowledge-empty">
                <FileSearch size={22} />
                <strong>No documents analysed yet</strong>
                <p>Choose a source above to create an evidence-backed, reviewable summary.</p>
              </div>
            )}
          </div>
        </section>

        <section className="knowledge-panel understanding-panel">
          <header>
            <div>
              <p className="eyebrow">AI understanding</p>
              <h2>Understanding snapshot</h2>
            </div>
            {activeItem ? (
              <StatusPill tone={activeItem.status === 'Blocked' ? 'danger' : 'info'}>
                {activeItem.status}
              </StatusPill>
            ) : null}
          </header>
          {activeItem ? (
            <>
              <div className="understanding-score">
                <div>
                  <span>Confidence</span>
                  <strong>{activeItem.confidence}</strong>
                </div>
                <div>
                  <span>Evidence</span>
                  <strong>
                    {activeItem.analysis
                      ? `${activeItem.analysis.keyFacts.length} cited facts`
                      : 'Not available'}
                  </strong>
                </div>
                <div>
                  <span>Review state</span>
                  <strong>{activeItem.status}</strong>
                </div>
              </div>
              <div className="understanding-purpose">
                <span>AI believes this document is for</span>
                <strong>
                  {activeItem.analysis?.documentPurpose ??
                    activeItem.error ??
                    'Analysis is still running.'}
                </strong>
              </div>
              {activeItem.analysis ? (
                <div className="topic-list" aria-label="Understood topics">
                  {activeItem.analysis.topics.map((topic) => (
                    <span key={topic}>{topic}</span>
                  ))}
                </div>
              ) : null}
              <button
                className="button secondary"
                type="button"
                onClick={() => setDrawerOpen(true)}
                disabled={activeItem.status === 'Analysing'}
              >
                <PanelRightOpen size={15} />
                View full analysis
              </button>
            </>
          ) : (
            <div className="understanding-empty">
              <BrainCircuit size={26} />
              <strong>Evidence before confidence</strong>
              <p>
                Upload a document to see what the configured AI understood, what it can prove, and
                what still needs human clarification.
              </p>
            </div>
          )}
        </section>

        <section className="knowledge-panel knowledge-panel-wide">
          <header>
            <div>
              <p className="eyebrow">Business intelligence</p>
              <h2>Direct-entry company facts</h2>
            </div>
            <StatusPill tone="info">AI Copilot available</StatusPill>
          </header>
          <div className="copilot-intro">
            <Sparkles size={18} />
            <div>
              <strong>Write naturally. Copilot will make it operationally clear.</strong>
              <p>
                Suggestions use the field heading and neighbouring facts as context. You decide
                whether to apply them; nothing is approved or published automatically.
              </p>
            </div>
          </div>
          {copilotError ? (
            <div className="notice danger compact" role="alert">
              <AlertTriangle size={16} />
              <p>{copilotError}</p>
            </div>
          ) : null}
          <div className="business-grid">
            {businessFields.map(([label]) => (
              <div className="copilot-field" key={label}>
                <div className="copilot-field-heading">
                  <label htmlFor={`business-${label}`}>{label}</label>
                  <button
                    type="button"
                    className="icon-button copilot-enhance"
                    title={`Enhance ${label} with AI`}
                    aria-label={`Enhance ${label} with AI`}
                    disabled={enhancingField !== null}
                    onClick={() => void enhanceField(label)}
                  >
                    {enhancingField === label ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <Sparkles size={16} />
                    )}
                  </button>
                </div>
                <input
                  id={`business-${label}`}
                  value={businessFacts[label]}
                  onChange={(event) =>
                    setBusinessFacts((current) => ({ ...current, [label]: event.target.value }))
                  }
                />
                {suggestions[label] ? (
                  <div className="copilot-suggestion" role="status">
                    <span>Copilot suggestion</span>
                    <p>{suggestions[label]}</p>
                    <div className="copilot-suggestion-actions">
                      <button
                        type="button"
                        onClick={() => {
                          setBusinessFacts((current) => ({
                            ...current,
                            [label]: suggestions[label]!,
                          }));
                          setSuggestions((current) => removeSuggestion(current, label));
                        }}
                      >
                        <Check size={14} />
                        Apply
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setSuggestions((current) => removeSuggestion(current, label))
                        }
                      >
                        <X size={14} />
                        Dismiss
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
            <div className="copilot-field form-wide">
              <div className="copilot-field-heading">
                <label htmlFor="business-company-voice">Company voice</label>
                <button
                  type="button"
                  className="icon-button copilot-enhance"
                  title="Enhance Company voice with AI"
                  aria-label="Enhance Company voice with AI"
                  disabled={enhancingField !== null}
                  onClick={() => void enhanceField('Company voice')}
                >
                  {enhancingField === 'Company voice' ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : (
                    <Sparkles size={16} />
                  )}
                </button>
              </div>
              <textarea
                id="business-company-voice"
                value={businessFacts['Company voice']}
                onChange={(event) =>
                  setBusinessFacts((current) => ({
                    ...current,
                    'Company voice': event.target.value,
                  }))
                }
                rows={4}
              />
              <CopilotSuggestion
                suggestion={suggestions['Company voice']}
                onApply={(suggestion) => {
                  setBusinessFacts((current) => ({
                    ...current,
                    'Company voice': suggestion,
                  }));
                  setSuggestions((current) => removeSuggestion(current, 'Company voice'));
                }}
                onDismiss={() =>
                  setSuggestions((current) => removeSuggestion(current, 'Company voice'))
                }
              />
            </div>
            <div className="copilot-field form-wide">
              <div className="copilot-field-heading">
                <label htmlFor="business-approved-examples">Approved examples</label>
                <button
                  type="button"
                  className="icon-button copilot-enhance"
                  title="Enhance Approved examples with AI"
                  aria-label="Enhance Approved examples with AI"
                  disabled={enhancingField !== null}
                  onClick={() => void enhanceField('Approved examples')}
                >
                  {enhancingField === 'Approved examples' ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : (
                    <Sparkles size={16} />
                  )}
                </button>
              </div>
              <textarea
                id="business-approved-examples"
                value={businessFacts['Approved examples']}
                onChange={(event) =>
                  setBusinessFacts((current) => ({
                    ...current,
                    'Approved examples': event.target.value,
                  }))
                }
                rows={4}
              />
              <CopilotSuggestion
                suggestion={suggestions['Approved examples']}
                onApply={(suggestion) => {
                  setBusinessFacts((current) => ({
                    ...current,
                    'Approved examples': suggestion,
                  }));
                  setSuggestions((current) => removeSuggestion(current, 'Approved examples'));
                }}
                onDismiss={() =>
                  setSuggestions((current) => removeSuggestion(current, 'Approved examples'))
                }
              />
            </div>
          </div>
        </section>

        <section className="knowledge-panel knowledge-panel-wide">
          <header>
            <div>
              <p className="eyebrow">Call transcript loop</p>
              <h2>Knowledge gaps needing attention</h2>
            </div>
          </header>
          <div className="gap-grid">
            {knowledgeGaps.map((gap) => (
              <article key={gap.scenario}>
                <div className="gap-heading">
                  <StatusPill tone={gap.priority === 'High' ? 'danger' : 'warning'}>
                    {gap.priority}
                  </StatusPill>
                  <span>{gap.type}</span>
                </div>
                <h3>{gap.scenario}</h3>
                <p>{gap.reason}</p>
                <strong>{gap.suggestion}</strong>
                <div className="button-row">
                  <Link className="button secondary" href="/settings/knowledge/gaps">
                    Assign review
                  </Link>
                  <button
                    className="button primary"
                    type="button"
                    disabled
                    title="Draft and approval are required before publication"
                  >
                    Publish after approval
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="knowledge-panel">
          <header>
            <div>
              <p className="eyebrow">Approved local knowledge</p>
              <h2>Runtime candidates</h2>
            </div>
          </header>
          <div className="approved-list">
            {records.length > 0 ? (
              records.slice(0, 5).map((record) => (
                <article key={record.versionId ?? record.id}>
                  <strong>{record.title}</strong>
                  <span>{record.language}</span>
                  <StatusPill tone={record.state === 'ACTIVE' ? 'good' : 'warning'}>
                    {record.state ?? 'DRAFT'}
                  </StatusPill>
                </article>
              ))
            ) : (
              <p className="knowledge-copy">
                No approved records returned by the API. Create and approve local knowledge before
                enabling a provider runtime copy.
              </p>
            )}
          </div>
        </section>

        <section className="knowledge-panel simulator-surface">
          <header>
            <div>
              <p className="eyebrow">In-app test surface</p>
              <h2>Validate agent response</h2>
            </div>
            <Play size={18} />
          </header>
          <label>
            <span>Caller scenario</span>
            <textarea
              value={simulatorInput}
              onChange={(event) => setSimulatorInput(event.target.value)}
              rows={4}
            />
          </label>
          <button className="button primary" type="button" onClick={runSimulation}>
            Run simulation
          </button>
          {simulatorAnswer ? (
            <div className="simulation-answer">
              <Clock3 size={15} />
              <p>{simulatorAnswer}</p>
            </div>
          ) : null}
        </section>
      </div>

      <div className="notice success" role="status">
        <CheckCircle2 size={18} />
        <div>
          <strong>
            {latestRecord ? `Latest API record: ${latestRecord.title}` : 'Knowledge Hub ready'}
          </strong>
          <p>{message}</p>
        </div>
      </div>

      {drawerOpen && activeItem ? (
        <>
          <button
            type="button"
            className="dialog-overlay knowledge-drawer-overlay"
            aria-label="Close document analysis"
            onClick={() => setDrawerOpen(false)}
          />
          <aside
            className="drawer-content knowledge-analysis-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="knowledge-analysis-title"
          >
            <header className="drawer-header">
              <div>
                <p className="eyebrow">AI document understanding</p>
                <h2 id="knowledge-analysis-title">{activeItem.title}</h2>
                <p>
                  {activeItem.kind} · {activeItem.category}
                </p>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Close document analysis"
                title="Close"
                onClick={() => setDrawerOpen(false)}
              >
                <X size={18} />
              </button>
            </header>
            <div className="drawer-body knowledge-analysis-body">
              {activeItem.analysis ? (
                <>
                  <div className="analysis-verdict">
                    <div>
                      <span>Confidence</span>
                      <strong>{activeItem.analysis.confidence}</strong>
                    </div>
                    <div>
                      <span>Evidence-backed facts</span>
                      <strong>{activeItem.analysis.keyFacts.length}</strong>
                    </div>
                    <div>
                      <span>Uncertainties</span>
                      <strong>{activeItem.analysis.ambiguities.length}</strong>
                    </div>
                  </div>

                  <section>
                    <h3>Document purpose</h3>
                    <p>{activeItem.analysis.documentPurpose}</p>
                  </section>
                  <section>
                    <h3>Detailed summary</h3>
                    <p>{activeItem.analysis.detailedSummary}</p>
                  </section>
                  <section>
                    <h3>Proof of understanding</h3>
                    <div className="evidence-fact-list">
                      {activeItem.analysis.keyFacts.map((fact) => (
                        <article key={`${fact.fact}-${fact.evidenceQuote}`}>
                          <CheckCircle2 size={16} />
                          <div>
                            <strong>{fact.fact}</strong>
                            <blockquote>“{fact.evidenceQuote}”</blockquote>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                  <section>
                    <h3>Knowledge contribution</h3>
                    <p>{activeItem.analysis.knowledgeContribution}</p>
                  </section>
                  <section>
                    <h3>Needs human clarification</h3>
                    {activeItem.analysis.ambiguities.length > 0 ? (
                      <ul>
                        {activeItem.analysis.ambiguities.map((ambiguity) => (
                          <li key={ambiguity}>{ambiguity}</li>
                        ))}
                      </ul>
                    ) : (
                      <p>No ambiguity was identified, but human review is still required.</p>
                    )}
                  </section>
                </>
              ) : (
                <div className="knowledge-analysis-blocked">
                  {activeItem.status === 'Analysing' ? (
                    <LoaderCircle className="spin" size={22} />
                  ) : (
                    <AlertTriangle size={22} />
                  )}
                  <h3>
                    {activeItem.status === 'Analysing'
                      ? 'Analysis in progress'
                      : 'Analysis blocked'}
                  </h3>
                  <p>{activeItem.summary}</p>
                </div>
              )}
              <div className="analysis-governance">
                <ShieldCheck size={17} />
                <p>
                  This is a routed AI draft, not approved knowledge. Evidence quotes are checked
                  against extracted source text before they are shown.
                </p>
              </div>
              <Link className="button primary" href="/settings/knowledge/review">
                <Search size={15} />
                Open review queue
              </Link>
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}
