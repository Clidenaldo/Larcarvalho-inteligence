# Larcarvalho AI — Arquitetura da Fundação (Fase 21, itens 1–4)

## 1. Auditoria inicial (resumo)
- Autenticação/sessão/RBAC/OWN-TEAM-ALL reutilizados sem alteração.
- CRM, leads, simulações, comparador (máx. 5 cotas), Índice de Aderência,
  administradoras, produtos, grupos, cotas, assembleias, lances,
  contemplações, GrupoHistorico, tabelas comerciais, ProductCommercialRule,
  propostas, analytics, auditoria, configurações e integrações: existentes.
- Nenhuma infraestrutura de IA/LLM/provider/prompt/chat/embedding/RAG
  encontrada antes desta fase.

## 2. O que foi reutilizado
- `core/auth` (authenticate, `requirePermission`, `hasPermission`, data-scope
  OWN/TEAM/ALL), `AppError`, `apiPrefix`, contratos Zod em
  `packages/shared`, padrão de rotas Fastify com `trustedOrigin`.

## 3. O que a fundação cria (sem migration)
- `packages/shared/src/contracts/ai.ts`: providers, contextos, prompts,
  entrada/saída estruturada, config pública, status.
- Permissões `ai.*` em `contracts/auth.ts` + `core/auth/rbac.ts`
  (SUPER_ADMIN tudo; ADMIN amplo; GESTOR equipe; VENDEDOR próprios
  recursos; OPERADOR somente `ai.use`).
- Backend `modules/ai`:
  - `ai-provider.ts`: interface `AiProvider`
    (`generate`/`structuredOutput`) + `MockAiProvider` determinístico,
    sem rede, sem chave, `isConfigured() === false`.
  - `prompt-registry.ts`: 6 prompts versionados
    (commercial-copilot, lead-analysis, simulation-explanation,
    comparison-analysis, follow-up-draft, manager-summary).
  - `guardrails.ts`: frases proibidas, `maskPii`, separação
    SYSTEM/TOOL-DATA/USER, `DATA_NOT_AVAILABLE`.
  - `ai-config.service.ts`: config pública via env + overrides em memória;
    **nenhum segredo persistido**; `providerConfigured` falso até existir
    mecanismo seguro.
  - `ai.service.ts`: orquestrador — exige `ai.use` + permissão do recurso +
    permissão do contexto, filtra antes do modelo, valida saída com Zod e
    bloqueia afirmações proibidas. Tools read-only descritas em
    `READ_ONLY_TOOLS` (hidratação de registros nas próximas fases).
  - `ai.routes.ts`: `GET /api/v1/ai/status`, `POST /api/v1/ai/chat`
    (rate limit 30/min), `GET/PATCH /api/v1/ai/config` (só `ai.settings`).
- Env: `AI_ENABLED`, `AI_PROVIDER`, `AI_MODEL`, `AI_TEMPERATURE`,
  `AI_MAX_OUTPUT_TOKENS`, `AI_TIMEOUT_MS`, `AI_RESOURCES` (defaults seguros).

## 4. Fluxo
Copiloto (frontend futuro) → API Larcarvalho (`/api/v1/ai/*`) →
`AiService` (permissão + contexto autorizado) → tools internas read-only →
`AiProvider` → resposta estruturada validada. O navegador nunca chama
provedor externo.

## 5. Como adicionar
- Novo provider: implementar `AiProvider` e injetar no `AiService`
  (manter `isConfigured()` honesto; nunca commitar chave).
- Nova tool: adicionar descritor em `READ_ONLY_TOOLS` e executor com
  `requireAccess` + `leadScope`/`commercialScope`, DTO mínimo e auditoria.
- Novo prompt: registrar em `PROMPT_REGISTRY` + permissão `ai.*` + testes.

## 6. Limites desta fundação
- Sem chamadas externas, sem cache de dados privados, sem escrita.
- `providerConfigured: false`; UI deve exibir
  "Inteligência Artificial ainda não configurada."

## 7. Copiloto contextual (itens 5–8)
- `frontend/components/ai-copilot.tsx`: botão flutuante "Larcarvalho AI"
  (só com `ai.use`) + drawer lateral (fullscreen no mobile), histórico em
  memória por contexto, atalhos por módulo, estados
  (idle/loading/success/error/timeout/not-configured/permission/context/
  rate-limit), copiar, refazer, feedback local, sem stack trace.
- `frontend/lib/ai-context.ts`: deriva somente `{type, id}` da rota
  (LEAD/SIMULATION/COMPARATOR/PROPOSAL/DASHBOARD/GENERAL). `AppShell`
  monta o copiloto global; `ai-analyze-button.tsx` dispara
  `larcarvalho:ai-open` nas páginas de lead, simulação e proposta, e em
  `quota-comparison.tsx` (com `resultIds` da seleção, máx. 5).
- Sem HTML do modelo (só texto escapado pelo React).

## 14. Fase 28 — Base de conhecimento (ver `docs/BASE_CONHECIMENTO_RAG.md`)
- Novo contexto `KNOWLEDGE` no `AiContextBuilder` (catálogo de artigos
  com escopo próprio; FASED por `knowledge.read`).
- Novo prompt `knowledge-answer` (KNOWLEDGE + `ai.use`); o catálogo
  expõe trechos e metadados (autor, data, fonte, tags, versão) e
  nega quando o artigo está arquivado.
