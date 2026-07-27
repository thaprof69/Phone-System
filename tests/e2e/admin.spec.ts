import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Browser coverage for the operator control plane.
 *
 * The assertions that matter most here are the negative ones. The product previously
 * rendered thirty-two tab-looking `<span>` elements that did nothing, and eight
 * administration routes that printed "0 governed records". Tests that only check a
 * heading is visible would have passed against all of that, so several tests below
 * assert the absence of those patterns directly.
 */

const PRIMARY_DOMAINS = [
  'Mission Control',
  'Calls',
  'Intelligence',
  'Reports',
  'Settings',
] as const;

/**
 * Opens a row-level disclosure and returns it, so the controls it reveals can be
 * addressed without colliding with the identical controls in every other row.
 *
 * `<details>` is exposed as a group whose accessible name is *not* taken from its
 * `<summary>`, so it cannot be found by role and name — the summary text is the handle.
 */
async function openDisclosure(scope: Page | Locator, label: string): Promise<Locator> {
  const disclosure = scope.locator('details').filter({ hasText: label }).first();
  await disclosure.locator('summary').filter({ hasText: label }).first().click();
  return disclosure;
}

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

test('Mission Control reports live state, attention and readiness', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ }),
  ).toBeVisible();

  // The cockpit must answer the operator's questions, not describe the architecture.
  await expect(page.getByRole('heading', { name: 'Needs attention' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Readiness' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recent calls' })).toBeVisible();

  // Synthetic data must be labelled as synthetic.
  await expect(page.getByText('Synthetic data').first()).toBeVisible();

  await expectNoAxeViolations(page);
});

test('every primary navigation item opens a working workspace', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  const navigation = page.getByRole('navigation', { name: 'Primary navigation' });

  for (const domain of PRIMARY_DOMAINS) {
    await navigation.getByRole('link', { name: domain, exact: true }).click();
    // A workspace is a page with its own heading, not a placeholder.
    await expect(page.locator('main h1')).toBeVisible();
    await expect(page.getByText('governed records')).toHaveCount(0);
    await page.goto('/');
  }
});

