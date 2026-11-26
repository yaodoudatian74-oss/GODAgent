import { test, expect } from '@playwright/test';

test('loads the app with sidebar bots and a chat', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.bot-row').first()).toBeVisible();
  await expect(page.locator('.chat-header .title')).toBeVisible();
  await expect(page.locator('.composer textarea')).toBeVisible();
});

test('sending a message streams a bot reply', async ({ page }) => {
  await page.goto('/');
  await page.locator('.bot-row', { hasText: 'Inbox Manager' }).click();
  await expect(page.locator('.chat-header .title')).toHaveText('Inbox Manager');
  const countBefore = await page.locator('.bubble.bot').count();
  await page.locator('.composer textarea').fill('hello, what can you do?');
  await page.locator('.composer textarea').press('Enter');
  await expect(page.locator('.bubble.user').last()).toContainText('hello', { timeout: 8000 });
  await expect.poll(() => page.locator('.bubble.bot').count(), { timeout: 10000 }).toBeGreaterThan(countBefore);
});

test('computer + approval flow renders cards and resolves', async ({ page }) => {
  await page.goto('/');
  await page.locator('.bot-row', { hasText: 'Sales Outbound' }).click();
  await page.locator('.composer textarea').fill('run overnight research and outreach for the pipeline');
  await page.locator('.composer textarea').press('Enter');
  await expect(page.locator('.card2', { hasText: 'Computer' }).first()).toBeVisible({ timeout: 10000 });
  const approval = page.locator('.card2', { hasText: 'Approval' });
  await expect(approval).toBeVisible({ timeout: 10000 });
  await approval.getByRole('button', { name: /Allow/ }).first().click();
  await expect(approval.locator('.pill-badge.done')).toBeVisible({ timeout: 6000 });
});

test('creating a bot adds it to the sidebar', async ({ page }) => {
  await page.goto('/');
  const before = await page.locator('.bot-row').count();
  await page.locator('.sidebar-top .icon-btn').click();
  await page.locator('.modal input').first().fill('E2E Bot');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.locator('.chat-header .title', { hasText: 'E2E Bot' })).toBeVisible();
  expect(await page.locator('.bot-row').count()).toBeGreaterThanOrEqual(before + 1);
});

test('avatar states preview shows six states', async ({ page }) => {
  await page.goto('/');
  await page.locator('.sidebar-foot .icon-btn').click();
  await page.getByRole('button', { name: 'Bot', exact: true }).click();
  await page.getByRole('button', { name: /Preview avatar states/ }).click();
  await expect(page.locator('.state-cell')).toHaveCount(6);
});

test('dark mode applies', async ({ page }) => {
  await page.goto('/');
  await page.locator('.sidebar-foot .icon-btn').click();
  await page.getByRole('button', { name: 'dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
