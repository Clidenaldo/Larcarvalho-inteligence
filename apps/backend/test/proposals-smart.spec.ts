import { createProposalRequestSchema } from '@larcarvalho/shared';
import { describe, expect, it, vi } from 'vitest';

import type { AuthContext } from '../src/core/auth/auth-context.js';
import { ProposalPdfService } from '../src/modules/proposals/proposal-pdf.service.js';
import { ProposalsService } from '../src/modules/proposals/proposals.service.js';
import type { CommercialConfigurationsService } from '../src/modules/commercial-configurations/commercial-configurations.service.js';
import type { SimulationsService } from '../src/modules/simulations/simulations.service.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';

function actor(
  role: AuthContext['user']['role'],
  id = UUID_A,
): AuthContext {
  return {
    sessionId: 'session-proposals',
    teamIds: [],
    user: { email: 'vendedor@larcarvalho.com.br', id, nome: 'Vendedor Teste', role },
  };
}

function resultFixture(id: string, overrides: Record<string, unknown> = {}) {
  return {
    administrationFee: '54000',
    adhesionFee: '0',
    administratorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    administratorName: 'Administradora Alfa',
    adherenceScore: 84,
    assumptions: ['Regra LC-1'],
    badges: [],
    calculationStatus: 'COMPLETE' as const,
    calculationWarnings: [],
    category: 'IMOVEL' as const,
    contractedCredit: '300000',
    embeddedBidAmount: '30000',
    groupCode: 'G-001',
    groupId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    id,
    initialInstallment: '3450',
    insurance: '1500',
    laterInstallment: '3300',
    netCredit: '270000',
    ownBidAmount: '20000',
    productId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    productName: 'Imóvel',
    quotaId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    quotaNumber: '123',
    reducedInstallment: null,
    remainingTermMonths: 120,
    reserveFund: '4500',
    ruleVersion: 'LC-1 v3',
    sourceDataUpdatedAt: '2026-01-01T00:00:00.000Z',
    totalBidAmount: '50000',
    totalBidPercent: '16.67',
    totalTermMonths: 120,
    comparisonContext: {
      administrationFeePercent: '18',
      diluteReducedInstallments: false,
      includeInsurance: true,
      maxEmbeddedBidPercent: '30',
      paidInstallments: 0,
      reducedUntilContemplation: false,
    },
    ...overrides,
  };
}

const UUID_A = '11111111-1111-4111-8111-111111111111';

function fullSnapshot(overrides: Record<string, unknown> = {}) {
  const { id: _dropped, ...snapshot } = resultFixture(
    '33333333-3333-4333-8333-333333333333',
    overrides,
  );
  void _dropped;
  return snapshot;
}

function proposalRow(overrides: Record<string, unknown> = {}) {
  return {
    createdBy: { nome: 'Vendedor Teste' },
    createdById: UUID_A,
    id: '44444444-4444-4444-8444-444444444444',
    issuedAt: null,
    lead: { nome: 'João Silva', responsavelId: UUID_A },
    leadId: '55555555-5555-4555-8555-555555555555',
    notes: null,
    number: 'PROP-20260101-ABCDEF12',
    objectiveSummary: 'Comprar imóvel com parcela confortável',
    parentId: null,
    simulationId: '66666666-6666-4666-8666-666666666666',
    snapshot: { simulation: { number: 'SIM-1' } },
    status: 'DRAFT',
    statusHistory: [],
    title: 'Proposta João',
    validUntil: new Date('2026-02-01T00:00:00.000Z'),
    version: 1,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    items: [
      {
        description: 'Administradora Alfa - Imóvel',
        financialSnapshot: fullSnapshot(),
        id: '77777777-7777-4777-8777-777777777777',
        position: 1,
        simulationResultId: '33333333-3333-4333-8333-333333333333',
      },
    ],
    ...overrides,
  };
}

