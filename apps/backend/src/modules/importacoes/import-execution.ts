import type {
  ExecutionState,
  ImportacaoTipo,
  ImportOverwritePolicy,
} from '@larcarvalho/shared';
import {
  IMPORT_TARGET_REGISTRY,
} from '@larcarvalho/shared';

export type PreparedAction = 'CREATE' | 'UPDATE' | 'IGNORE' | 'ERROR';

export interface PreparedIssue {
  readonly code: string;
  readonly field?: string;
  readonly message: string;
  readonly row: number;
  readonly severity: 'WARNING' | 'ERROR';
  readonly value?: unknown;
}

/**
 * Ordem de dependência FK para execução (item 22): entidades filhas
 * só podem ser escritas após o sucesso do pai. Se o pai falha,
 * filhos recebem SKIPPED com código DEPENDENCY_FAILED.
 */
export const DEPENDENCY_ORDER: readonly ImportacaoTipo[] = [
  'ADMINISTRADORAS',
  'PRODUTOS',
  'GRUPOS',
  'COTAS',
  'ASSEMBLEIAS',
  'TABELAS_COMERCIAIS',
  'LANCES',
  'CONTEMPLACOES',
] as const;

const DEPENDENCY_PARENT: Readonly<Record<ImportacaoTipo, ImportacaoTipo | null>> = {
  ADMINISTRADORAS: null,
  PRODUTOS: 'ADMINISTRADORAS',
  GRUPOS: 'ADMINISTRADORAS',
  COTAS: 'GRUPOS',
  ASSEMBLEIAS: 'GRUPOS',
  TABELAS_COMERCIAIS: 'ADMINISTRADORAS',
  LANCES: 'ASSEMBLEIAS',
  CONTEMPLACOES: 'ASSEMBLEIAS',
};

export function parentOf(entity: ImportacaoTipo): ImportacaoTipo | null {
  return DEPENDENCY_PARENT[entity] ?? null;
}

/** Códigos que representam conflito (decisão pendente), não dado inválido. */
const CONFLICT_CODES: ReadonlySet<string> = new Set([
  'FILE_DUPLICATE',
  'PARENT_CONFLICT',
  'REQUIRE_REVIEW',
  'DATABASE_DUPLICATE',
  'AMBIGUOUS_KEY',
  'AMBIGUOUS_REFERENCE',
  'RELATIONSHIP_CONFLICT',
]);

/**
 * Mapeia a ação interna + issues para o estado explícito do plano
 * (item 13): CREATE, UPDATE, UNCHANGED, CONFLICT, INVALID ou SKIPPED.
 * Sem estado implícito.
 */
export function toExecutionState(
  action: PreparedAction,
  issues: readonly PreparedIssue[],
): ExecutionState {
  if (action === 'CREATE') return 'CREATE';
  if (action === 'UPDATE') return 'UPDATE';
  if (action === 'IGNORE') return 'UNCHANGED';
  if (issues.some((issue) => CONFLICT_CODES.has(issue.code))) return 'CONFLICT';
  return 'INVALID';
}

export function displayValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  const text = String(value).trim();
  return text === '' ? null : text;
}

export interface FieldDiff {
  readonly changed: boolean;
  readonly field: string;
  readonly from: string | null;
  readonly policy: ImportOverwritePolicy;
  readonly to: string | null;
}

export function policyFor(tipo: ImportacaoTipo, field: string): ImportOverwritePolicy {
  return (
    IMPORT_TARGET_REGISTRY[tipo]?.[field]?.overwritePolicy ?? 'update'
  );
}

/**
 * Aplica as policies do registry ao diff (itens 14–16):
 * - never: nunca escrito em UPDATE;
 * - fill_empty: só preenche quando o atual está vazio (protege dado
 *   manual já preenchido sem travar a primeira carga);
 * - update: sobrescreve com o valor do arquivo.
 */
export function diffUpdate(
  tipo: ImportacaoTipo,
  fileData: Readonly<Record<string, unknown>>,
  current: Readonly<Record<string, unknown>>,
): { diffs: FieldDiff[]; effectiveData: Record<string, unknown>; skippedByPolicy: string[] } {
  const diffs: FieldDiff[] = [];
  const skippedByPolicy: string[] = [];
  const effectiveData: Record<string, unknown> = {};
  for (const [field, to] of Object.entries(fileData)) {
    const policy = policyFor(tipo, field);
    const from = displayValue((current as Record<string, unknown>)[field]);
    const toText = displayValue(to);
    if (policy === 'never') {
      if (from !== toText) skippedByPolicy.push(field);
      continue;
    }
    if (policy === 'fill_empty' && from !== null) {
      if (from !== toText) skippedByPolicy.push(field);
      continue;
    }
    effectiveData[field] = to;
    diffs.push({ changed: from !== toText, field, from, policy, to: toText });
  }
  return { diffs, effectiveData, skippedByPolicy };
}

export interface ConcurrencyConflict {
  readonly field: string;
  readonly expected: string | null;
  readonly actual: string | null;
}

/**
 * Compara currentData do plano com o estado atual do banco.
 * Retorna conflitos se algum campo relevante foi alterado por outro fluxo
 * entre o preview e o execute.
 */
export function detectConcurrencyChanges(
  currentData: Readonly<Record<string, unknown>>,
  liveData: Readonly<Record<string, unknown>>,
  fieldsToCheck: readonly string[],
): ConcurrencyConflict[] {
  const conflicts: ConcurrencyConflict[] = [];
  for (const field of fieldsToCheck) {
    const expected = displayValue(currentData[field]);
    const actual = displayValue(liveData[field]);
    if (expected !== actual) {
      conflicts.push({ field, expected, actual });
    }
  }
  return conflicts;
}
