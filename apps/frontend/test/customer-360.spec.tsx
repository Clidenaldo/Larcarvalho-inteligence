// @vitest-environment jsdom
import type { FollowUp } from '@larcarvalho/shared';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FollowUpManager } from '../src/components/follow-up-manager';
import { CustomerTimeline } from '../src/components/customer-timeline';

vi.setConfig({ testTimeout: 20000 });

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function followUp(overrides: Partial<FollowUp> = {}): FollowUp {
  return {
    assignedUser: null,
    completedAt: null,
    createdAt: '2026-09-01T10:00:00.000Z',
    createdBy: null,
    dueAt: '2026-12-01T10:00:00.000Z',
    id: 'f0000000-0000-4000-8000-000000000001',
    isOverdue: false,
    lead: { id: 'lead-1', nome: 'João Silva' },
    leadId: 'lead-1',
    notes: null,
    status: 'PENDING',
    title: 'Ligar para João',
    type: 'CALL',
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('cliente 360 follow-ups', () => {
  it('lista pendências e permite concluir sem expor stack trace', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(followUp({ status: 'COMPLETED' })), { status: 200 })),
    );
    render(
      <FollowUpManager
        canCreate={true}
        canUpdate={true}
        items={[followUp(), followUp({ id: 'f0000000-0000-4000-8000-000000000002', isOverdue: true, title: 'Retornar proposta' })]}
        leadId="lead-1"
      />,
    );
    expect(screen.getByText('Ligar para João')).toBeTruthy();
    expect(screen.getByText('Em atraso')).toBeTruthy();
    await user.click(screen.getAllByRole('button', { name: 'Concluir' })[0]);
    await waitFor(() => {
      expect(screen.getByText('Follow-up concluído.')).toBeTruthy();
    });
    const [url, init] = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(url).toContain('/api/followups/f0000000-0000-4000-8000-000000000001/status');
    expect(init?.method).toBe('POST');
  });

  it('oculta criação sem permissão e mostra erro amigável em falha', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: { message: 'Ops' } }), { status: 403 })),
    );
    render(
      <FollowUpManager canCreate={false} canUpdate={false} items={[followUp()]} leadId="lead-1" />,
    );
    expect(screen.queryByText('Agendar follow-up')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Concluir' })).toBeNull();
    expect(screen.getByText('Ligar para João')).toBeTruthy();
  });

  it('agenda follow-up com título, tipo e vencimento', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(followUp()), { status: 201 })),
    );
    render(<FollowUpManager canCreate={true} canUpdate={false} items={[]} leadId="lead-1" />);
    expect(screen.getByText('Nenhum follow-up pendente.')).toBeTruthy();
    await user.type(screen.getByLabelText('Título'), 'Enviar proposta');
    await user.type(screen.getByLabelText('Vencimento'), '2026-12-02T10:00');
    await user.click(screen.getByRole('button', { name: 'Agendar' }));
    await waitFor(() => {
      expect(screen.getByText('Follow-up agendado.')).toBeTruthy();
    });
  });

  it('renderiza timeline em ordem com rótulos em português', () => {
    render(
      <CustomerTimeline
        items={[
          {
            actorName: 'Vendedora',
            id: 'interaction-1',
            kind: 'INTERACTION',
            occurredAt: '2026-09-10T10:00:00.000Z',
            origin: 'interaction',
            summary: 'Ligação: cliente pediu proposta',
          },
          {
            actorName: null,
            id: 'lead-1',
            kind: 'LEAD_CREATED',
            occurredAt: '2026-09-09T10:00:00.000Z',
            origin: 'lead',
            summary: 'Lead João criado',
          },
        ]}
      />,
    );
    expect(screen.getByText('Interação')).toBeTruthy();
    expect(screen.getByText('Lead criado')).toBeTruthy();
    expect(screen.getByText('Ligação: cliente pediu proposta')).toBeTruthy();
  });

  it('mostra estado vazio na timeline', () => {
    render(<CustomerTimeline items={[]} />);
    expect(screen.getByText('Nenhum evento registrado ainda.')).toBeTruthy();
  });
});
