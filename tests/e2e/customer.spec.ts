import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('public handoff landing is clear and accessible', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Continue where your call left off.' }),
  ).toBeVisible();
  await expect(page.getByText('Your call does not authorize changes')).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('secure registration never claims an account or booking was created', async ({ page }) => {
  await page.goto('/handoff/qp_local_handoff_token_000000000001');
  await expect(page.getByRole('heading', { name: 'Tell us how to reach you' })).toBeVisible();
  await expect(page.getByText('Submitting does not create or change a booking')).toBeVisible();
});
