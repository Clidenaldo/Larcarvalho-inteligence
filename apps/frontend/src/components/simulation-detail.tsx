'use client';
import { HelpLabel } from './ui/field-help';
import { QuotaComparison } from './quota-comparison';
import {
  selectComparisonResult,
  reconcileComparison,
  QUOTA_COMPARISON_LIMIT,
} from '../lib/quota-comparison';

import type {
  Lead,
  Simulation,
  SimulationResult,
  SimulationResultBadge,
} from '@larcarvalho/shared';
import {
  Copy,
  FileDown,
  FilePlus2,
  Heart,
  Pin,
  Printer,
  Shield,
  Star,
  TrendingUp,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { formatBrl } from '../lib/formatters';
import { cn } from '../lib/styles';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Field, Input, Select } from './ui/field';
import { EmptyState } from './ui/empty-state';

const money = (value: string | null) =>
  value === null ? 'Não informado' : formatBrl(Number(value));

const statusLabels = {
  COMPLETE: 'Completo',
  INCOMPLETE_DATA: 'Dados incompletos',
  INELIGIBLE: 'Não elegível',
} as const;

const badgeLabels: Record<SimulationResultBadge, string> = {
  BEST_ADHERENCE: 'Melhor aderência',
  HIGHEST_NET_CREDIT: 'Maior crédito líquido',
  INELIGIBLE: 'Não elegível',
  LOWEST_INSTALLMENT: 'Menor parcela',
  PENDING_DATA: 'Dados pendentes',
  SHORTEST_TERM: 'Menor prazo',
};

const statusClass = {
  COMPLETE: 'border-[var(--color-primary)]/25 bg-white',
  INCOMPLETE_DATA: 'border-amber-500/40 bg-amber-50/40',
  INELIGIBLE: 'border-red-500/30 bg-red-50/40 opacity-90',
} as const;

function metric(
  _result: SimulationResult,
  label: string,
  value: string | number | null,
) {
  return (
    <div>
      <dt className="text-[var(--color-muted)]">{label}</dt>
      <dd
        className={
          label.startsWith('Crédito') || label === 'Parcela inicial'
            ? 'monetary-value'
            : 'font-semibold tabular-nums'
        }
      >
        {value ?? 'Não informado'}
      </dd>
    </div>
  );
}

function ResultBadges({ result }: { readonly result: SimulationResult }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge
        tone={
          result.calculationStatus === 'COMPLETE'
            ? 'success'
            : result.calculationStatus === 'INCOMPLETE_DATA'
              ? 'warning'
              : 'danger'
        }
      >
        {statusLabels[result.calculationStatus]}
      </Badge>
      {result.badges.map((badge) => (
        <Badge
          key={badge}
          tone={
            badge === 'PENDING_DATA'
              ? 'warning'
              : badge === 'INELIGIBLE'
                ? 'danger'
                : 'info'
          }
        >
          {badgeLabels[badge]}
        </Badge>
      ))}
    </div>
  );
}