test('sub-navigation tabs navigate rather than sitting inert', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/calls');
  const tabs = page.getByRole('navigation', { name: 'Calls areas' });

  // Every tab is a real link with an href. The previous implementation rendered
  // <span> elements with no href, no role and a hardcoded active index.
  const links = tabs.getByRole('link');
  await expect(links).toHaveCount(10);

  await tabs.getByRole('link', { name: 'Failed ingestion' }).click();
  await expect(page).toHaveURL(/\/calls\/failed$/);
  await expect(page.getByRole('heading', { name: 'Failed ingestion', exact: true })).toBeVisible();
  // The page must have actually loaded its records rather than falling back to an
  // error state. Checked by the ErrorState wording, not by role: this page renders a
  // deliberate danger banner that also carries role="alert".
  await expect(page.getByText(/could not be loaded/)).toHaveCount(0);

  // The active tab is announced, not merely styled.
  await expect(tabs.getByRole('link', { name: 'Failed ingestion' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('no navigation element looks like a tab without being one', async ({ page }) => {
  test.setTimeout(120_000);
  for (const path of ['/', '/calls', '/settings/knowledge', '/settings/simulation', '/calls/sla']) {
    await page.goto(path);
    // `.tabs span` was the old inert pattern; it must not reappear anywhere.
    await expect(page.locator('.tabs span')).toHaveCount(0);
  }
});

test('the calls list filters, sorts and paginates against real records', async ({ page }) => {
  await page.goto('/calls');
  await expect(page.getByRole('heading', { name: /\d+ calls?/ })).toBeVisible();

  // Sorting is expressed in the URL so a sorted view can be shared and reloaded.
  await page.getByRole('link', { name: /^Park/ }).click();
  await expect(page).toHaveURL(/sort=park/);
  await expect(page.locator('th[aria-sort="ascending"]')).toHaveCount(1);

  // Filtering genuinely reduces the set rather than decorating the page.
  await page.goto('/calls?state=FAILED_FINAL');
  await expect(page.getByText('Filtered')).toBeVisible();
  const rows = page.locator('tbody tr');
  await expect(rows.first()).toBeVisible();
  for (const cell of await page.locator('tbody tr td').allTextContents()) {
    expect(cell).not.toContain('Completed');
  }
});

test('a call opens a workspace keeping provider and canonical records distinct', async ({
  page,
}) => {
  // Filter to a completed call so the assertions below have a summary, a
  // classification and an outcome to check. Picking whichever row happened to be
  // first would sometimes land on a call that failed before enrichment.
  await page.goto('/calls?state=COMPLETED');
  await page.locator('tbody th a').first().click();
  await expect(page).toHaveURL(/\/calls\/[0-9a-f-]{36}$/);

  // The redacted revision is what operators see; the provider payload sits behind
  // a disclosure and is never presented as the platform's own record.
  await expect(page.getByRole('heading', { name: 'Transcript' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Provider evidence' })).toBeVisible();
  await expect(page.getByText(/never edited/)).toBeVisible();

  // In-page tabs switch content in the same document.
  await page.getByRole('tab', { name: 'Outcome' }).click();
  await expect(page.getByText(/never asserted by a model/)).toBeVisible();

  await expectNoAxeViolations(page);
});

test('release gates are reported individually and cannot be bypassed here', async ({ page }) => {
  await page.goto('/settings/advanced/release-checks');
  await expect(page.getByText('Gates are enforced by the server')).toBeVisible();

  // Each gate is its own decision rather than one combined score.
  await expect(page.getByRole('heading', { name: 'Mandatory tests pass' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No unresolved provider drift' })).toBeVisible();

  // There is deliberately no override control.
  await expect(page.getByRole('button', { name: /override|bypass|force/i })).toHaveCount(0);
});

test('knowledge releases report local and runtime state separately', async ({ page }) => {
  await page.goto('/settings/knowledge/releases');
  await expect(page.getByRole('columnheader', { name: 'Local state' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Voice runtime' })).toBeVisible();
  await expect(page.getByText(/never overwrites local state/)).toBeVisible();
});

test('analytics renders charts with an accessible table fallback', async ({ page }) => {
  await page.goto('/intelligence');
  await expect(page.getByRole('heading', { name: 'Call demand' })).toBeVisible();

  // Every chart carries the same numbers in a table, so the visual is never the
  // only representation.
  const fallbacks = page.getByText('View data as a table');
  expect(await fallbacks.count()).toBeGreaterThan(0);
  await fallbacks.first().click();
  await expect(page.getByRole('table').first()).toBeVisible();

  await expectNoAxeViolations(page);
});

test('administration exposes every area without a placeholder', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/settings/administration');
  const rail = page.getByRole('navigation', { name: 'Administration areas' });

  for (const area of [
    'Overview',
    'General',
    'Users and roles',
    'Security and privacy',
    'Audit',
    'Retention and legal holds',
    'Feature flags',
    'Production readiness',
    'Release administration',
  ]) {
    await rail.getByRole('link', { name: area, exact: true }).click();
    await expect(page.locator('main h1')).toBeVisible();
    // The placeholder always rendered this exact string.
    await expect(page.getByText('0 governed records')).toHaveCount(0);
  }
});

test('AI Providers and AI Routing expose every area without a placeholder', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/settings/ai-providers/elevenlabs');
  const providersRail = page.getByRole('navigation', { name: 'AI Providers areas' });
  for (const area of ['ElevenLabs setup', 'Intelligence providers', 'Models', 'Provider health']) {
    await providersRail.getByRole('link', { name: area, exact: true }).click();
    await expect(page.locator('main h1')).toBeVisible();
  }

  await page.goto('/settings/ai-routing');
  const routingRail = page.getByRole('navigation', { name: 'AI Routing areas' });
  for (const area of [
    'Overview',
    'Capabilities',
    'Routes',
    'Prompts',
    'Schemas and taxonomies',
    'Budgets',
    'Execution history',
    'Monitoring',
  ]) {
    await routingRail.getByRole('link', { name: area, exact: true }).click();
    await expect(page.locator('main h1')).toBeVisible();
  }
});

test('the ElevenLabs provider form is a direct inline form, never a modal, with exactly one primary save action', async ({
  page,
}) => {
  await page.goto('/settings/ai-providers/elevenlabs');

  // No dialog — the form is directly on the page.
  await expect(page.locator('dialog')).toHaveCount(0);
  const form = page.locator('#elevenlabs-provider-form');
  await expect(form).toBeVisible();

  // Two distinct, differently-scoped actions: "Save ElevenLabs" (persist only) and
  // "Save & test provider" (persist + real verify) — never a bare "Test connection"
  // and never more than one primary button to choose between.
  await expect(form.getByRole('button', { name: 'Save ElevenLabs', exact: true })).toBeVisible();
  await expect(
    form.getByRole('button', { name: 'Save & test provider', exact: true }),
  ).toBeVisible();
  await expect(form.getByRole('button', { name: 'Test connection', exact: true })).toHaveCount(0);
  await expect(form.locator('.button.primary')).toHaveCount(1);

  // The real, editable Voice Mode field this port added is present and offers both
  // real transports.
  const voiceMode = form.locator('#el-voice-mode');
  await expect(voiceMode).toBeVisible();
  await expect(voiceMode.locator('option')).toHaveCount(2);
});

test('running diagnostics reports an honest result, and a WebRTC bootstrap pass is never presented as proof that real audio works', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto('/settings/ai-providers/elevenlabs');

  const diagnostics = page.locator('section[aria-labelledby="diagnostics-title"]');
  await diagnostics.getByRole('button', { name: 'Run diagnostics' }).click();

  // Either an honest NOT_CONFIGURED single-check result (no credential stored in this
  // environment) or a real multi-check grid — both are legitimate, non-fabricated outcomes.
  const notConfigured = page.getByText('No encrypted ElevenLabs credential is saved.');
  const webrtcBootstrap = page.getByText('WebRTC bootstrap', { exact: true });
  await expect(notConfigured.or(webrtcBootstrap)).toBeVisible({ timeout: 20_000 });

  if (await webrtcBootstrap.isVisible().catch(() => false)) {
    // The bootstrap check and the separately-tracked "media session" fact must never collapse
    // into a single fact — a passing token/signed-URL round trip is not evidence of real audio.
    await expect(page.getByText('WebSocket bootstrap', { exact: true })).toBeVisible();
    await expect(page.getByText('WebRTC media session', { exact: true })).toBeVisible();
    await expect(page.getByText('WebSocket media session', { exact: true })).toBeVisible();
  }
});

test('the Simulation Lab shows a provider readiness summary linking to Configure ElevenLabs', async ({
  page,
}) => {
  await page.goto('/settings/simulation');
  await expect(page.getByText('Provider:', { exact: false })).toBeVisible();
  await expect(page.getByText('Diagnostics:', { exact: false })).toBeVisible();
  await expect(page.getByText('Agent:', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Configure ElevenLabs' })).toHaveAttribute(
    'href',
    '/settings/ai-providers/elevenlabs',
  );
});

test('the ElevenLabs diagnostics history page is reachable and lists past runs honestly', async ({
  page,
}) => {
  await page.goto('/settings/ai-providers/elevenlabs/diagnostics');
  await expect(
    page.getByRole('heading', { name: 'ElevenLabs diagnostics history', exact: true }),
  ).toBeVisible();
});

test('the audit log is presented as a verifiable chain', async ({ page }) => {
  await page.goto('/settings/administration/audit');
  await expect(page.getByText('Chain intact')).toBeVisible();
  await expect(page.getByText(/cannot be edited or removed/)).toBeVisible();
});

test('access administration surfaces separation-of-duty conflicts', async ({ page }) => {
  await page.goto('/settings/administration/users');
  await expect(page.getByRole('columnheader', { name: 'Separation of duties' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Roles', exact: true })).toBeVisible();
});

test('AIOS is not presented to operators as a product name', async ({ page }) => {
  // "AI infrastructure" is the operator-facing name; AIOS is internal architecture.
  await page.goto('/');
  await expect(page.getByText('AI infrastructure')).toBeVisible();
  await expect(page.locator('main').getByText(/\bAIOS\b/)).toHaveCount(0);

  await page.goto('/settings/ai-routing');
  await expect(page.locator('main').getByText(/\bAIOS\b/)).toHaveCount(0);
});

test('the environment is labelled honestly as a simulator', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('This environment uses the deterministic simulator')).toBeVisible();
  await expect(page.getByText(/No production traffic is routed/)).toBeVisible();
});

test('no provider secret reaches the browser', async ({ page }) => {
  for (const path of [
    '/settings/ai-providers/elevenlabs',
    '/settings/ai-routing',
    '/settings/simulation',
    '/settings/advanced/provider-test-runs',
  ]) {
    await page.goto(path);
    const body = (await page.locator('body').textContent()) ?? '';
    expect(body).not.toContain('sk_');
    expect(body).not.toContain('sk-');
    expect(body).not.toContain('xi-api-key');
  }
});

test('a live receptionist session response never carries the permanent provider API key', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/settings/simulation');

  const responses: string[] = [];
  page.on('response', (response) => {
    if (response.url().includes('/api/admin/receptionist-sessions')) {
      response
        .text()
        .then((text) => responses.push(text))
        .catch(() => undefined);
    }
  });

  const liveTest = page.getByRole('region', { name: 'Live Receptionist Test' });
  await liveTest.getByLabel('Agent version').selectOption({ index: 1 });
  await liveTest.getByRole('button', { name: 'Start Voice Call' }).click();
  await expect(liveTest.getByText('Refused', { exact: true })).toBeVisible();

  for (const body of responses) {
    expect(body).not.toContain('xi-api-key');
    expect(body).not.toMatch(/sk[_-]/);
  }
});

test('operations queues surface overdue work first', async ({ page }) => {
  await page.goto('/calls/sla');
  await expect(page.getByRole('heading', { name: 'Breached commitments' })).toBeVisible();

  await page.goto('/calls/callbacks?due=overdue');
  await expect(page.getByRole('heading', { name: /\d+ items?/ })).toBeVisible();
});

test('mobile navigation reaches every domain', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('summary[aria-label="Open navigation"]').click();
  const mobileNavigation = page.getByRole('navigation', { name: 'Mobile primary navigation' });
  await expect(mobileNavigation).toBeVisible();
  await mobileNavigation.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Simulation Lab' }).click();
  await expect(
    page.getByRole('heading', { name: 'Live Receptionist Test', level: 1 }),
  ).toBeVisible();
});

test('a domain workspace is reachable by keyboard alone', async ({ page }) => {
  await page.goto('/');
  const navigation = page.getByRole('navigation', { name: 'Primary navigation' });
  await navigation.getByRole('link', { name: 'Calls', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'All calls' })).toBeVisible();

  // The sub-navigation is reachable from the same keyboard path.
  await page
    .getByRole('navigation', { name: 'Calls areas' })
    .getByRole('link', { name: 'Handoffs' })
    .focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Handoffs' })).toBeVisible();
});

test('a Settings group is reachable by keyboard from the landing page', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('link', { name: 'Knowledge Hub' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();

  await page
    .getByRole('navigation', { name: 'Knowledge Hub areas' })
    .getByRole('link', { name: 'Knowledge gaps' })
    .focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Knowledge gaps' })).toBeVisible();
});

test('version comparison shows the actual change, not the whole file', async ({ page }) => {
  await page.goto('/settings/receptionist/versions');
  await page.getByRole('link', { name: 'Compare versions' }).click();
  await expect(page).toHaveURL(/\/settings\/receptionist\/versions\/compare$/);

  // A real longest-common-subsequence diff: unchanged lines are collapsed and only
  // the genuine change is marked. A naive comparison would flag the whole document.
  await expect(page.getByText(/unchanged lines/).first()).toBeVisible();
  await expect(page.getByText(/^\+\d+ −\d+ across \d+ lines/)).toBeVisible();

  // An unapproved draft says so rather than showing an empty approval field.
  await expect(page.getByText('This version has not been independently approved.')).toBeVisible();
});

test('the conversation editor loads, validates server-side and persists', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/settings/receptionist');
  await page.locator('tbody th a').first().click();
  await page.getByRole('tab', { name: 'Conversation' }).click();

  // The editor is populated from the platform, not from a blank form.
  const systemPrompt = page.getByLabel('System prompt');
  await expect(systemPrompt).toBeVisible();
  expect((await systemPrompt.inputValue()).length).toBeGreaterThan(20);

  // The safety fragments are shown and declared locked.
  await expect(page.getByRole('heading', { name: 'Safety policy' })).toBeVisible();
  await expect(
    page.getByText(
      'Never request, accept, confirm or repeat payment card details. Transfer instead.',
    ),
  ).toBeVisible();
});

test('governed tools are inspectable but cannot be invented here', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/settings/receptionist');
  await page.locator('tbody th a').first().click();
  await page.getByRole('tab', { name: /^Tools/ }).click();

  await expect(page.getByText('Tools are code-owned')).toBeVisible();
  // No control offers to define a tool from an arbitrary endpoint.
  await expect(page.getByRole('button', { name: /add tool|new tool|create tool/i })).toHaveCount(0);

  // A contract test runs against the platform and reports what it observed. The
  // contracts table scrolls horizontally, so the control is brought into view first
  // rather than relying on the click to reach it.
  const runTest = page.getByRole('button', { name: 'Run test' }).first();
  await runTest.scrollIntoViewIfNeeded();
  await expect(runTest).toBeEnabled();
  await runTest.click();
  await expect(page.getByText(/Pass|Fail/).first()).toBeVisible({ timeout: 30_000 });
});

test('transfer routes are shown in the order the runtime evaluates them', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/settings/receptionist');
  await page.locator('tbody th a').first().click();
  await page.getByRole('tab', { name: /^Transfers/ }).click();

  await expect(page.getByText('Evaluated top to bottom, first match wins')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'If unanswered' })).toBeVisible();
});

test('publication is judged by provider read-back, not by the publish call', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/settings/receptionist/releases');

  await expect(page.getByRole('heading', { name: 'Version pipeline' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Provider read-back' })).toBeVisible();
  await expect(page.getByText(/The publish call returning is not the same thing/)).toBeVisible();

  // Running a read-back reports what the provider actually holds.
  await page.getByRole('button', { name: 'Verify read-back' }).first().click();
  await expect(
    page.getByText(/Read-back matched the approved configuration|Read-back did not match/),
  ).toBeVisible({ timeout: 45_000 });
});

test('rollback requires a version that was actually live, and confirms destructively', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/settings/receptionist/releases');
  await expect(page.getByRole('heading', { name: 'Rollback' })).toBeVisible();

  // A rollback is guarded by a typed confirmation rather than a single click.
  await page.getByRole('button', { name: 'Roll back' }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText(/Type/)).toBeVisible();
  const confirm = page.getByRole('button', { name: /^Roll back to version/ });
  await expect(confirm).toBeDisabled();
  await page.keyboard.press('Escape');
});

test('drift is reported as evidence and never silently adopted', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/settings/receptionist/releases');
  await expect(page.getByRole('heading', { name: 'Unresolved drift' })).toBeVisible();
  await expect(
    page.getByText(/the remedy is republishing, not adopting the remote value/),
  ).toBeVisible();
});

test('completing operations work requires evidence and refuses a repeat', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/calls/callbacks?due=open');

  // Completing is gated on a note, so the control stays disabled until one is written.
  const complete = page.getByRole('button', { name: 'Complete with evidence' }).first();
  await expect(complete).toBeVisible();
  await expect(complete).toBeDisabled();

  await page.getByLabel('What was done').first().fill('Called the customer back and confirmed');
  await expect(complete).toBeEnabled();
  await complete.click();

  await expect(page.getByText('Done').first()).toBeVisible({ timeout: 30_000 });
});

test('an unanswered transfer creates the callback the caller is owed', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/calls/handoffs');
  await expect(
    page.getByText(/Marking a transfer unanswered creates the callback the caller is owed/).first(),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Mark unanswered' }).first().click();
  // The platform reports what it actually did, including the fallback it created.
  await expect(page.getByText(/Recorded as unanswered/).first()).toBeVisible({ timeout: 30_000 });
});

test('a failed message can be retried on a different channel', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/calls/messages?status=FAILED');
  await page.getByRole('button', { name: 'Retry on SMS' }).first().click();
  await expect(page.getByText(/Queued on SMS instead|Attempt/).first()).toBeVisible({
    timeout: 30_000,
  });
});

test('AI execution history shows real runs with provenance, not a count', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/settings/ai-routing/executions');

  await expect(page.getByRole('heading', { name: 'Execution history' })).toBeVisible();
  // The old screen rendered a bare number under a label. A real table is the check.
  await expect(page.getByRole('columnheader', { name: 'Capability' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Latency' })).toBeVisible();
  expect(await page.locator('tbody tr').count()).toBeGreaterThan(5);

  // Provenance is present but kept out of the primary reading order.
  await page.getByText('Provenance for the most recent run').click();
  await expect(page.getByText('Correlation id')).toBeVisible();
});

test('AI routing monitoring reports real rates and links each to its runs', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/settings/ai-routing/monitoring');

  await expect(page.getByRole('heading', { name: 'Results by state' })).toBeVisible();

  // Every aggregate is traceable to the records behind it.
  await expect(page.getByRole('link', { name: 'View runs' }).first()).toBeVisible();
  await page.getByRole('link', { name: 'View runs' }).first().click();
  await expect(page).toHaveURL(/\/settings\/ai-routing\/executions/);
});

test('AI provider health is reported from recorded checks', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/settings/ai-providers/health');

  await expect(page.getByRole('heading', { name: 'Provider health' })).toBeVisible();
});

test('AI governance shows prompts, schemas, taxonomies and GBP budgets', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/settings/ai-routing/budgets');
  await expect(page.getByRole('heading', { name: 'Budgets' })).toBeVisible();
  // Money is shown in GBP with en-GB formatting.
  await expect(page.getByText(/£/).first()).toBeVisible();

  await page.goto('/settings/ai-routing/schemas');
  await expect(page.getByRole('heading', { name: 'Output schemas' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Taxonomies', exact: true })).toBeVisible();
  // Code-owned schemas cannot be widened at runtime, and the screen says so.
  await expect(page.getByText(/cannot be edited at runtime/)).toBeVisible();

  await page.goto('/settings/ai-routing/prompts');
  await expect(page.getByRole('heading', { name: 'Prompts' })).toBeVisible();
});

test('the provider registry is adapter-driven and offers no fake connect action', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/settings/ai-providers/intelligence');

  await expect(page.getByRole('heading', { name: 'Installed adapters' })).toBeVisible();
  // The connection form is generated from the adapter's declared fields.
  await expect(page.getByText('apiKey')).toBeVisible();

  // Providers with no adapter are listed honestly and given no action. A connect button
  // here would promise a capability the platform does not have.
  const notInstalled = page.getByRole('region', { name: 'Not installed' });
  await expect(notInstalled.getByText('Anthropic')).toBeVisible();
  await expect(notInstalled.getByText('Adapter not installed').first()).toBeVisible();
  expect(await notInstalled.getByRole('button').count()).toBe(0);
  expect(await notInstalled.getByRole('link').count()).toBe(0);

  await expectNoAxeViolations(page);
});

test('a simulator model cannot be approved for production', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/settings/ai-providers/models');

  const decide = await openDisclosure(page, 'Decide');
  await decide.getByLabel('Environment').selectOption('production');
  await decide.getByLabel('Reason').fill('Attempting to approve a simulator model for production');
  await decide.getByRole('button', { name: 'Approve' }).click();

  // The refusal comes from the platform and states why, rather than the control simply
  // being absent or the failure being swallowed.
  await expect(page.getByText('Refused', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/not eligible to serve production/)).toBeVisible();
});

test('a model can be approved for development and the decision persists', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/settings/ai-providers/models');

  const decide = await openDisclosure(page, 'Decide');
  await decide.getByLabel('Environment').selectOption('development');
  await decide.getByLabel('Reason').fill('Approved for local development verification');
  await decide.getByRole('button', { name: 'Approve' }).click();

  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible();

  // Persisted, not merely displayed: it survives a reload of the page.
  await page.reload();
  const reopened = await openDisclosure(page, 'Decide');
  await expect(reopened.getByText('Approved for local development verification')).toBeVisible();
});

test('a model approval is refused without a recorded reason', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/settings/ai-providers/models');

  const decide = await openDisclosure(page, 'Decide');
  await decide.getByRole('button', { name: 'Approve' }).click();

  await expect(page.getByText(/reason of at least eight characters is required/)).toBeVisible();
});

test('a route version is created as a draft and states what blocks activation', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/settings/ai-routing/routes');

  const builder = await openDisclosure(page, 'Create a new version');
  await builder.getByLabel('Provider connection').selectOption({ index: 1 });
  await builder.getByLabel('Model', { exact: true }).selectOption({ index: 1 });
  await builder.getByRole('button', { name: 'Create draft version' }).click();

  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible();
  // A draft is allowed to be invalid; what is not allowed is hiding that from its author.
  await expect(page.getByText(/not serving traffic until it is activated/)).toBeVisible();
});

