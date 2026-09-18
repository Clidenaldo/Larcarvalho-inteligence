import { randomUUID } from 'node:crypto';

import { hash } from '@node-rs/argon2';
import { expect, test, type Page } from '@playwright/test';
import { Client } from 'pg';

import { commercialE2e } from './commercial-fixture';
import { navigateInApp } from './navigation';

const PASSWORD = 'E2E-Senha-Forte-123';
const PREFIX = 'e2e-prop';
const EMAILS = {
  gestorA: `${PREFIX}-gestor-a@local.test`,
  vendedorA: `${PREFIX}-vendedor-a@local.test`,
  vendedorB: `${PREFIX}-vendedor-b@local.test`,
} as const;
const LEAD_A_EMAIL = `${PREFIX}-lead-a@local.test`;
const LEAD_B_EMAIL = `${PREFIX}-lead-b@local.test`;
const TEAM_A = 'Equipe E2E Prop A';
const TEAM_B = 'Equipe E2E Prop B';

function db() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is required for E2E');
  return new Client({ connectionString: url });
}

async function cleanupFixture() {
  const client = db();
  await client.connect();
  try {
    await client.query(
      'DELETE FROM follow_ups WHERE lead_id IN (SELECT id FROM leads WHERE email_normalizado = ANY($1))',
      [[LEAD_A_EMAIL, LEAD_B_EMAIL]],
    );
    await client.query(
      'DELETE FROM proposal_status_history WHERE proposal_id IN (SELECT id FROM proposals WHERE lead_id IN (SELECT id FROM leads WHERE email_normalizado = ANY($1)))',
      [[LEAD_A_EMAIL, LEAD_B_EMAIL]],
    );
    await client.query(
      'DELETE FROM proposal_items WHERE proposal_id IN (SELECT id FROM proposals WHERE lead_id IN (SELECT id FROM leads WHERE email_normalizado = ANY($1)))',
      [[LEAD_A_EMAIL, LEAD_B_EMAIL]],
    );
    await client.query(
      'DELETE FROM proposals WHERE lead_id IN (SELECT id FROM leads WHERE email_normalizado = ANY($1))',
      [[LEAD_A_EMAIL, LEAD_B_EMAIL]],
    );
    const simOwners = await client.query<{ id: string }>(
      'SELECT id FROM users WHERE email = ANY($1)',
      [Object.values(EMAILS)],
    );
    const ownerIds = simOwners.rows.map((row) => row.id);
    if (ownerIds.length > 0) {
      await client.query(
        'DELETE FROM simulation_favorites WHERE simulation_id IN (SELECT id FROM simulations WHERE created_by_id = ANY($1))',
        [ownerIds],
      );
      await client.query(
        'DELETE FROM simulation_results WHERE scenario_id IN (SELECT s.id FROM simulation_scenarios s JOIN simulations sim ON sim.id = s.simulation_id WHERE sim.created_by_id = ANY($1))',
        [ownerIds],
      );
      await client.query(
        'DELETE FROM simulation_calculation_snapshots WHERE scenario_id IN (SELECT s.id FROM simulation_scenarios s JOIN simulations sim ON sim.id = s.simulation_id WHERE sim.created_by_id = ANY($1))',
        [ownerIds],
      );
      await client.query(
        'DELETE FROM simulation_scenarios WHERE simulation_id IN (SELECT id FROM simulations WHERE created_by_id = ANY($1))',
        [ownerIds],
      );
      await client.query('DELETE FROM simulations WHERE created_by_id = ANY($1)', [ownerIds]);
    }
    await client.query('DELETE FROM lead_interacoes WHERE lead_id IN (SELECT id FROM leads WHERE email_normalizado = ANY($1))', [
      [LEAD_A_EMAIL, LEAD_B_EMAIL],
    ]);
    await client.query('DELETE FROM leads WHERE email_normalizado = ANY($1)', [
      [LEAD_A_EMAIL, LEAD_B_EMAIL],
    ]);
    const users = await client.query<{ id: string }>(
      'SELECT id FROM users WHERE email = ANY($1)',
      [Object.values(EMAILS)],
    );
    for (const { id } of users.rows) {
      await client.query('DELETE FROM sessions WHERE user_id = $1', [id]);
      await client.query('DELETE FROM audit_logs WHERE actor_id = $1', [id]);
      await client.query('UPDATE teams SET manager_id = NULL WHERE manager_id = $1', [id]);
      await client.query('DELETE FROM users WHERE id = $1', [id]);
    }
    await client.query('DELETE FROM teams WHERE name = ANY($1)', [[TEAM_A, TEAM_B]]);
  } finally {
    await client.end();
  }
}

