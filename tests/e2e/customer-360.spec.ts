import { randomUUID } from 'node:crypto';

import { hash } from '@node-rs/argon2';
import { expect, test, type Page } from '@playwright/test';
import { Client } from 'pg';

const PASSWORD = 'E2E-Senha-Forte-123';
const PREFIX = 'e2e-360';
const EMAILS = {
  gestorA: `${PREFIX}-gestor-a@local.test`,
  vendedorA: `${PREFIX}-vendedor-a@local.test`,
  vendedorB: `${PREFIX}-vendedor-b@local.test`,
} as const;
const LEAD_A_EMAIL = `${PREFIX}-lead-a@local.test`;
const LEAD_B_EMAIL = `${PREFIX}-lead-b@local.test`;
const TEAM_A = 'Equipe E2E 360 A';
const TEAM_B = 'Equipe E2E 360 B';

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
    await client.query('DELETE FROM lead_interesses WHERE lead_id IN (SELECT id FROM leads WHERE email_normalizado = ANY($1))', [
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
    const vendedorA = await createUser(EMAILS.vendedorA, 'E2E 360 Vendedor A', 'VENDEDOR');
    const vendedorB = await createUser(EMAILS.vendedorB, 'E2E 360 Vendedor B', 'VENDEDOR');
    const gestorA = await createUser(EMAILS.gestorA, 'E2E 360 Gestor A', 'GESTOR');
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
      `INSERT INTO leads (id, nome, email_normalizado, origem, status, responsavel_id, categoria_interesse, valor_credito_desejado, objetivo, updated_at)
       VALUES ($1, 'Cliente E2E 360 A', $2, 'CADASTRO_MANUAL', 'QUALIFICADO', $3, 'IMOVEL', '350000', 'Comprar imóvel próprio', NOW())`,
      [leadA, LEAD_A_EMAIL, vendedorA],
    );
    const leadB = randomUUID();
    await client.query(
      `INSERT INTO leads (id, nome, email_normalizado, origem, status, responsavel_id, updated_at)
       VALUES ($1, 'Cliente E2E 360 B Sigiloso', $2, 'CADASTRO_MANUAL', 'NOVO', $3, NOW())`,
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

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /entrar/i }).click();
  await expect(page).toHaveURL(/dashboard/, { timeout: 15_000 });
}

test.describe('Cliente 360 e carteira', () => {
  test.beforeAll(async () => {
    await seedFixture();
  });

  test.afterAll(async () => {
    await cleanupFixture();
  });

  test('carteira, cliente, interação, follow-up e IA com dados reais', async ({ page }) => {
    test.setTimeout(240_000);
    const warmLeadA = await leadIdByEmail(LEAD_A_EMAIL);
    await login(page, EMAILS.vendedorA);
    // Aquece as rotas BFF da fase (evita compilar sob demanda no meio do fluxo).
    await page.request.get(`/api/followups?leadId=${warmLeadA}`);
    await page.request.get(`/api/portfolio/leads/${warmLeadA}/overview`);
    await page.goto('/dashboard/carteira');
    await expect(page.getByText('Minha carteira')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('link', { name: 'Cliente E2E 360 A' }).click();
    await expect(page).toHaveURL(/\/dashboard\/clientes\/[0-9a-f-]+/, { timeout: 15_000 });
    await expect(page.getByText('Jornada do cliente')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Perfil comercial' })).toBeVisible();

    const leadA = await leadIdByEmail(LEAD_A_EMAIL);
    const interaction = await page.request.post(`/api/leads/${leadA}/interacoes`, {
      data: { descricao: 'Cliente pediu proposta por WhatsApp', tipo: 'WHATSAPP' },
    });
    expect(interaction.ok()).toBeTruthy();

    await page.getByLabel('Título').fill('Retornar com proposta 360');
    await page.getByLabel('Vencimento').fill('2027-06-01T10:00');
    await page.getByRole('button', { name: 'Agendar' }).click();
    await expect(page.getByText('Follow-up agendado.')).toBeVisible({ timeout: 15_000 });

    await page.getByLabel('Abrir Larcarvalho AI').click();
    await expect(page.getByText('Copiloto Comercial')).toBeVisible();
    await page.getByRole('button', { name: 'Preparar atendimento' }).click();
    const drawer = page.getByRole('dialog', { name: /Larcarvalho AI/ });
    await expect(drawer.getByText('Retornar com proposta 360').first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(drawer.getByText(/WhatsApp/).first()).toBeVisible({ timeout: 30_000 });
  });

  test('VENDEDOR A bloqueado no cliente B (tela e API)', async ({ page }) => {
    test.setTimeout(120_000);
    await login(page, EMAILS.vendedorA);
    const leadB = await leadIdByEmail(LEAD_B_EMAIL);
    await page.goto(`/dashboard/clientes/${leadB}`);
    // Fora do escopo: 404 sem revelar existência (URL mantida, página não encontrada).
    await expect(page.getByText('Página não encontrada')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Cliente E2E 360 B Sigiloso')).toHaveCount(0);
    const response = await page.request.get(`/api/portfolio/leads/${leadB}/overview`);
    expect([403, 404]).toContain(response.status());
    expect(await response.text()).not.toContain('Sigiloso');
  });

  test('GESTOR visualiza carteira da equipe sem ver outra equipe', async ({ page }) => {
    test.setTimeout(120_000);
    await login(page, EMAILS.gestorA);
    await page.goto('/dashboard/carteira');
    await expect(page.getByRole('link', { name: 'Cliente E2E 360 A' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('link', { name: 'Cliente E2E 360 B Sigiloso' })).toHaveCount(0);
  });
});
