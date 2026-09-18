# Base de Conhecimento (RAG lexical — Fase 28)

Data: 17/09/2026, America/Fortaleza.

## Objetivo

Permitir que a organização armazene documentos internos autorizados
(regulamentos, manuais, procedimentos, tabelas, materiais comerciais) e que a
IA responda **somente** com base em evidências recuperadas desses documentos.
O sistema não é um pipeline de busca semântica/embeddings: a recuperação é
**lexical** (PostgreSQL Full Text Search com fallback por termos) e o provedor
de embeddings está desabilitado nesta fase.

## Princípios

- **Grounded**: sem evidências autorizadas, a resposta é tratada como
  indisponível (`DATA_NOT_AVAILABLE`) e a IA não inventa fatos.
- **Documentos são dados não confiáveis** (`UNTRUSTED DATA`): o conteúdo é
  fornecido ao provedor como dados, nunca como instruções (mitigação de prompt
  injection via `separatePromptSections`).
- **Somente leitura**: a base de conhecimento não altera cálculos financeiros,
  comissões, regras comerciais, aderência ou qualquer fluxo existente.
- **Backend autoritativo**: as permissões e a visibilidade são verificadas no
  backend; o modelo não inventa `documentId`, `chunkId`, `page` ou `section`.

## Modelo de dados (25ª migration)

Migration: `20260915120000_fase28_base_conhecimento` (tabelas
`knowledge_documents`, `knowledge_chunks`, `knowledge_ingestions`, índices GIN
de FTS). Aplicada em `larcarvalho` e `larcarvalho_test`.

- `KnowledgeDocument`: título, descrição, categoria, visibilidade, status,
  origem (`MANUAL`/`UPLOAD`), arquivo/mime/tamanho/checksum, autor, equipe,
  versão, grupo de documento, tags, contagem de trechos, datas e motivo de
  falha. Campo `sourceType` mapeado para `source_type` no banco.
- `KnowledgeChunk`: trecho indexado (ordinal, conteúdo, seção, página, tokens).
- `KnowledgeIngestion`: histórico de processamento (status, trechos criados,
  erro, início/fim).

## Pipeline de ingestão

1. **Entrada**: texto (`POST /text`) ou arquivo (`POST /upload`, multipart com
   o campo `arquivo` e um único campo JSON `metadata`). Limite padrão de
   15 MiB (`KNOWLEDGE_MAX_BYTES`, teto 20 MiB).
2. **Validação de arquivo**: TXT, Markdown e PDF com texto selecionável. PDFs
   digitalizados (imagem) são recusados (`KNOWLEDGE_EXTRACTION_FAILED`); DOCX
   retorna `KNOWLEDGE_FILE_INVALID`. Mensagens amigáveis em
   `knowledgeErrorMessage`.
3. **Deduplicação**: SHA-256 do conteúdo; duplicidade retorna
   `KNOWLEDGE_CONFLICT` (409).
4. **Extração** → **chunking** (alvo de tamanho com sobreposição; blocos
   longos são divididos) → **persistência** de trechos e do registro de
   ingestão.

## Busca lexical

- `GET /search?q=...` usa `websearch_to_tsquery('portuguese', q)` com índice
  GIN (`mode: LEXICAL`).
- **Fallback**: quando a FTS não retorna resultados (perguntas em linguagem
  natural), os termos são tokenizados (stopwords PT removidas, máx. 8 termos)
  e buscados via `ILIKE` em `content`/`title`, com pontuação por quantidade de
  termos correspondidos e ordenação por relevância e ordinal.
- `semanticEnabled: false` sempre nesta fase; a busca nunca é chamada de
  semântica.

## Resposta fundamentada (IA)

- Contexto `KNOWLEDGE` hidrata fatos e trechos autorizados **antes** de chamar
  o provedor (`AiContextBuilder.buildKnowledgeContext`). Não há
  function-calling: `READ_ONLY_TOOLS` é apenas metadado descritivo.
- Prompt `knowledge-grounded-answer` (registrado no prompt registry com
  `requiredContext: ['KNOWLEDGE']`).
