'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  Banner,
  Button,
  CheckboxField,
  ErrorSummary,
  Fieldset,
  Panel,
  SelectField,
  StatusPill,
  TechnicalDetails,
  TextArea,
  TextField,
} from '@quantum-parks/ui';

/**
 * The conversation editor.
 *
 * Nothing here is authoritative. The browser holds a working copy; the platform holds
 * the record. Every save round-trips through the API, which re-validates the whole
 * configuration and re-applies the code-owned safety fragments — so a save that appears
 * to succeed here has genuinely been accepted and persisted there.
 */

export type ConversationConfiguration = {
  systemPrompt: string;
  businessInstructions: string;
  policyFragments: string[];
  firstMessage: string;
  disclosure: string;
  closingMessage: string;
  afterHours: { enabled: boolean; message: string; offerCallback: boolean };
  turnSettings: {
    silenceTimeoutMs: number;
    maximumTurnMs: number;
    maximumCallSeconds: number;
    responseDelayMs: number;
    interruptible: boolean;
  };
  defaultLanguage: string;
  languages: string[];
  tools: string[];
  transfers: unknown[];
};

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: string }
  | { kind: 'invalid'; issues: Array<{ path: string; message: string }> }
  | { kind: 'error'; message: string };

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'nl', label: 'Dutch' },
];

/** Settings this platform models but the voice runtime does not accept. */
const UNSUPPORTED_SETTINGS = [
  {
    label: 'Barge-in sensitivity',
    reason: 'The provider exposes interruption as on or off, not as a sensitivity level.',
  },
  {
    label: 'Backchannel acknowledgements',
    reason: 'Not offered by the provider runtime API.',
  },
];

/** Field id → the dotted path the server reports issues against. */
function issueFor(issues: Array<{ path: string; message: string }>, path: string) {
  return issues.find((issue) => issue.path === path)?.message;
}

