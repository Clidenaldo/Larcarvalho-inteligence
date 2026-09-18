import { isValidCnpj, normalizeCnpj } from '@larcarvalho/shared';

export function parseBrazilianDecimal(input: unknown): string | null {
  if (input === null || input === undefined || String(input).trim() === '')
    return null;
  const raw = String(input).trim().replace(/\s/g, '').replace(/^R\$/i, '');
  let canonical: string;
  if (/^-?\d{1,3}(\.\d{3})*,\d+$/.test(raw))
    canonical = raw.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d+,\d+$/.test(raw)) canonical = raw.replace(',', '.');
  else if (/^-?\d+(\.\d+)?$/.test(raw)) canonical = raw;
  else throw new Error('INVALID_DECIMAL');
  if (!Number.isFinite(Number(canonical))) throw new Error('INVALID_DECIMAL');
  return canonical;
}

export function parseInteger(input: unknown): number | null {
  if (input === null || input === undefined || String(input).trim() === '')
    return null;
  const value = Number(String(input).trim());
  if (!Number.isSafeInteger(value)) throw new Error('INVALID_INTEGER');
  return value;
}

export function parseBoolean(input: unknown): boolean | null {
  if (input === null || input === undefined || String(input).trim() === '')
    return null;
  const value = String(input)
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (['sim', 'true', '1', 'ativo'].includes(value)) return true;
  if (['nao', 'false', '0', 'inativo'].includes(value)) return false;
  throw new Error('INVALID_BOOLEAN');
}

export function parseDate(input: unknown, timestamp = false): Date | null {
  if (input === null || input === undefined || String(input).trim() === '')
    return null;
  if (input instanceof Date && !Number.isNaN(input.valueOf())) return input;
  const raw = String(input).trim();
  const br =
    /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(
      raw,
    );
  if (br) {
    if (timestamp && br[4]) throw new Error('TIMEZONE_REQUIRED');
    const iso = `${br[3]}-${br[2]}-${br[1]}${br[4] ? `T${br[4]}:${br[5]}:${br[6] ?? '00'}` : 'T00:00:00'}Z`;
    const value = new Date(iso);
    if (
      Number.isNaN(value.valueOf()) ||
      value.getUTCDate() !== Number(br[1]) ||
      value.getUTCMonth() + 1 !== Number(br[2])
    )
      throw new Error('INVALID_DATE');
    return value;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(`${raw}T00:00:00.000Z`);
  if (
    timestamp &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      raw,
    )
  ) {
    const value = new Date(raw);
    if (!Number.isNaN(value.valueOf())) return value;
  }
  throw new Error(timestamp ? 'INVALID_TIMESTAMP' : 'INVALID_DATE');
}

export function parseCnpj(input: unknown): string | null {
  if (input === null || input === undefined || String(input).trim() === '')
    return null;
  const value = normalizeCnpj(String(input));
  if (!isValidCnpj(value)) throw new Error('INVALID_CNPJ');
  return value;
}

export function canonicalEnum(
  input: unknown,
  values: readonly string[],
  aliases: Readonly<Record<string, string>> = {},
): string {
  const normalized = String(input ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_');
  const value = aliases[normalized] ?? normalized;
  if (!values.includes(value)) throw new Error('INVALID_ENUM');
  return value;
}
