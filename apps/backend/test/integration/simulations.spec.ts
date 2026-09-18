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

run('phase 20 simulations and proposals with PostgreSQL', () => {
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

  it('calculates, snapshots, creates a proposal, changes status, exports PDF and audits', async () => {
    const passwordHash = await hashPassword(password);
    const [seller, otherSeller] = await Promise.all([
      db.user.create({
        data: {
          nome: 'Vendedora Ana',
          email: 'ana.phase20@example.com',
          passwordHash,
          role: 'VENDEDOR',
        },
      }),
      db.user.create({
        data: {
          nome: 'Vendedor Bruno',
          email: 'bruno.phase20@example.com',
          passwordHash,
          role: 'VENDEDOR',
        },
      }),
    ]);
    const administrator = await db.administradora.create({
      data: { nome: 'Administradora Fase 20' },
    });
    const product = await db.produto.create({
      data: {
        administradoraId: administrator.id,
        nome: 'Imóvel Fase 20',
        categoria: 'IMOVEL',
      },
    });
    const lead = await db.lead.create({
      data: {
        nome: 'Cliente da Ana',
        emailNormalizado: 'cliente@example.com',
        origem: 'CADASTRO_MANUAL',
        responsavelId: seller.id,
      },
    });
    const group = await db.grupo.create({ data: { administradoraId: administrator.id, produtoId: product.id, codigo: 'GRUPO-COMPARACAO', status: 'ATIVO' } });
    const quotas = await Promise.all(['001', '002'].map((numero) => db.cota.create({ data: { grupoId: group.id, numero, status: 'ATIVO' } })));
    await db.commercialConfiguration.create({
      data: {
        organizationName: 'Larcarvalho Consórcios',
        requiredDisclaimer:
          'Esta proposta usa regras configuradas e deve ser confirmada antes da contratação.',
        proposalValidityDays: 10,
      },
    });
    const rule = await db.productCommercialRule.create({
      data: {
        administradoraId: administrator.id,
        produtoId: product.id,
        category: 'IMOVEL',
        name: 'Regra completa',
        version: 1,
        validFrom: new Date('2026-01-01T00:00:00Z'),
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
    const app = await buildApp({
      config,
      identityService: identity,
      logger: false,
    });
    try {
      const login = async (email: string) =>
        cookie(
          await app.inject({
            method: 'POST',
            url: '/api/v1/auth/login',
            payload: { email, password },
          }),
        );
      const sellerCookie = await login(seller.email);
      const otherCookie = await login(otherSeller.email);
      const headers = { cookie: sellerCookie, origin: 'http://frontend.test' };
      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/simulations',
        headers,
        payload: {
          leadId: lead.id,
          category: 'IMOVEL',
          creditMode: 'NET_CREDIT',
          requestedCredit: '180000',
          desiredTermMonths: 100,
          ownBidAmount: '10000',
          embeddedBidPercent: '10',
          paidInstallments: 5,
          structuredOperation: true,
          administratorIds: [administrator.id],
          productIds: [product.id],
          groupIds: [],
          quotaIds: quotas.map((quota) => quota.id),
          sort: 'LOWEST_INSTALLMENT',
        },
      });
      expect(created.statusCode).toBe(201);
      const simulationId = created.json().id as string;
      const calculated = await app.inject({
        method: 'POST',
        url: `/api/v1/simulations/${simulationId}/calculate`,
        headers,
        payload: {
          scenarioName: 'Cenário líquido',
          sort: 'LOWEST_INSTALLMENT',
          pin: true,
        },
      });
      expect(calculated.statusCode).toBe(200);
      expect(calculated.json().results).toHaveLength(2);
      expect(new Set(calculated.json().results.map((item: { id: string }) => item.id)).size).toBe(2);
      expect(calculated.json().results.map((item: { quotaNumber: string }) => item.quotaNumber).sort()).toEqual(['001', '002']);
      expect(calculated.json().results[0]).toMatchObject({
        groupCode: 'GRUPO-COMPARACAO',
        comparisonContext: { paidInstallments: 5, administrationFeePercent: '15', maxEmbeddedBidPercent: '30' },
        badges: expect.arrayContaining([
          'LOWEST_INSTALLMENT',
          'HIGHEST_NET_CREDIT',
          'SHORTEST_TERM',
          'BEST_ADHERENCE',
        ]),
        calculationStatus: 'COMPLETE',
        contractedCredit: '200000',
        netCredit: '180000',
        ruleVersion: 'LC-1',
        remainingTermMonths: 95,
      });
      const resultId = calculated.json().results[0].id as string;
      const snapshots = await db.simulationCalculationSnapshot.findMany({
        where: { scenario: { simulationId } },
      });
      expect(snapshots).toHaveLength(1);
      expect(JSON.stringify(snapshots[0]?.ruleSnapshots)).toContain(rule.id);
      const proposalResponse = await app.inject({
        method: 'POST',
        url: `/api/v1/simulations/${simulationId}/proposals`,
        headers,
        payload: {
          leadId: lead.id,
          resultIds: [resultId],
          title: 'Proposta residencial',
          objectiveSummary:
            'Aquisição de imóvel com crédito líquido planejado.',
        },
      });
      expect(proposalResponse.statusCode).toBe(201);
      const proposalId = proposalResponse.json().id as string;
      expect(proposalResponse.json()).toMatchObject({
        status: 'DRAFT',
        clientName: 'Cliente da Ana',
      });
      expect(
        (
          await app.inject({
            method: 'GET',
            url: `/api/v1/proposals/${proposalId}`,
            headers: { cookie: otherCookie },
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/api/v1/proposals',
            headers: { cookie: otherCookie },
          })
        ).json().items,
      ).toEqual([]);
      const pdf = await app.inject({
        method: 'POST',
        url: `/api/v1/proposals/${proposalId}/pdf`,
        headers,
      });
      expect(pdf.statusCode).toBe(200);
      expect(pdf.headers['content-type']).toContain('application/pdf');
      expect(pdf.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
      const scenarioId = calculated.json().id as string;
      const csv = await app.inject({
        method: 'GET',
        url: `/api/v1/simulations/${simulationId}/scenarios/${scenarioId}/csv`,
        headers: { cookie: sellerCookie },
      });
      expect(csv.statusCode).toBe(200);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.payload).toContain('Administradora Fase 20');
      expect(csv.payload).toContain('Crédito líquido');
      expect(csv.payload).toContain('LC-1');
      expect(
        (
          await app.inject({
            method: 'GET',
            url: `/api/v1/simulations/${simulationId}/scenarios/${scenarioId}/csv`,
            headers: { cookie: otherCookie },
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/api/v1/simulations/${simulationId}/print`,
            headers,
          })
        ).statusCode,
      ).toBe(204);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/api/v1/proposals/${proposalId}/print`,
            headers,
          })
        ).statusCode,
      ).toBe(204);
      const sent = await app.inject({
        method: 'PATCH',
        url: `/api/v1/proposals/${proposalId}/status`,
        headers,
        payload: { status: 'SENT', reason: 'Enviada ao cliente' },
      });
      expect(sent.statusCode).toBe(200);
      expect(
        sent
          .json()
          .statusHistory.map((item: { toStatus: string }) => item.toStatus),
      ).toEqual(['DRAFT', 'GENERATED', 'SENT']);
      const filtered = await app.inject({
        method: 'GET',
        url: '/api/v1/proposals?status=SENT&search=Cliente',
        headers: { cookie: sellerCookie },
      });
      expect(filtered.json().items).toHaveLength(1);
      const actions = await db.auditLog.findMany({
        where: { entityId: { in: [simulationId, proposalId] } },
        select: { action: true },
      });
      expect(actions.map((entry) => entry.action)).toEqual(
        expect.arrayContaining([
          'SIMULATION_CREATED',
          'SIMULATION_CALCULATED',
          'SIMULATION_PRINTED',
          'SIMULATION_CSV_EXPORTED',
          'PROPOSAL_CREATED',
          'PROPOSAL_PDF_EXPORTED',
          'PROPOSAL_PRINTED',
          'PROPOSAL_STATUS_CHANGED',
        ]),
      );
    } finally {
      await app.close();
    }
  });

  it('allows pinning up to five scenarios and rejects the sixth', async () => {
    const passwordHash = await hashPassword(password);
    const seller = await db.user.create({
      data: {
        nome: 'Vendedora Cenários',
        email: 'cenarios.phase20@example.com',
        passwordHash,
        role: 'VENDEDOR',
      },
    });
    const administrator = await db.administradora.create({
      data: { nome: 'Administradora Cenários' },
    });
    await db.commercialConfiguration.create({
      data: {
        organizationName: 'Larcarvalho Consórcios',
        requiredDisclaimer:
          'Esta proposta usa regras configuradas e deve ser confirmada antes da contratação.',
        proposalValidityDays: 10,
      },
    });
    await db.productCommercialRule.create({
      data: {
        administradoraId: administrator.id,
        category: 'IMOVEL',
        name: 'Regra de cenários',
        version: 1,
        validFrom: new Date('2026-01-01T00:00:00Z'),
        administrationFeePercent: '15',
        reserveFundPercent: '2',
        insurancePercent: '0',
        adhesionFeePercent: '0',
        maxEmbeddedBidPercent: '30',
        minimumTermMonths: 60,
        maximumTermMonths: 240,
        inProgressAllowed: true,
        structuredOperationEligible: true,
      },
    });
    const app = await buildApp({
      config,
      identityService: identity,
      logger: false,
    });
    try {
      const login = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: seller.email, password },
      });
      const headers = { cookie: cookie(login), origin: 'http://frontend.test' };
      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/simulations',
        headers,
        payload: {
          category: 'IMOVEL',
          creditMode: 'CONTRACTED_CREDIT',
          requestedCredit: '150000',
          desiredTermMonths: 120,
        },
      });
      expect(created.statusCode).toBe(201);
      const simulationId = created.json().id as string;
      for (let index = 1; index <= 5; index += 1) {
        const pinned = await app.inject({
          method: 'POST',
          url: `/api/v1/simulations/${simulationId}/calculate`,
          headers,
          payload: { scenarioName: `Cenário ${index}`, pin: true },
        });
        expect(pinned.statusCode).toBe(200);
      }
      const sixth = await app.inject({
        method: 'POST',
        url: `/api/v1/simulations/${simulationId}/calculate`,
        headers,
        payload: { scenarioName: 'Cenário 6', pin: true },
      });
      expect(sixth.statusCode).toBe(409);
      expect(sixth.json().error.message).toContain('cinco');
      const unpinned = await app.inject({
        method: 'POST',
        url: `/api/v1/simulations/${simulationId}/calculate`,
        headers,
        payload: { scenarioName: 'Cenário solto' },
      });
      expect(unpinned.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('enforces RBAC for financial rules', async () => {
    const passwordHash = await hashPassword(password);
    const seller = await db.user.create({
      data: {
        nome: 'Vendedora Restrita',
        email: 'restrita.phase20@example.com',
        passwordHash,
        role: 'VENDEDOR',
      },
    });
    const app = await buildApp({
      config,
      identityService: identity,
      logger: false,
    });
    try {
      const login = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: seller.email, password },
      });
      const headers = { cookie: cookie(login), origin: 'http://frontend.test' };
      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/api/v1/product-commercial-rules',
            headers,
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/product-commercial-rules',
            headers,
            payload: {},
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            method: 'PATCH',
            url: '/api/v1/commercial-configurations',
            headers,
            payload: { proposalValidityDays: 30 },
          })
        ).statusCode,
      ).toBe(403);
    } finally {
      await app.close();
    }
  });
});