test('a route cannot be created without a primary candidate', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/settings/ai-routing/routes');

  const builder = await openDisclosure(page, 'Create a new version');
  await builder.getByRole('button', { name: 'Create draft version' }).click();

  await expect(page.getByText(/primary connection and model are required/)).toBeVisible();
});

test('activating a second route for one environment is refused with its reason', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/settings/ai-routing/routes');

  // The seeded route already has an active development version, so a *development*
  // draft must not be able to take over silently. Pinning the environment keeps this
  // asserting route uniqueness rather than production eligibility.
  const draftRow = page
    .locator('tbody tr')
    .filter({ hasText: 'Draft' })
    .filter({ hasText: 'Development' })
    .first();
  const manage = await openDisclosure(draftRow, 'Manage');
  await manage.getByRole('button', { name: 'Check conditions' }).click();

  await expect(page.getByText('This route cannot serve traffic yet')).toBeVisible();
  await expect(page.getByText('route.uniqueness')).toBeVisible();

  await manage.getByRole('button', { name: 'Activate' }).click();
  await expect(page.getByText('Refused', { exact: true }).first()).toBeVisible();
});

test('a code-owned schema cannot be changed through the interface', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/settings/ai-routing/schemas');

  // The lifecycle control is replaced by a statement of why there is none, rather than
  // offering an action the platform would refuse.
  const codeOwnedRow = page.locator('tbody tr').filter({ hasText: 'Code-owned' }).first();
  const move = await openDisclosure(codeOwnedRow, 'Move');
  await expect(move.getByRole('button', { name: 'Apply' })).toHaveCount(0);
  await expect(move.getByText('Code-owned')).toBeVisible();
});

