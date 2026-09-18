import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as XLSX from '@e965/xlsx';
import { describe, expect, it } from 'vitest';
import {
  assertImportFile,
  autoMapColumns,
  parseImportFile,
  publicImportFileMessage,
} from '../src/modules/importacoes/import-file.js';
import {
  canonicalEnum,
  parseBoolean,
  parseBrazilianDecimal,
  parseCnpj,
  parseDate,
} from '../src/modules/importacoes/import-normalizers.js';

const fixture = (name: string) =>
  readFile(fileURLToPath(new URL(`fixtures/${name}`, import.meta.url)));
describe('safe import parsers', () => {
  it('parses comma, quotes, semicolon and BOM without naive splitting', async () => {
    const comma = parseImportFile(
      'data.csv',
      'text/csv',
      await fixture('import-comma.csv'),
    );
    expect(comma.rows[0]?.Observação).toBe('campo, com vírgula');
    const semicolon = parseImportFile(
      'data.csv',
      'text/csv',
      await fixture('import-semicolon.csv'),
    );
    expect(semicolon.columns).toEqual(['Nome', 'Código', 'Ativo']);
    const bom = parseImportFile(
      'bom.csv',
      'text/csv',
      Buffer.from('\uFEFFNome;Código\nTeste;001'),
    );
    expect(bom.columns).toEqual(['Nome', 'Código']);
  });
  it('lists XLSX sheets and imports only the selected one', () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([['Nome'], ['A']]),
      'Primeira',
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([['Nome'], ['B']]),
      'Segunda',
    );
    const bytes = Buffer.from(
      XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }),
    );
    const parsed = parseImportFile(
      'data.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      bytes,
      'Segunda',
    );
    expect(parsed.sheets).toEqual(['Primeira', 'Segunda']);
    expect(parsed.rows[0]?.Nome).toBe('B');
  });
  it('rejects mismatched extension and magic bytes', () => {
    expect(() =>
      assertImportFile(
        'fake.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        Buffer.from('plain'),
      ),
    ).toThrow('CONTENT_MISMATCH');
  });
  it('keeps EMPTY_HEADER technical internally and exposes a friendly column message', () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['Tabela', null, 'Modalidade'],
        ['TA1', '11222333000181', 'NORMAL'],
      ]),
      'Importacao',
    );
    const bytes = Buffer.from(
      XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }),
    );
    let error: unknown;
    try {
      parseImportFile(
        'data.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        bytes,
      );
    } catch (cause) {
      error = cause;
    }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('EMPTY_HEADER:2');
    expect(publicImportFileMessage(error)).toBe(
      'Cabeçalho vazio na coluna 2 (B).',
    );
  });
});
describe('import normalization and mapping', () => {
  it('normalizes BRL, dates, booleans, enum, CNPJ and preserves leading zeros', () => {
    expect(parseBrazilianDecimal('1.234,56')).toBe('1234.56');
    expect(parseBrazilianDecimal('1234.56')).toBe('1234.56');
    expect(parseDate('31/08/2026')?.toISOString()).toBe(
      '2026-08-31T00:00:00.000Z',
    );
    expect(parseBoolean('não')).toBe(false);
    expect(canonicalEnum('automóvel', ['AUTOMOVEL'])).toBe('AUTOMOVEL');
    expect(parseCnpj('11.222.333/0001-81')).toBe('11222333000181');
    expect(String('001')).toBe('001');
  });
  it('suggests only deterministic mappings', () => {
    expect(
      autoMapColumns('COTAS', ['Número Cota', 'Valor Crédito', 'Coluna livre']),
    ).toEqual({ numero: 'Número Cota', valorCredito: 'Valor Crédito' });
    expect(autoMapColumns('COTAS', ['Modalidade'])).toEqual({});
    expect(
      autoMapColumns('TABELAS_COMERCIAIS', [
        'Tabela',
        'Categoria',
        'Credito_Referencia',
        'Modalidade',
      ]),
    ).toEqual({
      tabelaCodigo: 'Tabela',
      categoria: 'Categoria',
      creditoReferencia: 'Credito_Referencia',
      modalidade: 'Modalidade',
    });
  });
});
