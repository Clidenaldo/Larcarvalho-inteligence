// @vitest-environment jsdom
import type { AgendaResponse } from '@larcarvalho/shared';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AgendaView } from '../src/components/agenda-view';

vi.setConfig({ testTimeout: 20000 });

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function agenda(overrides: Partial<AgendaResponse> = {}): AgendaResponse {
  return {
    completedToday: 1,
    distribution: [],
    noNextAction: [],
    overdue: [
      {
        categoria: 'IMOVEL',
        dueAt: '2026-09-10T09:00:00.000Z',
        followUpId: 'f0000000-0000-4000-8000-000000000001',
        followUpTitle: 'Ligar para João',
        followUpType: 'CALL',
        kind: 'FOLLOWUP_OVERDUE',
        leadId: 'lead-1',
        leadNome: 'João Silva',
        leadStatus: 'QUALIFICADO',
        priority: 1,
        reason: 'Follow-up atrasado há 2 dia(s).',
        responsavel: { id: 'u1', nome: 'Vendedor' },
      },
    ],
    proposalsAwaiting: [],
    salesAwaiting: [],
    staleContacts: [],
    today: [],
    totals: {
      noNextAction: 0,
      overdue: 1,
      proposalsAwaiting: 0,
      salesAwaiting: 0,
      staleContacts: 0,
      today: 0,
      upcoming: 0,
    },
    upcoming: [],
    withoutFutureAgenda: [],
    ...overrides,
  };
}

describe('agenda comercial', () => {
  it('mostra blocos com motivos e totais', () => {
    render(<AgendaView canComplete={true} canReschedule={true} initial={agenda()} showTeam={false} />);
    expect(screen.getByRole('heading', { name: /Atrasados/ })).toBeTruthy();
    expect(screen.getByText('Follow-up atrasado há 2 dia(s).')).toBeTruthy();
    expect(screen.getByText('João Silva')).toBeTruthy();
  });

  it('conclui follow-up e oferece próxima ação sem executar sozinha', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })),
    );
    render(<AgendaView canComplete={true} canReschedule={true} initial={agenda()} showTeam={false} />);
    await user.click(screen.getByRole('button', { name: 'Concluir follow-up' }));
    await waitFor(() => {
      expect(screen.getByText('Follow-up concluído. Agende a próxima ação abaixo.')).toBeTruthy();
    });
    expect(screen.getByText('Agendar próxima ação para João Silva')).toBeTruthy();
    const [url, init] = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(url).toContain('/api/followups/f0000000-0000-4000-8000-000000000001');
    expect(init?.method).toBe('POST');
  });

  it('reagenda com opções rápidas sem sobrescrever silenciosamente', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })),
    );
    render(<AgendaView canComplete={true} canReschedule={true} initial={agenda()} showTeam={false} />);
    await user.click(screen.getByRole('button', { name: 'Reagendar' }));
    await user.click(screen.getByRole('button', { name: 'Amanhã' }));
    await waitFor(() => {
      const calls = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      expect(calls[0][0]).toContain('/api/followups/f0000000-0000-4000-8000-000000000001');
      expect(calls[0][1]?.method).toBe('PATCH');
    });
  });

  it('oculta ações fora de permissão', () => {
    render(<AgendaView canComplete={false} canReschedule={false} initial={agenda()} showTeam={false} />);
    expect(screen.queryByRole('button', { name: 'Concluir follow-up' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reagendar' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Preparar mensagem' })).toBeTruthy();
  });

  it('mostra distribuição da equipe sem rótulos subjetivos', () => {
    render(
      <AgendaView
        canComplete={true}
        canReschedule={true}
        initial={agenda({
          distribution: [{ nome: 'Vendedor', overdue: 2, today: 1, userId: 'u1' }],
          withoutFutureAgenda: [{ nome: 'Livre', userId: 'u2' }],
        })}
        showTeam={true}
      />,
    );
    expect(screen.getByText('Distribuição da equipe')).toBeTruthy();
    expect(screen.getByText(/2 em atraso/)).toBeTruthy();
    expect(screen.getByText('Livre')).toBeTruthy();
    expect(screen.queryByText(/pior vendedor/i)).toBeNull();
  });
});
