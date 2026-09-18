import { expect, test, type Page } from '@playwright/test';

import { commercialE2e } from './commercial-fixture';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(commercialE2e.email);
  await page.locator('input[type="password"]').fill(commercialE2e.password);
  await page.getByRole('button', { name: /entrar/i }).click();
  await expect(page).toHaveURL(/dashboard/, { timeout: 15_000 });
}

test('selects five comparator options, compares them side by side and removes one column', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await login(page);
  await page.goto('/dashboard/comparador');
  await expect(
    page.getByRole('heading', { name: 'Comparador de Grupos e Planos' }),
  ).toBeVisible();
  await page
    .locator('select[name="administradoraId"]')
    .selectOption({ label: commercialE2e.adminName });
  await page.locator('select[name="categoria"]').selectOption('IMOVEL');
  await page.getByRole('button', { name: 'Pesquisar', exact: true }).click();
  const groupA = 'Grupo E2E-CMP-1';
  const groupB = 'Grupo E2E-CMP-2';
  const groupC = 'Grupo E2E-CMP-3';
  const groupD = 'Grupo E2E-CMP-4';
  const leftover = 'Grupo E2E-CMP-5';
  const plan = 'Plano comercial E2E-CMP-PLAN';
  await expect(
    page.getByRole('checkbox', { name: `Selecionar ${groupA}` }),
  ).toBeEnabled();
  const option = (name: string) =>
    page.getByRole('checkbox', { name: `Selecionar ${name}` });
  await option(groupA).check();
  await expect(
    page.getByRole('button', { name: 'Comparar agora' }),
  ).toBeEnabled();
  await option(groupB).check();
  await option(groupC).check();
  await option(groupD).check();
  await option(plan).check();
  await expect(page.getByText('Comparar selecionados (5/5)')).toBeVisible();
  await expect(
    page.getByText('Você pode comparar até 5 opções por vez.'),
  ).toBeVisible();
  await expect(option(leftover)).toBeDisabled();
  await page
    .getByRole('button', { name: `Remover ${groupA}`, exact: true })
    .click();
  await expect(page.getByText('Comparar selecionados (4/5)')).toBeVisible();
  await expect(option(leftover)).toBeEnabled();
  await option(leftover).check();
  await page.getByRole('button', { name: 'Limpar', exact: true }).click();
  await expect(page.getByText('Comparar selecionados (0/5)')).toBeVisible();
  for (const name of [groupA, groupB, groupC, groupD, plan])
    await option(name).check();
  await page.getByRole('button', { name: 'Comparar agora' }).click();
  await expect(page).toHaveURL(/\/dashboard\/comparador\/resultado/, {
    timeout: 30_000,
  });
  await expect(
    page.getByRole('heading', { name: 'Comparação selecionada (5/5)' }),
  ).toBeVisible();
  const mobile = (page.viewportSize()?.width ?? 1280) < 768;
  if (mobile) {
    await expect(page.locator('.comparison-mobile > div')).toHaveCount(5);
    await expect(page.locator('.comparison-mobile')).toBeVisible();
  } else {
    await expect(
      page.getByRole('columnheader', { name: /Grupo E2E-CMP-/ }),
    ).toHaveCount(4);
    await expect(
      page.getByRole('columnheader', { name: /Plano comercial E2E-CMP-PLAN/ }),
    ).toHaveCount(1);
    await expect(
      page.getByRole('rowheader', { name: 'Taxa administrativa' }),
    ).toBeVisible();
    await expect(
      page.getByRole('table').getByText('Menor parcela', { exact: true }),
    ).toBeVisible();
  }
  await page
    .getByRole('button', { name: 'Remover Grupo E2E-CMP-1', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Comparação selecionada (4/5)' }),
  ).toBeVisible();
  if (mobile)
    await expect(page.locator('.comparison-mobile > div')).toHaveCount(4);
  else
    await expect(
      page.getByRole('columnheader', { name: /Grupo E2E-CMP-/ }),
    ).toHaveCount(3);
});
