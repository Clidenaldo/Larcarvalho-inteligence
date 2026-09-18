import type { CommercialIntelligence } from '@larcarvalho/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CommercialIntelligenceView } from '../src/components/commercial-intelligence-view';

const base: CommercialIntelligence = {
  generatedAt: '2026-09-17T12:00:00.000Z', scope: 'OWN', availableScopes: ['OWN'],
  period: { preset: '30d', label: 'Ultimos 30 dias', timezone: 'America/Fortaleza', from: '2026-08-19T03:00:00.000Z', toExclusive: '2026-09-18T03:00:00.000Z', previousFrom: '2026-07-20T03:00:00.000Z', previousToExclusive: '2026-08-19T03:00:00.000Z' },
  summary: { activeClients: 2, pendingFollowUps: 1, overdueFollowUps: 1, simulations: { current: 3, previous: 2, changePercent: .5 }, proposals: { current: 2, previous: 1, changePercent: 1 }, acceptedProposals: { current: 1, previous: 0, changePercent: null }, openSales: 1, completedSales: { current: 0, previous: 0, changePercent: null }, canceledSales: { current: 0, previous: 0, changePercent: null }, pendingDocuments: 1, pendingContracts: 0 },
  pipeline: [{ key: 'PROPOSALS', label: 'Propostas', count: 2, href: '/propostas' }],
  conversions: [{ key: 'ACCEPTED', label: 'Propostas aceitas', numerator: 1, denominator: 2, rate: .5 }],
  attention: [{ type: 'FOLLOWUP_OVERDUE', severity: 'HIGH', reason: 'Follow-up vencido.', count: 1, href: '/dashboard/agenda' }],
  performance: [], timeseries: [], sources: ['Agenda', 'Propostas'],
};

describe('commercial management UI', () => {
  it('renders factual cards, pipeline and attention without financial HTML', () => {
    const html = renderToStaticMarkup(<CommercialIntelligenceView data={base} />);
    expect(html).toContain('Clientes ativos'); expect(html).toContain('Pipeline factual'); expect(html).toContain('FOLLOWUP OVERDUE');
    expect(html).not.toContain('Saldo confirmado');
  });
  it('renders authorized financial values without losing cents', () => {
    const html = renderToStaticMarkup(<CommercialIntelligenceView data={{ ...base, financial: { expected: '5000.00', confirmed: '4850.00', received: '2000.00', confirmedReceivable: '2850.00' }, sources: [...base.sources, 'Comissoes'] }} />);
    expect(html).toContain('Saldo confirmado'); expect(html).toContain('2.850,00');
  });
});
