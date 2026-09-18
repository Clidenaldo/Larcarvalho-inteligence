import { AppError } from '../../core/errors/app-error.js';
import type { VectorStore } from '../ai/vector-store.js';
import type { EmbeddingProvider } from './embeddings.js';
import type { KnowledgeRepository } from './knowledge.repository.js';

export const EMBEDDING_VERSION = 'v1';
const MAX_CHUNKS_PER_RUN = 500;
const EMBED_BATCH_SIZE = 32;

export interface BackfillSummary {
  readonly embedded: number;
  readonly failed: number;
  readonly model: string;
  readonly processed: number;
  readonly skippedNoStore: boolean;
  readonly vectorStore: string | null;
}

/**
 * Safe backfill: READY lexical documents gain embeddings without re-parsing
 * files and without touching document readiness (embedding readiness is a
 * separate status). Refuses to compute vectors with nowhere to index them:
 * without a vector store the run reports unavailability instead of silently
 * discarding work.
 */
export class KnowledgeBackfillService {
  constructor(
    private readonly repository: KnowledgeRepository,
    private readonly embeddings: EmbeddingProvider,
    private readonly vectorStore: VectorStore | null,
  ) {}

  async run(maxChunks = 200): Promise<BackfillSummary> {
    if (!this.embeddings.enabled) {
      throw new AppError({
        code: 'EMBEDDING_UNAVAILABLE',
        message: 'Embeddings indisponíveis: provedor não configurado.',
        statusCode: 503,
      });
    }
    if (!this.vectorStore) {
      throw new AppError({
        code: 'VECTOR_SEARCH_UNAVAILABLE',
        message:
          'Backfill indisponível: nenhum índice vetorial operacional. A busca lexical continua funcionando.',
        statusCode: 503,
      });
    }
    const model = this.embeddings.model;
    const pending = await this.repository.listChunksNeedingEmbeddings(
      model,
      EMBEDDING_VERSION,
      Math.min(Math.max(maxChunks, 1), MAX_CHUNKS_PER_RUN),
    );
    let embedded = 0;
    let failed = 0;
    const touchedDocuments = new Set<string>();
    for (let start = 0; start < pending.length; start += EMBED_BATCH_SIZE) {
      const batch = pending.slice(start, start + EMBED_BATCH_SIZE);
      try {
        const vectors = await this.embeddings.embed(
          batch.map((chunk) => chunk.content),
        );
        for (let index = 0; index < batch.length; index += 1) {
          const chunk = batch[index]!;
          const vector = vectors[index];
          if (!vector) {
            await this.repository.markChunksEmbeddingFailed([chunk.id]);
            failed += 1;
            continue;
          }
          await this.vectorStore.upsert(chunk.id, vector);
          await this.repository.markChunksEmbedded([chunk.id], {
            model,
            version: EMBEDDING_VERSION,
          });
          embedded += 1;
          touchedDocuments.add(chunk.documentId);
        }
      } catch {
        await this.repository.markChunksEmbeddingFailed(
          batch.map((chunk) => chunk.id),
        );
        failed += batch.length;
        batch.forEach((chunk) => touchedDocuments.add(chunk.documentId));
      }
    }
    for (const documentId of touchedDocuments) {
      await this.repository.refreshDocumentEmbeddingStatus(documentId);
    }
    return {
      embedded,
      failed,
      model,
      processed: pending.length,
      skippedNoStore: false,
      vectorStore: this.vectorStore.name,
    };
  }
}
