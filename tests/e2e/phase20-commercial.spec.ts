import { statSync } from 'node:fs';

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

test('creates a commercial rule and calculates a simulation', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await login(page);
  await page.goto('/configuracoes/comercial');
  await expect(
    page.getByRole('heading', {
      level: 2,
      name: 'Configuração comercial',
    }),
  ).toBeVisible();
  await page
    .locator('select[name="administradoraId"]')
    .selectOption({ label: commercialE2e.adminName });
  await page.locator('select[name="category"]').selectOption('IMOVEL');
  await page.locator('input[name="name"]').fill('Regra E2E Fase 20');
  await page.locator('input[name="administrationFeePercent"]').fill('15');
  await page.locator('input[name="reserveFundPercent"]').fill('2');
  await page.locator('input[name="insurancePercent"]').fill('0');
  await page.locator('input[name="adhesionFeePercent"]').fill('0');
  await page.locator('input[name="maxEmbeddedBidPercent"]').fill('30');
  await page.locator('input[name="minimumTermMonths"]').fill('60');
  await page.locator('input[name="maximumTermMonths"]').fill('240');
  await page.getByRole('button', { name: 'Criar regra versionada' }).click();
  await expect(page.getByText('Alteração salva com sucesso.')).toBeVisible({
    timeout: 15_000,
  });

  await navigateInApp(page, 'Nova simulação');
  await page.locator('input[name="requestedCredit"]').fill('200000');
  await page.locator('input[name="desiredTermMonths"]').fill('120');
  await page.locator('input[name="ownBidAmount"]').fill('10000');
  await page.locator('input[name="embeddedBidPercent"]').fill('10');
  await page.getByRole('button', { name: 'Simular' }).click();
  await expect(page).toHaveURL(/\/simulacoes\/[0-9a-f-]+/, {
    timeout: 30_000,
  });
  await expect(
    page.locator('article').getByText('Completo', { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText('Melhores opções encontradas')).toBeVisible();
  await expect(
    page.locator('article').getByText('Menor parcela').first(),
  ).toBeVisible();
  await page
    .getByText('Taxas, avisos e premissas', { exact: true })
    .first()
    .click();
  await expect(
    page.getByText('Regra LC-', { exact: false }).first(),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Fixar', exact: true })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { name: 'Comparação fixada (1/5)' }),
  ).toBeVisible();
  await page
    .getByRole('searchbox', { name: 'Buscar resultado' })
    .first()
    .fill('nenhuma-administradora-corresponde');
  await expect(
    page.getByRole('heading', { name: 'Nenhum resultado encontrado' }).first(),
  ).toBeVisible();
  await page
    .getByRole('searchbox', { name: 'Buscar resultado' })
    .first()
    .clear();
  await expect(page.locator('article').first()).toBeVisible();

  await page
    .getByRole('heading', { name: 'Gerar proposta comercial' })
    .scrollIntoViewIfNeeded();
  await page
    .locator('select[name="leadId"]')
    .selectOption({ label: commercialE2e.leadName });
  await page.getByRole('button', { name: /Criar proposta \(/ }).click();
  await expect(page).toHaveURL(/\/propostas\/[0-9a-f-]+/, {
    timeout: 30_000,
  });
  await expect(
    page.getByText(commercialE2e.leadName, { exact: true }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Exportar PDF', exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  const filePath = await download.path();
  expect(statSync(filePath!).size).toBeGreaterThan(1_000);
});

test('configures parity capabilities, simulates by category value, recalcs with toggles and exports a summary PDF', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await login(page);
  await page.goto('/configuracoes/comercial');
  await expect(
    page.getByRole('heading', {
      level: 2,
      name: 'Configuração comercial',
    }),
  ).toBeVisible();
  await page
    .locator('select[name="administradoraId"]')
    .selectOption({ label: commercialE2e.adminName });
  await page.locator('select[name="category"]').selectOption('IMOVEL');
  await page.locator('input[name="name"]').fill('Regra E2E Paridade');
  await page.locator('input[name="administrationFeePercent"]').fill('15');
  await page.locator('input[name="reserveFundPercent"]').fill('2');
  await page.locator('input[name="insurancePercent"]').fill('1');
  await page.locator('input[name="adhesionFeePercent"]').fill('0');
  await page.locator('input[name="maxEmbeddedBidPercent"]').fill('30');
  await page.locator('select[name="embeddedBidBasis"]').selectOption('PLAN_TOTAL');
  await page.locator('select[name="bidType"]').selectOption('PERCENTUAL');
  await page.locator('input[name="ownBidMaxPercent"]').fill('10');
  await page.locator('input[name="categoryValueCreditRatio"]').fill('90');
  await page.locator('input[name="minimumTermMonths"]').fill('60');
  await page.locator('input[name="maximumTermMonths"]').fill('240');
  await page.locator('input[name="reducedInstallmentPercent"]').fill('50');
  await page.locator('input[name="reducedUntilContemplation"]').check();
  await page.locator('input[name="diluteReducedInstallments"]').check();
  await page.locator('input[name="inProgressAllowed"]').check();
  await page.locator('input[name="structuredOperationEligible"]').check();
  await page.getByRole('button', { name: 'Criar regra versionada' }).click();
  await expect(page.getByText('Alteração salva com sucesso.')).toBeVisible({
    timeout: 15_000,
  });

  await navigateInApp(page, 'Nova simulação');
  await page
    .locator('input[name="creditMode"][value="CATEGORY_VALUE"]')
    .check({ force: true });
  await page.locator('input[name="requestedCredit"]').fill('200000');
  await page.locator('input[name="desiredTermMonths"]').fill('120');
  await page.locator('input[name="embeddedBidPercent"]').fill('10');
  await page.locator('input[name="paidInstallments"]').fill('20');
  await page.getByRole('button', { name: 'Simular' }).click();
  await expect(page).toHaveURL(/\/simulacoes\/[0-9a-f-]+/, {
    timeout: 30_000,
  });
  await expect(
    page.locator('article').getByText('Completo', { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByText('Taxas, avisos e premissas', { exact: true })
    .first()
    .click();
  await expect(
    page.getByText('valor da categoria', { exact: false }).first(),
  ).toBeVisible();
  await expect(
    page.getByText('diluído em', { exact: false }).first(),
  ).toBeVisible();

  await page.locator('input[name="termMonths"]').fill('84');
  await page.locator('input[name="scenarioName"]').fill('Cenário comparado');
  await page.getByRole('button', { name: 'Recalcular' }).click();
  await expect(
    page.getByRole('heading', { level: 3, name: 'Cenário comparado' }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.locator('article').getByText('Completo', { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Fixar', exact: true })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { name: 'Comparação fixada (1/5)' }),
  ).toBeVisible();

  await page
    .getByRole('heading', { name: 'Gerar proposta comercial' })
    .scrollIntoViewIfNeeded();
  await page
    .locator('select[name="leadId"]')
    .selectOption({ label: commercialE2e.leadName });
  await page.getByRole('button', { name: /Criar proposta \(/ }).click();
  await expect(page).toHaveURL(/\/propostas\/[0-9a-f-]+/, {
    timeout: 30_000,
  });
  const summaryDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar PDF resumido' }).click();
  const download = await summaryDownload;
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  const filePath = await download.path();
  expect(statSync(filePath!).size).toBeGreaterThan(1_000);
});
