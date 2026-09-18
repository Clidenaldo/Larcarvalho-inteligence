# Comparação de cotas — investigação e correção

## Causa raiz verificada

Existem dois fluxos: `/dashboard/comparador` compara grupos e planos comerciais;
`/simulacoes/[id]` compara resultados de cotas associados a cenários calculados.
Não são entidades intercambiáveis. A comparação de cotas em `simulation-detail.tsx`
usava tabela somente a partir de `md`; no celular, uma grade de uma coluna empilhava
cards e escondia os critérios dentro de `details`. O cabeçalho mostrava somente a
administradora, tornando duas cotas da mesma instituição visualmente indistintas.
A tabela tinha largura mínima constante e não fixava cabeçalho ou critérios.

O estado mantinha todos os IDs de resultado, as chaves React eram IDs e o BFF
repassava a resposta autenticada. Não foi encontrada substituição de colunas na
serialização dos valores financeiros. Foi encontrada uma omissão na persistência:
o motor retornava `groupCode` e `quotaNumber`, mas `simulationResult.create` não
gravava esses dois campos já existentes no schema. A correção os preserva nos novos
resultados; não altera snapshots antigos. IDs distintos de resultados permitiam repetir a mesma cota
em cenários diferentes. Os filtros dos cards não removiam a seleção.

`ProductCommercialRule → SimulationCalculatorService → SimulationCalculationSnapshot
/ SimulationResult → SimulationDetail → Proposal.snapshot / ProposalItem → PDF`
é o fluxo financeiro. O comparador de grupos usa outro DTO factual, inclusive
planos de `TabelaComercial`, e não executa esse motor. Não deve ser renomeado como
comparador de cotas.

## Decisões

A comparação de cotas usa **cinco posições**, conforme o requisito definitivo do
produto. O ajuste pontual substitui o limite de quatro da primeira validação.
Propostas continuam limitadas a três resultados completos.
Nenhuma fórmula, política, endpoint ou snapshot é alterado. Informações não presentes
no contrato são mostradas como `Não informado`, sem consultar cadastros atuais para
atribuir retroativamente informações a resultados históricos.

A seleção conserva sua ordem. Recalcular pode substituir o resultado selecionado
somente quando a mesma cota e versão de regra são identificadas sem ambiguidade no
novo cenário; nos demais casos, permanece o snapshot anterior. Remover é apenas local.

O limite de cenários persistidos do backend e o comparador factual de grupos não
foram ampliados nem reescritos. A seleção temporária é reiniciada ao navegar para
outra simulação, evitando reutilizar resultados de um contexto anterior.

## Apresentação e dados

Uma única tabela semântica atende desktop e celular: uma linha por critério,
colunas por resultado, blocos de identificação, crédito/plano, lance/contemplação,
grupo/assembleia e avaliação comercial. O contêiner possui rolagem em ambos os
eixos, foco por teclado e nome acessível. Cabeçalhos usam `scope`; cabeçalho superior
e critérios à esquerda são fixos. No celular há encaixe horizontal por coluna.
Na impressão a altura e a rolagem são liberadas, sem esconder critérios essenciais.

São exibidos identificação, crédito contratado/líquido, parcelas calculadas, prazos,
lances em reais e percentual, taxas, aderência, avisos, premissas, regra e data do cálculo.
`comparisonContext`, opcional no contrato compartilhado, expõe exclusivamente os
campos já salvos no snapshot da própria simulação: parcelas pagas, taxa administrativa
percentual, limite embutido, redução/diluição e inclusão de seguro. Não expõe o JSON
completo das regras nem consulta dados de outra simulação.

Ordenação e destaques com texto usam somente valores retornados pelo backend:
menor parcela, maior crédito líquido, maior prazo, menor taxa administrativa em
reais e maior aderência. Valores ausentes ficam por último. Destaques exigem dois
resultados completos com valores conhecidos e distintos; empates no melhor valor
podem receber o mesmo destaque. Não há ranking geral ou cálculo de custo inventado.

Carregamento e erro são associados às colunas. Como o endpoint recalcula o cenário
em lote, as colunas selecionadas recebem o estado da operação; falhas preservam os
valores anteriores. Ordenar é local e não modifica a ordem de seleção ou o snapshot.
Favorito, duplicação, CSV, proposta, impressão e PDF continuam nos fluxos existentes.

## Campos ainda sem fonte histórica

Status operacional da cota/grupo, datas de funcionamento, assembleias, participantes,
histórico e confirmação de contemplação, parcela atual cadastral e índice de reajuste
não fazem parte do snapshot retornado. Permanecem visíveis como `Não informado`.
Também não se infere mês de contemplação nem se renomeia crédito líquido como
crédito após contemplação. Dados antigos sem código/número não são preenchidos a
partir do cadastro atual; um novo cálculo passa a gravar a identificação correta.

