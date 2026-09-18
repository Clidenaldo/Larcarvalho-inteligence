# Simulador público — Fase 13

## Objetivo e fluxo

`/simulador` permite que um visitante, sem login e sem cadastro, informe categoria, crédito, parcela, prazo e lance percentual. O frontend busca grupos ativos, calcula o Índice de Aderência e apresenta resultados explicáveis antes de oferecer contato opcional.

O fluxo possui cinco etapas com retorno sem perda de estado: categoria, crédito, parcela, prazo e lance. Categoria e crédito são obrigatórios; os demais campos são opcionais. O resultado pode ser reiniciado sem cookie ou persistência.

## Estratégia de candidatos

1. PostgreSQL filtra categoria, faixa inclusiva de crédito, parcela máxima e prazo máximo.
2. Somente grupo, produto e administradora ativos entram.
3. A consulta normalizada do comparador carrega no máximo 100 candidatos em ordem neutra.
4. O motor da Fase 12 calcula aderência para todo esse conjunto.
5. O conjunto avaliado é ordenado e somente depois paginado.

Índices calculáveis vêm primeiro, por valor decrescente. Índices `null` vêm depois. O desempate é por código de grupo e administradora. A interface chama isso de “maior aderência ao seu perfil”, nunca chance de contemplação.

Se existirem mais de 100 candidatos, `limiteAtingido` fica verdadeiro, `totalCandidatos` informa a quantidade do filtro e a interface pede refinamento. O sistema não afirma que o recorte é uma classificação global completa.

## Perfil, limites e DTO público

O request de `POST /api/v1/public/simulador` é:

```json
{
  "perfil": {
    "categoria": "IMOVEL",
    "valorCreditoDesejado": "150000",
    "parcelaMaxima": "1500",
    "prazoMaximo": 120,
    "lanceDisponivelPercentual": "25"
  },
  "page": 1,
  "pageSize": 6
}
```

Valores monetários são positivos, limitados a R$ 100 milhões e possuem duas casas. Lance aceita 0–100; prazo aceita 1–1200 meses; `pageSize` aceita 1–12; página aceita 1–100. O schema é estrito e rejeita campos administrativos como `incluirInativos`, IDs ou sort arbitrário.

O DTO público contém somente nome da administradora, código do grupo, categoria, faixa de crédito, parcela conhecida, prazo, índice, classificação, cobertura, estado histórico simplificado, estatísticas históricas essenciais e componentes sem dados internos. UUIDs, contagens de issues, `AuditLog`, importações, fontes e metadados não são expostos.

Estados públicos de dados: `DADOS_DISPONIVEIS`, `DADOS_HISTORICOS_PARCIAIS` e `DADOS_INSUFICIENTES`. Grupo sem snapshot pode aparecer, mas preserva índice `null` quando a engine não atinge 40% de cobertura.

## Segurança e privacidade

- endpoint público separado; nenhuma autenticação foi removida das APIs administrativas;
- rate limit process-local de 30 simulações por IP a cada dez minutos;
- limite de corpo global de 1 MiB e schema estrito;
- timeout do simulador de cinco segundos e timeout do BFF um segundo maior;
- CORS continua restrito ao frontend oficial e Helmet continua global;
- Nginx também mantém limitação de requisições e encaminha IP do cliente;
- sem cache, CAPTCHA, analytics de terceiros, cookies de rastreamento ou
  persistência de simulações; analytics first-party registra somente eventos
  de negócio anonimizados (UUID opaco, categoria/faixa de crédito, dispositivo
  classificado e atribuição sanitizada);
- logs registram request ID, categoria, quantidade de candidatos e tempos de consulta/cálculo/total, sem payload completo ou dados pessoais.

O rate limit é adequado à implantação atual de uma instância. Redis ou outro armazenamento distribuído só deverá ser introduzido quando houver múltiplas réplicas.

Em acesso direto ao backend, `TRUST_PROXY_HOPS` permanece `0`. Em produção atrás do único Nginx confiável da composição, a implantação deve defini-lo como `1`; assim o rate limit usa o IP encaminhado do visitante sem confiar indiscriminadamente em cabeçalhos enviados pela internet.

Erros usam o envelope seguro existente: `VALIDATION_ERROR`, `TOO_MANY_REQUESTS`, `SIMULATION_TIMEOUT` ou `INTERNAL_ERROR`. Nenhuma mensagem de SQL ou stack trace chega ao visitante.

## Contato comercial

Na Fase 14, o CTA principal abre o formulário curto e consentido de lead. Ele envia nome, ao menos um contato, perfil e opção escolhida a `POST /api/v1/public/leads`. O envio não revela se o contato já existe. `PUBLIC_PRIVACY_POLICY_URL` exibe a política somente quando configurada.

Não há chatbot, campanha, disparo ou automação de WhatsApp.

## Frontend e acessibilidade

A página possui metadata própria, hero comercial sem promessa, layout mobile-first, controles grandes, labels, fieldsets, radios, erros associados, `aria-live`, barra de progresso sem dependência de cor, loading que remove resultados anteriores, empty state, paginação e `<details>` acessível para explicações.

O bloco “Como calculamos” e o disclaimer explicam a natureza do índice. Histórico é sempre chamado de observado. A palavra “probabilidade” aparece somente na negação obrigatória de que o índice não a representa.

## Performance e EXPLAIN

O teste de volumetria cria 150 grupos, avalia no máximo 100 e retorna doze itens sem query por grupo. Um `EXPLAIN (ANALYZE, BUFFERS)` com 200 grupos temporários, revertidos ao final, apresentou execução de 6,597 ms, quicksort de 39 kB e 813 buffers compartilhados atingidos.

O PostgreSQL preferiu scans sequenciais devido à tabela técnica pequena. Os acessos laterais permaneceram dentro de uma única consulta. O plano não demonstrou benefício suficiente para migration ou índice adicional nesta fase; deve ser repetido com volumetria e distribuição de produção.

## Limitações

- conjunto avaliado limitado a 100 candidatos;
- rate limit e estado de execução são process-local;
- o timeout devolve resposta segura, mas não cancela uma consulta PostgreSQL já enviada;
- CTA depende de configuração externa;
- nenhuma simulação ou contato é persistido;
- eventos first-party não contêm PII; UTMs são limitadas, o referrer é reduzido
  ao hostname e a primeira atribuição não é sobrescrita;
- sem probabilidade, previsão, CRM, chatbot, IA ou machine learning.

> O Índice de Aderência mede compatibilidade entre os critérios informados e os dados conhecidos do grupo. Ele não representa probabilidade, promessa ou garantia de contemplação.
