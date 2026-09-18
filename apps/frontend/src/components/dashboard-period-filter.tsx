'use client';
import { HelpLabel } from './ui/field-help';

import type { DashboardQuery } from '@larcarvalho/shared';
import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { Button } from './ui/button';

export function DashboardPeriodFilter({
  query,
}: {
  readonly query: DashboardQuery;
}) {
  const router = useRouter();
  const [period, setPeriod] = useState(query.period);
  const [from, setFrom] = useState(query.from ?? '');
  const [to, setTo] = useState(query.to ?? '');
  function submit(event: FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams({ period });
    if (period === 'custom') {
      params.set('from', from);
      params.set('to', to);
    }
    router.push(`/dashboard?${params}`);
  }
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={submit}>
      <HelpLabel
        helpKey="filter.period"
        className="grid gap-1 text-xs font-semibold text-[var(--color-text-soft)]"
      >
        Período
        <select
          aria-label="Período do dashboard"
          className="min-h-10 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-white px-3 text-sm"
          onChange={(event) =>
            setPeriod(event.target.value as DashboardQuery['period'])
          }
          value={period}
        >
          <option value="today">Hoje</option>
          <option value="7d">7 dias</option>
          <option value="30d">30 dias</option>
          <option value="90d">90 dias</option>
          <option value="custom">Personalizado</option>
        </select>
      </HelpLabel>
      {period === 'custom' ? (
        <>
          <HelpLabel
            helpKey="filter.date"
            className="grid gap-1 text-xs font-semibold text-[var(--color-text-soft)]"
          >
            De
            <input
              className="min-h-10 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-white px-3 text-sm"
              onChange={(event) => setFrom(event.target.value)}
              required
              type="date"
              value={from}
            />
          </HelpLabel>
          <HelpLabel
            helpKey="filter.date"
            className="grid gap-1 text-xs font-semibold text-[var(--color-text-soft)]"
          >
            Até
            <input
              className="min-h-10 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-white px-3 text-sm"
              onChange={(event) => setTo(event.target.value)}
              required
              type="date"
              value={to}
            />
          </HelpLabel>
        </>
      ) : null}
      <Button type="submit" variant="outline">
        Aplicar
      </Button>
      <Button
        aria-label="Atualizar dados"
        onClick={() => router.refresh()}
        type="button"
        variant="ghost"
      >
        <RefreshCw aria-hidden="true" className="h-4 w-4" />
        Atualizar
      </Button>
    </form>
  );
}
