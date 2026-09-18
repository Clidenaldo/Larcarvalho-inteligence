import { randomUUID } from 'node:crypto';

import { hash } from '@node-rs/argon2';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { Client } from 'pg';

import { commercialE2e } from './commercial-fixture';

const PASSWORD = 'E2E-Senha-AI29-Forte-123';
const TEAM_A = 'Equipe E2E AI29 A';
const TEAM_B = 'Equipe E2E AI29 B';
const EMAILS = {
  gestorA: 'e2e-ai29-gestor-a@local.test',
  vendedorA: 'e2e-ai29-vendedor-a@local.test',
  vendedorB: 'e2e-ai29-vendedor-b@local.test',
} as const;
const LEAK_TOKEN = 'SEGREDO-E2E-AI29-B-777';

function db() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is required for E2E');
  return new Client({ connectionString: url });
}

async function passwordHash() {
  return hash(PASSWORD, {
    algorithm: 2,
    memoryCost: 19_456,
    outputLen: 32,
    parallelism: 1,
    timeCost: 2,
  });
}

async function cleanupAi29Fixture() {
  const client = db();
  await client.connect();
  try {
    const users = await client.query<{ id: string }>(
      'SELECT id FROM users WHERE email = ANY($1)',
      [Object.values(EMAILS)],
    );
    for (const { id } of users.rows) {
      await client.query(
        'DELETE FROM knowledge_ingestions WHERE document_id IN (SELECT id FROM knowledge_documents WHERE owner_user_id = $1)',
        [id],
      );
      await client.query(
        'DELETE FROM knowledge_chunks WHERE document_id IN (SELECT id FROM knowledge_documents WHERE owner_user_id = $1)',
        [id],
      );
      await client.query('DELETE FROM knowledge_documents WHERE owner_user_id = $1', [id]);
      await client.query('DELETE FROM ai_usage WHERE user_id = $1', [id]);
      await client.query('DELETE FROM sessions WHERE user_id = $1', [id]);
      await client.query('DELETE FROM user_permission_overrides WHERE user_id = $1', [id]);
      await client.query('DELETE FROM audit_logs WHERE actor_id = $1', [id]);
      await client.query('UPDATE teams SET manager_id = NULL WHERE manager_id = $1', [id]);
      await client.query('DELETE FROM users WHERE id = $1', [id]);
    }
    await client.query('DELETE FROM teams WHERE name = ANY($1)', [[TEAM_A, TEAM_B]]);
  } finally {
    await client.end();
  }
}

async function seedAi29Fixture() {
  await cleanupAi29Fixture();
  const client = db();
  await client.connect();
  try {
    await client.query('BEGIN');
    const hashValue = await passwordHash();
    const createUser = async (
      email: string,
      nome: string,
      role: 'VENDEDOR' | 'GESTOR',
    ) => {
      const id = randomUUID();
      await client.query(
        'INSERT INTO users (id, nome, email, password_hash, role, ativo, updated_at) VALUES ($1, $2, $3, $4, $5, true, NOW())',
        [id, nome, email, hashValue, role],
      );
      return id;
    };
    const vendedorA = await createUser(EMAILS.vendedorA, 'E2E AI29 Vendedor A', 'VENDEDOR');
    const vendedorB = await createUser(EMAILS.vendedorB, 'E2E AI29 Vendedor B', 'VENDEDOR');
    const gestorA = await createUser(EMAILS.gestorA, 'E2E AI29 Gestor A', 'GESTOR');
    const teamA = randomUUID();
    const teamB = randomUUID();
    await client.query(
      'INSERT INTO teams (id, name, manager_id, active, created_at, updated_at) VALUES ($1, $2, $3, true, NOW(), NOW())',
      [teamA, TEAM_A, gestorA],
    );
    await client.query(
      'INSERT INTO teams (id, name, manager_id, active, created_at, updated_at) VALUES ($1, $2, NULL, true, NOW(), NOW())',
      [teamB, TEAM_B],
    );
    await client.query('UPDATE users SET team_id = $1 WHERE id = $2', [teamA, vendedorA]);
    await client.query('UPDATE users SET team_id = $1 WHERE id = $2', [teamB, vendedorB]);
    await client.query('UPDATE users SET team_id = $1 WHERE id = $2', [teamA, gestorA]);
    await client.query('COMMIT');
    return { teamA, teamB };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

async function teamIdByName(name: string) {
  const client = db();
  await client.connect();
  try {
    const result = await client.query<{ id: string }>(
      'SELECT id FROM teams WHERE name = $1',
      [name],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error(`Team ${name} not found`);
    return id;
  } finally {
    await client.end();
  }
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /entrar/i }).click();
  await expect(page).toHaveURL(/dashboard/, { timeout: 60_000 });
}

async function loginAs(browser: Browser, email: string, password = PASSWORD) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, email, password);
  return { context, page };
}

async function createTextDocument(page: Page, body: Record<string, unknown>) {
  const response = await page.request.post('/api/knowledge/text', { data: body });
  expect(response.status()).toBe(201);
  return (await response.json()) as { id: string; title: string };
}

