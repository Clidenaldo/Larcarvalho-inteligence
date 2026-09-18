'use client';

import type { SimulationResult, Simulation } from '@larcarvalho/shared';
import { useId, useState } from 'react';
import { formatBrl } from '../lib/formatters';
import {
  comparisonSorts,
  QUOTA_COMPARISON_LIMIT,
  sortComparison,
  type ComparisonSort,
} from '../lib/quota-comparison';
import { AiAnalyzeButton } from './ai-analyze-button';
import { Button } from './ui/button';
import { Card } from './ui/card';

const missing = 'Não informado';
const cash = (value: string | null) =>
  value === null ? missing : formatBrl(Number(value));
const months = (value: number | null) =>
  value === null ? missing : `${value} meses`;
const date = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString('pt-BR') : missing;
const percent = (value: string | number | null) =>
  value === null ? missing : `${Number(value).toLocaleString('pt-BR')}%`;
type Row = readonly [string, (result: SimulationResult) => string];
const absent: Row[1] = () => missing;
const sections: readonly { title: string; rows: readonly Row[] }[] = [
  {
    title: 'Identificação',
    rows: [
      ['Administradora', (r) => r.administratorName],
      ['Produto', (r) => r.productName ?? missing],
      ['Categoria do bem', (r) => r.category],
      ['Grupo', (r) => r.groupCode ?? missing],
      ['Número da cota', (r) => r.quotaNumber ?? missing],
      ['Identificador interno', (r) => r.quotaId ?? r.id],
      ['Status da cota', absent],
      ['Data-base dos dados', (r) => date(r.sourceDataUpdatedAt)],
      [
        'Fonte dos dados',
        () =>
          'Resultado persistido da simulação; regras comerciais versionadas',
      ],
    ],
  },
  {
    title: 'Crédito e plano',
    rows: [
      ['Crédito contratado', (r) => cash(r.contractedCredit)],
      ['Crédito líquido', (r) => cash(r.netCredit)],
      ['Prazo total', (r) => months(r.totalTermMonths)],
      ['Prazo restante', (r) => months(r.remainingTermMonths)],
      [
        'Parcelas pagas',
        (r) => r.comparisonContext?.paidInstallments?.toString() ?? missing,
      ],
      ['Parcela inicial calculada', (r) => cash(r.initialInstallment)],
      ['Parcela atual da cota', absent],
      ['Parcela posterior calculada', (r) => cash(r.laterInstallment)],
      ['Parcela reduzida calculada', (r) => cash(r.reducedInstallment)],
      [
        'Tipo de parcela',
        (r) =>
          r.comparisonContext?.reducedUntilContemplation === true
            ? 'Reduzida até contemplação, conforme regra'
            : r.comparisonContext?.reducedUntilContemplation === false
              ? 'Sem redução até contemplação nesta regra'
              : missing,
      ],
      ['Taxa administrativa (valor)', (r) => cash(r.administrationFee)],
      [
        'Taxa administrativa (%)',
        (r) => percent(r.comparisonContext?.administrationFeePercent ?? null),
      ],
      ['Fundo de reserva (valor)', (r) => cash(r.reserveFund)],
      [
        'Seguro (valor)',
        (r) =>
          r.comparisonContext?.includeInsurance === false
            ? 'Não aplicável — excluído deste cálculo'
            : cash(r.insurance),
      ],
      ['Taxa de adesão (valor)', (r) => cash(r.adhesionFee)],
      ['Reajuste ou índice', absent],
    ],
  },
  {
    title: 'Lance e contemplação',
    rows: [
      ['Lance próprio', (r) => cash(r.ownBidAmount)],
      ['Lance embutido', (r) => cash(r.embeddedBidAmount)],
      ['Lance total em reais', (r) => cash(r.totalBidAmount)],
      ['Lance total em percentual', (r) => percent(r.totalBidPercent)],
      [
        'Limite de lance embutido',
        (r) => percent(r.comparisonContext?.maxEmbeddedBidPercent ?? null),
      ],
      ['Mês de contemplação simulado', absent],
      ['Crédito após contemplação', absent],
      [
        'Diluição pós-contemplação',
        (r) =>
          r.comparisonContext?.diluteReducedInstallments === true
            ? 'Prevista na regra salva'
            : r.comparisonContext?.diluteReducedInstallments === false
              ? 'Não aplicável — não prevista na regra salva'
              : missing,
      ],
      ['Contemplação confirmada', absent],
    ],
  },
  {
    title: 'Grupo e assembleia',
    rows: [
      ['Situação do grupo', absent],
      ['Início do grupo', absent],
      ['Encerramento do grupo', absent],
      ['Assembleia atual ou próxima', absent],
      ['Participantes', absent],
      ['Histórico de lances', absent],
      ['Contemplações anteriores', absent],
    ],
  },
  {
    title: 'Avaliação comercial',
    rows: [
      ['Índice de aderência', (r) => percent(r.adherenceScore)],
      [
        'Qualidade do cálculo',
        (r) =>
          ({
            COMPLETE: 'Completo',
            INCOMPLETE_DATA: 'Pendente de configuração — dados incompletos',
            INELIGIBLE: 'Não elegível',
          })[r.calculationStatus],
      ],
      [
        'Pontos de atenção e pendências',
        (r) =>
          r.calculationWarnings.join('; ') ||
          'Nenhum aviso registrado no cálculo',
      ],
      ['Critérios e premissas', (r) => r.assumptions.join('; ') || missing],
      ['Versão da regra comercial', (r) => r.ruleVersion],
    ],
  },
];

