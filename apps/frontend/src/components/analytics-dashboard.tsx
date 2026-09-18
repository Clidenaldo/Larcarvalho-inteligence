'use client';
import { HelpLabel } from './ui/field-help';
import { Field } from './ui/field';

import { useEffect, useState } from 'react';
import type { AnalyticsOverview } from '@larcarvalho/shared';

type Period = 'today' | '7d' | '30d' | '90d' | 'custom';
const percentage = (value: number | null) =>
  value === null ? '—' : `${(value * 100).toFixed(1)}%`;
export function AnalyticsDashboard() {
  const [period, setPeriod] = useState<Period>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  useEffect(() => {
    setStatus('loading');
    const query =
      period === 'custom' && customFrom && customTo
        ? `period=custom&from=${encodeURIComponent(new Date(`${customFrom}T00:00:00-03:00`).toISOString())}&to=${encodeURIComponent(new Date(`${customTo}T23:59:59-03:00`).toISOString())}`
        : `period=${period}`;
    if (period === 'custom' && (!customFrom || !customTo)) {
      setStatus('ready');
      return;
    }
    void fetch(`/api/analytics/overview?${query}`)
      .then((response) => {
        if (!response.ok) throw new Error('analytics');
        return response.json() as Promise<AnalyticsOverview>;
      })
      .then(
        (value) => {
          setData(value);
          setStatus('ready');
        },
        () => setStatus('error'),
      );
  }, [period, customFrom, customTo]);
  if (status === 'loading')
    return (
      <main className="p-8" aria-busy="true">
        Carregando analytics…
      </main>
    );
  if (status === 'error')
    return (
      <main className="p-8 text-red-700" role="alert">
        Não foi possível carregar os analytics.
      </main>
    );
  if (!data) return <main className="p-8">Nenhum dado disponível.</main>;
  const steps = [
    ['Visitas', data.visits],
    ['Simulações iniciadas', data.simulationsStarted],
    ['Simulações concluídas', data.simulationsCompleted],
    ['Resultados', data.resultsViewed],
    ['Formulários', data.formsOpened],
    ['Leads', data.leads],
  ] as const;
  const funnelRates: readonly (number | null)[] = [
    data.rates.landingToSimulation,
    data.rates.startedToCompleted,
    data.rates.resultsToForm,
    data.rates.formToLead,
    data.rates.completedToLead,
  ];
  const table = (
    title: string,
    headers: string[],
    rows: Array<Array<string | number>>,
  ) => (
    <section>
      <h2 className="mb-2 text-lg font-bold">{title}</h2>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {headers.map((header) => (
                <th className="p-3" key={header}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row, index) => (
                <tr className="border-t" key={index}>
                  {row.map((cell, cellIndex) => (
                    <td className="p-3" key={cellIndex}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td className="p-3" colSpan={headers.length}>
                  Sem dados no período.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
  return (
    <main className="mx-auto max-w-7xl space-y-8 p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Analytics first-party</h1>
        <div>
          <HelpLabel helpKey="filter.period">
            Período{' '}
            <select
              className="ml-2 rounded border p-2"
              value={period}
              onChange={(event) => setPeriod(event.target.value as Period)}
            >
              {[
                ['today', 'Hoje'],
                ['7d', '7 dias'],
                ['30d', '30 dias'],
                ['90d', '90 dias'],
                ['custom', 'Personalizado'],
              ].map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </HelpLabel>
          {period === 'custom' && (
            <div className="ml-2 flex flex-wrap gap-2">
              <Field label="De" helpKey="filter.date">
                <input
                  aria-label="De"
                  type="date"
                  value={customFrom}
                  onChange={(event) => setCustomFrom(event.target.value)}
                />
              </Field>
              <Field label="Até" helpKey="filter.date">
                <input
                  aria-label="Até"
                  type="date"
                  value={customTo}
                  onChange={(event) => setCustomTo(event.target.value)}
                />
              </Field>
            </div>
          )}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {steps.map(([label, value]) => (
          <section className="rounded-xl border p-4" key={label}>
            <p className="text-sm text-slate-500">{label}</p>
            <strong className="text-3xl">{value}</strong>
          </section>
        ))}
      </div>
      <section>
        <h2 className="mb-3 text-lg font-bold">Funil</h2>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {steps.map(([label, value], index) => (
            <div className="rounded border p-3" key={label}>
              <span>{label}</span>
              <strong className="block text-xl">{value}</strong>
              {index > 0 && (
                <small>{percentage(funnelRates[index - 1] ?? null)}</small>
              )}
            </div>
          ))}
        </div>
      </section>
      <p>
        Landing → Lead: <strong>{percentage(data.rates.landingToLead)}</strong>{' '}
        · WhatsApp: <strong>{data.whatsappClicks}</strong>
      </p>
      {table(
        'Campanhas',
        [
          'Campanha',
          'Origem',
          'Medium',
          'Visitas',
          'Simulações',
          'Leads',
          'Conversão',
        ],
        data.campaigns.map((x) => [
          x.campaign,
          x.source,
          x.medium,
          x.visits,
          x.simulations,
          x.leads,
          percentage(x.conversion),
        ]),
      )}
      {table(
        'Canais',
        [
          'Origem',
          'Medium',
          'Referrer',
          'Visitas',
          'Simulações',
          'Leads',
          'Conversão',
        ],
        data.channels.map((x) => [
          x.source,
          x.medium,
          x.referrerHost,
          x.visits,
          x.simulations,
          x.leads,
          percentage(x.conversion),
        ]),
      )}
      <div className="grid gap-8 lg:grid-cols-2">
        {table(
          'Categorias',
          ['Categoria', 'Simulações', 'Leads', 'Conversão'],
          data.categories.map((x) => [
            x.label,
            x.simulations,
            x.leads,
            percentage(x.conversion),
          ]),
        )}
        {table(
          'Dispositivos',
          ['Dispositivo', 'Visitas', 'Simulações', 'Leads', 'Conversão'],
          data.devices.map((x) => [
            x.device,
            x.visits,
            x.simulations,
            x.leads,
            percentage(x.conversion),
          ]),
        )}
      </div>
    </main>
  );
}
