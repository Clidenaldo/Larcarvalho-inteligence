import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '../../src/config/load-env.js';
import { parseEnvironment, type AppConfig } from '../../src/config/env.js';
import type { AuthContext } from '../../src/core/auth/auth-context.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createPrismaClient } from '../../src/infrastructure/database/prisma-client.js';
import { wipeSalesData } from './clean-vendas.js';
import { IdentityService } from '../../src/modules/identity/identity.service.js';
import { TabelasComerciaisService } from '../../src/modules/tabelas-comerciais/tabelas-comerciais.service.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;
const config = () =>
  parseEnvironment({
    ...process.env,
    DATABASE_URL: databaseUrl,
    DATABASE_POOL_MAX: '3',
    FRONTEND_URL: 'http://frontend.test',
    LOG_LEVEL: 'silent',
    NODE_ENV: 'test',
  });

run('commercial tables with PostgreSQL', () => {
  let db: PrismaClient;
  let appConfig: AppConfig;
  let identity: IdentityService;
  let service: TabelasComerciaisService;
  let actor: AuthContext;

  beforeAll(() => {
    appConfig = config();
    db = createPrismaClient(appConfig);
    identity = new IdentityService(db, appConfig);
    service = new TabelasComerciaisService(db);
  });
  beforeEach(async () => {
    await wipeSalesData(db);
    await db.dataQualityIssue.deleteMany();
    await db.importacao.deleteMany();
    await db.fonteDados.deleteMany();
    await db.tabelaComercialItem.deleteMany();
    await db.tabelaComercial.deleteMany();
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
    const user = await identity.createFirstSuperAdmin({
      email: 'root-commercial@example.com',
      nome: 'Root Commercial',
      password: 'frase senha inicial segura',
    });
    actor = { sessionId: 'commercial-test', user };
  });
  afterAll(async () => {
    await wipeSalesData(db);
    await db?.dataQualityIssue.deleteMany();
    await db?.importacao.deleteMany();
    await db?.fonteDados.deleteMany();
    await db?.tabelaComercialItem.deleteMany();
    await db?.tabelaComercial.deleteMany();
    await db?.contemplacao.deleteMany();
    await db?.lance.deleteMany();
    await db?.assembleia.deleteMany();
    await db?.cota.deleteMany();
    await db?.grupo.deleteMany();
    await db?.produto.deleteMany();
    await db?.administradora.deleteMany();
    await db?.session.deleteMany();
    await db?.auditLog.deleteMany();
    await db?.user.deleteMany();
    await db?.$disconnect();
  });

  it('versions tables, validates relationships, manages items and preserves audit', async () => {
    const admin = await db.administradora.create({
      data: { nome: 'Embracon Teste', cnpj: '11222333000181' },
    });
    const product = await db.produto.create({
      data: {
        administradoraId: admin.id,
        nome: 'Pesados',
        categoria: 'PESADOS',
      },
    });
    const first = await service.create(
      actor,
      {
        administradoraId: admin.id,
        produtoId: product.id,
        nome: 'Tabela Pesados Antecipação 1X',
        codigo: 'TA1',
        categoria: 'PESADOS',
        inicioVigencia: '2023-07-11',
        status: 'ATIVA',
        taxaAdministracaoPercentual: '18.500000',
      },
      {},
    );
    await expect(
      service.create(
        actor,
        {
          administradoraId: admin.id,
          nome: 'Duplicada',
          codigo: 'TA1',
          categoria: 'PESADOS',
          inicioVigencia: '2023-07-11',
          status: 'ATIVA',
        },
        {},
      ),
    ).rejects.toMatchObject({ code: 'TABELA_COMERCIAL_CONFLICT' });
    const nextVersion = await service.create(
      actor,
      {
        administradoraId: admin.id,
        nome: 'Tabela Pesados Antecipação 1X 2024',
        codigo: 'TA1',
        categoria: 'PESADOS',
        inicioVigencia: '2024-01-01',
        status: 'ATIVA',
      },
      {},
    );
    expect(nextVersion.id).not.toBe(first.id);
    const item = await service.createItem(
      actor,
      first.id,
      {
        creditoReferencia: '400000.00',
        prazoMeses: 100,
        modalidade: 'NORMAL',
        taxaAntecipadaPercentual: '1.000000',
        primeiraParcela: '8560.00',
        demaisParcelas: '4560.00',
      },
      {},
    );
    expect(item.creditoReferencia).toBe('400000');
    await service.updateItem(
      actor,
      first.id,
      item.id,
      { seguro: '280.60' },
      {},
    );
    await service.status(actor, first.id, 'ENCERRADA', {});
    const detail = await service.get(actor, first.id);
    expect(detail).toMatchObject({ status: 'ENCERRADA', quantidadeItens: 1 });
    expect(detail.auditoria.map((entry) => entry.action)).toEqual(
      expect.arrayContaining([
        'TABELA_COMERCIAL_CREATED',
        'TABELA_COMERCIAL_CLOSED',
        'ITEM_COMERCIAL_CREATED',
        'ITEM_COMERCIAL_UPDATED',
      ]),
    );
  });

  it('enforces database checks for money, percentages, term and validity', async () => {
    const admin = await db.administradora.create({
      data: { nome: 'Admin checks' },
    });
    await expect(
      db.tabelaComercial.create({
        data: {
          administradoraId: admin.id,
          nome: 'Período inválido',
          codigo: 'INVALID-DATE',
          categoria: 'PESADOS',
          inicioVigencia: new Date('2024-02-01T00:00:00.000Z'),
          fimVigencia: new Date('2024-01-01T00:00:00.000Z'),
        },
      }),
    ).rejects.toBeTruthy();
    const table = await db.tabelaComercial.create({
      data: {
        administradoraId: admin.id,
        nome: 'Tabela válida',
        codigo: 'VALID',
        categoria: 'PESADOS',
        inicioVigencia: new Date('2024-01-01T00:00:00.000Z'),
      },
    });
    await expect(
      db.tabelaComercialItem.create({
        data: {
          tabelaComercialId: table.id,
          creditoReferencia: '-1',
          prazoMeses: 0,
          modalidade: 'NORMAL',
          fundoReservaPercentual: '101',
        },
      }),
    ).rejects.toBeTruthy();
  });

  it('archives and restores tables, and physically deletes only table items', async () => {
    const admin = await db.administradora.create({
      data: { nome: 'Admin delete' },
    });
    const table = await service.create(
      actor,
      {
        administradoraId: admin.id,
        nome: 'TA1 técnica',
        codigo: 'TA1',
        categoria: 'PESADOS',
        inicioVigencia: '2024-01-01',
        status: 'ATIVA',
      },
      {},
    );
    await service.archive(actor, table.id, {});
    expect(
      (
        await service.list(actor, {
          page: 1,
          pageSize: 20,
          arquivamento: 'ATIVAS',
        })
      ).total,
    ).toBe(0);
    expect(
      (
        await service.list(actor, {
          page: 1,
          pageSize: 20,
          arquivamento: 'ARQUIVADAS',
        })
      ).total,
    ).toBe(1);
    await service.restore(actor, table.id, {});
    await service.delete(actor, table.id, 'EXCLUIR', {});
    expect(
      await db.tabelaComercial.findUnique({ where: { id: table.id } }),
    ).toBeNull();
    expect(
      await db.auditLog.count({
        where: { entity: 'TabelaComercial', entityId: table.id },
      }),
    ).toBeGreaterThan(0);
  });

  it('blocks physical deletion when an external audit link exists', async () => {
    const admin = await db.administradora.create({
      data: { nome: 'Admin linked' },
    });
    const table = await db.tabelaComercial.create({
      data: {
        administradoraId: admin.id,
        nome: 'Tabela vinculada',
        codigo: 'LINKED',
        categoria: 'PESADOS',
        inicioVigencia: new Date('2024-01-01T00:00:00.000Z'),
      },
    });
    await db.auditLog.create({
      data: {
        action: 'SIMULATOR_USED',
        entity: 'Simulador',
        entityId: table.id,
      },
    });
    await expect(
      service.delete(actor, table.id, 'EXCLUIR', {}),
    ).rejects.toMatchObject({
      code: 'TABELA_COMERCIAL_DELETE_BLOCKED',
    });
  });
});
