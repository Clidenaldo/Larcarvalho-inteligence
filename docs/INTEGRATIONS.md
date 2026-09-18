# Arquitetura de integrações

## Escopo da Fase 15

A infraestrutura aceita somente interfaces oficiais, documentadas e autorizadas. Não há connector de administradora real, scraping, automação de navegador, quebra de CAPTCHA, credencial embutida, IA ou previsão.

O fluxo técnico é:

```text
administradora -> connector -> transporte -> formato canônico -> staging lógico
-> validação/importador -> processamento idempotente -> qualidade -> histórico
```

`Integration` descreve o mecanismo e sua configuração não sensível. `IntegrationRun` isola cada tentativa, seus contadores, trigger, request ID e erro sanitizado. `IntegrationLog` registra eventos técnicos menores. `FonteDados` continua representando origem e confiabilidade; não foi confundida com o mecanismo de transporte. Uma execução manual referencia uma `Importacao` já existente em vez de criar uma importação artificial.

## Connectors

- `MOCK`: funcional, determinístico e limitado; valida sucesso, sucesso parcial e falha sem fingir ser fornecedor real.
- `MANUAL_IMPORT`: funcional; converge para o `ImportacoesService`, preservando mapeamento, normalização, validação, DataQualityIssue e processamento existentes.
- `REST_API`: funcional para payload `CANONICAL_V1` em endpoint autorizado. O connector somente valida e coloca registros em staging lógico nesta fase; sem perfil oficial de mapeamento, não escreve registros externos nas tabelas finais.
- `SOAP`, `SFTP`, `FILE_PULL` e `WEBHOOK`: modelados como `NAO_CONFIGURADA`. Não há implementação ou autenticação fictícia.

O formato canônico contém `entityType`, `externalId`, `data` e metadados mínimos de origem. A ordem de processamento preparada é Administradora, Produto, Grupo, Cota, Assembleia e então Lance/Contemplação. Filhos sem pais não são persistidos. Erros técnicos ficam em run/log; dados semanticamente inválidos originam `DataQualityIssue` com origem `INTEGRACAO_FUTURA`.

## Segurança

Configurações são schemas fechados por connector. Segredos não entram no JSON nem nas respostas: o banco guarda apenas `secretRef`, e o valor é resolvido em variável de ambiente no momento da chamada.

O REST connector exige host presente em `INTEGRATION_REST_ALLOWED_HOSTS`, resolve DNS antes da chamada, bloqueia loopback, redes privadas, link-local, metadata e endereços reservados em execução normal. Redirecionamentos não são seguidos. Timeout, tamanho máximo da resposta e no máximo duas novas tentativas com backoff limitado são impostos. Apenas timeout/rede, 429, 502, 503 e 504 são transitórios. Em testes, destinos locais precisam de política injetada explicitamente e `NODE_ENV=test`.

Logs não armazenam payload integral, Authorization, token, chave ou segredo. Mensagens inesperadas são substituídas por erro técnico genérico. O parser global e o TLS não foram relaxados.

## Idempotência e mapeamento

`IntegrationRun` possui chave única `(integrationId, idempotencyKey)`: repetir a mesma execução devolve a run existente. O importador mantém suas chaves naturais e estratégia de atualização. `ExternalEntityMapping` centraliza `(integrationId, entityType, externalId) -> internalId`, evitando adicionar `externalId` indiscriminadamente em todas as entidades. O custo é uma consulta adicional no processamento; em troca, múltiplos fornecedores podem mapear a mesma entidade interna sem poluir os domínios.

O mapeamento externo não é preenchido por REST genérico sem perfil oficial capaz de provar o `internalId`. Snapshots também não são criados para registros meramente validados. Quando um connector real produzir alterações consolidadas de grupos, deverá criar no máximo um snapshot `INTEGRACAO_FUTURA` por grupo e run.

## API administrativa

Todos os comandos são autenticados; mutações também exigem origem confiável.

- `GET/POST /api/v1/integrations`
- `GET/PATCH /api/v1/integrations/:id`
- `POST /api/v1/integrations/:id/test-connection`
- `POST /api/v1/integrations/:id/execute`
- `POST /api/v1/integrations/:id/pause`
- `POST /api/v1/integrations/:id/resume`
- `GET /api/v1/integrations/:id/runs`
- `GET /api/v1/integrations/:id/logs`
- `GET /api/v1/integrations/runs/:runId`

Não existe webhook público nesta fase. Um webhook futuro deverá ter rota isolada, autenticação documentada (HMAC, bearer ou assinatura do fornecedor), proteção contra replay e captura de raw body restrita à rota.

## RBAC

- `SUPER_ADMIN` e `ADMIN`: todas as capabilities de integração.
- `GESTOR`: leitura, execução, logs e teste de conexão.
- `OPERADOR`: leitura, execução e logs.
- `VENDEDOR`: sem acesso técnico.

Capabilities: `integrations.read`, `create`, `update`, `execute`, `logs`, `test_connection` e `pause`.

## Operação futura

`frequencia` e `proximaExecucaoEm` preparam polling, mas nenhum scheduler distribuído foi criado. Readiness permanece focado no PostgreSQL; indisponibilidade de fornecedor pertence ao teste de conexão e às runs, evitando derrubar a aplicação inteira. Métricas agregadas e retenção de logs devem ser definidas quando existirem contratos reais e SLAs.
