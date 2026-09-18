// @vitest-environment jsdom
import type { Proposal, ProposalVersionChain } from '@larcarvalho/shared';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProposalDetail } from '../src/components/proposal-detail';

vi.setConfig({ testTimeout: 20000 });

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function snapshot() {
  return {
    administrationFee: '54000',
    adhesionFee: '0',
    administratorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    administratorName: 'Administradora Alfa',
    adherenceScore: 84,
    assumptions: ['Regra LC-1'],
    badges: [],
    calculationStatus: 'COMPLETE',
    calculationWarnings: [],
    category: 'IMOVEL',
    contractedCredit: '300000',
    embeddedBidAmount: '30000',
    groupCode: 'G-001',
    groupId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
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
  };
}

function proposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    clientName: 'João Silva',
    createdAt: '2026-01-01T00:00:00.000Z',
    createdById: '11111111-1111-4111-8111-111111111111',
    id: '44444444-4444-4444-8444-444444444444',
    issuedAt: null,
    items: [
      {
        description: 'Administradora Alfa - Imóvel',
        financialSnapshot: snapshot(),
        id: '77777777-7777-4777-8777-777777777777',
        position: 1,
        resultId: '33333333-3333-4333-8333-333333333333',
      },
    ],
    leadId: '55555555-5555-4555-8555-555555555555',
    notes: null,
    number: 'PROP-20260101-ABCDEF12',
    objectiveSummary: 'Comprar imóvel com parcela confortável',
    parentId: null,
    sellerName: 'Vendedor Teste',
    simulationId: '66666666-6666-4666-8666-666666666666',
    status: 'DRAFT',
    statusHistory: [],
    title: 'Proposta João',
    updatedAt: '2026-01-01T00:00:00.000Z',
    validUntil: '2026-02-01T00:00:00.000Z',
    version: 1,
    ...overrides,
  };
}

function chain(): ProposalVersionChain {
  return {
    currentId: '44444444-4444-4444-8444-444444444444',
    items: [
      {
        createdAt: '2026-01-01T00:00:00.000Z',
        id: '44444444-4444-4444-8444-444444444444',
        number: 'PROP-20260101-ABCDEF12',
        status: 'DRAFT',
        version: 1,
      },
    ],
    rootId: '44444444-4444-4444-8444-444444444444',
  };
}

describe('proposta comercial inteligente', () => {
  it('mostra alternativas com dados reais do snapshot', () => {
    render(
      <ProposalDetail
        canCreateVersion={false}
        canEdit={false}
        proposal={proposal()}
        suggestFollowUp={false}
        versions={chain()}
      />,
    );
    expect(screen.getByText('Administradora Alfa - Imóvel')).toBeTruthy();
    expect(screen.getByText('PROP-20260101-ABCDEF12 · versão 1')).toBeTruthy();
  });

  it('edita rascunho via PATCH sem expor stack trace', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(proposal()), { status: 200 })),
    );
    render(
      <ProposalDetail
        canCreateVersion={false}
        canEdit={true}
        proposal={proposal()}
        suggestFollowUp={false}
        versions={chain()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await user.clear(screen.getByLabelText('Título'));
    await user.type(screen.getByLabelText('Título'), 'Proposta João atualizada');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => {
      const calls = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls;
      expect(calls.some(([url, init]) => url.includes('/api/proposals/') && init?.method === 'PATCH')).toBe(true);
    });
  });

  it('oculta edição sem permissão e oferece nova versão quando bloqueada', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ id: '99999999-9999-4999-8999-999999999999' }), {
            status: 201,
          }),
      ),
    );
    render(
      <ProposalDetail
        canCreateVersion={true}
        canEdit={false}
        proposal={proposal({ status: 'SENT' })}
        suggestFollowUp={false}
        versions={chain()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
    await user.click(screen.getByRole('button', { name: /Criar versão 2/ }));
    await waitFor(() => {
      const calls = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls;
      expect(
        calls.some(
          ([url, init]) => url.endsWith('/versions') && init?.method === 'POST',
        ),
      ).toBe(true);
    });
  });

  it('sugere follow-up após enviada sem criar sozinha', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({}), { status: 201 })),
    );
    render(
      <ProposalDetail
        canCreateVersion={false}
        canEdit={false}
        proposal={proposal({ status: 'SENT' })}
        suggestFollowUp={true}
        versions={chain()}
      />,
    );
    expect(screen.getByText('Agendar retorno?')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Amanhã' }));
    await waitFor(() => {
      const calls = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls;
      expect(calls.some(([url, init]) => url === '/api/followups' && init?.method === 'POST')).toBe(true);
    });
  });

  it('mostra histórico com motivos e cadeia de versões', () => {
    render(
      <ProposalDetail
        canCreateVersion={true}
        canEdit={false}
        proposal={proposal({
          parentId: '00000000-0000-4000-8000-000000000000',
          status: 'SENT',
          statusHistory: [
            {
              changedById: '11111111-1111-4111-8111-111111111111',
              createdAt: '2026-01-03T00:00:00.000Z',
              fromStatus: 'GENERATED',
              id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              reason: 'Canal: WhatsApp — cliente pediu prazo',
              toStatus: 'SENT',
            },
          ],
          version: 2,
        })}
        suggestFollowUp={false}
        versions={{
          currentId: '44444444-4444-4444-8444-444444444444',
          items: [
            {
              createdAt: '2026-01-01T00:00:00.000Z',
              id: '00000000-0000-4000-8000-000000000000',
              number: 'PROP-20260101-ABCDEF12',
              status: 'SENT',
              version: 1,
            },
            {
              createdAt: '2026-01-03T00:00:00.000Z',
              id: '44444444-4444-4444-8444-444444444444',
              number: 'PROP-20260103-XYZ12345',
              status: 'SENT',
              version: 2,
            },
          ],
          rootId: '00000000-0000-4000-8000-000000000000',
        }}
      />,
    );
    expect(screen.getByText('Versão 2 de 2')).toBeTruthy();
    expect(screen.getByText('Canal: WhatsApp — cliente pediu prazo')).toBeTruthy();
  });
});
