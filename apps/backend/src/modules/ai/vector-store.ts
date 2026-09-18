/**
 * Vector-store abstraction. Production semantic search requires a real
 * vector index (pgvector). The local PostgreSQL images do NOT provide the
 * `vector` extension, so production retrieval stays LEXICAL and
 * SEMANTIC/HYBRID modes answer VECTOR_SEARCH_UNAVAILABLE.
 *
 * InMemoryVectorStore exists ONLY for offline tests/drills: never wire it
 * in production — full in-memory scan is not a production vector index.
 */
export interface VectorCandidate {
  readonly chunkId: string;
  readonly similarity: number;
}

export interface VectorStore {
  readonly name: string;
  upsert(chunkId: string, vector: readonly number[]): Promise<void>;
  search(
    vector: readonly number[],
    limit: number,
    allowedChunkIds?: ReadonlySet<string>,
  ): Promise<readonly VectorCandidate[]>;
}

export class InMemoryVectorStore implements VectorStore {
  readonly name = 'memory-test-only';
  private dimensions: number | null = null;
  private readonly vectors = new Map<string, readonly number[]>();

  async upsert(chunkId: string, vector: readonly number[]): Promise<void> {
    // Vectors from a different model/dimension are never mixed silently.
    if (this.dimensions === null) this.dimensions = vector.length;
    if (vector.length !== this.dimensions) {
      throw new Error(
        `VECTOR_DIMENSION_MISMATCH: expected ${this.dimensions}, got ${vector.length}`,
      );
    }
    this.vectors.set(chunkId, [...vector]);
  }

  async search(
    vector: readonly number[],
    limit: number,
    allowedChunkIds?: ReadonlySet<string>,
  ): Promise<readonly VectorCandidate[]> {
    const scored: VectorCandidate[] = [];
    for (const [chunkId, stored] of this.vectors) {
      if (allowedChunkIds && !allowedChunkIds.has(chunkId)) continue;
      scored.push({ chunkId, similarity: cosine(vector, stored) });
    }
    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, Math.max(1, limit));
  }
}

function cosine(left: readonly number[], right: readonly number[]): number {
  const length = Math.min(left.length, right.length);
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}
