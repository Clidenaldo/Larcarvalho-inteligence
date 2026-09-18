import type {
  KnowledgeCategory,
  KnowledgeVisibility,
} from '@larcarvalho/shared';

import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';
import type { KnowledgeChunkDraft } from './knowledge-chunker.js';

export const documentInclude = {
  owner: { select: { nome: true } },
  team: { select: { name: true } },
  _count: { select: { chunks: true } },
} satisfies Prisma.KnowledgeDocumentInclude;

export type KnowledgeDocumentRecord = Prisma.KnowledgeDocumentGetPayload<{
  include: typeof documentInclude;
}>;

export interface SearchRow {
  readonly category: KnowledgeCategory;
  readonly chunkId: string;
  readonly content: string;
  readonly documentId: string;
  readonly documentTitle: string;
  readonly ordinal: number;
  readonly page: number | null;
  readonly score: number;
  readonly section: string | null;
  readonly visibility: KnowledgeVisibility;
}

export interface LexicalSearchInput {
  readonly category?: KnowledgeCategory | undefined;
  readonly documentId?: string | undefined;
  readonly limit: number;
  readonly query: string;
  readonly visibility: Prisma.Sql;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

const FALLBACK_STOPWORDS = new Set([
  'como',
  'das',
  'dos',
  'uma',
  'para',
  'por',
  'qual',
  'quais',
  'que',
  'sobre',
]);

/**
 * Natural-language questions rarely satisfy an AND-based full-text query, so
 * the fallback searches any meaningful term and ranks chunks by how many terms
 * they match. This keeps recall useful without claiming semantic search.
 */
function fallbackTerms(query: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const raw of query.toLowerCase().split(/\s+/)) {
    const token = raw.replace(/[^\p{L}\p{N}]/gu, '');
    if (token.length < 3 || FALLBACK_STOPWORDS.has(token) || seen.has(token))
      continue;
    seen.add(token);
    terms.push(token);
    if (terms.length >= 8) break;
  }
  if (terms.length === 0) {
    const single = query.trim().slice(0, 200);
    if (single.length > 0) terms.push(single);
  }
  return terms;
}

const searchColumns = Prisma.sql`
  c."id" AS "chunkId",
  c."document_id" AS "documentId",
  c."ordinal" AS "ordinal",
  c."content" AS "content",
  c."section" AS "section",
  c."page" AS "page",
  d."title" AS "documentTitle",
  d."category" AS "category",
  d."visibility" AS "visibility"
`;

export class KnowledgeRepository {
  constructor(private readonly db: PrismaClient) {}

  createDocument(
    data: Prisma.KnowledgeDocumentUncheckedCreateInput,
  ): Promise<KnowledgeDocumentRecord> {
    return this.db.knowledgeDocument.create({
      data,
      include: documentInclude,
    });
  }

  updateDocument(
    id: string,
    data: Prisma.KnowledgeDocumentUncheckedUpdateInput,
  ): Promise<KnowledgeDocumentRecord> {
    return this.db.knowledgeDocument.update({
      where: { id },
      data,
      include: documentInclude,
    });
  }

  findDocument(id: string): Promise<KnowledgeDocumentRecord | null> {
    return this.db.knowledgeDocument.findUnique({
      where: { id },
      include: documentInclude,
    });
  }

