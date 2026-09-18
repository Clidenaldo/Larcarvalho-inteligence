import type { SimulationResult } from '@larcarvalho/shared';

export const QUOTA_COMPARISON_LIMIT = 5;
export const comparisonIdentity = (result: SimulationResult) =>
  result.quotaId ? `quota:${result.quotaId}` : `result:${result.id}`;

export function selectComparisonResult(
  selected: string[],
  candidate: SimulationResult,
  results: SimulationResult[],
): string[] {
  if (selected.includes(candidate.id))
    return selected.filter((id) => id !== candidate.id);
  if (
    selected.length >= QUOTA_COMPARISON_LIMIT ||
    results.some(
      (item) =>
        selected.includes(item.id) &&
        comparisonIdentity(item) === comparisonIdentity(candidate),
    )
  )
    return selected;
  return [...selected, candidate.id];
}

// Recalculation creates another immutable scenario. Only replace a selection when
// its quota and rule version match unambiguously; otherwise retain its snapshot.
export function reconcileComparison(
  selected: string[],
  previous: SimulationResult[],
  next: SimulationResult[],
) {
  return selected.map((id) => {
    const old = previous.find((result) => result.id === id);
    if (!old?.quotaId) return id;
    const matches = next.filter(
      (result) =>
        result.quotaId === old.quotaId &&
        result.ruleVersion === old.ruleVersion,
    );
    return matches.length === 1 ? matches[0]!.id : id;
  });
}

export const comparisonSorts = {
  selection: 'Ordem de seleção',
  initialInstallment: 'Menor parcela',
  netCredit: 'Maior crédito líquido',
  totalTermMonths: 'Maior prazo',
  administrationFee: 'Menor taxa administrativa (valor)',
  adherenceScore: 'Maior índice de aderência',
} as const;
export type ComparisonSort = keyof typeof comparisonSorts;
export function sortComparison(
  results: SimulationResult[],
  sort: ComparisonSort,
) {
  if (sort === 'selection') return results;
  const ascending =
    sort === 'initialInstallment' || sort === 'administrationFee';
  return [...results].sort((a, b) => {
    const left = a[sort],
      right = b[sort];
    if (left === null) return right === null ? 0 : 1;
    if (right === null) return -1;
    return (Number(left) - Number(right)) * (ascending ? 1 : -1);
  });
}
