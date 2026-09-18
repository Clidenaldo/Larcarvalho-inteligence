// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  render,
  screen,
  within,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Simulation, SimulationResult } from '@larcarvalho/shared';
import { QuotaComparison } from '../src/components/quota-comparison';
import { SimulationDetail } from '../src/components/simulation-detail';
import {
  reconcileComparison,
  selectComparisonResult,
  sortComparison,
} from '../src/lib/quota-comparison';

vi.setConfig({ testTimeout: 20000 });
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function fixture(
  n: number,
  overrides: Partial<SimulationResult> = {},
): SimulationResult {
  return {
    id: `result-${n}`,
    quotaId: `quota-${n}`,
    quotaNumber: String(n),
    groupId: 'group',
    groupCode: 'G1',
    administratorId: 'admin',
    administratorName: 'Administradora comum',
    productId: 'product',
    productName: 'Imóvel',
    category: 'IMOVEL',
    badges: [],
    calculationStatus: 'COMPLETE',
    calculationWarnings: [],
    ruleVersion: 'LC-1',
    sourceDataUpdatedAt: '2026-09-10T12:00:00Z',
    contractedCredit: '100000.00',
    netCredit: '80000.00',
    totalTermMonths: 120,
    remainingTermMonths: 100,
    initialInstallment: `${n * 1000}.00`,
    reducedInstallment: null,
    laterInstallment: '1100.00',
    ownBidAmount: '0.00',
    embeddedBidAmount: '20000.00',
    totalBidAmount: '20000.00',
    totalBidPercent: '20.00',
    administrationFee: '10000.00',
    reserveFund: '2000.00',
    insurance: null,
    adhesionFee: null,
    adherenceScore: 75,
    assumptions: ['Critérios registrados pelo motor'],
    ...overrides,
  };
}
const results = [fixture(1), fixture(2)];

