import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AiContextType, AiPromptId } from '@larcarvalho/shared';
import { describe, expect, it } from 'vitest';

import { parseEnvironment } from '../src/config/env.js';
import type { AuthContext } from '../src/core/auth/auth-context.js';
import { AiConfigService } from '../src/modules/ai/ai-config.service.js';
import type { AiContextBuilder } from '../src/modules/ai/ai-context-builder.js';
import { MockAiProvider } from '../src/modules/ai/ai-provider.js';
import { AiService } from '../src/modules/ai/ai.service.js';

const evalDir = fileURLToPath(new URL('../../../tests/evals', import.meta.url));

interface StubEval {
  contextId: string;
  contextType: AiContextType;
  description: string;
  expect: {
    mustContain?: string[];
    mustNotContain?: string[];
    mustNotMatch?: string[];
  };
  facts: string[];
  id: string;
  message: string;
  promptId: AiPromptId;
  sources: { kind: string; label: string }[];
  version: string;
}

function loadStubEvals(): StubEval[] {
  return readdirSync(evalDir)
    .filter((file) => file.endsWith('.eval.json'))
    .map(
      (file) =>
        JSON.parse(readFileSync(join(evalDir, file), 'utf8')) as StubEval & {
          harness: string;
        },
    )
    .filter((item) => item.harness === 'orchestrator-stub');
}

function vendedor(): AuthContext {
  return {
    sessionId: 'eval-stub',
    teamIds: [],
    user: {
      email: 'vendedor@eval.test',
      id: '11111111-1111-1111-1111-111111111111',
      nome: 'Vendedor Eval',
      role: 'VENDEDOR',
    },
  };
}

/**
 * Evals §§71-72 com harness orchestrator-stub: fatos autorizados fixos fluem
 * pelo orquestrador real (merge + guardrails) com MockAiProvider.
 * Nível de evidência: TESTADO COM MOCK. Full-stack com seed de venda/
 * aderência está documentado como evolução em IA_PRODUCAO.md.
 */
describe('ai evals stub-harness (mock determinístico)', () => {
  for (const evalCase of loadStubEvals()) {
    it(`${evalCase.id} — ${evalCase.description}`, async () => {
      const config = parseEnvironment({});
      const authorized = {
        attentionPoints: [],
        facts: evalCase.facts,
        missingInformation: [],
        sources: evalCase.sources,
      };
      const builder = {
        buildSaleContext: async () => authorized,
        buildSimulationContext: async () => authorized,
      } as unknown as AiContextBuilder;
      const service = new AiService(
        config,
        new AiConfigService(config),
        new MockAiProvider(),
        builder,
      );
      const { response } = await service.chat(vendedor(), {
        contextId: evalCase.contextId,
        contextType: evalCase.contextType,
        message: evalCase.message,
        promptId: evalCase.promptId,
      });
      const text = [
        response.response.summary,
        ...response.response.facts,
      ].join('\n');
      for (const required of evalCase.expect.mustContain ?? []) {
        expect(text, `esperava "${required}"`).toContain(required);
      }
      for (const forbidden of evalCase.expect.mustNotContain ?? []) {
        expect(text).not.toContain(forbidden);
      }
      for (const pattern of evalCase.expect.mustNotMatch ?? []) {
        expect(text).not.toMatch(new RegExp(pattern, 'i'));
      }
    });
  }
});
