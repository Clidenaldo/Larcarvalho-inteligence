'use client';

import { useEffect, useState } from 'react';

import { Alert } from './ui/alert';
import { Badge } from './ui/badge';
import { Card } from './ui/card';

interface UsageSummary {
  costMicros: number | null;
  currency: string | null;
  requests: number;
  tokensToday: number;
  inputTokens: number;
  outputTokens: number;
  warning: string | null;
}

interface UsageRow {
  contextType: string;
  costMicros: number | null;
  createdAt: string;
  currency: string | null;
  id: string;
  model: string;
  provider: string;
  status: string;
  totalTokens: number | null;
}

function formatCost(micros: number | null, currency: string | null): string {
  if (micros === null || micros === undefined)
    return 'Custo não configurado';
  return `${(micros / 1_000_000).toFixed(6)} ${currency ?? ''}`.trim();
}

export function AiUsageDashboard() {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [rows, setRows] = useState<readonly UsageRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/ai/usage/summary', { headers: { accept: 'application/json' } }),
      fetch('/api/ai/usage?page=1&pageSize=20', {
        headers: { accept: 'application/json' },
      }),
    ])
      .then(async ([summaryResponse, listResponse]) => {
        if (!summaryResponse.ok || !listResponse.ok || cancelled) {
          if (!cancelled) setError('Sem permissão para visualizar o uso (ai.usage).');
          return;
        }
        const summaryJson = (await summaryResponse.json()) as UsageSummary;
        const listJson = (await listResponse.json()) as { items: UsageRow[] };
        if (!cancelled) {
          setSummary(summaryJson);
          setRows(listJson.items ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) setError('Falha ao carregar o uso de IA.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card className="space-y-3 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">Uso de IA — hoje</h3>
        {summary?.warning ? <Badge tone="neutral">{summary.warning}</Badge> : null}
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {summary ? (
        <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-[var(--color-muted)]">Requisições</dt>
            <dd className="font-medium">{summary.requests}</dd>
          </div>
          <div>
            <dt className="text-[var(--color-muted)]">Tokens (in/out)</dt>
            <dd className="font-medium">
              {summary.inputTokens} / {summary.outputTokens}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--color-muted)]">Custo estimado</dt>
            <dd className="font-medium">
              {formatCost(summary.costMicros, summary.currency)}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--color-muted)]">Tokens hoje</dt>
            <dd className="font-medium">{summary.tokensToday}</dd>
          </div>
        </dl>
      ) : null}
      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs tracking-wide text-[var(--color-muted)] uppercase">
                <th className="py-2 pr-3">Quando</th>
                <th className="py-2 pr-3">Provedor/modelo</th>
                <th className="py-2 pr-3">Contexto</th>
                <th className="py-2 pr-3">Tokens</th>
                <th className="py-2 pr-3">Custo</th>
                <th className="py-2 pr-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-[var(--color-border)]">
                  <td className="py-2 pr-3">
                    {new Date(row.createdAt).toLocaleString('pt-BR')}
                  </td>
                  <td className="py-2 pr-3">
                    {row.provider}/{row.model}
                  </td>
                  <td className="py-2 pr-3">{row.contextType}</td>
                  <td className="py-2 pr-3">{row.totalTokens ?? '—'}</td>
                  <td className="py-2 pr-3">
                    {formatCost(row.costMicros, row.currency)}
                  </td>
                  <td className="py-2 pr-3">{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Card>
  );
}