  findDuplicateDocument(
    checksum: string,
    excludeId?: string,
  ): Promise<{ id: string; title: string } | null> {
    return this.db.knowledgeDocument.findFirst({
      where: {
        checksum,
        status: { not: 'ARCHIVED' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, title: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  countDocuments(where: Prisma.KnowledgeDocumentWhereInput): Promise<number> {
    return this.db.knowledgeDocument.count({ where });
  }

  listDocuments(
    where: Prisma.KnowledgeDocumentWhereInput,
    skip: number,
    take: number,
  ): Promise<KnowledgeDocumentRecord[]> {
    return this.db.knowledgeDocument.findMany({
      where,
      include: documentInclude,
      orderBy: [{ updatedAt: 'desc' }],
      skip,
      take,
    });
  }

  listChunks(documentId: string) {
    return this.db.knowledgeChunk.findMany({
      where: { documentId },
      orderBy: { ordinal: 'asc' },
    });
  }

  async replaceChunks(
    documentId: string,
    drafts: readonly KnowledgeChunkDraft[],
  ): Promise<number> {
    return this.db.$transaction(async (tx) => {
      await tx.knowledgeChunk.deleteMany({ where: { documentId } });
      if (drafts.length > 0) {
        await tx.knowledgeChunk.createMany({
          data: drafts.map((draft) => ({
            content: draft.content,
            contentHash: draft.contentHash,
            documentId,
            ordinal: draft.ordinal,
            page: draft.page,
            section: draft.section,
            tokens: draft.tokens,
          })),
        });
      }
      return drafts.length;
    });
  }

  createIngestion(documentId: string) {
    return this.db.knowledgeIngestion.create({
      data: { documentId, status: 'PENDING' },
    });
  }

  finishIngestion(
    id: string,
    input: {
      chunksCreated: number;
      error?: string | null;
      status: 'READY' | 'FAILED';
    },
  ) {
    return this.db.knowledgeIngestion.update({
      where: { id },
      data: {
        chunksCreated: input.chunksCreated,
        error: input.error ?? null,
        finishedAt: new Date(),
        status: input.status,
      },
    });
  }

  listIngestions(documentId: string) {
    return this.db.knowledgeIngestion.findMany({
      where: { documentId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async lexicalSearch(input: LexicalSearchInput): Promise<SearchRow[]> {
    const category = input.category
      ? Prisma.sql`d."category" = ${input.category}::"knowledge_category"`
      : Prisma.sql`TRUE`;
    const document = input.documentId
      ? Prisma.sql`d."id" = ${input.documentId}::uuid`
      : Prisma.sql`TRUE`;
    return this.db.$queryRaw<SearchRow[]>(Prisma.sql`
      SELECT ${searchColumns},
        ts_rank_cd(
          to_tsvector('portuguese', c."content"),
          websearch_to_tsquery('portuguese', ${input.query})
        ) AS "score"
      FROM "knowledge_chunks" c
      JOIN "knowledge_documents" d ON d."id" = c."document_id"
      WHERE d."status" = 'READY'
        AND ${category}
        AND ${document}
        AND ${input.visibility}
        AND to_tsvector('portuguese', c."content")
          @@ websearch_to_tsquery('portuguese', ${input.query})
      ORDER BY "score" DESC, c."ordinal" ASC
      LIMIT ${input.limit}
    `);
  }
  async fallbackSearch(input: LexicalSearchInput): Promise<SearchRow[]> {
    const patterns = fallbackTerms(input.query).map(
      (term) => `%${escapeLike(term)}%`,
    );
    if (patterns.length === 0) return [];
    const terms = Prisma.sql`ARRAY[${Prisma.join(
      patterns.map((pattern) => Prisma.sql`${pattern}`),
      ', ',
    )}]::text[]`;
    const category = input.category
      ? Prisma.sql`d."category" = ${input.category}::"knowledge_category"`
      : Prisma.sql`TRUE`;
    const document = input.documentId
      ? Prisma.sql`d."id" = ${input.documentId}::uuid`
      : Prisma.sql`TRUE`;
    return this.db.$queryRaw<SearchRow[]>(Prisma.sql`
      SELECT ${searchColumns},
        (
          SELECT count(*)
          FROM unnest(${terms}) AS term
          WHERE c."content" ILIKE term OR d."title" ILIKE term
        )::float8 AS "score"
      FROM "knowledge_chunks" c
      JOIN "knowledge_documents" d ON d."id" = c."document_id"
      WHERE d."status" = 'READY'
        AND ${category}
        AND ${document}
        AND ${input.visibility}
        AND (c."content" ILIKE ANY(${terms}) OR d."title" ILIKE ANY(${terms}))
      ORDER BY "score" DESC, c."ordinal" ASC
      LIMIT ${input.limit}
    `);
  }

  /**
   * Chunk ids the actor may already open (READY + visibility). Used to
   * restrict the vector candidate universe BEFORE similarity search.
   */
  async listAuthorizedChunkIds(input: {
    category?: KnowledgeCategory | undefined;
    documentId?: string | undefined;
    visibility: Prisma.Sql;
  }): Promise<ReadonlySet<string>> {
    const category = input.category
      ? Prisma.sql`d."category" = ${input.category}::"knowledge_category"`
      : Prisma.sql`TRUE`;
    const document = input.documentId
      ? Prisma.sql`d."id" = ${input.documentId}::uuid`
      : Prisma.sql`TRUE`;
    const rows = await this.db.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT c."id" AS "id"
      FROM "knowledge_chunks" c
      JOIN "knowledge_documents" d ON d."id" = c."document_id"
      WHERE d."status" = 'READY'
        AND ${category}
        AND ${document}
        AND ${input.visibility}
    `);
    return new Set(rows.map((row) => row.id));
  }

  async findChunksByIds(
    chunkIds: readonly string[],
    visibility: Prisma.Sql,
  ): Promise<SearchRow[]> {
    if (chunkIds.length === 0) return [];
    return this.db.$queryRaw<SearchRow[]>(Prisma.sql`
      SELECT ${searchColumns}, 0::float8 AS "score"
      FROM "knowledge_chunks" c
      JOIN "knowledge_documents" d ON d."id" = c."document_id"
      WHERE d."status" = 'READY'
        AND c."id" = ANY(ARRAY[${Prisma.join(
          chunkIds.map((id) => Prisma.sql`${id}::uuid`),
          ', ',
        )}]::uuid[])
        AND ${visibility}
    `);
  }

  listChunksNeedingEmbeddings(
    model: string,
    version: string,
    limit: number,
  ): Promise<
    readonly { content: string; documentId: string; id: string }[]
  > {
    return this.db.knowledgeChunk.findMany({
      orderBy: { createdAt: 'asc' },
      select: { content: true, documentId: true, id: true },
      take: Math.max(1, limit),
      where: {
        document: { status: 'READY' },
        OR: [
          { embeddingStatus: 'NONE' },
          { embeddingStatus: 'FAILED' },
          {
            embeddingStatus: 'READY',
            NOT: [{ embeddingModel: model }, { embeddingVersion: version }],
          },
        ],
      },
    });
  }

  async markChunksEmbedded(
    chunkIds: readonly string[],
    input: { model: string; version: string },
  ): Promise<void> {
    if (chunkIds.length === 0) return;
    await this.db.knowledgeChunk.updateMany({
      data: {
        embeddedAt: new Date(),
        embeddingModel: input.model,
        embeddingStatus: 'READY',
        embeddingVersion: input.version,
      },
      where: { id: { in: [...chunkIds] } },
    });
  }

  async markChunksEmbeddingFailed(chunkIds: readonly string[]): Promise<void> {
    if (chunkIds.length === 0) return;
    await this.db.knowledgeChunk.updateMany({
      data: { embeddingStatus: 'FAILED' },
      where: { id: { in: [...chunkIds] } },
    });
  }

  refreshDocumentEmbeddingStatus(documentId: string): Promise<unknown> {
    return this.db.$transaction(async (tx) => {
      const [total, ready, failed] = await Promise.all([
        tx.knowledgeChunk.count({ where: { documentId } }),
        tx.knowledgeChunk.count({
          where: { documentId, embeddingStatus: 'READY' },
        }),
        tx.knowledgeChunk.count({
          where: { documentId, embeddingStatus: 'FAILED' },
        }),
      ]);
      const status =
        total === 0 || ready === 0
          ? failed > 0
            ? 'FAILED'
            : 'NONE'
          : ready === total
            ? 'READY'
            : failed > 0
              ? 'FAILED'
              : 'PENDING';
      const latest = await tx.knowledgeChunk.findFirst({
        orderBy: { embeddedAt: 'desc' },
        select: { embeddedAt: true, embeddingModel: true },
        where: { documentId, embeddingStatus: 'READY' },
      });
      return tx.knowledgeDocument.update({
        data: {
          embeddedAt: latest?.embeddedAt ?? null,
          embeddingModel: latest?.embeddingModel ?? null,
          embeddingStatus: status,
        },
        where: { id: documentId },
      });
    });
  }
}
