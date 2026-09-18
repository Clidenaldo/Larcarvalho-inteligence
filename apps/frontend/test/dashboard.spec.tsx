import type { DashboardOverview } from '@larcarvalho/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { DashboardOverviewView } from '../src/components/dashboard-overview';
import { DashboardPeriodFilter } from '../src/components/dashboard-period-filter';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const base: DashboardOverview = {
  generatedAt: '2026-09-03T12:00:00.000Z',
  period: {
    preset: '30d',
    label: 'Últimos 30 dias',
    timezone: 'America/Fortaleza',
    from: '2026-08-05T03:00:00.000Z',
    toExclusive: '2026-09-04T03:00:00.000Z',
    previousFrom: '2026-07-06T03:00:00.000Z',
    previousToExclusive: '2026-08-05T03:00:00.000Z',
  },
  consorcios: null,
  quality: null,
  integrations: null,
  imports: null,
  crm: null,
  attention: [],
  activity: [],
};

describe('executive dashboard UI', () => {
  it('renders empty, accessible and refresh states without charts that rely only on color', () => {
    const html = renderToStaticMarkup(
      <>
        <DashboardPeriodFilter query={{ period: '30d' }} />
        <DashboardOverviewView data={base} />
      </>,
    );
    expect(html).toContain('Atualizar');
    expect(html).toContain('Nenhuma pendência objetiva');
    expect(html).toContain('Sem atividade recente');
    expect(html).toContain('America/Fortaleza');
  });

  it('renders own portfolio, funnel, comparisons, alerts and a tabular graph alternative', () => {
    const data: DashboardOverview = {
      ...base,
      crm: {
        scope: 'OWN',
        activeNow: 2,
        newInPeriod: { current: 2, previous: 0, changePercent: null },
        convertedInPeriod: { current: 1, previous: 1, changePercent: 0 },
        lostNow: 1,
        funnel: [{ key: 'NOVO', label: 'Novo', value: 2 }],
        origins: [
          { key: 'SIMULADOR_PUBLICO', label: 'Simulador público', value: 2 },
        ],
        categories: [],
        contacts: { today: 1, overdue: 1, upcoming: 0, withoutNextContact: 1 },
        unassignedActive: 0,
        team: [],
      },
      attention: [
        {
          id: 'overdue',
          severity: 'ALTO',
          title: 'Contatos atrasados',
          detail: 'Regra objetiva.',
          value: 1,
          href: '/dashboard/crm',
        },
      ],
    };
    const html = renderToStaticMarkup(<DashboardOverviewView data={data} />);
    expect(html).toContain('Minha carteira');
    expect(html).toContain('Sem base anterior');
    expect(html).toContain('Ver dados em tabela');
    expect(html).toContain('Contatos atrasados');
    expect(html).not.toContain('Visão factual da equipe');
  });
});