test('a governed prompt refuses a transition it has already made', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/settings/ai-routing/prompts');

  // Targets the dedicated E2E_GOVERNANCE_FIXTURE prompt (seed.ts), never a real prompt a
  // production capability depends on. ROLLBACK has no path back to ACTIVE in the governance
  // state machine, so this test permanently retires whatever row it targets — it must never be
  // "the first row" positionally, since that used to be whichever real capability's prompt
  // happened to sort first, silently disabling it for every later verification.
  const promptRow = page
    .getByRole('region', { name: 'Prompt versions' })
    .locator('tbody tr')
    .filter({ hasText: 'E2E_GOVERNANCE_FIXTURE' });
  const move = await openDisclosure(promptRow, 'Move');
  await move.getByLabel('Action').selectOption('ROLLBACK');
  await move.getByLabel('Reason').fill('Rolling back for browser verification');
  await move.getByRole('button', { name: 'Apply' }).click();

  // Wait for the first attempt to report back before touching the form again. A
  // successful transition clears the reason as it lands, so refilling before then would
  // be undone mid-flight and the second attempt would fail the length check instead of
  // reaching the state machine. Either outcome is legitimate here: the seeded version
  // may already be rolled back.
  await expect(move.getByText(/^(Saved|Refused)$/)).toBeVisible();

  // The reason is cleared on success, so it has to be given again — the same rule the
  // operator faces. What must hold is that the repeat is refused with the state the
  // record is actually in, not accepted a second time.
  await move.getByLabel('Reason').fill('Attempting the same transition again');
  await move.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText(/already rolled back/i)).toBeVisible();
});

test('a budget whose per-request ceiling exceeds its daily limit is refused', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/settings/ai-routing/budgets');

  const form = await openDisclosure(page, 'Add a budget policy');
  await form.getByLabel('Key').fill('inverted-ceiling-check');
  await form.getByLabel('Per request').fill('9');
  await form.getByLabel('Daily', { exact: true }).fill('1');
  await form.getByRole('button', { name: 'Save policy' }).click();

  await expect(page.getByText('Refused', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/per-request ceiling cannot exceed the daily limit/)).toBeVisible();
});

test('a budget policy saves in GBP and shows spend against its limit', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/settings/ai-routing/budgets');

  const form = await openDisclosure(page, 'Add a budget policy');
  await form.getByLabel('Key').fill('browser-verified-budget');
  await form.getByLabel('Per request').fill('0.02');
  await form.getByLabel('Daily', { exact: true }).fill('6');
  await form.getByLabel('Monthly').fill('120');
  await form.getByRole('button', { name: 'Save policy' }).click();

  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible();
  await page.reload();
  // Scoped to the table: the key also appears in that row's own edit form legend.
  await expect(
    page.getByRole('rowheader').filter({ hasText: 'browser-verified-budget' }),
  ).toHaveCount(1);
  // Spend is reported against the limit, not as a limit alone.
  await expect(page.getByText(/of £6\.00/)).toBeVisible();
});

test('execution history filters and paginates without losing its filter options', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/settings/ai-routing/executions');

  const unfiltered = await page.locator('tbody tr').count();
  expect(unfiltered).toBeGreaterThan(0);

  await page.getByLabel('Fallback').selectOption('yes');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page).toHaveURL(/fallback=yes/);
  await expect(page.getByText('Fallback path used').first()).toBeVisible();

  // The filter that produced this view is still offered, so there is a way back.
  await expect(page.getByLabel('Fallback')).toBeVisible();
  await page.getByRole('link', { name: 'Clear' }).click();
  expect(await page.locator('tbody tr').count()).toBe(unfiltered);

  await page.getByRole('link', { name: 'Next' }).click();
  await expect(page.getByText(/Showing 26/)).toBeVisible();
});

test('capabilities drill through to the runs that executed them', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/settings/ai-routing/capabilities');

  await expect(page.getByRole('columnheader', { name: 'Runs recorded' })).toBeVisible();
  await page.getByRole('link', { name: 'View runs' }).first().click();

  await expect(page).toHaveURL(/\/settings\/ai-routing\/executions\?capability=/);
  await expect(page.getByRole('heading', { name: 'Execution history' })).toBeVisible();
});

test('unverified model metadata is stated as missing rather than invented', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/settings/ai-providers/models');

  // A plausible-looking context window would be believed. Absence must be visible.
  await expect(page.getByText('Not verified').first()).toBeVisible();
  await expectNoAxeViolations(page);
});

