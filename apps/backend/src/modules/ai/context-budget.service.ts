import type { ModelCapabilities } from './model-registry.js';

export interface BudgetPlan {
  readonly droppedFacts: number;
  readonly estimatedInputTokens: number;
  readonly facts: readonly string[];
  readonly warnings: string[];
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/**
 * Context window budgeting. Priority order (never reordered silently):
 * system prompt > user message > authorized facts (highest-ranked first,
 * lowest-ranked dropped first). Numbers/documents are never cut mid-value:
 * truncation drops whole facts and records a warning.
 */
export class ContextBudgetService {
  plan(input: {
    capabilities: ModelCapabilities;
    facts: readonly string[];
    maxOutputTokens: number;
    reserveTokens: number;
    systemText: string;
    userText: string;
  }): BudgetPlan {
    const warnings: string[] = [];
    const systemTokens = estimateTokens(input.systemText);
    const userTokens = estimateTokens(input.userText);
    const fixed = systemTokens + userTokens + input.reserveTokens + input.maxOutputTokens;
    if (fixed >= input.capabilities.contextWindowTokens) {
      throw new Error('CONTEXT_TOO_LARGE');
    }
    let available = input.capabilities.contextWindowTokens - fixed;
    const kept: string[] = [];
    let droppedFacts = 0;
    for (const fact of input.facts) {
      const cost = estimateTokens(fact);
      if (cost <= available) {
        kept.push(fact);
        available -= cost;
      } else {
        droppedFacts += 1;
      }
    }
    if (droppedFacts > 0) {
      warnings.push(
        `Contexto parcial: ${droppedFacts} evidência(s) de menor relevância foram omitidas para respeitar a janela do modelo.`,
      );
    }
    return {
      droppedFacts,
      estimatedInputTokens:
        systemTokens + userTokens + kept.reduce((sum, fact) => sum + estimateTokens(fact), 0),
      facts: kept,
      warnings,
    };
  }
}
