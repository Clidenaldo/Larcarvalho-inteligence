# IA Real de Produção — Fase 29

Data: 17/09/2026, America/Fortaleza.

## 1. Arquitetura

Fluxo obrigatório (a IA nunca é dona do sistema):

Usuário → Frontend → Backend → Auth → RBAC/OWN/TEAM/ALL → AiOrchestrator
(`AiService`) → Context Builder → Authorized Tools → RAG → AiProvider →
Guardrails → Structured Response.

Proibido: Frontend → provider externo; LLM → PostgreSQL direto; LLM → SQL
arbitrário; LLM → bypass de RBAC.

## 2. Provider abstraction e registry

- `AiProvider` (`apps/backend/src/modules/ai/ai-provider.ts`): `generate`,
  `structuredOutput` (retorna `{response, usage}`), `stream` (SSE), `healthCheck`,
  `getCapabilities`, `isConfigured`. O provider nunca decide RBAC, escopo,
  tools, finanças ou visibilidade — tudo pertence ao orquestrador.
- `EmbeddingProvider` (`modules/knowledge/embeddings.ts`): `embedText` em lote,
  `model`, `dimensions`. Independente do `AiProvider`.
- Registry (`provider-registry.ts`): `mock` → `MockAiProvider`;
  `external` → `OpenAiCompatibleProvider` (chat completions + SSE +
  `/embeddings` via `HttpEmbeddingProvider`). Nenhum `if provider === ...`
  espalhado: novo fornecedor = novo id + classe adaptadora.
- `MockAiProvider` permanece obrigatório: toda a suíte roda sem internet,
  sem chave e sem cobrança. CI nunca depende do provider real.

## 3. Secrets

Somente backend, somente environment: `AI_API_KEY`, `AI_BASE_URL`
(default `https://api.openai.com/v1`), `AI_MODEL`, `AI_EMBEDDING_MODEL`.
`GET /ai/config` retorna apenas `providerConfigured: true/false` — nunca a
chave (coberto por teste). Sem chave em Git, fixture, log, audit ou docs.

## 4. Streaming

SSE `POST /api/v1/ai/chat/stream` (BFF `/api/ai/chat/stream` faz pipe cru,
sem buffer). Eventos Larcarvalho (traduzidos do provider):
`start/delta/fact/source/usage/done/error` (contrato em
`aiStreamEventSchema`).

Estratégia de segurança (§19): respostas grounded (conhecimento) usam
**validate-then-replay** (pipeline estruturado completo antes de emitir);
demais fluxos transmitem deltas progressivos com scan incremental de frases
proibidas; fontes/grounding/usage saem nos eventos terminais após validação
final. Deltas são provisionais até `done`. Cancelamento propaga
Frontend → BFF → Backend → provider (AbortController); após cancelar, nada
mais é consumido. Sem WebSocket.

Correção 29.1 (race real encontrada em E2E): o placeholder de streaming do
Copiloto usava índice derivado dentro de updater React (impuro sob
StrictMode/dev) e perdia eventos → cartão vazio. Reescrito com id síncrono
(`streamIdRef`) e updaters puros; `sendingRef` impede duplo envio.

## 5. Confiabilidade

Timeout configurável (1000–60000ms, `AI_TIMEOUT_MS`) com AbortController;
retry somente 429/502/503/504 (máx. 2, backoff exponencial + jitter; nunca
400/401/403/validação/guardrail); streaming não sofre retry (saída parcial
não é retomável). Circuit breaker em memória por provider+modelo (5 falhas
→ 60s aberto; limitação multi-instância documentada: cada instância tem o
próprio estado).

## 6. Usage e pricing

- `AiUsage` (telemetria, sem prompt/resposta/PII/API key/documentos):
  provider, model, contexto, prompt, tokens (input/output/total, `estimated`
  quando o provedor não informa), `costMicros`, moeda, latência, status
  (`ok/error/timeout/cancelled/limit/reserved`), errorCode.
- `AiPricingService`: linhas versionadas `(provider, model, currency,
  input/output/cached por milhão em micros, validFrom, active)`. Matemática
  inteira exata em micros (sem float). Sem preço → custo `null` e UI exibe
  “Custo não configurado” (nunca R$ 0,00).
