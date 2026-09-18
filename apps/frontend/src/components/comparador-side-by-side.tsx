'use client';
import type {
  ComparadorGroup,
  CompararGruposResponse,
} from '@larcarvalho/shared';
import { X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { formatBrl, formatDate } from '../lib/formatters';
import {
  COMPARADOR_LIMIT,
  comparisonId,
  comparisonLabel,
} from './comparador-results';
import { Badge } from './ui/badge';
import { Card } from './ui/card';

const money = (value: string | null) =>
  value === null ? 'Dado indisponível' : formatBrl(Number(value));
const percentual = (value: string | null) =>
  value === null
    ? 'Dado indisponível'
    : `${Number(value).toLocaleString('pt-BR')}%`;
const modeLabels: Record<string, string> = {
  NORMAL: 'Normal',
  MAIS_POR_MENOS: 'Mais por menos',
  OUTRA: 'Outra',
};
const noHighlights = new Set<string>();

type HighlightKey =
  | 'maior-aderencia'
  | 'maior-credito'
  | 'menor-parcela'
  | 'menor-prazo'
  | 'menor-taxa';
const highlightLabels: Record<HighlightKey, string> = {
  'maior-aderencia': 'Maior aderência',
  'maior-credito': 'Maior crédito',
  'menor-parcela': 'Menor parcela',
  'menor-prazo': 'Menor prazo',
  'menor-taxa': 'Menor taxa administrativa',
};

interface Row {
  label: string;
  financeiro?: boolean;
  value: (item: ComparadorGroup) => ReactNode;
  highlight?: HighlightKey;
  available?: (item: ComparadorGroup) => boolean;
}

export function winnerIds(
  visible: ComparadorGroup[],
  mode: 'min' | 'max',
  extract: (item: ComparadorGroup) => number | null,
): Set<string> {
  const known = visible.flatMap((item) => {
    const value = extract(item);
    return value === null ? [] : [{ id: comparisonId(item), value }];
  });
  if (known.length < 2 || new Set(known.map((entry) => entry.value)).size < 2)
    return new Set();
  const target = mode === 'min' ? Math.min : Math.max;
  const best = target(...known.map((entry) => entry.value));
  return new Set(
    known.filter((entry) => entry.value === best).map((entry) => entry.id),
  );
}

const historyRows: Row[] = [
  {
    label: 'Assembleias',
    value: (item) =>
      item.origem === 'GRUPO'
        ? String(item.historico.assembleiasRealizadas ?? 'Dado indisponível')
        : 'Não se aplica',
  },
  {
    label: 'Cobertura de lances',
    value: (item) =>
      item.origem === 'GRUPO'
        ? item.cobertura.percentualLances === null
          ? 'Dado indisponível'
          : `${(item.cobertura.percentualLances * 100).toLocaleString('pt-BR')}%`
        : 'Não se aplica',
  },
  {
    label: 'Assembleias com dados de lance',
    value: (item) =>
      item.origem === 'GRUPO'
        ? String(item.cobertura.assembleiasComDadosLance ?? 'Dado indisponível')
        : 'Não se aplica',
  },
  {
    label: 'Assembleias com dados de contemplação',
    value: (item) =>
      item.origem === 'GRUPO'
        ? String(
            item.cobertura.assembleiasComDadosContemplacao ??
              'Dado indisponível',
          )
        : 'Não se aplica',
  },
  {
    label: 'Lances registrados',
    value: (item) =>
      item.origem === 'GRUPO'
        ? String(item.historico.lancesRegistrados ?? 'Dado indisponível')
        : 'Não se aplica',
  },
  {
    label: 'Lances contemplados',
    value: (item) =>
      item.origem === 'GRUPO'
        ? String(item.historico.lancesContemplados ?? 'Dado indisponível')
        : 'Não se aplica',
  },
  {
    label: 'Lance mínimo',
    value: (item) =>
      item.origem === 'GRUPO'
        ? percentual(item.historico.percentualLanceMinimo)
        : 'Não se aplica',
  },
  {
    label: 'Lance médio',
    value: (item) =>
      item.origem === 'GRUPO'
        ? percentual(item.historico.percentualLanceMedio)
        : 'Não se aplica',
  },
  {
    label: 'Lance mediano',
    value: (item) =>
      item.origem === 'GRUPO'
        ? percentual(item.historico.percentualLanceMediano)
        : 'Não se aplica',
  },
  {
    label: 'Lance máximo',
    value: (item) =>
      item.origem === 'GRUPO'
        ? percentual(item.historico.percentualLanceMaximo)
        : 'Não se aplica',
  },
  {
    label: 'Contemplações',
    value: (item) =>
      item.origem === 'GRUPO'
        ? String(item.historico.contemplacoesRegistradas ?? 'Dado indisponível')
        : 'Não se aplica',
  },
  {
    label: 'Contemplações por sorteio',
    value: (item) =>
      item.origem === 'GRUPO'
        ? String(item.historico.contemplacoesSorteio ?? 'Dado indisponível')
        : 'Não se aplica',
  },
  {
    label: 'Contemplações por lance',
    value: (item) =>
      item.origem === 'GRUPO'
        ? String(item.historico.contemplacoesLance ?? 'Dado indisponível')
        : 'Não se aplica',
  },
  {
    label: 'Outras contemplações',
    value: (item) =>
      item.origem === 'GRUPO'
        ? String(item.historico.contemplacoesOutras ?? 'Dado indisponível')
        : 'Não se aplica',
  },
  {
    label: 'Qualidade',
    value: (item) =>
      item.qualidade.issuesCriticas > 0 ? (
        <Badge tone="danger">Dados com pendência crítica</Badge>
      ) : (
        `${item.qualidade.issuesAbertas} abertas · ${item.qualidade.issuesCriticas} críticas`
      ),
  },
  {
    label: 'Estado histórico',
    value: (item) =>
      item.origem === 'GRUPO' ? item.historico.estado : 'Não se aplica',
  },
];

function buildRows(options: {
  adherenceOf: (item: ComparadorGroup) => number | null;
}): Row[] {
  const { adherenceOf } = options;
  return [
    {
      label: 'Administradora',
      value: (item) =>
        `${item.administradora.nome}${item.administradora.ativa ? '' : ' (inativa)'}`,
    },
    { label: 'Opção', value: (item) => comparisonLabel(item) },
    {
      label: 'Produto',
      available: (item) => item.produto !== null,
      value: (item) =>
        item.produto
          ? `${item.produto.nome}${item.produto.ativo ? '' : ' (inativo)'}`
          : 'Dado indisponível',
    },
    {
      label: 'Categoria',
      available: (item) => item.produto !== null,
      value: (item) => item.produto?.categoria ?? 'Dado indisponível',
    },
    {
      label: 'Plano / tabela',
      available: (item) => item.tabelaComercial !== null,
      value: (item) =>
        item.tabelaComercial
          ? `${item.tabelaComercial.codigoPlano ? `${item.tabelaComercial.codigoPlano} · ` : ''}${item.tabelaComercial.nome} (${item.tabelaComercial.codigo})`
          : 'Não se aplica',
    },
    {
      label: 'Grupo',
      available: (item) => item.origem === 'GRUPO',
      value: (item) =>
        item.origem === 'GRUPO' ? item.grupo.codigo : 'Não se aplica',
    },
    { label: 'Status', value: (item) => item.grupo.status },
    {
      label: 'Quantidade de cotas',
      available: (item) => item.grupo.quantidadeCotas !== null,
      value: (item) =>
        item.grupo.quantidadeCotas === null
          ? 'Dado indisponível'
          : String(item.grupo.quantidadeCotas),
    },
    {
      label: 'Crédito mínimo',
      value: (item) => money(item.credito.minimo),
    },
    {
      label: 'Crédito máximo',
      value: (item) => money(item.credito.maximo),
      highlight: 'maior-credito',
    },
    {
      label: 'Compatibilidade de crédito',
      value: (item) => item.credito.compatibilidade ?? 'Não informado',
    },
    {
      label: 'Parcela conhecida',
      value: (item) => money(item.parcela.valorConhecido),
      highlight: 'menor-parcela',
    },
    {
      label: 'Origem da parcela',
      value: (item) => item.parcela.origem ?? 'Dado indisponível',
    },
    {
      label: 'Compatibilidade de parcela',
      value: (item) => item.parcela.compatibilidade ?? 'Não informado',
    },
    {
      label: 'Prazo total',
      value: (item) =>
        item.prazo.totalMeses === null
          ? 'Dado indisponível'
          : `${item.prazo.totalMeses} meses`,
      highlight: 'menor-prazo',
    },
    {
      label: 'Prazo restante',
      value: (item) =>
        `${item.prazo.restanteMinimo ?? '—'} a ${item.prazo.restanteMaximo ?? '—'} meses`,
    },
    {
      label: 'Compatibilidade de prazo',
      value: (item) => item.prazo.compatibilidade ?? 'Não informado',
    },
    {
      label: 'Modalidade',
      financeiro: true,
      available: (item) => Boolean(item.tabelaComercial?.modalidade),
      value: (item) =>
        item.financeiro && item.tabelaComercial?.modalidade
          ? (modeLabels[item.tabelaComercial.modalidade] ??
            item.tabelaComercial.modalidade)
          : 'Não se aplica',
    },
    {
      label: 'Parcela padrão',
      financeiro: true,
      available: (item) => item.financeiro?.parcelaPadrao != null,
      value: (item) => money(item.financeiro?.parcelaPadrao ?? null),
    },
    {
      label: 'Primeira parcela',
      financeiro: true,
      available: (item) => item.financeiro?.primeiraParcela != null,
      value: (item) => money(item.financeiro?.primeiraParcela ?? null),
    },
    {
      label: 'Demais parcelas',
      financeiro: true,
      available: (item) => item.financeiro?.demaisParcelas != null,
      value: (item) => money(item.financeiro?.demaisParcelas ?? null),
    },
    {
      label: 'Taxa administrativa',
      financeiro: true,
      available: (item) => item.financeiro?.taxaAdministracaoPercentual != null,
      value: (item) =>
        percentual(item.financeiro?.taxaAdministracaoPercentual ?? null),
      highlight: 'menor-taxa',
    },
    {
      label: 'Taxa total',
      financeiro: true,
      available: (item) => item.financeiro?.taxaTotalPercentual != null,
      value: (item) => percentual(item.financeiro?.taxaTotalPercentual ?? null),
    },
    {
      label: 'Fundo de reserva',
      financeiro: true,
      available: (item) => item.financeiro?.fundoReservaPercentual != null,
      value: (item) =>
        percentual(item.financeiro?.fundoReservaPercentual ?? null),
    },
    {
      label: 'Seguro',
      financeiro: true,
      available: (item) => item.financeiro?.seguro != null,
      value: (item) => money(item.financeiro?.seguro ?? null),
    },
    {
      label: 'Seguro de vida',
      financeiro: true,
      available: (item) => item.financeiro?.seguroVidaPercentual != null,
      value: (item) =>
        percentual(item.financeiro?.seguroVidaPercentual ?? null),
    },
    {
      label: 'Taxa antecipada',
      financeiro: true,
      available: (item) =>
        item.financeiro?.taxaAntecipadaValor != null ||
        item.financeiro?.taxaAntecipadaPercentual != null,
      value: (item) => {
        const value = item.financeiro?.taxaAntecipadaValor ?? null;
        const rate = item.financeiro?.taxaAntecipadaPercentual ?? null;
        return [
          value === null ? null : money(value),
          rate === null ? null : percentual(rate),
        ]
          .filter((entry): entry is string => entry !== null)
          .join(' · ');
      },
    },
    {
      label: 'Participantes do grupo',
      financeiro: true,
      available: (item) => item.financeiro?.participantesGrupo != null,
      value: (item) =>
        item.financeiro?.participantesGrupo === null ||
        item.financeiro?.participantesGrupo === undefined
          ? 'Dado indisponível'
          : String(item.financeiro.participantesGrupo),
    },
    {
      label: 'Vigência da tabela',
      financeiro: true,
      available: (item) => Boolean(item.tabelaComercial?.vigenciaInicio),
      value: (item) =>
        item.tabelaComercial?.vigenciaInicio
          ? `${formatDate(item.tabelaComercial.vigenciaInicio)} a ${
              item.tabelaComercial.vigenciaFim
                ? formatDate(item.tabelaComercial.vigenciaFim)
                : 'sem fim informado'
            }`
          : 'Não se aplica',
    },
    {
      label: 'Índice de aderência',
      available: (item) => adherenceOf(item) !== null,
      value: (item) => {
        const adherence = adherenceOf(item);
        return item.origem === 'PLANO_COMERCIAL'
          ? 'Não se aplica'
          : adherence === null
            ? 'Dado indisponível'
            : `${adherence}/100`;
      },
      highlight: 'maior-aderencia',
    },
    ...historyRows,
  ];
}

function cellContent(
  highlightIds: Set<string>,
  row: Row,
  item: ComparadorGroup,
) {
  return (
    <div>
      {row.value(item)}
      {row.highlight && highlightIds.has(comparisonId(item)) ? (
        <span className="mt-1 block text-[11px] font-semibold text-[var(--color-success)]">
          {highlightLabels[row.highlight]}
        </span>
      ) : null}
    </div>
  );
}

export function filterComparisonItems(
  items: ComparadorGroup[],
  visibleIds: string[],
): ComparadorGroup[] {
  return items.filter((item) => visibleIds.includes(comparisonId(item)));
}

export function ComparadorSideBySide({
  items,
  criterios,
  adherenceMap,
}: {
  items: ComparadorGroup[];
  criterios: CompararGruposResponse['criterios'];
  adherenceMap: Record<string, number | null>;
}) {
  const [visible, setVisible] = useState<string[]>(() =>
    items.map((item) => comparisonId(item)),
  );
  const visibleItems = filterComparisonItems(items, visible);
  const remove = (id: string) => {
    setVisible((current) => current.filter((entry) => entry !== id));
  };
  const adherenceOf = (item: ComparadorGroup) =>
    item.origem === 'GRUPO' ? (adherenceMap[item.grupo.id] ?? null) : null;
  const winners: Record<HighlightKey, Set<string>> = {
    'menor-parcela': winnerIds(visibleItems, 'min', (item) =>
      item.parcela.valorConhecido === null
        ? null
        : Number(item.parcela.valorConhecido),
    ),
    'menor-taxa': winnerIds(visibleItems, 'min', (item) => {
      const value = item.financeiro?.taxaAdministracaoPercentual;
      return value === null || value === undefined ? null : Number(value);
    }),
    'maior-credito': winnerIds(visibleItems, 'max', (item) =>
      item.credito.maximo === null ? null : Number(item.credito.maximo),
    ),
    'menor-prazo': winnerIds(
      visibleItems,
      'min',
      (item) => item.prazo.totalMeses,
    ),
    'maior-aderencia': winnerIds(visibleItems, 'max', adherenceOf),
  };
  const rows = buildRows({ adherenceOf }).filter(
    (row) => !row.available || visibleItems.some(row.available),
  );
  const plans = visibleItems.reduce(
    (total, item) => total + (item.origem === 'PLANO_COMERCIAL' ? 1 : 0),
    0,
  );
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-primary)]">
            Comparação lado a lado
          </p>
          <h3 className="text-lg font-semibold">
            Comparação selecionada ({visibleItems.length}/{COMPARADOR_LIMIT})
          </h3>
        </div>
        <Badge tone="neutral">
          {plans} {plans === 1 ? 'plano' : 'planos'}
          {' · '}
          {visibleItems.length - plans}{' '}
          {visibleItems.length - plans === 1 ? 'grupo' : 'grupos'}
        </Badge>
      </div>
      {Object.keys(criterios).length ? (
        <p className="mt-3 text-sm text-[var(--color-muted)]">
          Crédito:{' '}
          {criterios.valorCreditoDesejado
            ? money(criterios.valorCreditoDesejado)
            : 'não informado'}{' '}
          · Parcela máxima:{' '}
          {criterios.parcelaMaxima
            ? money(criterios.parcelaMaxima)
            : 'não informada'}{' '}
          · Prazo: {criterios.prazoMinimo ?? '—'} a{' '}
          {criterios.prazoMaximo ?? '—'} meses
        </p>
      ) : null}
      {visibleItems.length ? (
        <>
          <div className="comparison-mobile mt-4 grid gap-3 md:hidden">
            {visibleItems.map((item) => (
              <div
                className="rounded-xl border border-[var(--color-border)] p-4"
                key={comparisonId(item)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{comparisonLabel(item)}</p>
                    <p className="text-sm text-[var(--color-muted)]">
                      {item.administradora.nome}
                    </p>
                    {item.tabelaComercial ? (
                      <p className="text-xs text-[var(--color-muted)]">
                        {item.tabelaComercial.nome}
                        {item.tabelaComercial.codigoPlano
                          ? ` · ${item.tabelaComercial.codigoPlano}`
                          : ''}
                        {' · '}
                        {modeLabels[item.tabelaComercial.modalidade] ??
                          item.tabelaComercial.modalidade}
                      </p>
                    ) : null}
                    {item.produto ? (
                      <p className="text-xs text-[var(--color-muted)]">
                        {item.produto.nome} · {item.produto.categoria}
                      </p>
                    ) : null}
                    {item.grupo.quantidadeCotas !== null ? (
                      <p className="text-xs text-[var(--color-muted)]">
                        {item.grupo.quantidadeCotas} cotas
                      </p>
                    ) : null}
                    {adherenceOf(item) !== null ? (
                      <div className="mt-2">
                        <Badge tone="success">
                          Aderência {adherenceOf(item)}/100
                        </Badge>
                      </div>
                    ) : null}
                  </div>
                  <button
                    aria-label={`Remover ${comparisonLabel(item)}`}
                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-[var(--color-muted)] hover:bg-slate-100 hover:text-[var(--color-danger)]"
                    onClick={() => remove(comparisonId(item))}
                    type="button"
                  >
                    <X className="h-4 w-4" />
                    Remover
                  </button>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-[var(--color-primary-soft)] p-3 text-sm">
                  <div>
                    <dt className="text-xs text-[var(--color-muted)]">
                      Crédito
                    </dt>
                    <dd className="font-semibold">
                      {money(item.credito.maximo)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--color-muted)]">
                      Parcela
                    </dt>
                    <dd className="text-base font-bold">
                      {money(item.parcela.valorConhecido)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--color-muted)]">Prazo</dt>
                    <dd className="font-semibold">
                      {item.prazo.totalMeses === null
                        ? 'Dado indisponível'
                        : `${item.prazo.totalMeses} meses`}
                    </dd>
                  </div>
                </dl>
                <details className="mt-3 text-sm">
                  <summary>Ver critérios comparados</summary>
                  <dl className="mt-3 grid gap-3">
                    {rows.map((row) => (
                      <div key={row.label}>
                        <dt className="text-[var(--color-muted)]">
                          {row.label}
                        </dt>
                        <dd className="font-semibold">
                          {cellContent(
                            row.highlight
                              ? winners[row.highlight]
                              : noHighlights,
                            row,
                            item,
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </details>
              </div>
            ))}
          </div>
          <div
            aria-label="Comparação horizontal; deslize para visualizar todas as opções"
            className="comparison-table mt-5 hidden overflow-x-auto md:block"
            role="region"
            tabIndex={0}
          >
            <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-20 min-w-48 border-b border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-left">
                    Característica
                  </th>
                  {visibleItems.map((item) => (
                    <th
                      className="min-w-60 border-b border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-left align-top"
                      key={comparisonId(item)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold">
                          {comparisonLabel(item)}
                        </span>
                        <button
                          aria-label={`Remover ${comparisonLabel(item)}`}
                          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-[var(--color-muted)] hover:bg-slate-100 hover:text-[var(--color-danger)]"
                          onClick={() => remove(comparisonId(item))}
                          type="button"
                        >
                          <X className="h-4 w-4" />
                          Remover
                        </button>
                      </div>
                      <span className="mt-1 block text-xs font-normal text-[var(--color-muted)]">
                        {item.administradora.nome}
                      </span>
                      {item.tabelaComercial ? (
                        <span className="block text-xs font-normal text-[var(--color-muted)]">
                          {item.tabelaComercial.nome}
                          {item.tabelaComercial.codigoPlano
                            ? ` · ${item.tabelaComercial.codigoPlano}`
                            : ''}
                          {' · '}
                          {modeLabels[item.tabelaComercial.modalidade] ??
                            item.tabelaComercial.modalidade}
                        </span>
                      ) : null}
                      {item.produto ? (
                        <span className="block text-xs font-normal text-[var(--color-muted)]">
                          {item.produto.nome} · {item.produto.categoria}
                        </span>
                      ) : null}
                      {item.grupo.quantidadeCotas !== null ? (
                        <span className="block text-xs font-normal text-[var(--color-muted)]">
                          {item.grupo.quantidadeCotas} cotas
                        </span>
                      ) : null}
                      {adherenceOf(item) !== null ? (
                        <Badge tone="success">
                          Aderência {adherenceOf(item)}/100
                        </Badge>
                      ) : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label}>
                    <th className="sticky left-0 z-10 border-b border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-left font-semibold">
                      {row.label}
                    </th>
                    {visibleItems.map((item) => (
                      <td
                        className={`border-b border-[var(--color-border)] p-3 align-top ${row.label === 'Parcela conhecida' ? 'bg-[var(--color-primary-soft)] text-base font-bold' : ''}`}
                        key={comparisonId(item)}
                      >
                        {cellContent(
                          row.highlight ? winners[row.highlight] : noHighlights,
                          row,
                          item,
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t">
                  <th className="sticky left-0 z-10 bg-[var(--color-surface)] p-3 text-left font-semibold">
                    Ações
                  </th>
                  {visibleItems.map((item) => (
                    <td className="p-3" key={comparisonId(item)}>
                      {item.origem === 'GRUPO' ? (
                        <div className="space-y-2">
                          <a
                            className="block font-semibold text-[var(--color-primary)]"
                            href={`/dashboard/grupos/${item.grupo.id}#historico`}
                          >
                            Abrir histórico
                          </a>
                          <a
                            className="block font-semibold text-[var(--color-primary)]"
                            href={`/dashboard/qualidade-dados?grupoId=${item.grupo.id}`}
                          >
                            Ver qualidade
                          </a>
                        </div>
                      ) : (
                        <span>Plano vigente sem histórico de grupo</span>
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="mt-4 text-sm text-[var(--color-muted)]">
          Nenhuma opção para comparar.
        </p>
      )}
      <p className="mt-5 text-xs text-[var(--color-muted)]">
        Destaques sinalizam apenas diferenças factuais (menor parcela, menor
        taxa administrativa, maior crédito, menor prazo, maior aderência). Não
        há classificação de vencedor nem recomendação.
      </p>
    </Card>
  );
}