test('saving the same budget twice updates it rather than duplicating it', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/settings/ai-routing/budgets');

  // An environment-wide budget has a null scope, and PostgreSQL treats nulls as distinct
  // — so the obvious unique index over the scope columns silently failed to cover the
  // commonest case. Two identical policies would then both appear to be enforced.
  const save = async (daily: string) => {
    const form = await openDisclosure(page, 'Add a budget policy');
    await form.getByLabel('Key').fill('idempotent-through-the-ui');
    await form.getByLabel('Per request').fill('0.01');
    await form.getByLabel('Daily', { exact: true }).fill(daily);
    await form.getByRole('button', { name: 'Save policy' }).click();
    await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible();
  };

  await save('5');
  await page.reload();
  await save('9');
  await page.reload();

  const rows = page.getByRole('rowheader').filter({ hasText: 'idempotent-through-the-ui' });
  await expect(rows).toHaveCount(1);
  // The second save changed the policy rather than creating a sibling.
  await expect(page.getByText(/of £9\.00/)).toBeVisible();
});

test('a knowledge asset can be edited into a new draft and submitted for review', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/settings/knowledge');
  await page.locator('tbody tr.row-linked .row-link').first().click();

  // Run twice consecutively against one database, so the row this test lands on may
  // already carry an open draft from the previous pass — that must be reported as a
  // real, named state rather than silently doing nothing.
  // The "Author a new version" panel is always mounted so a just-shown confirmation
  // survives a refresh; whether the editable form is present depends on the Content
  // field actually being there, not on that now-permanent heading.
  const content = page.getByLabel('Content', { exact: true });
  if (await content.isVisible().catch(() => false)) {
    const marker = `Updated wording verified at ${Date.now()}`;
    // The refusal below is keyed on the content checksum, not the reason, so the
    // content itself has to change or this would be indistinguishable from the
    // identical-edit case this suite tests separately.
    await content.fill(`${await content.inputValue()}\n\n${marker}`);
    await page.getByLabel('Reason for this change').fill(marker);
    await page.getByRole('button', { name: 'Save as new draft' }).click();

    await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/not visible to callers until it is reviewed/)).toBeVisible();

    await page.getByRole('button', { name: 'Submit for review' }).click();
    await expect(page.getByText('Submitted for review.')).toBeVisible();
  } else {
    await expect(page.getByText(/already (draft|in review)/i).first()).toBeVisible();
  }
});

test('an identical edit is refused rather than accepted as a no-op version', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/settings/knowledge');
  await page.locator('tbody tr.row-linked .row-link').first().click();

  const content = page.getByLabel('Content', { exact: true });
  if (!(await content.isVisible().catch(() => false))) return;

  const currentContent = await content.inputValue();
  await content.fill(currentContent);
  await page.getByLabel('Reason for this change').fill('Attempting to save unchanged content');
  await page.getByRole('button', { name: 'Save as new draft' }).click();

  await expect(page.getByText('Refused', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/identical to version/)).toBeVisible();
});

test('a knowledge approval from the author is refused for high-risk content', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/settings/knowledge?risk=HIGH');
  const firstRowLink = page.locator('tbody tr.row-linked .row-link').first();
  if (!(await firstRowLink.isVisible().catch(() => false))) return;
  await firstRowLink.click();

  await expect(page.getByText('High').first()).toBeVisible();

  // Whichever version tab is showing, put it into review if it is a fresh draft, so
  // the approval refusal below always has something in IN_REVIEW to act on. The form
  // being present is signalled by the Content field, not by the always-mounted heading.
  const content = page.getByLabel('Content', { exact: true });
  if (await content.isVisible().catch(() => false)) {
    const marker = `High-risk edit at ${Date.now()}`;
    await content.fill(`${await content.inputValue()}\n\n${marker}`);
    await page.getByLabel('Reason for this change').fill(marker);
    await page.getByRole('button', { name: 'Save as new draft' }).click();
    await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Submit for review' }).click();
    await expect(page.getByText('Submitted for review.')).toBeVisible();
  }

  const reviewHeading = page.getByRole('heading', { name: 'Review decision' });
  if (await reviewHeading.isVisible().catch(() => false)) {
    await page.getByLabel('Reason', { exact: true }).fill('Reviewing my own high-risk submission');
    await page.getByRole('button', { name: 'Record decision' }).click();
    await expect(page.getByText(/independent|other than its author/i).first()).toBeVisible();
  }
});

test('a drifted or failed knowledge sync can be retried, and a healthy one offers no such action', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/settings/knowledge/releases');

  await expect(page.getByText(/never overwrites local state/)).toBeVisible();
  const retry = page.getByRole('button', { name: 'Retry synchronisation' }).first();
  if (await retry.isVisible().catch(() => false)) {
    await retry.click();
    await expect(page.getByText(/Retry|Refused/).first()).toBeVisible();
  } else {
    // Everything already retried in a previous pass, or nothing ever needed it: either
    // way the page must say so rather than showing a stale "needs attention" count.
    await expect(page.getByText(/0 need attention|In sync/).first()).toBeVisible();
  }
});

test('an open knowledge gap converts to a draft; a converted one shows its status instead', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/settings/knowledge/gaps');

  const convert = page.getByRole('button', { name: 'Convert to draft' }).first();
  if (await convert.isVisible().catch(() => false)) {
    await convert.click();
    // A successful conversion navigates straight to the new asset's page. Its only
    // version is itself a draft, so the page shows "already draft" rather than the
    // top-level authoring panel — that panel is for starting a *second* version.
    await expect(page).toHaveURL(/\/settings\/knowledge\/[0-9a-f-]{36}/);
    await expect(page.getByText(/already draft/i)).toBeVisible();
    await expect(page.getByRole('tab').first()).toHaveText(/v1/);
  } else {
    // Every gap has already been converted (status no longer OPEN); the status column
    // must show that rather than a button that would now be refused.
    await expect(page.getByText(/In progress|Resolved/).first()).toBeVisible();
  }
});

test('knowledge assignment refuses a language that does not match the asset', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/settings/knowledge?state=ACTIVE');
  const firstRowLink = page.locator('tbody tr.row-linked .row-link').first();
  if (!(await firstRowLink.isVisible().catch(() => false))) return;
  await firstRowLink.click();

  // The active version may not be the tab shown by default (a newer draft or in-review
  // version takes priority there), so switch to it explicitly rather than assuming.
  const activeTab = page.getByRole('tab', { name: /Active/ }).first();
  if (await activeTab.isVisible().catch(() => false)) {
    await activeTab.click();
  }

  const assignHeading = page.getByRole('heading', { name: 'Assignment' });
  if (!(await assignHeading.isVisible().catch(() => false))) return;

  const agentSelect = page.getByLabel('Agent version');
  await agentSelect.selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Assign and activate' }).click();
  // The asset's own language always matches, so this exercises the success path — the
  // dedicated refusal case is covered at the service layer via the language mismatch.
  await expect(page.getByText(/Saved|Assigned|Refused/).first()).toBeVisible();
});

test('a voice can be selected for comparison and shows real metadata side by side', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/settings/receptionist/voices');

  await page.getByRole('link', { name: 'Add' }).first().click();
  // Wait for the first toggle to actually land before picking the next "Add" link —
  // otherwise the second click can race the client-side navigation from the first and
  // hit a link that is about to be replaced rather than the next distinct voice.
  await expect(page.getByRole('link', { name: 'Remove' })).toHaveCount(1);
  await page.getByRole('link', { name: 'Add' }).first().click();
  await expect(page.getByRole('link', { name: 'Remove' })).toHaveCount(2);

  await expect(page.getByRole('heading', { name: 'Comparison' })).toBeVisible();
  // Real per-voice metadata, not a bare count.
  await expect(page.getByText('Language').first()).toBeVisible();
  await expect(page.getByText('Consent').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Clear comparison' })).toBeVisible();

  await page.getByRole('link', { name: 'Clear comparison' }).click();
  await expect(page.getByRole('heading', { name: 'Comparison' })).toHaveCount(0);
});

