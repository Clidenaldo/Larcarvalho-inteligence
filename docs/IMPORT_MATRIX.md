# Matriz de Destino da Importação (Fase 25 — itens 2.1–2.10, 73.1)

## 1. Por que existe
No consórcio, os mesmos termos (prazo, crédito, parcela, taxa, lance,
grupo) têm significados diferentes por documento. A matriz impede que
uma importação aparentemente "inteligente" contamine a base: o sucesso
mede-se por dados CORRETAMENTE classificados, nunca pela quantidade de
campos preenchidos.

## 2. Classificação do arquivo → destinos permitidos
| Classificação | Destinos permitidos |
|---|---|
| COMMERCIAL_TABLE | Administradoras, Produtos, TabelasComerciais |
| GROUP_PORTFOLIO | Administradoras, Produtos, Grupos |
| QUOTA_PORTFOLIO | Administradoras, Produtos, Grupos, Cotas |
| ASSEMBLY_HISTORY | Administradoras, Grupos, Assembleias, Lances, Contemplações |
| MIXED | todos (uma importação por entidade) |

Regras duras: tabela comercial nunca cria Grupo/Cota/Assembleia; carteira
de grupos nunca cria TabelaComercial; carteira de cotas nunca cria
Lance/Contemplação; MIXED separa por entidade (previews e execuções
distintos por destino).

## 3. Onde vive
- Contrato: `packages/shared/src/contracts/import-matrix.ts`
  (`MATRIZ_DESTINO`, `IMPORT_TARGET_REGISTRY`, `NEVER_IMPORTABLE_FIELDS`,
  `GENERIC_AMBIGUOUS_STEMS`, `destinationsForFileType`,
  `isCompatibleTarget`). O wizard usa o mesmo contrato (sem listas
  duplicadas no frontend).
- Persistência: `importacoes.classificacaoArquivo` (nullable; nulo =
  fluxo legado). Trocar a classificação limpa o mapeamento salvo
  (nunca aplicado cegamente) e exige remapeamento.
- Validação backend (defesa em profundidade): upload e `saveMapping`
  rejeitam par incompatível com 400 `INVALID_IMPORT_TARGET`. A segurança
  semântica não depende só da interface.

## 4. Ambiguidade → revisão
Cabeçalhos genéricos (`Prazo`, `Taxa`, `Parcela`, `Crédito`, `Valor`,
`Lance`) nunca disparam mapeamento automático; o preview lista
`needsReview` e o wizard exibe o alerta. Mapeamento manual explícito
pelo usuário continua permitido (escolha consciente).

## 5. Campos nunca importáveis
`id`, timestamps, hashes, tokens, permissões, metadados de auditoria,
aderência/scores e valores derivados de engines — fora do registry e
fora das opções de mapping.

## 6. Testes
`apps/backend/test/import-matrix.spec.ts` (15, itens 73.1) e
`apps/frontend/test/import-matrix.spec.tsx` (2, filtragem/recálculo).