function ResultCard({
  pinned,
  result,
  onPin,
}: {
  readonly pinned: boolean;
  readonly result: SimulationResult;
  readonly onPin: () => void;
}) {
  return (
    <article
      className={cn(
        'result-card min-w-0 rounded-2xl border p-5 shadow-[var(--shadow-sm)]',
        statusClass[result.calculationStatus],
        pinned && 'ring-2 ring-[var(--color-primary)]/20',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-primary)]">
            {result.administratorName}
          </p>
          <h4 className="mt-1 text-lg font-semibold">
            {result.productName ?? 'Regra por categoria'}
          </h4>
          <p className="text-sm text-[var(--color-muted)]">
            {result.quotaId
              ? `Grupo ${result.groupCode ?? 'Não informado'} / Cota ${result.quotaNumber ?? result.quotaId}`
              : result.groupId
                ? `Grupo ${result.groupCode ?? result.groupId}`
                : 'Resultado sem vínculo com uma cota'}
          </p>
        </div>
        <Button
          aria-pressed={pinned}
          onClick={onPin}
          type="button"
          variant={pinned ? 'primary' : 'outline'}
        >
          <Pin className="h-4 w-4" /> {pinned ? 'Fixado' : 'Fixar'}
        </Button>
      </div>
      <div className="mt-4">
        <ResultBadges result={result} />
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
        {metric(result, 'Categoria', result.category)}
        {metric(
          result,
          'Produto / grupo / cota',
          [result.productName, result.groupCode, result.quotaNumber]
            .filter(Boolean)
            .join(' / ') || 'Não informado',
        )}
        {metric(result, 'Crédito contratado', money(result.contractedCredit))}
        {metric(result, 'Crédito líquido', money(result.netCredit))}
        {metric(result, 'Parcela inicial', money(result.initialInstallment))}
        {metric(result, 'Parcela posterior', money(result.laterInstallment))}
        {metric(
          result,
          'Prazo total',
          result.totalTermMonths === null
            ? 'Não informado'
            : `${result.totalTermMonths} meses`,
        )}
        {metric(
          result,
          'Prazo restante',
          result.remainingTermMonths === null
            ? 'Não informado'
            : `${result.remainingTermMonths} meses`,
        )}
        {metric(result, 'Lance próprio', money(result.ownBidAmount))}
        {metric(result, 'Lance embutido', money(result.embeddedBidAmount))}
        {metric(
          result,
          'Lance total',
          `${money(result.totalBidAmount)} (${result.totalBidPercent === null ? 'percentual não informado' : `${Number(result.totalBidPercent).toLocaleString('pt-BR')}%`})`,
        )}
        {metric(
          result,
          'Aderência',
          result.adherenceScore === null
            ? 'Não informado'
            : `${result.adherenceScore}%`,
        )}
        {metric(result, 'Vigência da tabela', 'Não informada neste resultado')}
      </dl>
      <details className="mt-5 rounded-xl bg-white/70 p-4 text-sm">
        <summary className="font-semibold">Taxas, avisos e premissas</summary>
        <dl className="mt-3 grid grid-cols-2 gap-3">
          {metric(
            result,
            'Taxa administrativa',
            money(result.administrationFee),
          )}
          {metric(result, 'Fundo de reserva', money(result.reserveFund))}
          {metric(result, 'Seguro', money(result.insurance))}
          {metric(result, 'Taxa de adesão', money(result.adhesionFee))}
        </dl>
        {result.calculationWarnings.length ? (
          <ul className="mt-3 list-disc pl-5 text-amber-800">
            {result.calculationWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
        <ul className="mt-3 list-disc pl-5 text-[var(--color-muted)]">
          {result.assumptions.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          Regra {result.ruleVersion} · fonte atualizada em{' '}
          {new Date(result.sourceDataUpdatedAt).toLocaleString('pt-BR')}
        </p>
      </details>
    </article>
  );
}

function ScenarioResults({
  results,
  pinnedIds,
  onPin,
}: {
  readonly results: SimulationResult[];
  readonly pinnedIds: string[];
  readonly onPin: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const [page, setPage] = useState(1);
  const filtered = results.filter(
    (result) =>
      (status === 'ALL' || result.calculationStatus === status) &&
      `${result.administratorName} ${result.productName ?? ''} ${result.groupCode ?? ''} ${result.quotaNumber ?? ''}`
        .toLocaleLowerCase('pt-BR')
        .includes(query.toLocaleLowerCase('pt-BR')),
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / 6));
  const currentPage = Math.min(page, totalPages);
  return (
    <>
      <div className="mb-4 grid gap-3 rounded-xl bg-[var(--color-primary-soft)] p-4 print:hidden sm:grid-cols-2">
        <Field label="Buscar resultado">
          <Input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Administradora, produto, grupo ou cota"
          />
        </Field>
        <Field helpKey="simulation.dataStatus" label="Status dos dados">
          <Select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="ALL">Todos os resultados</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <p role="status" className="mb-3 text-sm text-[var(--color-muted)]">
        {filtered.length} resultados encontrados
      </p>
      {filtered.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {filtered.map((result, index) => (
            <div
              key={result.id}
              className={
                index >= (currentPage - 1) * 6 && index < currentPage * 6
                  ? ''
                  : 'hidden print:block'
              }
            >
              <ResultCard
                pinned={pinnedIds.includes(result.id)}
                result={result}
                onPin={() => onPin(result.id)}
              />
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Nenhum resultado encontrado"
          description="Revise os filtros ou recalcule o cenário com os critérios desejados."
        />
      )}
      {totalPages > 1 ? (
        <nav
          aria-label="Paginação de resultados"
          className="mt-4 flex items-center justify-between gap-3 print:hidden"
        >
          <Button
            variant="outline"
            disabled={currentPage === 1}
            onClick={() => setPage(currentPage - 1)}
          >
            Anterior
          </Button>
          <span className="text-sm">
            Página {currentPage} de {totalPages}
          </span>
          <Button
            variant="outline"
            disabled={currentPage === totalPages}
            onClick={() => setPage(currentPage + 1)}
          >
            Próxima
          </Button>
        </nav>
      ) : null}
    </>
  );
}

export function SimulationDetail({
  simulation,
  leads,
}: {
  readonly simulation: Simulation;
  readonly leads: Lead[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recalculating, setRecalculating] = useState(false);
  const [comparisonErrors, setComparisonErrors] = useState<
    Record<string, string>
  >({});
  const [selectionNotice, setSelectionNotice] = useState('');
  const [latestScenario, setLatestScenario] = useState<
    NonNullable<Simulation['scenarios']>[number] | null
  >(null);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const scenarios = useMemo(
    () =>
      latestScenario &&
      !(simulation.scenarios ?? []).some(
        (item) => item.id === latestScenario.id,
      )
        ? [latestScenario, ...(simulation.scenarios ?? [])]
        : (simulation.scenarios ?? []),
    [latestScenario, simulation.scenarios],
  );
  const allResults = useMemo(
    () => scenarios.flatMap((scenario) => scenario.results),
    [scenarios],
  );
  const pinnedResults = pinnedIds.flatMap((id) => {
    const result = allResults.find((item) => item.id === id);
    return result ? [result] : [];
  });

  const request = async (path: string, init: RequestInit) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(path, {
        ...init,
        headers: { 'content-type': 'application/json', ...init.headers },
      });
      if (!response.ok) {
        const payload = (await response.json()) as {
          error?: { message?: string };
        };
        throw new Error(payload.error?.message ?? 'Operação não concluída');
      }
      return response;
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Falha inesperada');
      throw problem;
    } finally {
      setBusy(false);
    }
  };

  const togglePinned = (id: string) => {
    const candidate = allResults.find((item) => item.id === id);
    if (!candidate) return;
    const next = selectComparisonResult(pinnedIds, candidate, allResults);
    setSelectionNotice(
      next === pinnedIds
        ? `Não foi adicionada: esta cota já está selecionada ou o limite foi atingido. Você pode comparar até ${QUOTA_COMPARISON_LIMIT} cotas por vez.`
        : '',
    );
    setPinnedIds(next);
  };

  const favorite = async () => {
    await request(`/api/simulations/${simulation.id}/favorite`, {
      method: simulation.favorite ? 'DELETE' : 'POST',
    });
    router.refresh();
  };
  const print = async () => {
    try {
      await request(`/api/simulations/${simulation.id}/print`, {
        method: 'POST',
      });
      window.print();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Falha inesperada');
    }
  };
  const exportCsv = async (scenarioId: string) => {
    try {
      const response = await request(
        `/api/simulations/${simulation.id}/scenarios/${scenarioId}/csv`,
        { method: 'GET' },
      );
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') ?? '';
      const match = /filename="([^"]+)"/.exec(disposition);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = match?.[1] ?? 'comparacao.csv';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Falha inesperada');
    }
  };
  const duplicate = async () => {
    const created = await request('/api/simulations', {
      method: 'POST',
      body: JSON.stringify({
        category: simulation.category,
        creditMode: simulation.creditMode,
        requestedCredit: simulation.requestedCredit,
        desiredTermMonths: simulation.desiredTermMonths,
        ownBidAmount: simulation.ownBidAmount,
        embeddedBidPercent: simulation.embeddedBidPercent,
        paidInstallments: simulation.paidInstallments,
        structuredOperation: simulation.structuredOperation,
        administratorIds: simulation.administratorIds,
        productIds: simulation.productIds,
        groupIds: simulation.groupIds,
        quotaIds: simulation.quotaIds,
        ...(simulation.leadId ? { leadId: simulation.leadId } : {}),
        ...(simulation.notes ? { notes: simulation.notes } : {}),
        sort: 'ADHERENCE',
      }),
    });
    const copy = (await created?.json()) as Simulation;
    await request(`/api/simulations/${copy.id}/calculate`, {
      method: 'POST',
      body: JSON.stringify({
        sort: 'ADHERENCE',
        scenarioName: 'Cenário duplicado',
        pin: true,
      }),
    });
    router.push(`/simulacoes/${copy.id}`);
    router.refresh();
  };
  const recalculate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const term = data.get('termMonths');
    setRecalculating(true);
    setComparisonErrors({});
    try {
      const response = await request(
        `/api/simulations/${simulation.id}/calculate`,
        {
          method: 'POST',
          body: JSON.stringify({
            scenarioName: data.get('scenarioName'),
            sort: data.get('sort'),
            pin: data.get('pin') === 'on',
            ...(term && Number(term) > 0 ? { termMonths: Number(term) } : {}),
            includeInsurance: data.get('includeInsurance') !== 'off',
            includeEmbeddedBid: data.get('includeEmbeddedBid') !== 'off',
          }),
        },
      );
      const scenario = (await response.json()) as NonNullable<
        Simulation['scenarios']
      >[number];
      setLatestScenario(scenario);
      setPinnedIds((current) =>
        reconcileComparison(current, allResults, scenario.results),
      );
      router.refresh();
    } catch (problem) {
      const message =
        problem instanceof Error ? problem.message : 'Falha ao recalcular';
      setComparisonErrors(
        Object.fromEntries(pinnedIds.map((id) => [id, message])),
      );
    } finally {
      setRecalculating(false);
    }
  };
  const createProposal = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const completeIds = pinnedResults
      .filter((result) => result.calculationStatus === 'COMPLETE')
      .map((result) => result.id);
    const response = await request(
      `/api/simulations/${simulation.id}/proposals`,
      {
        method: 'POST',
        body: JSON.stringify({
          leadId: data.get('leadId'),
          resultIds: completeIds,
          title: data.get('title'),
          objectiveSummary: data.get('objectiveSummary'),
          ...(data.get('notes') ? { notes: data.get('notes') } : {}),
        }),
      },
    );
    const proposal = (await response?.json()) as { id: string };
    router.push(`/propostas/${proposal.id}`);
    router.refresh();
  };

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap gap-3 print:hidden">
        <Button
          disabled={busy}
          onClick={() => void favorite()}
          variant="outline"
        >
          <Heart
            className={`h-4 w-4 ${simulation.favorite ? 'fill-current' : ''}`}
          />{' '}
          {simulation.favorite ? 'Desfavoritar' : 'Favoritar'}
        </Button>
        <Button
          disabled={busy}
          onClick={() => void duplicate()}
          variant="outline"
        >
          <Copy className="h-4 w-4" /> Duplicar
        </Button>
        <Button disabled={busy} onClick={() => void print()} variant="outline">
          <Printer className="h-4 w-4" /> Imprimir
        </Button>
      </div>
      {error ? (
        <p
          className="rounded-xl bg-red-50 p-4 text-sm text-[var(--color-danger)]"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <Card className="p-5 sm:p-7">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-sm text-[var(--color-muted)]">Número</dt>
            <dd className="font-semibold">{simulation.number}</dd>
          </div>
          <div>
            <dt className="text-sm text-[var(--color-muted)]">Cliente</dt>
            <dd className="font-semibold">
              {simulation.leadName ?? 'Não vinculado'}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-[var(--color-muted)]">Objetivo</dt>
            <dd className="font-semibold">
              {money(simulation.requestedCredit)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-[var(--color-muted)]">Prazo</dt>
            <dd className="font-semibold">
              {simulation.desiredTermMonths} meses
            </dd>
          </div>
        </dl>
      </Card>
      {selectionNotice && <p role="status">{selectionNotice}</p>}
      <QuotaComparison
        results={pinnedResults}
        scenarios={scenarios}
        simulationId={simulation.id}
        onRemove={(id) => {
          setPinnedIds((current) => current.filter((item) => item !== id));
          setSelectionNotice('');
        }}
        loadingIds={recalculating ? pinnedIds : []}
        errors={comparisonErrors}
      />
      <form
        className="grid gap-4 rounded-2xl border bg-white p-5 print:hidden md:grid-cols-3"
        onSubmit={recalculate}
      >
        <Field helpKey="simulation.name" label="Nome do cenário">
          <Input
            defaultValue={`Cenário ${scenarios.length + 1}`}
            name="scenarioName"
            required
          />
        </Field>
        <Field helpKey="simulation.term" label="Prazo deste cenário (meses)">
          <Input
            max="1200"
            min="1"
            name="termMonths"
            placeholder={String(simulation.desiredTermMonths)}
            type="number"
          />
        </Field>
        <Field helpKey="simulation.sort" label="Ordenação persistida">
          <Select name="sort">
            <option value="ADHERENCE">Maior aderência</option>
            <option value="LOWEST_INSTALLMENT">Menor parcela</option>
            <option value="HIGHEST_NET_CREDIT">Maior crédito líquido</option>
            <option value="SHORTEST_TERM">Menor prazo</option>
          </Select>
        </Field>
        <div className="flex flex-wrap items-center gap-4 md:col-span-2">
          <HelpLabel
            helpKey="simulation.insurance"
            className="flex items-center gap-2 text-sm"
          >
            <input
              defaultChecked
              name="includeInsurance"
              type="checkbox"
              value="on"
            />
            <Shield /> Incluir seguro
          </HelpLabel>
          <HelpLabel
            helpKey="simulation.includeEmbedded"
            className="flex items-center gap-2 text-sm"
          >
            <input
              defaultChecked
              name="includeEmbeddedBid"
              type="checkbox"
              value="on"
            />
            <TrendingUp /> Incluir lance embutido
          </HelpLabel>
          <HelpLabel
            helpKey="simulation.pin"
            className="flex items-center gap-2 text-sm"
          >
            <input name="pin" type="checkbox" /> <Pin className="h-4 w-4" />{' '}
            Fixar cenário
          </HelpLabel>
        </div>
        <Button className="self-end" disabled={busy} type="submit">
          Recalcular
        </Button>
      </form>
      {scenarios.map((scenario) => (
        <section key={scenario.id}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-semibold">{scenario.name}</h3>
            {scenario.pinned ? <Badge tone="info">Cenário fixado</Badge> : null}
            <Badge tone="neutral">{scenario.sort}</Badge>
            <span className="text-xs text-[var(--color-muted)]">
              {scenario.engineVersion}
            </span>
            {scenario.results.length ? (
              <Button
                disabled={busy}
                onClick={() => void exportCsv(scenario.id)}
                type="button"
                variant="outline"
              >
                <FileDown className="h-4 w-4" /> Exportar CSV
              </Button>
            ) : null}
          </div>
          <ScenarioResults
            results={scenario.results}
            pinnedIds={pinnedIds}
            onPin={togglePinned}
          />
        </section>
      ))}
      <Card className="p-5 print:hidden sm:p-7">
        <div className="flex items-center gap-2">
          <FilePlus2 className="h-5 w-5 text-[var(--color-primary)]" />
          <h3 className="text-lg font-semibold">Gerar proposta comercial</h3>
        </div>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          A proposta usa os resultados completos fixados na comparação.
          Selecione de um a três resultados completos para criar uma proposta.
        </p>
        <form
          className="mt-5 grid gap-4 md:grid-cols-2"
          onSubmit={createProposal}
        >
          <Field helpKey="proposal.client" label="Cliente" required>
            <Select
              defaultValue={simulation.leadId ?? ''}
              name="leadId"
              required
            >
              <option value="">Selecione</option>
              {leads.map((lead) => (
                <option key={lead.id} value={lead.id}>
                  {lead.nome}
                </option>
              ))}
            </Select>
          </Field>
          <Field helpKey="proposal.title" label="Título" required>
            <Input
              defaultValue="Proposta de consórcio personalizada"
              name="title"
              required
            />
          </Field>
          <div className="md:col-span-2">
            <Field
              helpKey="proposal.objective"
              label="Resumo do objetivo"
              required
            >
              <Input
                defaultValue={`Crédito ${simulation.creditMode === 'NET_CREDIT' ? 'líquido' : 'contratado'} de ${money(simulation.requestedCredit)} em ${simulation.desiredTermMonths} meses.`}
                minLength={10}
                name="objectiveSummary"
                required
              />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field helpKey="common.notes" label="Observações">
              <textarea
                className="min-h-20 w-full rounded-xl border p-3 text-sm"
                name="notes"
              />
            </Field>
          </div>
          <Button
            disabled={
              busy ||
              pinnedResults.filter(
                (result) => result.calculationStatus === 'COMPLETE',
              ).length > 3 ||
              !pinnedResults.some(
                (result) => result.calculationStatus === 'COMPLETE',
              )
            }
            type="submit"
          >
            <Star className="h-4 w-4" />
            Criar proposta (
            {
              pinnedResults.filter(
                (result) => result.calculationStatus === 'COMPLETE',
              ).length
            }
            )
          </Button>
        </form>
      </Card>
    </div>
  );
}
