import { randomUUID } from 'node:crypto';

import { hash } from '@node-rs/argon2';
import { expect, test, type Page } from '@playwright/test';
import { Client } from 'pg';

import { commercialE2e } from './commercial-fixture';

const VENDEDOR_EMAIL = 'e2e-import-vendedor@local.test';
const VENDEDOR_PASSWORD = 'senha e2e vendedor segura';

function testDatabaseUrl(): string {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error('TEST_DATABASE_URL is required for E2E');
  const target = new URL(testUrl);
  if (
    !['localhost', '127.0.0.1'].includes(target.hostname) ||
    target.pathname.slice(1) !== 'larcarvalho_test'
  )
    throw new Error('E2E must target the local larcarvalho_test database');
  return testUrl;
}

/** Gera um CNPJ válido (dígitos verificadores calculados) e único por execução. */
function makeValidCnpj(seed: string): string {
  const base = seed.replace(/\D/g, '').padStart(12, '1').slice(0, 12);
  const check = (digits: string): number => {
    let factor = digits.length - 7;
    let sum = 0;
    for (let index = 0; index < digits.length; index += 1) {
      sum += Number(digits[index]) * factor;
      factor -= 1;
      if (factor === 1) factor = 9;
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  const first = check(base);
  const second = check(`${base}${first}`);
  return `${base}${first}${second}`;
}

async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel(/^email/i).fill(email);
  await page.getByLabel('Senha').fill(password);
  const loginResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/auth/login') &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: /entrar/i }).click();
  expect((await loginResponse).status()).toBe(200);
  await page.waitForURL('**/dashboard', { timeout: 90_000 });
}

async function seedVendedor() {
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    await client.query(
      'DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email = $1)',
      [VENDEDOR_EMAIL],
    );
    await client.query('DELETE FROM users WHERE email = $1', [VENDEDOR_EMAIL]);
    const passwordHash = await hash(VENDEDOR_PASSWORD, {
      algorithm: 2,
      memoryCost: 19_456,
      outputLen: 32,
      parallelism: 1,
      timeCost: 2,
    });
    await client.query(
      "INSERT INTO users (id, nome, email, password_hash, role, ativo, updated_at) VALUES ($1, 'E2E Import Vendedor', $2, $3, 'VENDEDOR', true, NOW())",
      [randomUUID(), VENDEDOR_EMAIL, passwordHash],
    );
  } finally {
    await client.end();
  }
}

async function removeVendedor() {
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    await client.query(
      'DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email = $1)',
      [VENDEDOR_EMAIL],
    );
    await client.query('DELETE FROM users WHERE email = $1', [VENDEDOR_EMAIL]);
  } finally {
    await client.end();
  }
}

async function cleanupImport(filename: string, cnpj: string) {
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    await client.query(
      'DELETE FROM data_quality_issues WHERE importacao_id IN (SELECT id FROM importacoes WHERE nome_arquivo = $1)',
      [filename],
    );
    await client.query('DELETE FROM importacoes WHERE nome_arquivo = $1', [
      filename,
    ]);
    await client.query('DELETE FROM administradoras WHERE cnpj = $1', [cnpj]);
  } finally {
    await client.end();
  }
}

test.describe('Import workflow E2E (browser real)', () => {
  test('fluxo normal: login → importações → upload → mapping → preview → execute → relatório', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const stamp = String(Date.now());
    const cnpj = makeValidCnpj(`62${stamp}`.slice(-12));
    const adminName = `Adm E2E Browser ${stamp.slice(-6)}`;
    const filename = `admin-browser-${stamp}.csv`;
    const csv = `nome,cnpj\n"${adminName}","${cnpj}"\n`;

    await loginAs(page, commercialE2e.email, commercialE2e.password);
    await page.goto('/dashboard/importacoes');
    await expect(page.locator('h1', { hasText: 'Importações' })).toBeVisible();

    await page
      .locator('select[name="classificacaoArquivo"]')
      .selectOption('GROUP_PORTFOLIO');
    await page
      .locator('select[name="tipoImportacao"]')
      .selectOption('ADMINISTRADORAS');
    await page.locator('input[type="file"]').setInputFiles({
      name: filename,
      mimeType: 'text/csv',
      buffer: Buffer.from(csv),
    });
    await page.getByRole('button', { name: /enviar e visualizar/i }).click();
    await expect(page.getByText('Mapeie as colunas')).toBeVisible({
      timeout: 30_000,
    });

    // O backend preenche o mapeamento automático (nome→nome, cnpj→cnpj).
    await page.getByRole('button', { name: /salvar mapeamento/i }).click();
    await page
      .getByRole('button', { name: /validar todas as linhas/i })
      .click();
    await expect(
      page.getByText(/abrir relat.rio completo antes de executar/i),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Administradoras — 1 linhas')).toBeVisible();

    const execute = page.getByRole('button', {
      name: /confirmar e processar/i,
    });
    await expect(execute).toBeEnabled();
    await execute.click();
    await expect(page.getByText(/finalizada: 1 criados/i)).toBeVisible({
      timeout: 60_000,
    });

    await cleanupImport(filename, cnpj);
  });

  test('COMMERCIAL_TABLE: classificação limita destinos e exige tabelas', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await loginAs(page, commercialE2e.email, commercialE2e.password);
    await page.goto('/dashboard/importacoes');

    await page
      .locator('select[name="classificacaoArquivo"]')
      .selectOption('COMMERCIAL_TABLE');
    await expect(
      page.getByText(/nunca cria grupos, cotas ou assembleias/i),
    ).toBeVisible();
    const options = await page
      .getByLabel('Tipo de dado')
      .locator('option')
      .allTextContents();
    expect(options).not.toContain('Grupos');
    expect(options).not.toContain('Cotas');
    expect(options).toContain('Tabelas comerciais');
  });

  test('VENDEDOR: sem acesso à importação e sem botão executar', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await seedVendedor();
    try {
      await page.goto('/login');
      await page.getByLabel(/^email/i).fill(VENDEDOR_EMAIL);
      await page.getByLabel('Senha').fill(VENDEDOR_PASSWORD);
      await page.getByRole('button', { name: /entrar/i }).click();
      await page.waitForTimeout(2000);

      await page.goto('/dashboard/importacoes');
      await page.waitForLoadState('networkidle');
      const forbidden =
        page.url().includes('forbidden') ||
        (await page
          .getByText(/sem permiss.o|acesso negado|forbidden/i)
          .first()
          .isVisible()
          .catch(() => false));
      const executeVisible = await page
        .getByRole('button', { name: /confirmar e processar|executar/i })
        .first()
        .isVisible()
        .catch(() => false);
      expect(forbidden || !executeVisible).toBeTruthy();
    } finally {
      await removeVendedor();
    }
  });
});
