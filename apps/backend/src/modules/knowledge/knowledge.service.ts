import { randomUUID } from 'node:crypto';

import type {
  ApiErrorCode,
  CreateKnowledgeTextRequest,
  KnowledgeDocument,
  KnowledgeDocumentDetail,
  KnowledgeDocumentListQuery,
  KnowledgeDocumentListResponse,
  KnowledgeIngestion,
  KnowledgeSearchQuery,
  KnowledgeSearchResponse,
  KnowledgeUploadMetadata,
  UpdateKnowledgeDocumentRequest,
} from '@larcarvalho/shared';
import {
  createKnowledgeTextRequestSchema,
  knowledgeDocumentListQuerySchema,
  knowledgeDocumentListResponseSchema,
  knowledgeErrorMessage,
  knowledgeSearchQuerySchema,
  knowledgeUploadMetadataSchema,
} from '@larcarvalho/shared';

import type { AuthContext } from '../../core/auth/auth-context.js';
import { requireAccess } from '../../core/auth/data-scope.js';
import { hasPermission } from '../../core/auth/rbac.js';
import { AppError } from '../../core/errors/app-error.js';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import {
  EMPTY_AUTHORIZED_FACTS,
  type AiAuthorizedFacts,
} from '../ai/ai-context-builder.js';
import { DATA_NOT_AVAILABLE } from '../ai/guardrails.js';
import {
  chunkKnowledgeText,
  checksumOf,
} from './knowledge-chunker.js';
import {
  assertKnowledgeFile,
  extractKnowledgeText,
  KNOWLEDGE_MIN_TEXT_CHARS,
  type KnowledgeFileKind,
} from './knowledge-parser.js';
import {
  assertCanManageDocument,
  assertCanViewDocument,
  knowledgeVisibilityFilter,
} from './knowledge-authorization.js';
import { DisabledEmbeddingProvider, type EmbeddingProvider } from './embeddings.js';
import {
  type KnowledgeDocumentRecord,
  KnowledgeRepository,
} from './knowledge.repository.js';
import { KnowledgeRetriever } from './knowledge.retriever.js';
import type { VectorStore } from '../ai/vector-store.js';
import type { KnowledgeStorage } from './knowledge-storage.js';

export interface KnowledgeServiceOptions {
  readonly maxBytes: number;
  readonly retrievalMode?: 'lexical' | 'hybrid';
  readonly rrfK?: number;
  readonly topK?: number;
  readonly vectorStore?: VectorStore | null;
}

export interface UploadKnowledgeInput {
  readonly bytes: Buffer;
  readonly filename: string;
  readonly metadata: unknown;
  readonly mime: string;
}

interface IngestionEdit {
  readonly actorId: string;
  readonly action: string;
  readonly entityId: string;
  readonly metadata?: Prisma.InputJsonValue;
}

function iso(value: Date): string {
  return value.toISOString();
}

function mapIngestion(row: {
  chunksCreated: number;
  createdAt: Date;
  documentId: string;
  error: string | null;
  finishedAt: Date | null;
  id: string;
  startedAt: Date | null;
  status: KnowledgeIngestion['status'];
}): KnowledgeIngestion {
  return {
    chunksCreated: row.chunksCreated,
    createdAt: iso(row.createdAt),
    documentId: row.documentId,
    error: row.error,
    finishedAt: row.finishedAt ? iso(row.finishedAt) : null,
    id: row.id,
    startedAt: row.startedAt ? iso(row.startedAt) : null,
    status: row.status,
  };
}

const FILE_ERROR_MAP: Readonly<
  Record<string, { code: ApiErrorCode; message: string }>
> = {
  CONTENT_MISMATCH: { code: 'KNOWLEDGE_FILE_INVALID', message: knowledgeErrorMessage.contentMismatch },
  EMPTY_FILE: { code: 'KNOWLEDGE_FILE_INVALID', message: knowledgeErrorMessage.emptyFile },
  FILE_TOO_LARGE: { code: 'KNOWLEDGE_FILE_INVALID', message: knowledgeErrorMessage.fileTooLarge },
  INVALID_ENCODING: { code: 'KNOWLEDGE_EXTRACTION_FAILED', message: knowledgeErrorMessage.insufficientText },
  MIME_MISMATCH: { code: 'KNOWLEDGE_FILE_INVALID', message: knowledgeErrorMessage.mimeMismatch },
  UNSUPPORTED_FORMAT: { code: 'KNOWLEDGE_FILE_INVALID', message: knowledgeErrorMessage.unsupportedFormat },
};

