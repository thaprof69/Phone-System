import {
  approveVoice,
  createAgent,
  createKnowledge,
  createReport,
  createStaffTask,
  createTest,
  promoteAgent,
  publishAgent,
  publishKnowledge,
  reconcileCalls,
  refreshVoices,
  reviewAgent,
  reviewKnowledge,
  runTests,
  stageAgentForTest,
  syncTestRun,
  updateStaffTask,
} from './actions';

export function SectionActions({ section }: { section: string }) {
  if (section === 'agent-studio')
    return (
      <ActionDetails title="Create agent draft">
        <form action={createAgent} className="governed-form">
          <Field name="name" label="Agent name" minLength={2} />
          <Field name="purpose" label="Purpose" minLength={5} />
          <Field name="changeReason" label="Change reason" minLength={5} />
          <Field name="firstMessage" label="First message" minLength={2} />
          <TextArea name="prompt" label="Approved prompt" />
          <Submit>Create local draft</Submit>
        </form>
      </ActionDetails>
    );
  if (section === 'knowledge')
    return (
      <ActionDetails title="Create knowledge draft">
        <form action={createKnowledge} className="governed-form">
          <Field name="title" label="Title" minLength={2} />
          <Field name="category" label="Category" minLength={2} />
          <Field name="language" label="Language (for example pt-PT)" minLength={2} />
          <Field name="park" label="Park (optional)" required={false} />
          <Select name="riskClass" label="Risk class" options={['LOW', 'MEDIUM', 'HIGH']} />
          <TextArea name="content" label="Approved factual content" />
          <Submit>Create local draft</Submit>
        </form>
      </ActionDetails>
    );
  if (section === 'voices')
    return (
      <form action={refreshVoices} className="inline-action">
        <Submit>Refresh provider catalogue</Submit>
      </form>
    );
  if (section === 'tests')
    return (
      <div className="action-stack">
        <ActionDetails title="Create versioned test case">
          <form action={createTest} className="governed-form">
            <Field name="name" label="Test name" minLength={3} />
            <Field name="testType" label="Provider test type" minLength={2} />
            <Select
              name="riskLevel"
              label="Risk level"
              options={['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']}
            />
            <TextArea
              name="definition"
              label="Provider test definition (JSON)"
              defaultValue={'{"type":"llm","success_condition":"Define the expected behaviour"}'}
            />
            <Submit>Create local test</Submit>
          </form>
        </ActionDetails>
        <ActionDetails title="Run mapped provider tests">
          <form action={runTests} className="governed-form">
            <Field name="agentVersionId" label="Agent release ID" />
            <Field name="testVersionIds" label="Test version IDs (comma separated)" />
            <Field name="repeatCount" label="Repeat count" type="number" min="1" max="50" />
            <Submit>Run provider tests</Submit>
          </form>
        </ActionDetails>
      </div>
    );
  if (section === 'calls')
    return (
      <form action={reconcileCalls} className="inline-action">
        <Submit>Reconcile provider history</Submit>
      </form>
    );
  if (section === 'operations')
    return (
      <ActionDetails title="Create staff task">
        <form action={createStaffTask} className="governed-form">
          <Field name="conversationId" label="Canonical conversation ID" />
          <Field name="reason" label="Task reason" minLength={5} />
          <Select name="priority" label="Priority" options={['NORMAL', 'URGENT']} />
          <Field name="dueAt" label="Due at (optional)" type="datetime-local" required={false} />
          <Submit>Create deterministic task</Submit>
        </form>
      </ActionDetails>
    );
  if (section === 'reports')
    return (
      <ActionDetails title="Create report definition">
        <form action={createReport} className="governed-form">
          <Field name="key" label="Unique report key" minLength={3} />
          <Field name="schedule" label="Approved schedule" minLength={3} />
          <Select
            name="classification"
            label="Classification"
            options={['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED']}
          />
          <TextArea name="configuration" label="Report configuration (JSON)" defaultValue="{}" />
          <Submit>Create governed report</Submit>
        </form>
      </ActionDetails>
    );
  return null;
}

export function RecordActions({
  section,
  id,
  state,
  kind,
}: {
  section: string;
  id: string;
  state: string;
  kind?: string;
}) {
  if (section === 'agent-studio') {
    if (['DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED'].includes(state))
      return (
        <form action={reviewAgent} className="record-actions">
          <input type="hidden" name="id" value={id} />
          <input name="reason" aria-label="Review reason" minLength={8} required />
          <button name="decision" value="APPROVE" className="text-button">
            Approve for test
          </button>
          <button name="decision" value="REJECT" className="text-button danger">
            Request changes
          </button>
        </form>
      );
    if (state === 'APPROVED_FOR_TEST')
      return <IdAction action={stageAgentForTest} id={id} label="Stage test copy" />;
    if (state === 'TEST_PASSED')
      return <IdAction action={promoteAgent} id={id} label="Promote release" />;
    if (state === 'APPROVED_FOR_PUBLISH')
      return <IdAction action={publishAgent} id={id} label="Publish approved copy" />;
  }
  if (section === 'knowledge') {
    if (['DRAFT', 'IN_REVIEW'].includes(state))
      return (
        <form action={reviewKnowledge} className="record-actions">
          <input type="hidden" name="id" value={id} />
          <input name="reason" aria-label="Review reason" minLength={8} required />
          <button name="decision" value="APPROVE" className="text-button">
            Approve
          </button>
          <button name="decision" value="REJECT" className="text-button danger">
            Reject
          </button>
        </form>
      );
    if (state === 'APPROVED')
      return <IdAction action={publishKnowledge} id={id} label="Publish runtime copy" />;
  }
  if (section === 'voices' && state !== 'APPROVED')
    return <IdAction action={approveVoice} id={id} label="Approve voice" />;
  if (section === 'tests' && kind === 'run' && !['COMPLETED', 'FAILED'].includes(state))
    return <IdAction action={syncTestRun} id={id} label="Sync provider result" />;
  if (section === 'operations' && kind === 'task' && !['COMPLETED', 'CANCELLED'].includes(state))
    return (
      <form action={updateStaffTask} className="record-actions">
        <input type="hidden" name="id" value={id} />
        <button name="status" value="IN_PROGRESS" className="text-button">
          Start
        </button>
        <button name="status" value="COMPLETED" className="text-button">
          Complete
        </button>
        <button name="status" value="CANCELLED" className="text-button danger">
          Cancel
        </button>
      </form>
    );
  return null;
}

function IdAction({
  action,
  id,
  label,
}: {
  action: (form: FormData) => Promise<void>;
  id: string;
  label: string;
}) {
  return (
    <form action={action} className="record-actions">
      <input type="hidden" name="id" value={id} />
      <button className="text-button">{label}</button>
    </form>
  );
}

function ActionDetails({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="action-panel">
      <summary>{title}</summary>
      {children}
    </details>
  );
}

function Field({
  label,
  required = true,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label>
      <span>{label}</span>
      <input required={required} {...props} />
    </label>
  );
}

function TextArea({
  label,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <label className="form-wide">
      <span>{label}</span>
      <textarea required rows={5} {...props} />
    </label>
  );
}

function Select({ name, label, options }: { name: string; label: string; options: string[] }) {
  return (
    <label>
      <span>{label}</span>
      <select name={name} required>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function Submit({ children }: { children: React.ReactNode }) {
  return (
    <button className="button primary" type="submit">
      {children}
    </button>
  );
}
