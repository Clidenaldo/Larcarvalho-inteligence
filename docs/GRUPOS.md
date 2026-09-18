# Grupos

Grupo pertence a uma administradora e pode não ter produto durante classificação inicial. Código é único somente dentro da administradora. Datas usam `DATE`; prazo é positivo; valores usam `Decimal(19,2)` e máximo não pode ser menor que mínimo. Se houver produto, ele obrigatoriamente pertence à mesma administradora. Status genéricos: `ATIVO`, `INATIVO`, `ENCERRADO`, `SUSPENSO`, `OUTRO`.

Endpoints: `GET/POST /api/v1/grupos`, `GET/PATCH /api/v1/grupos/:id` e `PATCH /api/v1/grupos/:id/status`.