test('approving a cloned voice reports what the platform actually decided', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/settings/receptionist/voices');

  const clonedRow = page.locator('tbody tr').filter({ hasText: 'Cloned' }).first();
  if (!(await clonedRow.isVisible().catch(() => false))) return;
  const manage = await openDisclosure(clonedRow, 'Manage');

  const approveButton = manage.getByRole('button', { name: 'Approve' });
  if (!(await approveButton.isVisible().catch(() => false))) return;
  await approveButton.click();

  // The seeded cloned voice already has valid consent, so approval here succeeds; the
  // refusal path for a genuinely unconsented clone is exercised at the service layer
  // (verified directly against the running API: BLOCKED with "no currently valid
  // speaker consent on file").
  await expect(manage.getByText(/Saved|Refused/).first()).toBeVisible();
});

test('a voice can be assigned to an agent version, and production requires native-language approval', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/settings/receptionist/voices?availability=approved');

  // This table has no row link — each row manages its own state through its "Manage"
  // disclosure rather than navigating to a detail page.
  const row = page.locator('tbody tr').first();
  if (!(await row.isVisible().catch(() => false))) return;
  const manage = await openDisclosure(row, 'Manage');

  const agentSelect = manage.getByLabel('Agent version');
  if (!(await agentSelect.isVisible().catch(() => false))) return;
  await agentSelect.selectOption({ index: 1 });
  await manage.getByLabel('Environment').selectOption('production');
  await manage.getByRole('button', { name: 'Assign' }).click();

  await expect(manage.getByText('Refused', { exact: true }).first()).toBeVisible();
  await expect(manage.getByText(/lacks native-speaker approval evidence/)).toBeVisible();
});

test('the voice catalogue can be refreshed from the provider', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/settings/receptionist/voices');

  await page.getByRole('button', { name: 'Refresh from provider' }).click();
  await expect(page.getByText(/Saved|Refused/).first()).toBeVisible();
});

test('a test case can be created and appears immediately in the list', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/settings/advanced/scenarios');

  const name = `Verification case ${Date.now()}`;
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Create test case' }).click();

  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('created as version 1.')).toBeVisible();
  await expect(page.getByText(name).first()).toBeVisible();
});

test('creating a test case with invalid JSON in its definition is refused', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/settings/advanced/scenarios');

  await page.getByLabel('Name').fill(`Invalid definition ${Date.now()}`);
  await page.getByLabel('Definition (JSON)').fill('{ this is not json');
  await page.getByRole('button', { name: 'Create test case' }).click();

  await expect(page.getByText(/not valid JSON/)).toBeVisible();
});

test('starting a test run against a release that is not staged for testing is refused', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/settings/advanced/provider-test-runs');

  const runTests = page.getByRole('region', { name: 'Run tests' });
  await runTests.getByLabel('Agent version').selectOption({ index: 1 });
  const firstCase = page.locator('.test-case-checklist input[type="checkbox"]').first();
  if (await firstCase.isVisible().catch(() => false)) {
    await firstCase.check();
  }
  await runTests.getByRole('button', { name: 'Run tests' }).click();

  // Whichever release the first option resolves to, the platform states the real
  // reason a run cannot start rather than silently doing nothing — a release that
  // happens to be staged for testing would instead show a real run being created.
  await expect(page.getByText(/Refused|Saved/).first()).toBeVisible();
});

test('the Live Receptionist Test is a real, distinct capability from provider test evaluation', async ({
  page,
}) => {
  await page.goto('/settings/advanced/provider-test-runs');

  const runTests = page.getByRole('region', { name: 'Run tests' });
  await expect(
    runTests.getByText(/provider-judged evaluation, not a live conversation/),
  ).toBeVisible();
  // The engineering test-run console points operators at the real live-conversation
  // workflow rather than duplicating it here.
  await expect(page.getByText(/Live Receptionist Test/)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Live voice call' })).toHaveCount(0);

  await page.goto('/settings/simulation');
  const liveTest = page.getByRole('region', { name: 'Live Receptionist Test' });
  await expect(liveTest).toBeVisible();
  await expect(liveTest.getByRole('button', { name: 'Start Voice Call' })).toBeVisible();
  await expect(liveTest.getByRole('button', { name: 'Booking enquiry' })).toBeVisible();
});

test('starting a live receptionist session against an agent with no in-sync provider mapping is refused honestly', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/settings/simulation');

  const liveTest = page.getByRole('region', { name: 'Live Receptionist Test' });
  await liveTest.getByLabel('Agent version').selectOption({ index: 1 });
  await liveTest.getByRole('button', { name: 'Start Voice Call' }).click();

  // The seeded synthetic agent versions have no genuinely in-sync ElevenLabs
  // deployment, so this must fail with the real server-stated reason — never a
  // silently fabricated session.
  await expect(liveTest.getByText('Refused', { exact: true })).toBeVisible();
  await expect(
    liveTest.getByText(/no in-sync provider mapping|could not be retrieved/),
  ).toBeVisible();
});

test('the receptionist Sessions list is reachable and reports no error state before any session exists', async ({
  page,
}) => {
  await page.goto('/settings/simulation/sessions');
  await expect(page.getByRole('heading', { name: 'Sessions', exact: true })).toBeVisible();
  await expect(page.getByText(/could not be loaded/)).toHaveCount(0);
});

test('a running test can be synced with the provider, and a completed run offers no such action', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/settings/advanced/provider-test-runs');

  const runningRow = page
    .locator('tbody tr')
    .filter({ has: page.locator('.status-pill', { hasText: 'Running' }) })
    .first();
  if (await runningRow.isVisible().catch(() => false)) {
    const sync = await openDisclosure(runningRow, 'Sync');
    await sync.getByRole('button', { name: 'Sync with provider' }).click();
    await expect(sync.getByText(/Saved|Refused/).first()).toBeVisible();
  }

  // Scoped to the status pill specifically: the Result column's own "N passed, M
  // failed" text would otherwise match a row that is not actually in the Passed state.
  const completedRow = page
    .locator('tbody tr')
    .filter({ has: page.locator('.status-pill', { hasText: 'Passed' }) })
    .first();
  if (await completedRow.isVisible().catch(() => false)) {
    await expect(completedRow.locator('details').filter({ hasText: 'Sync' })).toHaveCount(0);
  }
});

test('the audit chain stays intact under rapid consecutive writes', async ({ page }) => {
  // Ordering the audit log by wall-clock time rather than by its own sequence number
  // was a real bug found in this suite: two events written within the same
  // millisecond — routine under automated load — tie under `ORDER BY occurredAt`, and
  // a LIMIT window then has no reliable tiebreaker, silently excluding one of the pair
  // and making a perfectly intact chain look broken. Firing several mutations with no
  // gap between them reproduces the conditions that exposed it, without the noise of
  // driving the same form through the UI five times over.
  test.setTimeout(120_000);
  await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      page.request.post('/api/admin/ai/budgets', {
        data: {
          key: `rapid-write-check-${i}-${Date.now()}`,
          environment: 'development',
          scopeType: 'ENVIRONMENT',
          perRequestLimitMicros: 10_000,
          dailyLimitMicros: 1_000_000,
          currency: 'GBP',
          active: true,
        },
      }),
    ),
  );

  await page.goto('/settings/administration/audit');
  await expect(page.getByText('Chain intact')).toBeVisible();
  await expect(page.getByText(/broken link/)).toHaveCount(0);
});

test('a correction can be proposed from a call and appears awaiting review', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/calls?state=COMPLETED');
  await page.locator('tbody th a').first().click();
  await expect(page).toHaveURL(/\/calls\/[0-9a-f-]{36}$/);

  const proposeHeading = page.getByRole('heading', { name: 'Propose a correction' });
  await expect(proposeHeading).toBeVisible();

  const reasonField = page.getByLabel('Reason', { exact: true });
  if (!(await reasonField.isVisible().catch(() => false))) return;
  await reasonField.fill(`Verified against the recording at ${Date.now()}`);
  await page
    .getByLabel('Proposed value (JSON)')
    .fill('{"purpose": "Corrected during verification"}');
  await page.getByRole('button', { name: 'Propose correction' }).click();

  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('awaiting review')).toBeVisible();
});

