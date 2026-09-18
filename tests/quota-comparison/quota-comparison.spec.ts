import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../apps/backend/src/generated/prisma/client';

test('real quota calculation, aligned responsive comparison, selection, proposal and seller isolation', async ({
  page,
  browser,
}) => {
  const database = new URL(process.env.TEST_DATABASE_URL!);
  if (
    database.hostname !== '127.0.0.1' ||
    database.pathname !== '/larcarvalho_comparison_validation'
  )
    throw new Error('Requires isolated validation database');
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: database.toString() }),
  });
  const suffix = randomUUID();
  const password = `Comparison-${randomUUID()}`;
  try {
    const seller = await db.user.create({
      data: {
        nome: 'Comparação E2E',
        email: `comparison-${suffix}@example.test`,
        passwordHash: await hash(password),
        role: 'VENDEDOR',
      },
    });
    const other = await db.user.create({
      data: {
        nome: 'Outro vendedor E2E',
        email: `other-${suffix}@example.test`,
        passwordHash: await hash(password),
        role: 'VENDEDOR',
      },
    });
    const admin = await db.administradora.create({
      data: { nome: `Administradora comparação ${suffix}` },
    });
    const product = await db.produto.create({
      data: {
        administradoraId: admin.id,
        nome: 'Produto E2E',
        categoria: 'IMOVEL',
      },
    });
    const group = await db.grupo.create({
      data: {
        administradoraId: admin.id,
        produtoId: product.id,
        codigo: 'GRUPO-E2E',
        status: 'ATIVO',
      },
    });
    const quotas = [];
    for (let i = 1; i <= 6; i++)
      quotas.push(
        await db.cota.create({
          data: { grupoId: group.id, numero: `E2E-${i}`, status: 'ATIVO' },
        }),
      );
    const lead = await db.lead.create({
      data: {
        nome: 'Cliente comparação E2E',
        emailNormalizado: `client-${suffix}@example.test`,
        origem: 'CADASTRO_MANUAL',
        responsavelId: seller.id,
      },
    });
    await db.commercialConfiguration.create({
      data: {
        requiredDisclaimer: 'Simulação de teste, sem garantia de contemplação.',
        proposalValidityDays: 7,
      },
    });
    await db.productCommercialRule.create({
      data: {
        administradoraId: admin.id,
        produtoId: product.id,
        category: 'IMOVEL',
        name: 'Regra E2E',
        version: 1,
        validFrom: new Date('2020-01-01'),
        administrationFeePercent: '15',
        reserveFundPercent: '2',
        insurancePercent: '0',
        adhesionFeePercent: '0',
        maxEmbeddedBidPercent: '30',
        minimumTermMonths: 60,
        maximumTermMonths: 240,
        reducedInstallmentPercent: '50',
        reducedUntilContemplation: true,
        inProgressAllowed: true,
        structuredOperationEligible: true,
      },
    });
    const login = await page.request.post('/api/auth/login', {
      data: { email: seller.email, password },
    });
    expect(login.ok()).toBeTruthy();
    const create = await page.request.post('/api/simulations', {
      data: {
        leadId: lead.id,
        category: 'IMOVEL',
        creditMode: 'NET_CREDIT',
        requestedCredit: '180000',
        desiredTermMonths: 100,
        ownBidAmount: '10000',
        embeddedBidPercent: '10',
        paidInstallments: 5,
        structuredOperation: true,
        administratorIds: [admin.id],
        productIds: [product.id],
        groupIds: [],
        quotaIds: quotas.map((q) => q.id),
        sort: 'ADHERENCE',
      },
    });
    expect(create.status()).toBe(201);
    const simulation = await create.json();
    const calculate = await page.request.post(
      `/api/simulations/${simulation.id}/calculate`,
      { data: { scenarioName: 'Cenário E2E', sort: 'ADHERENCE', pin: true } },
    );
    expect(calculate.ok()).toBeTruthy();
    const scenario = await calculate.json();
    expect(scenario.results).toHaveLength(6);
    expect(
      new Set(scenario.results.map((r: { id: string }) => r.id)).size,
    ).toBe(6);
    expect(scenario.results[0]).toMatchObject({
      groupCode: 'GRUPO-E2E',
      quotaNumber: 'E2E-1',
      contractedCredit: '200000',
      netCredit: '180000',
      remainingTermMonths: 95,
    });
    await page.goto(`/simulacoes/${simulation.id}`);
    for (let i = 0; i < 5; i++)
      await page
        .getByRole('button', { name: 'Fixar', exact: true })
        .first()
        .click();
    await expect(page.getByText(/5 de 5 selecionados/)).toBeVisible();
    await page.getByRole('button', { name: 'Fixar', exact: true }).click();
    await expect(
      page.getByText(/Você pode comparar até 5 cotas por vez/),
    ).toBeVisible();
    await expect(page.getByText(/Não foi adicionada/)).toBeVisible();
    const region = page.getByRole('region', {
      name: 'Comparação de cotas e resultados',
    });
    await expect(region.getByRole('columnheader')).toHaveCount(6);
    await expect(region.getByRole('columnheader')).toContainText([
      'Critério',
      'Cota E2E-1',
      'Cota E2E-2',
      'Cota E2E-3',
      'Cota E2E-4',
      'Cota E2E-5',
    ]);
    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await region.scrollIntoViewIfNeeded();
      const geometry = await region.evaluate((element) => {
        element.scrollLeft = 0;
        element.scrollTop = 0;
        const heads = element.querySelectorAll('thead th');
        return {
          scroll: element.scrollWidth,
          width: element.clientWidth,
          first: heads[1]!.getBoundingClientRect().toJSON(),
          second: heads[2]!.getBoundingClientRect().toJSON(),
          columns: [...heads]
            .slice(1)
            .map((head) => head.getBoundingClientRect().toJSON()),
          criterion: heads[0]!.getBoundingClientRect().left,
        };
      });
      expect(geometry.second.x).toBeGreaterThan(geometry.first.x);
      expect(geometry.second.y).toBe(geometry.first.y);
      expect(geometry.columns).toHaveLength(5);
      geometry.columns.forEach((column, index) => {
        expect(column.y).toBe(geometry.first.y);
        if (index)
          expect(column.x).toBeGreaterThan(geometry.columns[index - 1]!.x);
      });
      expect(geometry.scroll).toBeGreaterThan(geometry.width);
      for (const number of [1, 2, 3, 4, 5]) {
        const header = region.getByRole('columnheader', {
          name: new RegExp(`^Cota E2E-${number} `),
        });
        await header.scrollIntoViewIfNeeded();
        const box = await header.boundingBox();
        const bounds = await region.boundingBox();
        expect(box!.x).toBeLessThan(bounds!.x + bounds!.width);
        expect(box!.x + box!.width).toBeGreaterThan(bounds!.x + 128);
      }
      await region.evaluate((e) => {
        e.scrollLeft = 0;
      });
      await region.focus();
      await page.keyboard.press('ArrowRight');
      await expect
        .poll(() => region.evaluate((e) => e.scrollLeft))
        .toBeGreaterThan(0);
      await region.evaluate((e) => {
        e.scrollLeft = 300;
        e.scrollTop = 350;
      });
      const sticky = await region
        .getByRole('columnheader', { name: 'Critério', exact: true })
        .boundingBox();
      expect(Math.abs(sticky!.x - geometry.criterion)).toBeLessThan(2);
      const frame = await region.boundingBox();
      expect(Math.abs(sticky!.y - frame!.y)).toBeLessThan(2);
      await region.evaluate((element) => {
        element.scrollLeft = 0;
        element.scrollTop = 0;
      });
      await page.screenshot({
        path: `test-results/quota-comparison/comparison-${viewport.width}.png`,
      });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await region.evaluate((e) => {
      e.scrollLeft = 0;
      e.scrollTop = 0;
    });
    await page
      .getByRole('button', {
        name: 'Remover cota E2E-1 da comparação',
        exact: true,
      })
      .click();
    await expect(region.getByRole('columnheader')).toHaveCount(5);
    const originalScenario = page.locator('section').filter({
      has: page.getByRole('heading', { name: 'Cenário E2E', exact: true }),
    });
    await originalScenario
      .getByRole('article')
      .filter({ hasText: 'Cota E2E-6' })
      .getByRole('button', { name: 'Fixar', exact: true })
      .click();
    await expect(region.getByRole('columnheader')).toHaveCount(6);
    await expect(region.getByRole('columnheader').last()).toContainText(
      'Cota E2E-6',
    );
    await page.getByLabel('Ordenar comparação').selectOption('netCredit');
    await page.emulateMedia({ media: 'print' });
    await expect(region).toHaveCSS('overflow', 'visible');
    await expect(
      region.getByRole('columnheader', { name: 'Critério', exact: true }),
    ).toHaveCSS('position', 'static');
    await expect(
      region.getByRole('rowheader', { name: 'Data e hora do cálculo' }),
    ).toBeVisible();
    await page.emulateMedia({ media: 'screen' });
    await page.getByRole('button', { name: 'Recalcular', exact: true }).click();
    await expect(page.getByText('Cenário 2', { exact: true })).toBeVisible();
    await expect(region.getByRole('columnheader')).toContainText([
      'Critério',
      'Cota E2E-2',
      'Cota E2E-3',
      'Cota E2E-4',
      'Cota E2E-5',
      'Cota E2E-6',
    ]);
    await expect(
      region.getByRole('columnheader', { name: /Cota E2E-2/ }),
    ).toBeVisible();
    await expect(region.getByRole('columnheader')).toHaveCount(6);
    await expect(
      page.getByRole('button', { name: /Criar proposta \(5\)/ }),
    ).toBeDisabled();
    for (const number of [5, 6])
      await page
        .getByRole('button', {
          name: 'Remover cota E2E-' + number + ' da comparação',
          exact: true,
        })
        .click();
    await expect(region.getByRole('columnheader')).toHaveCount(4);
    const proposalResponse = page.waitForResponse(
      (response) =>
        response
          .url()
          .endsWith(`/api/simulations/${simulation.id}/proposals`) &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /Criar proposta \(3\)/ }).click();
    expect((await proposalResponse).status()).toBe(201);
    await expect(page).toHaveURL(/\/propostas\//, { timeout: 30000 });
    const proposalId = page.url().split('/').pop();
    const pdf = await page.request.post(`/api/proposals/${proposalId}/pdf`);
    expect(pdf.ok()).toBeTruthy();
    expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
    const otherContext = await browser.newContext({
      baseURL: 'http://localhost:3100',
    });
    await otherContext.request.post('/api/auth/login', {
      data: { email: other.email, password },
    });
    expect(
      (
        await otherContext.request.get(`/api/simulations/${simulation.id}`)
      ).status(),
    ).toBe(404);
    expect(
      (await otherContext.request.get(`/api/proposals/${proposalId}`)).status(),
    ).toBe(404);
    await otherContext.close();
    expect(await db.cota.count({ where: { grupoId: group.id } })).toBe(6);
  } finally {
    await db.$disconnect();
  }
});