- `grounded` é `true` apenas quando existem evidências autorizadas. Caso
  contrário, a resposta estruturada é substituída por uma resposta neutra
  (`summary = DATA_NOT_AVAILABLE`, sem fatos, rascunho ou ações).
- Os `sources` retornados pelo modelo são filtrados por uma allowlist de
  `documentId`/`chunkId` autorizados; o frontend usa `documentId` para linkar a
  fonte à página do documento.

## Permissões (RBAC)

| Permissão | Admin | Gestor | Operador | Vendedor |
| --- | --- | --- | --- | --- |
| `knowledge.read` | sim | sim | sim | sim |
| `knowledge.search` | sim | sim | sim | sim |
| `knowledge.create` | sim | sim | — | — |
| `knowledge.update` | sim | sim | — | — |
| `knowledge.process` | sim | sim | — | — |
| `knowledge.archive` | sim | sim | — | — |
| `knowledge.manage` | sim | — | — | — |

`SUPER_ADMIN` recebe todas (`all`). A visibilidade do documento
(`PUBLIC`/`TEAM`/`PRIVATE`) é aplicada em conjunto com a permissão, no backend.

## API

Prefixo `/api/v1/knowledge`:

- `GET /` — lista paginada com filtros (`busca`, `categoria`, `status`,
  `visibilidade`, `tag`, `incluirArquivados`, `page`, `pageSize`).
- `GET /search` — busca lexical.
- `POST /text` — cria documento a partir de texto.
- `POST /upload` — cria documento a partir de arquivo (`bodyLimit`
  `KNOWLEDGE_MAX_BYTES + 65536`).
- `GET /:id` — detalhe com trechos.
- `PATCH /:id` — atualiza metadados.
- `POST /:id/archive` — arquiva (soft).
- `GET /:id/ingestions` — histórico de ingestão.

Códigos de erro: `KNOWLEDGE_NOT_FOUND`, `KNOWLEDGE_CONFLICT`,
`KNOWLEDGE_FILE_INVALID`, `KNOWLEDGE_EXTRACTION_FAILED`. Auditoria:
`KNOWLEDGE_DOCUMENT_CREATED|_UPDATED|_ARCHIVED` na entidade
`KnowledgeDocument`.

## Configuração

- `KNOWLEDGE_MAX_BYTES` (padrão `15728640`).
- `KNOWLEDGE_STORAGE_DIR` (padrão: diretório temporário do sistema).
- `AI_RESOURCES` inclui `knowledge_grounded_answer`.

## Frontend

- BFF `src/app/api/knowledge/[[...path]]/route.ts` (GET/POST/PATCH via
  `proxyIdentityRequest`).
- Serviço `src/services/api/knowledge-base.ts` (cookie, timeout, parse Zod).
- Páginas `/dashboard/base-conhecimento` (filtros, busca, criação por texto,
  upload, arquivamento) e `/dashboard/base-conhecimento/[id]` (metadados,
  trechos e ingestões). Componentes `knowledge-base-manager.tsx` e
  `knowledge-document-view.tsx`.
- Navegação em `app-shell.tsx` (grupo Inteligência, `knowledge.read`) e ajuda
  contextual no `/ajuda`.
- O Copiloto exibe fontes com link para o documento quando há `documentId`.

## Testes

- Unit backend: `apps/backend/test/knowledge.spec.ts`.
- Integração PostgreSQL: `apps/backend/test/integration/knowledge-base.spec.ts`.
- Unit frontend: `apps/frontend/test/knowledge-base.spec.tsx`.
- E2E: `tests/e2e/base-conhecimento.spec.ts`.
- Contrato compartilhado: `packages/shared/test/knowledge-base.spec.ts`.

## Limitações

- Recuperação lexical (sem embeddings/reranking) e sem OCR.
- Sem provider externo obrigatório, streaming, crawling ou integrações de
  armazenamento externo.
- A IA não executa ações nem altera dados a partir do conteúdo dos documentos.
