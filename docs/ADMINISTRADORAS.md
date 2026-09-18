# Administradoras

O módulo mantém o cadastro institucional de administradoras de consórcio. Não cria produtos, grupos, dados de scraping ou integrações externas.

## Regras

- Não há exclusão física: o status `ativa` preserva histórico e relacionamentos.
- CNPJ é opcional, normalizado para 14 dígitos, validado pelos dígitos verificadores e único quando informado.
- URLs aceitam somente `http` e `https` e têm limite de 2048 caracteres.
- Cada criação, edição e mudança de status é realizada junto ao respectivo `AuditLog`, na mesma transação PostgreSQL.

## Endpoints

| Método | Rota                                 | Capacidade                   |
| ------ | ------------------------------------ | ---------------------------- |
| GET    | `/api/v1/administradoras`            | `administradoras.read`       |
| POST   | `/api/v1/administradoras`            | `administradoras.create`     |
| GET    | `/api/v1/administradoras/:id`        | `administradoras.read`       |
| PATCH  | `/api/v1/administradoras/:id`        | `administradoras.update`     |
| PATCH  | `/api/v1/administradoras/:id/status` | `administradoras.deactivate` |

A lista suporta `page`, `pageSize` (1–100), `search` e `status` (`todas`, `ativas`, `inativas`). A busca ocorre no banco por nome, nome fantasia, código externo e CNPJ normalizado.

## Interface

`/dashboard/administradoras` oferece filtros com envio explícito, paginação que preserva os filtros, cadastro, edição e confirmação para alteração de status. A rota de detalhe exibe exclusivamente dados institucionais já persistidos.
