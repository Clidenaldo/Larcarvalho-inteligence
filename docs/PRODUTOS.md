# Produtos

Produto é uma modalidade comercial de uma administradora. Usa categorias `IMOVEL`, `AUTOMOVEL`, `MOTOCICLETA`, `PESADOS`, `SERVICOS` e `OUTROS`; o banco preserva a coluna textual existente. A criação é impedida para administradora inexistente ou inativa. O status é booleano, sem exclusão física.

Endpoints: `GET/POST /api/v1/produtos`, `GET/PATCH /api/v1/produtos/:id` e `PATCH /api/v1/produtos/:id/status`.
