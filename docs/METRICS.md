# Catálogo de métricas

Todas as métricas recebem o prefixo `larcarvalho_`.

## HTTP

- `http_requests_total`
- `http_requests_in_flight`
- `http_requests_by_method_total{method="..."}`
- `http_requests_by_route_total{method="...",route="..."}`
- `http_requests_by_status_total{status="2xx|3xx|4xx|5xx"}`
- `http_request_duration_seconds`
- `http_slow_requests_total`
- `http_errors_total`

Rotas são normalizadas antes de virar label. Não use IDs, emails ou outros
valores de entrada como labels.

## Banco de dados

- `database_pool_total`
- `database_pool_idle`
- `database_pool_waiting`
- `database_query_duration_seconds`
- `database_query_errors_total`
- `database_slow_queries_total`

As métricas do pool são atualizadas na leitura do endpoint e dependem de uma
conexão PostgreSQL ativa.

## Negócio

- `integration_runs_total`
- `integration_runs_by_status_total{status="success|partial|failed"}`
- `integration_runs_by_connector_total{connector="..."}`
- `integration_records_received_total`
- `integration_records_created_total`
- `integration_records_updated_total`
- `integration_records_rejected_total`
- `imports_total`
- `imports_by_status_total{status="completed|partial|failed"}`
- `import_records_processed_total`
- `data_quality_issues_total{severity="...",status="..."}`
- `data_quality_issues_open`
- `data_quality_issues_in_review`
- `data_quality_issues_critical`
- `leads_created_total`
- `leads_converted_total`
- `leads_lost_total`
- `simulations_total`
- `simulations_by_status_total{status="started|completed|failed"}`
- `simulations_by_category_total{category="..."}`
- `simulation_duration_seconds`
- `public_lead_attempts_total{status="accepted|failed"}`

As métricas de negócio estão ligadas aos fluxos de integrações, importações,
qualidade de dados e leads. Testes unitários isolados podem registrar eventos
diretamente para validar o formato exportado.

## Verificação

```powershell
npm run test --workspace @larcarvalho/backend
npm run lint
npm run typecheck
npm run build
```