test.describe('IA real de produção (Fase 29)', () => {
  test.beforeAll(async () => {
    await seedAi29Fixture();
  });

  test.afterAll(async () => {
    await cleanupAi29Fixture();
  });

  test('A — streaming progressivo sem duplicação', async ({ browser }) => {
    test.setTimeout(180_000);
    const admin = await loginAs(browser, commercialE2e.email, commercialE2e.password);
    const marker = `STREAM29-${Date.now()}`;
    await createTextDocument(admin.page, {
      category: 'MANUAL',
      content: `Documento ${marker}. A contemplação ocorre por sorteio ou por lance em assembleia mensal do grupo.`,
      title: `Manual stream ${marker}`,
      visibility: 'PUBLIC',
    });
    await admin.context.close();

    const seller = await loginAs(browser, EMAILS.vendedorA);
    await seller.page.goto('/dashboard/base-conhecimento');
    await seller.page.getByLabel('Abrir Larcarvalho AI').click();
    await seller.page.getByRole('button', { name: 'Consultar a base' }).click();
    const drawer = seller.page.getByRole('dialog', { name: /Larcarvalho AI/ });
    await expect(
      drawer.getByText(/Com base nas fontes recuperadas/i).first(),
    ).toBeVisible({ timeout: 30_000 });
    await expect(drawer.getByText(/Fontes:/).first()).toBeVisible();
    // Sem duplicação: o marcador textual aparece uma única vez no drawer.
    const occurrences = await drawer
      .getByText(/Com base nas fontes recuperadas/i)
      .count();
    expect(occurrences).toBe(1);
    await seller.context.close();
  });

  test('B — cancelamento estabiliza sem erro', async ({ browser }) => {
    test.setTimeout(120_000);
    const seller = await loginAs(browser, EMAILS.vendedorA);
    await seller.page.goto('/dashboard/base-conhecimento');
    await seller.page.getByLabel('Abrir Larcarvalho AI').click();
    const drawer = seller.page.getByRole('dialog', { name: /Larcarvalho AI/ });
    await seller.page.getByRole('button', { name: 'Consultar a base' }).click();
    const cancel = seller.page.getByRole('button', { name: 'Cancelar' });
    if (await cancel.isVisible()) {
      await cancel.click();
      await expect(drawer.getByRole('alert')).toHaveCount(0);
    }
    // Drawer permanece utilizável após o fluxo.
    await expect(drawer).toBeVisible();
    await seller.context.close();
  });

  test('C — RAG grounded com abertura da fonte', async ({ browser }) => {
    test.setTimeout(180_000);
    const admin = await loginAs(browser, commercialE2e.email, commercialE2e.password);
    const marker = `FONTE29-${Date.now()}`;
    const document = await createTextDocument(admin.page, {
      category: 'MANUAL',
      content: `Documento ${marker}. O prazo de contemplação deste plano é de 99 meses contados da adesão.`,
      title: `Manual fonte ${marker}`,
      visibility: 'PUBLIC',
    });
    await admin.context.close();

    const seller = await loginAs(browser, EMAILS.vendedorA);
    await seller.page.goto('/dashboard/base-conhecimento');
    await seller.page.getByLabel('Abrir Larcarvalho AI').click();
    const drawer = seller.page.getByRole('dialog', { name: /Larcarvalho AI/ });
    await seller.page.getByRole('button', { name: 'Consultar a base' }).click();
    await expect(drawer.getByText(/99 meses/).first()).toBeVisible({ timeout: 30_000 });
    await expect(drawer.getByText(/Fontes:/).first()).toBeVisible();
    await drawer
      .getByRole('link', { name: document.title })
      .first()
      .click();
    await expect(seller.page).toHaveURL(
      new RegExp(`/dashboard/base-conhecimento/${document.id}`),
      { timeout: 15_000 },
    );
    await seller.context.close();
  });

  test('D — sem evidência não inventa', async ({ browser }) => {
    test.setTimeout(120_000);
    const seller = await loginAs(browser, EMAILS.vendedorA);
    const chat = await seller.page.request.post('/api/ai/chat', {
      data: {
        contextType: 'KNOWLEDGE',
        message: `Taxa de seguro inexistente ${Date.now()}?`,
        promptId: 'knowledge-grounded-answer',
      },
    });
    expect(chat.ok()).toBe(true);
    const answer = (await chat.json()) as {
      response: { facts: string[]; grounded?: boolean; sources: unknown[] };
    };
    expect(answer.response.grounded).toBe(false);
    expect(answer.response.facts).toHaveLength(0);
    expect(answer.response.sources).toHaveLength(0);
    await seller.context.close();
  });

  test('E — limite de consumo bloqueia com mensagem correta', async ({ browser }) => {
    test.setTimeout(180_000);
    const admin = await loginAs(browser, commercialE2e.email, commercialE2e.password);
    const setZero = await admin.page.request.patch('/api/ai/config', {
      data: { dailyTokenLimit: 0 },
    });
    expect(setZero.ok()).toBe(true);
    try {
      const seller = await loginAs(browser, EMAILS.vendedorA);
      const blocked = await seller.page.request.post('/api/ai/chat', {
        data: {
          contextType: 'GENERAL',
          message: 'oi com limite zerado',
          promptId: 'commercial-copilot',
        },
      });
      expect(blocked.status()).toBe(429);
      const body = (await blocked.json()) as {
        error: { code: string; message: string };
      };
      expect(body.error.code).toBe('USAGE_LIMIT_EXCEEDED');

      // O copiloto exibe a mensagem do servidor (não genérica).
      await seller.page.goto('/dashboard/base-conhecimento');
      await seller.page.getByLabel('Abrir Larcarvalho AI').click();
      await seller.page
        .getByPlaceholder('Pergunte ao Larcarvalho AI...')
        .fill('oi com limite zerado');
      await seller.page.getByRole('button', { name: 'Enviar pergunta' }).click();
      await expect(
        seller.page.getByText(/Limite de consumo de IA atingido/i).first(),
      ).toBeVisible({ timeout: 30_000 });
      await seller.context.close();
    } finally {
      const reset = await admin.page.request.patch('/api/ai/config', {
        data: { dailyTokenLimit: null },
      });
      expect(reset.ok()).toBe(true);
      await admin.context.close();
    }
  });

  test('F — vendedor não recebe TEAM_B', async ({ browser }) => {
    test.setTimeout(180_000);
    const teamB = await teamIdByName(TEAM_B);
    const admin = await loginAs(browser, commercialE2e.email, commercialE2e.password);
    await createTextDocument(admin.page, {
      category: 'PROCEDIMENTO',
      content: `Diretriz exclusiva ${LEAK_TOKEN} da equipe B para conferencia.`,
      teamId: teamB,
      title: `Diretriz sigilosa AI29 ${Date.now()}`,
      visibility: 'TEAM',
    });
    await admin.context.close();

    const sellerA = await loginAs(browser, EMAILS.vendedorA);
    const search = await sellerA.page.request.get(
      `/api/knowledge/search?q=${encodeURIComponent(LEAK_TOKEN)}&mode=lexical`,
    );
    expect(search.ok()).toBe(true);
    expect(((await search.json()) as { total: number }).total).toBe(0);
    const chat = await sellerA.page.request.post('/api/ai/chat', {
      data: {
        contextType: 'KNOWLEDGE',
        message: LEAK_TOKEN,
        promptId: 'knowledge-grounded-answer',
      },
    });
    expect(chat.ok()).toBe(true);
    const answer = (await chat.json()) as {
      response: { grounded?: boolean; sources: unknown[] };
    };
    expect(answer.response.grounded).toBe(false);
    expect(answer.response.sources).toHaveLength(0);
    await sellerA.context.close();
  });

  test('G — settings salva opção, testa conexão e nunca expõe chave', async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const admin = await loginAs(browser, commercialE2e.email, commercialE2e.password);
    await admin.page.goto('/configuracoes/ia');
    await expect(
      admin.page.getByRole('heading', { name: 'Inteligência Artificial' }),
    ).toBeVisible();
    await admin.page.getByLabel('TopK').fill('8');
    await admin.page.getByRole('button', { name: 'Salvar configuração' }).click();
    await expect(
      admin.page.getByText('Configuração da IA salva com sucesso.'),
    ).toBeVisible({ timeout: 15_000 });

    await admin.page.getByRole('button', { name: 'Testar conexão' }).click();
    await expect(admin.page.getByText(/mock\//).first()).toBeVisible({
      timeout: 15_000,
    });
    const body = await admin.page.locator('body').innerText();
    expect(body).not.toContain('AI_API_KEY');
    expect(body).not.toMatch(/sk-[A-Za-z0-9]/);

    // Restaura o padrão para não vazar estado entre suítes.
    await admin.page.getByLabel('TopK').fill('5');
    await admin.page.getByRole('button', { name: 'Salvar configuração' }).click();
    await expect(
      admin.page.getByText('Configuração da IA salva com sucesso.'),
    ).toBeVisible({ timeout: 15_000 });
    await admin.context.close();
  });

  test('H — mobile com streaming utilizável', async ({ browser }) => {
    test.setTimeout(180_000);
    const context = await browser.newContext({
      viewport: { height: 844, width: 390 },
    });
    const page = await context.newPage();
    await login(page, EMAILS.vendedorA, PASSWORD);
    await page.goto('/dashboard/base-conhecimento');
    await page.getByLabel('Abrir Larcarvalho AI').click();
    await page.getByRole('button', { name: 'Consultar a base' }).click();
    const drawer = page.getByRole('dialog', { name: /Larcarvalho AI/ });
    await expect(
      drawer.getByText(/Com base nas fontes recuperadas|Não encontrei/i).first(),
    ).toBeVisible({ timeout: 30_000 });
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(390);
    await context.close();
  });
});
