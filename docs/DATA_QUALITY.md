# Qualidade dos dados — Fase 09

## Objetivo

O módulo centraliza inconsistências encontradas em importações, validações internas, processamentos e auditorias manuais. Ele permite localizar o registro afetado, priorizar por severidade, investigar o histórico e encerrar a ocorrência com uma ação ou justificativa auditável. Não existe score, previsão ou correção automática de dados de domínio.

## Ciclo de vida

Os estados são `OPEN`, `IN_REVIEW`, `RESOLVED` e `IGNORED`. Colocar em análise é permitido a quem possui `data_quality.review`; resolver, ignorar e reabrir exigem `data_quality.resolve`. Ignorar sempre exige justificativa e resolver exige a ação realizada. Todas as transições gravam ator, instante, IP, user-agent e metadados no `AuditLog`.

Ocorrências de validação interna usam uma chave determinística formada por regra, entidade, registro e campo. Uma nova varredura atualiza a ocorrência já aberta em vez de duplicá-la. Se uma inconsistência interna deixa de existir, somente a ocorrência criada pelo scanner é resolvida automaticamente. Ocorrências de importação, processamento ou auditoria manual nunca são encerradas dessa maneira. Itens ignorados permanecem ignorados; itens resolvidos voltam a `OPEN` caso a mesma inconsistência reapareça.

## Modelo e classificação

Além da descrição, entidade, registro, campo e valor recebido, `DataQualityIssue` mantém severidade, status, origem, contexto operacional, vínculo opcional com importação, metadados mínimos, chave de deduplicação e dados da resolução. As severidades são `INFO`, `WARNING`, `ERROR` e `CRITICAL`; elas expressam impacto técnico/operacional e não formam um score.

As origens aceitas são `IMPORTACAO`, `VALIDACAO_INTERNA`, `PROCESSAMENTO`, `INTEGRACAO_FUTURA` e `AUDITORIA_MANUAL`. A última é usada pela criação manual controlada; `INTEGRACAO_FUTURA` apenas reserva a classificação, sem implementar integrações nesta fase.

| Código                         | Significado                                            |
| ------------------------------ | ------------------------------------------------------ |
| `ACTIVE_CHILD_INACTIVE_PARENT` | Registro ativo associado a pai inativo                 |
| `REMAINING_TERM_EXCEEDS_GROUP` | Prazo restante da cota excede o prazo do grupo         |
| `FUTURE_ASSEMBLY_COMPLETED`    | Assembleia futura marcada como realizada               |
| `PAST_ASSEMBLY_SCHEDULED`      | Assembleia passada ainda agendada                      |
| `RELATIONSHIP_MISMATCH`        | Relação entre administradora, grupo ou cota divergente |
| `SUSPICIOUS_VALUE`             | Combinação de valores que requer revisão               |
| `MANUAL_REVIEW_REQUIRED`       | Ocorrência criada manualmente por usuário autorizado   |

## Regras internas atuais

- produto ativo ligado a administradora inativa;
- grupo ativo ligado a administradora inativa;
- produto e grupo ligados a administradoras diferentes;
- grupo ativo ligado a produto inativo;
- prazo restante da cota maior que o prazo do grupo;
- cota ativa em grupo não ativo;
- assembleia realizada no futuro ou agendada no passado;
- lance ou contemplação cuja cota pertence a outro grupo;
- contemplação por sorteio contendo valores próprios de lance.

A varredura é manual, processa os registros em lotes de 500 e retorna quantos registros foram avaliados, quantas ocorrências foram criadas, quantas já existiam e quantas foram resolvidas pela revalidação. Início, conclusão e falha do scanner são auditados.

## Filtros e contexto

A listagem é paginada no PostgreSQL e aceita `status`, `severidade`, `origem`, `codigo`, `entidade`, `importacaoId`, `administradoraId`, `produtoId`, `grupoId`, intervalo de datas, busca textual e `pendentes=true`. A ordenação prioriza severidade e data. A tela de detalhe exibe contexto navegável, vínculo com importação, decisão registrada e histórico, sem colocar metadados brutos no HTML da listagem.

Importações com ocorrências e grupos com pendências exibem links contextuais para a lista já filtrada. A criação manual existe como API controlada e usa o código único `MANUAL_REVIEW_REQUIRED` e a origem `AUDITORIA_MANUAL`.

## API

Base: `/api/v1/data-quality`.

| Método  | Rota                  | Capacidade             |
| ------- | --------------------- | ---------------------- |
| `GET`   | `/issues`             | `data_quality.read`    |
| `POST`  | `/issues`             | `data_quality.review`  |
| `GET`   | `/issues/:id`         | `data_quality.read`    |
| `PATCH` | `/issues/:id/status`  | `data_quality.review`  |
| `POST`  | `/issues/:id/resolve` | `data_quality.resolve` |
| `POST`  | `/issues/:id/ignore`  | `data_quality.resolve` |
| `POST`  | `/issues/:id/reopen`  | `data_quality.resolve` |
| `POST`  | `/scan`               | `data_quality.scan`    |
| `GET`   | `/summary`            | `data_quality.read`    |

Erros de domínio usam `DATA_QUALITY_ISSUE_NOT_FOUND` e `DATA_QUALITY_CONFLICT`, além dos envelopes padronizados de autenticação, autorização e validação.

## Limites desta fase

Não foram implementados `GrupoHistorico`, comparador de snapshots, IA, score de qualidade, integrações externas, jobs agendados ou correções automáticas dos registros operacionais. A varredura permanece deliberadamente acionada por usuário autorizado.
