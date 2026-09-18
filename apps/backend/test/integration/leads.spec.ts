import { randomUUID } from 'node:crypto';
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
import { IdentityService } from '../../src/modules/identity/identity.service.js';
import { LeadsService } from '../../src/modules/leads/leads.service.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describePostgresql = testDatabaseUrl ? describe : describe.skip;
const configForTest = (overrides: NodeJS.ProcessEnv = {}): AppConfig =>
  parseEnvironment({
    ...process.env,
    DATABASE_URL: testDatabaseUrl,
    FRONTEND_URL: 'http://frontend.test',
    LOG_LEVEL: 'silent',
    NODE_ENV: 'test',
    PUBLIC_LEAD_RATE_LIMIT_MAX: '100',
    ...overrides,
  });

describePostgresql('CRM leads with PostgreSQL', () => {
  let db: PrismaClient;
  let config: AppConfig;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let groupId: string;
  let adminName: string;
  const groupIds: string[] = [];
  const productIds: string[] = [];
  const adminIds: string[] = [];
  const cookies = new Map<string, string>();
  async function user(role: UserRole, email: string) {
    const created = await db.user.create({
      data: {
        nome: email.split('@')[0]!,
        email,
        role,
        passwordHash: 'not-used-in-session-tests',
      },
    });
    const token = randomUUID();
    await db.session.create({
      data: {
        userId: created.id,
        tokenHash: hashSessionToken(token),
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    cookies.set(email, `larcarvalho_session=${token}`);
    return created;
  }
  beforeAll(async () => {
    config = configForTest();
    db = createPrismaClient(config);
    const identity = new IdentityService(db, config);
    app = await buildApp({
      config,
      identityService: identity,
      leadsService: new LeadsService(db),
      logger: false,
    });
  });
  beforeEach(async () => {
    cookies.clear();
    await wipeSalesData(db);
    await db.leadInteracao.deleteMany();
    await db.leadInteresse.deleteMany();
    await db.lead.deleteMany();
    await db.session.deleteMany();
    await db.auditLog.deleteMany({ where: { entity: 'Lead' } });
    await db.user.deleteMany();
    adminName = `Administradora CRM ${randomUUID()}`;
    const admin = await db.administradora.create({
      data: { nome: adminName, ativa: true },
    });
    adminIds.push(admin.id);
    const product = await db.produto.create({
      data: {
        administradoraId: admin.id,
        nome: 'Imóvel',
        categoria: 'IMOVEL',
        ativo: true,
      },
    });
    productIds.push(product.id);
    const group = await db.grupo.create({
      data: {
        administradoraId: admin.id,
        produtoId: product.id,
        codigo: 'CRM-001',
        status: 'ATIVO',
        valorCreditoMinimo: '100000',
        valorCreditoMaximo: '200000',
      },
    });
    groupId = group.id;
    groupIds.push(group.id);
  });
  afterAll(async () => {
    await app?.close();
    await wipeSalesData(db);
    await db?.leadInteracao.deleteMany();
    await db?.leadInteresse.deleteMany();
    await db?.lead.deleteMany();
    await db?.session.deleteMany();
    await db?.auditLog.deleteMany({ where: { entity: 'Lead' } });
    await db?.grupo.deleteMany({ where: { id: { in: groupIds } } });
    await db?.produto.deleteMany({ where: { id: { in: productIds } } });
    await db?.administradora.deleteMany({ where: { id: { in: adminIds } } });
    await db?.user.deleteMany();
    await db?.$disconnect();
  });

  it('captures public consent and simulator context without enumeration', async () => {
    const payload = {
      nome: '  Maria   Silva ',
      telefone: '(85) 99999-0000',
      email: 'maria@example.com',
      consentimento: true,
      versaoTextoConsentimento: '2026-09-02.v1',
      categoriaInteresse: 'IMOVEL',
      valorCreditoDesejado: '150000',
      interesse: {
        administradora: adminName,
        grupo: 'CRM-001',
        indiceAderenciaCapturado: 82.5,
        coberturaAvaliacaoCapturada: 75,
      },
    };
    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/public/leads',
      payload,
    });
    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/v1/public/leads',
      payload: { ...payload, email: undefined },
    });
    const duplicateEmail = await app.inject({
      method: 'POST',
      url: '/api/v1/public/leads',
      payload: { ...payload, telefone: undefined },
    });
    expect(first.statusCode).toBe(202);
    expect(duplicate.statusCode).toBe(202);
    expect(first.body).toBe(duplicate.body);
    expect(first.body).toBe(duplicateEmail.body);
    expect(first.body).not.toContain('id');
    const leads = await db.lead.findMany({
      include: { interesses: true, interacoes: true },
    });
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({
      nome: 'Maria Silva',
      telefoneNormalizado: '5585999990000',
      origem: 'SIMULADOR_PUBLICO',
      categoriaInteresse: 'IMOVEL',
    });
    expect(leads[0]!.consentimentoContatoEm).toBeInstanceOf(Date);
    expect(leads[0]!.interesses[0]).toMatchObject({
      grupoId: groupId,
      principal: true,
    });
    expect(leads[0]!.interacoes).toHaveLength(3);
    const publicAudit = await db.auditLog.findMany({
      where: { entityId: leads[0]!.id },
    });
    expect(JSON.stringify(publicAudit)).not.toContain('maria@example.com');
    expect(JSON.stringify(publicAudit)).not.toContain('5585999990000');
    const sameNameOtherContact = await app.inject({
      method: 'POST',
      url: '/api/v1/public/leads',
      payload: { ...payload, telefone: undefined, email: 'outra@example.com' },
    });
    expect(sameNameOtherContact.statusCode).toBe(202);
    expect(await db.lead.count()).toBe(2);
    const honey = await app.inject({
      method: 'POST',
      url: '/api/v1/public/leads',
      payload: {
        ...payload,
        telefone: '(85) 98888-0000',
        website: 'bot.example',
      },
    });
    expect(honey.statusCode).toBe(202);
    expect(await db.lead.count()).toBe(2);
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/v1/public/leads',
      payload: {
        nome: 'Sem Consentimento',
        email: 'x@example.com',
        consentimento: false,
        versaoTextoConsentimento: '2026-09-02.v1',
      },
    });
    expect(invalid.statusCode).toBe(400);
  });

  it('enforces own/team scope, IDOR and assignment roles', async () => {
    const manager = await user('GESTOR', 'manager@example.com');
    const sellerA = await user('VENDEDOR', 'a@example.com');
    const sellerB = await user('VENDEDOR', 'b@example.com');
    await user('OPERADOR', 'operator@example.com');
    const team = await db.team.create({ data: { name: `Equipe Leads ${randomUUID()}` } });
    await db.user.updateMany({
      where: { id: { in: [manager.id, sellerA.id, sellerB.id] } },
      data: { teamId: team.id },
    });
    const lead = await db.lead.create({
      data: {
        nome: 'Carteira B',
        emailNormalizado: 'lead@example.com',
        origem: 'CADASTRO_MANUAL',
        responsavelId: sellerB.id,
      },
    });
    for (const [method, url, payload] of [
      ['GET', `/api/v1/leads/${lead.id}`, undefined],
      ['PATCH', `/api/v1/leads/${lead.id}`, { nome: 'Ataque IDOR' }],
      [
        'POST',
        `/api/v1/leads/${lead.id}/interacoes`,
        { tipo: 'NOTA', descricao: 'Ataque' },
      ],
      ['POST', `/api/v1/leads/${lead.id}/status`, { status: 'EM_ATENDIMENTO' }],
    ] as const) {
      const response = await app.inject({
        method,
        url,
        headers: { cookie: cookies.get('a@example.com')! },
        ...(payload ? { payload } : {}),
      });
      expect(response.statusCode).toBe(404);
    }
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/leads',
          headers: { cookie: cookies.get('operator@example.com')! },
        })
      ).statusCode,
    ).toBe(403);
    const assigned = await app.inject({
      method: 'POST',
      url: `/api/v1/leads/${lead.id}/assign`,
      headers: { cookie: cookies.get('manager@example.com')! },
      payload: { responsavelId: sellerA.id },
    });
    expect(assigned.statusCode).toBe(200);
    expect(assigned.json().responsavel.id).toBe(sellerA.id);
    const invalidRole = await app.inject({
      method: 'POST',
      url: `/api/v1/leads/${lead.id}/assign`,
      headers: { cookie: cookies.get('manager@example.com')! },
      payload: { responsavelId: manager.id },
    });
    expect(invalidRole.statusCode).toBe(200);
    const operator = await db.user.findUniqueOrThrow({
      where: { email: 'operator@example.com' },
    });
    const rejected = await app.inject({
      method: 'POST',
      url: `/api/v1/leads/${lead.id}/assign`,
      headers: { cookie: cookies.get('manager@example.com')! },
      payload: { responsavelId: operator.id },
    });
    expect(rejected.statusCode).toBe(409);
  });

  it('runs status flow, immutable timeline, loss, reopen and factual filters', async () => {
    const manager = await user('GESTOR', 'manager@example.com');
    const lead = await db.lead.create({
      data: {
        nome: 'Funil',
        emailNormalizado: 'funil@example.com',
        origem: 'CADASTRO_MANUAL',
        responsavelId: manager.id,
        proximoContatoEm: new Date(Date.now() - 60_000),
      },
    });
    const cookie = cookies.get('manager@example.com')!;
    for (const tipo of [
      'NOTA',
      'LIGACAO',
      'WHATSAPP',
      'EMAIL',
      'REUNIAO',
    ] as const) {
      const interaction = await app.inject({
        method: 'POST',
        url: `/api/v1/leads/${lead.id}/interacoes`,
        headers: { cookie },
        payload: { tipo, descricao: `Registro manual ${tipo}` },
      });
      expect(interaction.statusCode).toBe(201);
    }
    for (const status of [
      'EM_ATENDIMENTO',
      'CONTATO_REALIZADO',
      'QUALIFICADO',
      'PROPOSTA',
      'NEGOCIACAO',
      'CONVERTIDO',
    ] as const) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/leads/${lead.id}/status`,
        headers: { cookie },
        payload: {
          status,
          ...(status === 'CONVERTIDO' ? { grupoId: groupId } : {}),
        },
      });
      expect(response.statusCode).toBe(200);
    }
    const overdue = await app.inject({
      method: 'GET',
      url: '/api/v1/leads?proximoContato=ATRASADO',
      headers: { cookie },
    });
    expect(overdue.statusCode).toBe(200);
    expect(overdue.json().total).toBe(0);
    const fortalezaDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Fortaleza',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    await db.lead.create({
      data: {
        nome: 'Contato hoje',
        emailNormalizado: 'hoje@example.com',
        origem: 'CADASTRO_MANUAL',
        responsavelId: manager.id,
        proximoContatoEm: new Date(`${fortalezaDate}T12:00:00-03:00`),
      },
    });
    const today = await app.inject({
      method: 'GET',
      url: '/api/v1/leads?proximoContato=HOJE',
      headers: { cookie },
    });
    expect(today.json().total).toBe(1);
    const lost = await db.lead.create({
      data: {
        nome: 'Perdido',
        telefoneNormalizado: '5585988880000',
        origem: 'CADASTRO_MANUAL',
        responsavelId: manager.id,
      },
    });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/leads/${lost.id}/status`,
          headers: { cookie },
          payload: { status: 'PERDIDO' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/leads/${lost.id}/status`,
          headers: { cookie },
          payload: { status: 'PERDIDO', motivoPerda: 'SEM_RETORNO' },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/leads/${lost.id}/status`,
          headers: { cookie },
          payload: { status: 'EM_ATENDIMENTO', observacao: 'Retomou contato' },
        })
      ).statusCode,
    ).toBe(200);
    const notes = await db.leadInteracao.findMany({
      where: { leadId: lost.id },
      orderBy: { ocorridoEm: 'asc' },
    });
    expect(notes.map((item) => item.tipo)).toEqual(['STATUS', 'STATUS']);
    const actions = await db.auditLog.findMany({
      where: { entityId: lost.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(actions.map((item) => item.action)).toEqual([
      'LEAD_LOST',
      'LEAD_REOPENED',
    ]);
  });

  it('rate limits public capture more strictly', async () => {
    const limitedConfig = configForTest({ PUBLIC_LEAD_RATE_LIMIT_MAX: '2' });
    const limited = await buildApp({
      config: limitedConfig,
      identityService: null,
      leadsService: new LeadsService(db),
      simuladorPublicoService: null,
      logger: false,
    });
    try {
      const payload = {
        nome: 'Rate Limit',
        email: 'rate@example.com',
        consentimento: true,
        versaoTextoConsentimento: '2026-09-02.v1',
      };
      expect(
        (
          await limited.inject({
            method: 'POST',
            url: '/api/v1/public/leads',
            payload,
          })
        ).statusCode,
      ).toBe(202);
      expect(
        (
          await limited.inject({
            method: 'POST',
            url: '/api/v1/public/leads',
            payload,
          })
        ).statusCode,
      ).toBe(202);
      expect(
        (
          await limited.inject({
            method: 'POST',
            url: '/api/v1/public/leads',
            payload,
          })
        ).statusCode,
      ).toBe(429);
    } finally {
      await limited.close();
    }
  });

  it('paginates and filters a moderate PostgreSQL volume', async () => {
    const manager = await user('GESTOR', 'volume@example.com');
    await db.lead.createMany({
      data: Array.from({ length: 500 }, (_, index) => ({
        nome: `Lead volume ${String(index).padStart(4, '0')}`,
        emailNormalizado: `volume-${index}@example.com`,
        origem: 'CADASTRO_MANUAL' as const,
        status: index % 2 ? ('NOVO' as const) : ('QUALIFICADO' as const),
        responsavelId: manager.id,
      })),
    });
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/leads?status=QUALIFICADO&page=2&pageSize=25&sort=nome',
      headers: { cookie: cookies.get('volume@example.com')! },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      page: 2,
      pageSize: 25,
      total: 250,
      totalPages: 10,
    });
    expect(response.json().items).toHaveLength(25);
  });
});
