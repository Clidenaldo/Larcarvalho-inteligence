import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '../../src/config/load-env.js';
import { parseEnvironment, type AppConfig } from '../../src/config/env.js';
import type { AuthContext } from '../../src/core/auth/auth-context.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createPrismaClient } from '../../src/infrastructure/database/prisma-client.js';
import { wipeSalesData } from './clean-vendas.js';
import { DataQualityService } from '../../src/modules/data-quality/data-quality.service.js';
import { IdentityService } from '../../src/modules/identity/identity.service.js';
const url = process.env.TEST_DATABASE_URL;
const run = url ? describe : describe.skip;
const password = 'frase senha inicial segura';
run('data quality workflow with PostgreSQL', () => {
  let prisma: PrismaClient;
  let config: AppConfig;
  let identity: IdentityService;
  let service: DataQualityService;
  let actor: AuthContext;
  async function clean() {
    await wipeSalesData(prisma);
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
      DATABASE_URL: url,
      DATABASE_POOL_MAX: '3',
      FRONTEND_URL: 'http://frontend.test',
      LOG_LEVEL: 'silent',
      NODE_ENV: 'test',
    });
    prisma = createPrismaClient(config);
    identity = new IdentityService(prisma, config);
    service = new DataQualityService(prisma);
  });
  beforeEach(async () => {
    await clean();
    const user = await identity.createFirstSuperAdmin({
      email: 'quality@example.com',
      nome: 'Quality Admin',
      password,
    });
    actor = {
      sessionId: 'quality-test',
      user: {
        id: user.id,
        email: user.email,
        nome: user.nome,
        role: user.role,
      },
    };
  });
  afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });
  it('scans in a deduplicated way and auto-resolves only internal issues', async () => {
    const admin = await prisma.administradora.create({
      data: { nome: 'Inativa', ativa: false },
    });
    const product = await prisma.produto.create({
      data: {
        administradoraId: admin.id,
        nome: 'Produto ativo',
        categoria: 'IMOVEL',
        ativo: true,
      },
    });
    const first = await service.scan(actor, {});
    expect(first.registrosAvaliados).toBe(1);
    expect(first.issuesNovas).toBe(1);
    const issue = await prisma.dataQualityIssue.findFirstOrThrow({
      where: { origem: 'VALIDACAO_INTERNA' },
    });
    const second = await service.scan(actor, {});
    expect(second.issuesNovas).toBe(0);
    expect(second.issuesExistentes).toBe(1);
    await prisma.produto.update({
      where: { id: product.id },
      data: { ativo: false },
    });
    const third = await service.scan(actor, {});
    expect(third.resolvidasAutomaticamente).toBe(1);
    await expect(
      prisma.dataQualityIssue.findUniqueOrThrow({ where: { id: issue.id } }),
    ).resolves.toMatchObject({
      status: 'RESOLVED',
      resolutionAction: 'AUTO_RESOLVED_BY_REVALIDATION',
    });
    const manual = await service.createManual(
      actor,
      {
        entidade: 'Produto',
        entidadeId: product.id,
        severidade: 'INFO',
        mensagem: 'Confirmar descrição junto à administradora',
      },
      {},
    );
    await service.scan(actor, {});
    await expect(
      prisma.dataQualityIssue.findUniqueOrThrow({ where: { id: manual.id } }),
    ).resolves.toMatchObject({ status: 'OPEN', origem: 'AUDITORIA_MANUAL' });
  });
  it('supports review, resolve, reopen, ignore, filters, summary and audit', async () => {
    const admin = await prisma.administradora.create({
      data: { nome: 'Manual' },
    });
    const issue = await service.createManual(
      actor,
      {
        entidade: 'Administradora',
        entidadeId: admin.id,
        severidade: 'ERROR',
        mensagem: 'Cadastro precisa de confirmação',
        campo: 'nome',
      },
      {},
    );
    expect(
      (await service.review(actor, issue.id, 'Em validação', {})).status,
    ).toBe('IN_REVIEW');
    expect(
      (
        await service.resolve(
          actor,
          issue.id,
          'Cadastro conferido',
          'Fonte interna',
          {},
        )
      ).status,
    ).toBe('RESOLVED');
    expect(
      (await service.reopen(actor, issue.id, 'Nova dúvida', {})).status,
    ).toBe('OPEN');
    expect(
      (await service.ignore(actor, issue.id, 'Confirmado como válido', {}))
        .status,
    ).toBe('IGNORED');
    expect((await service.reopen(actor, issue.id, undefined, {})).status).toBe(
      'OPEN',
    );
    const list = await service.list(actor, {
      page: 1,
      pageSize: 20,
      status: 'OPEN',
      severidade: 'ERROR',
      origem: 'AUDITORIA_MANUAL',
      administradoraId: admin.id,
    });
    expect(list.total).toBe(1);
    expect(list.items[0]?.contexto.titulo).toBe('Manual');
    const summary = await service.summary(actor);
    expect(summary.abertas).toBe(1);
    expect(summary.erros).toBe(1);
    await expect(
      prisma.auditLog.count({
        where: { entity: 'DataQualityIssue', entityId: issue.id },
      }),
    ).resolves.toBe(6);
  });
  it('detects a relationship mismatch that foreign keys alone allow', async () => {
    const admin = await prisma.administradora.create({
      data: { nome: 'Relações' },
    });
    const g1 = await prisma.grupo.create({
      data: { administradoraId: admin.id, codigo: 'G1', status: 'ATIVO' },
    });
    const g2 = await prisma.grupo.create({
      data: { administradoraId: admin.id, codigo: 'G2', status: 'ATIVO' },
    });
    const quota = await prisma.cota.create({
      data: { grupoId: g2.id, numero: '1', status: 'ATIVO' },
    });
    const assembly = await prisma.assembleia.create({
      data: {
        grupoId: g1.id,
        numero: '1',
        dataAssembleia: new Date(),
        status: 'REALIZADA',
      },
    });
    await prisma.lance.create({
      data: {
        assembleiaId: assembly.id,
        cotaId: quota.id,
        tipo: 'LIVRE',
        origem: 'IMPORTACAO',
      },
    });
    const result = await service.scan(actor, {});
    expect(result.issuesNovas).toBe(1);
    await expect(
      prisma.dataQualityIssue.findFirstOrThrow({
        where: { codigo: 'RELATIONSHIP_MISMATCH' },
      }),
    ).resolves.toMatchObject({ severidade: 'CRITICAL', grupoId: g1.id });
  });
});
