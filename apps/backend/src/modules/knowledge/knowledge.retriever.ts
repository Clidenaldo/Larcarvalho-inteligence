import type {
  KnowledgeRequestMode,
  KnowledgeSearchQuery,
  KnowledgeSearchResponse,
  KnowledgeSearchResult,
} from '@larcarvalho/shared';

import type { AuthContext } from '../../core/auth/auth-context.js';
import { AppError } from '../../core/errors/app-error.js';
import type { VectorStore } from '../ai/vector-store.js';
import { reciprocalRankFusion } from '../ai/rrf.js';
import type { EmbeddingProvider } from './embeddings.js';
import type { SearchRow } from './knowledge.repository.js';
import { knowledgeVisibilitySql } from './knowledge-authorization.js';
import type { KnowledgeRepository } from './knowledge.repository.js';

const EXCERPT_RADIUS = 180;
const EXCERPT_MAX = 400;

export const KNOWLEDGE_NOT_FOUND_MESSAGE =
  'Não encontrei informação suficiente nas fontes disponíveis.';

function buildExcerpt(content: string, query: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((term) => term.length >= 3);
  const haystack = normalized.toLowerCase();
  let index = -1;
  for (const term of terms) {
    index = haystack.indexOf(term);
    if (index >= 0) break;
  }
  if (index < 0) {
    return normalized.length > EXCERPT_MAX
      ? `${normalized.slice(0, EXCERPT_MAX)}…`
      : normalized;
  }
  const start = Math.max(0, index - EXCERPT_RADIUS);
  const end = Math.min(normalized.length, index + EXCERPT_RADIUS);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < normalized.length ? '…' : '';
  return `${prefix}${normalized.slice(start, end)}${suffix}`;
}

function toResult(row: SearchRow, query: string): KnowledgeSearchResult {
  return {
    category: row.category,
    chunkId: row.chunkId,
    documentId: row.documentId,
    documentTitle: row.documentTitle,
    excerpt: buildExcerpt(row.content, query),
    ordinal: row.ordinal,
    page: row.page,
    score: Number(row.score),
    section: row.section,
    visibility: row.visibility,
  };
}

export interface RetrieverOptions {
  readonly rrfK?: number | undefined;
  readonly vectorStore?: VectorStore | null | undefined;
}

export class KnowledgeRetriever {
  constructor(
    private readonly repository: KnowledgeRepository,
    private readonly embeddings: EmbeddingProvider,
    private readonly options: RetrieverOptions = {},
  ) {}

  private vectorReady(): boolean {
    return (
      this.embeddings.enabled &&
      this.options.vectorStore !== null &&
      this.options.vectorStore !== undefined
    );
  }

  async search(
    actor: AuthContext,
    query: KnowledgeSearchQuery,
  ): Promise<KnowledgeSearchResponse> {
    const mode: KnowledgeRequestMode = query.mode ?? 'lexical';
    if (mode !== 'lexical' && !this.vectorReady()) {
      // Honest unavailability: never simulate semantic search.
      throw new AppError({
        code: 'VECTOR_SEARCH_UNAVAILABLE',
        message:
          'Busca vetorial indisponível: nenhum índice vetorial operacional. Use mode=lexical.',
        statusCode: 503,
      });
    }
    const visibility = knowledgeVisibilitySql(actor);
    const params = {
      limit: query.limit,
      query: query.q,
      visibility,
      ...(query.category ? { category: query.category } : {}),
      ...(query.documentId ? { documentId: query.documentId } : {}),
    };
    if (mode === 'lexical') return this.lexical(actor, query, params);
    if (mode === 'semantic')
      return this.semantic(actor, query, params, query.limit);
    return this.hybrid(actor, query, params, query.limit);
  }

  private async lexical(
    _actor: AuthContext,
    query: KnowledgeSearchQuery,
    params: {
      category?: KnowledgeSearchQuery['category'];
      documentId?: string;
      limit: number;
      query: string;
      visibility: ReturnType<typeof knowledgeVisibilitySql>;
    },
  ): Promise<KnowledgeSearchResponse> {
    let rows: SearchRow[];
    try {
      rows = await this.repository.lexicalSearch(params);
    } catch {
      rows = [];
    }
    if (rows.length === 0) {
      rows = await this.repository.fallbackSearch(params);
    }
    return this.respond(query.q, rows, 'LEXICAL', false);
  }

