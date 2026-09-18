import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '../../src/config/load-env.js';
import { assertE2eDatabase } from '../../src/config/e2e-safety.js';
import { parseEnvironment, type AppConfig } from '../../src/config/env.js';
import type { AuthContext } from '../../src/core/auth/auth-context.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createPrismaClient } from '../../src/infrastructure/database/prisma-client.js';
import { IdentityService } from '../../src/modules/identity/identity.service.js';
import { SalesService } from '../../src/modules/sales/sales.service.js';
import { SaleContractsService } from '../../src/modules/sales/contracts.service.js';
import { CommissionsService } from '../../src/modules/sales/commissions.service.js';
import { PortfolioService } from '../../src/modules/portfolio/portfolio.service.js';
import { LeadsService } from '../../src/modules/leads/leads.service.js';
import { FollowUpsService } from '../../src/modules/follow-ups/follow-ups.service.js';
import { randomUUID } from 'node:crypto';
import { simulationResultSchema } from '@larcarvalho/shared';

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

run('Sales, contracts and commissions with PostgreSQL', () => {
  let prisma: PrismaClient;
  let appConfig: AppConfig;
  let identity: IdentityService;
  let sales: SalesService;
  let contracts: SaleContractsService;
  let commissions: CommissionsService;
  let vendedor: AuthContext;
  let gestor: AuthContext;
  let admin: AuthContext;
  let outsider: AuthContext;

  beforeAll(async () => {
    assertE2eDatabase('true', url);
    appConfig = config();
    prisma = createPrismaClient(appConfig);
    const databases = await prisma.$queryRaw<
      { name: string }[]
    >`SELECT current_database() AS name`;
    if (databases[0]?.name !== 'larcarvalho_test')
      throw new Error('Unsafe integration database');
    identity = new IdentityService(prisma, appConfig);
    sales = new SalesService(prisma);
    contracts = new SaleContractsService(prisma);
    commissions = new CommissionsService(prisma);
  });

  async function wipe() {
    await prisma.commission.deleteMany();
    await prisma.commissionRule.deleteMany();
    await prisma.saleDocument.deleteMany();
    await prisma.saleContract.deleteMany();
    await prisma.saleStatusHistory.deleteMany();
    await prisma.sale.deleteMany();
    await prisma.saleSequence.deleteMany();
    await prisma.team.deleteMany();
    await prisma.proposalStatusHistory.deleteMany();
    await prisma.proposalItem.deleteMany();
    await prisma.proposal.deleteMany();
    await prisma.simulation.deleteMany();
    await prisma.followUp.deleteMany();
    await prisma.leadInteracao.deleteMany();
    await prisma.leadInteresse.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.session.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.user.deleteMany();
  }
  beforeEach(async () => {
    await wipe();
    await identity.createFirstSuperAdmin({
      email: 'root-sales@example.com',
      nome: 'Root Sales',
      password,
    });
    const makeUser = async (
      email: string,
      nome: string,
      role: 'VENDEDOR' | 'GESTOR' | 'ADMIN',
    ) => {
      const created = await prisma.user.create({
        data: {
          email,
          nome,
          passwordHash: 'x',
          role,
        },
        select: { id: true, email: true, nome: true, role: true },
      });
      return {
        sessionId: `${role}-session`,
        user: {
          id: created.id,
          email: created.email,
          nome: created.nome,
          role: created.role,
        },
      } as AuthContext;
    };
    vendedor = await makeUser(
      'vendedor-sales@example.com',
      'Vendedor',
      'VENDEDOR',
    );
    gestor = await makeUser('gestor-sales@example.com', 'Gestor', 'GESTOR');
    admin = await makeUser('admin-sales@example.com', 'Admin', 'ADMIN');
    outsider = await makeUser(
      'outsider-sales@example.com',
      'Outsider',
      'VENDEDOR',
    );
    const team = await prisma.team.create({
      data: { name: 'Equipe Vendas', managerId: gestor.user.id },
    });
    await prisma.user.updateMany({
      where: { id: { in: [vendedor.user.id, gestor.user.id] } },
      data: { teamId: team.id },
    });
    vendedor = { ...vendedor, teamIds: [team.id] };
    gestor = { ...gestor, teamIds: [team.id] };
    const otherTeam = await prisma.team.create({ data: { name: 'Equipe B' } });
    await prisma.user.update({
      where: { id: outsider.user.id },
      data: { teamId: otherTeam.id },
    });
    outsider = { ...outsider, teamIds: [otherTeam.id] };
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function fixtureProposal(
    owner: AuthContext,
    status: 'ACCEPTED' | 'SENT' = 'ACCEPTED',
  ) {
    const lead = await prisma.lead.create({
      data: {
        nome: 'Cliente Venda',
        origem: 'CADASTRO_MANUAL',
        status: 'NEGOCIACAO',
        responsavelId: owner.user.id,
        emailNormalizado: 'cliente.venda@example.com',
      },
    });
    const simulation = await prisma.simulation.create({
      data: {
        number: `SIM-${randomUUID().slice(0, 24)}`,
        createdById: owner.user.id,
        leadId: lead.id,
        category: 'IMOVEL',
        creditMode: 'CONTRACTED_CREDIT',
        requestedCredit: '150000.00',
        desiredTermMonths: 120,
      },
    });
    const proposal = await prisma.proposal.create({
      data: {
        number: `PROP-${randomUUID().slice(0, 24)}`,
        simulationId: simulation.id,
        createdById: owner.user.id,
        leadId: lead.id,
        status,
        title: 'Proposta teste',
        objectiveSummary:
          'Avaliar crédito para aquisição de imóvel com dez caracteres.',
        snapshot: {},
        validUntil: new Date(Date.now() + 86_400_000),
        items: {
          create: [
            {
              position: 1,
              description: 'Adm X - Produto Y',
              financialSnapshot: {
                administratorId: null,
                administratorName: 'Adm X',
                productName: 'Produto Y',
                contractedCredit: '150000.00',
                firstInstallment: '1800.00',
                termMonths: 120,
                administrationFee: '10.00',
              },
            },
          ],
        },
      },
      include: { items: true },
    });
    return { lead, proposal, item: proposal.items[0]! };
  }

  async function fixtureSale(owner: AuthContext = vendedor) {
    const { proposal, item } = await fixtureProposal(owner);
    return sales.createFromProposal(
      owner,
      { proposalId: proposal.id, proposalItemId: item.id, origemVenda: 'CRM' },
      {},
    );
  }

  it('creates a sale from an accepted proposal with frozen snapshot', async () => {
    const { proposal, item } = await fixtureProposal(vendedor);
    const sale = await sales.createFromProposal(
      vendedor,
      { proposalId: proposal.id, proposalItemId: item.id, origemVenda: 'CRM' },
      {},
    );
    expect(sale.numero).toMatch(/^VEN-\d{4}-\d{6}$/);
    expect(sale.status).toBe('RASCUNHO');
    expect(sale.valorCreditoContratado).toBe('150000.00');
    expect(sale.snapshot).toMatchObject({
      credito: '150000.00',
      propostaNumero: proposal.number,
    });
    expect(sale.responsavelUserId).toBe(vendedor.user.id);
    const detail = await sales.get(vendedor, sale.id);
    expect(detail.documents).toHaveLength(6);
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'SALE_CREATED', entityId: sale.id },
    });
    expect(audit).not.toBeNull();
  });

  it('assigns distinct numbers to concurrent sales', async () => {
    const fixtures = [];
    for (let index = 0; index < 8; index++)
      fixtures.push(await fixtureProposal(vendedor));
    const results = await Promise.all(
      fixtures.map(({ proposal, item }) =>
        sales.createFromProposal(
          vendedor,
          {
            proposalId: proposal.id,
            proposalItemId: item.id,
            origemVenda: 'CRM',
          },
          {},
        ),
      ),
    );
    expect(new Set(results.map((sale) => sale.numero)).size).toBe(8);
    expect(await prisma.sale.count()).toBe(8);
    expect((await prisma.saleSequence.findFirstOrThrow()).lastNumber).toBe(8);
  });

  it('rejects sale creation from non-accepted proposal and duplicate items', async () => {
    const { proposal, item } = await fixtureProposal(vendedor, 'SENT');
    await expect(
      sales.createFromProposal(
        vendedor,
        {
          proposalId: proposal.id,
          proposalItemId: item.id,
          origemVenda: 'CRM',
        },
        {},
      ),
    ).rejects.toMatchObject({ code: 'SALE_CONFLICT' });
    await prisma.proposal.update({
      where: { id: proposal.id },
      data: { status: 'ACCEPTED' },
    });
    await sales.createFromProposal(
      vendedor,
      { proposalId: proposal.id, proposalItemId: item.id, origemVenda: 'CRM' },
      {},
    );
    await expect(
      sales.createFromProposal(
        vendedor,
        {
          proposalId: proposal.id,
          proposalItemId: item.id,
          origemVenda: 'CRM',
        },
        {},
      ),
    ).rejects.toMatchObject({ code: 'SALE_CONFLICT' });
  });

  it('enforces the status machine and stamps dates', async () => {
    const sale = await fixtureSale();
    await expect(
      sales.changeStatus(vendedor, sale.id, { status: 'CONTRATADA' }, {}),
    ).rejects.toMatchObject({ code: 'SALE_CONFLICT' });
    const step1 = await sales.changeStatus(
      vendedor,
      sale.id,
      { status: 'AGUARDANDO_DOCUMENTOS' },
      {},
    );
    expect(step1.dataVenda).not.toBeNull();
    await sales.changeStatus(
      vendedor,
      sale.id,
      { status: 'DOCUMENTOS_RECEBIDOS' },
      {},
    );
    await sales.changeStatus(
      vendedor,
      sale.id,
      { status: 'ENVIADA_ADMINISTRADORA' },
      {},
    );
    const sent = await sales.get(vendedor, sale.id);
    expect(sent.dataEnvioAdministradora).not.toBeNull();
    await sales.changeStatus(vendedor, sale.id, { status: 'EM_ANALISE' }, {});
    await sales.changeStatus(vendedor, sale.id, { status: 'APROVADA' }, {});
    const done = await sales.changeStatus(
      vendedor,
      sale.id,
      { status: 'CONTRATADA' },
      {},
    );
    expect(done.status).toBe('CONTRATADA');
    expect(done.dataContratacao).not.toBeNull();
    await expect(
      sales.changeStatus(vendedor, sale.id, { status: 'CANCELADA' }, {}),
    ).rejects.toMatchObject({ code: 'SALE_CONFLICT' });
  });

  it('detects concurrent modification via expectedUpdatedAt', async () => {
    const sale = await fixtureSale();
    await expect(
      sales.changeStatus(
        vendedor,
        sale.id,
        {
          status: 'AGUARDANDO_DOCUMENTOS',
          expectedUpdatedAt: new Date(2000, 0, 1).toISOString(),
        },
        {},
      ),
    ).rejects.toMatchObject({ code: 'SALE_CONFLICT' });
  });

  it('transfers responsibility with audit and scope check', async () => {
    const sale = await fixtureSale();
    const moved = await sales.assign(
      admin,
      sale.id,
      { responsavelUserId: gestor.user.id, motivo: ' Redistribuição' },
      {},
    );
    expect(moved.responsavelUserId).toBe(gestor.user.id);
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'SALE_ASSIGNED', entityId: sale.id },
    });
    expect(audit).not.toBeNull();
    expect((audit!.metadata as Record<string, unknown>).de).toBe(
      vendedor.user.id,
    );
    await expect(
      sales.assign(
        vendedor,
        sale.id,
        { responsavelUserId: gestor.user.id },
        {},
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('applies OWN/TEAM/ALL scopes', async () => {
    const sale = await fixtureSale();
    expect((await sales.get(vendedor, sale.id)).id).toBe(sale.id);
    const asGestor = await sales.get(gestor, sale.id);
    expect(asGestor.id).toBe(sale.id);
    const listed = await sales.list(gestor, { page: 1, pageSize: 20 });
    expect(listed.total).toBe(1);
    const other = await fixtureSale(outsider);
    await expect(sales.get(gestor, other.id)).rejects.toMatchObject({
      code: 'SALE_NOT_FOUND',
    });
    await expect(sales.get(vendedor, other.id)).rejects.toMatchObject({
      code: 'SALE_NOT_FOUND',
    });
    const asAdmin = await sales.get(admin, other.id);
    expect(asAdmin.id).toBe(other.id);
    const root = await prisma.user.findUniqueOrThrow({
      where: { email: 'root-sales@example.com' },
    });
    const superAdmin: AuthContext = {
      sessionId: 'root-session',
      user: {
        id: root.id,
        email: root.email,
        nome: root.nome,
        role: root.role,
      },
    };
    expect((await sales.get(superAdmin, other.id)).id).toBe(other.id);
  });

  it('manages contracts without inventing numbers', async () => {
    const sale = await fixtureSale();
    const contract = await contracts.create(vendedor, sale.id, {}, {});
    expect(contract.statusContrato).toBe('RASCUNHO');
    expect(contract.numeroContrato).toBeNull();
    await expect(
      contracts.create(vendedor, sale.id, {}, {}),
    ).rejects.toMatchObject({ code: 'CONTRACT_CONFLICT' });
    const emitted = await contracts.update(
      vendedor,
      contract.id,
      { statusContrato: 'EMITIDO', numeroContrato: 'ADM-2026-1' },
      {},
    );
    expect(emitted.numeroContrato).toBe('ADM-2026-1');
    await expect(
      contracts.update(vendedor, contract.id, { statusContrato: 'ATIVO' }, {}),
    ).rejects.toMatchObject({ code: 'CONTRACT_CONFLICT' });
  });

  it('updates document checklist with references only', async () => {
    const sale = await fixtureSale();
    const detail = await sales.get(vendedor, sale.id);
    const cpf = detail.documents.find((d) => d.tipo === 'CPF')!;
    const updated = await sales.updateDocument(
      vendedor,
      sale.id,
      cpf.id,
      { status: 'RECEBIDO', referencia: 'pasta-12/doc-3' },
      {},
    );
    expect(updated.status).toBe('RECEBIDO');
    expect(updated.recebidoEm).not.toBeNull();
  });

  it('creates commission from rule with snapshot and computes value', async () => {
    const sale = await fixtureSale();
    const rule = await commissions.createRule(
      admin,
      {
        administradoraId: (
          await prisma.administradora.create({ data: { nome: 'Adm Comissão' } })
        ).id,
        tipoBase: 'CREDITO',
        percentual: '2.50',
        vigenciaInicio: '2026-01-01',
        ativo: true,
        prioridade: 10,
      },
      {},
    );
    const commission = await commissions.create(
      gestor,
      sale.id,
      {
        tipo: 'PRINCIPAL',
        baseCalculo: 'CREDITO',
        baseValor: sale.valorCreditoContratado,
        competencia: '2026-10',
        regraId: rule.id,
      },
      {},
    );
    expect(commission.valorPrevisto).toBe('3750.00');
    expect(commission.regraSnapshot).toMatchObject({
      percentual: '2.5',
      prioridade: 10,
    });
    await prisma.commissionRule.update({
      where: { id: rule.id },
      data: { percentual: '4.00' },
    });
    const historical = await prisma.commission.findUniqueOrThrow({
      where: { id: commission.id },
    });
    expect(historical.regraSnapshot).toMatchObject({ percentual: '2.5' });
    expect(historical.valorPrevisto.toFixed(2)).toBe('3750.00');

    await expect(
      commissions.create(
        gestor,
        sale.id,
        {
          tipo: 'PRINCIPAL',
          baseCalculo: 'CREDITO',
          baseValor: '100.00',
          valorPrevisto: '2.50',
          competencia: '2026-10',
        },
        {},
      ),
    ).rejects.toMatchObject({ code: 'COMMISSION_CONFLICT' });
  });

  it('confirms without erasing previsto and receives partially then fully', async () => {
    const sale = await fixtureSale();
    const commission = await commissions.create(
      gestor,
      sale.id,
      {
        tipo: 'PRINCIPAL',
        baseCalculo: 'CREDITO',
        baseValor: '200000.00',
        valorPrevisto: '5000.00',
        competencia: '2026-10',
      },
      {},
    );
    const confirmed = await commissions.confirm(
      gestor,
      commission.id,
      { valorConfirmado: '4850.00' },
      {},
    );
    expect(confirmed.status).toBe('CONFIRMADA');
    expect(confirmed.valorPrevisto).toBe('5000.00');
    expect(confirmed.valorConfirmado).toBe('4850.00');
    const partial = await commissions.receive(
      admin,
      commission.id,
      { valorRecebido: '2000.00' },
      {},
    );
    expect(partial.status).toBe('PARCIALMENTE_RECEBIDA');
    expect(partial.valorRecebido).toBe('2000.00');
    const storedPartial = await prisma.commission.findUniqueOrThrow({
      where: { id: commission.id },
    });
    expect(
      storedPartial
        .valorConfirmado!.minus(storedPartial.valorRecebido)
        .toFixed(2),
    ).toBe('2850.00');
    expect(storedPartial.valorPrevisto.toFixed(2)).toBe('5000.00');
    const summary = await commissions.list(admin, {
      saleId: sale.id,
      page: 1,
      pageSize: 20,
    });
    expect(summary.resumo.confirmadas).toBe('4850.00');
    expect(summary.resumo.recebidas).toBe('2000.00');
    expect(summary.resumo.aReceber).toBe('2850.00');
    const full = await commissions.receive(
      admin,
      commission.id,
      { valorRecebido: '2850.00' },
      {},
    );
    expect(full.status).toBe('RECEBIDA');
    expect(full.valorRecebido).toBe('4850.00');
  });

  it('requires justification for over-receive and blocks vendedor receive', async () => {
    const sale = await fixtureSale();
    const commission = await commissions.create(
      gestor,
      sale.id,
      {
        tipo: 'PRINCIPAL',
        baseCalculo: 'CREDITO',
        baseValor: '100000.00',
        valorPrevisto: '1000.00',
        competencia: '2026-10',
      },
      {},
    );
    await commissions.confirm(
      gestor,
      commission.id,
      { valorConfirmado: '1000.00' },
      {},
    );
    await expect(
      commissions.receive(
        vendedor,
        commission.id,
        { valorRecebido: '1000.00' },
        {},
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      commissions.receive(
        admin,
        commission.id,
        { valorRecebido: '1200.00' },
        {},
      ),
    ).rejects.toMatchObject({ code: 'COMMISSION_CONFLICT' });
    const ok = await commissions.receive(
      admin,
      commission.id,
      {
        valorRecebido: '1200.00',
        observacoes: 'Bônus pago a maior pela administradora',
      },
      {},
    );
    expect(ok.status).toBe('RECEBIDA');
  });

  it('reverses received commission preserving history', async () => {
    const sale = await fixtureSale();
    const commission = await commissions.create(
      gestor,
      sale.id,
      {
        tipo: 'PRINCIPAL',
        baseCalculo: 'CREDITO',
        baseValor: '100000.00',
        valorPrevisto: '1000.00',
        competencia: '2026-10',
      },
      {},
    );
    await commissions.confirm(
      gestor,
      commission.id,
      { valorConfirmado: '1000.00' },
      {},
    );
    await commissions.receive(
      admin,
      commission.id,
      { valorRecebido: '1000.00' },
      {},
    );
    const { original, estorno } = await commissions.reverse(
      admin,
      commission.id,
      { motivo: 'CANCELAMENTO_VENDA' },
      {},
    );
    expect(original.status).toBe('ESTORNADA');
    expect(original.valorRecebido).toBe('1000.00');
    const reversalAudit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'COMMISSION_REVERSED', entityId: commission.id },
    });
    expect(reversalAudit.metadata).toMatchObject({
      motivo: 'CANCELAMENTO_VENDA',
    });
    expect(estorno.tipo).toBe('ESTORNO');
    expect(estorno.estornoDeId).toBe(commission.id);
    expect(estorno.valorPrevisto).toBe('1000.00');
    const count = await prisma.commission.count({ where: { saleId: sale.id } });
    expect(count).toBe(2);
  });

  it('cancels sale preserving it and open commissions, blocking received ones', async () => {
    const sale = await fixtureSale();
    const commission = await commissions.create(
      gestor,
      sale.id,
      {
        tipo: 'PRINCIPAL',
        baseCalculo: 'CREDITO',
        baseValor: '100000.00',
        valorPrevisto: '1000.00',
        competencia: '2026-10',
      },
      {},
    );
    const cancelled = await sales.cancel(
      vendedor,
      sale.id,
      { motivo: 'CLIENTE_DESISTIU' },
      {},
    );
    expect(cancelled.status).toBe('CANCELADA');
    expect(cancelled.dataCancelamento).not.toBeNull();
    const comm = await prisma.commission.findUniqueOrThrow({
      where: { id: commission.id },
    });
    expect(comm.status).toBe('CANCELADA');
    const stillThere = await prisma.sale.findUnique({ where: { id: sale.id } });
    expect(stillThere).not.toBeNull();

    const sale2 = await fixtureSale();
    const comm2 = await commissions.create(
      gestor,
      sale2.id,
      {
        tipo: 'PRINCIPAL',
        baseCalculo: 'CREDITO',
        baseValor: '100000.00',
        valorPrevisto: '1000.00',
        competencia: '2026-10',
      },
      {},
    );
    await commissions.confirm(
      gestor,
      comm2.id,
      { valorConfirmado: '1000.00' },
      {},
    );
    await commissions.receive(
      admin,
      comm2.id,
      { valorRecebido: '1000.00' },
      {},
    );
    await expect(
      sales.cancel(vendedor, sale2.id, { motivo: 'CLIENTE_DESISTIU' }, {}),
    ).rejects.toMatchObject({ code: 'SALE_CONFLICT' });
  });

  it('shows sale in customer timeline and hides commissions without permission', async () => {
    await fixtureProposal(vendedor);
    const sale = await fixtureSale(vendedor);
    const historyCount = await prisma.saleStatusHistory.count({
      where: { saleId: sale.id },
    });
    expect(historyCount).toBeGreaterThanOrEqual(1);
    const detailVendor = await sales.get(vendedor, sale.id);
    expect(detailVendor.commissionsHidden).toBe(false);
    expect(detailVendor.commissions).toEqual([]);
    const restricted: AuthContext = {
      ...admin,
      permissionOverrides: [{ permission: 'commissions.read', effect: 'DENY' }],
    };
    const detailRestricted = await sales.get(restricted, sale.id);
    expect(detailRestricted.commissionsHidden).toBe(true);
    expect(detailRestricted.commissions).toEqual([]);
    await commissions.create(
      gestor,
      sale.id,
      {
        tipo: 'PRINCIPAL',
        baseCalculo: 'CREDITO',
        baseValor: '150000.00',
        valorPrevisto: '3750.00',
        competencia: '2026-10',
      },
      {},
    );
    const portfolio = new PortfolioService(
      prisma,
      new LeadsService(prisma),
      new FollowUpsService(prisma),
    );
    const timeline = await portfolio.timeline(admin, sale.leadId, 1, 100);
    expect(
      timeline.items.some(
        (item) =>
          item.kind === 'SALE_CREATED' && item.summary.includes(sale.numero),
      ),
    ).toBe(true);
    expect(timeline.items.some((item) => item.origin === 'commission')).toBe(
      true,
    );
    const hidden = await portfolio.timeline(restricted, sale.leadId, 1, 100);
    expect(hidden.items.some((item) => item.origin === 'commission')).toBe(
      false,
    );
    expect(JSON.stringify(hidden)).not.toContain('3750');
  });

  it('preserves the exact selected item and the complete original proposal in PostgreSQL', async () => {
    const { proposal, item } = await fixtureProposal(vendedor);
    const chosen = await prisma.proposalItem.create({
      data: {
        proposalId: proposal.id,
        position: 2,
        description: 'Chosen second item',
        financialSnapshot: {
          ...(item.financialSnapshot as Record<string, unknown>),
          contractedCredit: '234567.89',
          firstInstallment: '2345.67',
          termMonths: 137,
          administrationFee: '17.43',
          reserveFund: '1.23',
          insurance: '0.42',
          adherenceScore: 82,
        },
      },
    });
    const before = await prisma.proposal.findUniqueOrThrow({
      where: { id: proposal.id },
      include: { items: { orderBy: { position: 'asc' } } },
    });
    const sale = await sales.createFromProposal(
      vendedor,
      {
        proposalId: proposal.id,
        proposalItemId: chosen.id,
        origemVenda: 'CRM',
      },
      {},
    );
    const stored = await prisma.sale.findUniqueOrThrow({
      where: { id: sale.id },
    });
    expect(stored.proposalItemId).toBe(chosen.id);
    expect(stored.valorCreditoContratado.toFixed(2)).toBe('234567.89');
    expect(stored.snapshot).toMatchObject({
      credito: '234567.89',
      parcela: '2345.67',
      prazoMeses: 137,
      taxaAdministracao: '17.43',
      fundoReserva: '1.23',
      seguro: '0.42',
    });
    expect(
      await prisma.proposal.findUniqueOrThrow({
        where: { id: proposal.id },
        include: { items: { orderBy: { position: 'asc' } } },
      }),
    ).toEqual(before);
  });

  async function confirmedCommission() {
    const sale = await fixtureSale();
    const commission = await commissions.create(
      gestor,
      sale.id,
      {
        tipo: 'PRINCIPAL',
        baseCalculo: 'CREDITO',
        baseValor: '100000.00',
        valorPrevisto: '1000.00',
        competencia: '2026-10',
      },
      {},
    );
    const confirmed = await commissions.confirm(
      gestor,
      commission.id,
      { valorConfirmado: '1000.00' },
      {},
    );
    return { sale, commission: confirmed };
  }

  it('preserves canonical simulation fields for installment, term and adherence in the sale snapshot', async () => {
    const { proposal, item } = await fixtureProposal(vendedor);
    await prisma.proposalItem.update({
      where: { id: item.id },
      data: {
        financialSnapshot: simulationResultSchema.omit({ id: true }).parse({
          administratorId: (
            await prisma.administradora.create({
              data: { nome: 'Adm canonical snapshot' },
            })
          ).id,
          administratorName: 'Adm X',
          productName: 'Produto Y',
          contractedCredit: '200000.00',
          initialInstallment: '2400.00',
          totalTermMonths: 120,
          remainingTermMonths: 120,
          administrationFee: '12.00',
          adherenceScore: 82,
          badges: [],
          calculationStatus: 'COMPLETE',
          calculationWarnings: [],
          ruleVersion: 'E2E-1',
          sourceDataUpdatedAt: new Date().toISOString(),
          productId: null,
          groupId: null,
          groupCode: null,
          quotaId: null,
          quotaNumber: null,
          category: 'IMOVEL',
          netCredit: '200000.00',
          reducedInstallment: null,
          laterInstallment: '2400.00',
          ownBidAmount: '0.00',
          embeddedBidAmount: '0.00',
          totalBidAmount: '0.00',
          totalBidPercent: '0.00',
          reserveFund: '0.00',
          insurance: '0.00',
          adhesionFee: '0.00',
          assumptions: [],
        }),
      },
    });
    const sale = await sales.createFromProposal(
      vendedor,
      { proposalId: proposal.id, proposalItemId: item.id, origemVenda: 'CRM' },
      {},
    );
    const stored = await prisma.sale.findUniqueOrThrow({
      where: { id: sale.id },
    });
    expect.soft(stored.valorParcelaContratada?.toFixed(2)).toBe('2400.00');
    expect.soft(stored.prazoContratado).toBe(120);
    expect.soft(stored.snapshot).toMatchObject({
      parcela: '2400.00',
      prazoMeses: 120,
      adherenceScore: 82,
    });
  });

  it('preserves contract, received money, reversal reason and all required audit events after cancellation', async () => {
    const { sale, commission } = await confirmedCommission();
    const contract = await contracts.create(vendedor, sale.id, {}, {});
    expect(contract).toMatchObject({
      saleId: sale.id,
      numeroContrato: null,
      grupoCodigo: null,
      numeroCota: null,
    });
    await contracts.update(
      vendedor,
      contract.id,
      { observacoes: 'Documento verificado' },
      {},
    );
    await sales.changeStatus(
      vendedor,
      sale.id,
      { status: 'AGUARDANDO_DOCUMENTOS' },
      {},
    );
    await commissions.receive(
      admin,
      commission.id,
      { valorRecebido: '1000.00' },
      {},
    );
    await commissions.reverse(
      admin,
      commission.id,
      { motivo: 'CANCELAMENTO_VENDA' },
      {},
    );
    await sales.cancel(vendedor, sale.id, { motivo: 'CLIENTE_DESISTIU' }, {});
    expect(
      await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } }),
    ).toMatchObject({
      status: 'CANCELADA',
      motivoCancelamento: 'CLIENTE_DESISTIU',
    });
    expect(
      await prisma.saleContract.findUniqueOrThrow({
        where: { id: contract.id },
      }),
    ).toMatchObject({ saleId: sale.id });
    const original = await prisma.commission.findUniqueOrThrow({
      where: { id: commission.id },
    });
    expect(original.valorRecebido.toFixed(2)).toBe('1000.00');
    expect(await prisma.commission.count({ where: { saleId: sale.id } })).toBe(
      2,
    );
    const events = await prisma.auditLog.findMany({
      where: { entityId: { in: [sale.id, contract.id, commission.id] } },
    });
    for (const action of [
      'SALE_CREATED',
      'SALE_STATUS_CHANGED',
      'SALE_CANCELLED',
      'CONTRACT_CREATED',
      'CONTRACT_UPDATED',
      'COMMISSION_CREATED',
      'COMMISSION_CONFIRMED',
      'COMMISSION_RECEIVED',
      'COMMISSION_REVERSED',
    ]) {
      expect(events.map((event) => event.action)).toContain(action);
    }
    expect(
      events.find((event) => event.action === 'COMMISSION_REVERSED')?.metadata,
    ).toMatchObject({ motivo: 'CANCELAMENTO_VENDA' });
  });

  it('rejects stale versions for contract, confirmation, receipt and reversal without extra audit', async () => {
    const { sale, commission } = await confirmedCommission();
    const stale = '2000-01-01T00:00:00.000Z';
    const contract = await contracts.create(vendedor, sale.id, {}, {});
    const count = await prisma.auditLog.count();
    await expect(
      contracts.update(
        vendedor,
        contract.id,
        { observacoes: 'Conflito', expectedUpdatedAt: stale },
        {},
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      commissions.receive(
        admin,
        commission.id,
        { valorRecebido: '100.00', expectedUpdatedAt: stale },
        {},
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(await prisma.auditLog.count()).toBe(count);
    await commissions.receive(
      admin,
      commission.id,
      { valorRecebido: '1000.00' },
      {},
    );
    const beforeReverse = await prisma.auditLog.count();
    await expect(
      commissions.reverse(
        admin,
        commission.id,
        { motivo: 'CANCELAMENTO_VENDA', expectedUpdatedAt: stale },
        {},
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(await prisma.auditLog.count()).toBe(beforeReverse);
    const another = await fixtureSale();
    const planned = await commissions.create(
      gestor,
      another.id,
      {
        tipo: 'PRINCIPAL',
        baseCalculo: 'CREDITO',
        baseValor: '1000.00',
        valorPrevisto: '100.00',
        competencia: '2026-10',
      },
      {},
    );
    await expect(
      commissions.confirm(
        gestor,
        planned.id,
        { valorConfirmado: '100.00', expectedUpdatedAt: stale },
        {},
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('does not silently lose concurrent receipts when callers omit optional version', async () => {
    const { commission } = await confirmedCommission();
    let reads = 0;
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    // Both operations read real PostgreSQL state before either writes.
    const synchronized = prisma.$extends({
      query: {
        commission: {
          async findUnique({ args, query }) {
            const row = await query(args);
            reads += 1;
            if (reads === 2) release();
            await barrier;
            return row;
          },
        },
      },
    });
    const service = new CommissionsService(
      synchronized as unknown as PrismaClient,
    );
    const results = await Promise.allSettled([
      service.receive(admin, commission.id, { valorRecebido: '100.00' }, {}),
      service.receive(admin, commission.id, { valorRecebido: '200.00' }, {}),
    ]);
    const stored = await prisma.commission.findUniqueOrThrow({
      where: { id: commission.id },
    });
    const accepted = results.filter(
      (result) => result.status === 'fulfilled',
    ).length;
    if (accepted === 2) expect(stored.valorRecebido.toFixed(2)).toBe('300.00');
    else {
      expect(accepted).toBe(1);
      expect(
        results.find((result) => result.status === 'rejected'),
      ).toMatchObject({ reason: { statusCode: 409 } });
    }
  });

  it('does not create audit records for unchanged contract and sale updates', async () => {
    const sale = await fixtureSale();
    const contract = await contracts.create(
      vendedor,
      sale.id,
      { observacoes: 'Sem alteração' },
      {},
    );
    const count = await prisma.auditLog.count();
    await contracts.update(
      vendedor,
      contract.id,
      { observacoes: 'Sem alteração' },
      {},
    );
    await sales.update(vendedor, sale.id, {}, {});
    expect(await prisma.auditLog.count()).toBe(count);
  });

  it('preserves cents throughout Decimal storage and financial serialization', async () => {
    const sale = await fixtureSale();
    const expected = '90071992547409.93';
    const commission = await commissions.create(
      gestor,
      sale.id,
      {
        tipo: 'PRINCIPAL',
        baseCalculo: 'CREDITO',
        baseValor: expected,
        valorPrevisto: expected,
        competencia: '2026-10',
      },
      {},
    );
    const stored = await prisma.commission.findUniqueOrThrow({
      where: { id: commission.id },
    });
    expect.soft(stored.valorPrevisto.toFixed(2)).toBe(expected);
    expect.soft(commission.valorPrevisto).toBe(expected);
    expect.soft(commission.baseValor).toBe(expected);
    const confirmed = await commissions.confirm(
      gestor,
      commission.id,
      { valorConfirmado: expected },
      {},
    );
    expect(confirmed.valorConfirmado).toBe(expected);
    const partial = await commissions.receive(
      admin,
      commission.id,
      { valorRecebido: '0.01' },
      {},
    );
    expect(partial.valorRecebido).toBe('0.01');
    const summary = await commissions.list(admin, {
      saleId: sale.id,
      page: 1,
      pageSize: 20,
    });
    expect(summary.resumo.aReceber).toBe('90071992547409.92');
    const received = await commissions.receive(
      admin,
      commission.id,
      { valorRecebido: '90071992547409.92' },
      {},
    );
    expect(received.valorRecebido).toBe(expected);
    const detail = await sales.get(admin, sale.id);
    expect(detail.commissions[0]?.valorRecebido).toBe(expected);
    const reversed = await commissions.reverse(
      admin,
      commission.id,
      { motivo: 'CANCELAMENTO_VENDA' },
      {},
    );
    expect(reversed.estorno.valorPrevisto).toBe(expected);
  });
});
