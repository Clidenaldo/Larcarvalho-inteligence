import { parse as parseCsv } from 'csv-parse/sync';
import * as XLSX from '@e965/xlsx';

import type { ImportacaoTipo } from '@larcarvalho/shared';
import {
  GENERIC_AMBIGUOUS_STEMS,
  importacaoFields,
} from '@larcarvalho/shared';

export const IMPORT_MAX_BYTES = 20 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 50_000;
export const IMPORT_MAX_COLUMNS = 200;
export const IMPORT_PREVIEW_ROWS = 20;

function spreadsheetColumn(position: number) {
  let value = position;
  let result = '';
  while (value > 0) {
    value--;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

export function publicImportFileMessage(error: unknown) {
  const technical = error instanceof Error ? error.message : '';
  const emptyHeader = /^EMPTY_HEADER:(\d+)$/.exec(technical);
  if (emptyHeader) {
    const position = Number(emptyHeader[1]);
    return `Cabeçalho vazio na coluna ${position} (${spreadsheetColumn(position)}).`;
  }
  return technical || 'Arquivo inválido';
}

export type CellValue = string | number | boolean | null;
export interface ParsedSheet {
  readonly sheets: readonly string[];
  readonly selectedSheet: string;
  readonly columns: readonly string[];
  readonly rows: readonly Readonly<Record<string, CellValue>>[];
}

const csvMimes = new Set([
  'text/csv',
  'text/plain',
  'application/csv',
  'application/vnd.ms-excel',
]);
const xlsxMimes = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'application/octet-stream',
]);
const xlsMimes = new Set([
  'application/vnd.ms-excel',
  'application/octet-stream',
]);

function extension(name: string) {
  return name.slice(name.lastIndexOf('.')).toLowerCase();
}
function isZip(bytes: Buffer) {
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}
function isOle(bytes: Buffer) {
  return bytes
    .subarray(0, 8)
    .equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
}

export function assertImportFile(
  name: string,
  mime: string,
  bytes: Buffer,
): '.csv' | '.xlsx' | '.xls' {
  const ext = extension(name);
  if (bytes.length === 0) throw new Error('EMPTY_FILE');
  if (bytes.length > IMPORT_MAX_BYTES) throw new Error('FILE_TOO_LARGE');
  if (ext === '.csv') {
    if (!csvMimes.has(mime)) throw new Error('MIME_MISMATCH');
    if (isZip(bytes) || isOle(bytes)) throw new Error('CONTENT_MISMATCH');
    return ext;
  }
  if (ext === '.xlsx') {
    if (!xlsxMimes.has(mime) || !isZip(bytes))
      throw new Error('CONTENT_MISMATCH');
    return ext;
  }
  if (ext === '.xls') {
    if (!xlsMimes.has(mime) || !isOle(bytes))
      throw new Error('CONTENT_MISMATCH');
    return ext;
  }
  throw new Error('UNSUPPORTED_FORMAT');
}

function cleanCell(value: unknown): CellValue {
  if (value === null || value === undefined) return null;
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
    return value;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function rowsFromMatrix(matrix: unknown[][]): {
  columns: string[];
  rows: Record<string, CellValue>[];
} {
  const rawHeader = matrix[0] ?? [];
  if (rawHeader.length === 0) throw new Error('HEADER_REQUIRED');
  if (rawHeader.length > IMPORT_MAX_COLUMNS)
    throw new Error('TOO_MANY_COLUMNS');
  const seen = new Set<string>();
  const columns = rawHeader.map((value, index) => {
    const header = String(value ?? '').trim();
    if (!header) throw new Error(`EMPTY_HEADER:${index + 1}`);
    if (seen.has(header)) throw new Error(`DUPLICATE_HEADER:${header}`);
    seen.add(header);
    return header;
  });
  const data = matrix
    .slice(1)
    .filter((row) =>
      row.some(
        (cell) =>
          cell !== null && cell !== undefined && String(cell).trim() !== '',
      ),
    );
  if (data.length > IMPORT_MAX_ROWS) throw new Error('TOO_MANY_ROWS');
  return {
    columns,
    rows: data.map((row) =>
      Object.fromEntries(
        columns.map((column, index) => [column, cleanCell(row[index])]),
      ),
    ),
  };
}

function parseCsvBuffer(bytes: Buffer): ParsedSheet {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('INVALID_UTF8');
  }
  const firstLine = text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? '';
  const commas = (firstLine.match(/,/g) ?? []).length;
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  const delimiter = semicolons > commas ? ';' : ',';
  const matrix = parseCsv(text, {
    bom: true,
    delimiter,
    relax_column_count: false,
    skip_empty_lines: true,
    max_record_size: 1_000_000,
  }) as unknown[][];
  const parsed = rowsFromMatrix(matrix);
  return { sheets: ['CSV'], selectedSheet: 'CSV', ...parsed };
}

