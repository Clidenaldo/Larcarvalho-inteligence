# Contemplações

Contemplação é um fato histórico ligado a uma assembleia, com cota opcional do mesmo grupo. Tipos: `SORTEIO`, `LANCE`, `OUTRO`. Valor e percentual de lance são opcionais; sorteios não recebem valores inventados. A unicidade confiável existente é assembleia + código externo quando este é informado; sem código externo, duplicidades semânticas não podem ser eliminadas por heurística.

API: listagem/criação em `/api/v1/contemplacoes` e detalhe/edição cautelosa em `/api/v1/contemplacoes/:id`. Correções são auditadas com antes/depois e não há exclusão.