function mockDb(scenario: {
  readonly accessible?: Record<string, unknown> | null;
  readonly children?: number;
  readonly created?: Record<string, unknown>;
  readonly editable?: { issuedAt: Date | null; status: string };
  readonly simulation?: Record<string, unknown> | null;
  readonly updateCount?: number;
}) {
  const row = scenario.accessible === undefined ? proposalRow() : scenario.accessible;
  const tx = {
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    proposal: {
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        ...proposalRow(),
        ...data,
        id: 'p0000000-0000-4000-8000-000000000002',
      })),
      updateMany: vi.fn().mockResolvedValue({ count: scenario.updateCount ?? 1 }),
    },
    proposalStatusHistory: { create: vi.fn().mockResolvedValue({}) },
  };
  const db = {
    $transaction: vi.fn(async (ops: unknown) =>
      Array.isArray(ops) ? Promise.all(ops) : (ops as (tx: unknown) => Promise<unknown>)(tx),
    ),
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    lead: { findFirst: vi.fn().mockResolvedValue({ id: 'lead-1' }) },
    proposal: {
      count: vi.fn().mockResolvedValue(scenario.children ?? 0),
      create: tx.proposal.create,
      findFirst: vi.fn().mockResolvedValue(row),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockImplementation(async () => ({
        issuedAt: scenario.editable?.issuedAt ?? null,
        status: scenario.editable?.status ?? 'DRAFT',
      })),
      update: vi.fn().mockResolvedValue({}),
      updateMany: tx.proposal.updateMany,
    },
    proposalItem: { findMany: vi.fn().mockResolvedValue([]) },
    proposalStatusHistory: { create: vi.fn().mockResolvedValue({}) },
  } as unknown as PrismaClient;
  const simulations = {
    get: vi.fn().mockResolvedValue(
      scenario.simulation === undefined
        ? { scenarios: [{ results: [resultFixture('result-1'), resultFixture('result-2')] }] }
        : scenario.simulation,
    ),
  } as unknown as SimulationsService;
  const configurations = {
    getConfiguration: vi.fn().mockResolvedValue({ proposalValidityDays: 7 }),
  } as unknown as CommercialConfigurationsService;
  const service = new ProposalsService(db, simulations, configurations);
  return { db, service, tx };
}

const request = { ipAddress: '127.0.0.1' };