export class KnowledgeService {
  private readonly repository: KnowledgeRepository;
  private readonly retriever: KnowledgeRetriever;

  constructor(
    private readonly db: PrismaClient,
    private readonly storage: KnowledgeStorage,
    private readonly options: KnowledgeServiceOptions,
    private readonly embeddings: EmbeddingProvider = new DisabledEmbeddingProvider(),
  ) {
    this.repository = new KnowledgeRepository(db);
    this.retriever = new KnowledgeRetriever(this.repository, embeddings, {
      rrfK: options.rrfK,
      vectorStore: options.vectorStore ?? null,
    });
  }

  private hybridAvailable(): boolean {
    return (
      this.options.retrievalMode === 'hybrid' &&
      this.embeddings.enabled &&
      !!this.options.vectorStore
    );
  }

  private toDocument(record: KnowledgeDocumentRecord): KnowledgeDocument {
    return {
      category: record.category,
      checksum: record.checksum,
      chunkCount: record._count.chunks,
      createdAt: iso(record.createdAt),
      description: record.description,
      documentGroupId: record.documentGroupId,
      embeddedAt: record.embeddedAt ? iso(record.embeddedAt) : null,
      embeddingModel: record.embeddingModel,
      embeddingStatus: record.embeddingStatus,
      failureReason: record.failureReason,
      id: record.id,
      mimeType: record.mimeType,
      originalName: record.originalName,
      ownerName: record.owner?.nome ?? null,
      ownerUserId: record.ownerUserId,
      processedAt: record.processedAt ? iso(record.processedAt) : null,
      sizeBytes: record.sizeBytes,
      sourceType: record.sourceType,
      status: record.status,
      tags: record.tags,
      teamId: record.teamId,
      teamName: record.team?.name ?? null,
      title: record.title,
      updatedAt: iso(record.updatedAt),
      version: record.version,
      visibility: record.visibility,
    };
  }

  private async audit(edit: IngestionEdit): Promise<void> {
    await this.db.auditLog.create({
      data: {
        action: edit.action,
        actorId: edit.actorId,
        entity: 'KnowledgeDocument',
        entityId: edit.entityId,
        ...(edit.metadata ? { metadata: edit.metadata } : {}),
      },
    });
  }

