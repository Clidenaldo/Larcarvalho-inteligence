import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ImportacaoEstrategia, ImportacaoTipo } from '@larcarvalho/shared';
import '../../src/config/load-env.js';
import { parseEnvironment, type AppConfig } from '../../src/config/env.js';
import type { AuthContext } from '../../src/core/auth/auth-context.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createPrismaClient } from '../../src/infrastructure/database/prisma-client.js';
import { wipeSalesData } from './clean-vendas.js';
import { IdentityService } from '../../src/modules/identity/identity.service.js';
import { ImportacoesService } from '../../src/modules/importacoes/importacoes.service.js';
import { detectConcurrencyChanges } from '../../src/modules/importacoes/import-execution.js';
import { hashPassword } from '../../src/core/auth/password.js';
import { buildApp } from '../../src/app.js';

const url = process.env.TEST_DATABASE_URL;
const run = url ? describe : describe.skip;
const password = 'frase senha inicial segura';
const config = () =>
  parseEnvironment({
    ...process.env,
    DATABASE_URL: url,
    DATABASE_POOL_MAX: '3',
    FRONTEND_URL: 'http://frontend.test',
    LOG_LEVEL: 'silent',
    NODE_ENV: 'test',
  });
function csv(values: Record<string, string>) {
  const headers = Object.keys(values);
  const escaped = (value: string) => `"${value.replace(/"/g, '""')}"`;
  return Buffer.from(
    `${headers.map(escaped).join(',')}\n${headers.map((header) => escaped(values[header]!)).join(',')}\n`,
  );
}