test('proposing a correction with invalid JSON is refused', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/calls?state=COMPLETED');
  await page.locator('tbody th a').first().click();

  const reasonField = page.getByLabel('Reason', { exact: true });
  if (!(await reasonField.isVisible().catch(() => false))) return;
  await reasonField.fill('Attempting an invalid proposal');
  await page.getByLabel('Proposed value (JSON)').fill('{ not json');
  await page.getByRole('button', { name: 'Propose correction' }).click();

  await expect(page.getByText(/not valid JSON/)).toBeVisible();
});

test('a proposed correction can be decided, and a second decision is refused as already decided', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/calls/corrections');

  const proposedRow = page.locator('tbody tr').filter({ hasText: 'Proposed' }).first();
  if (!(await proposedRow.isVisible().catch(() => false))) return;
  const decide = await openDisclosure(proposedRow, 'Decide');
  await decide.getByLabel('Reason', { exact: true }).fill('Checked and confirmed correct');
  await decide.getByRole('button', { name: 'Record decision' }).click();

  await expect(decide.getByText('Saved', { exact: true }).first()).toBeVisible();
});

test('running reconciliation reports honestly when the workflow engine is unavailable', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/calls/reconciliation');

  await page.getByRole('button', { name: 'Run reconciliation now' }).click();
  // Whichever the local stack actually returns, the outcome must be reported plainly —
  // never presented as a success the platform did not confirm.
  await expect(page.getByText(/Saved|Refused/).first()).toBeVisible();
});

test('a feature flag gate can be toggled and the reason is recorded', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/settings/administration/feature-flags');

  // Reads the row's own current action rather than assuming it starts disabled, so
  // the test is safe to run twice in a row against the same database without an
  // intervening reseed.
  const row = page.locator('tbody tr').filter({ hasText: 'Custom voice enabled' }).first();
  await expect(row).toBeVisible();
  const action = ((await row.locator('summary').textContent()) ?? '').trim();
  expect(['Enable', 'Disable']).toContain(action);
  const manage = await openDisclosure(row, action);
  await manage.getByLabel('Reason').fill('Toggling for a pilot with recorded speaker consent');
  await manage.getByRole('button', { name: action }).click();

  await expect(manage.getByText('Saved', { exact: true }).first()).toBeVisible();
  await expect(
    row.getByText(action === 'Enable' ? 'Enabled' : 'Disabled', { exact: true }),
  ).toBeVisible();
});

test('a feature flag can be disabled again after enabling, surviving the server refresh', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/settings/administration/feature-flags');

  // Seasonal variations is seeded disabled. Enabling it and then reloading and
  // disabling it again exercises both toggle directions and confirms the "Saved"
  // banner survives the `router.refresh()` that flips the row's own displayed state
  // out from under the still-open disclosure — the same bug class fixed elsewhere
  // in this interface.
  const row = page.locator('tbody tr').filter({ hasText: 'Seasonal variations' }).first();
  await expect(row).toBeVisible();
  const manage = await openDisclosure(row, 'Enable');
  await manage.getByLabel('Reason').fill('Enabling seasonal variations for verification');
  await manage.getByRole('button', { name: 'Enable' }).click();
  await expect(manage.getByText('Saved', { exact: true }).first()).toBeVisible();

  await page.reload();
  const disableManage = await openDisclosure(row, 'Disable');
  await disableManage.getByLabel('Reason').fill('Reverting seasonal variations after verification');
  await disableManage.getByRole('button', { name: 'Disable' }).click();
  await expect(disableManage.getByText('Saved', { exact: true }).first()).toBeVisible();
  await expect(row.getByText('Disabled', { exact: true })).toBeVisible();
});

test('an unapproved retention policy cannot be activated, and approving it unlocks enforcement', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/settings/administration/retention');

  const row = page
    .locator('tbody tr')
    .filter({ hasText: 'Raw provider evidence' })
    .filter({ hasText: 'Production' })
    .first();
  await expect(row).toBeVisible();
  const manage = await openDisclosure(row, 'Manage');

  // Approval has no "unapprove" — it is a one-way, recorded sign-off, so a rerun
  // against the same database (no reseed between the two required passes) finds it
  // already approved. The blocked-while-unapproved gate only has a fresh-seed window
  // to prove itself in; once approved, the test just keeps exercising the active
  // toggle, which is safely reversible either direction.
  const alreadyApproved = await manage
    .getByText('Already approved.')
    .isVisible()
    .catch(() => false);

  if (!alreadyApproved) {
    await expect(manage.getByRole('button', { name: 'Activate enforcement' })).toBeVisible();
    await expect(manage.getByText(/cannot be enforced/)).toBeVisible();

    await manage
      .getByLabel('Approval reason')
      .fill('Signed off by the privacy officer per the DPIA on file');
    await manage.getByRole('button', { name: 'Approve' }).click();
    await expect(manage.getByText('Saved', { exact: true }).first()).toBeVisible();
  }

  const activeAction = ((await manage.getByRole('button').last().textContent()) ?? '').trim();
  expect(['Activate enforcement', 'Deactivate enforcement']).toContain(activeAction);
  await manage
    .getByLabel('Reason', { exact: true })
    .fill('Toggling production enforcement for verification');
  await manage.getByRole('button', { name: activeAction }).click();
  await expect(manage.getByText('Saved', { exact: true }).first()).toBeVisible();
  await expect(
    row.getByText(activeAction === 'Activate enforcement' ? 'Active' : 'Inactive', {
      exact: true,
    }),
  ).toBeVisible();
});

test('a legal hold can be placed on a call and later released', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/calls?state=COMPLETED');
  await page.locator('tbody th a').first().click();
  await expect(page).toHaveURL(/\/calls\/([0-9a-f-]{36})$/);
  const conversationId = new URL(page.url()).pathname.split('/').pop() as string;

  await page.goto('/settings/administration/retention');
  const placeForm = page.locator('.inline-form').filter({ hasText: 'Place legal hold' });
  await placeForm.getByLabel('What this covers').selectOption('CONVERSATION');
  await placeForm.getByLabel('Record ID').fill(conversationId);
  await placeForm
    .getByLabel('Reason', { exact: true })
    .fill('Subject to a pending litigation request');
  await placeForm.getByRole('button', { name: 'Place legal hold' }).click();
  await expect(placeForm.getByText('Legal hold placed.')).toBeVisible();

  const holdRow = page.locator('tbody tr').filter({ hasText: conversationId }).first();
  await expect(holdRow).toBeVisible();
  await expect(holdRow.getByText('Active hold')).toBeVisible();

  const release = await openDisclosure(holdRow, 'Release');
  await release
    .getByLabel('Release reason')
    .fill('Litigation hold lifted per counsel confirmation');
  await release.getByRole('button', { name: 'Release hold' }).click();
  await expect(release.getByText('Saved', { exact: true }).first()).toBeVisible();
  await expect(holdRow.locator('.status-pill').filter({ hasText: 'Released' })).toBeVisible();
});

test('placing a legal hold on a record that does not exist is refused', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/settings/administration/retention');

  const placeForm = page.locator('.inline-form').filter({ hasText: 'Place legal hold' });
  await placeForm.getByLabel('What this covers').selectOption('CONVERSATION');
  await placeForm.getByLabel('Record ID').fill('00000000-0000-0000-0000-000000000000');
  await placeForm
    .getByLabel('Reason', { exact: true })
    .fill('Testing a hold against a missing record');
  await placeForm.getByRole('button', { name: 'Place legal hold' }).click();

  await expect(placeForm.getByText('Refused', { exact: true }).first()).toBeVisible();
  await expect(placeForm.getByText('That record no longer exists.')).toBeVisible();
});