export function ConversationEditor({
  versionId,
  versionNumber,
  editable,
  canEditPolicy,
  initialConfiguration,
  initialChangeReason,
}: {
  versionId: string;
  versionNumber: number;
  editable: boolean;
  canEditPolicy: boolean;
  initialConfiguration: ConversationConfiguration;
  initialChangeReason: string;
}) {
  const [configuration, setConfiguration] = useState(initialConfiguration);
  const [changeReason, setChangeReason] = useState('');
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' });

  // Compared against the configuration the server last gave us, so "unsaved changes"
  // reflects divergence from the record rather than merely that a field was focused.
  const [baseline, setBaseline] = useState(() => JSON.stringify(initialConfiguration));
  const dirty = useMemo(
    () => JSON.stringify(configuration) !== baseline,
    [configuration, baseline],
  );

  const issues = saveState.kind === 'invalid' ? saveState.issues : [];

  const update = useCallback(
    <K extends keyof ConversationConfiguration>(key: K, value: ConversationConfiguration[K]) => {
      setConfiguration((current) => ({ ...current, [key]: value }));
      setSaveState((current) => (current.kind === 'saved' ? { kind: 'idle' } : current));
    },
    [],
  );

  async function save() {
    if (!changeReason.trim() || changeReason.trim().length < 8) {
      setSaveState({
        kind: 'invalid',
        issues: [
          {
            path: 'changeReason',
            message: 'Describe why this is changing, in at least eight characters',
          },
        ],
      });
      return;
    }
    setSaveState({ kind: 'saving' });
    try {
      const response = await fetch(`/api/admin/agents/versions/${versionId}/configuration`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ configuration, changeReason: changeReason.trim() }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        status?: string;
        issues?: Array<{ path: string; message: string }>;
        message?: string;
      };

      if (response.ok && body.status === 'SAVED') {
        setBaseline(JSON.stringify(configuration));
        setChangeReason('');
        setSaveState({ kind: 'saved', at: new Date().toLocaleTimeString('en-GB') });
        return;
      }
      if (body.status === 'INVALID' && body.issues) {
        setSaveState({ kind: 'invalid', issues: body.issues });
        return;
      }
      // Anything else is reported as it came back. A failed save is never dressed up
      // as a success, and the working copy is left intact so nothing is lost.
      setSaveState({
        kind: 'error',
        message: body.message ?? `The platform rejected this change (${response.status}).`,
      });
    } catch {
      setSaveState({
        kind: 'error',
        message: 'The platform could not be reached. Nothing was saved.',
      });
    }
  }

  const busy = saveState.kind === 'saving';

  return (
    <div className="conversation-editor">
      {!editable ? (
        <Banner tone="info" title={`Version ${versionNumber} is not editable`}>
          Only a draft can be edited. This version has moved past drafting, so it is kept as an
          immutable record. Start a new draft to change the configuration.
        </Banner>
      ) : null}

      {saveState.kind === 'error' ? (
        <Banner tone="danger" title="This change was not saved">
          {saveState.message}
        </Banner>
      ) : null}

      {saveState.kind === 'saved' ? (
        <Banner tone="good" title={`Saved at ${saveState.at}`}>
          The platform accepted and stored this configuration on version {versionNumber}.
        </Banner>
      ) : null}

      {issues.length > 0 ? (
        <ErrorSummary
          title="The platform rejected this change"
          errors={issues.map((issue) => ({
            fieldId: issue.path.replaceAll('.', '-'),
            message: `${issue.path}: ${issue.message}`,
          }))}
        />
      ) : null}

      {dirty && editable ? (
        <div className="unsaved-bar" role="status">
          <span>
            <strong>Unsaved changes.</strong> Nothing reaches callers until this is saved, reviewed,
            tested and published.
          </span>
        </div>
      ) : null}

      <Panel title="What the receptionist is told to do" eyebrow="Conversation instructions">
        <TextArea
          id="systemPrompt"
          name="systemPrompt"
          label="System prompt"
          hint="The role and framing. Safety instructions are added separately and always come last."
          rows={7}
          value={configuration.systemPrompt}
          disabled={!editable || busy}
          {...(issueFor(issues, 'systemPrompt') ? { error: issueFor(issues, 'systemPrompt') } : {})}
          onChange={(event) => update('systemPrompt', event.target.value)}
        />
        <TextArea
          id="businessInstructions"
          name="businessInstructions"
          label="Business instructions"
          hint="Operational guidance that changes with the business, kept apart from the role framing."
          rows={5}
          value={configuration.businessInstructions}
          disabled={!editable || busy}
          onChange={(event) => update('businessInstructions', event.target.value)}
        />
      </Panel>

      <Panel
        title="Safety policy"
        eyebrow="Code-owned"
        description="These instructions are held in code, appended after everything above, and re-applied on every save. They are what stops the receptionist taking payment details or claiming it completed an action."
        action={
          <StatusPill tone={canEditPolicy ? 'warning' : 'good'}>
            {canEditPolicy ? 'Editable by your role' : 'Locked'}
          </StatusPill>
        }
      >
        <ol className="policy-fragments">
          {(configuration.policyFragments ?? []).map((fragment) => (
            <li key={fragment}>{fragment}</li>
          ))}
        </ol>
        {(configuration.policyFragments ?? []).length === 0 ? (
          <p className="evidence-note">
            This version predates the recorded policy list. The mandatory fragments still apply —
            the platform appends them whenever the configuration is saved or published.
          </p>
        ) : null}
        {!canEditPolicy ? (
          <p className="evidence-note">
            Your role cannot change these. A save that attempted to would be rejected by the
            platform, not merely hidden here.
          </p>
        ) : null}
      </Panel>

      <Panel title="What the caller hears" eyebrow="Scripted wording">
        <TextArea
          id="firstMessage"
          name="firstMessage"
          label="First message"
          hint="The opening line. It must make clear the caller is speaking to an automated assistant."
          rows={3}
          value={configuration.firstMessage}
          disabled={!editable || busy}
          {...(issueFor(issues, 'firstMessage') ? { error: issueFor(issues, 'firstMessage') } : {})}
          onChange={(event) => update('firstMessage', event.target.value)}
        />
        <TextArea
          id="disclosure"
          name="disclosure"
          label="Automation disclosure"
          hint="Used when a caller asks whether they are speaking to a person."
          rows={3}
          value={configuration.disclosure}
          disabled={!editable || busy}
          {...(issueFor(issues, 'disclosure') ? { error: issueFor(issues, 'disclosure') } : {})}
          onChange={(event) => update('disclosure', event.target.value)}
        />
        <TextArea
          id="closingMessage"
          name="closingMessage"
          label="Closing message"
          rows={2}
          value={configuration.closingMessage}
          disabled={!editable || busy}
          {...(issueFor(issues, 'closingMessage')
            ? { error: issueFor(issues, 'closingMessage') }
            : {})}
          onChange={(event) => update('closingMessage', event.target.value)}
        />
      </Panel>

      <Panel title="Outside opening hours" eyebrow="After-hours behaviour">
        <CheckboxField
          id="afterHoursEnabled"
          label="Answer differently outside opening hours"
          checked={configuration.afterHours.enabled}
          disabled={!editable || busy}
          onChange={(event) =>
            update('afterHours', { ...configuration.afterHours, enabled: event.target.checked })
          }
        />
        <TextArea
          id="afterHours-message"
          name="afterHoursMessage"
          label="After-hours message"
          rows={3}
          value={configuration.afterHours.message}
          disabled={!editable || busy || !configuration.afterHours.enabled}
          {...(issueFor(issues, 'afterHours.message')
            ? { error: issueFor(issues, 'afterHours.message') }
            : {})}
          onChange={(event) =>
            update('afterHours', { ...configuration.afterHours, message: event.target.value })
          }
        />
        <CheckboxField
          id="afterHoursCallback"
          label="Offer a callback for the next working day"
          checked={configuration.afterHours.offerCallback}
          disabled={!editable || busy || !configuration.afterHours.enabled}
          onChange={(event) =>
            update('afterHours', {
              ...configuration.afterHours,
              offerCallback: event.target.checked,
            })
          }
        />
      </Panel>

      <Panel
        title="Turn-taking and timeouts"
        eyebrow="Provider runtime settings"
        description="These are passed to the voice runtime. Values outside the range it accepts are rejected here rather than at publication, when a caller would already be on the line."
      >
        <Fieldset legend="Timing">
          <TextField
            id="turnSettings-silenceTimeoutMs"
            name="silenceTimeoutMs"
            label="Silence before the agent responds (ms)"
            type="number"
            hint="Between 1,000 and 30,000"
            value={String(configuration.turnSettings.silenceTimeoutMs)}
            disabled={!editable || busy}
            {...(issueFor(issues, 'turnSettings.silenceTimeoutMs')
              ? { error: issueFor(issues, 'turnSettings.silenceTimeoutMs') }
              : {})}
            onChange={(event) =>
              update('turnSettings', {
                ...configuration.turnSettings,
                silenceTimeoutMs: Number(event.target.value),
              })
            }
          />
          <TextField
            id="turnSettings-maximumTurnMs"
            name="maximumTurnMs"
            label="Maximum turn length (ms)"
            type="number"
            hint="Between 5,000 and 120,000, and greater than the silence timeout"
            value={String(configuration.turnSettings.maximumTurnMs)}
            disabled={!editable || busy}
            {...(issueFor(issues, 'turnSettings.maximumTurnMs')
              ? { error: issueFor(issues, 'turnSettings.maximumTurnMs') }
              : {})}
            onChange={(event) =>
              update('turnSettings', {
                ...configuration.turnSettings,
                maximumTurnMs: Number(event.target.value),
              })
            }
          />
          <TextField
            id="turnSettings-maximumCallSeconds"
            name="maximumCallSeconds"
            label="Maximum call length (seconds)"
            type="number"
            hint="Between 60 and 3,600"
            value={String(configuration.turnSettings.maximumCallSeconds)}
            disabled={!editable || busy}
            {...(issueFor(issues, 'turnSettings.maximumCallSeconds')
              ? { error: issueFor(issues, 'turnSettings.maximumCallSeconds') }
              : {})}
            onChange={(event) =>
              update('turnSettings', {
                ...configuration.turnSettings,
                maximumCallSeconds: Number(event.target.value),
              })
            }
          />
          <TextField
            id="turnSettings-responseDelayMs"
            name="responseDelayMs"
            label="Response delay (ms)"
            type="number"
            hint="Between 0 and 3,000"
            value={String(configuration.turnSettings.responseDelayMs)}
            disabled={!editable || busy}
            {...(issueFor(issues, 'turnSettings.responseDelayMs')
              ? { error: issueFor(issues, 'turnSettings.responseDelayMs') }
              : {})}
            onChange={(event) =>
              update('turnSettings', {
                ...configuration.turnSettings,
                responseDelayMs: Number(event.target.value),
              })
            }
          />
        </Fieldset>
        <CheckboxField
          id="interruptible"
          label="Allow the caller to interrupt the agent"
          checked={configuration.turnSettings.interruptible}
          disabled={!editable || busy}
          onChange={(event) =>
            update('turnSettings', {
              ...configuration.turnSettings,
              interruptible: event.target.checked,
            })
          }
        />

        <div className="unsupported-settings">
          <p className="eyebrow">Not supported by the voice runtime</p>
          <ul>
            {UNSUPPORTED_SETTINGS.map((setting) => (
              <li key={setting.label}>
                <span>{setting.label}</span>
                <StatusPill tone="neutral">Unsupported</StatusPill>
                <small>{setting.reason}</small>
              </li>
            ))}
          </ul>
        </div>
      </Panel>

      <Panel title="Languages" eyebrow="What the receptionist speaks">
        <SelectField
          id="defaultLanguage"
          name="defaultLanguage"
          label="Default language"
          hint="Used when the caller's language cannot be determined."
          options={LANGUAGE_OPTIONS}
          value={configuration.defaultLanguage}
          disabled={!editable || busy}
          {...(issueFor(issues, 'defaultLanguage')
            ? { error: issueFor(issues, 'defaultLanguage') }
            : {})}
          onChange={(event) => update('defaultLanguage', event.target.value)}
        />
        <fieldset className="field field-radio-group">
          <legend>Supported languages</legend>
          <p className="field-hint">
            A voice must be assigned for each of these before the release can be published.
          </p>
          {LANGUAGE_OPTIONS.map((option) => (
            <div className="radio-option" key={option.value}>
              <input
                type="checkbox"
                id={`language-${option.value}`}
                checked={(configuration.languages ?? []).includes(option.value)}
                disabled={!editable || busy}
                onChange={(event) =>
                  update(
                    'languages',
                    event.target.checked
                      ? [...(configuration.languages ?? []), option.value]
                      : (configuration.languages ?? []).filter((code) => code !== option.value),
                  )
                }
              />
              <label htmlFor={`language-${option.value}`}>{option.label}</label>
            </div>
          ))}
        </fieldset>
      </Panel>

      {editable ? (
        <Panel title="Save this change" eyebrow="A reason is required">
          <TextArea
            id="changeReason"
            name="changeReason"
            label="Why is this changing?"
            hint="Recorded against the version and shown to the reviewer who approves it."
            rows={3}
            required
            value={changeReason}
            disabled={busy}
            {...(issueFor(issues, 'changeReason')
              ? { error: issueFor(issues, 'changeReason') }
              : {})}
            onChange={(event) => setChangeReason(event.target.value)}
          />
          <div className="form-actions">
            <Button
              variant="primary"
              type="button"
              disabled={busy || !dirty}
              onClick={() => {
                void save();
              }}
            >
              {busy ? 'Saving…' : 'Save to draft'}
            </Button>
            {!dirty ? <span className="evidence-note">No changes to save.</span> : null}
          </div>
        </Panel>
      ) : null}

      <TechnicalDetails summary="Technical detail">
        <dl className="technical-grid">
          <div>
            <dt>Version id</dt>
            <dd>{versionId}</dd>
          </div>
          <div>
            <dt>Editable</dt>
            <dd>{String(editable)}</dd>
          </div>
          <div>
            <dt>Policy override permitted</dt>
            <dd>{String(canEditPolicy)}</dd>
          </div>
          <div>
            <dt>Previous change reason</dt>
            <dd>{initialChangeReason}</dd>
          </div>
        </dl>
      </TechnicalDetails>
    </div>
  );
}
