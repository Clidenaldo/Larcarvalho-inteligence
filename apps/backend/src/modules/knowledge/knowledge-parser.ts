import { inflateSync } from 'node:zlib';

export const KNOWLEDGE_MAX_BYTES = 15 * 1024 * 1024;
export const KNOWLEDGE_MIN_TEXT_CHARS = 40;

export type KnowledgeFileKind = 'text' | 'markdown' | 'pdf';

export interface ExtractedKnowledgeText {
  readonly pages: readonly string[];
  readonly text: string;
}

const textMimes = new Set([
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'application/octet-stream',
]);
const pdfMimes = new Set(['application/pdf', 'application/octet-stream']);

function extensionOf(name: string): string {
  const index = name.lastIndexOf('.');
  return index < 0 ? '' : name.slice(index).toLowerCase();
}

function isZip(bytes: Buffer): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function isPdf(bytes: Buffer): boolean {
  return bytes.subarray(0, 5).toString('latin1') === '%PDF-';
}

export function assertKnowledgeFile(
  name: string,
  mime: string,
  bytes: Buffer,
  maxBytes: number = KNOWLEDGE_MAX_BYTES,
): KnowledgeFileKind {
  const ext = extensionOf(name);
  if (bytes.length === 0) throw new Error('EMPTY_FILE');
  if (bytes.length > maxBytes) throw new Error('FILE_TOO_LARGE');
  const normalizedMime = mime.trim().toLowerCase();
  if (ext === '.txt' || ext === '.md') {
    if (!textMimes.has(normalizedMime)) throw new Error('MIME_MISMATCH');
    if (isZip(bytes) || isPdf(bytes)) throw new Error('CONTENT_MISMATCH');
    return ext === '.md' ? 'markdown' : 'text';
  }
  if (ext === '.pdf') {
    if (!pdfMimes.has(normalizedMime)) throw new Error('MIME_MISMATCH');
    if (!isPdf(bytes)) throw new Error('CONTENT_MISMATCH');
    return 'pdf';
  }
  throw new Error('UNSUPPORTED_FORMAT');
}

function normalizeText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .split('\u0000')
    .join('')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodePdfLiteral(raw: string): string {
  let out = '';
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index]!;
    if (char !== '\\') {
      out += char;
      continue;
    }
    const next = raw[index + 1];
    if (next === undefined) break;
    index += 1;
    switch (next) {
      case 'n':
        out += '\n';
        break;
      case 'r':
        out += '\r';
        break;
      case 't':
        out += '\t';
        break;
      case 'b':
      case 'f':
        break;
      case '(':
      case ')':
      case '\\':
        out += next;
        break;
      default:
        if (next >= '0' && next <= '7') {
          let octal = next;
          while (
            octal.length < 3 &&
            raw[index + 1] !== undefined &&
            raw[index + 1]! >= '0' &&
            raw[index + 1]! <= '7'
          ) {
            index += 1;
            octal += raw[index]!;
          }
          out += String.fromCharCode(Number.parseInt(octal, 8));
        } else {
          out += next;
        }
    }
  }
  return out;
}

function decodePdfHex(raw: string): string {
  const hex = raw.replace(/[^0-9a-fA-F]/g, '');
  let out = '';
  for (let index = 0; index + 1 < hex.length; index += 2) {
    out += String.fromCharCode(Number.parseInt(hex.slice(index, index + 2), 16));
  }
  return out;
}

function extractTextOperators(content: string): string[] {
  const fragments: string[] = [];
  const tokens = /\((?:\\.|[^\\()])*\)|<[0-9a-fA-F\s]+>/g;
  let match: RegExpExecArray | null;
  while ((match = tokens.exec(content)) !== null) {
    const token = match[0];
    if (token.startsWith('(')) fragments.push(decodePdfLiteral(token.slice(1, -1)));
    else fragments.push(decodePdfHex(token.slice(1, -1)));
  }
  return fragments.map((item) => item.trim()).filter((item) => item.length > 0);
}

function inflateStream(stream: Buffer): string | null {
  try {
    return inflateSync(stream).toString('latin1');
  } catch {
    const raw = stream.toString('latin1');
    return /(BT|\bTj\b|\bTJ\b)/.test(raw) ? raw : null;
  }
}

export function extractPdfPages(bytes: Buffer): string[] {
  const source = bytes.toString('latin1');
  const pageCount = (source.match(/\/Type\s*\/Page(?![s])/g) ?? []).length;
  const streams: Buffer[] = [];
  const marker = /stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(source)) !== null) {
    const start = match.index + match[0].length;
    const end = source.indexOf('endstream', start);
    if (end < 0) break;
    let sliceEnd = end;
    if (source[sliceEnd - 2] === '\r' && source[sliceEnd - 1] === '\n')
      sliceEnd -= 2;
    else if (source[sliceEnd - 1] === '\n') sliceEnd -= 1;
    streams.push(Buffer.from(source.slice(start, sliceEnd), 'latin1'));
  }
  const pageTexts: string[] = [];
  for (const stream of streams) {
    const decoded = inflateStream(stream);
    if (!decoded) continue;
    if (!/(BT|\bTj\b|\bTJ\b)/.test(decoded)) continue;
    const fragments = extractTextOperators(decoded);
    if (fragments.length === 0) continue;
    pageTexts.push(normalizeText(fragments.join(' ')));
  }
  const nonEmpty = pageTexts.filter((page) => page.length > 0);
  if (nonEmpty.length === 0) return [];
  if (pageCount > nonEmpty.length) {
    const remainder = pageCount - nonEmpty.length;
    return [
      ...nonEmpty,
      ...Array.from({ length: remainder }, () => ''),
    ];
  }
  return nonEmpty;
}

export function extractKnowledgeText(
  kind: KnowledgeFileKind,
  bytes: Buffer,
): ExtractedKnowledgeText {
  if (kind === 'pdf') {
    const pages = extractPdfPages(bytes);
    const text = normalizeText(pages.join('\n\n'));
    return { pages, text };
  }
  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('INVALID_ENCODING');
  }
  const text = normalizeText(decoded.replace(/^\uFEFF/, ''));
  return { pages: text.length === 0 ? [] : [text], text };
}
