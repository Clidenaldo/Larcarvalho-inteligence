import { randomUUID } from 'node:crypto';

import { aiStructuredResponseSchema } from '@larcarvalho/shared';
import { describe, expect, it } from 'vitest';

import { parseEnvironment } from '../src/config/env.js';
import type { AuthContext } from '../src/core/auth/auth-context.js';
import { AiConfigService } from '../src/modules/ai/ai-config.service.js';
import type { AiContextBuilder } from '../src/modules/ai/ai-context-builder.js';
import type {
  AiGenerateInput,
  AiGenerateResult,
  AiProvider,
} from '../src/modules/ai/ai-provider.js';
import { AiService } from '../src/modules/ai/ai.service.js';
import { DATA_NOT_AVAILABLE } from '../src/modules/ai/guardrails.js';

const REAL_DOCUMENT_ID = 'a8a8a8a8-a8a8-4a8a-8a8a-a8a8a8a8a8a8';
const REAL_CHUNK_ID = 'b7b7b7b7-b7b7-4b7b-9b7b-b7b7b7b7b7b7';
const FAKE_DOCUMENT_ID = 'c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6';
const FAKE_CHUNK_ID = 'd5d5d5d5-d5d5-4d5d-abd5-d5d5d5d5d5d5';

function gestor(): AuthContext {
  return {
    sessionId: 'cert281-source',
    teamIds: [],
    user: {
      email: 'gestor@cert281.test',
      id: randomUUID(),
      nome: 'Gestor Cert',
      role: 'GESTOR',
    },
  };
}

function serviceWith(
  provider: AiProvider,
  authorized: {
    facts: string[];
    sources: { documentId?: string; chunkId?: string; kind: string; label: string }[];
  },
) {
  const config = parseEnvironment({});
  const builder = {
    buildKnowledgeContext: async () => ({
      attentionPoints: [],
      facts: authorized.facts,
      missingInformation: [],
      sources: authorized.sources,
    }),
  } as unknown as AiContextBuilder;
  return new AiService(
    config,
    new AiConfigService(config),
    provider,
    builder,
  );
}

function hostileProvider(): AiProvider {
  const payload = {
    attentionPoints: [],
    draft: null,
    facts: ['O modelo afirma algo sem lastro.'],
    missingInformation: [],
    sources: [
      {
        chunkId: FAKE_CHUNK_ID,
        documentId: FAKE_DOCUMENT_ID,
        kind: 'Base de conhecimento',
        label: 'Documento falso',
      },
      {
        chunkId: REAL_CHUNK_ID,
        documentId: REAL_DOCUMENT_ID,
        kind: 'Base de conhecimento',
        label: 'Documento real citado',
      },
      { kind: 'Base de conhecimento', label: 'Fonte sem ids' },
    ],
    suggestedActions: [],
    summary: 'Resumo hostil com fonte falsa.',
  };
  return {
    name: 'mock',
    isConfigured: () => false,
    getCapabilities: () => ({
      embeddings: false,
      streaming: true,
      structuredOutput: true,
      toolCalling: false,
    }),
    healthCheck: async () => ({
      capabilities: null,
      configured: false,
      latencyMs: 0,
      reachable: true,
    }),
    generate: async (input: AiGenerateInput): Promise<AiGenerateResult> => ({
      inputTokens: 1,
      model: input.model,
      outputTokens: 1,
      provider: 'mock',
      text: JSON.stringify(payload),
      usageEstimated: true,
    }),
    structuredOutput: async () => ({
      response: aiStructuredResponseSchema.parse(payload),
      usage: null,
    }),
    stream: async function* () {
      yield { delta: JSON.stringify(payload) };
    },
  };
}

describe('knowledge source validation 28.1 (§12)', () => {
  it('descarta fontes do modelo fora da allowlist e mantém as autorizadas', async () => {
    const service = serviceWith(hostileProvider(), {
      facts: [],
      sources: [
        {
          chunkId: REAL_CHUNK_ID,
          documentId: REAL_DOCUMENT_ID,
          kind: 'Base de conhecimento',
          label: 'Documento real',
        },
      ],
    });
    const { response } = await service.chat(gestor(), {
      contextType: 'KNOWLEDGE',
      message: 'Pergunta qualquer',
      promptId: 'knowledge-grounded-answer',
    });
    expect(response.response.grounded).toBe(true);
    const serialized = JSON.stringify(response.response.sources);
    expect(serialized).not.toContain(FAKE_DOCUMENT_ID);
    expect(serialized).not.toContain(FAKE_CHUNK_ID);
    expect(serialized).toContain(REAL_DOCUMENT_ID);
    expect(serialized).toContain(REAL_CHUNK_ID);
    expect(serialized).toContain('Fonte sem ids');
  });

  it('sem evidência autorizada, substitui a saída e zera fontes', async () => {
    const service = serviceWith(hostileProvider(), {
      facts: [],
      sources: [],
    });
    const { response } = await service.chat(gestor(), {
      contextType: 'KNOWLEDGE',
      message: 'Pergunta sem lastro',
      promptId: 'knowledge-grounded-answer',
    });
    expect(response.response.grounded).toBe(false);
    expect(response.response.facts).toHaveLength(0);
    expect(response.response.sources).toHaveLength(0);
    expect(response.response.summary).toBe(DATA_NOT_AVAILABLE);
  });
});
