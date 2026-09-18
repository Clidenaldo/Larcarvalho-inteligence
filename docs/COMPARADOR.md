# Motor de comparação de grupos — Fase 11

## Objetivo e limites

O comparador filtra grupos por critérios objetivos e coloca de dois a quatro grupos lado a lado. Ele descreve dados cadastrais atuais e métricas históricas observadas, sem recomendar uma opção. Não calcula score, ranking, Índice de Aderência, probabilidade de contemplação, previsão, inteligência artificial ou machine learning.

O módulo é somente leitura. Não persiste comparações, não altera grupos e não criou tabela, migration, seed ou histórico artificial.

## Fontes e regras

- administradora, produto, categoria, status, faixa de crédito e prazo vêm do estado atual de `Grupo` e de seus relacionamentos;
- métricas históricas vêm exclusivamente do snapshot `GrupoHistorico` mais recente, escolhido deterministicamente por `dataReferencia DESC, id DESC`;
- parcela usa `GrupoHistorico.parcelaMedia` quando disponível; caso contrário, usa a média Decimal das `Cota.parcelaAtual` atuais; sem valor conhecido, exibe `INDISPONIVEL` e nunca zero;
- prazo conhecido usa `Grupo.prazoMeses`; prazos restantes das cotas aparecem apenas como contexto atual;
- qualidade mostra as contagens atuais de `DataQualityIssue` abertas e críticas do grupo;
- grupo sem snapshot permanece comparável, marcado como histórico indisponível.

Crédito desejado atende quando está dentro da faixa inclusiva mínima/máxima. Parcela atende quando seu valor conhecido é menor ou igual ao limite. Prazo atende quando está no intervalo inclusivo informado. Critério ausente resulta em compatibilidade indisponível, não em aprovação implícita.

Cobertura histórica é `assembleiasComDados / assembleiasRealizadas`. Denominador zero gera percentual `null`. O histórico é `DISPONIVEL` quando existe snapshot, há ao menos uma assembleia e a cobertura de lances e contemplações é total; `PARCIAL` quando existe snapshot sem cobertura total; e `INDISPONIVEL` sem snapshot.

Cada DTO inclui motivos determinísticos que explicam os critérios conhecidos, desconhecidos ou não atendidos. As mensagens são factuais e não atribuem vencedor.

## Busca

`GET /api/v1/comparador/grupos` exige `comparador.read` e aceita:

- `categoria`, `administradoraId`, `valorCreditoDesejado`, `parcelaMaxima`;
- `prazoMinimo`, `prazoMaximo`, `status`;
- `incluirInativos`, `page`, `pageSize`;
- `sort`: `codigo`, `administradora`, `creditoMinimo`, `creditoMaximo`, `prazo` ou `maisRecente`;
- `sortDirection`: `asc` ou `desc`.

O padrão pesquisa grupos ativos e ignora administradoras/produtos inativos. `incluirInativos=true` inclui esses relacionamentos com sinalização explícita no resultado. A ordenação é uma whitelist neutra; não existe ordenação por “melhor”. Filtros, ordenação, paginação e total são processados no PostgreSQL.

## Comparação

`POST /api/v1/comparador/comparar` exige `comparador.read`, origem confiável e um JSON com `grupoIds` únicos. São aceitos no mínimo dois e no máximo quatro IDs. IDs duplicados, 1 ou 5 grupos retornam validação `400`; grupo ausente retorna `404`/`COMPARADOR_GROUP_NOT_FOUND`.

Categorias diferentes retornam `409`/`COMPARADOR_CONFLICT`, a menos que `permitirCategoriasDiferentes: true` seja enviado explicitamente. O resultado preserva a ordem solicitada e usa o mesmo DTO da busca. Contextos opcionais de crédito, parcela e prazo apenas produzem estados e motivos objetivos.

## Consulta e desempenho

O repository executa uma consulta em lote. `JOIN LATERAL` seleciona um único snapshot mais recente por grupo e agrega cotas e issues; `COUNT(*) OVER()` entrega o total paginado. A comparação carrega todos os IDs em uma única query. Isso evita N+1. Todos os valores de entrada entram por parâmetros `Prisma.sql`; somente colunas/direções de uma whitelist entram na ordenação.

Não foram adicionados índices na Fase 11. A consulta reutiliza índices das entidades existentes, inclusive o índice histórico por grupo/data. O plano deve ser reavaliado com volumetria real.

## RBAC, auditoria e frontend

`comparador.read` é concedida explicitamente a `SUPER_ADMIN`, `ADMIN`, `GESTOR`, `VENDEDOR` e `OPERADOR`. O backend continua sendo a autoridade e o shell usa a capability apenas para navegação.

Como ambas as operações são leituras, não foi criado `AuditLog` de comparação. Autenticação, autorização, request ID e logs HTTP permanecem ativos.

`/dashboard/comparador` oferece filtros, paginação, seleção com contador e limite de quatro grupos. `/dashboard/comparador/resultado` apresenta tabela responsiva lado a lado, critérios, métricas históricas, cobertura, alertas de qualidade e links para grupo/histórico/qualidade. Ausências usam texto explícito e estado vazio acessível; não há gráfico porque a comparação tabular comunica melhor valores heterogêneos.

O aviso exibido nas duas telas esclarece que o conteúdo é factual, não recomendação comercial e não estimativa de contemplação.

Na Fase 12, o fluxo ganhou uma ação separada e explícita para calcular aderência dos grupos selecionados. Sem essa ação, o comparador continua factual e sua ordenação permanece neutra. Aderência, quando solicitada, aparece em painéis próprios e não substitui nenhuma métrica da comparação.

O simulador público da Fase 13 reutiliza internamente a busca segura do comparador, forçando status ativo, exclusão de produto/administradora inativos, ordenação neutra inicial e limite de candidatos. Nenhum endpoint administrativo foi tornado público.

## Limitações deliberadas

- não há persistência ou compartilhamento de comparações;
- não há comparação pública, captura de lead ou simulador;
- não há integração externa, scraping ou enriquecimento;
- não há peso, score, ranking, recomendação ou destaque de vencedor;
- não há cálculo preditivo, probabilidade, IA ou machine learning;
- não há backfill nem dados históricos fictícios.