describe('proposta comercial inteligente', () => {
  it('preserva o limite de 3 resultados completos por proposta', () => {
    expect(() =>
      createProposalRequestSchema.parse({
        leadId: '00000000-0000-4000-8000-000000000001',
        objectiveSummary: 'Objetivo com tamanho suficiente',
        resultIds: ['a', 'b', 'c', 'd'].map(
          (suffix) => `00000000-0000-4000-8000-00000000000${suffix}`,
        ),
        title: 'Proposta teste',
      }),
    ).toThrow();
  });

  it('cria proposta com snapshot imutável dos resultados (sem recálculo)', async () => {
    const resultA = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const resultB = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const simulations = {
      get: vi.fn().mockResolvedValue({
        scenarios: [{ results: [resultFixture(resultA), resultFixture(resultB)] }],
      }),
    } as unknown as SimulationsService;
    const { db, tx } = mockDb({});
    const configurations = {
      getConfiguration: vi.fn().mockResolvedValue({ proposalValidityDays: 7 }),
    } as unknown as CommercialConfigurationsService;
    const service = new ProposalsService(db, simulations, configurations);
    const created = await service.create(
      actor('VENDEDOR'),
      'sim-1',
      {
        leadId: '55555555-5555-4555-8555-555555555555',
        objectiveSummary: 'Objetivo com tamanho suficiente',
        resultIds: [resultA, resultB],
        title: 'Proposta João',
      },
      request,
    );
    const payload = (
      tx.proposal.create as unknown as {
        mock: { calls: [[{ data: { items: { create: unknown[] }; snapshot: { results: { contractedCredit: string }[] } } }]] };
      }
    ).mock.calls[0][0].data;
    expect(payload.items.create).toHaveLength(2);
    expect(payload.snapshot.results[0]?.contractedCredit).toBe('300000');
    expect(created.version).toBe(1);
  });

  it('rejeita resultado incompleto ou fora da simulação', async () => {
    const { service } = mockDb({
      simulation: {
        scenarios: [{ results: [resultFixture('result-1', { calculationStatus: 'INCOMPLETE_DATA' })] }],
      },
    });
    await expect(
      service.create(
        actor('VENDEDOR'),
        'sim-1',
        {
          leadId: 'l0000000-0000-4000-8000-000000000001',
          objectiveSummary: 'Objetivo com tamanho suficiente',
          resultIds: ['result-1'],
          title: 'Proposta João',
        },
        request,
      ),
    ).rejects.toMatchObject({ code: 'PROPOSAL_CONFLICT' });
  });

  it('edita rascunho nunca apresentado e bloqueia após apresentada', async () => {
    const { service } = mockDb({});
    const updated = await service.update(actor('VENDEDOR'), 'p1', { title: 'Novo título' }, request);
    expect(updated).toBeDefined();
    const locked = mockDb({ editable: { issuedAt: new Date(), status: 'SENT' } });
    await expect(
      locked.service.update(actor('VENDEDOR'), 'p1', { title: 'X' }, request),
    ).rejects.toMatchObject({ code: 'PROPOSAL_CONFLICT', statusCode: 409 });
  });

  it('bloqueia edição quando já existe versão derivada', async () => {
    const { service } = mockDb({ children: 1 });
    await expect(
      service.update(actor('VENDEDOR'), 'p1', { title: 'X' }, request),
    ).rejects.toMatchObject({ code: 'PROPOSAL_CONFLICT' });
  });

  it('cria nova versão preservando snapshot anterior e incrementando', async () => {
    const { service, tx } = mockDb({ editable: { issuedAt: new Date(), status: 'SENT' } });
    const version = await service.createVersion(actor('VENDEDOR'), 'p1', { title: 'Proposta João v2' }, request);
    expect(version).toBeDefined();
    const payload = (
      tx.proposal.create as unknown as { mock: { calls: [[{ data: Record<string, unknown> }]] } }
    ).mock.calls[0][0].data;
    expect(payload.version).toBe(2);
    expect(payload.parentId).toBe('p1');
    expect(
      (payload.statusHistory as { create: { toStatus: string } }).create.toStatus,
    ).toBe('DRAFT');
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'PROPOSAL_VERSION_CREATED' }) }),
    );
  });

  it('recusa versionar rascunho ainda editável', async () => {
    const { service } = mockDb({});
    await expect(
      service.createVersion(actor('VENDEDOR'), 'p1', {}, request),
    ).rejects.toMatchObject({ code: 'PROPOSAL_CONFLICT' });
  });

  it('transições de status seguem o mapa permitido', async () => {
    const sent = mockDb({
      accessible: proposalRow({ status: 'SENT' }),
      editable: { issuedAt: new Date(), status: 'SENT' },
    });
    const accepted = await sent.service.changeStatus(
      actor('VENDEDOR'),
      'p1',
      { status: 'ACCEPTED', reason: 'Cliente aceitou por WhatsApp' },
      request,
    );
    expect(accepted).toBeDefined();
    const draft = mockDb({});
    await expect(
      draft.service.changeStatus(actor('VENDEDOR'), 'p1', { status: 'ACCEPTED' }, request),
    ).rejects.toMatchObject({ code: 'PROPOSAL_CONFLICT' });
  });

  it('bloqueia proposta de outro vendedor sem vazar (update) e 404 sem registro', async () => {
    const other = mockDb({
      accessible: proposalRow({
        createdById: 'other-user',
        lead: { nome: 'Outro', responsavelId: 'other-user' },
      }),
    });
    await expect(
      other.service.update(actor('VENDEDOR', '00000000-0000-4000-8000-000000000001'), 'p1', { title: 'X' }, request),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const missing = mockDb({ accessible: null });
    await expect(
      missing.service.get(actor('VENDEDOR'), 'p1'),
    ).rejects.toMatchObject({ code: 'PROPOSAL_NOT_FOUND', statusCode: 404 });
  });

  it('gera PDF histórico determinístico a partir do snapshot', async () => {
    const pdf = new ProposalPdfService();
    const proposal = {
      clientName: 'João Silva',
      createdAt: '2026-01-01T00:00:00.000Z',
      id: '88888888-8888-4888-8888-888888888888',
      issuedAt: '2026-01-02T00:00:00.000Z',
      items: [
        {
          description: 'Administradora Alfa - Imóvel',
          financialSnapshot: fullSnapshot(),
          id: '99999999-9999-4999-8999-999999999999',
          position: 1,
          resultId: '33333333-3333-4333-8333-333333333333',
        },
      ],
      leadId: '55555555-5555-4555-8555-555555555555',
      notes: null,
      number: 'PROP-20260101-ABCDEF12',
      objectiveSummary: 'Comprar imóvel',
      parentId: null,
      simulationId: '66666666-6666-4666-8666-666666666666',
      createdById: UUID_A,
      sellerName: 'Vendedor Teste',
      status: 'GENERATED' as const,
      statusHistory: [],
      title: 'Proposta João',
      updatedAt: '2026-01-02T00:00:00.000Z',
      validUntil: '2026-02-01T00:00:00.000Z',
      version: 1,
    };
    const configuration = {
      organizationName: 'Larcarvalho Consórcios',
      requiredDisclaimer: 'Condições sujeitas à confirmação da administradora.',
    };
    const first = await pdf.generate(proposal, configuration as never, { detail: 'full' });
    const second = await pdf.generate(proposal, configuration as never, { detail: 'full' });
    expect(first.length).toBeGreaterThan(1000);
    expect(Buffer.from(first).subarray(0, 5).toString()).toBe('%PDF-');
    const { PDFDocument } = await import('pdf-lib');
    const firstDoc = await PDFDocument.load(first);
    const secondDoc = await PDFDocument.load(second);
    expect(firstDoc.getPageCount()).toBeGreaterThan(0);
    expect(secondDoc.getPageCount()).toBe(firstDoc.getPageCount());
    expect(firstDoc.getTitle()).toContain('PROP-20260101-ABCDEF12');
  });
});
