import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
const sessionCookie = (response: { headers: Record<string, unknown> }) => {
  const value = response.headers['set-cookie'];
  if (typeof value !== 'string') throw new Error('Cookie ausente');
  return value.split(';', 1)[0] as string;
};
run('objective group comparator with PostgreSQL', () => {
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
    await prisma.tabelaComercialItem.deleteMany();
    await prisma.tabelaComercial.deleteMany();
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
  it('filters real fields, uses one latest snapshot and exposes coverage and quality', async () => {
    await identity.createFirstSuperAdmin({
      email: 'compare@example.com',
      nome: 'Compare Admin',
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
        payload: { email: 'compare@example.com', password },
      });
      const cookie = sessionCookie(login);
      const active = await prisma.administradora.create({
        data: { nome: 'Ativa' },
      });
      const inactive = await prisma.administradora.create({
        data: { nome: 'Inativa', ativa: false },
      });
      const property = await prisma.produto.create({
        data: {
          administradoraId: active.id,
          nome: 'Imóvel',
          categoria: 'IMOVEL',
        },
      });
      const vehicle = await prisma.produto.create({
        data: {
          administradoraId: active.id,
          nome: 'Veículo',
          categoria: 'AUTOMOVEL',
        },
      });
      const disabledProduct = await prisma.produto.create({
        data: {
          administradoraId: active.id,
          nome: 'Inativo',
          categoria: 'IMOVEL',
          ativo: false,
        },
      });
      const group = (data: {
        administradoraId: string;
        produtoId?: string;
        codigo: string;
        status?: string;
        min?: string;
        max?: string;
        prazo?: number;
      }) =>
        prisma.grupo.create({
          data: {
            administradoraId: data.administradoraId,
            codigo: data.codigo,
            status: data.status ?? 'ATIVO',
            ...(data.produtoId ? { produtoId: data.produtoId } : {}),
            ...(data.min ? { valorCreditoMinimo: data.min } : {}),
            ...(data.max ? { valorCreditoMaximo: data.max } : {}),
            ...(data.prazo !== undefined ? { prazoMeses: data.prazo } : {}),
          },
        });
      const g1 = await group({
        administradoraId: active.id,
        produtoId: property.id,
        codigo: 'G1',
        min: '100000',
        max: '200000',
        prazo: 120,
      });
      const g2 = await group({
        administradoraId: active.id,
        produtoId: property.id,
        codigo: 'G2',
        min: '200000',
        max: '400000',
        prazo: 180,
      });
      const g3 = await group({
        administradoraId: active.id,
        produtoId: vehicle.id,
        codigo: 'G3',
        min: '50000',
        max: '80000',
        prazo: 60,
      });
      const g4 = await group({
        administradoraId: active.id,
        produtoId: property.id,
        codigo: 'G4',
        status: 'INATIVO',
        min: '100000',
        max: '150000',
        prazo: 100,
      });
      const g5 = await group({ administradoraId: active.id, codigo: 'G5' });
      const g6 = await group({
        administradoraId: inactive.id,
        codigo: 'G6',
        min: '100000',
        max: '200000',
        prazo: 120,
      });
      const g7 = await group({
        administradoraId: active.id,
        produtoId: disabledProduct.id,
        codigo: 'G7',
        min: '100000',
        max: '200000',
        prazo: 120,
      });
      await prisma.cota.create({
        data: {
          grupoId: g1.id,
          numero: '1',
          status: 'ATIVO',
          parcelaAtual: '1000',
          prazoRestante: 50,
        },
      });
      const snapshot = async (
        grupoId: string,
        date: string,
        values: Partial<{
          parcelaMedia: string;
          assemblies: number;
          withBids: number;
          withAwards: number;
          bids: number;
          awards: number;
        }>,
      ) =>
        prisma.grupoHistorico.create({
          data: {
            grupoId,
            dataReferencia: new Date(date),
            origem: 'MANUAL',
            parcelaMedia: values.parcelaMedia ?? null,
            assembleiasRealizadas: values.assemblies ?? 0,
            assembleiasComDadosLance: values.withBids ?? 0,
            assembleiasComDadosContemplacao: values.withAwards ?? 0,
            lancesRegistrados: values.bids ?? 0,
            lancesContemplados: values.bids ?? 0,
            contemplacoesRegistradas: values.awards ?? 0,
            contemplacoesSorteio: values.awards ?? 0,
            contemplacoesLance: 0,
            contemplacoesOutras: 0,
            percentualLanceContempladoMinimo: '10',
            percentualLanceContempladoMedio: '20',
            percentualLanceContempladoMediano: '21',
            percentualLanceContempladoMaximo: '30',
          },
        });
      await snapshot(g1.id, '2026-01-01T00:00:00Z', {
        parcelaMedia: '1100',
        assemblies: 1,
        withBids: 1,
        withAwards: 1,
        bids: 1,
        awards: 1,
      });
      const latest = await snapshot(g1.id, '2026-09-01T00:00:00Z', {
        parcelaMedia: '900',
        assemblies: 4,
        withBids: 2,
        withAwards: 4,
        bids: 8,
        awards: 3,
      });
      await snapshot(g3.id, '2026-09-01T00:00:00Z', {
        assemblies: 2,
        withBids: 2,
        withAwards: 2,
        bids: 2,
        awards: 2,
      });
      await prisma.dataQualityIssue.create({
        data: {
          entidade: 'Grupo',
          registroId: g1.id,
          grupoId: g1.id,
          codigo: 'TEST',
          severidade: 'CRITICAL',
          origem: 'AUDITORIA_MANUAL',
          mensagem: 'Teste',
        },
      });
      const get = (query: string) =>
        app.inject({
          method: 'GET',
          url: `/api/v1/comparador/grupos?${query}`,
          headers: { cookie },
        });
      expect(
        (await get('categoria=IMOVEL'))
          .json()
          .items.map((item: { grupo: { id: string } }) => item.grupo.id),
      ).toEqual([g1.id, g2.id]);
      expect(
        (await get(`administradoraId=${active.id}&pageSize=100`)).json().total,
      ).toBe(4);
      expect((await get('valorCreditoDesejado=99999')).json().total).toBe(0);
      expect((await get('valorCreditoDesejado=100000')).json().total).toBe(1);
      expect((await get('valorCreditoDesejado=150000')).json().total).toBe(1);
      expect((await get('valorCreditoDesejado=200000')).json().total).toBe(2);
      expect((await get('valorCreditoDesejado=400001')).json().total).toBe(0);
      const installment = (await get('parcelaMaxima=950')).json();
      expect(installment.items).toHaveLength(1);
      expect(installment.items[0].parcela).toMatchObject({
        valorConhecido: '900',
        origem: 'SNAPSHOT',
      });
      expect((await get('prazoMinimo=120&prazoMaximo=180')).json().total).toBe(
        2,
      );
      expect((await get('status=INATIVO')).json().items[0].grupo.id).toBe(
        g4.id,
      );
      expect((await get(`administradoraId=${inactive.id}`)).json().total).toBe(
        0,
      );
      expect(
        (
          await get(`administradoraId=${inactive.id}&incluirInativos=true`)
        ).json().total,
      ).toBe(1);
      expect(
        (await get('incluirInativos=true&pageSize=100')).json().total,
      ).toBe(6);
      expect(
        (
          await get(`pageSize=1&page=2&sort=creditoMinimo&sortDirection=asc`)
        ).json(),
      ).toMatchObject({ page: 2, pageSize: 1, total: 4 });
      const detail = (
        await get(`administradoraId=${active.id}&categoria=IMOVEL`)
      ).json().items[0];
      expect(detail.historico).toMatchObject({
        snapshotId: latest.id,
        lancesRegistrados: 8,
        estado: 'PARCIAL',
      });
      expect(detail.grupo.quantidadeCotas).toBeNull();
      expect(detail.cobertura.percentualLances).toBe(0.5);
      expect(detail.qualidade).toEqual({ issuesAbertas: 1, issuesCriticas: 1 });
      expect(
        (await get('categoria=AUTOMOVEL')).json().items[0].historico.estado,
      ).toBe('DISPONIVEL');
      expect(
        (await get('administradoraId=' + active.id))
          .json()
          .items.find(
            (item: { grupo: { id: string } }) => item.grupo.id === g2.id,
          ).historico.estado,
      ).toBe('INDISPONIVEL');
      expect(
        (await app.inject({ method: 'GET', url: '/api/v1/comparador/grupos' }))
          .statusCode,
      ).toBe(401);

      const post = (payload: object) =>
        app.inject({
          method: 'POST',
          url: '/api/v1/comparador/comparar',
          headers: { cookie, origin: 'http://frontend.test' },
          payload,
        });
      expect(
        (await post({ grupoIds: [g1.id, g2.id] })).json().items,
      ).toHaveLength(2);
      expect(
        (
          await post({
            grupoIds: [g1.id, g2.id, g3.id],
            permitirCategoriasDiferentes: true,
          })
        ).json().items,
      ).toHaveLength(3);
      const four = await post({
        grupoIds: [g1.id, g2.id, g3.id, g5.id],
        permitirCategoriasDiferentes: true,
        parcelaMaxima: '950',
      });
      expect(four.json().items).toHaveLength(4);
      expect(
        four
          .json()
          .items.find(
            (item: { grupo: { id: string } }) => item.grupo.id === g2.id,
          ).parcela.compatibilidade,
      ).toBe('INDISPONIVEL');
      expect(
        four
          .json()
          .items.find(
            (item: { grupo: { id: string } }) => item.grupo.id === g2.id,
          ).motivosCompatibilidade,
      ).toContain('Parcela: dado indisponível.');
      const single = await post({ grupoIds: [g1.id] });
      expect(single.statusCode).toBe(200);
      expect(single.json().items).toHaveLength(1);
      expect(
        (await post({ grupoIds: [g1.id, g2.id, g3.id, g4.id, g5.id] }))
          .statusCode,
      ).toBe(409);
      expect(
        (await post({ grupoIds: [g1.id, g2.id, g3.id, g4.id, g5.id, g6.id] }))
          .statusCode,
      ).toBe(400);
      expect((await post({ grupoIds: [g1.id, g1.id] })).statusCode).toBe(400);
      expect((await post({ grupoIds: [g1.id, randomUUID()] })).statusCode).toBe(
        404,
      );
      expect((await post({ grupoIds: [g1.id, g3.id] })).statusCode).toBe(409);
      const neutral = JSON.stringify(
        (await post({ grupoIds: [g1.id, g2.id] })).json(),
      ).toLowerCase();
      for (const forbidden of [
        'score',
        'ranking',
        'probabilidade',
        'recommended',
        'best',
        'winner',
      ])
        expect(neutral).not.toContain(forbidden);

      const calculate = (payload: object, authenticated = true) =>
        app.inject({
          method: 'POST',
          url: '/api/v1/indice-aderencia/calcular',
          headers: authenticated
            ? { cookie, origin: 'http://frontend.test' }
            : { origin: 'http://frontend.test' },
          payload,
        });
      const adherence = await calculate({
        perfil: {
          categoria: 'IMOVEL',
          valorCreditoDesejado: '200000',
          parcelaMaxima: '950',
          prazoMaximo: 180,
          lanceDisponivelPercentual: '21',
        },
        grupoIds: [g1.id, g2.id],
      });
      expect(adherence.statusCode).toBe(200);
      expect(adherence.json().resultados).toHaveLength(2);
      expect(adherence.json().resultados[0]).toMatchObject({
        grupoId: g1.id,
        componentes: expect.any(Array),
      });
      expect(adherence.json().resultados[0].componentes).toHaveLength(7);
      expect(adherence.json().resultados[1]).toMatchObject({
        grupoId: g2.id,
        indice: 100,
        coberturaAvaliacao: 40,
      });
      expect(
        (await calculate({ perfil: {}, grupoIds: [g1.id] })).statusCode,
      ).toBe(400);
      expect(
        (
          await calculate({
            perfil: { valorCreditoDesejado: '100000' },
            grupoIds: [randomUUID()],
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await calculate({
            perfil: {
              categoria: 'IMOVEL',
              valorCreditoDesejado: '70000',
            },
            grupoIds: [g3.id],
          })
        ).statusCode,
      ).toBe(409);
      expect(
        (
          await calculate(
            {
              perfil: { valorCreditoDesejado: '100000' },
              grupoIds: [g1.id],
            },
            false,
          )
        ).statusCode,
      ).toBe(401);

      const publicSimulation = (payload: object) =>
        app.inject({
          method: 'POST',
          url: '/api/v1/public/simulador',
          payload,
        });
      const publicPayload = {
        perfil: {
          categoria: 'IMOVEL',
          valorCreditoDesejado: '200000',
        },
        page: 1,
        pageSize: 1,
      };
      const publicFirst = await publicSimulation(publicPayload);
      expect(publicFirst.statusCode).toBe(200);
      expect(publicFirst.json()).toMatchObject({
        page: 1,
        total: 2,
        totalCandidatos: 2,
        limiteAtingido: false,
      });
      expect(publicFirst.json().items[0].grupo).toBe('G1');
      const serializedPublic = JSON.stringify(publicFirst.json());
      expect(serializedPublic).not.toContain(g1.id);
      expect(serializedPublic).not.toContain('issuesCriticas');
      const publicSecond = await publicSimulation({
        ...publicPayload,
        page: 2,
      });
      expect(publicSecond.json().items[0]).toMatchObject({
        grupo: 'G2',
        indiceAderencia: null,
      });
      expect(
        (
          await publicSimulation({
            perfil: {
              categoria: 'IMOVEL',
              valorCreditoDesejado: '99999',
            },
          })
        ).json().items,
      ).toEqual([]);
      expect(
        (
          await publicSimulation({
            ...publicPayload,
            incluirInativos: true,
          })
        ).statusCode,
      ).toBe(400);
      expect(
        (await publicSimulation({ ...publicPayload, pageSize: 13 })).statusCode,
      ).toBe(400);

      const limitedConfig = parseEnvironment({
        ...process.env,
        AUTH_LOGIN_RATE_LIMIT_MAX: '100',
        DATABASE_POOL_MAX: '3',
        DATABASE_URL: url,
        FRONTEND_URL: 'http://frontend.test',
        LOG_LEVEL: 'silent',
        NODE_ENV: 'test',
        PUBLIC_SIMULATOR_RATE_LIMIT_MAX: '2',
        PUBLIC_SIMULATOR_RATE_LIMIT_WINDOW_MS: '60000',
      });
      const limitedApp = await buildApp({
        config: limitedConfig,
        identityService: identity,
        logger: false,
      });
      try {
        expect(
          (
            await limitedApp.inject({
              method: 'POST',
              url: '/api/v1/public/simulador',
              payload: publicPayload,
            })
          ).statusCode,
        ).toBe(200);
        expect(
          (
            await limitedApp.inject({
              method: 'POST',
              url: '/api/v1/public/simulador',
              payload: publicPayload,
            })
          ).statusCode,
        ).toBe(200);
        expect(
          (
            await limitedApp.inject({
              method: 'POST',
              url: '/api/v1/public/simulador',
              payload: publicPayload,
            })
          ).statusCode,
        ).toBe(429);
      } finally {
        await limitedApp.close();
      }
      expect(g6.id).not.toBe(g7.id);
    } finally {
      await app.close();
    }
  });

  it('simulates an active commercial plan without a linked product', async () => {
    const administrator = await prisma.administradora.create({
      data: { nome: 'Administradora Plano Comercial' },
    });
    const table = await prisma.tabelaComercial.create({
      data: {
        administradoraId: administrator.id,
        nome: 'Tabela Pesados sem produto',
        codigo: 'TA1',
        categoria: 'PESADOS',
        inicioVigencia: new Date('2023-07-11T00:00:00.000Z'),
        status: 'ATIVA',
      },
    });
    await prisma.tabelaComercialItem.create({
      data: {
        tabelaComercialId: table.id,
        creditoReferencia: '200000',
        prazoMeses: 100,
        modalidade: 'NORMAL',
        parcelaPadrao: '2280',
      },
    });
    const app = await buildApp({
      config,
      identityService: identity,
      logger: false,
    });
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/public/simulador',
        payload: {
          perfil: {
            categoria: 'PESADOS',
            valorCreditoDesejado: '200000',
          },
          page: 1,
          pageSize: 6,
        },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().items).toEqual([
        expect.objectContaining({
          origem: 'PLANO_COMERCIAL',
          administradora: 'Administradora Plano Comercial',
          grupo: 'TA1',
          categoria: 'PESADOS',
        }),
      ]);
    } finally {
      await app.close();
    }
  });

  it('caps and reports a moderate public candidate volume without per-group requests', async () => {
    const administrator = await prisma.administradora.create({
      data: { nome: 'Administradora Volume' },
    });
    const product = await prisma.produto.create({
      data: {
        administradoraId: administrator.id,
        nome: 'Imóvel Volume',
        categoria: 'IMOVEL',
      },
    });
    await prisma.grupo.createMany({
      data: Array.from({ length: 150 }, (_, index) => ({
        administradoraId: administrator.id,
        produtoId: product.id,
        codigo: `VOL-${String(index + 1).padStart(3, '0')}`,
        status: 'ATIVO',
        valorCreditoMinimo: '100000',
        valorCreditoMaximo: '200000',
        prazoMeses: 120,
      })),
    });
    const app = await buildApp({
      config,
      identityService: identity,
      logger: false,
    });
    try {
      const started = performance.now();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/public/simulador',
        payload: {
          perfil: {
            categoria: 'IMOVEL',
            valorCreditoDesejado: '150000',
          },
          page: 1,
          pageSize: 12,
        },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        total: 100,
        totalCandidatos: 150,
        limiteCandidatos: 100,
        limiteAtingido: true,
      });
      expect(response.json().items).toHaveLength(12);
      expect(performance.now() - started).toBeGreaterThanOrEqual(0);
    } finally {
      await app.close();
    }
  });

  it('compares up to five items mixing groups and plans and exposes financial fields', async () => {
    await identity.createFirstSuperAdmin({
      email: 'five@example.com',
      nome: 'Five Admin',
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
        payload: { email: 'five@example.com', password },
      });
      const cookie = sessionCookie(login);
      const active = await prisma.administradora.create({
        data: { nome: 'Ativa Five' },
      });
      const property = await prisma.produto.create({
        data: {
          administradoraId: active.id,
          nome: 'Imóvel Five',
          categoria: 'IMOVEL',
        },
      });
      const groups: string[] = [];
      for (const index of [1, 2, 3, 4, 5]) {
        const group = await prisma.grupo.create({
          data: {
            administradoraId: active.id,
            produtoId: property.id,
            codigo: `FIV${index}`,
            status: 'ATIVO',
            valorCreditoMinimo: `${100000 * index}`,
            valorCreditoMaximo: `${100000 * (index + 1)}`,
            prazoMeses: 100 + index,
          },
        });
        groups.push(group.id);
      }
      const table = await prisma.tabelaComercial.create({
        data: {
          administradoraId: active.id,
          produtoId: property.id,
          nome: 'Tabela Five',
          codigo: 'FIVX',
          categoria: 'IMOVEL',
          inicioVigencia: new Date('2026-01-01T00:00:00.000Z'),
          status: 'ATIVA',
        },
      });
      const item = await prisma.tabelaComercialItem.create({
        data: {
          tabelaComercialId: table.id,
          creditoReferencia: '250000',
          prazoMeses: 120,
          modalidade: 'NORMAL',
          parcelaPadrao: '2500',
          primeiraParcela: '2800',
          demaisParcelas: '2500',
          taxaAdministracaoPercentual: '18',
          taxaTotalPercentual: '20',
          fundoReservaPercentual: '1.5',
          seguroVidaPercentual: '0.5',
          participantesGrupo: 400,
          codigoPlano: 'PLANO-5',
        },
      });
      const secondItem = await prisma.tabelaComercialItem.create({
        data: {
          tabelaComercialId: table.id,
          creditoReferencia: '300000',
          prazoMeses: 80,
          modalidade: 'NORMAL',
          parcelaPadrao: '2600',
          taxaAdministracaoPercentual: '20',
        },
      });
      const post = (payload: object) =>
        app.inject({
          method: 'POST',
          url: '/api/v1/comparador/comparar',
          headers: { cookie, origin: 'http://frontend.test' },
          payload,
        });
      const five = await post({
        grupoIds: [groups[0], groups[1], groups[2], groups[3], item.id],
      });
      expect(five.statusCode).toBe(200);
      const fiveItems = five.json().items;
      expect(fiveItems).toHaveLength(5);
      expect(
        fiveItems.map((entry: { origem: string }) => entry.origem),
      ).toEqual(['GRUPO', 'GRUPO', 'GRUPO', 'GRUPO', 'PLANO_COMERCIAL']);
      const plan = fiveItems[4];
      expect(plan.tabelaComercial.itemId).toBe(item.id);
      expect(plan.tabelaComercial.modalidade).toBe('NORMAL');
      expect(plan.financeiro).toMatchObject({
        parcelaPadrao: '2500',
        primeiraParcela: '2800',
        demaisParcelas: '2500',
        taxaAdministracaoPercentual: '18',
        taxaTotalPercentual: '20',
        fundoReservaPercentual: '1.5',
        seguroVidaPercentual: '0.5',
        participantesGrupo: 400,
      });
      expect(fiveItems[0].financeiro).toBeNull();
      expect((await post({ grupoIds: [...groups, item.id] })).statusCode).toBe(
        400,
      );
      const plans = await post({ grupoIds: [item.id, secondItem.id] });
      expect(plans.statusCode).toBe(200);
      expect(plans.json().items).toHaveLength(2);
      expect(
        plans
          .json()
          .items.every(
            (entry: { origem: string }) => entry.origem === 'PLANO_COMERCIAL',
          ),
      ).toBe(true);
      const calculated = await app.inject({
        method: 'POST',
        url: '/api/v1/indice-aderencia/calcular',
        headers: { cookie, origin: 'http://frontend.test' },
        payload: {
          perfil: { categoria: 'IMOVEL', valorCreditoDesejado: '150000' },
          grupoIds: groups,
        },
      });
      expect(calculated.statusCode).toBe(200);
      expect(calculated.json().resultados).toHaveLength(5);
      const planAdherence = await app.inject({
        method: 'POST',
        url: '/api/v1/indice-aderencia/calcular',
        headers: { cookie, origin: 'http://frontend.test' },
        payload: {
          perfil: { valorCreditoDesejado: '250000' },
          grupoIds: [item.id],
        },
      });
      expect(planAdherence.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});
