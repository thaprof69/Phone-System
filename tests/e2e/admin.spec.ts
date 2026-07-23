import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('admin overview exposes product boundary and readiness', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Good afternoon/ })).toBeVisible();
  await expect(page.getByText('Quantum Parks is authoritative')).toBeVisible();
  await expect(page.getByText('Production is externally blocked')).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('all primary control-plane areas are reachable by keyboard', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Knowledge Hub' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Knowledge Hub' })).toBeVisible();
  await expect(page.getByText('No approved company knowledge')).toBeVisible();
  await page.getByText('Create knowledge draft').click();
  await expect(page.getByLabel('Approved factual content')).toBeVisible();
});

test('mobile navigation exposes every daily operations area', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('summary[aria-label="Open navigation"]').click();
  const mobileNavigation = page.getByRole('navigation', { name: 'Mobile primary navigation' });
  await expect(mobileNavigation).toBeVisible();
  await mobileNavigation.getByRole('link', { name: 'Test Studio' }).click();
  await expect(page.getByRole('heading', { name: 'Test Studio' })).toBeVisible();
  await expect(page.getByText('Create versioned test case')).toBeVisible();
});

test('administrator securely validates, connects, manages, and disconnects ElevenLabs', async ({
  page,
}) => {
  await page.goto('/administration');
  const integration = page.getByRole('heading', { name: 'ElevenLabs' });
  await expect(integration).toBeVisible();
  await page.getByRole('button', { name: 'Connect' }).click();
  await page.getByLabel('Connection label').fill('Quantum Parks simulator');
  await page.getByLabel('Environment').selectOption('SANDBOX');
  await page.getByPlaceholder('Enter API key').fill('synthetic-api-key');
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText(/Verified workspace access/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save connection' })).toBeEnabled();
  await page.getByRole('button', { name: 'Save connection' }).click();
  await expect(page.getByText('Connection saved securely.')).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.getByText('CONNECTED')).toBeVisible();
  await expect(page.getByText(/EL-[A-F0-9]{8}/)).toBeVisible();
  await expect(page.locator('body')).not.toContainText('synthetic-api-key');

  await page.getByRole('button', { name: 'Manage' }).click();
  await page.getByRole('button', { name: 'Test stored connection' }).click();
  await expect(page.getByText('The stored credential is healthy.')).toBeVisible();
  await page.getByRole('button', { name: 'Disconnect' }).click();
  await page.getByRole('button', { name: 'Confirm disconnect' }).click();
  await expect(
    page.getByText(/Local agents, transcripts, releases, and audit history were preserved/),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.getByText('DISCONNECTED')).toBeVisible();
});