  private resolveTeamId(
    actor: AuthContext,
    visibility: KnowledgeDocument['visibility'],
    requested: string | null | undefined,
  ): string | null {
    if (visibility !== 'TEAM') return null;
    const allowed = [...(actor.teamIds ?? [])];
    if (requested) {
      if (!hasPermission(actor, 'knowledge.manage') && !allowed.includes(requested))
        throw new AppError({
          code: 'FORBIDDEN',
          message: 'Equipe não autorizada para este documento.',
          statusCode: 403,
        });
      return requested;
    }
    if (allowed.length > 0) return allowed[0]!;
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: 'Documento com visibilidade de equipe exige uma equipe.',
      statusCode: 400,
    });
  }

  private async assertNoDuplicate(checksum: string): Promise<void> {
    const duplicate = await this.repository.findDuplicateDocument(checksum);
    if (duplicate)
      throw new AppError({
        code: 'KNOWLEDGE_CONFLICT',
        message: `${knowledgeErrorMessage.conflict} Documento: "${duplicate.title}".`,
        statusCode: 409,
      });
  }

  private assertFile(
    filename: string,
    mime: string,
    bytes: Buffer,
  ): KnowledgeFileKind {
    try {
      return assertKnowledgeFile(filename, mime, bytes, this.options.maxBytes);
    } catch (error) {
      const token = error instanceof Error ? error.message : '';
      const mapped = FILE_ERROR_MAP[token];
      if (mapped)
        throw new AppError({ ...mapped, statusCode: token === 'FILE_TOO_LARGE' ? 413 : 400 });
      throw new AppError({
        code: 'KNOWLEDGE_FILE_INVALID',
        message: knowledgeErrorMessage.unsupportedFormat,
        statusCode: 400,
      });
    }
  }

  private extractText(kind: KnowledgeFileKind, bytes: Buffer) {
    try {
      return extractKnowledgeText(kind, bytes);
    } catch {
      throw new AppError({
        code: 'KNOWLEDGE_EXTRACTION_FAILED',
        message: knowledgeErrorMessage.insufficientText,
        statusCode: 422,
      });
    }
  }

  private async ingest(
    record: KnowledgeDocumentRecord,
    pages: readonly string[],
  ): Promise<KnowledgeDocumentRecord> {
    const drafts = chunkKnowledgeText(pages);
    if (drafts.length === 0)
      throw new AppError({
        code: 'KNOWLEDGE_EXTRACTION_FAILED',
        message: knowledgeErrorMessage.insufficientText,
        statusCode: 422,
      });
    const ingestion = await this.repository.createIngestion(record.id);
    try {
      const chunks = await this.repository.replaceChunks(record.id, drafts);
      const updated = await this.repository.updateDocument(record.id, {
        chunkCount: chunks,
        processedAt: new Date(),
        status: 'READY',
      });
      await this.repository.finishIngestion(ingestion.id, {
        chunksCreated: chunks,
        status: 'READY',
      });
      return updated;
    } catch (error) {
      const message =
        error instanceof Error ? error.message.slice(0, 480) : 'Falha na indexação.';
      await this.repository.updateDocument(record.id, {
        failureReason: message,
        status: 'FAILED',
      });
      await this.repository.finishIngestion(ingestion.id, {
        chunksCreated: 0,
        error: message,
        status: 'FAILED',
      });
      throw new AppError({
        code: 'KNOWLEDGE_EXTRACTION_FAILED',
        message: knowledgeErrorMessage.insufficientText,
        statusCode: 422,
      });
    }
  }

  async list(
    actor: AuthContext,
    rawQuery: unknown,
  ): Promise<KnowledgeDocumentListResponse> {
    const query: KnowledgeDocumentListQuery =
      knowledgeDocumentListQuerySchema.parse(rawQuery);
    requireAccess(actor, 'knowledge.read');
    const includeArchived = query.incluirArquivados === 'true';
    const filters: Record<string, unknown>[] = [knowledgeVisibilityFilter(actor)];
    if (!includeArchived && !query.status)
      filters.push({ status: { not: 'ARCHIVED' } });
    if (query.status) filters.push({ status: query.status });
    if (query.categoria) filters.push({ category: query.categoria });
    if (query.visibilidade) filters.push({ visibility: query.visibilidade });
    if (query.tag) filters.push({ tags: { has: query.tag } });
    if (query.busca) {
      filters.push({
        OR: [
          { title: { contains: query.busca, mode: 'insensitive' } },
          { description: { contains: query.busca, mode: 'insensitive' } },
          { contentText: { contains: query.busca, mode: 'insensitive' } },
        ],
      });
    }
    const where = { AND: filters };
    const [total, items] = await Promise.all([
      this.repository.countDocuments(where),
      this.repository.listDocuments(
        where,
        (query.page - 1) * query.pageSize,
        query.pageSize,
      ),
    ]);
    return knowledgeDocumentListResponseSchema.parse({
      items: items.map((item) => this.toDocument(item)),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    });
  }

  async get(actor: AuthContext, id: string): Promise<KnowledgeDocumentDetail> {
    requireAccess(actor, 'knowledge.read');
    const record = await this.repository.findDocument(id);
    if (!record)
      throw new AppError({
        code: 'KNOWLEDGE_NOT_FOUND',
        message: knowledgeErrorMessage.notFound,
        statusCode: 404,
      });
    assertCanViewDocument(actor, record);
    const chunks = await this.repository.listChunks(id);
    return {
      ...this.toDocument(record),
      chunks: chunks.map((chunk) => ({
        content: chunk.content,
        createdAt: iso(chunk.createdAt),
        documentId: chunk.documentId,
        id: chunk.id,
        ordinal: chunk.ordinal,
        page: chunk.page,
        section: chunk.section,
        tokens: chunk.tokens,
      })),
    };
  }

  async createText(
    actor: AuthContext,
    rawInput: unknown,
  ): Promise<KnowledgeDocument> {
    const input: CreateKnowledgeTextRequest =
      createKnowledgeTextRequestSchema.parse(rawInput);
    requireAccess(actor, 'knowledge.create');
    const checksum = checksumOf(Buffer.from(input.content, 'utf8'));
    await this.assertNoDuplicate(checksum);
    const teamId = this.resolveTeamId(
      actor,
      input.visibility,
      input.teamId ?? null,
    );
    const created = await this.repository.createDocument({
      category: input.category,
      checksum,
      contentText: input.content,
      description: input.description ?? null,
      documentGroupId: randomUUID(),
      ownerUserId: actor.user.id,
      sizeBytes: Buffer.byteLength(input.content, 'utf8'),
      sourceType: 'MANUAL',
      status: 'PROCESSING',
      tags: input.tags ?? [],
      teamId,
      title: input.title,
      version: 1,
      visibility: input.visibility,
    });
    await this.audit({
      action: 'KNOWLEDGE_DOCUMENT_CREATED',
      actorId: actor.user.id,
      entityId: created.id,
      metadata: { category: input.category, sourceType: 'MANUAL' },
    });
    const ready = await this.ingest(created, [input.content]);
    return this.toDocument(ready);
  }

  async upload(
    actor: AuthContext,
    input: UploadKnowledgeInput,
  ): Promise<KnowledgeDocument> {
    requireAccess(actor, 'knowledge.create');
    const metadata: KnowledgeUploadMetadata =
      knowledgeUploadMetadataSchema.parse(input.metadata);
    const kind = this.assertFile(input.filename, input.mime, input.bytes);
    const extracted = this.extractText(kind, input.bytes);
    if (extracted.text.length < KNOWLEDGE_MIN_TEXT_CHARS)
      throw new AppError({
        code: 'KNOWLEDGE_EXTRACTION_FAILED',
        message: knowledgeErrorMessage.insufficientText,
        statusCode: 422,
      });
    const checksum = checksumOf(input.bytes);
    await this.assertNoDuplicate(checksum);
    const teamId = this.resolveTeamId(
      actor,
      metadata.visibility,
      metadata.teamId ?? null,
    );
    const documentGroupId = randomUUID();
    const extension = input.filename.slice(input.filename.lastIndexOf('.'));
    const storageKey = `documents/${documentGroupId}/${randomUUID()}${extension}`;
    await this.storage.save({ buffer: input.bytes, key: storageKey });
    const created = await this.repository.createDocument({
      category: metadata.category,
      checksum,
      description: metadata.description ?? null,
      documentGroupId,
      mimeType: input.mime,
      originalName: input.filename,
      ownerUserId: actor.user.id,
      sizeBytes: input.bytes.length,
      sourceType: 'UPLOAD',
      status: 'PROCESSING',
      storageKey,
      tags: metadata.tags ?? [],
      teamId,
      title: metadata.title,
      version: 1,
      visibility: metadata.visibility,
    });
    await this.audit({
      action: 'KNOWLEDGE_DOCUMENT_CREATED',
      actorId: actor.user.id,
      entityId: created.id,
      metadata: {
        category: metadata.category,
        mimeType: input.mime,
        sourceType: 'UPLOAD',
      },
    });
    let ready: KnowledgeDocumentRecord;
    try {
      ready = await this.ingest(created, extracted.pages);
    } catch (error) {
      await this.storage.remove(storageKey).catch(() => undefined);
      throw error;
    }
    return this.toDocument(ready);
  }

  async update(
    actor: AuthContext,
    id: string,
    rawInput: unknown,
  ): Promise<KnowledgeDocument> {
    requireAccess(actor, 'knowledge.update');
    const record = await this.repository.findDocument(id);
    if (!record)
      throw new AppError({
        code: 'KNOWLEDGE_NOT_FOUND',
        message: knowledgeErrorMessage.notFound,
        statusCode: 404,
      });
    assertCanManageDocument(actor, record);
    const input = rawInput as UpdateKnowledgeDocumentRequest;
    const visibility = input.visibility ?? record.visibility;
    const teamId =
      input.visibility !== undefined
        ? this.resolveTeamId(actor, visibility, input.teamId ?? null)
        : record.teamId;
    const updated = await this.repository.updateDocument(id, {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      visibility,
      teamId,
    });
    await this.audit({
      action: 'KNOWLEDGE_DOCUMENT_UPDATED',
      actorId: actor.user.id,
      entityId: id,
    });
    return this.toDocument(updated);
  }

  async archive(actor: AuthContext, id: string): Promise<KnowledgeDocument> {
    requireAccess(actor, 'knowledge.archive');
    const record = await this.repository.findDocument(id);
    if (!record)
      throw new AppError({
        code: 'KNOWLEDGE_NOT_FOUND',
        message: knowledgeErrorMessage.notFound,
        statusCode: 404,
      });
    assertCanManageDocument(actor, record);
    const updated = await this.repository.updateDocument(id, {
      status: 'ARCHIVED',
    });
    await this.audit({
      action: 'KNOWLEDGE_DOCUMENT_ARCHIVED',
      actorId: actor.user.id,
      entityId: id,
    });
    return this.toDocument(updated);
  }

  async listIngestions(
    actor: AuthContext,
    id: string,
  ): Promise<readonly KnowledgeIngestion[]> {
    requireAccess(actor, 'knowledge.read');
    const record = await this.repository.findDocument(id);
    if (!record)
      throw new AppError({
        code: 'KNOWLEDGE_NOT_FOUND',
        message: knowledgeErrorMessage.notFound,
        statusCode: 404,
      });
    assertCanViewDocument(actor, record);
    const rows = await this.repository.listIngestions(id);
    return rows.map((row) => mapIngestion(row));
  }

  async search(
    actor: AuthContext,
    rawQuery: unknown,
  ): Promise<KnowledgeSearchResponse> {
    requireAccess(actor, 'knowledge.search');
    const query: KnowledgeSearchQuery =
      knowledgeSearchQuerySchema.parse(rawQuery);
    return this.retriever.search(actor, query);
  }

  /**
   * Read-only facts for the AI copilot. Never returns text from documents the
   * actor could not open; the model receives excerpts plus stable source ids.
   */
  async buildKnowledgeFacts(
    actor: AuthContext,
    question: string,
    limit = this.options.topK ?? 5,
  ): Promise<AiAuthorizedFacts> {
    if (!hasPermission(actor, 'knowledge.search'))
      return EMPTY_AUTHORIZED_FACTS;
    const trimmed = question.trim();
    if (trimmed.length < 2)
      return {
        attentionPoints: [],
        facts: [],
        missingInformation: [DATA_NOT_AVAILABLE],
        sources: [],
      };
    const response = await this.retriever.search(actor, {
      limit: Math.min(Math.max(limit, 1), 20),
      mode: this.hybridAvailable() ? 'hybrid' : 'lexical',
      q: trimmed.slice(0, 500),
    });
    if (response.results.length === 0)
      return {
        attentionPoints: [],
        facts: [],
        missingInformation: [DATA_NOT_AVAILABLE],
        sources: [],
      };
    const facts = response.results.map((result, index) => {
      const location = [
        result.section,
        result.page ? `p. ${result.page}` : null,
      ]
        .filter(Boolean)
        .join(' — ');
      const excerpt =
        result.excerpt.length > 320
          ? `${result.excerpt.slice(0, 320)}…`
          : result.excerpt;
      return `Evidência ${index + 1} (${result.documentTitle}${
        location ? ` — ${location}` : ''
      }): "${excerpt}"`;
    });
    const sources = response.results.map((result) => ({
      kind: 'Base de conhecimento',
      label: `${result.documentTitle}${
        result.section ? ` — ${result.section}` : ''
      }`,
      documentId: result.documentId,
      chunkId: result.chunkId,
      href: `/dashboard/base-conhecimento/${result.documentId}`,
      page: result.page,
      section: result.section,
    }));
    return {
      attentionPoints: [],
      facts,
      missingInformation: [],
      sources,
    };
  }
}
