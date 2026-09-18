# Cotas

Cota pertence a um grupo; o número é texto e é único somente dentro dele, preservando zeros à esquerda. Crédito e parcela usam `Decimal(19,2)`; prazo restante é não negativo e, quando o grupo informa prazo, não pode superá-lo. Não há lógica de lance, assembleia ou contemplação nesta fase.

Endpoints: `GET/POST /api/v1/cotas`, `GET/PATCH /api/v1/cotas/:id` e `PATCH /api/v1/cotas/:id/status`.
