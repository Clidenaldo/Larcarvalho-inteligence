import { createHash } from 'node:crypto';

export const KNOWLEDGE_CHUNK_CHARS = 1200;
export const KNOWLEDGE_CHUNK_OVERLAP = 200;
export const KNOWLEDGE_MAX_CHUNKS = 2000;

export interface KnowledgeChunkDraft {
  readonly content: string;
  readonly contentHash: string;
  readonly ordinal: number;
  readonly page: number | null;
  readonly section: string | null;
  readonly tokens: number;
}

export interface ChunkOptions {
  readonly maxChars?: number;
  readonly overlapChars?: number;
}

function hash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function tokensOf(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4));
}

function paragraphs(page: string): { section: string | null; text: string }[] {
  const blocks: { section: string | null; text: string }[] = [];
  let section: string | null = null;
  for (const rawLine of page.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    const heading = /^#{1,6}\s+(.+)$/.exec(line);
    if (heading?.[1]) {
      section = heading[1].trim().slice(0, 300);
      continue;
    }
    blocks.push({ section, text: line });
  }
  return blocks;
}

/**
 * Deterministic, dependency-free chunker. Each page is chunked independently so
 * `page` stays accurate; markdown headings become the chunk `section`.
 */
export function chunkKnowledgeText(
  pages: readonly string[],
  options: ChunkOptions = {},
): KnowledgeChunkDraft[] {
  const target = options.maxChars ?? KNOWLEDGE_CHUNK_CHARS;
  const overlap = options.overlapChars ?? KNOWLEDGE_CHUNK_OVERLAP;
  const source = pages.length > 0 ? pages : [''];
  const drafts: KnowledgeChunkDraft[] = [];

  const push = (content: string, section: string | null, page: number): void => {
    const trimmed = content.trim();
    if (trimmed.length === 0) return;
    const previous = drafts[drafts.length - 1];
    if (previous && previous.content === trimmed) return;
    if (
      previous &&
      trimmed.length <= overlap &&
      previous.content.endsWith(trimmed)
    )
      return;
    drafts.push({
      content: trimmed,
      contentHash: hash(trimmed),
      ordinal: drafts.length,
      page,
      section,
      tokens: tokensOf(trimmed),
    });
  };

  const splitLong = (text: string): string[] => {
    if (text.length <= target) return [text];
    const slices: string[] = [];
    let start = 0;
    while (start < text.length) {
      const end = Math.min(text.length, start + target);
      slices.push(text.slice(start, end));
      if (end >= text.length) break;
      start = end - overlap;
    }
    return slices;
  };

  source.forEach((page, index) => {
    const blocks = paragraphs(page).flatMap((block) =>
      splitLong(block.text).map((text) => ({ section: block.section, text })),
    );
    if (blocks.length === 0) return;
    let buffer = '';
    let bufferSection: string | null = blocks[0]?.section ?? null;
    const flush = (): void => {
      const content = buffer.trim();
      if (content.length === 0) return;
      push(content, bufferSection, index + 1);
      buffer = content.length > overlap ? content.slice(-overlap) : content;
    };
    for (const block of blocks) {
      if (buffer.trim().length === 0) {
        bufferSection = block.section;
        buffer = block.text;
        continue;
      }
      if (buffer.length + 1 + block.text.length > target) {
        flush();
        bufferSection = block.section;
        buffer = `${buffer} ${block.text}`.trim();
      } else {
        buffer = `${buffer}\n${block.text}`;
      }
    }
    const content = buffer.trim();
    if (content.length > 0) push(content, bufferSection, index + 1);
  });

  return drafts.slice(0, KNOWLEDGE_MAX_CHUNKS);
}

export function checksumOf(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