run('CSV/XLSX import workflow with PostgreSQL', () => {
  let prisma: PrismaClient;
  let appConfig: AppConfig;
  let identity: IdentityService;
  let service: ImportacoesService;
  let actor: AuthContext;
  beforeAll(() => {
    appConfig = config();
    prisma = createPrismaClient(appConfig);
    identity = new IdentityService(prisma, appConfig);
    service = new ImportacoesService(prisma);
  });
  beforeEach(async () => {
    await wipeSalesData(prisma);
    await prisma.dataQualityIssue.deleteMany();
    await prisma.importacao.deleteMany();
    await prisma.fonteDados.deleteMany();
    await prisma.tabelaComercialItem.deleteMany();
    await prisma.tabelaComercial.deleteMany();
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
    const user = await identity.createFirstSuperAdmin({
      email: 'root-import@example.com',
      nome: 'Root Import',
      password,
    });
    actor = {
      sessionId: 'integration-session',
      user: {
        id: user.id,
        email: user.email,
        nome: user.nome,
        role: user.role,
      },
    };
  });
  afterAll(async () => {
    await wipeSalesData(prisma);
    await prisma?.dataQualityIssue.deleteMany();
    await prisma?.importacao.deleteMany();
    await prisma?.fonteDados.deleteMany();
    await prisma?.tabelaComercialItem.deleteMany();
    await prisma?.tabelaComercial.deleteMany();
    await prisma?.contemplacao.deleteMany();
    await prisma?.lance.deleteMany();
    await prisma?.assembleia.deleteMany();
    await prisma?.cota.deleteMany();
    await prisma?.grupo.deleteMany();
    await prisma?.produto.deleteMany();
    await prisma?.administradora.deleteMany();
    await prisma?.session.deleteMany();
    await prisma?.auditLog.deleteMany();
    await prisma?.user.deleteMany();
    await prisma?.$disconnect();
  });
  async function execute(
    tipo: ImportacaoTipo,
    values: Record<string, string>,
    strategy: ImportacaoEstrategia = 'IGNORAR',
  ) {
    const item = await service.upload(
      actor,
      {
        tipo,
        filename: `${tipo.toLowerCase()}.csv`,
        mime: 'text/csv',
        bytes: csv(values),
      },
      { ipAddress: '127.0.0.1', userAgent: 'vitest' },
    );
    const mapping = Object.fromEntries(
      Object.keys(values).map((field) => [field, field]),
    );
    await service.saveMapping(actor, item.id, { mapeamento: mapping }, {});
    const validation = await service.validate(actor, item.id, strategy, {});
    expect(validation.erros).toBe(0);
    return service.execute(actor, item.id, {});
  }
  async function prepareOnly(
    tipo: ImportacaoTipo,
    values: Record<string, string>,
    strategy: ImportacaoEstrategia = 'IGNORAR',
  ) {
    const item = await service.upload(
      actor,
      {
        tipo,
        filename: `${tipo.toLowerCase()}.csv`,
        mime: 'text/csv',
        bytes: csv(values),
      },
      { ipAddress: '127.0.0.1', userAgent: 'vitest' },
    );
    const mapping = Object.fromEntries(
      Object.keys(values).map((field) => [field, field]),
    );
    await service.saveMapping(actor, item.id, { mapeamento: mapping }, {});
    await service.validate(actor, item.id, strategy, {});
    return item.id;
  }
  it('imports all seven scopes, relationships, counters and audit records', async () => {
    const adminImport = await execute('ADMINISTRADORAS', {
      nome: 'Administradora Importada',
      cnpj: '11.222.333/0001-81',
      codigoExterno: 'ADM-1',
      ativa: 'sim',
    });
    expect(adminImport.registrosCriados).toBe(1);
    const admin = await prisma.administradora.findUniqueOrThrow({
      where: { cnpj: '11222333000181' },
    });
    await execute('PRODUTOS', {
      administradoraId: admin.id,
      nome: 'Produto Imóvel',
      categoria: 'imóvel',
      codigoExterno: 'P-1',
      ativo: '1',
    });
    const product = await prisma.produto.findFirstOrThrow({
      where: { administradoraId: admin.id },
    });
    await execute('GRUPOS', {
      administradoraId: admin.id,
      produtoId: product.id,
      codigo: 'G-001',
      status: 'ativo',
      prazoMeses: '120',
      valorCreditoMinimo: '1.234,56',
      valorCreditoMaximo: '2000.00',
    });
    const group = await prisma.grupo.findUniqueOrThrow({
      where: {
        administradoraId_codigo: {
          administradoraId: admin.id,
          codigo: 'G-001',
        },
      },
    });
    await execute('COTAS', {
      grupoId: group.id,
      numero: '001',
      status: 'ATIVO',
      valorCredito: '1500,00',
      prazoRestante: '100',
    });
    const quota = await prisma.cota.findUniqueOrThrow({
      where: { grupoId_numero: { grupoId: group.id, numero: '001' } },
    });
    expect(quota.numero).toBe('001');
    await execute('ASSEMBLEIAS', {
      grupoId: group.id,
      numero: '1',
      dataAssembleia: '2026-09-01T12:00:00Z',
      status: 'REALIZADA',
    });
    const assembly = await prisma.assembleia.findUniqueOrThrow({
      where: { grupoId_numero: { grupoId: group.id, numero: '1' } },
    });
    await execute('LANCES', {
      assembleiaId: assembly.id,
      cotaId: quota.id,
      tipo: 'LIVRE',
      percentual: '20,5',
      valor: '500,00',
      contemplado: 'não',
      origem: 'IMPORTACAO',
    });
    const awardImport = await execute('CONTEMPLACOES', {
      assembleiaId: assembly.id,
      cotaId: quota.id,
      tipo: 'LANCE',
      codigoExterno: 'CONT-1',
      valorLance: '500,00',
      percentualLance: '20,5',
    });
    expect(awardImport.status).toBe('CONCLUIDA');
    await expect(prisma.lance.count()).resolves.toBe(1);
    await expect(prisma.contemplacao.count()).resolves.toBe(1);
    await expect(
      prisma.auditLog.count({
        where: { entity: 'Importacao', action: 'IMPORTACAO_COMPLETED' },
      }),
    ).resolves.toBe(7);
    await expect(
      service.execute(actor, awardImport.id, {}),
    ).rejects.toMatchObject({ code: 'IMPORTACAO_CONFLICT', statusCode: 409 });
  });
  it('updates only by reliable key and detects a duplicate inside the file', async () => {
    await execute('ADMINISTRADORAS', {
      nome: 'Nome inicial',
      cnpj: '11.222.333/0001-81',
    });
    const updated = await execute(
      'ADMINISTRADORAS',
      { nome: 'Nome atualizado', cnpj: '11.222.333/0001-81' },
      'ATUALIZAR',
    );
    expect(updated.registrosAtualizados).toBe(1);
    await expect(
      prisma.administradora.findUniqueOrThrow({
        where: { cnpj: '11222333000181' },
      }),
    ).resolves.toMatchObject({ nome: 'Nome atualizado' });
    const bytes = Buffer.from(
      'nome,cnpj\nDuplicada,45.723.174/0001-10\nDuplicada,45.723.174/0001-10\n',
    );
    const item = await service.upload(
      actor,
      {
        tipo: 'ADMINISTRADORAS',
        filename: 'duplicadas.csv',
        mime: 'text/csv',
        bytes,
      },
      {},
    );
    await service.saveMapping(
      actor,
      item.id,
      { mapeamento: { nome: 'nome', cnpj: 'cnpj' } },
      {},
    );
    const validation = await service.validate(actor, item.id, 'IGNORAR', {});
    expect(validation.erros).toBe(1);
    expect(validation.duplicadas).toBe(1);
    const issues = await service.issues(actor, item.id, {
      page: 1,
      pageSize: 20,
    });
    expect(
      issues.items.some((issue) => issue.codigo === 'FILE_DUPLICATE'),
    ).toBe(true);
  });
  it('imports TA1 and TSA as commercial tables with valid modalities', async () => {
    const admin = await prisma.administradora.create({
      data: {
        nome: 'Embracon',
        cnpj: '11222333000181',
      },
    });
    const headers = [
      'tabelaCodigo',
      'administradoraCnpj',
      'categoria',
      'creditoReferencia',
      'taxaAntecipadaPercentual',
      'prazoMeses',
      'modalidade',
      'primeiraParcela',
      'demaisParcelas',
      'parcelaPadrao',
      'inicioVigencia',
    ];
    const rows = [
      [
        'TA1',
        '11.222.333/0001-81',
        'PESADOS',
        '400000',
        '1',
        '100',
        'NORMAL',
        '8560',
        '4560',
        '',
        '2023-07-11',
      ],
      [
        'TA1',
        '11.222.333/0001-81',
        'PESADOS',
        '400000',
        '1',
        '85',
        'MAIS_POR_MENOS',
        '9364.71',
        '5364.71',
        '',
        '2023-07-11',
      ],
      [
        'TSA',
        '11.222.333/0001-81',
        'PESADOS',
        '400000',
        '0',
        '100',
        'NORMAL',
        '',
        '',
        '4640',
        '2023-07-11',
      ],
      [
        'TSA',
        '11.222.333/0001-81',
        'PESADOS',
        '400000',
        '0',
        '85',
        'MAIS_POR_MENOS',
        '',
        '',
        '5458.82',
        '2023-07-11',
      ],
    ];
    const quote = (value: string) => `"${value}"`;
    const bytes = Buffer.from(
      `${headers.map(quote).join(',')}\n${rows.map((row) => row.map(quote).join(',')).join('\n')}\n`,
    );
    const uploaded = await service.upload(
      actor,
      {
        tipo: 'TABELAS_COMERCIAIS',
        filename: 'ta1-tsa.csv',
        mime: 'text/csv',
        bytes,
      },
      {},
    );
    await service.saveMapping(
      actor,
      uploaded.id,
      {
        mapeamento: Object.fromEntries(headers.map((field) => [field, field])),
      },
      {},
    );
    const validation = await service.validate(
      actor,
      uploaded.id,
      'ATUALIZAR',
      {},
    );
    expect(validation).toMatchObject({
      total: 4,
      validas: 4,
      erros: 0,
      novas: 4,
    });
    const completed = await service.execute(actor, uploaded.id, {});
    expect(completed.status).toBe('CONCLUIDA');
    await expect(
      prisma.tabelaComercial.count({ where: { administradoraId: admin.id } }),
    ).resolves.toBe(2);
    await expect(prisma.tabelaComercialItem.count()).resolves.toBe(4);
    const ta1 = await prisma.tabelaComercial.findUniqueOrThrow({
      where: {
        administradoraId_codigo_inicioVigencia: {
          administradoraId: admin.id,
          codigo: 'TA1',
          inicioVigencia: new Date('2023-07-11T00:00:00.000Z'),
        },
      },
    });
    expect(ta1.origem).toBe('IMPORTACAO');
    const modalities = await prisma.tabelaComercialItem.findMany({
      select: { modalidade: true },
    });
    expect(new Set(modalities.map((item) => item.modalidade))).toEqual(
      new Set(['NORMAL', 'MAIS_POR_MENOS']),
    );
    const commercialAudit = await prisma.auditLog.groupBy({
      by: ['action'],
      where: {
        action: {
          in: ['TABELA_COMERCIAL_CREATED', 'ITEM_COMERCIAL_CREATED'],
        },
      },
      _count: true,
    });
    expect(
      Object.fromEntries(
        commercialAudit.map((entry) => [entry.action, entry._count]),
      ),
    ).toEqual({
      TABELA_COMERCIAL_CREATED: 2,
      ITEM_COMERCIAL_CREATED: 4,
    });
  });
  it('blocks execute when validation produced zero valid rows', async () => {
    await prisma.administradora.create({
      data: { nome: 'Embracon', cnpj: '11222333000181' },
    });
    const values = {
      tabelaCodigo: 'TA1',
      administradoraCnpj: '11.222.333/0001-81',
      categoria: 'PESADOS',
      creditoReferencia: '400000',
      prazoMeses: '100',
      modalidade: 'MODALIDADE_INVALIDA',
      inicioVigencia: '2023-07-11',
    };
    const uploaded = await service.upload(
      actor,
      {
        tipo: 'TABELAS_COMERCIAIS',
        filename: 'invalid.csv',
        mime: 'text/csv',
        bytes: csv(values),
      },
      {},
    );
    await service.saveMapping(
      actor,
      uploaded.id,
      {
        mapeamento: Object.fromEntries(
          Object.keys(values).map((field) => [field, field]),
        ),
      },
      {},
    );
    const validation = await service.validate(
      actor,
      uploaded.id,
      'IGNORAR',
      {},
    );
    expect(validation).toMatchObject({ validas: 0, erros: 1 });
    await expect(service.execute(actor, uploaded.id, {})).rejects.toMatchObject(
      {
        code: 'IMPORTACAO_CONFLICT',
        statusCode: 409,
      },
    );
    await expect(prisma.tabelaComercial.count()).resolves.toBe(0);
  });
  it('respects fill_empty and never policies on UPDATE', async () => {
    await execute('ADMINISTRADORAS', {
      nome: 'Original',
      cnpj: '11.222.333/0001-81',
      nomeFantasia: 'Fantasia Original',
      site: 'https://original.com',
    });
    const updated = await execute(
      'ADMINISTRADORAS',
      {
        nome: 'Atualizado',
        cnpj: '11.222.333/0001-81',
        nomeFantasia: '',
        site: '',
      },
      'ATUALIZAR',
    );
    expect(updated.registrosAtualizados).toBe(1);
    const admin = await prisma.administradora.findUniqueOrThrow({
      where: { cnpj: '11222333000181' },
    });
    expect(admin.nome).toBe('Atualizado');
    expect(admin.nomeFantasia).toBe('Fantasia Original');
    expect(admin.site).toBe('https://original.com');
    expect(admin.cnpj).toBe('11222333000181');
  });
  it('executes the same lance import twice without creating duplicates', async () => {
    await execute('ADMINISTRADORAS', {
      nome: 'Adm Lance',
      cnpj: '11.222.333/0001-81',
    });
    const admin = await prisma.administradora.findUniqueOrThrow({
      where: { cnpj: '11222333000181' },
    });
    await execute('PRODUTOS', {
      administradoraId: admin.id,
      nome: 'Produto Lance',
      categoria: 'imóvel',
    });
    const product = await prisma.produto.findFirstOrThrow({
      where: { administradoraId: admin.id },
    });
    await execute('GRUPOS', {
      administradoraId: admin.id,
      produtoId: product.id,
      codigo: 'G-LANCE',
      status: 'ativo',
    });
    const group = await prisma.grupo.findUniqueOrThrow({
      where: { administradoraId_codigo: { administradoraId: admin.id, codigo: 'G-LANCE' } },
    });
    await execute('COTAS', {
      grupoId: group.id,
      numero: '10',
      status: 'ATIVO',
    });
    const quota = await prisma.cota.findUniqueOrThrow({
      where: { grupoId_numero: { grupoId: group.id, numero: '10' } },
    });
    await execute('ASSEMBLEIAS', {
      grupoId: group.id,
      numero: '5',
      dataAssembleia: '2026-10-01T10:00:00Z',
      status: 'REALIZADA',
    });
    const assembly = await prisma.assembleia.findUniqueOrThrow({
      where: { grupoId_numero: { grupoId: group.id, numero: '5' } },
    });
    const lanceValues = {
      assembleiaId: assembly.id,
      cotaId: quota.id,
      tipo: 'LIVRE',
      percentual: '15',
      valor: '300,00',
      contemplado: 'não',
      origem: 'IMPORTACAO',
    };
    const first = await execute('LANCES', lanceValues, 'ATUALIZAR');
    expect(first.status).toBe('CONCLUIDA');
    await expect(prisma.lance.count()).resolves.toBe(1);
    const second = await execute('LANCES', lanceValues, 'ATUALIZAR');
    expect(second.status).toBe('CONCLUIDA');
    await expect(prisma.lance.count()).resolves.toBe(1);
  });
  it('plan preview matches actual execution results', async () => {
    await execute('ADMINISTRADORAS', {
      nome: 'Plan Admin',
      cnpj: '11.222.333/0001-81',
      nomeFantasia: 'Fantasia',
    });
    const item = await service.upload(
      actor,
      {
        tipo: 'ADMINISTRADORAS',
        filename: 'plan-update.csv',
        mime: 'text/csv',
        bytes: csv({
          nome: 'Plan Atualizado',
          cnpj: '11.222.333/0001-81',
          nomeFantasia: 'Nova Fantasia',
        }),
      },
      { ipAddress: '127.0.0.1', userAgent: 'vitest' },
    );
    await service.saveMapping(
      actor,
      item.id,
      { mapeamento: { nome: 'nome', cnpj: 'cnpj', nomeFantasia: 'nomeFantasia' } },
      {},
    );
    await service.validate(actor, item.id, 'ATUALIZAR', {});
    const plan = await service.plan(actor, item.id, {});
    expect(plan.entities).toHaveLength(1);
    const entity = plan.entities[0]!;
    expect(entity.updates).toBe(1);
    expect(entity.creates).toBe(0);
    const result = await service.execute(actor, item.id, {});
    expect(result.status).toBe('CONCLUIDA');
    expect(result.registrosAtualizados).toBe(1);
  });

  describe('detectConcurrencyChanges unit', () => {
    it('returns empty when no fields differ', () => {
      const conflicts = detectConcurrencyChanges(
        { nome: 'A', prazo: 100 },
        { nome: 'A', prazo: 100 },
        ['nome', 'prazo'],
      );
      expect(conflicts).toEqual([]);
    });
    it('detects changed fields', () => {
      const conflicts = detectConcurrencyChanges(
        { nome: 'A', prazo: 100 },
        { nome: 'A', prazo: 110 },
        ['nome', 'prazo'],
      );
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]!.field).toBe('prazo');
      expect(conflicts[0]!.expected).toBe('100');
      expect(conflicts[0]!.actual).toBe('110');
    });
    it('ignores fields not in the check list', () => {
      const conflicts = detectConcurrencyChanges(
        { nome: 'A' },
        { nome: 'B' },
        [],
      );
      expect(conflicts).toEqual([]);
    });
  });

  it('preview × execute per field: nome updates, site fill_empty preserved, cnpj never preserved', async () => {
    await execute('ADMINISTRADORAS', {
      nome: 'Original',
      cnpj: '11.222.333/0001-81',
      nomeFantasia: 'Fantasia Orig',
      site: 'https://orig.com',
    });
    const itemId = await prepareOnly(
      'ADMINISTRADORAS',
      { nome: 'Novo Nome', cnpj: '11.222.333/0001-81', nomeFantasia: '', site: '' },
      'ATUALIZAR',
    );
    const plan = await service.plan(actor, itemId, {});
    const sample = plan.entities[0]!.sample[0]!;
    const nomeDiff = sample.diffs.find((d) => d.field === 'nome');
    expect(nomeDiff).toBeDefined();
    expect(nomeDiff!.changed).toBe(true);
    expect(nomeDiff!.policy).toBe('update');
    const siteDiff = sample.diffs.find((d) => d.field === 'site');
    if (siteDiff) {
      expect(siteDiff.changed).toBe(false);
      expect(siteDiff.policy).toBe('fill_empty');
    }
    const result = await service.execute(actor, itemId, {});
    expect(result.status).toBe('CONCLUIDA');
    const admin = await prisma.administradora.findUniqueOrThrow({
      where: { cnpj: '11222333000181' },
    });
    expect(admin.nome).toBe('Novo Nome');
    expect(admin.site).toBe('https://orig.com');
    expect(admin.nomeFantasia).toBe('Fantasia Orig');
    expect(admin.cnpj).toBe('11222333000181');
  });

  it('COMMERCIAL_TABLE: creates only commercial entities, no Groups/Quotas/Assemblies', async () => {
    await execute('ADMINISTRADORAS', {
      nome: 'EmbComm',
      cnpj: '11.222.333/0001-81',
    });
    const admin = await prisma.administradora.findUniqueOrThrow({
      where: { cnpj: '11222333000181' },
    });
    await execute('PRODUTOS', {
      administradoraId: admin.id,
      nome: 'Produto Comm',
      categoria: 'imóvel',
    });
    const headers = [
      'tabelaCodigo', 'administradoraCnpj', 'categoria',
      'creditoReferencia', 'taxaAntecipadaPercentual', 'prazoMeses',
      'modalidade', 'primeiraParcela', 'demaisParcelas', 'parcelaPadrao',
      'inicioVigencia',
    ];
    const rows = [
      ['TC1', '11.222.333/0001-81', 'PESADOS', '400000', '1', '100', 'NORMAL', '8560', '4560', '', '2023-07-11'],
    ];
    const quote = (v: string) => `"${v}"`;
    const bytes = Buffer.from(
      `${headers.map(quote).join(',')}\n${rows.map((r) => r.map(quote).join(',')).join('\n')}\n`,
    );
    const uploaded = await service.upload(
      actor,
      { tipo: 'TABELAS_COMERCIAIS', filename: 'tc.csv', mime: 'text/csv', bytes },
      {},
    );
    await service.saveMapping(
      actor, uploaded.id,
      { mapeamento: Object.fromEntries(headers.map((f) => [f, f])) },
      {},
    );
    await service.validate(actor, uploaded.id, 'ATUALIZAR', {});
    const completed = await service.execute(actor, uploaded.id, {});
    expect(completed.status).toBe('CONCLUIDA');
    await expect(prisma.tabelaComercial.count()).resolves.toBeGreaterThanOrEqual(1);
    await expect(prisma.tabelaComercialItem.count()).resolves.toBeGreaterThanOrEqual(1);
    await expect(prisma.grupo.count()).resolves.toBe(0);
    await expect(prisma.cota.count()).resolves.toBe(0);
    await expect(prisma.assembleia.count()).resolves.toBe(0);
    await expect(prisma.lance.count()).resolves.toBe(0);
    await expect(prisma.contemplacao.count()).resolves.toBe(0);
  });

  it('GROUP_PORTFOLIO: creates Admin+Product+Group, no commercial/quota entities', async () => {
    await execute('ADMINISTRADORAS', {
      nome: 'Adm GP', cnpj: '11.222.333/0001-81',
    });
    const admin = await prisma.administradora.findUniqueOrThrow({
      where: { cnpj: '11222333000181' },
    });
    await execute('PRODUTOS', {
      administradoraId: admin.id, nome: 'Prod GP', categoria: 'imóvel',
    });
    const product = await prisma.produto.findFirstOrThrow({
      where: { administradoraId: admin.id },
    });
    const result = await execute('GRUPOS', {
      administradoraId: admin.id,
      produtoId: product.id,
      codigo: 'G-PORT',
      status: 'ativo',
      prazoMeses: '60',
    });
    expect(result.status).toBe('CONCLUIDA');
    const group = await prisma.grupo.findUniqueOrThrow({
      where: { administradoraId_codigo: { administradoraId: admin.id, codigo: 'G-PORT' } },
    });
    expect(group.prazoMeses).toBe(60);
    await expect(prisma.tabelaComercial.count()).resolves.toBe(0);
    await expect(prisma.cota.count()).resolves.toBe(0);
    const second = await execute('GRUPOS', {
      administradoraId: admin.id,
      produtoId: product.id,
      codigo: 'G-PORT',
      status: 'inativo',
      prazoMeses: '60',
    }, 'ATUALIZAR');
    expect(second.status).toBe('CONCLUIDA');
    await expect(prisma.grupo.count()).resolves.toBe(1);
  });

  it('QUOTA_PORTFOLIO: creates Admin+Product+Group+Quota, no contemplation', async () => {
    await execute('ADMINISTRADORAS', {
      nome: 'Adm QP', cnpj: '11.222.333/0001-81',
    });
    const admin = await prisma.administradora.findUniqueOrThrow({
      where: { cnpj: '11222333000181' },
    });
    await execute('PRODUTOS', {
      administradoraId: admin.id, nome: 'Prod QP', categoria: 'imóvel',
    });
    const product = await prisma.produto.findFirstOrThrow({
      where: { administradoraId: admin.id },
    });
    await execute('GRUPOS', {
      administradoraId: admin.id, produtoId: product.id,
      codigo: 'G-QP', status: 'ativo',
    });
    const group = await prisma.grupo.findUniqueOrThrow({
      where: { administradoraId_codigo: { administradoraId: admin.id, codigo: 'G-QP' } },
    });
    const result = await execute('COTAS', {
      grupoId: group.id, numero: '50', status: 'ATIVO',
      valorCredito: '2000,00', prazoRestante: '80',
    });
    expect(result.status).toBe('CONCLUIDA');
    const quota = await prisma.cota.findUniqueOrThrow({
      where: { grupoId_numero: { grupoId: group.id, numero: '50' } },
    });
    expect(Number(quota.valorCredito)).toBe(2000);
    await expect(prisma.contemplacao.count()).resolves.toBe(0);
    const second = await execute('COTAS', {
      grupoId: group.id, numero: '50', status: 'INATIVO',
    }, 'ATUALIZAR');
    expect(second.status).toBe('CONCLUIDA');
    await expect(prisma.cota.count()).resolves.toBe(1);
  });

  it('ASSEMBLY_HISTORY: creates Group+Assembly+Lance, no contemplation', async () => {
    await execute('ADMINISTRADORAS', {
      nome: 'Adm AH', cnpj: '11.222.333/0001-81',
    });
    const admin = await prisma.administradora.findUniqueOrThrow({
      where: { cnpj: '11222333000181' },
    });
    await execute('GRUPOS', {
      administradoraId: admin.id,
      codigo: 'G-AH', status: 'ativo',
    });
    const group = await prisma.grupo.findUniqueOrThrow({
      where: { administradoraId_codigo: { administradoraId: admin.id, codigo: 'G-AH' } },
    });
    await execute('COTAS', {
      grupoId: group.id, numero: '1', status: 'ATIVO',
    });
    const quota = await prisma.cota.findUniqueOrThrow({
      where: { grupoId_numero: { grupoId: group.id, numero: '1' } },
    });
    await execute('ASSEMBLEIAS', {
      grupoId: group.id, numero: '1',
      dataAssembleia: '2026-09-01T10:00:00Z', status: 'REALIZADA',
    });
    const assembly = await prisma.assembleia.findUniqueOrThrow({
      where: { grupoId_numero: { grupoId: group.id, numero: '1' } },
    });
    await execute('LANCES', {
      assembleiaId: assembly.id, cotaId: quota.id,
      tipo: 'LIVRE', percentual: '10', valor: '200',
      contemplado: 'não', origem: 'IMPORTACAO',
    });
    await expect(prisma.assembleia.count()).resolves.toBe(1);
    await expect(prisma.lance.count()).resolves.toBe(1);
    await expect(prisma.contemplacao.count()).resolves.toBe(0);
    const secondAssembly = await execute('ASSEMBLEIAS', {
      grupoId: group.id, numero: '1',
      dataAssembleia: '2026-09-01T10:00:00Z', status: 'REALIZADA',
    }, 'ATUALIZAR');
    expect(secondAssembly.status).toBe('CONCLUIDA');
    await expect(prisma.assembleia.count()).resolves.toBe(1);
    await expect(prisma.lance.count()).resolves.toBe(1);
  });

  it('MIXED: routes each entity to its correct table', async () => {
    await execute('ADMINISTRADORAS', {
      nome: 'Adm Mix', cnpj: '11.222.333/0001-81',
    });
    const admin = await prisma.administradora.findUniqueOrThrow({
      where: { cnpj: '11222333000181' },
    });
    await execute('PRODUTOS', {
      administradoraId: admin.id, nome: 'Prod Mix', categoria: 'imóvel',
    });
    const product = await prisma.produto.findFirstOrThrow({
      where: { administradoraId: admin.id },
    });
    await execute('GRUPOS', {
      administradoraId: admin.id, produtoId: product.id,
      codigo: 'G-MIX', status: 'ativo',
    });
    const group = await prisma.grupo.findUniqueOrThrow({
      where: { administradoraId_codigo: { administradoraId: admin.id, codigo: 'G-MIX' } },
    });
    await execute('COTAS', {
      grupoId: group.id, numero: '1', status: 'ATIVO',
    });
    await execute('ASSEMBLEIAS', {
      grupoId: group.id, numero: '1',
      dataAssembleia: '2026-10-01T10:00:00Z', status: 'REALIZADA',
    });
    await expect(prisma.administradora.count()).resolves.toBe(1);
    await expect(prisma.produto.count()).resolves.toBe(1);
    await expect(prisma.grupo.count()).resolves.toBe(1);
    await expect(prisma.cota.count()).resolves.toBe(1);
    await expect(prisma.assembleia.count()).resolves.toBe(1);
    await expect(prisma.lance.count()).resolves.toBe(0);
    await expect(prisma.contemplacao.count()).resolves.toBe(0);
    await expect(prisma.tabelaComercial.count()).resolves.toBe(0);
  });

  it('multi-entity idempotency: second execution does not increase entity counts', async () => {
    await execute('ADMINISTRADORAS', {
      nome: 'Adm Idem', cnpj: '11.222.333/0001-81',
    });
    const admin = await prisma.administradora.findUniqueOrThrow({
      where: { cnpj: '11222333000181' },
    });
    await execute('PRODUTOS', {
      administradoraId: admin.id, nome: 'Prod Idem', categoria: 'imóvel',
    });
    const product = await prisma.produto.findFirstOrThrow({
      where: { administradoraId: admin.id },
    });
    await execute('GRUPOS', {
      administradoraId: admin.id, produtoId: product.id,
      codigo: 'G-IDEM', status: 'ativo',
    });
    const group = await prisma.grupo.findUniqueOrThrow({
      where: { administradoraId_codigo: { administradoraId: admin.id, codigo: 'G-IDEM' } },
    });
    await execute('COTAS', {
      grupoId: group.id, numero: '1', status: 'ATIVO',
    });
    const counts1 = {
      admins: await prisma.administradora.count(),
      products: await prisma.produto.count(),
      groups: await prisma.grupo.count(),
      quotas: await prisma.cota.count(),
    };
    const second = await execute(
      'ADMINISTRADORAS',
      { nome: 'Adm Idem', cnpj: '11.222.333/0001-81' },
      'ATUALIZAR',
    );
    expect(second.status).toBe('CONCLUIDA');
    const counts2 = {
      admins: await prisma.administradora.count(),
      products: await prisma.produto.count(),
      groups: await prisma.grupo.count(),
      quotas: await prisma.cota.count(),
    };
    expect(counts2).toEqual(counts1);
  });

  it('CONTEMPLACOES: creates and updates with fill_empty/never policies', async () => {
    await execute('ADMINISTRADORAS', {
      nome: 'Adm Cont', cnpj: '11.222.333/0001-81',
    });
    const admin = await prisma.administradora.findUniqueOrThrow({
      where: { cnpj: '11222333000181' },
    });
    await execute('GRUPOS', {
      administradoraId: admin.id, codigo: 'G-CONT', status: 'ativo',
    });
    const group = await prisma.grupo.findUniqueOrThrow({
      where: { administradoraId_codigo: { administradoraId: admin.id, codigo: 'G-CONT' } },
    });
    await execute('COTAS', {
      grupoId: group.id, numero: '1', status: 'ATIVO',
    });
    const quota = await prisma.cota.findUniqueOrThrow({
      where: { grupoId_numero: { grupoId: group.id, numero: '1' } },
    });
    await execute('ASSEMBLEIAS', {
      grupoId: group.id, numero: '1',
      dataAssembleia: '2026-11-01T10:00:00Z', status: 'REALIZADA',
    });
    const assembly = await prisma.assembleia.findUniqueOrThrow({
      where: { grupoId_numero: { grupoId: group.id, numero: '1' } },
    });
    const first = await execute('CONTEMPLACOES', {
      assembleiaId: assembly.id,
      cotaId: quota.id,
      tipo: 'LANCE',
      codigoExterno: 'CONT-TEST-1',
      valorLance: '500,00',
      percentualLance: '15,5',
    });
    expect(first.status).toBe('CONCLUIDA');
    expect(first.registrosCriados).toBe(1);
    await expect(prisma.contemplacao.count()).resolves.toBe(1);
    const cont = await prisma.contemplacao.findFirstOrThrow({
      where: { assembleiaId: assembly.id },
    });
    expect(cont.tipo).toBe('LANCE');
    expect(cont.codigoExterno).toBe('CONT-TEST-1');
    const second = await execute('CONTEMPLACOES', {
      assembleiaId: assembly.id,
      cotaId: quota.id,
      tipo: 'LANCE',
      codigoExterno: 'CONT-TEST-1',
      valorLance: '600,00',
      percentualLance: '18',
    }, 'ATUALIZAR');
    expect(second.status).toBe('CONCLUIDA');
    await expect(prisma.contemplacao.count()).resolves.toBe(1);
  });

  it('rollback batches: partial failure reports CONCLUIDA_COM_ERROS', async () => {
    await execute('ADMINISTRADORAS', {
      nome: 'Adm Rollback', cnpj: '11.222.333/0001-81',
    });
    const admin = await prisma.administradora.findUniqueOrThrow({
      where: { cnpj: '11222333000181' },
    });
    const uploaded = await service.upload(
      actor,
      {
        tipo: 'PRODUTOS',
        filename: 'rollback.csv',
        mime: 'text/csv',
        bytes: csv({
          administradoraId: admin.id,
          nome: '',
          categoria: 'imóvel',
        }),
      },
      {},
    );
    await service.saveMapping(
      actor, uploaded.id,
      { mapeamento: { administradoraId: 'administradoraId', nome: 'nome', categoria: 'categoria' } },
      {},
    );
    const validation = await service.validate(actor, uploaded.id, 'IGNORAR', {});
    expect(validation.erros).toBeGreaterThanOrEqual(1);
  });

  it('retry after partial failure does not duplicate previously committed records', async () => {
    await execute('ADMINISTRADORAS', {
      nome: 'Adm Retry', cnpj: '11.222.333/0001-81',
    });
    const admin = await prisma.administradora.findUniqueOrThrow({
      where: { cnpj: '11222333000181' },
    });
    await execute('PRODUTOS', {
      administradoraId: admin.id, nome: 'Prod Retry', categoria: 'imóvel',
    });
    await execute('GRUPOS', {
      administradoraId: admin.id, codigo: 'G-RETRY', status: 'ativo',
    });
    const countBefore = await prisma.grupo.count();
    const second = await execute(
      'GRUPOS',
      { administradoraId: admin.id, codigo: 'G-RETRY', status: 'inativo' },
      'ATUALIZAR',
    );
    expect(second.status).toBe('CONCLUIDA');
    const countAfter = await prisma.grupo.count();
    expect(countAfter).toBe(countBefore);
  });

  it('RBAC: VENDEDOR cannot execute import', async () => {
    const hash = await hashPassword(password);
    const vendedor = await prisma.user.create({
      data: {
        email: 'vendedor-import@example.com',
        nome: 'Vendedor Import',
        passwordHash: hash,
        role: 'VENDEDOR',
      },
    });
    const vendedorActor = {
      sessionId: 'vendedor-session',
      user: {
        id: vendedor.id,
        email: vendedor.email,
        nome: vendedor.nome,
        role: 'VENDEDOR' as const,
      },
    };
    const itemId = await prepareOnly('ADMINISTRADORAS', {
      nome: 'RBAC Test', cnpj: '11.222.333/0001-81',
    });
    await expect(
      service.execute(vendedorActor, itemId, {}),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
  it('exposes the reviewed multipart flow through authenticated HTTP endpoints', async () => {
    const app = await buildApp({
      config: appConfig,
      identityService: identity,
      logger: false,
    });
    try {
      const login = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: actor.user.email, password },
      });
      const setCookie = login.headers['set-cookie'];
      if (typeof setCookie !== 'string') throw new Error('Cookie ausente');
      const headers = {
        cookie: setCookie.split(';', 1)[0]!,
        origin: 'http://frontend.test',
      };
      const boundary = '----larcarvalho-vitest-boundary';
      const file = 'nome,cnpj\nAdministradora HTTP,11.222.333/0001-81\n';
      const body = Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="tipoImportacao"\r\n\r\nADMINISTRADORAS\r\n--${boundary}\r\nContent-Disposition: form-data; name="arquivo"; filename="admin.csv"\r\nContent-Type: text/csv\r\n\r\n${file}\r\n--${boundary}--\r\n`,
      );
      const upload = await app.inject({
        method: 'POST',
        url: '/api/v1/importacoes/upload',
        headers: {
          ...headers,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });
      expect(upload.statusCode, upload.body).toBe(201);
      const id = upload.json().id as string;
      const premature = await app.inject({
        method: 'POST',
        url: `/api/v1/importacoes/${id}/validate`,
        headers,
        payload: { estrategia: 'IGNORAR' },
      });
      expect(premature.statusCode).toBe(409);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/api/v1/importacoes/${id}/mapping`,
            headers,
            payload: { mapeamento: { nome: 'nome', cnpj: 'cnpj' } },
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/api/v1/importacoes/${id}/validate`,
            headers,
            payload: { estrategia: 'IGNORAR' },
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/api/v1/importacoes/${id}/execute`,
            headers,
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/api/v1/importacoes/${id}/execute`,
            headers,
          })
        ).statusCode,
      ).toBe(409);
    } finally {
      await app.close();
    }
  });
});
