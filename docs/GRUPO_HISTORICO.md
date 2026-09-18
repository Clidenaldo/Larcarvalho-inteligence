# Histórico consolidado dos grupos — Fase 10

## Conceito

`Grupo` representa o estado operacional atual. `GrupoHistorico` representa um snapshot imutável do estado observado em um instante UTC (`dataReferencia`, apresentado na API como `capturadoEm`). Snapshots são sempre inseridos: não existem endpoints de edição ou exclusão e não há backfill fabricado a partir do estado atual.

## Modelo e fonte

O snapshot preserva status, prazo, quantidade declarada de cotas, quantidade de registros `Cota`, cotas ativas, faixa de crédito e média das parcelas conhecidas. A origem é `MANUAL`, `IMPORTACAO`, `INTEGRACAO_FUTURA` ou `PROCESSAMENTO_INTERNO`. Vínculos opcionais com `FonteDados` e `Importacao` permitem ao serviço reutilizável receber contexto futuro sem implementar uma integração nesta fase. A criação exposta atualmente é somente manual.

Cada comando exige uma chave UUID de idempotência, única dentro do grupo. Repetir a mesma chave devolve o snapshot já persistido e não duplica a auditoria. A unicidade por grupo e timestamp existente continua permitindo snapshots diferentes no mesmo dia.

## Consolidação temporal

O serviço executa a leitura e a persistência em transação `RepeatableRead`. Somente assembleias `REALIZADA` com `dataAssembleia` e `createdAt` até o instante capturado participam das métricas. Lances e contemplações também precisam ter sido registrados até esse instante e pertencer a essas assembleias. Eventos futuros não contaminam o snapshot.

Métricas objetivas armazenadas:

- assembleias realizadas;
- lances registrados e marcados como contemplados;
- contemplações totais, por `SORTEIO`, `LANCE` e demais tipos, sem inferir tipo ausente;
- mínimo, máximo, média e mediana dos percentuais de `Lance` com `contemplado=true` e percentual conhecido;
- cotas registradas e cotas ativas;
- issues abertas/em análise e issues críticas do grupo.

Mínimo, máximo e média são agregados pelo PostgreSQL. Para mediana, o banco retorna somente o ponto central, ou os dois pontos centrais; no caso par, a aplicação calcula sua média com `Prisma.Decimal` e seis casas. Nenhum percentual conhecido resulta em `null`, nunca em zero.

## Cobertura

Os campos `assembleiasRealizadas`, `assembleiasComDadosLance` e `assembleiasComDadosContemplacao` distinguem ausência de eventos da ausência de dados. `quantidadeCotasDeclarada` vem do cadastro do grupo; `quantidadeCotasRegistradas` é uma contagem real e não é tratada como equivalente.

Issues críticas não bloqueiam o snapshot. Os contadores de qualidade ficam congelados no snapshot e a interface oferece link para investigação, sem criar score.

## API e RBAC

| Método | Rota                                            | Capability                |
| ------ | ----------------------------------------------- | ------------------------- |
| `GET`  | `/api/v1/grupos/:grupoId/historico`             | `historico_grupos.read`   |
| `POST` | `/api/v1/grupos/:grupoId/historico/snapshot`    | `historico_grupos.create` |
| `GET`  | `/api/v1/grupos/:grupoId/historico/series`      | `historico_grupos.read`   |
| `GET`  | `/api/v1/grupos/:grupoId/historico/:snapshotId` | `historico_grupos.read`   |

A listagem é paginada, ordenada por captura decrescente e aceita `dataInicio`/`dataFim`. Super Admin, Admin e Gestor leem e criam; Operador e Vendedor apenas leem. Não existem capabilities de update/delete.

## Séries e frontend

O endpoint de séries retorna somente os campos necessários para crédito, prazo, cotas, estatísticas de percentuais contemplados e contemplações. A página do grupo contém histórico, criação autorizada, últimos snapshots, EmptyState, gráficos SVG leves e tabela textual equivalente. O detalhe apresenta estado, métricas, cobertura, qualidade e comparação factual com o snapshot anterior.

Toda linguagem é histórica e observacional. Não existe probabilidade, previsão, ranking, comparador comercial, Índice de Aderência, IA ou machine learning.

## Auditoria e evolução futura

`GRUPO_SNAPSHOT_CREATED` registra grupo, snapshot, fonte, timestamp e resumo de cobertura, sem copiar o snapshot inteiro. Falhas após autorização registram `GRUPO_SNAPSHOT_FAILED`. O importador poderá chamar `GrupoHistoricoService.create` futuramente com origem, `fonteDadosId`, `importacaoId` e idempotência próprias; essa chamada não foi automatizada nesta fase.

Snapshots antigos não são removidos automaticamente. Política de retenção, execução assíncrona e limites de séries deverão ser avaliados com volume real.

Na validação da Fase 10, nenhum navegador controlável estava provisionado na sessão (`browsers.list()` vazio); por isso o E2E visual foi documentado como indisponível, sem bloquear os testes de frontend, BFF, build e integração PostgreSQL.

Os testes de integração também expõem um aviso de depreciação do `pg` ao usar transação interativa pelo `@prisma/adapter-pg`; não há falha funcional e as consultas do módulo são sequenciais, mas a compatibilidade deve ser reavaliada antes da adoção do `pg` 9.
