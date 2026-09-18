import { randomUUID } from 'node:crypto';
import { dashboardOverviewSchema } from '@larcarvalho/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import '../../src/config/load-env.js';
import { parseEnvironment, type AppConfig } from '../../src/config/env.js';
import { hashSessionToken } from '../../src/core/auth/session-token.js';
import type {
  PrismaClient,
  UserRole,
} from '../../src/generated/prisma/client.js';
import { createPrismaClient } from '../../src/infrastructure/database/prisma-client.js';
import { wipeSalesData } from './clean-vendas.js';
import { DashboardRepository } from '../../src/modules/dashboard/dashboard.repository.js';
import { IdentityService } from '../../src/modules/identity/identity.service.js';
import { fortalezaDayBounds } from '../../src/modules/leads/lead-rules.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describePostgresql = testDatabaseUrl ? describe : describe.skip;
const configForTest = (): AppConfig =>
  parseEnvironment({
    ...process.env,
    DATABASE_URL: testDatabaseUrl,
    FRONTEND_URL: 'http://frontend.test',
    LOG_LEVEL: 'silent',
    NODE_ENV: 'test',
  });

describePostgresql('dashboard with PostgreSQL', () => {
  let db: PrismaClient;
  let app: Awaited<ReturnType<typeof buildApp>>;
  const cookies = new Map<string, string>();
  async function clean() {
    await wipeSalesData(db);
    await db.integrationLog.deleteMany();
    await db.externalEntityMapping.deleteMany();
    await db.integrationRun.deleteMany();
    await db.integration.deleteMany();
    await db.leadInteracao.deleteMany();
    await db.leadInteresse.deleteMany();
    await db.lead.deleteMany();
    await db.grupoHistorico.deleteMany();
    await db.dataQualityIssue.deleteMany();
    await db.importacao.deleteMany();
    await db.fonteDados.deleteMany();
    await db.contemplacao.deleteMany();
    await db.lance.deleteMany();
    await db.assembleia.deleteMany();
    await db.cota.deleteMany();
    await db.grupo.deleteMany();
    await db.produto.deleteMany();
    await db.administradora.deleteMany();
    await db.session.deleteMany();
    await db.auditLog.deleteMany();
    await db.user.deleteMany();
    cookies.clear();
  }
  async function user(role: UserRole, email: string) {
    const record = await db.user.create({
      data: {
        nome: email.split('@')[0]!,
        email,
        role,
        passwordHash: 'not-a-plain-password',
      },
    });
    const token = randomUUID();
    await db.session.create({
      data: {
        userId: record.id,
        tokenHash: hashSessionToken(token),
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    cookies.set(email, `larcarvalho_session=${token}`);
    return record;
  }
  beforeAll(async () => {
    const config = configForTest();
    db = createPrismaClient(config);
    app = await buildApp({
      config,
      identityService: new IdentityService(db, config),
      logger: false,
    });
  });
  beforeEach(clean);
  afterAll(async () => {
    await clean();
    await app.close();
    await db.$disconnect();
  });

  it('calculates factual KPIs, scopes sellers, filters operators and returns no PII', async () => {
    const admin = await user('SUPER_ADMIN', 'dashboard-admin@example.com');
    const sellerA = await user('VENDEDOR', 'dashboard-a@example.com');
    const sellerB = await user('VENDEDOR', 'dashboard-b@example.com');
    const operator = await user('OPERADOR', 'dashboard-operator@example.com');
    const now = new Date();
    const administradora = await db.administradora.create({
      data: { nome: 'Administradora dashboard', ativa: true },
    });
    const produto = await db.produto.create({
      data: {
        administradoraId: administradora.id,
        nome: 'Imóvel',
        categoria: 'IMOVEL',
        ativo: true,
      },
    });
    const grupo = await db.grupo.create({
      data: {
        administradoraId: administradora.id,
        produtoId: produto.id,
        codigo: 'DASH-1',
        status: 'ATIVO',
        valorCreditoMinimo: '150000',
      },
    });
    await db.cota.create({
      data: { grupoId: grupo.id, numero: '1', status: 'ATIVO' },
    });
    const assembleia = await db.assembleia.create({
      data: {
        grupoId: grupo.id,
        numero: '1',
        status: 'REALIZADA',
        dataAssembleia: new Date(now.getTime() - 86_400_000),
      },
    });
    await db.lance.create({
      data: {
        assembleiaId: assembleia.id,
        tipo: 'LIVRE',
        origem: 'MANUAL',
        contemplado: true,
        percentual: '20',
      },
    });
    await db.contemplacao.create({
      data: {
        assembleiaId: assembleia.id,
        tipo: 'LANCE',
        codigoExterno: 'DASH-C1',
        percentualLance: '20',
      },
    });
    await db.grupoHistorico.create({
      data: {
        grupoId: grupo.id,
        dataReferencia: now,
        origem: 'PROCESSAMENTO_INTERNO',
        assembleiasRealizadas: 2,
        assembleiasComDadosLance: 1,
        assembleiasComDadosContemplacao: 1,
      },
    });
    const source = await db.fonteDados.create({
      data: { nome: 'Fonte dashboard', tipo: 'MANUAL', ativa: true },
    });
    const imported = await db.importacao.create({
      data: {
        fonteDadosId: source.id,
        criadoPorId: admin.id,
        status: 'CONCLUIDA',
        tipo: 'GRUPOS',
        nomeArquivo: 'dashboard.csv',
        registrosProcessados: 10,
        iniciadaEm: new Date(now.getTime() - 86_400_000),
      },
    });
    await db.dataQualityIssue.createMany({
      data: [
        {
          importacaoId: imported.id,
          entidade: 'Grupo',
          codigo: 'DASH_CRITICAL',
          severidade: 'CRITICAL',
          status: 'OPEN',
          origem: 'IMPORTACAO',
          mensagem: 'Crítica',
        },
        {
          entidade: 'Grupo',
          codigo: 'DASH_RESOLVED',
          severidade: 'WARNING',
          status: 'RESOLVED',
          origem: 'VALIDACAO_INTERNA',
          mensagem: 'Resolvida',
          resolvido: true,
          resolvedAt: new Date(now.getTime() - 86_400_000),
        },
      ],
    });
    const integration = await db.integration.create({
      data: {
        nome: 'Integração dashboard',
        tipo: 'MOCK',
        status: 'ERRO',
        configuracaoNaoSensivel: {},
      },
    });
    for (const [index, status] of (
      ['SUCESSO', 'SUCESSO_PARCIAL', 'FALHA'] as const
    ).entries())
      await db.integrationRun.create({
        data: {
          integrationId: integration.id,
          trigger: 'MANUAL',
          status,
          iniciadoEm: new Date(now.getTime() - (index + 1) * 3_600_000),
          finalizadoEm: new Date(
            now.getTime() - (index + 1) * 3_600_000 + 1000,
          ),
          registrosRecebidos: 2,
        },
      });
    const overdue = new Date(now.getTime() - 60_000);
    await db.lead.createMany({
      data: [
        {
          nome: 'Pessoa A',
          telefoneNormalizado: '85999999999',
          emailNormalizado: 'pii-a@example.com',
          origem: 'SIMULADOR_PUBLICO',
          status: 'NOVO',
          responsavelId: sellerA.id,
          categoriaInteresse: 'IMOVEL',
          proximoContatoEm: overdue,
        },
        {
          nome: 'Pessoa B',
          emailNormalizado: 'b@example.com',
          origem: 'CADASTRO_MANUAL',
          status: 'NOVO',
          responsavelId: sellerB.id,
        },
        {
          nome: 'Pessoa sem responsável',
          emailNormalizado: 'unassigned@example.com',
          origem: 'INDICACAO',
          status: 'QUALIFICADO',
        },
        {
          nome: 'Pessoa convertida',
          emailNormalizado: 'converted@example.com',
          origem: 'WHATSAPP',
          status: 'CONVERTIDO',
          responsavelId: sellerA.id,
          convertidoEm: new Date(now.getTime() - 86_400_000),
        },
        {
          nome: 'Pessoa perdida',
          emailNormalizado: 'lost@example.com',
          origem: 'OUTRO',
          status: 'PERDIDO',
          responsavelId: sellerA.id,
          motivoPerda: 'SEM_RETORNO',
        },
      ],
    });
    const ownLead = await db.lead.findFirstOrThrow({
      where: { responsavelId: sellerA.id, status: 'NOVO' },
    });
    await db.leadInteracao.create({
      data: {
        leadId: ownLead.id,
        criadoPorId: sellerA.id,
        tipo: 'LIGACAO',
        descricao: 'Contato factual',
        ocorridoEm: now,
      },
    });

    const fullResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard/overview?period=30d',
      headers: { cookie: cookies.get(admin.email)! },
    });
    expect(fullResponse.statusCode).toBe(200);
    const full = dashboardOverviewSchema.parse(fullResponse.json());
    expect(full.consorcios?.totals).toMatchObject({
      administradorasAtivas: 1,
      produtosAtivos: 1,
      gruposAtivos: 1,
      cotasAtivas: 1,
      assembleias: 1,
      lances: 1,
      contemplacoes: 1,
    });
    expect(full.consorcios?.snapshots.averageBidCoverage).toBe(0.5);
    expect(full.quality?.criticalOpen).toBe(1);
    expect(full.integrations?.successRate).toBeCloseTo(1 / 3);
    expect(full.imports?.processedRecords).toBe(10);
    expect(full.crm).toMatchObject({
      activeNow: 3,
      convertedInPeriod: { current: 1 },
      lostNow: 1,
      unassignedActive: 1,
    });
    expect(full.attention.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        'critical-quality',
        'overdue-contacts',
        'unassigned-leads',
        'integration-errors',
        'failed-runs',
      ]),
    );
    expect(fullResponse.body).not.toContain('85999999999');
    expect(fullResponse.body).not.toContain('pii-a@example.com');
    expect(fullResponse.body).not.toContain('secretRef');

    const ownResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard/overview?period=30d',
      headers: { cookie: cookies.get(sellerA.email)! },
    });
    const own = dashboardOverviewSchema.parse(ownResponse.json());
    expect(own.crm).toMatchObject({
      scope: 'OWN',
      activeNow: 1,
      unassignedActive: 0,
    });
    expect(own.crm?.team).toEqual([]);
    expect(own.integrations).toBeNull();
    const idor = await app.inject({
      method: 'GET',
      url: `/api/v1/dashboard/overview?period=30d&responsibleId=${sellerB.id}`,
      headers: { cookie: cookies.get(sellerA.email)! },
    });
    expect(idor.statusCode).toBe(403);
    const operational = dashboardOverviewSchema.parse(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/dashboard/overview?period=30d',
          headers: { cookie: cookies.get(operator.email)! },
        })
      ).json(),
    );
    expect(operational.crm).toBeNull();
    expect(operational.integrations).not.toBeNull();
    expect(operational.quality).not.toBeNull();
  });

  it('returns coherent zeroes with an almost empty database', async () => {
    const actor = await user('SUPER_ADMIN', 'empty-dashboard@example.com');
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard/overview?period=today',
      headers: { cookie: cookies.get(actor.email)! },
    });
    expect(response.statusCode).toBe(200);
    const body = dashboardOverviewSchema.parse(response.json());
    expect(body.crm?.activeNow).toBe(0);
    expect(body.integrations?.successRate).toBeNull();
    expect(body.consorcios?.totals.gruposAtivos).toBe(0);
  });

  it('aggregates a representative 5,000-lead volume without loading rows', async () => {
    const seller = await user('VENDEDOR', 'volume-dashboard@example.com');
    await db.lead.createMany({
      data: Array.from({ length: 5_000 }, (_, index) => ({
        nome: `Volume ${index}`,
        emailNormalizado: `volume-${index}@example.com`,
        origem: 'CADASTRO_MANUAL' as const,
        status: index % 5 === 0 ? ('CONVERTIDO' as const) : ('NOVO' as const),
        responsavelId: seller.id,
        ...(index % 5 === 0 ? { convertidoEm: new Date() } : {}),
      })),
    });
    const start = performance.now();
    const now = new Date();
    const today = fortalezaDayBounds(now);
    const result = await new DashboardRepository(db).crm(
      {
        from: new Date(now.getTime() - 30 * 86_400_000),
        to: new Date(now.getTime() + 1),
        previousFrom: new Date(now.getTime() - 60 * 86_400_000),
        previousTo: new Date(now.getTime() - 30 * 86_400_000),
      },
      { responsavelId: seller.id },
      false,
      today,
      now,
    );
    expect(result.activeNow).toBe(4_000);
    expect(performance.now() - start).toBeLessThan(5_000);
  }, 30_000);
});
