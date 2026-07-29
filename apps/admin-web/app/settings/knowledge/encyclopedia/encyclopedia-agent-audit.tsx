'use client';

import { useCallback, useState } from 'react';
import { BrainCircuit, CheckCircle2, FileStack, ShieldCheck } from 'lucide-react';
import { StatusPill, formatDateTime, formatNumber } from '@quantum-parks/ui';
import { ChatTestConsole, type ProviderReadinessSummary } from '../../../chat/chat-test-console';
import { ENCYCLOPEDIA_AUDIT_MARKER, ENCYCLOPEDIA_AUDIT_PROMPT } from './agent-audit-config';

export function EncyclopediaAgentAudit({
  agentVersionId,
  readiness,
  loadError,
  initialSummary,
  initialSummaryAt,
  sourceCount,
  runtimeReadyCount,
  cultureSignals,
  procedureSignals,
}: {
  agentVersionId: string | null;
  readiness: ProviderReadinessSummary | null;
  loadError: string | null;
  initialSummary: string | null;
  initialSummaryAt: string | null;
  sourceCount: number;
  runtimeReadyCount: number;
  cultureSignals: number;
  procedureSignals: number;
}) {
  const [summary, setSummary] = useState(initialSummary);
  const [summaryAt, setSummaryAt] = useState(initialSummaryAt);

  const captureSummary = useCallback((message: string) => {
    setSummary(message);
    setSummaryAt(new Date().toISOString());
  }, []);

  return (
    <section className="encyclopedia-agent-brief" aria-labelledby="agent-understanding-title">
      <header>
        <div>
          <p className="eyebrow">ElevenLabs agent read-back</p>
          <h2 id="agent-understanding-title">Executive understanding brief</h2>
          <p>
            The published agent’s own account of Quantum Parks, used to verify that governed
            knowledge reached the runtime and can be recalled coherently.
          </p>
        </div>
        <ChatTestConsole
          agentVersionId={agentVersionId}
          readiness={readiness}
          loadError={loadError}
          triggerLabel="Query ElevenLabs agent"
          drawerEyebrow="Published knowledge verification"
          drawerTitle="Ask the ElevenLabs agent"
          drawerDescription="Interrogate the live published agent about company knowledge, culture, procedures and operational boundaries."
          emptyTitle="Verify the agent’s business understanding"
          emptyDescription="The executive-audit prompt is ready below. Send it as supplied, edit it, or replace it with a focused knowledge question."
          defaultPrompt={ENCYCLOPEDIA_AUDIT_PROMPT}
          captureAgentResponseAfter={ENCYCLOPEDIA_AUDIT_MARKER}
          onCapturedAgentResponse={captureSummary}
        />
      </header>

      <div className="encyclopedia-agent-scope" aria-label="Understanding audit scope">
        <span>
          <FileStack size={15} aria-hidden="true" />
          <strong>{formatNumber(sourceCount)}</strong> local sources
        </span>
        <span>
          <CheckCircle2 size={15} aria-hidden="true" />
          <strong>{formatNumber(runtimeReadyCount)}</strong> runtime-ready
        </span>
        <span>
          <BrainCircuit size={15} aria-hidden="true" />
          <strong>{formatNumber(cultureSignals)}</strong> culture signals
        </span>
        <span>
          <ShieldCheck size={15} aria-hidden="true" />
          <strong>{formatNumber(procedureSignals)}</strong> SOP signals
        </span>
      </div>

      <div className="encyclopedia-agent-summary">
        {summary ? (
          <p>{summary}</p>
        ) : (
          <div className="encyclopedia-agent-empty">
            <strong>No ElevenLabs executive read-back has been captured yet.</strong>
            <p>
              Query the live agent with the prepared audit prompt. Its answer will appear here and
              remain available from the recorded verification session.
            </p>
          </div>
        )}
      </div>

      <footer>
        <StatusPill tone={summary ? 'good' : 'warning'}>
          {summary ? 'Provider response captured' : 'Provider verification required'}
        </StatusPill>
        <span>
          {summaryAt
            ? `Supplied by the live ElevenLabs agent ${formatDateTime(summaryAt)}`
            : 'Local evidence is not presented as a provider response.'}
        </span>
      </footer>
    </section>
  );
}
