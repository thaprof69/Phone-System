'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock3,
  PhoneCall,
  RefreshCcw,
  ShieldAlert,
} from 'lucide-react';
import { useCallback, useEffect, useState, type ComponentType } from 'react';

export type CallsMissionMetric = {
  id: 'sla' | 'failed' | 'callbacks' | 'review' | 'sensitive';
  label: string;
  value: string;
  detail: string;
  tone: 'danger' | 'warning' | 'good' | 'neutral';
  href: string;
};

export type CallsAttentionSignal = {
  id: string;
  title: string;
  detail: string;
  action: string;
  count: number;
  severity: 'critical' | 'high' | 'medium' | 'clear';
  href: string;
  evidenceCallIds: string[];
};

type CopilotState = 'loading' | 'routed' | 'unavailable' | 'clear';

const ICONS: Record<CallsMissionMetric['id'], ComponentType<{ size?: number }>> = {
  sla: Clock3,
  failed: AlertTriangle,
  callbacks: PhoneCall,
  review: Bot,
  sensitive: ShieldAlert,
};

export function CallsMissionControl({
  metrics,
  signals,
  cohort,
  generatedAt,
  aiEvidenceAvailable,
}: {
  metrics: CallsMissionMetric[];
  signals: CallsAttentionSignal[];
  cohort: {
    calls: number;
    completed: number;
    contained: number;
    unresolved: number;
    negative: number;
    averageDurationSeconds: number;
  };
  generatedAt: string;
  aiEvidenceAvailable: boolean;
}) {
  const strongest = signals[0];
  const [state, setState] = useState<CopilotState>(
    signals.length === 0 ? 'clear' : aiEvidenceAvailable ? 'loading' : 'unavailable',
  );
  const [answer, setAnswer] = useState(
    signals.length === 0
      ? 'No urgent operational signal is present. Keep monitoring new calls and upcoming commitments.'
      : aiEvidenceAvailable
        ? ''
        : strongest
          ? `${strongest.title} is the strongest current signal. ${strongest.action}`
          : 'There is not enough current evidence to recommend a priority.',
  );
  const [citedSignalIds, setCitedSignalIds] = useState<string[]>([]);

  const requestAdvice = useCallback(async () => {
    if (signals.length === 0 || !aiEvidenceAvailable) return;
    setState('loading');
    try {
      const response = await fetch('/api/admin/reports/copilot/advice', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          question: 'What should the calls team deal with first right now?',
          cohort: {
            period: 'Current inventory',
            calls: cohort.calls,
            completed: cohort.completed,
            contained: cohort.contained,
            unresolved: cohort.unresolved,
            negative: cohort.negative,
            averageDurationSeconds: cohort.averageDurationSeconds,
          },
          signals: signals.map((signal) => ({
            id: signal.id,
            label: `${signal.title}: ${signal.detail}. Recommended action: ${signal.action}`,
            evidenceCallIds: signal.evidenceCallIds.slice(0, 25),
          })),
        }),
      });
      const payload = (await response.json()) as {
        answer?: string;
        citedSignalIds?: string[];
        message?: string;
      };
      if (!response.ok || !payload.answer) throw new Error(payload.message ?? 'Unavailable');
      setAnswer(payload.answer);
      setCitedSignalIds(payload.citedSignalIds ?? []);
      setState('routed');
    } catch {
      setAnswer(
        strongest
          ? `${strongest.title} is the strongest current signal. ${strongest.action}`
          : 'There is not enough current evidence to recommend a priority.',
      );
      setCitedSignalIds(strongest ? [strongest.id] : []);
      setState('unavailable');
    }
  }, [aiEvidenceAvailable, cohort, signals, strongest]);

  useEffect(() => {
    void requestAdvice();
  }, [requestAdvice]);

  const citedSignals = citedSignalIds.flatMap((id) => {
    const signal = signals.find((candidate) => candidate.id === id);
    return signal ? [signal] : [];
  });

  return (
    <section className="calls-command" aria-labelledby="calls-command-title">
      <div className="calls-command-heading">
        <div>
          <p className="eyebrow">Live operations</p>
          <h2 id="calls-command-title">Calls mission control</h2>
          <p>Commitments, failures, and calls that need a person, updated from live records.</p>
        </div>
        <span className="calls-command-updated">
          Updated{' '}
          {new Intl.DateTimeFormat('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
          }).format(new Date(generatedAt))}
        </span>
      </div>

      <div className="calls-command-metrics" aria-label="Calls operational indicators">
        {metrics.map((metric) => {
          const Icon = ICONS[metric.id];
          return (
            <Link
              className={`calls-command-metric tone-${metric.tone}`}
              href={metric.href}
              key={metric.id}
              aria-label={`${metric.label}: ${metric.value}. ${metric.detail}`}
            >
              <span className="calls-command-metric-icon" aria-hidden="true">
                <Icon size={17} />
              </span>
              <span>
                <small>{metric.label}</small>
                <strong>{metric.value}</strong>
                <em>{metric.detail}</em>
              </span>
              <ArrowRight className="calls-command-arrow" size={16} aria-hidden="true" />
            </Link>
          );
        })}
      </div>

      <div className="calls-command-briefing">
        <div className="calls-priority">
          <div className="calls-briefing-heading">
            <div>
              <p className="eyebrow">Priority queue</p>
              <h3>What needs attention</h3>
            </div>
            <span>{signals.length} signals</span>
          </div>
          {signals.length === 0 ? (
            <div className="calls-all-clear">
              <CheckCircle2 size={19} aria-hidden="true" />
              <span>
                <strong>No urgent signals</strong>
                <small>There are no failed calls, SLA breaches, or open follow-ups.</small>
              </span>
            </div>
          ) : (
            <ol className="calls-priority-list">
              {signals.slice(0, 4).map((signal, index) => (
                <li key={signal.id}>
                  <Link href={signal.href}>
                    <span className={`calls-priority-rank severity-${signal.severity}`}>
                      {index + 1}
                    </span>
                    <span className="calls-priority-copy">
                      <strong>{signal.title}</strong>
                      <small>{signal.detail}</small>
                    </span>
                    <span className="calls-priority-count">{signal.count}</span>
                    <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </div>

        <aside className="calls-copilot" aria-labelledby="calls-copilot-title">
          <div className="calls-briefing-heading">
            <div>
              <p className="eyebrow">AI Copilot</p>
              <h3 id="calls-copilot-title">Operator advisory</h3>
            </div>
            <button
              className="icon-button"
              type="button"
              onClick={() => void requestAdvice()}
              disabled={state === 'loading' || signals.length === 0 || !aiEvidenceAvailable}
              aria-label="Refresh AI Copilot advisory"
              title="Refresh advisory"
            >
              <RefreshCcw size={16} aria-hidden="true" />
            </button>
          </div>
          <div className="calls-copilot-status" aria-live="polite">
            <span className={`copilot-route-state state-${state}`}>
              {state === 'loading'
                ? 'Analysing'
                : state === 'routed'
                  ? 'AI routed'
                  : state === 'unavailable'
                    ? aiEvidenceAvailable
                      ? 'AI unavailable'
                      : 'Evidence unavailable'
                    : 'All clear'}
            </span>
            <p>
              {state === 'loading'
                ? 'Reviewing the current call inventory and operational signals...'
                : answer}
            </p>
          </div>
          {citedSignals.length > 0 ? (
            <div className="calls-copilot-evidence">
              <span>Evidence</span>
              {citedSignals.map((signal) => (
                <Link href={signal.href} key={signal.id}>
                  {signal.title}
                  <ArrowRight size={13} aria-hidden="true" />
                </Link>
              ))}
            </div>
          ) : null}
          <p className="calls-copilot-note">
            {aiEvidenceAvailable
              ? 'Advisory only. Opening a signal shows the records behind it; no action is taken automatically.'
              : 'The governed intelligence cohort could not be loaded, so this is local signal guidance only.'}
          </p>
        </aside>
      </div>
    </section>
  );
}