  private async semantic(
    actor: AuthContext,
    query: KnowledgeSearchQuery,
    params: {
      category?: KnowledgeSearchQuery['category'];
      documentId?: string;
      limit: number;
      query: string;
      visibility: ReturnType<typeof knowledgeVisibilitySql>;
    },
    limit: number,
  ): Promise<KnowledgeSearchResponse> {
    const store = this.options.vectorStore!;
    const [vectors] = await this.embeddings.embed([query.q]);
    if (!vectors) {
      throw new AppError({
        code: 'EMBEDDING_UNAVAILABLE',
        message: 'Embeddings indisponíveis no momento.',
        statusCode: 503,
      });
    }
    // RBAC BEFORE retrieval: candidates are restricted to chunks of
    // documents the actor may already open. TEAM_B never enters the set.
    const allowed = await this.repository.listAuthorizedChunkIds({
      category: params.category,
      documentId: params.documentId,
      visibility: params.visibility,
    });
    const candidates = await store.search(vectors, limit, allowed);
    const positive = candidates.filter((candidate) => candidate.similarity > 0);
    if (positive.length === 0) return this.respond(query.q, [], 'HYBRID', true);
    const rows = await this.repository.findChunksByIds(
      positive.map((candidate) => candidate.chunkId),
      params.visibility,
    );
    const similarity = new Map(
      candidates.map((candidate) => [candidate.chunkId, candidate.similarity]),
    );
    const scored = rows.map((row) => ({
      ...row,
      score: similarity.get(row.chunkId) ?? 0,
    }));
    scored.sort((a, b) => b.score - a.score);
    return this.respond(query.q, scored.slice(0, limit), 'HYBRID', true);
  }

  private async hybrid(
    actor: AuthContext,
    query: KnowledgeSearchQuery,
    params: {
      category?: KnowledgeSearchQuery['category'];
      documentId?: string;
      limit: number;
      query: string;
      visibility: ReturnType<typeof knowledgeVisibilitySql>;
    },
    limit: number,
  ): Promise<KnowledgeSearchResponse> {
    const store = this.options.vectorStore!;
    const [lexicalRows, vectors] = await Promise.all([
      this.repository.lexicalSearch({ ...params, limit: limit * 2 }).catch(() => []),
      this.embeddings.embed([query.q]),
    ]);
    const queryVector = vectors[0];
    let semanticIds: readonly string[] = [];
    if (queryVector) {
      const allowed = await this.repository.listAuthorizedChunkIds({
        category: params.category,
        documentId: params.documentId,
        visibility: params.visibility,
      });
      const candidates = await store.search(queryVector, limit * 2, allowed);
      semanticIds = candidates
        .filter((candidate) => candidate.similarity > 0)
        .map((candidate) => candidate.chunkId);
    }
    const fused = reciprocalRankFusion(
      [
        lexicalRows.map((row) => row.chunkId),
        [...semanticIds],
      ],
      this.options.rrfK ?? 60,
    ).slice(0, limit);
    // Explicit hybrid callers get an honest HYBRID answer (possibly empty):
    // no silent engine switch to the lexical ILIKE fallback here.
    if (fused.length === 0) return this.respond(query.q, [], 'HYBRID', true);
    const order = new Map(fused.map((item, index) => [item.chunkId, index]));
    const scoreById = new Map(fused.map((item) => [item.chunkId, item.score]));
    const rows = await this.repository.findChunksByIds(
      fused.map((item) => item.chunkId),
      params.visibility,
    );
    const scored = rows.map((row) => ({
      ...row,
      score: scoreById.get(row.chunkId) ?? 0,
    }));
    scored.sort(
      (a, b) => (order.get(a.chunkId) ?? 0) - (order.get(b.chunkId) ?? 0),
    );
    void actor;
    return this.respond(query.q, scored, 'HYBRID', true);
  }

  private respond(
    query: string,
    rows: SearchRow[],
    mode: 'LEXICAL' | 'HYBRID',
    semanticEnabled: boolean,
  ): KnowledgeSearchResponse {
    const results = rows.map((row) => toResult(row, query));
    return {
      grounded: results.length > 0,
      message: results.length === 0 ? KNOWLEDGE_NOT_FOUND_MESSAGE : null,
      mode,
      query,
      results,
      semanticEnabled,
      total: results.length,
    };
  }
}
