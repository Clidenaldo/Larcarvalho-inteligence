import { randomUUID } from 'node:crypto';

import { hash } from '@node-rs/argon2';
import { simulationResultSchema } from '@larcarvalho/shared';
import { expect, test, type Page } from '@playwright/test';
import { Client } from 'pg';

const PASSWORD = 'E2E-Senha-Vendas-123';
const TEAM_VENDAS = 'Equipe E2E Vendas';
const TEAM_OUTRA = 'Equipe E2E Vendas Outra';
const EMAILS = {
  vendedor: 'e2e-vendas-vendedor@local.test',
  gestor: 'e2e-vendas-gestor@local.test',
  gestorFora: 'e2e-vendas-gestor-fora@local.test',
} as const;
const LEAD_EMAIL = 'lead-e2e-vendas@local.test';

const state: {
  leadId?: string;
  proposalId?: string;
  saleId?: string;
  commissionId?: string;
  numero?: string;
  itemId?: string;
  proposalBefore?: unknown;
} = {};

function db() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is required for E2E');
  const target = new URL(url);
  if (
    !['localhost', '127.0.0.1'].includes(target.hostname) ||
    target.pathname !== '/larcarvalho_test'
  ) {
    throw new Error('E2E must target the local larcarvalho_test database');
  }
  return new Client({ connectionString: url });
}

async function cleanupVendasFixture() {
  const client = db();
  await client.connect();
  try {
    const database = await client.query('SELECT current_database() AS name');
    if (database.rows[0]?.name !== 'larcarvalho_test') {
      throw new Error('E2E cleanup requires the larcarvalho_test database');
    }
    const sales = await client.query<{ id: string }>(
      `SELECT s.id FROM sales s JOIN leads l ON l.id = s.lead_id WHERE l.email_normalizado = $1`,
      [LEAD_EMAIL],
    );
    const saleIds = sales.rows.map((row) => row.id);
    if (saleIds.length > 0) {
      await client.query(
        `DELETE FROM commissions WHERE sale_id = ANY($1) OR estorno_de_id IN (SELECT id FROM commissions WHERE sale_id = ANY($1))`,
        [saleIds],
      );
      await client.query('DELETE FROM sale_documents WHERE sale_id = ANY($1)', [
        saleIds,
      ]);
      await client.query('DELETE FROM sale_contracts WHERE sale_id = ANY($1)', [
        saleIds,
      ]);
      await client.query(
        'DELETE FROM sale_status_history WHERE sale_id = ANY($1)',
        [saleIds],
      );
      await client.query('DELETE FROM sales WHERE id = ANY($1)', [saleIds]);
    }
    await client.query(
      `DELETE FROM proposal_status_history WHERE proposal_id IN (SELECT id FROM proposals WHERE lead_id IN (SELECT id FROM leads WHERE email_normalizado = $1))`,
      [LEAD_EMAIL],
    );
    await client.query(
      `DELETE FROM proposal_items WHERE proposal_id IN (SELECT id FROM proposals WHERE lead_id IN (SELECT id FROM leads WHERE email_normalizado = $1))`,
      [LEAD_EMAIL],
    );
    await client.query(
      'DELETE FROM proposals WHERE lead_id IN (SELECT id FROM leads WHERE email_normalizado = $1)',
      [LEAD_EMAIL],
    );
    await client.query(
      'DELETE FROM simulations WHERE lead_id IN (SELECT id FROM leads WHERE email_normalizado = $1)',
      [LEAD_EMAIL],
    );
    await client.query('DELETE FROM leads WHERE email_normalizado = $1', [
      LEAD_EMAIL,
    ]);
    const users = await client.query<{ id: string }>(
      'SELECT id FROM users WHERE email = ANY($1)',
      [Object.values(EMAILS)],
    );
    for (const { id } of users.rows) {
      await client.query('DELETE FROM sessions WHERE user_id = $1', [id]);
      await client.query('DELETE FROM audit_logs WHERE actor_id = $1', [id]);
      await client.query(
        'UPDATE teams SET manager_id = NULL WHERE manager_id = $1',
        [id],
      );
      await client.query('DELETE FROM users WHERE id = $1', [id]);
    }
    await client.query('DELETE FROM teams WHERE name = ANY($1)', [
      [TEAM_VENDAS, TEAM_OUTRA],
    ]);
  } finally {
    await client.end();
  }
}

