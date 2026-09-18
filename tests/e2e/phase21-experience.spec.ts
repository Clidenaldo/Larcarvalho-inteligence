import { expect, test, type Page } from '@playwright/test';

import { commercialE2e } from './commercial-fixture';
import { navigateInApp } from './navigation';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(commercialE2e.email);
  await page.locator('input[type="password"]').fill(commercialE2e.password);
  await page.getByRole('button', { name: /entrar/i }).click();
  await expect(page).toHaveURL(/dashboard/, { timeout: 15_000 });
}

test('manages appearance, own account and help center', async ({ page }) => {
  test.setTimeout(90_000);
  await login(page);

  await page.goto('/configuracoes/aparencia');
  await expect(
    page.getByRole('heading', { level: 2, name: 'Aparência' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Painel administrativo', exact: true })
    .click();
  await page.locator('input[name="commercialName"]').fill('Larcarvalho E2E');
  await page.getByRole('button', { name: 'Salvar marca' }).click();
  await expect(page.getByText('Aparência salva com sucesso.')).toBeVisible();

  await navigateInApp(page, 'Minha conta');
  await expect(
    page.getByRole('heading', { level: 2, name: 'Minha conta' }),
  ).toBeVisible();
  await page
    .locator('input[name="telefoneWhatsapp"]')
    .fill('+55 85 98888-7777');
  await page.locator('select[name="density"]').selectOption('compact');
  await page.getByRole('button', { name: 'Salvar minha conta' }).click();
  await expect(page.getByText('Conta atualizada com sucesso.')).toBeVisible();
  await expect(page.getByText('USER_PROFILE_UPDATED')).toBeVisible();

  await navigateInApp(page, 'Ajuda');
  await expect(
    page.getByRole('heading', { level: 2, name: 'Ajuda' }),
  ).toBeVisible();
  await expect(page.getByText('Como comparar cenários')).toBeVisible();
  await expect(page.getByText('Espaço reservado para vídeos')).toBeVisible();
});
