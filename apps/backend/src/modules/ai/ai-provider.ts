import type {
  AiPromptId,
  AiProviderCapabilities,
  AiStructuredResponse,
} from '@larcarvalho/shared';
import { aiStructuredResponseSchema } from '@larcarvalho/shared';

export interface AiGenerateInput {
  readonly maxOutputTokens: number;
  readonly model: string;
  readonly promptId: AiPromptId;
  readonly systemInstructions: string;
  readonly temperature: number;
  readonly toolDataSummary: string;
  readonly userMessage: string;
}

export interface AiGenerateResult {
  readonly inputTokens: number;
  readonly model: string;
  readonly outputTokens: number;
  readonly provider: 'mock' | 'external';
  readonly text: string;
  /** True when token counts are local estimates rather than provider usage. */
  readonly usageEstimated: boolean;
}

export interface ProviderTokenUsage {
  readonly cachedTokens?: number | null;
  readonly inputTokens?: number | null;
  readonly outputTokens?: number | null;
  readonly totalTokens?: number | null;
}

export interface ProviderStreamChunk {
  readonly delta?: string;
  readonly requestId?: string | null;
  readonly usage?: ProviderTokenUsage | null;
}

export interface ProviderHealth {
  readonly capabilities: AiProviderCapabilities | null;
  readonly configured: boolean;
  readonly latencyMs: number | null;
  readonly reachable: boolean;
}

/**
 * Provider adapter contract. The provider NEVER decides RBAC, scope,
 * authorized tools, financial data or knowledge visibility — the
 * orchestrator (AiService) owns all of that. The adapter only converts
 * authorized input into model output.
 */
export interface AiProvider {
  readonly name: 'mock' | 'external';
  isConfigured(): boolean;
  getCapabilities(): AiProviderCapabilities;
  healthCheck(signal?: AbortSignal): Promise<ProviderHealth>;
  generate(input: AiGenerateInput): Promise<AiGenerateResult>;
  structuredOutput(input: AiGenerateInput): Promise<{
    response: AiStructuredResponse;
    usage: ProviderTokenUsage | null;
  }>;
  stream(
    input: AiGenerateInput,
    signal: AbortSignal,
  ): AsyncIterable<ProviderStreamChunk>;
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

const MOCK_NOTICE =
  'Inteligência Artificial ainda não configurada. Nenhum provedor externo foi chamado.';

/**
 * Deterministic in-process provider used when no external AI credential is
 * configured. It never invents commercial numbers and never calls the network.
 */
export class MockAiProvider implements AiProvider {
  readonly name = 'mock' as const;

  isConfigured(): boolean {
    return false;
  }

  getCapabilities(): AiProviderCapabilities {
    return {
      embeddings: false,
      streaming: true,
      structuredOutput: true,
      toolCalling: false,
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    return {
      capabilities: this.getCapabilities(),
      configured: false,
      latencyMs: 0,
      reachable: true,
    };
  }

  private evidence(input: AiGenerateInput): string[] {
    return input.toolDataSummary
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('Evidência'))
      .slice(0, 5);
  }

  async generate(input: AiGenerateInput): Promise<AiGenerateResult> {
    const evidence = this.evidence(input);
    const text =
      input.promptId === 'knowledge-grounded-answer' && evidence.length > 0
        ? `Com base nas fontes recuperadas: ${evidence.join(' ')}`
        : [
            MOCK_NOTICE,
            `Contexto recebido para o fluxo "${input.promptId}".`,
            'Conecte um provedor autorizado para receber a análise com dados do sistema.',
          ].join(' ');
    return {
      inputTokens: estimateTokens(
        `${input.systemInstructions} ${input.toolDataSummary} ${input.userMessage}`,
      ),
      model: input.model,
      outputTokens: estimateTokens(text),
      provider: 'mock',
      text: text.slice(0, input.maxOutputTokens * 4),
      usageEstimated: true,
    };
  }

  async structuredOutput(
    input: AiGenerateInput,
  ): Promise<{ response: AiStructuredResponse; usage: ProviderTokenUsage | null }> {
    const generated = await this.generate(input);
    const evidence = this.evidence(input);
    if (input.promptId === 'knowledge-grounded-answer' && evidence.length > 0) {
      return {
        response: aiStructuredResponseSchema.parse({
          attentionPoints: [],
          draft: null,
          facts: evidence,
          missingInformation: [],
          sources: [],
          suggestedActions: [],
          summary: generated.text,
        }),
        usage: null,
      };
    }
    return {
      response: aiStructuredResponseSchema.parse({
        attentionPoints: [
          'Provedor de IA não configurado: nenhuma análise automática foi gerada.',
        ],
        draft: null,
        facts: [],
        missingInformation: [
          'Configuração do provedor de IA',
          'Contexto autorizado (lead, simulação, comparação ou proposta)',
        ],
        sources: [],
        suggestedActions: [
          'Solicite ao administrador a configuração do provedor em Configurações → Inteligência Artificial.',
        ],
        summary: generated.text,
      }),
      usage: null,
    };
  }

  async *stream(
    input: AiGenerateInput,
    signal: AbortSignal,
  ): AsyncIterable<ProviderStreamChunk> {
    const generated = await this.generate(input);
    // Deterministic word-chunks so streaming tests never depend on timing.
    const words = generated.text.split(/(\s+)/).filter((part) => part.length > 0);
    let buffer = '';
    for (const word of words) {
      if (signal.aborted) return;
      buffer += word;
      if (buffer.length >= 24 || word === words[words.length - 1]) {
        yield { delta: buffer };
        buffer = '';
      }
    }
    if (buffer.length > 0) yield { delta: buffer };
    yield {
      usage: {
        cachedTokens: null,
        inputTokens: generated.inputTokens,
        outputTokens: generated.outputTokens,
        totalTokens: generated.inputTokens + generated.outputTokens,
      },
    };
  }
}