async function seedFixture() {
  await cleanupFixture();
  const client = db();
  await client.connect();
  try {
    await client.query('BEGIN');
    const passwordHash = await hash(PASSWORD, {
      algorithm: 2,
      memoryCost: 19_456,
      outputLen: 32,
      parallelism: 1,
      timeCost: 2,
    });
    const createUser = async (email: string, nome: string, role: 'VENDEDOR' | 'GESTOR') => {
      const id = randomUUID();
      await client.query(
        "INSERT INTO users (id, nome, email, password_hash, role, ativo, updated_at) VALUES ($1, $2, $3, $4, $5, true, NOW())",
        [id, nome, email, passwordHash, role],
      );
      return id;
    };
    const vendedorA = await createUser(EMAILS.vendedorA, 'E2E Prop Vendedor A', 'VENDEDOR');
    const vendedorB = await createUser(EMAILS.vendedorB, 'E2E Prop Vendedor B', 'VENDEDOR');
    const gestorA = await createUser(EMAILS.gestorA, 'E2E Prop Gestor A', 'GESTOR');
    const teamA = randomUUID();
    const teamB = randomUUID();
    await client.query(
      'INSERT INTO teams (id, name, manager_id, active, created_at, updated_at) VALUES ($1, $2, $3, true, NOW(), NOW())',
      [teamA, TEAM_A, gestorA],
    );
    await client.query(
      'INSERT INTO teams (id, name, active, created_at, updated_at) VALUES ($1, $2, true, NOW(), NOW())',
      [teamB, TEAM_B],
    );
    await client.query('UPDATE users SET team_id = $1 WHERE id = $2', [teamA, vendedorA]);
    await client.query('UPDATE users SET team_id = $1 WHERE id = $2', [teamB, vendedorB]);
    await client.query('UPDATE users SET team_id = $1 WHERE id = $2', [teamA, gestorA]);
    const leadA = randomUUID();
    await client.query(
      `INSERT INTO leads (id, nome, email_normalizado, origem, status, responsavel_id, categoria_interesse, valor_credito_desejado, updated_at)
       VALUES ($1, 'Cliente E2E Prop A', $2, 'CADASTRO_MANUAL', 'QUALIFICADO', $3, 'IMOVEL', '300000', NOW())`,
      [leadA, LEAD_A_EMAIL, vendedorA],
    );
    const leadB = randomUUID();
    await client.query(
      `INSERT INTO leads (id, nome, email_normalizado, origem, status, responsavel_id, updated_at)
       VALUES ($1, 'Cliente E2E Prop B Sigiloso', $2, 'CADASTRO_MANUAL', 'NOVO', $3, NOW())`,
      [leadB, LEAD_B_EMAIL, vendedorB],
    );
    await client.query('COMMIT');
    return { leadA, leadB };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

async function leadIdByEmail(email: string) {
  const client = db();
  await client.connect();
  try {
    const result = await client.query<{ id: string }>(
      'SELECT id FROM leads WHERE email_normalizado = $1',
      [email],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error(`Lead ${email} not found`);
    return id;
  } finally {
    await client.end();
  }
}

async function login(page: Page, email: string, password: string = PASSWORD) {
  // Garante estado deslogado: /login redireciona quem já tem sessão.
  await page.context().clearCookies();
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /entrar/i }).click();
  await expect(page).toHaveURL(/dashboard/, { timeout: 15_000 });
}

async function ensureRuleAsAdmin(page: Page, name: string) {
  await login(page, commercialE2e.email, commercialE2e.password);
  await page.goto('/configuracoes/comercial');
  await page
    .locator('select[name="administradoraId"]')
    .selectOption({ label: commercialE2e.adminName });
  await page.locator('select[name="category"]').selectOption('IMOVEL');
  await page.locator('input[name="name"]').fill(name);
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
}

async function runSimulation(page: Page) {
  await navigateInApp(page, 'Nova simulação');
  await page.locator('input[name="requestedCredit"]').fill('200000');
  await page.locator('input[name="desiredTermMonths"]').fill('120');
  await page.locator('input[name="ownBidAmount"]').fill('10000');
  await page.locator('input[name="embeddedBidPercent"]').fill('10');
  await page.getByRole('button', { name: 'Simular' }).click();
  await expect(page).toHaveURL(/\/simulacoes\/[0-9a-f-]+/, { timeout: 30_000 });
  await expect(
    page.locator('article').getByText('Completo', { exact: true }).first(),
  ).toBeVisible({ timeout: 30_000 });
}

test.describe('Proposta comercial inteligente', () => {
  test.beforeAll(async () => {
    await seedFixture();
  });

  test.afterAll(async () => {
    await cleanupFixture();
  });

  test('fluxo completo: simulação → proposta → IA → PDF → apresentada → follow-up → versão', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await ensureRuleAsAdmin(page, 'Regra E2E Prop');
    await login(page, EMAILS.vendedorA);
    await page.request.get('/api/proposals?page=1&pageSize=1');
    await runSimulation(page);

    // Fixa 2 resultados e cria a proposta para o lead próprio.
    for (let index = 1; index <= 2; index += 1) {
      const fixar = page.getByRole('button', { name: 'Fixar', exact: true });
      if ((await fixar.count()) === 0) break;
      await fixar.first().click();
      await expect(page.getByText(`${index} de 5 selecionados`)).toBeVisible({
        timeout: 15_000,
      });
    }
    const leadA = await leadIdByEmail(LEAD_A_EMAIL);
    await page.locator('select[name="leadId"]').selectOption(leadA);
    await page.getByRole('button', { name: /Criar proposta \(/ }).click();
    await expect(page).toHaveURL(/\/propostas\/[0-9a-f-]+/, { timeout: 30_000 });
    const proposalUrl = page.url();
    await expect(page.getByText('Cliente E2E Prop A')).toBeVisible({ timeout: 15_000 });

    // IA usa snapshot real, sem inventar, sem alterar.
    await page.getByLabel('Abrir Larcarvalho AI').click();
    await expect(page.getByText('Copiloto Comercial')).toBeVisible();
    await page.getByRole('button', { name: 'Preparar apresentação' }).click();
    const drawer = page.getByRole('dialog', { name: /Larcarvalho AI/ });
    await expect(drawer.getByText(/Proposta PROP-/).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(drawer.getByText(/Embracon E2E/).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(drawer).not.toContainText('vai contemplar');
    await expect(drawer).not.toContainText(/garantida/i);
    await drawer.getByRole('button', { name: 'Fechar painel' }).click();

    // PDF histórico faz download.
    const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
    await page.getByRole('button', { name: 'Exportar PDF', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);

    // Marca apresentada com canal e cria follow-up de retorno.
    await page.locator('select[name="status"]').selectOption('SENT');
    await page.locator('textarea[name="reason"]').fill('Canal: WhatsApp — cliente pediu prazo');
    await page.getByRole('button', { name: 'Salvar status' }).click();
    await expect(page.getByText('Canal: WhatsApp — cliente pediu prazo')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText('Agendar retorno?')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: '+3 dias' }).click();
    await expect(page.getByText('Retorno agendado. Acompanhe pela Agenda.')).toBeVisible({
      timeout: 15_000,
    });

    // Cliente 360 e Agenda refletem a proposta.
    await page.goto(`/dashboard/clientes/${leadA}`);
    await expect(page.getByText(/Proposta .* criada/).first()).toBeVisible({ timeout: 15_000 });
    const agenda = await page.request.get('/api/agenda?days=7&page=1&pageSize=50');
    expect(agenda.ok()).toBeTruthy();
    expect(await agenda.text()).toContain('Cliente E2E Prop A');

    // Nova versão preserva a anterior imutável.
    await page.goto(proposalUrl);
    await expect(page.getByText(/· v1/).first()).toBeVisible({ timeout: 15_000 });
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    const [versionResponse] = await Promise.all([
      page.waitForResponse(
        (candidate) =>
          candidate.url().includes('/versions') && candidate.request().method() === 'POST',
        { timeout: 30_000 },
      ),
      page.getByRole('button', { name: /Criar versão 2/ }).click(),
    ]);
    expect(versionResponse.ok()).toBeTruthy();
    expect(pageErrors, `pageerrors: ${pageErrors.join(' | ')}`).toEqual([]);
    await expect(page).toHaveURL(/\/propostas\/[0-9a-f-]+/, { timeout: 30_000 });
    expect(page.url()).not.toBe(proposalUrl);
    await expect(page.getByText('Versão 2 de 2')).toBeVisible({ timeout: 15_000 });
    await page.goto(proposalUrl);
    await expect(page.getByText('Versão 1 de 2')).toBeVisible({ timeout: 15_000 });
  });

  test('VENDEDOR A não acessa proposta B (tela e API)', async ({ page }) => {
    test.setTimeout(180_000);
    await ensureRuleAsAdmin(page, 'Regra E2E Prop B');
    await login(page, EMAILS.vendedorB);
    const leadB = await leadIdByEmail(LEAD_B_EMAIL);
    await runSimulation(page);
    await page.getByRole('button', { name: 'Fixar', exact: true }).first().click();
    await expect(page.getByText('1 de 5 selecionados')).toBeVisible({ timeout: 15_000 });
    await page.locator('select[name="leadId"]').selectOption(leadB);
    await page.getByRole('button', { name: /Criar proposta \(/ }).click();
    await expect(page).toHaveURL(/\/propostas\/[0-9a-f-]+/, { timeout: 30_000 });
    const proposalB = page.url().split('/').pop() ?? '';

    await login(page, EMAILS.vendedorA);
    await page.goto(`/propostas/${proposalB}`);
    await expect(page.getByText('Página não encontrada')).toBeVisible({ timeout: 15_000 });
    const response = await page.request.get(`/api/proposals/${proposalB}`);
    expect([403, 404]).toContain(response.status());
    expect(await response.text()).not.toContain('Sigiloso');
  });

  test('GESTOR A acessa proposta da equipe; outra equipe bloqueada', async ({ page }) => {
    test.setTimeout(120_000);
    await login(page, EMAILS.gestorA);
    await page.goto('/propostas');
    await expect(page.getByRole('heading', { name: 'Propostas', exact: true })).toBeVisible({
      timeout: 15_000,
    });
    const team = await page.request.get('/api/proposals?page=1&pageSize=50');
    expect(team.ok()).toBeTruthy();
    expect(await team.text()).not.toContain('Sigiloso');
  });
});