async function seedVendasFixture() {
  await cleanupVendasFixture();
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
    const userIds: Record<string, string> = {};
    for (const [email, nome, role] of [
      [EMAILS.vendedor, 'E2E Vendas Vendedor', 'VENDEDOR'],
      [EMAILS.gestor, 'E2E Vendas Gestor', 'GESTOR'],
      [EMAILS.gestorFora, 'E2E Vendas Gestor Fora', 'GESTOR'],
    ] as const) {
      const id = randomUUID();
      await client.query(
        'INSERT INTO users (id, nome, email, password_hash, role, ativo, updated_at) VALUES ($1, $2, $3, $4, $5, true, NOW())',
        [id, nome, email, passwordHash, role],
      );
      userIds[email] = id;
    }
    const teamId = randomUUID();
    const teamOutId = randomUUID();
    await client.query(
      'INSERT INTO teams (id, name, manager_id, active, created_at, updated_at) VALUES ($1, $2, $3, true, NOW(), NOW())',
      [teamId, TEAM_VENDAS, userIds[EMAILS.gestor]],
    );
    await client.query(
      'INSERT INTO teams (id, name, manager_id, active, created_at, updated_at) VALUES ($1, $2, $3, true, NOW(), NOW())',
      [teamOutId, TEAM_OUTRA, userIds[EMAILS.gestorFora]],
    );
    await client.query('UPDATE users SET team_id = $1 WHERE id = $2', [
      teamId,
      userIds[EMAILS.vendedor],
    ]);
    await client.query('UPDATE users SET team_id = $1 WHERE id = $2', [
      teamId,
      userIds[EMAILS.gestor],
    ]);
    await client.query('UPDATE users SET team_id = $1 WHERE id = $2', [
      teamOutId,
      userIds[EMAILS.gestorFora],
    ]);
    const leadId = randomUUID();
    await client.query(
      `INSERT INTO leads (id, nome, email_normalizado, origem, status, responsavel_id, categoria_interesse, valor_credito_desejado, updated_at)
       VALUES ($1, 'Cliente E2E Vendas', $2, 'CADASTRO_MANUAL', 'NEGOCIACAO', $3, 'IMOVEL', '200000', NOW())`,
      [leadId, LEAD_EMAIL, userIds[EMAILS.vendedor]],
    );
    const simulationId = randomUUID();
    await client.query(
      `INSERT INTO simulations (id, number, created_by_id, lead_id, category, credit_mode, requested_credit, desired_term_months, updated_at)
       VALUES ($1, $2, $3, $4, 'IMOVEL', 'CONTRACTED_CREDIT', '200000', 120, NOW())`,
      [simulationId, `SIM-E2E-${Date.now()}`, userIds[EMAILS.vendedor], leadId],
    );
    const proposalId = randomUUID();
    await client.query(
      `INSERT INTO proposals (id, number, simulation_id, created_by_id, lead_id, status, title, objective_summary, snapshot, version, valid_until, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'SENT', 'Proposta E2E Vendas', 'Avaliar crédito de 200 mil para imóvel.', '{}', 1, NOW() + INTERVAL '30 days', NOW())`,
      [
        proposalId,
        `PROP-E2E-${Date.now()}`,
        simulationId,
        userIds[EMAILS.vendedor],
        leadId,
      ],
    );
    await client.query(
      `INSERT INTO proposal_items (id, proposal_id, position, description, financial_snapshot)
       VALUES ($1, $2, 1, 'Adm E2E - Produto E2E', $3)`,
      [
        randomUUID(),
        proposalId,
        JSON.stringify(
          simulationResultSchema.omit({ id: true }).parse({
            badges: [],
            calculationStatus: 'COMPLETE',
            calculationWarnings: [],
            ruleVersion: 'E2E-1',
            sourceDataUpdatedAt: new Date().toISOString(),
            administratorId: (
              await client.query(
                "SELECT id FROM administradoras WHERE cnpj = '45723174000110'",
              )
            ).rows[0].id,
            productId: null,
            groupId: null,
            groupCode: null,
            quotaId: null,
            quotaNumber: null,
            category: 'IMOVEL',
            netCredit: '200000.00',
            totalTermMonths: 120,
            remainingTermMonths: 120,
            initialInstallment: '2400.00',
            reducedInstallment: null,
            laterInstallment: '2400.00',
            ownBidAmount: '0.00',
            embeddedBidAmount: '0.00',
            totalBidAmount: '0.00',
            totalBidPercent: '0.00',
            reserveFund: '0.00',
            insurance: '0.00',
            adhesionFee: '0.00',
            adherenceScore: null,
            assumptions: [],
            administratorName: 'Adm E2E',
            productName: 'Produto E2E',
            contractedCredit: '200000.00',
            firstInstallment: '2400.00',
            termMonths: 120,
            administrationFee: '12.00',
          }),
        ),
      ],
    );
    const chosen = await client.query(
      'SELECT id FROM proposal_items WHERE proposal_id = $1',
      [proposalId],
    );
    state.itemId = chosen.rows[0].id;
    await client.query('UPDATE proposal_items SET position = 2 WHERE id = $1', [
      state.itemId,
    ]);
    await client.query(
      `INSERT INTO proposal_items (id, proposal_id, position, description, financial_snapshot)
       SELECT $1, proposal_id, 1, 'Item alternativo - NÃO escolhido',
         financial_snapshot || '{"contractedCredit":"300000.00","firstInstallment":"3600.00"}'::jsonb
       FROM proposal_items WHERE id = $2`,
      [randomUUID(), state.itemId],
    );
    await client.query('COMMIT');
    state.leadId = leadId;
    state.proposalId = proposalId;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

async function login(page: Page, email: string, password: string = PASSWORD) {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /entrar/i }).click();
  await expect(page).toHaveURL(/dashboard/, { timeout: 60_000 });
}