`Não aplicável` é usado somente quando o snapshot confirma exclusão de seguro ou
ausência de diluição. O estado `INCOMPLETE_DATA` mantém suas pendências explícitas.

## Arquivos da correção

- `apps/frontend/src/components/quota-comparison.tsx`: tabela e estados por coluna.
- `apps/frontend/src/lib/quota-comparison.ts`: identidade, limite, seleção e ordenação.
- `apps/frontend/src/components/simulation-detail.tsx`: integração com filtros, recálculo e proposta.
- `apps/frontend/src/app/(commercial)/simulacoes/[id]/page.tsx`: identidade da instância por simulação.
- `apps/frontend/src/app/globals.css`: rolagem, cabeçalhos, celular e impressão.
- `packages/shared/src/contracts/simulations.ts`: contexto histórico opcional tipado.
- `apps/backend/src/modules/simulations/simulations.service.ts`: identificação persistida e leitura restrita do snapshot.
- `apps/frontend/test/quota-comparison.spec.tsx`: interação, seleção e apresentação.
- `apps/backend/test/integration/simulations.spec.ts`: duas cotas, identificação, snapshot e regressões.
- `tests/quota-comparison/quota-comparison.spec.ts` e `package.json`: E2E real em módulo ESM.
- `playwright.quota-comparison.config.ts`: servidores exclusivos em 3100/3101.
- `scripts/validate-quota-comparison.mjs`: banco descartável com proteção contra reutilização.
- Este documento.

## Reprodução

```powershell
npm run check
node scripts/validate-quota-comparison.mjs
```

O primeiro comando executa schema Prisma, lint, typecheck, testes dos workspaces
e builds. O segundo exige PostgreSQL local ativo e lê `TEST_DATABASE_URL` sem
modificar `.env`; mantém `127.0.0.1` apenas no ambiente dos processos. Cria o banco
exclusivo `larcarvalho_comparison_validation`, aplica as 19 migrations existentes,
executa os comandos oficiais abaixo e remove apenas o banco criado por ele, inclusive
em caso de falha. Recusa executar se esse banco já existir, sem limpá-lo.

```powershell
npm run test:integration --workspace @larcarvalho/backend -- test/integration/simulations.spec.ts test/integration/comparador.spec.ts
npm run e2e -- --config playwright.quota-comparison.config.ts
```

Esses dois comandos são orquestrados pelo script com variáveis temporárias; não
devem ser executados contra o banco de uso diário. Imagens e traces ficam em
`test-results/quota-comparison`. O E2E usa dados identificados como teste e usuários
VENDEDOR temporários, sem alterar contas existentes.

## Validações da implementação inicial em 11/09/2026

`npm run check` concluiu com código 0: schema válido, lint sem erros ou avisos,
TypeScript aprovado nos três workspaces e builds de produção concluídos. O frontend
gerou 36 páginas estáticas, além das rotas dinâmicas.

| Suíte                                         | Testes aprovados |
| --------------------------------------------- | ---------------: |
| Shared                                        |               21 |
| Backend                                       |              175 |
| Frontend                                      |               86 |
| PostgreSQL: simulações/propostas e comparador |                7 |
| E2E Chromium: fluxo real em desktop/celular   |                1 |
| **Total, sem contar reexecuções**             |          **290** |

Os nove testes específicos do frontend verificam limite, duplicidade, alinhamento,
ausências, formatação, ordenação, teclado, remoção, carregamento/erro por coluna,
recálculo, filtros e atualização. O E2E mede coordenadas e rolagem em 1440×1000 e
390×844, testa quatro posições, proposta/PDF, manutenção das cotas no banco e
isolamento. A integração verifica resultados calculados, snapshot, CSV, impressão,
PDF e auditoria; o motor e os testes de aderência existentes permanecem intactos.

O roteiro descartável foi executado integralmente: sete testes PostgreSQL e um
E2E aprovados, incluindo CSS de impressão. Uma consulta posterior a `pg_database`
confirmou **zero** bancos com o nome de validação. A proteção contra banco já
existente também foi verificada: o script recusou reutilizá-lo ou apagá-lo.
Os avisos de Prisma/pg/Playwright emitidos em stderr aparecem como
`NativeCommandError` no redirecionamento do Windows PowerShell; os relatórios das
suítes registram aprovação. Logs preservados em
`test-results/comparison-validation-logs`, com `comparison-final-check.log` e
`comparison-validation.log` como evidências finais. Capturas:
[desktop](../test-results/quota-comparison/comparison-1440.png) e
[celular](../test-results/quota-comparison/comparison-390.png).

