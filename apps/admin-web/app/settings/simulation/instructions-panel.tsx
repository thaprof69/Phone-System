'use client';

import { useState } from 'react';
import { Button, Panel, formatDateTime } from '@quantum-parks/ui';

/**
 * Ported from Quantum Park Lite's `phone-instructions.tsx` — same copy button, show/hide
 * source-inputs toggle, and `<pre>` block. The source generated this text from a thin,
 * hard-coded string builder; here it comes from `composeRuntimePrompt()`, the same function
 * the real agent-publish path uses to build what is actually sent to ElevenLabs.
 */
export function InstructionsPanel({
  instructions,
  sources,
  generatedAt,
  configurationVersion,
}: {
  instructions: string;
  sources: string[];
  generatedAt: string;
  configurationVersion: number;
}) {
  const [copied, setCopied] = useState(false);
  const [showSources, setShowSources] = useState(false);

  async function copyInstructions() {
    await navigator.clipboard?.writeText(instructions);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <Panel
      title="Generated ElevenLabs Agent Instructions"
      description="Copy this into ElevenLabs so Quantum Parks stays the source of memory, policies, booking rules, and escalation decisions."
      action={
        <div className="integration-actions">
          <Button variant="secondary" onClick={() => setShowSources((value) => !value)}>
            {showSources ? 'Hide source inputs' : 'View source inputs'}
          </Button>
          <Button variant="primary" onClick={() => void copyInstructions()}>
            {copied ? 'Copied' : 'Copy instructions'}
          </Button>
        </div>
      }
    >
      <p className="cell-sub">
        Generated {formatDateTime(generatedAt)} from configuration version {configurationVersion}.
      </p>
      <pre className="instructions-preview">{instructions}</pre>
      {showSources ? (
        <div>
          <p className="cell-sub">Source inputs</p>
          <ul className="blocker-list">
            {sources.map((source) => (
              <li key={source}>{source}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </Panel>
  );
}
