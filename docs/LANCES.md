# Lances

Lance pertence a uma assembleia e pode referenciar uma cota. Quando a cota é informada, ela deve pertencer ao mesmo grupo da assembleia. Tipos: `LIVRE`, `FIXO`, `EMBUTIDO`, `OUTRO`; origens: `MANUAL`, `IMPORTACAO`, `INTEGRACAO`, `PUBLICO`, `OUTRO`. Percentual usa `Decimal(9,6)` e valor usa `Decimal(19,2)`. O resultado `contemplado` é histórico e não constitui previsão.

API: listagem/criação em `/api/v1/lances` e detalhe/edição em `/api/v1/lances/:id`. Não existe exclusão.