Durante a validação foram corrigidos o import de um tipo não exportado, o formato
ESM da fixture E2E e dados obrigatórios da fixture. Duas expectativas antigas de
isolamento foram atualizadas de 403 para 404: a política atual filtra registros de
outro vendedor na consulta, sem revelar sua existência. Não houve mudança na
política nem remoção de testes. Uma tentativa inicial de build não concluiu a
verificação TypeScript; a execução isolada e o `check` completo final passaram.

Nenhuma migration foi criada, nenhuma fórmula ou permissão foi alterada e não
houve alteração de `.env`, credenciais existentes, `SUPER_ADMIN`, commit, push,
merge ou deploy. As migrations aplicadas foram exclusivamente as já existentes,
no banco descartável desta validação.

## Ajuste pontual para cinco posições — 12/09/2026

O limite anterior estava em `QUOTA_COMPARISON_LIMIT = 4`, no arquivo
`apps/frontend/src/lib/quota-comparison.ts`. O contador de `quota-comparison.tsx`
já consumia essa constante. `simulation-detail.tsx` também tinha uma mensagem
fixa mencionando quatro; agora a mensagem usa a mesma constante, cujo valor é 5.

Arquivos alterados exclusivamente neste ajuste:

- `apps/frontend/src/lib/quota-comparison.ts`;
- `apps/frontend/src/components/simulation-detail.tsx`;
- `apps/frontend/test/quota-comparison.spec.tsx`;
- `tests/quota-comparison/quota-comparison.spec.ts`;
- este documento.

O componente da tabela, CSS, configuração Playwright e script descartável foram
auditados e não precisaram de alterações. Os demais números 4 encontrados em
classes CSS e os registros históricos desta documentação não representam o limite.
Nenhum contrato backend impede compor cinco resultados já existentes.

A sexta tentativa mantém as cinco posições, sem substituir qualquer seleção, e
informa: “Você pode comparar até 5 cotas por vez.” Com menos seleções, há somente
as colunas correspondentes. Remover C de A/B/C/D/E e selecionar F produz
A/B/D/E/F. Identidade, deduplicação, ordenação explícita, recálculo e snapshots
permanecem com as regras anteriores. Propostas continuam limitadas a três
resultados completos; o E2E verifica o botão desabilitado com cinco e a criação
de proposta/PDF depois de reduzir a seleção para três.

Os testes frontend incluem casos parametrizados para uma, duas, três, quatro e
cinco posições, alinhamento dos valores, bloqueio da sexta e reposição ordenada.
O E2E usa seis cotas exclusivamente como fixture: seleciona cinco, rejeita a sexta,
mede as cinco colunas em 1440×1000 e 390×844, percorre-as por rolagem, remove uma,
adiciona a sexta e verifica a seleção após recálculo.

Resultados deste ajuste (não confundir com a validação histórica acima):

| Comando/verificação | Resultado |
| --- | --- |
| Testes frontend específicos | 14 aprovados |
| Integração PostgreSQL de simulações e comparador | 7 aprovados |
| E2E desktop/mobile, recálculo, impressão, proposta/PDF e isolamento | 1 aprovado |
| Lint dos arquivos alterados | Aprovado |
| `node scripts/validate-quota-comparison.mjs` | Código 0; banco descartável removido |
| `npm run check` | Bloqueado no lint por erro externo descrito abaixo |

Total específico: **22 testes aprovados**, sem contar reexecuções. O script
executou os comandos oficiais de integração e E2E no banco exclusivo, sem
reutilizar banco existente; a consulta posterior confirmou zero bancos de
validação restantes. O primeiro E2E excedeu a espera de navegação após uma criação
de proposta bem-sucedida (HTTP 201). O teste passou a aguardar explicitamente essa
resposta e admite 30 segundos para a navegação; a repetição isolada passou, sem
remover verificações. Evidências: `test-results/comparison-five-frontend.log`,
`comparison-five-validation.log`, `comparison-five-check.log` e
`comparison-five-lint.log`, todos sob `test-results`.

**Bloqueio externo:** `apps/frontend/src/components/users-manager.tsx:243` contém
uma expressão JSX sem a chave final (`))` onde falta `}`). Esse arquivo, cuja
modificação antecede este ajuste, ficou intacto por estar fora do escopo autorizado.
Foi solicitada autorização específica para corrigir sua sintaxe. O `check` desta
revisão não chegou às etapas globais de TypeScript, testes e build; portanto elas
não são declaradas aprovadas para esta revisão. A aprovação histórica acima não
substitui a resolução desse bloqueio.

Este ajuste não alterou backend, fórmulas, snapshots, migrations, RBAC, permissões,
propostas, `.env`, credenciais ou o mecanismo do banco descartável. Não houve
commit, push, merge ou deploy.
