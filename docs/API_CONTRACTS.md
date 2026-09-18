# Contratos da API

## Tabelas comerciais

`/api/v1/tabelas-comerciais` oferece listagem paginada, criação e detalhe; `PATCH /:id` edita dados controlados e `PATCH /:id/status` ativa, desativa ou encerra sem exclusão física. `/api/v1/tabelas-comerciais/:id/itens` lista e cria itens, e `PATCH /:id/itens/:itemId` os atualiza com auditoria. Filtros: administradora, categoria, status, data de vigência e busca por código/nome. Erros próprios: `TABELA_COMERCIAL_NOT_FOUND`, `ITEM_COMERCIAL_NOT_FOUND` e `TABELA_COMERCIAL_CONFLICT`. Schemas executáveis estão em `packages/shared`; consulte [TABELAS_COMERCIAIS.md](TABELAS_COMERCIAIS.md).

## Simulador público

`POST /api/v1/public/simulador` não exige autenticação e aceita somente o perfil público, página e tamanho máximo 12. Filtra até 100 candidatos, calcula todos antes de ordenar/paginar e retorna DTO sem IDs ou qualidade técnica detalhada. Possui rate limit de 30 requisições por IP em dez minutos. Contrato, erros e limites estão em [SIMULADOR_PUBLICO.md](SIMULADOR_PUBLICO.md).

## Índice de Aderência

`POST /api/v1/indice-aderencia/calcular` recebe perfil pontuável e de um a quatro IDs únicos. Retorna índice opcional, cobertura e sete componentes explicáveis por grupo. Exige `indice_aderencia.read` e está documentado em [INDICE_ADERENCIA.md](INDICE_ADERENCIA.md). Não existe endpoint de escrita, persistência ou busca global por score.

## Comparador de grupos

`GET /api/v1/comparador/grupos` pesquisa e pagina grupos por critérios objetivos. `POST /api/v1/comparador/comparar` compara entre dois e quatro IDs únicos e exige confirmação explícita para categorias diferentes. Ambos exigem `comparador.read`, usam o mesmo DTO factual e estão documentados em [COMPARADOR.md](COMPARADOR.md). Erros específicos: `COMPARADOR_GROUP_NOT_FOUND` e `COMPARADOR_CONFLICT`.

## Histórico consolidado dos grupos

Listagem paginada, criação idempotente, detalhe imutável e séries temporais estão documentados em [GRUPO_HISTORICO.md](GRUPO_HISTORICO.md). Erros específicos: `GRUPO_SNAPSHOT_NOT_FOUND` e `GRUPO_SNAPSHOT_CONFLICT`. Não existem `PATCH` ou `DELETE` de snapshot.

## Qualidade dos dados

As rotas de listagem, detalhe, criação manual controlada, análise, resolução, descarte justificado, reabertura, resumo e varredura estão documentadas em [DATA_QUALITY.md](DATA_QUALITY.md). Erros de domínio: `DATA_QUALITY_ISSUE_NOT_FOUND` e `DATA_QUALITY_CONFLICT`.

## Importações

Os oito endpoints, multipart e contratos do fluxo estão em [IMPORTACOES.md](IMPORTACOES.md). Erros de domínio: `IMPORTACAO_NOT_FOUND`, `IMPORTACAO_CONFLICT` e `IMPORTACAO_FILE_INVALID`. Upload exige exatamente `tipoImportacao` e `arquivo`; mapping, validação e execução são comandos separados.

A API publica contratos técnicos, identidade e administradoras em `/api/v1`. Os schemas executáveis ficam em `packages/shared`.

## Health

`GET /api/v1/health`

```json
{
  "status": "ok",
  "service": "backend",
  "version": "v1",
  "timestamp": "2026-08-31T12:00:00.000Z",
  "requestId": "uuid-da-requisicao"
}
```

Retorna `200`, sem cache. Indica somente que o processo HTTP responde.

## Readiness

`GET /api/v1/ready`

