import { expect, test } from '@playwright/test';
import { commercialE2e } from './commercial-fixture';

test('imports TA1/TSA and displays the commercial tables and items', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const projectCode = testInfo.project.name
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase();
  const ta1Code = `TA1-${projectCode}`;
  const tsaCode = `TSA-${projectCode}`;
  await page.goto('/login');
  await page.getByLabel(/^email/i).fill(commercialE2e.email);
  await page.getByLabel('Senha').fill(commercialE2e.password);
  await page.getByRole('button', { name: /entrar/i }).click();
  await page.waitForURL('**/dashboard');

  await page.goto('/dashboard/tabelas-comerciais');
  await page.getByRole('link', { name: /importar tabela/i }).click();
  await page.waitForURL('**/dashboard/importacoes');
  await page
    .locator('select[name="tipoImportacao"]')
    .selectOption('TABELAS_COMERCIAIS');
  const csv = [
    'Tabela,administradoraCnpj,Categoria,Credito_Referencia,Taxa_Antecipada_Percentual,Prazo_Meses,Modalidade,Primeira_Parcela,Demais_Parcelas,Parcela_Padrao,Inicio_Vigencia',
    'TA1,45.723.174/0001-10,PESADOS,400000,1,100,NORMAL,8560,4560,,2023-07-11',
    'TA1,45.723.174/0001-10,PESADOS,400000,1,85,MAIS_POR_MENOS,9364.71,5364.71,,2023-07-11',
    'TSA,45.723.174/0001-10,PESADOS,400000,0,100,NORMAL,,,4640,2023-07-11',
    'TSA,45.723.174/0001-10,PESADOS,400000,0,85,MAIS_POR_MENOS,,,5458.82,2023-07-11',
  ]
    .join('\n')
    .replace(/^TA1,/gm, `${ta1Code},`)
    .replace(/^TSA,/gm, `${tsaCode},`);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'ta1-tsa.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  });
  await page.getByRole('button', { name: /enviar e visualizar/i }).click();
  await expect(page.getByText('Mapeie as colunas')).toBeVisible();
  await page.getByRole('button', { name: /salvar mapeamento/i }).click();
  await page.getByRole('button', { name: /validar todas as linhas/i }).click();
  await expect(
    page.getByText(/abrir relat.rio completo antes de executar/i),
  ).toBeVisible();
  const execute = page.getByRole('button', { name: /confirmar e processar/i });
  await expect(execute).toBeEnabled();
  await execute.click();
  await expect(page.getByText(/finalizada: 4 criados/i)).toBeVisible();

  await page.goto('/dashboard/tabelas-comerciais');
  const ta1Row = page.getByRole('row', { name: new RegExp(ta1Code) });
  await expect(ta1Row).toBeVisible();
  await expect(
    page.getByRole('row', { name: new RegExp(tsaCode) }),
  ).toBeVisible();
  await ta1Row.getByLabel('Abrir detalhes').click();
  await expect(page.getByText('Itens comerciais')).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole('cell', { name: 'MAIS_POR_MENOS', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('cell', { name: 'NORMAL', exact: true }),
  ).toBeVisible();
});
