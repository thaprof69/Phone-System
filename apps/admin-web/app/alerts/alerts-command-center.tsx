'use client';

import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  BellRing,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  ExternalLink,
  Filter,
  Mail,
  MessageCircle,
  Plus,
  Radio,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { humaniseState } from '@quantum-parks/ui';
import type { AttentionItem } from '../../lib/types';

export type CommunicationsReadiness = {
  generatedAt: string;
  gmail: {
    provider: 'GMAIL';
    status: string;
    sender: string | null;
    auth: string;
    requiredScopes: string[];
    supports: readonly string[];
  };
  whatsapp: {
    provider: 'WHATSAPP_CLOUD';
    status: string;
    phoneNumberId: string | null;
    businessAccountId: string | null;
    auth: string;
    supports: readonly string[];
  };
  inboundFoundation: Record<string, { status: string; boundary: string }>;
  policy: {
    defaultMode: string;
    automaticRepliesEnabled: boolean;
    bookingWritesEnabled: boolean;
    approvedWhatsAppTemplatesRequired: boolean;
  };
};

type Rule = {
  id: string;
  name: string;
  trigger: string;
  severity: 'critical' | 'high' | 'medium';
  channels: Array<'Email' | 'WhatsApp'>;
  target: string;
  after: string;
  enabled: boolean;
  approval: boolean;
};

const INITIAL_RULES: Rule[] = [
  {
    id: 'sla',
    name: 'SLA breach or imminent breach',
    trigger: 'Callback, staff task or handoff reaches 80% of its SLA',
    severity: 'critical',
    channels: ['Email', 'WhatsApp'],
    target: 'Duty manager',
    after: 'Immediate · repeat after 15 min',
    enabled: true,
    approval: false,
  },
  {
    id: 'booking',
    name: 'Booking needs a person',
    trigger: 'Capacity, payment, exception or protected detail requires approval',
    severity: 'high',
    channels: ['Email'],
    target: 'Bookings team',
    after: 'Immediate',
    enabled: true,
    approval: true,
  },
  {
    id: 'callback',
    name: 'Callback overdue',
    trigger: 'Promised callback passes its due time without completion',
    severity: 'high',
    channels: ['Email', 'WhatsApp'],
    target: 'Park operations',
    after: 'At due time · escalate after 30 min',
    enabled: true,
    approval: false,
  },
  {
    id: 'knowledge',
    name: 'Repeated low-confidence answer',
    trigger: 'Same unresolved scenario appears 3 times within 24 hours',
    severity: 'medium',
    channels: ['Email'],
    target: 'Knowledge owners',
    after: 'Digest every 2 hours',
    enabled: true,
    approval: true,
  },
  {
    id: 'provider',
    name: 'Runtime or publication failure',
    trigger: 'Provider drift, failed release, delivery failure or processing outage',
    severity: 'critical',
    channels: ['Email', 'WhatsApp'],
    target: 'Platform on-call',
    after: 'Immediate · repeat after 10 min',
    enabled: true,
    approval: false,
  },
];

const DELIVERY_FIXTURES = [
  {
    id: 'd1',
    event: 'Callback overdue',
    recipient: 'Park operations',
    channel: 'Email',
    state: 'Blocked',
    when: 'Awaiting Gmail connection',
  },
  {
    id: 'd2',
    event: 'Knowledge failed to publish',
    recipient: 'Platform on-call',
    channel: 'WhatsApp',
    state: 'Blocked',
    when: 'Awaiting approved template',
  },
  {
    id: 'd3',
    event: 'SLA risk digest',
    recipient: 'Duty manager',
    channel: 'In-app',
    state: 'Delivered',
    when: 'Today, 16:30',
  },
];

function severityRank(value: string) {
  return value === 'critical' ? 0 : value === 'high' ? 1 : 2;
}