```json
{
  "status": "ready",
  "service": "backend",
  "version": "v1",
  "timestamp": "2026-08-31T12:00:00.000Z",
  "requestId": "uuid-da-requisicao",
  "checks": []
}
```

No servidor real, `checks` contém `postgresql`. Uma query constante `SELECT 1` bem-sucedida retorna `ready` e `200`. URL ausente ou banco indisponível retorna `not_ready` e `503`. Em testes isolados de `buildApp()`, a lista pode permanecer vazia ou receber probes injetados.

## Erros

Todas as rotas do backend usam o mesmo envelope mínimo:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Rota não encontrada",
    "requestId": "uuid-da-requisicao"
  }
}
```

Códigos técnicos atuais:

- `NOT_FOUND`: rota inexistente;
- `VALIDATION_ERROR`: entrada HTTP inválida ou limite de requisição excedido;
- `INTERNAL_ERROR`: falha inesperada sem detalhes internos.
- `UNAUTHORIZED`: sessão ausente/inválida ou credencial incorreta;
- `FORBIDDEN`: identidade válida sem capacidade suficiente;
- `CONFLICT`: unicidade ou proteção do último super administrador;
- `TOO_MANY_REQUESTS`: limite de tentativas de login excedido.
- `ADMINISTRADORA_CONFLICT`: CNPJ de administradora já cadastrado.
- `ADMINISTRADORA_NOT_FOUND`: administradora inexistente.

## Autenticação

| Método | Rota                           | Acesso                   | Resultado                                          |
| ------ | ------------------------------ | ------------------------ | -------------------------------------------------- |
| `POST` | `/api/v1/auth/login`           | público, limitado por IP | `{ user, permissions }` e cookie de sessão         |
| `GET`  | `/api/v1/auth/me`              | autenticado              | `{ user: { id, nome, email, role }, permissions }` |
| `POST` | `/api/v1/auth/logout`          | autenticado              | `204`, revoga sessão e remove cookie               |
| `POST` | `/api/v1/auth/change-password` | autenticado              | `204`, revoga as outras sessões                    |

Login recebe `email` e `password`. Troca recebe `currentPassword` e `newPassword`. `permissions` contém somente capabilities calculadas pela matriz central do backend, permitindo navegação visual consistente. Tokens e hashes nunca aparecem no JSON.

## Usuários

| Método  | Rota                               | Capacidade         |
| ------- | ---------------------------------- | ------------------ |
| `POST`  | `/api/v1/users`                    | `users.create`     |
| `GET`   | `/api/v1/users?page=1&pageSize=20` | `users.read`       |
| `GET`   | `/api/v1/users/:id`                | `users.read`       |
| `PATCH` | `/api/v1/users/:id/status`         | `users.deactivate` |
| `PATCH` | `/api/v1/users/:id/role`           | `users.changeRole` |

As respostas omitem `passwordHash`, sessões e qualquer token. `pageSize` aceita de 1 a 100. IDs inválidos retornam `400`; recurso ausente retorna `404`.

O header `x-request-id` corresponde ao `requestId` do corpo. Stack traces, caminhos internos e mensagens brutas de dependências não são enviados ao cliente.

## Administradoras

| Método  | Rota                                                              | Capacidade                   |
| ------- | ----------------------------------------------------------------- | ---------------------------- |
| `GET`   | `/api/v1/administradoras?page=1&pageSize=20&search=&status=todas` | `administradoras.read`       |
| `POST`  | `/api/v1/administradoras`                                         | `administradoras.create`     |
| `GET`   | `/api/v1/administradoras/:id`                                     | `administradoras.read`       |
| `PATCH` | `/api/v1/administradoras/:id`                                     | `administradoras.update`     |
| `PATCH` | `/api/v1/administradoras/:id/status`                              | `administradoras.deactivate` |

Os payloads aceitam `nome`, `nomeFantasia`, `cnpj`, `codigoExterno` e `site`. CNPJ inválido retorna `400`; CNPJ único duplicado retorna `409` com `ADMINISTRADORA_CONFLICT`; ID ausente retorna `404` com `ADMINISTRADORA_NOT_FOUND`.

## Núcleo operacional

Produtos, grupos e cotas possuem `GET` paginado, `POST`, detalhe `GET /:id`, `PATCH /:id` e `PATCH /:id/status` sob `/api/v1/produtos`, `/api/v1/grupos` e `/api/v1/cotas`. As capacidades seguem os prefixos `produtos.*`, `grupos.*` e `cotas.*`. Conflitos de relação retornam `RELATIONSHIP_CONFLICT`; duplicidades contextuais e ausências usam os respectivos códigos do recurso.

## Histórico de assembleias

`/api/v1/assembleias` possui listagem, criação, detalhe, edição e status. `/api/v1/lances` e `/api/v1/contemplacoes` possuem listagem, criação, detalhe e edição auditada. Todas as listagens são paginadas e filtram no PostgreSQL; datas são intervalos inclusivos sobre `Assembleia.dataAssembleia`.

## Frontend

`GET /health` pertence ao processo Next.js e existe para o healthcheck de infraestrutura. Não faz parte da API de domínio versionada.

## CRM

`POST /api/v1/public/leads` é anônimo, estrito, limitado e sempre retorna confirmação genérica sem ID. As rotas autenticadas `/api/v1/leads` separam atualização, atribuição, status, interação, interesse e próximo contato para evitar mass assignment. Consulte [CRM_LEADS.md](CRM_LEADS.md).

## Analytics first-party

`POST /api/v1/public/analytics/events` aceita somente eventos canônicos e
metadados controlados. `GET /api/v1/analytics/overview` exige autenticação e
`analytics.read`, aceitando períodos `today`, `7d`, `30d`, `90d` ou `custom`.

## Base de conhecimento

`/api/v1/knowledge` (Fase 28) oferece listagem paginada com filtros (`busca`,
`categoria`, `status`, `visibilidade`, `tag`, `incluirArquivados`), busca
lexical `GET /search` (parâmetro `mode`: `lexical` operacional;
`semantic`/`hybrid` respondem `VECTOR_SEARCH_UNAVAILABLE` sem índice
vetorial), criação por texto `POST /text`, upload multipart
`POST /upload` (campos `arquivo` + `metadata` JSON), detalhe `GET /:id` com
trechos, edição `PATCH /:id`, arquivamento `POST /:id/archive`, histórico
`GET /:id/ingestions` e backfill de embeddings
`POST /embeddings/backfill` (`knowledge.process`). Erros de domínio:
`KNOWLEDGE_NOT_FOUND`, `KNOWLEDGE_CONFLICT`, `KNOWLEDGE_FILE_INVALID` e
`KNOWLEDGE_EXTRACTION_FAILED`. Limites, permissões e o pipeline estão em
[BASE_CONHECIMENTO_RAG.md](BASE_CONHECIMENTO_RAG.md).

## Inteligência Artificial (Fase 29)

`POST /api/v1/ai/chat` (rate limit 30/min) e `POST /api/v1/ai/chat/stream`
(SSE `start/delta/fact/source/usage/done/error`, mesmo limite) exigem
`ai.use` + permissão do contexto. `GET /api/v1/ai/status|config` e
`PATCH /api/v1/ai/config` (auditado), `GET|PUT /api/v1/ai/pricing`
(auditado), `POST /api/v1/ai/test-connection` exigem `ai.settings`;
`GET /api/v1/ai/usage|/usage/summary` exigem `ai.usage`. Erros:
`PROVIDER_NOT_CONFIGURED`, `PROVIDER_UNAVAILABLE`, `PROVIDER_TIMEOUT`,
`PROVIDER_RATE_LIMITED`, `PROVIDER_AUTH_ERROR`, `MODEL_NOT_ALLOWED`,
`CONTEXT_TOO_LARGE`, `OUTPUT_INVALID`, `USAGE_LIMIT_EXCEEDED`,
`EMBEDDING_UNAVAILABLE`, `VECTOR_SEARCH_UNAVAILABLE`. Detalhes em
[IA_PRODUCAO.md](IA_PRODUCAO.md).
