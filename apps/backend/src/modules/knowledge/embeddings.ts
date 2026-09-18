/**
 * Optional semantic layer. The default provider stays disabled: lexical
 * search (FTS) keeps working and the retrieval interface explicitly reports
 * `semanticEnabled = false` instead of pretending lexical search is semantic.
 */
export interface EmbeddingProvider {
  readonly enabled: boolean;
  readonly name: string;
  readonly model: string;
  readonly dimensions: number | null;
  embed(texts: readonly string[]): Promise<readonly (readonly number[])[]>;
}

export class DisabledEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = null;
  readonly enabled = false;
  readonly model = 'none';
  readonly name = 'disabled';

  async embed(): Promise<readonly (readonly number[])[]> {
    return [];
  }
}

export function cosineSimilarity(
  left: readonly number[],
  right: readonly number[],
): number {
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