test.describe('Vendas, contratos e comissões (browser real)', () => {
  test.describe.configure({ mode: 'default' });
  test.beforeEach(async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    state.saleId = undefined;
    state.commissionId = undefined;
    await seedVendasFixture();
    if (testInfo.title.startsWith('fluxo principal:')) return;
    // Independent fixtures use the real API. The principal test separately
    // exercises creation through the UI and must still fail if that UI is broken.
    const authenticated = await page.request.post('/api/auth/login', {
      data: { email: EMAILS.vendedor, password: PASSWORD },
    });
    expect(authenticated.status()).toBe(200);
    const accepted = await page.request.patch(
      `/api/proposals/${state.proposalId}/status`,
      { data: { status: 'ACCEPTED' } },
    );
    expect(accepted.ok()).toBe(true);
    const created = await page.request.post('/api/sales', {
      data: {
        proposalId: state.proposalId,
        proposalItemId: state.itemId,
        origemVenda: 'CRM',
      },
    });
    expect(created.status()).toBe(201);
    const sale = await created.json();
    state.saleId = sale.id;
    state.numero = sale.numero;
    const commissionResponse = await page.request.post(
      `/api/commissions/sales/${sale.id}/commissions`,
      {
        data: {
          tipo: 'PRINCIPAL',
          baseCalculo: 'CREDITO',
          baseValor: '200000.00',
          percentual: '2.50',
          competencia: '2026-10',
        },
      },
    );
    expect(commissionResponse.status()).toBe(201);
    state.commissionId = (await commissionResponse.json()).id;
    if (testInfo.title.startsWith('cancelamento bloqueado')) {
      const { commercialE2e } = await import('./commercial-fixture.js');
      expect(
        (
          await page.request.post('/api/auth/login', {
            data: {
              email: commercialE2e.email,
              password: commercialE2e.password,
            },
          })
        ).status(),
      ).toBe(200);
      expect(
        (
          await page.request.post(
            `/api/commissions/${state.commissionId}/confirm`,
            { data: { valorConfirmado: '4850.00' } },
          )
        ).status(),
      ).toBe(200);
      expect(
        (
          await page.request.post(
            `/api/commissions/${state.commissionId}/receive`,
            { data: { valorRecebido: '4850.00' } },
          )
        ).status(),
      ).toBe(200);
    }
  });
  test.afterEach(async () => {
    await cleanupVendasFixture();
  });

  test('fluxo principal: proposta aceita → venda → docs → contrato → comissão → recebimento → timeline', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await login(page, EMAILS.vendedor);
    await page.goto(`/dashboard/clientes/${state.leadId}`);
    await expect(
      page.getByRole('heading', { name: 'Cliente E2E Vendas' }),
    ).toBeVisible();
    await page.goto(`/propostas/${state.proposalId}`);
    await expect(
      page.getByRole('button', { name: 'Gerar venda', exact: true }),
    ).toHaveCount(0);
    const incompatible = await page.request.post('/api/sales', {
      data: {
        proposalId: state.proposalId,
        proposalItemId: state.itemId,
        origemVenda: 'CRM',
      },
    });
    expect(incompatible.status()).toBe(409);
    await page.locator('select[name="status"]').selectOption('ACCEPTED');
    await page
      .getByRole('button', { name: 'Salvar status', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Gerar venda', exact: true }),
    ).toBeVisible({ timeout: 30_000 });
    await page
      .locator('select[name="proposalItemId"]')
      .selectOption(state.itemId!);
    const before = db();
    await before.connect();
    try {
      state.proposalBefore = (
        await before.query(
          'SELECT to_jsonb(p) AS value FROM proposals p WHERE id = $1',
          [state.proposalId],
        )
      ).rows[0].value;
    } finally {
      await before.end();
    }
    await page.getByRole('button', { name: /gerar venda/i }).click();
    await page.waitForURL(/\/dashboard\/vendas\/[0-9a-f-]+/, {
      timeout: 30_000,
    });
    const saleUrl = page.url();
    state.saleId = saleUrl.split('/').pop();
    await expect(page.getByText(/VEN-\d{4}-\d{6}/).first()).toBeVisible();
    state.numero = (
      await page
        .getByText(/VEN-\d{4}-\d{6}/)
        .first()
        .textContent()
    )?.trim();
    const snapshotDb = db();
    await snapshotDb.connect();
    try {
      const row = (
        await snapshotDb.query('SELECT * FROM sales WHERE id = $1', [
          state.saleId,
        ])
      ).rows[0];
      expect(row.proposal_item_id).toBe(state.itemId);
      expect(row.valor_credito_contratado).toBe('200000.00');
      // Full snapshot fidelity is independently asserted in the PostgreSQL suite,
      // so a snapshot defect does not prevent execution of all financial UI steps.
      await test.info().attach('persisted-sale-snapshot', {
        body: JSON.stringify(row.snapshot, null, 2),
        contentType: 'application/json',
      });
      expect(row.snapshot.credito).toBe('200000.00');
      expect(
        (
          await snapshotDb.query(
            'SELECT to_jsonb(p) AS value FROM proposals p WHERE id = $1',
            [state.proposalId],
          )
        ).rows[0].value,
      ).toEqual(state.proposalBefore);
    } finally {
      await snapshotDb.end();
    }

    await page
      .locator('select[name="status"]')
      .selectOption('AGUARDANDO_DOCUMENTOS');
    await page.getByRole('button', { name: /confirmar etapa/i }).click();
    await expect(page.getByText('Aguardando documentos').first()).toBeVisible({
      timeout: 15_000,
    });

    const cpfRow = page.locator('li', { hasText: 'CPF' }).first();
    await cpfRow.locator('select[name="docStatus"]').selectOption('RECEBIDO');
    await cpfRow.locator('input[name="referencia"]').fill('pasta-e2e/doc-1');
    await cpfRow.getByRole('button', { name: /salvar/i }).click();
    await expect(page.getByText('Documento atualizado.')).toBeVisible({
      timeout: 15_000,
    });

    await page
      .locator('input[name="numeroContrato"]')
      .first()
      .fill('E2E-CTR-1');
    await page.getByRole('button', { name: /registrar contrato/i }).click();
    await expect(page.getByText('Contrato registrado.')).toBeVisible({
      timeout: 15_000,
    });

    await page.locator('select[name="baseCalculo"]').selectOption('CREDITO');
    await page.locator('input[name="baseValor"]').fill('200000.00');
    await page.locator('input[name="percentual"]').fill('2.50');
    await page.locator('input[name="competencia"]').fill('2026-10');
    const commissionResponse = page.waitForResponse(
      (response) =>
        response
          .url()
          .endsWith(`/api/commissions/sales/${state.saleId}/commissions`) &&
        response.request().method() === 'POST',
    );
    await page
      .getByRole('button', { name: /lançar comissão prevista/i })
      .click();
    expect((await commissionResponse).status()).toBe(201);
    await expect(page.getByText('Comissão prevista lançada.')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText('R$ 5000.00').first()).toBeVisible();

    const commissionId = await page.evaluate(async (saleId) => {
      const response = await fetch(
        `/api/commissions?saleId=${saleId}&page=1&pageSize=5`,
        {
          headers: { accept: 'application/json' },
        },
      );
      const body = (await response.json()) as { items: { id: string }[] };
      return body.items[0]?.id;
    }, state.saleId);
    state.commissionId = commissionId as string;
    expect(state.commissionId).toBeTruthy();
    const { commercialE2e } = await import('./commercial-fixture.js');
    await login(page, commercialE2e.email, commercialE2e.password);
    await page.goto(`/dashboard/vendas/${state.saleId}`);
    await page.locator('input[name="valorConfirmado"]').fill('4850.00');
    await page.getByRole('button', { name: /^confirmar$/i }).click();
    await expect(page.getByText('Comissão confirmada.')).toBeVisible();
    await page.locator('input[name="valorRecebido"]').fill('2000.00');
    await page.getByRole('button', { name: /^receber$/i }).click();
    await expect(page.getByText('Recebimento registrado.')).toBeVisible();
    await page.goto(`/dashboard/clientes/${state.leadId}`);
    await expect(
      page.getByText(new RegExp(`Venda ${state.numero}`)).first(),
    ).toBeVisible();
  });

  test('RBAC: vendedor não confirma recebimento; gestor de outra equipe não acessa', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    expect(state.commissionId).toBeTruthy();
    await login(page, EMAILS.vendedor);
    await page.goto(`/dashboard/vendas/${state.saleId}`);
    await expect(page.getByRole('button', { name: /^receber$/i })).toHaveCount(
      0,
    );
    const receiveDenied = await page.request.post(
      `/api/commissions/${state.commissionId}/receive`,
      { data: { valorRecebido: '5000.00' } },
    );
    expect(receiveDenied.status()).toBe(403);
    const denied = await page.request.post(
      `/api/commissions/${state.commissionId}/confirm`,
      {
        data: { valorConfirmado: '5000.00' },
      },
    );
    expect(denied.status()).toBe(403);

    await login(page, EMAILS.gestorFora);
    const hidden = await page.request.get(`/api/sales/${state.saleId}`);
    expect(hidden.status()).toBe(404);
    await page.goto(`/dashboard/vendas/${state.saleId}`);
    await expect(
      page.getByText(/acesso não autorizado|não encontrada/i).first(),
    ).toBeVisible({
      timeout: 15_000,
    });
  });

  test('confirmação e recebimento pelo financeiro via browser', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const { commercialE2e } = await import('./commercial-fixture.js');
    await login(page, commercialE2e.email, commercialE2e.password);
    await page.goto(`/dashboard/vendas/${state.saleId}`);
    await page.locator('input[name="valorConfirmado"]').fill('4850.00');
    await page.getByRole('button', { name: /^confirmar$/i }).click();
    await expect(page.getByText('Comissão confirmada.')).toBeVisible();
    await expect(page.getByText(/divergência/i).first()).toBeVisible();
    await page.locator('input[name="valorRecebido"]').fill('4850.00');
    await page.getByRole('button', { name: /^receber$/i }).click();
    await expect(page.getByText('Recebimento registrado.')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText('RECEBIDA').first()).toBeVisible();
  });

  test('cancelamento bloqueado com comissão recebida; estorno preserva histórico', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const { commercialE2e } = await import('./commercial-fixture.js');
    await login(page, commercialE2e.email, commercialE2e.password);
    const blocked = await page.request.post(
      `/api/sales/${state.saleId}/cancel`,
      {
        data: { motivo: 'CLIENTE_DESISTIU' },
      },
    );
    expect(blocked.status()).toBe(409);
    const reversed = await page.request.post(
      `/api/commissions/${state.commissionId}/reverse`,
      { data: { motivo: 'CANCELAMENTO_VENDA' } },
    );
    expect(reversed.ok()).toBeTruthy();
    const cancelled = await page.request.post(
      `/api/sales/${state.saleId}/cancel`,
      {
        data: { motivo: 'CLIENTE_DESISTIU' },
      },
    );
    expect(cancelled.ok()).toBeTruthy();

    await page.goto(`/dashboard/clientes/${state.leadId}`);
    await expect(
      page.getByText(new RegExp(`Venda ${state.numero}`)).first(),
    ).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/CANCELADA/).first()).toBeVisible();
  });

  test('IA resume a venda com fatos reais sem inventar valores', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await login(page, EMAILS.vendedor);
    await page.goto(`/dashboard/vendas/${state.saleId}`);
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/ai/chat') &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /resumir venda/i }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    expect(response.request().postDataJSON()).toMatchObject({
      contextType: 'SALE',
      contextId: state.saleId,
      message: 'Resuma esta venda',
    });
    const payload = await response.json();
    expect(payload.provider).toBe('mock');
    expect(payload.response.facts.join('\n')).toContain(state.numero);
    expect(payload.response.facts.join('\n')).toContain('200000.00');
    await expect(page.getByText('Copiloto Comercial')).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page
        .getByRole('dialog', { name: /Larcarvalho AI/ })
        .getByText(new RegExp(state.numero ?? 'VEN-'))
        .first(),
    ).toBeVisible({
      timeout: 60_000,
    });
    const drawer = page.getByRole('dialog', { name: /Larcarvalho AI/ });
    await expect(drawer).not.toContainText('vai contemplar');
    await expect(drawer).not.toContainText('garantido');
    const client = db();
    await client.connect();
    try {
      const alternate = (
        await client.query(
          'SELECT id FROM proposal_items WHERE proposal_id = $1 AND position = 1',
          [state.proposalId],
        )
      ).rows[0].id;
      const created = await page.request.post('/api/sales', {
        data: {
          proposalId: state.proposalId,
          proposalItemId: alternate,
          origemVenda: 'CRM',
        },
      });
      expect(created.status()).toBe(201);
      const emptySale = await created.json();
      const before = (
        await client.query(
          'SELECT to_jsonb(s) AS value FROM sales s WHERE id = $1',
          [emptySale.id],
        )
      ).rows[0].value;
      await page.goto(`/dashboard/vendas/${emptySale.id}`);
      const emptyResponsePromise = page.waitForResponse(
        (result) =>
          result.url().endsWith('/api/ai/chat') &&
          result.request().method() === 'POST',
      );
      await page.getByRole('button', { name: /resumir venda/i }).click();
      const emptyResponse = await emptyResponsePromise;
      expect(emptyResponse.status()).toBe(200);
      const emptyPayload = await emptyResponse.json();
      expect(emptyPayload.provider).toBe('mock');
      expect(emptyPayload.response.facts).toContainEqual(
        expect.stringMatching(/^Contratos: não informado$/i),
      );
      expect(emptyPayload.response.facts.join('\n')).not.toMatch(
        /Comissão PRINCIPAL|E2E-CTR-1|4850/,
      );
      expect(emptyPayload.response.facts.join('\n')).toContain('300000.00');
      await expect(
        page
          .getByRole('dialog', { name: /Larcarvalho AI/ })
          .getByText(/^Contratos: não informado$/i),
      ).toBeVisible();
      expect(
        (
          await client.query(
            'SELECT to_jsonb(s) AS value FROM sales s WHERE id = $1',
            [emptySale.id],
          )
        ).rows[0].value,
      ).toEqual(before);
      expect(
        (
          await client.query(
            'SELECT count(*)::int AS count FROM sale_contracts WHERE sale_id = $1',
            [emptySale.id],
          )
        ).rows[0].count,
      ).toBe(0);
      expect(
        (
          await client.query(
            'SELECT count(*)::int AS count FROM commissions WHERE sale_id = $1',
            [emptySale.id],
          )
        ).rows[0].count,
      ).toBe(0);
    } finally {
      await client.end();
    }
  });
});
