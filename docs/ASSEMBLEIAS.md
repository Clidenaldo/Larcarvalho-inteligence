# Assembleias

Assembleia é um evento histórico de um grupo. `dataAssembleia` preserva o `Timestamptz(3)` já modelado; `numero` é texto opcional e único por grupo quando informado. Os estados genéricos aceitos são `AGENDADA`, `REALIZADA` e `CANCELADA`. Grupos encerrados ou inativos podem receber registros históricos.

API: listagem/criação em `/api/v1/assembleias`, detalhe/edição em `/api/v1/assembleias/:id` e alteração explícita de status em `/api/v1/assembleias/:id/status`.