- Limites (`AI_DAILY_TOKEN_LIMIT`, `AI_DAILY_COST_LIMIT_MICROS`,
  `AI_MONTHLY_COST_LIMIT_MICROS`, `AI_MAX_TOKENS_PER_REQUEST`): reserva com
  advisory lock transacional + agregados (fail-closed; concorrência testada);
  warning a 80%; hard limit bloqueia com `USAGE_LIMIT_EXCEEDED` (429) e
  registra `status='limit'`. Sem bypass para SUPER_ADMIN. Fallback externo
  default OFF (`AI_FALLBACK_PROVIDER=none`); só dispara para outro provedor
  explicitamente configurado, em falha transitória, uma vez.

## 7. Embeddings e retrieval

- pgvector **ausente** nas imagens PostgreSQL provisionadas (verificado em
  dev e test): sem coluna vetorial, sem índice. Metadados por chunk/documento
  (`embeddingStatus NONE/PENDING/READY/FAILED`, model, version, embeddedAt).
- Backfill (`POST /knowledge/embeddings/backfill`, `knowledge.process`):
  lotes de 32, retry só transitório, falha marca chunk FAILED sem tocar o
  status READY do documento (§36); recusa honesta (`EMBEDDING_UNAVAILABLE` /
  `VECTOR_SEARCH_UNAVAILABLE`) quando falta provider ou índice.
- Modos: `LEXICAL` (FTS + fallback, operacional); `SEMANTIC`/`HYBRID` →
  `VECTOR_SEARCH_UNAVAILABLE` (503) sem índice real. **Não implementados em
  produção; não anunciados.** Com store efêmero (somente testes), híbrido
  funciona com RRF (`score = Σ 1/(k+rank)`, k=`AI_RRF_K`, default 60) e
  RBAC aplicado ANTES da recuperação (allowlist de chunks autorizados;
  TEAM_B jamais entra nos candidatos — testado nos 3 modos).
- Reranker externo: não implementado; estágio = RRF + filtros (`KnowledgeReranker`
  futuro, com feature flag).
- Troca de modelo/dimensão: embeddings antigos nunca misturados (rejeição por
  dimensão no store; re-embedding via backfill).

## 8. RAG (preservado da 28.1)

`authorized filters → retrieval → source allowlist → AI → source
reconciliation`. `grounded=true` só com evidência; sem evidência
`grounded=false, sources=[], DATA_NOT_AVAILABLE`. Fontes do modelo fora da
allowlist são descartadas (28.1 §12 + correção `sources=[]` se ungrounded).
Conflito 90×100: ambas as fontes, sem verdade única. Injection documental:
dado, sem elevação, sem tool, sem `suggestedAction`.

## 9. Context budget e tools

`ContextBudgetService`: janela do modelo − reserva − saída; prioridade
sistema > usuário > fatos (menor relevância descartada por inteiro, nunca
número cortado); warning estruturado. `AI_MAX_TOKENS_PER_REQUEST` → 413
`CONTEXT_TOO_LARGE`. Sem memória persistente: single-shot stateless (janela
futura documentada, sem sistema complexo nesta fase). Sem native tool
calling: tools são hidratadas server-side pela allowlist (`READ_ONLY_TOOLS`,
`searchKnowledge` incluída); argumentos do LLM sempre Zod (não há loop de
tools: `MAX_TOOL_ROUNDS` N/A). Saída estruturada sempre validada por Zod;
JSON inválido → `OUTPUT_INVALID` (502), sem reparo silencioso.

## 10. Configurações → IA e observabilidade

Blocos: GERAL (habilitada, provider, modelo, timeout, streaming), RAG
(retrievalMode, topK), LIMITES (tokens/custo dia/mês, teto por request),
OBSERVABILIDADE (dashboard: requests, tokens in/out, custo, erros, latência,
por contexto/modelo), PRECIFICAÇÃO (tabela + upsert auditado), TESTAR
CONEXÃO (ai.settings; retorna provider/configured/reachable/latency/
capabilities, nunca segredo). `GET /health` não depende do provider.
Métricas: requests/success/failure/timeout/rate-limit/latency/tokens/cost/
tool-calls/retrieval (modo+latência)/stream-cancel. Sem conteúdo integral.

