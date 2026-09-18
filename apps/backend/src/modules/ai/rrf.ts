/**
 * Reciprocal Rank Fusion (RRF) for hybrid retrieval.
 *
 * score(chunk) = Σ 1 / (k + rank), rank 1-based per list.
 * The score is a RETRIEVAL relevance signal only — never a probability of
 * truth, sale, or contemplation.
 */
export function reciprocalRankFusion(
  rankedLists: readonly (readonly string[])[],
  k = 60,
): { chunkId: string; score: number }[] {
  const scores = new Map<string, number>();
  for (const list of rankedLists) {
    list.forEach((chunkId, index) => {
      scores.set(chunkId, (scores.get(chunkId) ?? 0) + 1 / (k + index + 1));
    });
  }
  return [...scores.entries()]
    .map(([chunkId, score]) => ({ chunkId, score }))
    .sort((a, b) => b.score - a.score);
}