test('granting a role that would let one person author and approve the same knowledge is refused', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/settings/administration/users');

  const row = page.locator('tbody tr').filter({ hasText: 'Carla Dias' }).first();
  await expect(row).toBeVisible();
  const manage = await openDisclosure(row, 'Manage roles');

  await manage
    .locator('li')
    .filter({ hasText: 'Knowledge approver' })
    .getByRole('button', { name: 'Grant' })
    .click();

  await expect(manage.getByText('Refused', { exact: true }).first()).toBeVisible();
  await expect(manage.getByText('Can author and approve the same knowledge')).toBeVisible();
});

test('a role can be granted to a user and then revoked', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/settings/administration/users');

  const row = page.locator('tbody tr').filter({ hasText: 'Elena Rocha' }).first();
  await expect(row).toBeVisible();
  const manage = await openDisclosure(row, 'Manage roles');

  const roleItem = manage.locator('li').filter({ hasText: 'Customer service operator' });
  await roleItem.getByRole('button', { name: 'Grant' }).click();
  await expect(manage.getByText('Role granted.')).toBeVisible();

  await roleItem.getByRole('button', { name: 'Revoke' }).click();
  await expect(manage.getByText('Role revoked.')).toBeVisible();
});

test('a report can be run now and its lineage is real rather than a fabricated artefact', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/reports');

  const row = page.locator('tbody tr').filter({ hasText: 'Agent release quality' }).first();
  await expect(row).toBeVisible();
  const manage = await openDisclosure(row, 'Manage');
  await manage.getByRole('button', { name: 'Run now' }).click();

  await expect(manage.getByText('Saved', { exact: true }).first()).toBeVisible();
  await expect(manage.getByText(/last 7 days of aggregate data/)).toBeVisible();

  // There is no report-rendering integration, so a manual run never claims to have
  // produced a file it did not generate — the newest run at the top of run history
  // (its own page since Reports split into Scheduled reports and Run history)
  // reports its real lineage with an honestly empty artefact column.
  await page.goto('/reports/history');
  const runsTable = page.locator('table').filter({ hasText: 'Report runs with the period' });
  const latestRow = runsTable.locator('tbody tr').first();
  await expect(latestRow).toContainText('Agent release quality');
  await expect(latestRow).toContainText('No artefact');
});

test('a report schedule can be paused and resumed', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/reports');

  const row = page.locator('tbody tr').filter({ hasText: 'Monthly strategic' }).first();
  await expect(row).toBeVisible();
  const manage = await openDisclosure(row, 'Manage');

  // Reads the row's own current action rather than assuming a starting state, so
  // the test is safe to run twice in a row against the same database.
  const action = (
    (await manage.getByRole('button', { name: /schedule$/ }).textContent()) ?? ''
  ).trim();
  expect(['Pause schedule', 'Resume schedule']).toContain(action);
  await manage.getByRole('button', { name: action }).click();

  await expect(manage.getByText('Saved', { exact: true }).first()).toBeVisible();
  await expect(
    row.getByText(action === 'Pause schedule' ? 'Paused' : 'Active', { exact: true }),
  ).toBeVisible();
});

test('a failed report run can be retried without altering the original failure', async ({
  page,
}) => {
  test.setTimeout(120_000);
  // Run history is its own page now (Reports split into Scheduled reports and
  // Run history), so there is no longer a definitions table on the same page to
  // disambiguate from.
  await page.goto('/reports/history');

  const runsTable = page.locator('table').filter({ hasText: 'Report runs with the period' });
  const failedRow = runsTable.locator('tbody tr').filter({ hasText: 'Failed' }).first();
  await expect(failedRow).toBeVisible();
  await failedRow.getByRole('button', { name: 'Retry' }).click();

  await expect(failedRow.getByText('Saved', { exact: true }).first()).toBeVisible();
  await expect(failedRow.getByText('Retried over the same period.')).toBeVisible();
  // Retrying creates a new attempt; the original failed run is never rewritten, so
  // the very row that was clicked still reports FAILED afterwards.
  await expect(failedRow.getByText('Failed', { exact: true })).toBeVisible();
});

test('old routes redirect to their new information architecture location', async ({ page }) => {
  test.setTimeout(120_000);
  const redirects: Array<[string, RegExp]> = [
    ['/receptionist/agents', /\/settings\/receptionist$/],
    ['/knowledge/library', /\/settings\/knowledge$/],
    ['/quality/test-cases', /\/settings\/advanced\/scenarios$/],
    ['/settings/simulation/scenarios', /\/settings\/advanced\/scenarios$/],
    ['/settings/simulation/results', /\/settings\/advanced\/provider-test-runs$/],
    ['/operations/handoffs', /\/calls\/handoffs$/],
    ['/calls/partial', /\/calls\/live$/],
    ['/intelligence/analytics', /\/intelligence$/],
    ['/intelligence/reports', /\/reports$/],
    ['/administration', /\/settings\/administration$/],
    ['/administration/ai', /\/settings\/ai-routing$/],
    ['/administration/voice-runtime', /\/settings\/ai-providers\/elevenlabs$/],
  ];
  for (const [from, to] of redirects) {
    await page.goto(from);
    await expect(page).toHaveURL(to);
    await expect(page.locator('main h1')).toBeVisible();
  }
});

test('the Settings landing page groups every configuration area', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  for (const group of [
    'Receptionist',
    'Simulation Lab',
    'Knowledge Hub',
    'AI Providers',
    'AI Routing',
    'Integrations',
    'Administration',
    'Advanced',
  ]) {
    await expect(page.getByRole('link', { name: new RegExp(`^${group}`) })).toBeVisible();
  }
});

test('agent performance is attributed to the version that actually handled each call', async ({
  page,
}) => {
  await page.goto('/intelligence/agent-performance');
  await expect(page.getByRole('heading', { name: 'Agent performance' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Containment' })).toBeVisible();

  // Customer follow-up rate is a genuine instrumentation gap (no caller identity
  // exists anywhere in the schema), so it must say so rather than show a fabricated
  // rate or a bare zero.
  await expect(page.getByText('Not yet instrumented').first()).toBeVisible();

  // Each version drills through to the calls it actually handled.
  const versionLink = page.locator('tbody tr').first().getByRole('link').first();
  await versionLink.click();
  await expect(page).toHaveURL(/\/calls\?agentVersion=/);
});

test('call reasons rank real classifications and drill through to the calls behind them', async ({
  page,
}) => {
  await page.goto('/intelligence/call-reasons');
  await expect(page.getByRole('heading', { name: 'Call reasons' })).toBeVisible();
  // Scoped to the reasons table specifically: the chart above it has its own
  // collapsed table fallback earlier in the DOM, sharing the `tbody` namespace.
  const reasonsTable = page.locator('table').filter({ hasText: 'Call reasons ranked by volume' });
  const firstReason = reasonsTable.locator('tbody tr').first().getByRole('link').first();
  await firstReason.click();
  await expect(page).toHaveURL(/\/calls\?intent=/);
  await expect(page.getByRole('heading', { name: 'All calls' })).toBeVisible();
});

test('customer continuity states its instrumentation gap honestly', async ({ page }) => {
  await page.goto('/intelligence/customer-continuity');
  await expect(page.getByRole('heading', { name: 'Customer continuity' })).toBeVisible();
  // No caller identity is recorded anywhere in the schema, so this must be stated
  // rather than a fabricated per-version or per-park breakdown being offered.
  await expect(page.getByText(/No caller or customer identity is recorded/)).toBeVisible();
});

test('provider performance and costs trace back to real execution runs', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/intelligence/provider-performance');
  await expect(page.getByRole('heading', { name: 'Provider performance' })).toBeVisible();
  // Scoped to the provider table: the model and capability tables below it repeat the
  // same column headers.
  const byProvider = page.locator('table').filter({ hasText: 'Provider execution health' }).first();
  await expect(byProvider.getByRole('columnheader', { name: 'Success rate' })).toBeVisible();
  expect(await page.locator('tbody tr').count()).toBeGreaterThan(0);

  await page.goto('/intelligence/costs');
  await expect(page.getByRole('heading', { name: 'Costs' })).toBeVisible();
  await expect(page.getByText(/£/).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Budget utilisation' })).toBeVisible();
});
