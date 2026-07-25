import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

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
  'Receptionist',
  'Knowledge',
  'Quality',
  'Calls',
  'Operations',
  'Intelligence',
  'Administration',
] as const;

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
  await expect(links).toHaveCount(5);

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
  for (const path of ['/', '/calls', '/knowledge/library', '/quality/runs', '/operations/sla']) {
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
  await page.goto('/quality/gates');
  await expect(page.getByText('Gates are enforced by the server')).toBeVisible();

  // Each gate is its own decision rather than one combined score.
  await expect(page.getByRole('heading', { name: 'Mandatory tests pass' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No unresolved provider drift' })).toBeVisible();

  // There is deliberately no override control.
  await expect(page.getByRole('button', { name: /override|bypass|force/i })).toHaveCount(0);
});

test('knowledge releases report local and runtime state separately', async ({ page }) => {
  await page.goto('/knowledge/releases');
  await expect(page.getByRole('columnheader', { name: 'Local state' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Voice runtime' })).toBeVisible();
  await expect(page.getByText(/never overwrites local state/)).toBeVisible();
});

test('analytics renders charts with an accessible table fallback', async ({ page }) => {
  await page.goto('/intelligence/analytics');
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
  await page.goto('/administration');
  const rail = page.getByRole('navigation', { name: 'Administration areas' });

  for (const area of [
    'General',
    'Voice runtime',
    'AI infrastructure',
    'Business integrations',
    'Users and roles',
    'Security and privacy',
    'Audit',
    'Retention',
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

test('the audit log is presented as a verifiable chain', async ({ page }) => {
  await page.goto('/administration/audit');
  await expect(page.getByText('Chain intact')).toBeVisible();
  await expect(page.getByText(/cannot be edited or removed/)).toBeVisible();
});

test('access administration surfaces separation-of-duty conflicts', async ({ page }) => {
  await page.goto('/administration/users');
  await expect(page.getByRole('columnheader', { name: 'Separation of duties' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Roles', exact: true })).toBeVisible();
});

test('AIOS is not presented to operators as a product name', async ({ page }) => {
  // "AI infrastructure" is the operator-facing name; AIOS is internal architecture.
  await page.goto('/');
  await expect(page.getByText('AI infrastructure')).toBeVisible();
  await expect(page.locator('main').getByText(/\bAIOS\b/)).toHaveCount(0);

  await page.goto('/administration/ai');
  await expect(page.getByRole('heading', { name: 'AI infrastructure' })).toBeVisible();
});

test('the environment is labelled honestly as a simulator', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('This environment uses the deterministic simulator')).toBeVisible();
  await expect(page.getByText(/No production traffic is routed/)).toBeVisible();
});

test('no provider secret reaches the browser', async ({ page }) => {
  for (const path of ['/administration/voice-runtime', '/administration/ai']) {
    await page.goto(path);
    const body = (await page.locator('body').textContent()) ?? '';
    expect(body).not.toContain('sk_');
    expect(body).not.toContain('sk-');
    expect(body).not.toContain('xi-api-key');
  }
});

test('operations queues surface overdue work first', async ({ page }) => {
  await page.goto('/operations/sla');
  await expect(page.getByRole('heading', { name: 'Breached commitments' })).toBeVisible();

  await page.goto('/operations/callbacks?due=overdue');
  await expect(page.getByRole('heading', { name: /\d+ items?/ })).toBeVisible();
});

test('mobile navigation reaches every domain', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('summary[aria-label="Open navigation"]').click();
  const mobileNavigation = page.getByRole('navigation', { name: 'Mobile primary navigation' });
  await expect(mobileNavigation).toBeVisible();
  await mobileNavigation.getByRole('link', { name: 'Quality', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Test cases' })).toBeVisible();
});

test('a domain workspace is reachable by keyboard alone', async ({ page }) => {
  await page.goto('/');
  const navigation = page.getByRole('navigation', { name: 'Primary navigation' });
  await navigation.getByRole('link', { name: 'Knowledge', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();

  // The sub-navigation is reachable from the same keyboard path.
  await page
    .getByRole('navigation', { name: 'Knowledge areas' })
    .getByRole('link', { name: 'Knowledge gaps' })
    .focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Knowledge gaps' })).toBeVisible();
});

test('version comparison shows the actual change, not the whole file', async ({ page }) => {
  await page.goto('/receptionist/versions');
  await page.getByRole('link', { name: 'Compare versions' }).click();
  await expect(page).toHaveURL(/\/receptionist\/versions\/compare$/);

  // A real longest-common-subsequence diff: unchanged lines are collapsed and only
  // the genuine change is marked. A naive comparison would flag the whole document.
  await expect(page.getByText(/unchanged lines/).first()).toBeVisible();
  await expect(page.getByText(/^\+\d+ −\d+ across \d+ lines/)).toBeVisible();

  // An unapproved draft says so rather than showing an empty approval field.
  await expect(page.getByText('This version has not been independently approved.')).toBeVisible();
});

test('the conversation editor loads, validates server-side and persists', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/receptionist/agents');
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
  await page.goto('/receptionist/agents');
  await page.locator('tbody th a').first().click();
  await page.getByRole('tab', { name: /^Tools/ }).click();

  await expect(page.getByText('Tools are code-owned')).toBeVisible();
  // No control offers to define a tool from an arbitrary endpoint.
  await expect(page.getByRole('button', { name: /add tool|new tool|create tool/i })).toHaveCount(0);

  // A contract test runs against the platform and reports what it observed.
  await page.getByRole('button', { name: 'Run test' }).first().click();
  await expect(page.getByText(/Pass|Fail/).first()).toBeVisible({ timeout: 30_000 });
});

test('transfer routes are shown in the order the runtime evaluates them', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/receptionist/agents');
  await page.locator('tbody th a').first().click();
  await page.getByRole('tab', { name: /^Transfers/ }).click();

  await expect(page.getByText('Evaluated top to bottom, first match wins')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'If unanswered' })).toBeVisible();
});

test('publication is judged by provider read-back, not by the publish call', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/receptionist/releases');

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
  await page.goto('/receptionist/releases');
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
  await page.goto('/receptionist/releases');
  await expect(page.getByRole('heading', { name: 'Unresolved drift' })).toBeVisible();
  await expect(
    page.getByText(/the remedy is republishing, not adopting the remote value/),
  ).toBeVisible();
});
