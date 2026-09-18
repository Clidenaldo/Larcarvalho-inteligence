import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../../src/app.js';
import '../../src/config/load-env.js';
import { parseEnvironment, type AppConfig } from '../../src/config/env.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createPrismaClient } from '../../src/infrastructure/database/prisma-client.js';
import { wipeSalesData } from './clean-vendas.js';
import { IdentityService } from '../../src/modules/identity/identity.service.js';

const url = process.env.TEST_DATABASE_URL;
const run = url ? describe : describe.skip;
const password = 'frase senha inicial segura';
const cookie = (response: { headers: Record<string, unknown> }) => {
  const value = response.headers['set-cookie'];
  if (typeof value !== 'string') throw new Error('Cookie ausente');
  return value.split(';', 1)[0] as string;
};
run('consolidated group snapshots with PostgreSQL', () => {
  let prisma: PrismaClient;
  let config: AppConfig;
  let identity: IdentityService;
  async function clean() {
    await wipeSalesData(prisma);
    await prisma.grupoHistorico.deleteMany();
    await prisma.dataQualityIssue.deleteMany();
    await prisma.contemplacao.deleteMany();
    await prisma.lance.deleteMany();
    await prisma.assembleia.deleteMany();
    await prisma.cota.deleteMany();
    await prisma.grupo.deleteMany();
    await prisma.produto.deleteMany();
    await prisma.administradora.deleteMany();
    await prisma.session.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.user.deleteMany();
  }
  beforeAll(() => {
    config = parseEnvironment({
      ...process.env,
      AUTH_LOGIN_RATE_LIMIT_MAX: '100',
      DATABASE_POOL_MAX: '3',
      DATABASE_URL: url,
      FRONTEND_URL: 'http://frontend.test',
      LOG_LEVEL: 'silent',
      NODE_ENV: 'test',
    });
    prisma = createPrismaClient(config);
    identity = new IdentityService(prisma, config);
  });
  beforeEach(clean);
  afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });
  it('creates immutable idempotent snapshots, metrics, coverage, series and audit', async () => {
    await identity.createFirstSuperAdmin({
      email: 'snapshot@example.com',
      nome: 'Snapshot Admin',
      password,
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
        payload: { email: 'snapshot@example.com', password },
      });
      const headers = {
        cookie: cookie(login),
        origin: 'http://frontend.test',
      };
      const admin = await prisma.administradora.create({
        data: { nome: 'Histórica' },
      });
      const product = await prisma.produto.create({
        data: {
          administradoraId: admin.id,
          nome: 'Imóvel',
          categoria: 'IMOVEL',
        },
      });
      const group = await prisma.grupo.create({
        data: {
          administradoraId: admin.id,
          produtoId: product.id,
          codigo: 'H-1',
          status: 'ATIVO',
          prazoMeses: 120,
          quantidadeCotas: 100,
          valorCreditoMinimo: '100000.00',
          valorCreditoMaximo: '200000.00',
        },
      });
      const quota = await prisma.cota.create({
        data: {
          grupoId: group.id,
          numero: '1',
          status: 'ATIVO',
          parcelaAtual: '1234.56',
        },
      });
      const past = await prisma.assembleia.create({
        data: {
          grupoId: group.id,
          numero: '1',
          dataAssembleia: new Date('2026-08-01T12:00:00.000Z'),
          status: 'REALIZADA',
        },
      });
      const pastWithoutData = await prisma.assembleia.create({
        data: {
          grupoId: group.id,
          numero: '1-B',
          dataAssembleia: new Date('2026-08-15T12:00:00.000Z'),
          status: 'REALIZADA',
        },
      });
      await prisma.assembleia.create({
        data: {
          grupoId: group.id,
          numero: '2',
          dataAssembleia: new Date('2099-01-01T12:00:00.000Z'),
          status: 'REALIZADA',
        },
      });
      await prisma.lance.createMany({
        data: ['10.123456', '20.654321', '30.000000', '40.000000'].map(
          (percentual) => ({
            assembleiaId: past.id,
            cotaId: quota.id,
            tipo: 'LIVRE',
            percentual,
            contemplado: true,
            origem: 'MANUAL',
          }),
        ),
      });
      await prisma.contemplacao.createMany({
        data: [
          {
            assembleiaId: past.id,
            cotaId: quota.id,
            tipo: 'SORTEIO',
            codigoExterno: 'S1',
          },
          {
            assembleiaId: past.id,
            cotaId: quota.id,
            tipo: 'LANCE',
            codigoExterno: 'L1',
            percentualLance: '20.654321',
          },
        ],
      });
      await prisma.dataQualityIssue.create({
        data: {
          entidade: 'Grupo',
          registroId: group.id,
          grupoId: group.id,
          codigo: 'TEST_CRITICAL',
          severidade: 'CRITICAL',
          origem: 'AUDITORIA_MANUAL',
          mensagem: 'Pendência técnica de teste',
        },
      });
      const idempotencyKey = '3343309c-541f-4457-8d6b-a42f7e02bd9c';
      const create = () =>
        app.inject({
          method: 'POST',
          url: `/api/v1/grupos/${group.id}/historico/snapshot`,
          headers,
          payload: { idempotencyKey },
        });
      const first = await create();
      expect(first.statusCode).toBe(201);
      expect(first.json()).toMatchObject({
        estado: {
          quantidadeCotasDeclarada: 100,
          quantidadeCotasRegistradas: 1,
          quantidadeCotasAtivas: 1,
        },
        metricas: {
          assembleiasRealizadas: 2,
          lancesRegistrados: 4,
          lancesContemplados: 4,
          contemplacoesRegistradas: 2,
          contemplacoesSorteio: 1,
          contemplacoesLance: 1,
          percentualLanceContempladoMinimo: '10.123456',
          percentualLanceContempladoMaximo: '40',
          percentualLanceContempladoMedio: '25.194444',
          percentualLanceContempladoMediano: '25.327161',
        },
        cobertura: {
          assembleiasAnalisadas: 2,
          assembleiasComDadosLance: 1,
          assembleiasComDadosContemplacao: 1,
        },
        qualidade: { issuesAbertas: 1, issuesCriticas: 1 },
      });
      expect((await create()).statusCode).toBe(201);
      await expect(prisma.grupoHistorico.count()).resolves.toBe(1);
      await expect(
        prisma.auditLog.count({ where: { action: 'GRUPO_SNAPSHOT_CREATED' } }),
      ).resolves.toBe(1);
      expect(first.json().capturadoEm).toMatch(/Z$/);
      await prisma.grupo.update({
        where: { id: group.id },
        data: { valorCreditoMaximo: '210000.00', prazoMeses: 121 },
      });
      await prisma.lance.create({
        data: {
          assembleiaId: pastWithoutData.id,
          cotaId: quota.id,
          tipo: 'LIVRE',
          percentual: '50.000000',
          contemplado: false,
          origem: 'MANUAL',
        },
      });
      await prisma.contemplacao.create({
        data: {
          assembleiaId: pastWithoutData.id,
          cotaId: quota.id,
          tipo: 'OUTRO',
          codigoExterno: 'O1',
        },
      });
      await new Promise((resolve) => setTimeout(resolve, 5));
      const second = await app.inject({
        method: 'POST',
        url: `/api/v1/grupos/${group.id}/historico/snapshot`,
        headers,
        payload: { idempotencyKey: randomUUID() },
      });
      expect(second.statusCode).toBe(201);
      expect(second.json().cobertura).toMatchObject({
        assembleiasAnalisadas: 2,
        assembleiasComDadosLance: 2,
        assembleiasComDadosContemplacao: 2,
      });
      const list = await app.inject({
        method: 'GET',
        url: `/api/v1/grupos/${group.id}/historico?dataInicio=2026-01-01&dataFim=2099-12-31`,
        headers: { cookie: headers.cookie },
      });
      expect(list.statusCode).toBe(200);
      expect(list.json().total).toBe(2);
      expect(list.json().items.map((item: { id: string }) => item.id)).toEqual([
        second.json().id,
        first.json().id,
      ]);
      const outsideInterval = await app.inject({
        method: 'GET',
        url: `/api/v1/grupos/${group.id}/historico?dataInicio=2099-01-01`,
        headers: { cookie: headers.cookie },
      });
      expect(outsideInterval.json().total).toBe(0);
      const series = await app.inject({
        method: 'GET',
        url: `/api/v1/grupos/${group.id}/historico/series`,
        headers: { cookie: headers.cookie },
      });
      expect(series.json().pontos).toHaveLength(2);
      expect(
        series
          .json()
          .pontos.map((item: { snapshotId: string }) => item.snapshotId),
      ).toEqual([first.json().id, second.json().id]);
      const detail = await app.inject({
        method: 'GET',
        url: `/api/v1/grupos/${group.id}/historico/${second.json().id as string}`,
        headers: { cookie: headers.cookie },
      });
      expect(detail.json()).toMatchObject({
        anterior: { id: first.json().id },
        estado: { prazoMeses: 121, valorCreditoMaximo: '210000' },
      });
      expect(
        await app.inject({
          method: 'PATCH',
          url: `/api/v1/grupos/${group.id}/historico/${first.json().id as string}`,
          headers,
          payload: { status: 'ENCERRADO' },
        }),
      ).toMatchObject({ statusCode: 404 });
      expect(
        await app.inject({
          method: 'DELETE',
          url: `/api/v1/grupos/${group.id}/historico/${first.json().id as string}`,
          headers,
        }),
      ).toMatchObject({ statusCode: 404 });
      const missing = await app.inject({
        method: 'POST',
        url: `/api/v1/grupos/${randomUUID()}/historico/snapshot`,
        headers,
        payload: { idempotencyKey: randomUUID() },
      });
      expect(missing.statusCode).toBe(404);
      await expect(
        prisma.auditLog.count({ where: { action: 'GRUPO_SNAPSHOT_FAILED' } }),
      ).resolves.toBe(1);
    } finally {
      await app.close();
    }
  });
  it('returns null statistics when no contemplated percentage is known', async () => {
    const user = await identity.createFirstSuperAdmin({
      email: 'empty@example.com',
      nome: 'Empty Admin',
      password,
    });
    const group = await prisma.grupo.create({
      data: {
        administradora: { create: { nome: 'Sem dados' } },
        codigo: 'EMPTY',
        status: 'ATIVO',
      },
    });
    const service = new (
      await import('../../src/modules/grupo-historico/grupo-historico.service.js')
    ).GrupoHistoricoService(prisma);
    const snapshot = await service.createManual(
      {
        sessionId: 'test',
        user: {
          id: user.id,
          nome: user.nome,
          email: user.email,
          role: user.role,
        },
      },
      group.id,
      '6daf0314-6c3a-43ee-a5af-04a8aace457d',
      {},
    );
    expect(snapshot.metricas).toMatchObject({
      lancesRegistrados: 0,
      percentualLanceContempladoMinimo: null,
      percentualLanceContempladoMaximo: null,
      percentualLanceContempladoMedio: null,
      percentualLanceContempladoMediano: null,
    });
    expect(snapshot.cobertura).toMatchObject({
      assembleiasAnalisadas: 0,
      assembleiasComDadosLance: 0,
    });
  });
});