export function AlertsCommandCenter({
  generatedAt,
  initialAttention,
  communications,
}: {
  generatedAt: string;
  initialAttention: AttentionItem[];
  communications: CommunicationsReadiness;
}) {
  const [view, setView] = useState<'queue' | 'rules' | 'history'>('queue');
  const [rules, setRules] = useState(INITIAL_RULES);
  const [query, setQuery] = useState('');
  const [severity, setSeverity] = useState('all');
  const [selected, setSelected] = useState<AttentionItem | null>(initialAttention[0] ?? null);
  const [acknowledged, setAcknowledged] = useState<string[]>([]);
  const [drafting, setDrafting] = useState<'EMAIL' | 'WHATSAPP' | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [editingRule, setEditingRule] = useState<Rule | 'new' | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem('qp-alert-rules');
    if (saved) {
      try {
        setRules(JSON.parse(saved) as Rule[]);
      } catch {
        window.localStorage.removeItem('qp-alert-rules');
      }
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem('qp-alert-rules', JSON.stringify(rules));
  }, [rules]);

  const filtered = useMemo(
    () =>
      initialAttention
        .filter((item) => severity === 'all' || item.severity === severity)
        .filter((item) =>
          `${item.title} ${item.detail}`.toLowerCase().includes(query.toLowerCase()),
        )
        .sort((a, b) => severityRank(a.severity) - severityRank(b.severity)),
    [initialAttention, query, severity],
  );
  const critical = initialAttention.filter((item) => item.severity === 'critical');
  const affected = initialAttention.reduce((sum, item) => sum + item.count, 0);
  const connected = [communications.gmail, communications.whatsapp].filter(
    (channel) => channel.status === 'CONFIGURED',
  ).length;

  async function createDraft(channel: 'EMAIL' | 'WHATSAPP') {
    if (!selected) return;
    setDrafting(channel);
    setDraft(null);
    setDraftError(null);
    try {
      const response = await fetch('/api/admin/communications/draft-alert', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: selected.title,
          detail: selected.detail,
          severity: selected.severity,
          affectedRecords: selected.count,
          sourceHref: selected.href,
          channel,
        }),
      });
      const result = (await response.json()) as {
        status?: string;
        text?: string;
        detail?: string;
        message?: string;
      };
      if (!response.ok || result.status !== 'DRAFTED')
        setDraftError(
          result.detail ?? result.message ?? 'The routed AI model could not draft this alert.',
        );
      else setDraft(result.text ?? '');
    } catch {
      setDraftError('The alert drafting service is unavailable.');
    } finally {
      setDrafting(null);
    }
  }

  return (
    <section className="alert-command">
      <div className="alert-signal-strip" aria-label="Alert health summary">
        <button
          className="alert-signal-button"
          onClick={() => {
            setView('queue');
            setSeverity('critical');
          }}
        >
          <span className="alert-signal-icon danger">
            <CircleAlert size={18} />
          </span>
          <div>
            <small>Critical signals</small>
            <strong>{critical.length}</strong>
            <span>{critical.reduce((sum, item) => sum + item.count, 0)} records at risk</span>
          </div>
        </button>
        <button
          className="alert-signal-button"
          onClick={() => {
            setView('queue');
            setSeverity('all');
          }}
        >
          <span className="alert-signal-icon warning">
            <Clock3 size={18} />
          </span>
          <div>
            <small>Needs attention</small>
            <strong>{affected}</strong>
            <span>Across {initialAttention.length} live conditions</span>
          </div>
        </button>
        <button className="alert-signal-button" onClick={() => setView('rules')}>
          <span className="alert-signal-icon good">
            <ShieldCheck size={18} />
          </span>
          <div>
            <small>Rules armed</small>
            <strong>{rules.filter((rule) => rule.enabled).length}</strong>
            <span>{rules.filter((rule) => rule.approval).length} require approval</span>
          </div>
        </button>
        <Link className="alert-signal-button" href="/settings/communications">
          <span className="alert-signal-icon info">
            <Radio size={18} />
          </span>
          <div>
            <small>External channels</small>
            <strong>{connected}/2</strong>
            <span>{connected ? 'At least one ready' : 'In-app only until connected'}</span>
          </div>
        </Link>
      </div>

      <div className="alert-workbench">
        <div className="alert-workbench-head">
          <div className="alert-tabs" role="tablist" aria-label="Alert workspace">
            {(
              [
                ['queue', 'Attention queue', BellRing],
                ['rules', 'Rules', Settings2],
                ['history', 'Delivery history', Activity],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                className={view === key ? 'active' : ''}
                onClick={() => setView(key)}
              >
                <Icon size={16} /> {label}
              </button>
            ))}
          </div>
          <span className="alert-freshness">
            Live projection · {new Date(generatedAt).toISOString().slice(11, 16)} UTC
          </span>
        </div>

        {view === 'queue' && (
          <div className="alert-queue-layout">
            <div className="alert-list-pane">
              <div className="alert-filterbar">
                <label>
                  <Search size={15} />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search attention signals"
                  />
                </label>
                <label>
                  <Filter size={15} />
                  <select value={severity} onChange={(event) => setSeverity(event.target.value)}>
                    <option value="all">All severity</option>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                  </select>
                </label>
              </div>
              <div className="alert-list">
                {filtered.map((item) => {
                  const done = acknowledged.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      className={`alert-row ${selected?.id === item.id ? 'selected' : ''}`}
                      onClick={() => {
                        setSelected(item);
                        setDraft(null);
                        setDraftError(null);
                      }}
                    >
                      <span className={`alert-severity-dot ${item.severity}`} />
                      <span className="alert-row-copy">
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                        <small>{humaniseState(item.severity)} · live source</small>
                      </span>
                      <span className="alert-row-count">{item.count}</span>
                      {done && <Check size={16} className="alert-ack" />}
                      <ChevronRight size={16} />
                    </button>
                  );
                })}
              </div>
            </div>
            <aside className="alert-detail-pane">
              {selected ? (
                <>
                  <div className="alert-detail-title">
                    <span className={`alert-severity-icon ${selected.severity}`}>
                      <AlertTriangle size={19} />
                    </span>
                    <div>
                      <small>
                        {humaniseState(selected.severity)} · {selected.count} affected
                      </small>
                      <h2>{selected.title}</h2>
                    </div>
                  </div>
                  <p>{selected.detail}</p>
                  <div className="alert-evidence">
                    <span>
                      <Activity size={15} /> Detection source
                    </span>
                    <strong>Canonical operational projection</strong>
                    <small>
                      Derived from current callbacks, tasks, releases, provider sync and processing
                      evidence.
                    </small>
                  </div>
                  <div className="alert-next-action">
                    <span>
                      <Users size={15} /> Recommended owner
                    </span>
                    <strong>
                      {selected.severity === 'critical'
                        ? 'Duty manager + platform on-call'
                        : 'Assigned operations owner'}
                    </strong>
                    <small>
                      Acknowledge now, inspect the source records, then resolve at the system of
                      record.
                    </small>
                  </div>
                  <div className="alert-actions">
                    <button
                      className="button primary small"
                      onClick={() =>
                        setAcknowledged((items) =>
                          items.includes(selected.id) ? items : [...items, selected.id],
                        )
                      }
                    >
                      <CheckCircle2 size={15} /> Acknowledge
                    </button>
                    <Link className="button secondary small" href={selected.href}>
                      Open source <ExternalLink size={14} />
                    </Link>
                  </div>
                  <div className="alert-copilot">
                    <div>
                      <Sparkles size={17} />
                      <span>
                        <strong>AI alert copilot</strong>
                        <small>
                          Uses the routed Email & Alerts model. Drafts require human approval.
                        </small>
                      </span>
                    </div>
                    <div className="alert-copilot-actions">
                      <button onClick={() => createDraft('EMAIL')} disabled={Boolean(drafting)}>
                        <Mail size={14} /> {drafting === 'EMAIL' ? 'Drafting…' : 'Draft email'}
                      </button>
                      <button onClick={() => createDraft('WHATSAPP')} disabled={Boolean(drafting)}>
                        <MessageCircle size={14} />{' '}
                        {drafting === 'WHATSAPP' ? 'Drafting…' : 'Draft WhatsApp'}
                      </button>
                    </div>
                    {draft && (
                      <div className="alert-draft">
                        <span>Approval draft</span>
                        <p>{draft}</p>
                        <button
                          disabled
                          title="External sending is disabled until the channel and recipient policy are configured"
                        >
                          Approve & send
                        </button>
                      </div>
                    )}
                    {draftError && (
                      <div className="alert-draft-error">
                        <CircleAlert size={15} /> {draftError}{' '}
                        <Link href="/settings/ai-providers/routing">Configure model route</Link>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <p>No alert selected.</p>
              )}
            </aside>
          </div>
        )}

        {view === 'rules' && (
          <div className="alert-rules-view">
            <div className="alert-section-intro">
              <div>
                <small>Routing policy</small>
                <h2>What creates an alert</h2>
                <p>
                  Every rule has an accountable audience, escalation clock and explicit approval
                  boundary.
                </p>
              </div>
              <div className="alert-actions">
                <button className="button secondary small" onClick={() => setPolicyOpen(true)}>
                  <Settings2 size={15} /> Policy settings
                </button>
                <button className="button primary small" onClick={() => setEditingRule('new')}>
                  <Plus size={15} /> New alert rule
                </button>
              </div>
            </div>
            <div className="alert-rule-list">
              {rules.map((rule) => (
                <article key={rule.id} className={!rule.enabled ? 'disabled' : ''}>
                  <button
                    className={`alert-toggle ${rule.enabled ? 'on' : ''}`}
                    onClick={() =>
                      setRules((items) =>
                        items.map((item) =>
                          item.id === rule.id ? { ...item, enabled: !item.enabled } : item,
                        ),
                      )
                    }
                    aria-pressed={rule.enabled}
                  >
                    <span />
                  </button>
                  <div className="alert-rule-main">
                    <span className={`alert-severity-dot ${rule.severity}`} />
                    <div>
                      <strong>{rule.name}</strong>
                      <span>{rule.trigger}</span>
                    </div>
                  </div>
                  <div>
                    <small>Notify</small>
                    <strong>{rule.target}</strong>
                    <span>{rule.channels.join(' + ')}</span>
                  </div>
                  <div>
                    <small>Escalation</small>
                    <strong>{rule.after}</strong>
                    <span>
                      {rule.approval ? 'Human approval required' : 'Policy-authorised alert'}
                    </span>
                  </div>
                  <button
                    className="icon-button"
                    title={`Edit ${rule.name}`}
                    onClick={() => setEditingRule(rule)}
                  >
                    <ChevronRight size={18} />
                  </button>
                </article>
              ))}
            </div>
          </div>
        )}

        {view === 'history' && (
          <div className="alert-history-view">
            <div className="alert-section-intro">
              <div>
                <small>Audit evidence</small>
                <h2>Delivery history</h2>
                <p>
                  Accepted by a provider is not the same as delivered. Every state remains visible.
                </p>
              </div>
            </div>
            <div className="alert-history-table" role="table">
              <div role="row">
                <span>Alert</span>
                <span>Recipient</span>
                <span>Channel</span>
                <span>Status</span>
                <span>When</span>
              </div>
              {DELIVERY_FIXTURES.map((entry) => (
                <div role="row" key={entry.id}>
                  <strong>{entry.event}</strong>
                  <span>{entry.recipient}</span>
                  <span>{entry.channel}</span>
                  <span className={`alert-history-status ${entry.state.toLowerCase()}`}>
                    {entry.state}
                  </span>
                  <span>{entry.when}</span>
                </div>
              ))}
            </div>
            <div className="alert-honesty">
              <CircleAlert size={17} />
              <div>
                <strong>External delivery is not yet active</strong>
                <span>
                  Blocked rows are readiness evidence, not simulated provider sends. In-app
                  acknowledgement remains available.
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
      {editingRule && (
        <RuleEditor
          rule={editingRule === 'new' ? null : editingRule}
          onClose={() => setEditingRule(null)}
          onSave={(rule) => {
            setRules((items) => {
              const exists = items.some((item) => item.id === rule.id);
              return exists
                ? items.map((item) => (item.id === rule.id ? rule : item))
                : [rule, ...items];
            });
            setEditingRule(null);
          }}
          {...(editingRule === 'new'
            ? {}
            : {
                onDelete: () => {
                  setRules((items) => items.filter((item) => item.id !== editingRule.id));
                  setEditingRule(null);
                },
              })}
        />
      )}
      {policyOpen && <PolicySettings onClose={() => setPolicyOpen(false)} />}
    </section>
  );
}

function RuleEditor({
  rule,
  onClose,
  onSave,
  onDelete,
}: {
  rule: Rule | null;
  onClose: () => void;
  onSave: (rule: Rule) => void;
  onDelete?: () => void;
}) {
  const [value, setValue] = useState<Rule>(
    rule ?? {
      id: `rule-${Date.now()}`,
      name: '',
      trigger: '',
      severity: 'high',
      channels: ['Email'],
      target: '',
      after: 'Immediate',
      enabled: true,
      approval: true,
    },
  );
  return (
    <div className="alert-modal-backdrop" role="presentation">
      <section
        className="alert-modal"
        role="dialog"
        aria-modal="true"
        aria-label={rule ? 'Edit alert rule' : 'Create alert rule'}
      >
        <header>
          <div>
            <small>Alert policy</small>
            <h2>{rule ? 'Edit alert rule' : 'Create alert rule'}</h2>
          </div>
          <button className="icon-button" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </header>
        <div className="alert-form-grid">
          <label className="wide">
            Rule name
            <input
              value={value.name}
              onChange={(e) => setValue({ ...value, name: e.target.value })}
              placeholder="e.g. VIP complaint needs approval"
            />
          </label>
          <label className="wide">
            Trigger condition
            <textarea
              value={value.trigger}
              onChange={(e) => setValue({ ...value, trigger: e.target.value })}
            />
          </label>
          <label>
            Severity
            <select
              value={value.severity}
              onChange={(e) => setValue({ ...value, severity: e.target.value as Rule['severity'] })}
            >
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
            </select>
          </label>
          <label>
            Owner / audience
            <input
              value={value.target}
              onChange={(e) => setValue({ ...value, target: e.target.value })}
            />
          </label>
          <label className="wide">
            Escalation timing
            <input
              value={value.after}
              onChange={(e) => setValue({ ...value, after: e.target.value })}
            />
          </label>
          <fieldset>
            <legend>Channels</legend>
            {(['Email', 'WhatsApp'] as const).map((channel) => (
              <label key={channel}>
                <input
                  type="checkbox"
                  checked={value.channels.includes(channel)}
                  onChange={(e) =>
                    setValue({
                      ...value,
                      channels: e.target.checked
                        ? [...value.channels, channel]
                        : value.channels.filter((item) => item !== channel),
                    })
                  }
                />{' '}
                {channel}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Controls</legend>
            <label>
              <input
                type="checkbox"
                checked={value.approval}
                onChange={(e) => setValue({ ...value, approval: e.target.checked })}
              />{' '}
              Human approval required
            </label>
            <label>
              <input
                type="checkbox"
                checked={value.enabled}
                onChange={(e) => setValue({ ...value, enabled: e.target.checked })}
              />{' '}
              Rule enabled
            </label>
          </fieldset>
        </div>
        <footer>
          {onDelete ? (
            <button className="button danger small" onClick={onDelete}>
              Delete rule
            </button>
          ) : (
            <span />
          )}
          <div>
            <button className="button secondary small" onClick={onClose}>
              Cancel
            </button>
            <button
              className="button primary small"
              disabled={!value.name.trim() || !value.trigger.trim() || !value.target.trim()}
              onClick={() => onSave(value)}
            >
              Save rule
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function PolicySettings({ onClose }: { onClose: () => void }) {
  const [saved, setSaved] = useState(false);
  return (
    <div className="alert-modal-backdrop">
      <section
        className="alert-modal policy"
        role="dialog"
        aria-modal="true"
        aria-label="Policy settings"
      >
        <header>
          <div>
            <small>Global controls</small>
            <h2>Alert policy settings</h2>
          </div>
          <button className="icon-button" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </header>
        <div className="alert-form-grid">
          <label>
            Default acknowledgement SLA
            <select defaultValue="15">
              <option value="5">5 minutes</option>
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
            </select>
          </label>
          <label>
            Repeat unresolved alerts
            <select defaultValue="30">
              <option value="15">Every 15 minutes</option>
              <option value="30">Every 30 minutes</option>
              <option value="60">Every hour</option>
            </select>
          </label>
          <label>
            Quiet hours start
            <input type="time" defaultValue="22:00" />
          </label>
          <label>
            Quiet hours end
            <input type="time" defaultValue="07:00" />
          </label>
          <label className="wide">
            Critical escalation audience
            <input defaultValue="Duty manager, Platform on-call" />
          </label>
          <fieldset className="wide">
            <legend>Safety controls</legend>
            <label>
              <input type="checkbox" defaultChecked /> Critical alerts bypass quiet hours
            </label>
            <label>
              <input type="checkbox" defaultChecked /> Require a resolution note
            </label>
            <label>
              <input type="checkbox" defaultChecked /> Record all delivery attempts in audit history
            </label>
          </fieldset>
        </div>
        <footer>
          <span>{saved ? 'Policy settings saved' : ''}</span>
          <div>
            <button className="button secondary small" onClick={onClose}>
              Cancel
            </button>
            <button className="button primary small" onClick={() => setSaved(true)}>
              Save policy
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
