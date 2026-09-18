# Observabilidade

## Visão geral

O backend expõe métricas no formato Prometheus sem dependências externas:

- coleta HTTP por método, rota normalizada e status;
- latência e detecção de requisições lentas;
- métricas do pool e das consultas PostgreSQL quando o banco está conectado;
- métricas de negócio para integrações, importações, qualidade de dados e leads.

O registro é mantido em memória por processo. Em múltiplas réplicas, cada processo
deve ser raspado separadamente ou agregado por uma camada externa.

## Endpoint

`GET /api/v1/metrics`

Quando `METRICS_ENABLED=false`, a rota não é registrada e retorna `404`.
Em `development` e `test`, a rota é acessível sem token para facilitar testes locais.
Em `staging` e `production`, exige:

```text
Authorization: Bearer <METRICS_AUTH_TOKEN>
```

Respostas autorizadas usam `Content-Type: text/plain; version=0.0.4` e
`Cache-Control: no-store`. O token deve ser fornecido por variável de ambiente e
nunca versionado.

## Segurança e cardinalidade

As labels usam apenas valores controlados. IDs UUID em URLs são normalizados para
`:id`; `requestId`, email, telefone, senha, cookie, token e segredo não são labels
nem aparecem no payload Prometheus.

O `requestId` continua disponível nos logs estruturados para correlação.

## Configuração

| Variável                           |  Padrão | Finalidade                             |
| ---------------------------------- | ------: | -------------------------------------- |
| `METRICS_ENABLED`                  | `false` | Habilita a rota                        |
| `METRICS_AUTH_TOKEN`               |   vazio | Token exigido fora de development/test |
| `SLOW_REQUEST_THRESHOLD_MS`        |  `1000` | Limite de requisição lenta             |
| `SLOW_DATABASE_QUERY_THRESHOLD_MS` |   `500` | Limite de consulta lenta               |

## Operação local

```powershell
npm run dev:backend
Invoke-WebRequest http://localhost:3001/api/v1/metrics
```

Para testar o modo protegido, use `NODE_ENV=production` e um token temporário
fora do repositório.
Analytics expõe `analytics_events_received_total`,
`analytics_events_rejected_total` e `analytics_events_processed_total`, sem
labels de alta cardinalidade ou payloads nos logs.