export function QuotaComparison({
  results,
  scenarios = [],
  onRemove,
  loadingIds = [],
  errors = {},
  simulationId,
}: {
  readonly results: SimulationResult[];
  readonly scenarios?: NonNullable<Simulation['scenarios']>;
  readonly onRemove: (id: string) => void;
  readonly loadingIds?: string[];
  readonly errors?: Readonly<Record<string, string>>;
  readonly simulationId?: string;
}) {
  const [sort, setSort] = useState<ComparisonSort>('selection');
  const id = useId();
  const ordered = sortComparison(results, sort);
  const highlights = (result: SimulationResult) =>
    Object.entries(comparisonSorts).flatMap(([key, label]) => {
      if (key === 'selection') return [];
      const criterion = key as Exclude<ComparisonSort, 'selection'>;
      const eligible = results.filter(
        (r) => r.calculationStatus === 'COMPLETE' && r[criterion] !== null,
      );
      const sorted = sortComparison(eligible, criterion);
      return eligible.length > 1 &&
        result.calculationStatus === 'COMPLETE' &&
        result[criterion] !== null &&
        Number(result[criterion]) === Number(sorted[0]?.[criterion]) &&
        eligible.some((r) => Number(r[criterion]) !== Number(result[criterion]))
        ? [label]
        : [];
    });
  return (
    <Card className="min-w-0 p-4 sm:p-5">
      <h3 className="text-lg font-semibold" id={`${id}-title`}>
        Comparação de cotas e resultados
      </h3>
      <p role="status">
        {results.length} de {QUOTA_COMPARISON_LIMIT} selecionados
        {results.length === QUOTA_COMPARISON_LIMIT
          ? ' — limite atingido. Remova um resultado para selecionar outro.'
          : ''}
      </p>
      {results.length < 2 && (
        <p>
          Selecione pelo menos duas cotas nos resultados abaixo para comparar
          lado a lado.
        </p>
      )}
      <p
        className="my-2 text-sm text-[var(--color-muted)]"
        id={`${id}-description`}
      >
        Valores do cálculo salvo. Dados ausentes não equivalem a zero. Destaques
        consideram somente resultados completos selecionados com valores
        disponíveis e não garantem contemplação ou aprovação.
      </p>
      {simulationId && results.length > 0 ? (
        <div className="my-2 print:hidden">
          <AiAnalyzeButton
            contextId={simulationId}
            contextType="COMPARATOR"
            label="Analisar com IA"
            message="Analisar comparação"
            promptId="comparison-analysis"
            resultIds={results.map((result) => result.id)}
          />
        </div>
      ) : null}
      {results.length > 0 && (
        <>
          <label className="my-3 block print:hidden">
            Ordenar comparação
            <select
              className="ml-2 rounded border p-2 focus-visible:outline-2"
              value={sort}
              onChange={(event) =>
                setSort(event.target.value as ComparisonSort)
              }
            >
              {Object.entries(comparisonSorts).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div
            className="quota-comparison-scroll"
            role="region"
            aria-labelledby={`${id}-title`}
            aria-describedby={`${id}-description`}
            tabIndex={0}
          >
            <table className="quota-comparison-grid">
              <caption className="sr-only">
                Cotas lado a lado, com critérios comuns e valores dos snapshots
              </caption>
              <thead>
                <tr>
                  <th scope="col">Critério</th>
                  {ordered.map((r) => (
                    <th scope="col" key={r.id}>
                      <span>
                        {r.quotaId
                          ? `Cota ${r.quotaNumber ?? r.quotaId}`
                          : r.groupId
                            ? `Resultado do grupo ${r.groupCode ?? r.groupId}`
                            : `Resultado ${r.id}`}
                      </span>
                      <span className="mt-1 block text-sm font-normal">
                        {r.administratorName} · {r.productName ?? missing} ·
                        Grupo {r.groupCode ?? missing}
                      </span>
                      <span className="block text-xs font-normal">
                        Regra {r.ruleVersion}
                      </span>
                      {highlights(r).map((label) => (
                        <span className="my-1 block text-sm" key={label}>
                          ★ {label} entre os selecionados
                        </span>
                      ))}
                      {r.calculationStatus !== 'COMPLETE' && (
                        <span className="block text-sm">
                          ⚠{' '}
                          {r.calculationStatus === 'INELIGIBLE'
                            ? 'Não elegível'
                            : 'Dados incompletos'}
                        </span>
                      )}
                      {loadingIds.includes(r.id) && (
                        <span role="status">
                          Recalculando; exibindo resultado salvo.
                        </span>
                      )}
                      {errors[r.id] && (
                        <span role="alert">
                          {errors[r.id]} Resultado salvo preservado.
                        </span>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-2 print:hidden"
                        onClick={() => onRemove(r.id)}
                        aria-label={`Remover ${r.quotaId ? `cota ${r.quotaNumber ?? r.quotaId}` : `resultado ${r.id}`} da comparação`}
                      >
                        Remover
                      </Button>
                    </th>
                  ))}
                </tr>
              </thead>
              {sections.map((section) => (
                <tbody key={section.title}>
                  <tr className="quota-comparison-section">
                    <th scope="row">{section.title}</th>
                    {ordered.map((r) => (
                      <td key={r.id}>
                        <span className="sr-only">{section.title}</span>
                      </td>
                    ))}
                  </tr>
                  {section.rows.map(([label, value]) => (
                    <tr key={label}>
                      <th scope="row">{label}</th>
                      {ordered.map((r) => (
                        <td key={r.id}>{value(r)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ))}
              <tbody>
                <tr>
                  <th scope="row">Data e hora do cálculo</th>
                  {ordered.map((r) => (
                    <td key={r.id}>
                      {date(
                        scenarios.find((s) =>
                          s.results.some((item) => item.id === r.id),
                        )?.calculatedAt,
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}
