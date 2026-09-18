import { randomUUID } from 'node:crypto';

import { hash } from '@node-rs/argon2';
import { expect, test, type Page } from '@playwright/test';
import { Client } from 'pg';

const PASSWORD = 'E2E-Senha-Forte-123';
const PREFIX = 'e2e-agenda';
const EMAILS = {
  gestorA: `${PREFIX}-gestor-a@local.test`,
  vendedorA: `${PREFIX}-vendedor-a@local.test`,
  vendedorB: `${PREFIX}-vendedor-b@local.test`,
} as const;
const LEAD_A_EMAIL = `${PREFIX}-lead-a@local.test`;
const LEAD_B_EMAIL = `${PREFIX}-lead-b@local.test`;
const TEAM_A = 'Equipe E2E Agenda A';
const TEAM_B = 'Equipe E2E Agenda B';

function db() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is required for E2E');
  return new Client({ connectionString: url });
}

async function cleanupFixture() {
  const client = db();
  await client.connect();
  try {
    await client.query('DELETE FROM follow_ups WHERE lead_id IN (SELECT id FROM leads WHERE email_normalizado = ANY($1))', [
      [LEAD_A_EMAIL, LEAD_B_EMAIL],
    ]);
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
    const ids: Record<string, string> = {};
    const createUser = async (email: string, nome: string, role: 'VENDEDOR' | 'GESTOR') => {
      const id = randomUUID();
      await client.query(
        "INSERT INTO users (id, nome, email, password_hash, role, ativo, updated_at) VALUES ($1, $2, $3, $4, $5, true, NOW())",
        [id, nome, email, passwordHash, role],
      );
      ids[email] = id;
      return id;
    };
    const vendedorA = await createUser(EMAILS.vendedorA, 'E2E Agenda Vendedor A', 'VENDEDOR');
    const vendedorB = await createUser(EMAILS.vendedorB, 'E2E Agenda Vendedor B', 'VENDEDOR');
    const gestorA = await createUser(EMAILS.gestorA, 'E2E Agenda Gestor A', 'GESTOR');
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
       VALUES ($1, 'Cliente E2E Agenda A', $2, 'CADASTRO_MANUAL', 'QUALIFICADO', $3, 'IMOVEL', '300000', NOW())`,
      [leadA, LEAD_A_EMAIL, vendedorA],
    );
    const leadB = randomUUID();
    await client.query(
      `INSERT INTO leads (id, nome, email_normalizado, origem, status, responsavel_id, updated_at)
       VALUES ($1, 'Cliente E2E Agenda B Sigiloso', $2, 'CADASTRO_MANUAL', 'NOVO', $3, NOW())`,
      [leadB, LEAD_B_EMAIL, vendedorB],
    );
    await client.query(
      `INSERT INTO follow_ups (id, lead_id, assigned_user_id, due_at, type, status, title, created_by_id, created_at, updated_at)
       VALUES ($1, $2, $3, NOW() - INTERVAL '2 days', 'CALL', 'PENDING', 'Retornar proposta em atraso', $3, NOW(), NOW())`,
      [randomUUID(), leadA, vendedorA],
    );
    await client.query(
      `INSERT INTO follow_ups (id, lead_id, assigned_user_id, due_at, type, status, title, created_by_id, created_at, updated_at)
       VALUES ($1, $2, $3, NOW() - INTERVAL '1 day', 'WHATSAPP', 'PENDING', 'Cobrar retorno B', $3, NOW(), NOW())`,
      [randomUUID(), leadB, vendedorB],
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

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /entrar/i }).click();
  await expect(page).toHaveURL(/dashboard/, { timeout: 15_000 });
}

test.describe('Agenda comercial inteligente', () => {
  test.beforeAll(async () => {
    await seedFixture();
  });

  test.afterAll(async () => {
    await cleanupFixture();
  });

  test('VENDEDOR A vê atraso, prepara mensagem, reagenda, conclui e cria próxima ação', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await login(page, EMAILS.vendedorA);
    // Aquece BFFs da fase.
    await page.request.get('/api/agenda?days=7&page=1&pageSize=1');
    await page.goto('/dashboard/agenda');
    await expect(page.getByRole('heading', { name: /Atrasados/ })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText('Retornar proposta em atraso')).toBeVisible();
    await expect(page.getByText(/Follow-up atrasado há/)).toBeVisible();

    // Abre o cliente e prepara mensagem com IA (rascunho, sem envio).
    await page.getByRole('link', { name: 'Cliente E2E Agenda A' }).first().click();
    await expect(page).toHaveURL(/\/dashboard\/clientes\/[0-9a-f-]+/, { timeout: 15_000 });
    await page.getByLabel('Abrir Larcarvalho AI').click();
    await expect(page.getByText('Copiloto Comercial')).toBeVisible();
    await page.getByRole('button', { name: 'Preparar follow-up' }).click();
    const drawer = page.getByRole('dialog', { name: /Larcarvalho AI/ });
    await expect(drawer.getByText('Sugestão da IA').first()).toBeVisible({ timeout: 30_000 });
    await expect(drawer).not.toContainText('vai contemplar');
    await drawer.getByRole('button', { name: 'Aplicar sugestão' }).click();
    await drawer.getByLabel('Título').fill('Retorno pós-visita E2E');
    await drawer.getByLabel('Vencimento').fill('2027-06-10T10:00');
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    const [response] = await Promise.all([
      page.waitForResponse(
        (candidate) =>
          candidate.url().includes('/api/followups') &&
          candidate.request().method() === 'POST',
        { timeout: 15_000 },
      ),
      drawer.getByRole('button', { name: 'Criar follow-up' }).click(),
    ]);
    expect(pageErrors, `pageerrors: ${pageErrors.join(' | ')}`).toEqual([]);
    expect(response.ok()).toBeTruthy();
    await expect(drawer.getByText('Follow-up criado a partir da sugestão.')).toBeVisible({
      timeout: 15_000,
    });

    // Volta à agenda: reagenda o atrasado para amanhã e conclui com próxima ação.
    await page.goto('/dashboard/agenda');
    await expect(page.getByText('Retornar proposta em atraso')).toBeVisible({ timeout: 15_000 });
    const card = page.locator('li', { hasText: 'Retornar proposta em atraso' }).first();
    await card.getByRole('button', { name: 'Reagendar' }).click();
    await card.getByRole('button', { name: 'Amanhã' }).click();
    await expect(page.getByText('Agenda atualizada.')).toBeVisible({ timeout: 15_000 });
    await page.goto('/dashboard/agenda');
    const rescheduled = page.locator('li', { hasText: 'Retornar proposta em atraso' }).first();
    await rescheduled.getByRole('button', { name: 'Concluir follow-up' }).click();
    await expect(page.getByText('Agendar próxima ação para Cliente E2E Agenda A')).toBeVisible({
      timeout: 15_000,
    });
    await page.getByLabel('Título').fill('Próximo passo E2E');
    await page.getByLabel('Vencimento').fill('2027-06-15T10:00');
    await page.getByRole('button', { name: 'Criar follow-up' }).click();
    await expect(page.getByText('Agenda atualizada.')).toBeVisible({ timeout: 15_000 });
  });

  test('VENDEDOR A não vê agenda do VENDEDOR B (tela e API)', async ({ page }) => {
    test.setTimeout(120_000);
    await login(page, EMAILS.vendedorA);
    await page.goto('/dashboard/agenda');
    await expect(page.getByRole('heading', { name: /Atrasados/ })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText('Cliente E2E Agenda B Sigiloso')).toHaveCount(0);
    const response = await page.request.get('/api/agenda?days=7&page=1&pageSize=50');
    expect(response.ok()).toBeTruthy();
    const body = await response.text();
    expect(body).not.toContain('Sigiloso');
    expect(body).not.toContain(LEAD_B_EMAIL);
  });

  test('GESTOR A vê equipe; dados de outra equipe bloqueados', async ({ page }) => {
    test.setTimeout(120_000);
    await login(page, EMAILS.gestorA);
    await page.goto('/dashboard/agenda');
    await expect(page.getByText('Distribuição da equipe')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: 'Cliente E2E Agenda A' }).first()).toBeVisible();
    await expect(page.getByText('Cliente E2E Agenda B Sigiloso')).toHaveCount(0);
    const team = await page.request.get('/api/agenda/team?days=7&page=1&pageSize=50');
    expect(team.ok()).toBeTruthy();
    expect(await team.text()).not.toContain('Sigiloso');
  });

  test('IA "Meu dia" usa agenda real sem inventar fechamento', async ({ page }) => {
    test.setTimeout(120_000);
    await login(page, EMAILS.vendedorA);
    const leadA = await leadIdByEmail(LEAD_A_EMAIL);
    const setup = db();
    await setup.connect();
    try {
      const owner = await setup.query<{ id: string }>(
        'SELECT id FROM users WHERE email = $1',
        [EMAILS.vendedorA],
      );
      const vendedorA = owner.rows[0]?.id;
      await setup.query(
        `INSERT INTO follow_ups (id, lead_id, assigned_user_id, due_at, type, status, title, created_by_id, created_at, updated_at)
         VALUES ($1, $2, $3, NOW() - INTERVAL '1 day', 'CALL', 'PENDING', 'Retorno urgente meu dia', $3, NOW(), NOW())`,
        [randomUUID(), leadA, vendedorA],
      );
    } finally {
      await setup.end();
    }
    await page.goto('/dashboard');
    await page.getByLabel('Abrir Larcarvalho AI').click();
    await expect(page.getByText('Copiloto Comercial')).toBeVisible();
    await page.getByRole('button', { name: 'Meu dia' }).click();
    const drawer = page.getByRole('dialog', { name: /Larcarvalho AI/ });
    await expect(drawer.getByText(/Follow-ups vencidos:/).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(drawer.getByText(/Prioridade 1:/).first()).toBeVisible({ timeout: 30_000 });
    await expect(drawer).not.toContainText(/chance de fechar/i);
    await expect(drawer).not.toContainText(/probabilidade/i);
  });
});
