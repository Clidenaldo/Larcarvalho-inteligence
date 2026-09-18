# Índice de Aderência — Fase 12

## Conceito e segurança comercial

O Índice de Aderência mede, de forma determinística, quanto os dados conhecidos de um grupo atendem ao perfil informado. A saída vai de 0 a 100 e é acompanhada pela cobertura da avaliação. Ela não representa chance, probabilidade, previsão, promessa, garantia de contemplação ou recomendação financeira.

O cálculo é executado sob demanda, não é persistido e não altera o comparador factual. Não utiliza IA ou machine learning.

## Perfil e elegibilidade

O perfil aceita categoria, crédito desejado, parcela máxima, prazo mínimo/máximo e lance disponível percentual. Categoria funciona como elegibilidade e não pontua. Administradora não pontua porque não existe preferência formal no perfil. É obrigatório informar ao menos um dos quatro critérios pontuáveis: crédito, parcela, prazo ou lance.

O endpoint calcula somente de um a quatro grupos explicitamente selecionados. Não varre o banco inteiro. Os candidatos continuam sendo localizados pelo comparador paginado e neutro.

## Pesos

| Componente                  | Peso |
| --------------------------- | ---: |
| Crédito                     |  20% |
| Parcela                     |  15% |
| Prazo                       |  10% |
| Histórico de lances         |  25% |
| Cobertura histórica         |  10% |
| Características do grupo    |  10% |
| Qualidade técnica dos dados |  10% |

Os pesos ficam centralizados em `INDICE_ADERENCIA_CONFIG` e sua soma é validada como 100. O limite mínimo de cobertura também está nessa configuração: 40%.

## Componentes

- **Crédito:** 100 pontos brutos quando o desejado está no intervalo inclusivo atual; zero quando está fora; indisponível sem perfil ou faixa completa.
- **Parcela:** regra binária; 100 quando a parcela conhecida é menor ou igual ao limite e zero quando excede. Usa a origem já definida pelo comparador e nunca estima parcela.
- **Prazo:** regra binária sobre o prazo total e o intervalo inclusivo informado.
- **Lances:** compara o percentual disponível ao mínimo e à mediana históricos contemplados. Na mediana ou acima: 100. Entre mínimo e mediana: interpolação linear de 50 a 100. Abaixo do mínimo: proporção de 0 a 50. Acima do máximo continua 100, sem interpretação preditiva.
- **Robustez do lance:** uma observação torna 50% do peso de lance avaliável; duas a quatro, 75%; cinco ou mais, 100%. Isso reduz a cobertura da avaliação, não transforma ausência em reprovação.
- **Cobertura histórica:** média simples entre `assembleiasComDadosLance / assembleiasRealizadas` e `assembleiasComDadosContemplacao / assembleiasRealizadas`. Sem snapshot ou com denominador zero, indisponível.
- **Características:** indisponível nesta fase. Não existe preferência adicional suportada que justifique os dez pontos sem duplicar crédito, parcela, prazo ou categoria.
- **Qualidade:** mede somente confiança técnica. Sem críticas, cada issue aberta não crítica reduz dez pontos brutos. Com críticas, a base é `50 - 25 × críticas - 5 × abertas não críticas`, limitada entre 0 e 100.

## Dados ausentes, normalização e precisão

Componente indisponível recebe `pesoAvaliado = 0`, pontuações `null` e não é tratado como zero. Para componentes avaliáveis:

```text
pontuacaoPonderada = pontuacaoBruta / 100 × pesoAvaliado
indiceBruto = soma(pontuacaoPonderada) / soma(pesoAvaliado) × 100
coberturaAvaliacao = soma(pesoAvaliado) / 100 × 100
```

Como os pesos totais somam 100, cobertura e peso avaliável possuem o mesmo valor numérico. Os dois conceitos permanecem explícitos no DTO. Cálculos usam `Prisma.Decimal`; componentes e cobertura preservam duas casas e o índice final usa inteiro com arredondamento `ROUND_HALF_UP`.

Com cobertura menor que 40%, `indice` e `classificacao` são `null`. Em 40% ou mais, as faixas são: 80–100 alta aderência; 60–79 moderada; 40–59 baixa; 0–39 muito baixa. Essas faixas descrevem aderência, não contemplação.

## Explicabilidade e DTO

Cada um dos sete componentes retorna `nome`, `peso`, `pesoAvaliado`, `pontuacaoBruta`, `pontuacaoPonderada`, `status`, `explicacao` e `dadosUtilizados`. Os estados são `ATENDE`, `PARCIAL`, `NAO_ATENDE` e `INDISPONIVEL`.

O resultado contém `grupoId`, `indice`, `classificacao`, `coberturaAvaliacao`, `pesoTotalAvaliavel`, `componentes` e `disclaimer`.

## API, RBAC e auditoria

`POST /api/v1/indice-aderencia/calcular` recebe `{ perfil, grupoIds }`. São aceitos de um a quatro UUIDs únicos. A capability `indice_aderencia.read` é concedida aos cinco perfis autenticados. Origem confiável é exigida.

Não foi criado `/buscar`: o fluxo mais seguro e claro mantém busca/paginação no comparador e calcula somente IDs selecionados. Isso evita calcular o banco inteiro ou produzir ordenação global incorreta após paginação. A ordenação neutra padrão não foi alterada e não há ordenação por aderência nesta fase.

Consultas de cálculo não geram `AuditLog`, pois são leituras frequentes. Autenticação, autorização, request ID e logs HTTP continuam ativos.

## Frontend

O comparador ganhou o campo `Lance disponível (%)` e duas ações distintas: `Comparar dados` preserva o fluxo factual; `Calcular aderência` exige perfil e leva ao resultado lado a lado. O painel apresenta índice ou insuficiência, cobertura, sete componentes, pesos avaliados, indisponibilidades, explicações e disclaimer.

Na Fase 13, a mesma engine passou a atender o simulador público por um DTO restrito. A fórmula e o limite mínimo não foram duplicados ou alterados.

## Limitações

- sem persistência, migration ou painel de pesos;
- sem busca ou ordenação global por aderência;
- sem preferência por administradora;
- sem pontuação de características até existir requisito real adicional;
- sem simulador público, lead, CRM, probabilidade, IA ou machine learning.

> O Índice de Aderência mede compatibilidade entre os critérios informados e os dados conhecidos do grupo. Ele não representa probabilidade, promessa ou garantia de contemplação.