function parseWorkbook(bytes: Buffer, selectedSheet?: string): ParsedSheet {
  const workbook = XLSX.read(bytes, {
    type: 'buffer',
    cellFormula: false,
    cellHTML: false,
    cellNF: false,
    cellText: false,
    dense: true,
    sheetRows: IMPORT_MAX_ROWS + 2,
  });
  if (workbook.SheetNames.length === 0) throw new Error('EMPTY_WORKBOOK');
  const name = selectedSheet ?? workbook.SheetNames[0]!;
  if (!workbook.SheetNames.includes(name)) throw new Error('SHEET_NOT_FOUND');
  const sheet = workbook.Sheets[name];
  if (!sheet) throw new Error('SHEET_NOT_FOUND');
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false,
  });
  const parsed = rowsFromMatrix(matrix);
  return {
    sheets: workbook.SheetNames.slice(0, 100),
    selectedSheet: name,
    ...parsed,
  };
}

export function parseImportFile(
  name: string,
  mime: string,
  bytes: Buffer,
  selectedSheet?: string,
): ParsedSheet {
  const ext = assertImportFile(name, mime, bytes);
  return ext === '.csv'
    ? parseCsvBuffer(bytes)
    : parseWorkbook(bytes, selectedSheet);
}

export function normalizeHeader(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}
const aliases: Readonly<Record<string, string>> = {
  razaosocial: 'nome',
  administradora: 'administradoraCodigoExterno',
  cnpj: 'cnpj',
  codigoadministradora: 'administradoraCodigoExterno',
  grupo: 'grupoCodigo',
  codigogrupo: 'codigo',
  numerocota: 'numero',
  cota: 'cotaNumero',
  valorcredito: 'valorCredito',
  dataassembleia: 'dataAssembleia',
  assembleia: 'assembleiaNumero',
  codigoproduto: 'produtoCodigoExterno',
  valordolance: 'valorLance',
  percentuallance: 'percentualLance',
  tabela: 'tabelaCodigo',
  codigotabela: 'tabelaCodigo',
};
const ambiguousStems = new Set<string>(GENERIC_AMBIGUOUS_STEMS);

/** A table/offer column is not evidence of a product identity. */
export function commercialProductMappingConflicts(
  columns: readonly string[],
  map: Readonly<Record<string, string>>,
): string[] {
  const headers = columns.map(normalizeHeader);
  if (!headers.some((header) => ['tabelacodigo', 'codigotabela', 'creditoreferencia'].includes(header))) return [];
  const offerFields = new Set<string>([
    ...importacaoFields.TABELAS_COMERCIAIS.map(normalizeHeader),
    'tabela', 'codigotabela',
  ]);
  return ['nome', 'codigoExterno', 'descricao', 'ativo'].filter(
    (field) => map[field] && offerFields.has(normalizeHeader(map[field]!)),
  );
}

export function autoMapColumns(
  tipo: ImportacaoTipo,
  columns: readonly string[],
): Record<string, string> {
  const allowed = new Set<string>(importacaoFields[tipo]);
  const result: Record<string, string> = {};
  for (const column of columns) {
    const normalized = normalizeHeader(column);
    // Cabeçalhos genéricos ("Prazo", "Taxa", "Parcela"...) nunca disparam
    // mapeamento automático: exigem contexto + revisão explícita (2.2).
    if (ambiguousStems.has(normalized)) continue;
    const exact = [...allowed].find(
      (field) => normalizeHeader(field) === normalized,
    );
    const suggested = exact ?? aliases[normalized];
    if (suggested && allowed.has(suggested) && !(suggested in result))
      result[suggested] = column;
  }
  if (tipo === 'PRODUTOS') {
    for (const field of commercialProductMappingConflicts(columns, result)) delete result[field];
  }
  return result;
}

/**
 * Colunas que parecem mapeáveis mas são ambíguas sem contexto: vão para
 * revisão explícita em vez de mapeamento silencioso (REQUIRE_REVIEW).
 */
export function needsReviewColumns(
  tipo: ImportacaoTipo,
  columns: readonly string[],
): readonly string[] {
  const allowed = new Set<string>(importacaoFields[tipo]);
  const mapped = new Set(Object.values(autoMapColumns(tipo, columns)));
  return columns.filter((column) => {
    if (mapped.has(column)) return false;
    const normalized = normalizeHeader(column);
    if (ambiguousStems.has(normalized)) return true;
    return [...allowed].some(
      (field) =>
        normalizeHeader(field).includes(normalized) && normalized.length >= 4,
    );
  });
}
