'use client';
import { HelpLabel } from './ui/field-help';
import type { ComparadorGroup } from '@larcarvalho/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatBrl } from '../lib/formatters';
import { Alert } from './ui/alert';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';

export const COMPARADOR_LIMIT = 5;
const money = (value: string | null) =>
  value === null ? 'Indisponível' : formatBrl(Number(value));
export function comparisonId(item: ComparadorGroup): string {
  return item.origem === 'PLANO_COMERCIAL'
    ? (item.tabelaComercial?.itemId ?? item.grupo?.id ?? '')
    : (item.grupo?.id ?? '');
}
export function comparisonLabel(item: ComparadorGroup): string {
  return item.origem === 'GRUPO'
    ? `Grupo ${item.grupo?.codigo ?? ''}`
    : `Plano comercial ${item.tabelaComercial?.codigo ?? ''}`;
}
export function toggleComparisonSelection(
  current: string[],
  id: string,
): string[] {
  return current.includes(id)
    ? current.filter((item) => item !== id)
    : current.length < COMPARADOR_LIMIT
      ? [...current, id]
      : current;
}
export function removeComparisonSelection(
  current: string[],
  id: string,
): string[] {
  return current.filter((item) => item !== id);
}
export function clearComparisonSelection(): string[] {
  return [];
}
export function ComparadorResults({
  items,
  context,
}: {
  items: ComparadorGroup[];
  context: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const hasProfile = Object.entries(context).some(
    ([key, value]) => key !== 'categoria' && Boolean(value),
  );
  const atLimit = selected.length >= COMPARADOR_LIMIT;
  const byId = new Map(
    items.map((item) => [comparisonId(item), item] as const),
  );
  const categories = new Set(
    selected.flatMap((id) => {
      const item = byId.get(id);
      return item?.produto?.categoria ? [item.produto.categoria] : [];
    }),
  );
  const allowDifferentCategories = categories.size > 1;
  const chips = selected.map((id) => {
    const item = byId.get(id);
    return { id, label: item ? comparisonLabel(item) : id };
  });
  const toggle = (id: string) => {
    setSelected((current) => toggleComparisonSelection(current, id));
  };
  const remove = (id: string) => {
    setSelected((current) => removeComparisonSelection(current, id));
  };
  const navigate = (calcularAderencia: boolean) => {
    const params = new URLSearchParams();
    params.set('grupoIds', selected.join(','));
    if (calcularAderencia) params.set('calcularAderencia', 'true');
    if (allowDifferentCategories)
      params.set('permitirCategoriasDiferentes', 'true');
    if (calcularAderencia)
      for (const [key, value] of Object.entries(context))
        if (value) params.set(key, value);
    router.push(`/dashboard/comparador/resultado?${params.toString()}`);
  };
  return (
    <div className="space-y-4">
      <Card className="sticky top-16 z-20 space-y-4 p-4 md:top-20">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-semibold">
              Comparar selecionados ({selected.length}/{COMPARADOR_LIMIT})
            </p>
            {atLimit ? (
              <Alert tone="info">
                Você pode comparar até 5 opções por vez.
              </Alert>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={selected.length === 0}
              onClick={() => navigate(false)}
              variant="secondary"
            >
              Comparar agora
            </Button>
            <Button
              disabled={selected.length === 0 || !hasProfile}
              onClick={() => navigate(true)}
            >
              Comparar com aderência
            </Button>
          </div>
        </div>
        {chips.length ? (
          <div className="flex flex-wrap items-center gap-2">
            {chips.map((chip) => (
              <span
                className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-slate-50 px-3 py-1 text-sm font-semibold"
                key={chip.id}
              >
                {chip.label}
                <button
                  aria-label={`Remover ${chip.label}`}
                  className="text-(--color-muted) hover:text-(--color-danger)"
                  onClick={() => remove(chip.id)}
                  type="button"
                >
                  &times;
                </button>
              </span>
            ))}
            <Button
              className="ml-auto h-8 min-h-8 px-3"
              onClick={() => setSelected(clearComparisonSelection())}
              variant="ghost"
            >
              Limpar
            </Button>
          </div>
        ) : null}
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        {items.map((item) => {
          const selectionId = comparisonId(item);
          const checked = selected.includes(selectionId);
          return (
            <Card className="p-5" key={selectionId}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-(--color-muted)">
                    {item.administradora.nome}
                    {!item.administradora.ativa ? ' · Inativa' : ''}
                  </p>
                  <h2 className="text-lg font-semibold">
                    {comparisonLabel(item)}
                  </h2>
                  <p className="text-sm">
                    {item.produto?.nome ?? 'Produto não classificado'} ·{' '}
                    {item.produto?.categoria ?? 'Categoria indisponível'}
                    {item.produto && !item.produto.ativo ? ' · Inativo' : ''}
                  </p>
                </div>
                <HelpLabel
                  helpKey="filter.compare"
                  className="flex items-center gap-2 text-sm font-semibold"
                >
                  <input
                    aria-label={`Selecionar ${comparisonLabel(item)}`}
                    checked={checked}
                    disabled={!checked && atLimit}
                    onChange={() => toggle(selectionId)}
                    type="checkbox"
                  />
                  Comparar
                </HelpLabel>
              </div>
              <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <dt>Status</dt>
                  <dd>
                    <Badge>{item.grupo.status}</Badge>
                  </dd>
                </div>
                <div>
                  <dt>Crédito</dt>
                  <dd>
                    {money(item.credito.minimo)} a {money(item.credito.maximo)}
                  </dd>
                </div>
                <div>
                  <dt>Prazo</dt>
                  <dd>{item.prazo.totalMeses ?? 'Indisponível'} meses</dd>
                </div>
                <div>
                  <dt>Quantidade de cotas</dt>
                  <dd>{item.grupo?.quantidadeCotas ?? 'Não se aplica'}</dd>
                </div>
                <div>
                  <dt>Parcela conhecida</dt>
                  <dd>
                    {money(item.parcela.valorConhecido)}
                    {item.parcela.origem ? ` · ${item.parcela.origem}` : ''}
                  </dd>
                </div>
                <div>
                  <dt>Histórico</dt>
                  <dd>{item.historico.estado}</dd>
                </div>
                <div>
                  <dt>Qualidade</dt>
                  <dd>
                    {item.qualidade.issuesAbertas} abertas
                    {item.qualidade.issuesCriticas
                      ? ` · ${item.qualidade.issuesCriticas} críticas`
                      : ''}
                  </dd>
                </div>
              </dl>
              <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-(--color-muted)">
                {item.motivosCompatibilidade.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              <div className="mt-4 flex gap-4 text-sm font-semibold text-(--color-primary)">
                {item.origem === 'GRUPO' ? (
                  <>
                    <Link href={`/dashboard/grupos/${item.grupo.id}#historico`}>
                      Abrir histórico
                    </Link>
                    <Link
                      href={`/dashboard/qualidade-dados?grupoId=${item.grupo.id}`}
                    >
                      Ver qualidade
                    </Link>
                  </>
                ) : (
                  <span>Plano vigente sem histórico de grupo</span>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