- Lexical search usa BM25 via `larcarvalho-rank` (local, sem rede);
  embeddings ficam desabilitados (`semanticEnabled: false`) e a busca
  semântica é um fallback planejado.
- Grounded answers: fontes nomeadas, citação de trecho,
  `noKnowledgeAvailable` quando o catálogo não cobre.
- RBAC: 7 capacidades (`knowledge.read/create/update/archive/upload/
  manage/higher_visibility`); VENDEDOR/OPERATOR só leem;
  SUPER_ADMIN pode reprocessar e limpar tags.
- Registro do prompt agora tem 10 prompts versionados
  (commercial-copilot, lead-analysis, simulation-explanation,
  comparison-analysis, follow-up-draft, manager-summary,
  customer-360, my-day, knowledge-answer).
- `GET /api/v1/knowledge/search?q=...` expõe busca lexical
  autenticada; backend orquestra BM25 + prompt + guardrails.

## 8. Context Builder e tools read-only
- `backend/modules/ai/ai-context-builder.ts`: hidrata fatos mínimos via
  services existentes (`LeadsService.get/list`, `SimulationsService.get`,
  `ProposalsService.get`), que já aplicam OWN/TEAM/ALL e respondem 404 fora
  do escopo. Jamais entrega linhas Prisma brutas ao modelo.
- Tools: `getLeadContext`, `searchMyLeads`, `getSimulationContext`,
  `explainAdherence` (snapshot, sem recálculo), `compareResults` (máx. 5,
  ordem preservada, snapshots originais), `getProposalContext`,
  `buildDashboardSummary` (funil do escopo).
- Matriz tool → permissão: lead→`leads.read_*`+`ai.lead_analysis`;
  simulation→`simulations.read_*`+`ai.simulation_explain`;
  comparison→`comparador.read`+resultados da simulação+`ai.comparison_analysis`;
  proposal→`proposals.read_*`+`ai.use`; dashboard→`dashboard.read`+
  `ai.manager_summary`. `ai.use` abre o copiloto; cada tool exige a
  permissão do recurso.
- `AiService.chat` mescla fatos/fontes/ausências do contexto aos da
  resposta do provider; PII mascarada; injection permanece como dado.

## 9. Lifecycle da requisição
1. UI envia `{contextType, contextId?, resultIds?, message, promptId}`.
2. BFF repassa cookie/origin ao backend.
3. `AiService`: valida schema → `ai.use` → permissão do prompt → permissão
   do contexto → recurso habilitado → `AiContextBuilder` (escopo antes do
   modelo) → provider → valida Zod → guardrails → resposta mesclada.
4. Auditoria via `request.log.info` (`AI_REQUEST` com prompt/modelo/contexto,
   sem PII além do necessário).

## 10. Testes
- `backend/test/ai-context.spec.ts` (17): OWN/TEAM/ALL, SUPER_ADMIN,
  snapshot sem recálculo, 1–5 resultados, 6º rejeitado, proposal snapshot,
  missing→`missingInformation`, PII, injection, merge, negação sem vazar.
- `frontend/test/ai-copilot.spec.tsx` (7): visibilidade por `ai.use`,
  drawer, fluxo com fatos/fontes, 403/504, troca de contexto limpa.
- `tests/e2e/ai-copilot.spec.ts`: 7 cenários (lead próprio, isolamento A/B,
  gestor equipe/outra, sem `ai.use`, simulação real, comparação 5 cotas),
  com `MockAiProvider` e fixture SQL isolada.

## 11. Fase 22 — Cliente 360 (ver `docs/CUSTOMER_360.md`)
- Prompt `customer-360` (LEAD + `ai.lead_analysis`); atalhos
  "Resumir cliente / Preparar atendimento / Próxima ação".
- Novas tools read-only: `getCustomer360Context`, `getMyFollowUps`,
  `getPortfolioFacts` (via `PortfolioService`, mesmo filtro OWN/TEAM/ALL
  antes do modelo). Sem probabilidade de fechamento em nenhuma camada.

## 12. Fase 23 — Agenda (ver `docs/AGENDA_COMERCIAL.md`)

## 13. Fase 24 — Proposta (ver `docs/PROPOSTA_COMERCIAL.md`)
- Contexto PROPOSAL enriquecido com número/versão/descrição dos itens e
  histórico de status (sem recalcular); atalho "Explicar alternativas".
- IA nunca altera valores, status ou itens; `suggestedAction` não é
  emitido para propostas (só `CREATE_FOLLOWUP` explícito pelo usuário).
- Prompt `my-day` (GENERAL/DASHBOARD + `ai.lead_analysis`); atalhos
  "Meu dia" e "Preparar ligação".
- Novas tools read-only: `getMyAgendaFacts`, `getTeamAgendaFacts`,
  `getAttentionFacts` (regras determinísticas, escopo antes do modelo).
- `suggestedAction` determinístico (`CREATE_FOLLOWUP`): a IA sugere, o
  usuário revisa no drawer e confirma; a criação usa o endpoint normal.
- Prompt `customer-360` (LEAD + `ai.lead_analysis`); atalhos
  "Resumir cliente / Preparar atendimento / Próxima ação".
- Novas tools read-only: `getCustomer360Context`, `getMyFollowUps`,
  `getPortfolioSummary` (via `PortfolioService`, mesmo filtro OWN/TEAM/ALL
  antes do modelo). Sem probabilidade de fechamento em nenhuma camada.
