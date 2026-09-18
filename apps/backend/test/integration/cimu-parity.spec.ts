import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { parseEnvironment, type AppConfig } from '../../src/config/env.js';
import '../../src/config/load-env.js';
import { hashPassword } from '../../src/core/auth/password.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createPrismaClient } from '../../src/infrastructure/database/prisma-client.js';
import { IdentityService } from '../../src/modules/identity/identity.service.js';
import { wipeSalesData } from './clean-vendas.js';

const url = process.env.TEST_DATABASE_URL;
const run = url ? describe : describe.skip;
const password = 'frase senha comercial segura';
const cookie = (response: { headers: Record<string, unknown> }) => {
  const value = response.headers['set-cookie'];
  if (typeof value !== 'string') throw new Error('Cookie ausente');
  return value.split(';', 1)[0] as string;
};

run('phase 21 commerce parity capabilities with PostgreSQL', () => {
  let db: PrismaClient;
  let config: AppConfig;
  let identity: IdentityService;

  async function clean() {
    await wipeSalesData(db);
    await db.proposalStatusHistory.deleteMany();
    await db.proposalItem.deleteMany();
    await db.proposal.deleteMany();
    await db.simulationFavorite.deleteMany();
    await db.simulationResult.deleteMany();
    await db.simulationCalculationSnapshot.deleteMany();
    await db.simulationScenario.deleteMany();
    await db.simulation.deleteMany();
    await db.productCommercialRule.deleteMany();
    await db.commercialConfiguration.deleteMany();
    await db.leadInteracao.deleteMany();
    await db.leadInteresse.deleteMany();
    await db.lead.deleteMany();
    await db.grupoHistorico.deleteMany();
    await db.dataQualityIssue.deleteMany();
    await db.contemplacao.deleteMany();
    await db.lance.deleteMany();
    await db.assembleia.deleteMany();
    await db.cota.deleteMany();
    await db.grupo.deleteMany();
    await db.tabelaComercialItem.deleteMany();
    await db.tabelaComercial.deleteMany();
    await db.produto.deleteMany();
    await db.administradora.deleteMany();
    await db.session.deleteMany();
    await db.auditLog.deleteMany();
    await db.user.deleteMany();
  }

  beforeAll(() => {
    config = parseEnvironment({
      ...process.env,
      DATABASE_URL: url,
      FRONTEND_URL: 'http://frontend.test',
      LOG_LEVEL: 'silent',
      NODE_ENV: 'test',
    });
    db = createPrismaClient(config);
    identity = new IdentityService(db, config);
  });
  beforeEach(clean);
  afterAll(async () => {
    await clean();
    await db.$disconnect();
  });

  async function setup() {
    const passwordHash = await hashPassword(password);
    const admin = await db.user.create({
      data: {
        nome: 'Administradora Sistema',
        email: 'admin.parity@example.com',
        passwordHash,
        role: 'ADMIN',
      },
    });
    const administrator = await db.administradora.create({
      data: { nome: 'Administradora Paridade' },
    });
    const product = await db.produto.create({
      data: {
        administradoraId: administrator.id,
        nome: 'Imóvel Paridade',
        categoria: 'IMOVEL',
      },
    });
    const lead = await db.lead.create({
      data: {
        nome: 'Cliente Paridade',
        emailNormalizado: 'clienteparidade@example.com',
        origem: 'CADASTRO_MANUAL',
        responsavelId: admin.id,
      },
    });
    await db.commercialConfiguration.create({
      data: {
        organizationName: 'Larcarvalho Consórcios',
        requiredDisclaimer:
          'Esta proposta usa regras configuradas e deve ser confirmada antes da contratação.',
        proposalValidityDays: 10,
      },
    });
    const app = await buildApp({
      config,
      identityService: identity,
      logger: false,
    });
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: admin.email, password },
    });
    const headers = {
      cookie: cookie(login),
      origin: 'http://frontend.test',
    };
    return { admin, administrator, product, lead, app, headers };
  }

  async function createRule(
    administratorId: string,
    productId: string,
    name: string,
    version: number,
    overrides: Record<string, unknown> = {},
  ) {
    return db.productCommercialRule.create({
      data: {
        administradoraId: administratorId,
        produtoId: productId,
        category: 'IMOVEL',
        name,
        version,
        validFrom: new Date('2026-01-01T00:00:00Z'),
        administrationFeePercent: '15',
        reserveFundPercent: '2',
        insurancePercent: '1',
        adhesionFeePercent: '0',
        maxEmbeddedBidPercent: '30',
        minimumTermMonths: 60,
        maximumTermMonths: 240,
        reducedInstallmentPercent: '50',
        reducedUntilContemplation: true,
        inProgressAllowed: true,
        structuredOperationEligible: true,
        ...overrides,
      },
    });
  }

  it('recalculates with an explicit term and dilutes paid reduced-installment discounts', async () => {
    const { administrator, product, app, headers } = await setup();
    try {
      await createRule(administrator.id, product.id, 'Diluição', 1, {
        embeddedBidBasis: 'PLAN_TOTAL',
        diluteReducedInstallments: true,
      });
      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/simulations',
        headers,
        payload: {
          category: 'IMOVEL',
          creditMode: 'CONTRACTED_CREDIT',
          requestedCredit: '200000',
          desiredTermMonths: 100,
          ownBidAmount: '0',
          embeddedBidPercent: '10',
          paidInstallments: 20,
          structuredOperation: false,
          administratorIds: [administrator.id],
          productIds: [product.id],
          groupIds: [],
          quotaIds: [],
          sort: 'ADHERENCE',
        },
      });
      expect(created.statusCode).toBe(201);
      const calculated = await app.inject({
        method: 'POST',
        url: `/api/v1/simulations/${created.json().id as string}/calculate`,
        headers,
        payload: { scenarioName: 'Cenário diluição', sort: 'ADHERENCE', termMonths: 100 },
      });
      expect(calculated.statusCode).toBe(200);
      const result = calculated.json().results[0];
      expect(result).toMatchObject({
        calculationStatus: 'COMPLETE',
        contractedCredit: '200000',
        netCredit: '176400',
        initialInstallment: '2360',
        reducedInstallment: '1180',
        laterInstallment: '2655',
        totalTermMonths: 100,
        remainingTermMonths: 80,
        embeddedBidAmount: '23600',
      });
      const joined = result.assumptions.join(' ');
      expect(joined).toContain('total do plano');
      expect(joined).toContain('diluído em 80 parcelas restantes');
    } finally {
      await app.close();
    }
  });

  it('derives contracted credit from the category value and flags missing ratio', async () => {
    const { administrator, product, app, headers } = await setup();
    try {
      const v1 = await createRule(administrator.id, product.id, 'Por categoria', 1, {
        categoryValueCreditRatio: '90',
      });
      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/simulations',
        headers,
        payload: {
          category: 'IMOVEL',
          creditMode: 'CATEGORY_VALUE',
          requestedCredit: '200000',
          desiredTermMonths: 120,
          embeddedBidPercent: '10',
          administratorIds: [administrator.id],
          productIds: [product.id],
        },
      });
      const calculated = await app.inject({
        method: 'POST',
        url: `/api/v1/simulations/${created.json().id as string}/calculate`,
        headers,
        payload: { scenarioName: 'Por categoria', sort: 'ADHERENCE' },
      });
      expect(calculated.statusCode).toBe(200);
      expect(calculated.json().results[0]).toMatchObject({
        calculationStatus: 'COMPLETE',
        contractedCredit: '180000',
        netCredit: '162000',
        embeddedBidAmount: '18000',
      });
      expect(calculated.json().results[0].assumptions.join(' ')).toContain(
        'valor da categoria',
      );
      await db.productCommercialRule.update({
        where: { id: v1.id },
        data: { active: false },
      });
      await createRule(administrator.id, product.id, 'Sem proporção', 2);
      const incomplete = await app.inject({
        method: 'POST',
        url: `/api/v1/simulations/${created.json().id as string}/calculate`,
        headers,
        payload: { scenarioName: 'Sem proporção', sort: 'ADHERENCE' },
      });
      const lacking = incomplete.json().results[0];
      expect(lacking.calculationStatus).toBe('INCOMPLETE_DATA');
      expect(lacking.calculationWarnings[0]).toContain('valor da categoria');
    } finally {
      await app.close();
    }
  });

  it('applies insurance and embedded-bid toggles per scenario along with a custom term', async () => {
    const { administrator, product, app, headers } = await setup();
    try {
      await createRule(administrator.id, product.id, 'Variantes', 1);
      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/simulations',
        headers,
        payload: {
          category: 'IMOVEL',
          creditMode: 'CONTRACTED_CREDIT',
          requestedCredit: '200000',
          desiredTermMonths: 100,
          embeddedBidPercent: '10',
          administratorIds: [administrator.id],
          productIds: [product.id],
        },
      });
      const simulationId = created.json().id as string;
      const withoutInsurance = await app.inject({
        method: 'POST',
        url: `/api/v1/simulations/${simulationId}/calculate`,
        headers,
        payload: {
          scenarioName: 'Sem seguro, prazo 60',
          sort: 'ADHERENCE',
          termMonths: 60,
          includeInsurance: false,
          includeEmbeddedBid: true,
        },
      });
      const first = withoutInsurance.json().results[0];
      expect(first).toMatchObject({
        calculationStatus: 'COMPLETE',
        initialInstallment: '3900',
        laterInstallment: '3900',
        netCredit: '180000',
        totalTermMonths: 60,
        remainingTermMonths: 60,
      });
      expect(first.assumptions.join(' ')).toContain(
        'seguro foi excluído desta simulação',
      );
      const withoutBid = await app.inject({
        method: 'POST',
        url: `/api/v1/simulations/${simulationId}/calculate`,
        headers,
        payload: {
          scenarioName: 'Sem lance embutido',
          sort: 'ADHERENCE',
          includeInsurance: true,
          includeEmbeddedBid: false,
        },
      });
      expect(withoutBid.json().results[0]).toMatchObject({
        calculationStatus: 'COMPLETE',
        netCredit: '200000',
        embeddedBidAmount: '0',
        totalBidAmount: '0',
      });
      expect(withoutBid.json().results[0].assumptions.join(' ')).toContain(
        'lance embutido foi excluído desta simulação',
      );
    } finally {
      await app.close();
    }
  });

  it('enforces bid types and own-bid caps from the rule', async () => {
    const { administrator, product, app, headers } = await setup();
    try {
      const percentual = await createRule(
        administrator.id,
        product.id,
        'Lance percentual limitado',
        1,
        { bidType: 'PERCENTUAL', ownBidMaxPercent: '10' },
      );
      const createAndCalculate = async (ownBidAmount: string) => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/simulations',
          headers,
          payload: {
            category: 'IMOVEL',
            creditMode: 'CONTRACTED_CREDIT',
            requestedCredit: '200000',
            desiredTermMonths: 100,
            ownBidAmount,
            embeddedBidPercent: '10',
            administratorIds: [administrator.id],
            productIds: [product.id],
          },
        });
        return app.inject({
          method: 'POST',
          url: `/api/v1/simulations/${response.json().id as string}/calculate`,
          headers,
          payload: { scenarioName: 'Lances', sort: 'ADHERENCE' },
        });
      };
      const blocked = await createAndCalculate('25000');
      expect(blocked.json().results[0].calculationStatus).toBe('INELIGIBLE');
      expect(blocked.json().results[0].calculationWarnings[0]).toContain(
        'limite de 10% do crédito contratado',
      );
      const allowed = await createAndCalculate('15000');
      expect(allowed.json().results[0]).toMatchObject({
        calculationStatus: 'COMPLETE',
        ownBidAmount: '15000',
        totalBidAmount: '35000',
      });
      await db.productCommercialRule.update({
        where: { id: percentual.id },
        data: { active: false },
      });
      await createRule(administrator.id, product.id, 'Lance fixo', 2, {
        bidType: 'FIXED',
      });
      const fixed = await createAndCalculate('10000');
      expect(fixed.json().results[0].calculationStatus).toBe('INELIGIBLE');
      expect(fixed.json().results[0].calculationWarnings[0]).toContain(
        'lance fixo',
      );
    } finally {
      await app.close();
    }
  });

  it('exports a summary PDF hiding monetary rows', async () => {
    const { administrator, product, lead, app, headers } = await setup();
    try {
      await createRule(administrator.id, product.id, 'Resumo', 1);
      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/simulations',
        headers,
        payload: {
          leadId: lead.id,
          category: 'IMOVEL',
          creditMode: 'CONTRACTED_CREDIT',
          requestedCredit: '200000',
          desiredTermMonths: 100,
          embeddedBidPercent: '10',
          administratorIds: [administrator.id],
          productIds: [product.id],
        },
      });
      const calculated = await app.inject({
        method: 'POST',
        url: `/api/v1/simulations/${created.json().id as string}/calculate`,
        headers,
        payload: { scenarioName: 'Resumo', sort: 'ADHERENCE', pin: true },
      });
      const resultId = calculated.json().results[0].id as string;
      const proposalResponse = await app.inject({
        method: 'POST',
        url: `/api/v1/simulations/${created.json().id as string}/proposals`,
        headers,
        payload: {
          leadId: lead.id,
          resultIds: [resultId],
          title: 'Proposta resumida',
          objectiveSummary: 'Condições comerciais resumidas para o cliente.',
        },
      });
      const proposalId = proposalResponse.json().id as string;
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/api/v1/proposals/${proposalId}/pdf`,
            headers,
          })
        ).statusCode,
      ).toBe(200);
      const summary = await app.inject({
        method: 'POST',
        url: `/api/v1/proposals/${proposalId}/pdf?detail=summary`,
        headers,
      });
      expect(summary.statusCode).toBe(200);
      expect(summary.headers['content-type']).toContain('application/pdf');
      expect(summary.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
      const audits = await db.auditLog.findMany({
        where: { entityId: proposalId, action: 'PROPOSAL_PDF_EXPORTED' },
        select: { metadata: true },
      });
      expect(
      audits.map(
        (entry) =>
          (entry.metadata as { detail?: string } | null)?.detail,
      ),
    ).toEqual(expect.arrayContaining(['full', 'summary']));
    } finally {
      await app.close();
    }
  });
});