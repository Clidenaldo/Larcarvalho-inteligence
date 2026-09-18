import { expect, test, type Page } from '@playwright/test';
import { commercialE2e } from './commercial-fixture';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(commercialE2e.email);
  await page.locator('input[type="password"]').fill(commercialE2e.password);
  await page.getByRole('button', { name: /entrar/i }).click();
  await expect(page).toHaveURL(/dashboard/, { timeout: 60_000 });
}

test.describe('Gestao Comercial', () => {
  test('carrega fatos, drill-down, periodo e Copiloto no Chromium', async ({ page }) => {
    test.setTimeout(60_000);
    await login(page);
    await page.goto('/dashboard/gestao-comercial');
    const response = await page.request.get('/api/commercial-intelligence/overview?period=30d&scope=ALL');
    expect(response.ok()).toBe(true);
    const payload = await response.json() as Record<string, unknown>;
    expect(payload).toHaveProperty('summary'); expect(payload).toHaveProperty('pipeline'); expect(payload).toHaveProperty('financial');
    await expect(page.getByRole('heading', { name: 'Gestao Comercial', level: 2 })).toBeVisible();
    await expect(page.getByText('Pipeline factual')).toBeVisible();
    await page.locator('select[name="period"]').selectOption('7d');
    await page.getByRole('button', { name: 'Aplicar' }).click();
    await expect(page).toHaveURL(/period=7d/);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Abrir Larcarvalho AI' }).click();
    await expect(page.getByRole('dialog', { name: /Copiloto Comercial/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Resumir gestao' })).toBeVisible();
    await page.getByRole('button', { name: 'Fechar Larcarvalho AI' }).click();
    await page.getByRole('link', { name: /^\d+ Clientes ativos Estado atual$/ }).click();
    await expect(page).toHaveURL(/dashboard\/carteira/);
  });

  test('permanece utilizavel em viewport mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page); await page.goto('/dashboard/gestao-comercial');
    await expect(page.getByRole('heading', { name: 'Gestao Comercial', level: 2 })).toBeVisible();
    await expect(page.getByText('Pipeline factual')).toBeVisible();
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(390);
  });
});