describe('quota comparison', () => {
  it('keeps five unique quotas, blocks the sixth and appends a replacement in selection order', () => {
    const all = Array.from({ length: 6 }, (_, i) => fixture(i + 1));
    let selected: string[] = [];
    for (const result of all)
      selected = selectComparisonResult(selected, result, all);
    expect(selected).toEqual(all.slice(0, 5).map((r) => r.id));
    expect(selectComparisonResult(selected, all[5]!, all)).toBe(selected);
    expect(
      selectComparisonResult(
        [all[0]!.id],
        fixture(7, { quotaId: 'quota-1' }),
        all,
      ),
    ).toEqual(['result-1']);
    selected = selectComparisonResult(selected, all[2]!, all);
    expect(selected).toEqual(['result-1', 'result-2', 'result-4', 'result-5']);
    expect(selectComparisonResult(selected, all[5]!, all)).toEqual([
      'result-1',
      'result-2',
      'result-4',
      'result-5',
      'result-6',
    ]);
  });
  it.each([1, 2, 3, 4, 5])(
    'selects and aligns exactly %i result columns without empty positions',
    (count) => {
      const all = Array.from({ length: count }, (_, i) => fixture(i + 1));
      const selected = all.reduce<string[]>(
        (ids, item) => selectComparisonResult(ids, item, all),
        [],
      );
      expect(selected).toEqual(all.map((item) => item.id));
      render(<QuotaComparison results={all} onRemove={vi.fn()} />);
      expect(screen.getAllByRole('columnheader')).toHaveLength(count + 1);
      for (const row of screen.getAllByRole('row').slice(1))
        expect(row.children).toHaveLength(count + 1);
      const cells = within(
        screen.getByRole('rowheader', { name: 'Parcela inicial calculada' })
          .parentElement!,
      ).getAllByRole('cell');
      expect(cells.map((cell) => cell.textContent?.replace(/\s/g, ''))).toEqual(
        all.map((_, index) => `R$${index + 1}.000,00`),
      );
    },
  );
  it('aligns shared criteria in one semantic table and distinguishes the same administrator', () => {
    render(<QuotaComparison results={results} onRemove={vi.fn()} />);
    expect(screen.getAllByRole('table')).toHaveLength(1);
    expect(screen.getByRole('columnheader', { name: /Cota 1/ })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /Cota 2/ })).toBeTruthy();
    for (const row of screen.getAllByRole('row').slice(1))
      expect(row.children).toHaveLength(3);
    const row = screen.getByRole('rowheader', {
      name: 'Parcela inicial calculada',
    }).parentElement!;
    expect(
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent?.replace(/\s/g, '')),
    ).toEqual(['R$1.000,00', 'R$2.000,00']);
  });
  it('formats available values and dates; never invents missing amounts or status', () => {
    render(
      <QuotaComparison
        results={[
          fixture(1, {
            calculationStatus: 'INCOMPLETE_DATA',
            netCredit: null,
            adherenceScore: null,
          }),
        ]}
        onRemove={vi.fn()}
      />,
    );
    for (const label of [
      'Crédito líquido',
      'Índice de aderência',
      'Status da cota',
    ]) {
      expect(
        screen.getByRole('rowheader', { name: label }).parentElement
          ?.textContent,
      ).toContain('Não informado');
    }
    expect(
      screen.getByRole('rowheader', { name: 'Lance total em percentual' })
        .parentElement?.textContent,
    ).toContain('20%');
    expect(
      screen.getByRole('rowheader', { name: 'Prazo total' }).parentElement
        ?.textContent,
    ).toContain('120 meses');
    expect(
      screen.getByRole('rowheader', { name: 'Data-base dos dados' })
        .parentElement?.textContent,
    ).toContain('10/09/2026');
    expect(
      screen.getByRole('rowheader', { name: 'Lance próprio' }).parentElement
        ?.textContent,
    ).toMatch(/0,00/);
  });
  it('sorts without mutating selection order and returns to selection order', async () => {
    const user = userEvent.setup();
    render(
      <QuotaComparison
        results={[results[1]!, results[0]!]}
        onRemove={vi.fn()}
      />,
    );
    await user.selectOptions(
      screen.getByLabelText('Ordenar comparação'),
      'initialInstallment',
    );
    expect(screen.getAllByRole('columnheader')[1]?.textContent).toContain(
      'Cota 1',
    );
    await user.selectOptions(
      screen.getByLabelText('Ordenar comparação'),
      'selection',
    );
    expect(screen.getAllByRole('columnheader')[1]?.textContent).toContain(
      'Cota 2',
    );
    expect(
      sortComparison(
        [fixture(1, { netCredit: null }), fixture(2)],
        'netCredit',
      )[0]?.id,
    ).toBe('result-2');
  });
  it('removes with keyboard and exposes a focusable named scrolling region', async () => {
    const user = userEvent.setup(),
      remove = vi.fn();
    render(<QuotaComparison results={results} onRemove={remove} />);
    const region = screen.getByRole('region', {
      name: 'Comparação de cotas e resultados',
    });
    region.focus();
    expect(document.activeElement).toBe(region);
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Remover cota 1 da comparação' }),
    );
    await user.keyboard('{Enter}');
    expect(remove).toHaveBeenCalledWith('result-1');
  });
  it('keeps unaffected columns when one result loads or fails', () => {
    render(
      <QuotaComparison
        results={results}
        onRemove={vi.fn()}
        loadingIds={['result-1']}
        errors={{ 'result-2': 'Falha nesta cota.' }}
      />,
    );
    expect(
      within(screen.getByRole('columnheader', { name: /Cota 1/ })).getByRole(
        'status',
      ).textContent,
    ).toContain('Recalculando');
    expect(
      within(screen.getByRole('columnheader', { name: /Cota 2/ })).getByRole(
        'alert',
      ).textContent,
    ).toContain('preservado');
    expect(screen.getAllByRole('columnheader')).toHaveLength(3);
  });
  it('preserves quota order after recalculation and retains ambiguous historical snapshots', () => {
    const next = [fixture(1, { id: 'new-1' }), fixture(2, { id: 'new-2' })];
    expect(
      reconcileComparison(['result-2', 'result-1'], results, next),
    ).toEqual(['new-2', 'new-1']);
    expect(
      reconcileComparison(['result-1'], results, [
        ...next,
        fixture(1, { id: 'ambiguous' }),
      ]),
    ).toEqual(['result-1']);
  });
  it('shows an empty state and limits highlights to complete comparable values', () => {
    const view = render(<QuotaComparison results={[]} onRemove={vi.fn()} />);
    expect(screen.getByText(/Selecione pelo menos duas/)).toBeTruthy();
    view.rerender(
      <QuotaComparison
        results={[
          results[0]!,
          fixture(2, { calculationStatus: 'INCOMPLETE_DATA' }),
        ]}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.queryByText(/★/)).toBeNull();
  });
  it('keeps selected quotas through filters, refresh, failed and successful recalculation', async () => {
    const user = userEvent.setup();
    const simulation = {
      id: 'simulation',
      number: 'SIM-1',
      scenarios: [
        {
          id: 'scenario',
          name: 'Cenário principal',
          results,
          sort: 'ADHERENCE',
          pinned: false,
          calculatedAt: '2026-09-10T12:00:00Z',
          engineVersion: 'LC-SIM-2.0.0',
        },
      ],
      requestedCredit: '100000',
      desiredTermMonths: 120,
      creditMode: 'CONTRACTED_CREDIT',
      leadId: null,
    } as Simulation;
    const view = render(
      <SimulationDetail simulation={simulation} leads={[]} />,
    );
    const pins = screen.getAllByRole('button', { name: 'Fixar', exact: true });
    await user.click(pins[0]!);
    await user.click(pins[1]!);
    expect(screen.getByRole('table')).toBeTruthy();
    view.rerender(
      <SimulationDetail
        simulation={{ ...simulation, scenarios: [...simulation.scenarios!] }}
        leads={[]}
      />,
    );
    expect(screen.getByRole('columnheader', { name: /Cota 1/ })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /Cota 2/ })).toBeTruthy();
    await user.type(
      screen.getByLabelText('Buscar resultado'),
      'sem correspondência',
    );
    expect(screen.getByText('Nenhum resultado encontrado')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /Cota 1/ })).toBeTruthy();
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'Falha de teste' } }), {
        status: 503,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await user.click(
      screen.getByRole('button', { name: 'Recalcular', exact: true }),
    );
    await waitFor(() =>
      expect(
        within(screen.getByRole('columnheader', { name: /Cota 1/ })).getByRole(
          'alert',
        ).textContent,
      ).toContain('Resultado salvo preservado'),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ...simulation.scenarios![0],
          id: 'new-scenario',
          results: [
            fixture(1, { id: 'new-1', initialInstallment: '1234.50' }),
            fixture(2, { id: 'new-2' }),
          ],
        }),
        { status: 200 },
      ),
    );
    await user.click(
      screen.getByRole('button', { name: 'Recalcular', exact: true }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('rowheader', { name: 'Parcela inicial calculada' })
          .parentElement?.textContent,
      ).toContain('1.234,50'),
    );
    expect(screen.getAllByRole('columnheader')).toHaveLength(3);
    expect(screen.queryByRole('alert')).toBeNull();
    await user.click(
      screen.getByRole('button', { name: 'Remover cota 1 da comparação' }),
    );
    expect(screen.getAllByRole('columnheader')).toHaveLength(2);
  });
});