Permissões reutilizadas: `ai.use`, `ai.settings` e `ai.usage` (existia
concedida a ADMIN/SUPER_ADMIN mas sem uso; agora guarda `/ai/usage*`).
Sem permissões novas. Financeiro comercial ≠ custo de IA.

## 11. Evals

`tests/evals/*.eval.json` versionados (`id`, `harness`, setup, steps com
`mustContain/mustNotContain/mustNotMatch/grounded/minSources`):
grounding-25, no-evidence, conflict-90-100, injection-doc, rbac-team-b,
probability-none (http-api, PostgreSQL real, mock) + financial-2850 e
adherence-explain (harness orchestrator-stub: fatos autorizados fixos pelo
orquestrador real; full-stack com seed de venda/aderência = evolução
documentada). Live: `npm run test:ai:live` (gated `AI_LIVE_TESTS=true` +
chave; sintético, poucas chamadas, fora do check).

## 12. Procedimento live e desligamento

Com credencial: `AI_PROVIDER=external`, `AI_API_KEY`, `AI_BASE_URL`,
`AI_MODEL` (+ allowlist `AI_ALLOWED_MODELS`), `npm run test:ai:live`,
“Testar conexão” na tela. Sem credencial: mock opera tudo; live =
NOT EXECUTED. Voltar ao mock: `AI_PROVIDER=mock` (ou PATCH provider).

## 13. Taxonomia de erros e segurança

`PROVIDER_NOT_CONFIGURED` (503), `PROVIDER_UNAVAILABLE` (503),
`PROVIDER_TIMEOUT` (504), `PROVIDER_RATE_LIMITED` (429),
`PROVIDER_AUTH_ERROR` (502), `MODEL_NOT_ALLOWED` (400),
`CONTEXT_TOO_LARGE` (413), `OUTPUT_INVALID` (502),
`USAGE_LIMIT_EXCEEDED` (429), `EMBEDDING_UNAVAILABLE` (503),
`VECTOR_SEARCH_UNAVAILABLE` (503).

Security review: segredo só backend/env (teste anti-vazamento no GET
config); prompt/tool/source injection cobertos por testes; RBAC/TEAM sem
vazamento nos 3 modos; PII mascarada, sem prompt integral em logs/usage;
fallback externo OFF; context overflow → 413; stream → eventos terminais
validados; erros sem stack trace.

## 14. Limitações e pendências

Sem provider real conectado (sem credencial); sem pgvector (SEMANTIC/HYBRID
inoperantes em produção); sem OCR; sem reranker externo; sem tool calling
nativo; sem memória persistente; `knowledge.process` agora consome backfill;
pricing seed vazio (custo null até configurar); breaker single-instance.

## 15. Arquivos

Criados: `ai-provider.ts` (evoluído), `provider-registry.ts`,
`model-registry.ts`, `openai-compatible.provider.ts`, `provider-http.ts`,
`http-embedding.provider.ts`, `circuit-breaker.ts`, `vector-store.ts`,
`context-budget.service.ts`, `ai-pricing.service.ts`, `ai-usage.service.ts`,
`rrf.ts`, `knowledge-backfill.service.ts`, `ai.routes.ts` (evoluído),
`identity-stream.ts` (BFF), `ai-usage-dashboard.tsx`,
`tests/evals/*.eval.json` (8), `scripts/ai-live-test.mjs`,
2 migrations. Alterados: `ai.service.ts`, `ai-config.service.ts`,
`knowledge.service.ts`, `knowledge.retriever.ts`, `knowledge.repository.ts`,
`knowledge.routes.ts`, `embeddings.ts`, `app.ts`, `env.ts`, `ai.ts` /
`api.ts` / `knowledge-base.ts` (shared), `ai-copilot.tsx`,
`ai-configuration-manager.tsx`, BFF `ai/[[...path]]`, `.env.example`,
`package.json` (`test:ai:live`).
