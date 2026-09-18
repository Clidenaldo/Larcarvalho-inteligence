# Gestão Comercial Inteligente (Fase 27)

Central operacional que consolida, em uma única resposta,
fatos comerciais já existentes no domínio (CRM, agenda, simulações,
propostas, vendas, contratos e comissões) para o escopo autorizado do
usuário. É **descritiva**: não calcula previsão, probabilidade, score ou
ranking de pessoas.

## 1. Rota e contrato

- Página: `/dashboard/gestao-comercial` (item de navegação "Gestao Comercial",
  `apps/frontend/src/components/app-shell.tsx`).
- BFF: `GET /api/commercial-intelligence/[...path]` faz proxy autenticado
  (`apps/frontend/src/app/api/commercial-intelligence/[[...path]]/route.ts`).
- API: `GET /api/v1/commercial-intelligence/overview`
  (`commercial-intelligence.routes.ts`), validando query e resposta com
  `commercialIntelligenceQuerySchema` / `commercialIntelligenceSchema`
  (`packages/shared/src/contracts/commercial-intelligence.ts`).

Parâmetros de query:

| Parâmetro | Valores | Regra |
| --- | --- | --- |
| `period` | `today`, `7d`, `30d` (padrão), `90d`, `custom` | reusa `resolveDashboardPeriod` |
| `from` / `to` | `YYYY-MM-DD` | obrigatórios só com `period=custom`; proibidos fora dele; intervalo máximo de 365 dias; `from <= to` |
| `scope` | `OWN`, `TEAM`, `ALL` | opcional; limitado ao escopo máximo do ator |

Resposta: `generatedAt`, `scope`, `availableScopes`, `period`
(`from`, `toExclusive`, `previousFrom`, `previousToExclusive`, `label`,
`timezone`), `summary`, `pipeline`, `conversions`, `attention`,
`performance`, `timeseries`, `sources` e, opcionalmente, `financial`.

## 2. Escopo e RBAC

`resolveScope` (`commercial-intelligence.service.ts`) deriva o escopo máximo de
`sales` via `dataScope(actor, 'sales')` e só permite valores iguais ou mais
restritos:

| Perfil | Escopo máximo (`dataScope('sales')`) | `availableScopes` |
| --- | --- | --- |
| VENDEDOR | `OWN` | `[OWN]` |
| GESTOR | `TEAM` | `[OWN, TEAM]` |
| ADMIN / escopo amplo | `ALL` | `[OWN, TEAM, ALL]` |

Um `scope` não autorizado responde **403 `FORBIDDEN`**. O acesso ao endpoint
depende de ao menos uma capability `sales.read_*` (via contexto de IA) e a
página redireciona para `/dashboard/forbidden` em `forbidden` e `/login` em
`unauthorized`.

Filtros por escopo reutilizam `scopedUsers(actor)` (OWN/TEAM) e o mesmo
critério em leads (`responsavel`), vendas (`responsavel`) e o agregado
`commercial` (`OR(createdBy, lead.responsavel)`), garantindo consistência com o
restante do sistema. Não há permissão nova: reaproveitam-se `sales.read_*`.

## 3. Períodos

- Fuso único: `America/Fortaleza` (inclusive para "hoje" e buckets diários).
- "Estado atual" (`activeClients`, `pendingFollowUps`, `overdueFollowUps`,
  `openSales`, `pendingDocuments`, `pendingContracts`) é estoque no momento da
  requisição.
- "No período" usa intervalo inclusivo no início e exclusivo no fim
  (`gte from`, `lt to`).
- A comparação usa janela anterior de duração equivalente; com base anterior
  zero, `changePercent` é `null` ("Sem base").

## 4. Fontes de dados

`Sources`: `Cliente 360`, `Agenda`, `Simulacoes`, `Propostas`, `Vendas`,
`Contratos`; adiciona `Comissoes` quando o ator possui `commissions.read`.
Todas as leituras são feitas no PostgreSQL pelo backend; o frontend não amplia
escopo.

## 5. Resumo (`summary`)

| Indicador | Definição |
| --- | --- |
| `activeClients` | Leads com status não terminal (`notIn CONVERTIDO/PERDIDO`) |
| `pendingFollowUps` | Follow-ups `PENDING` dos leads no escopo |
| `overdueFollowUps` | `PENDING` com `dueAt < agora` |
| `simulations` | Simulações não deletadas criadas na janela (comparação com a anterior) |
| `proposals` | Propostas não deletadas criadas na janela (comparação) |
| `acceptedProposals` | Transições `toStatus = ACCEPTED` na janela (comparação) |
| `openSales` | Vendas em `RASCUNHO, AGUARDANDO_DOCUMENTOS, DOCUMENTOS_RECEBIDOS, ENVIADA_ADMINISTRADORA, EM_ANALISE, APROVADA` |
| `completedSales` | Vendas `CONTRATADA` com `dataContratacao` na janela (comparação) |
| `canceledSales` | Vendas `CANCELADA` com `dataCancelamento` na janela (comparação) |
| `pendingDocuments` | Vendas com documento obrigatório `PENDENTE` ou `REJEITADO` |
| `pendingContracts` | Contratos `RASCUNHO` ou `EMITIDO` no escopo |

## 6. Pipeline e conversões

Pipeline factual (cada estágio tem `href` para drill-down):

| `key` | Rótulo | Contagem | Drill-down |
| --- | --- | --- | --- |
| `SIMULATIONS` | Simulacoes | simulações na janela | `/simulacoes/nova` |
| `PROPOSALS` | Propostas | propostas na janela | `/propostas` |
| `ACCEPTED` | Propostas aceitas | aceitas na janela | `/propostas?status=ACCEPTED` |
| `SALES` | Vendas | vendas com `dataAceite` na janela | `/dashboard/vendas` |
| `CONTRACTED` | Contratadas | contratadas na janela | `/dashboard/vendas?status=CONTRATADA` |

Conversões (determinísticas, `rate = numerator / denominator`, `null` sem
denominador):

- `PROPOSAL_ACCEPTANCE`: aceitas ÷ propostas da janela.
- `ACCEPTED_TO_SALE`: vendas (por `dataAceite`) ÷ aceitas.

Contagens do pipeline podem usar bases diferentes (data de criação vs. aceite);
são fatos independentes, não um funil estritamente encadeado.

## 7. Atenção necessária (`attention`)

Lista determinística, inclui apenas itens com `count > 0`, com `severity`,
`reason` e `href`:

| Tipo | Severidade | Definição | Drill-down |
| --- | --- | --- | --- |
| `FOLLOWUP_OVERDUE` | HIGH | Follow-ups `PENDING` vencidos | `/dashboard/agenda` |
| `SALE_DOCUMENT_PENDING` | HIGH | Documento obrigatório pendente/rejeitado | `/dashboard/vendas?status=AGUARDANDO_DOCUMENTOS` |
| `CONTRACT_PENDING` | MEDIUM | Contratos em rascunho/emitidos | `/dashboard/vendas?contractStatus=RASCUNHO` |
| `PROPOSAL_NO_FOLLOWUP` | MEDIUM | Proposta `GENERATED/SENT/VIEWED` sem follow-up `PENDING` | `/propostas` |
| `NO_NEXT_ACTION` | MEDIUM | Cliente ativo sem follow-up `PENDING` | `/dashboard/carteira` |
| `STALE_CONTACT` | LOW | Cliente ativo sem interação há 7 dias | `/dashboard/carteira` |

## 8. Performance factual (`performance`)

Uma linha por vendedor ativo no escopo, sem nota ou ranking: `activeClients`,
`overdueFollowUps`, `simulations`, `proposals`, `acceptedProposals`, `sales`,
`contracts` (contratos não cancelados criados na janela). No frontend a tabela
só é exibida com mais de um vendedor.

## 9. Série temporal (`timeseries`)

Buckets por dia local (`America/Fortaleza`, formato `en-CA`) com
`simulations` (criação), `proposals` (criação) e `sales` (`dataAceite`),
ordenados por data. Dias sem eventos não geram linha.

## 10. Financeiro (`financial`, opcional)

Presente apenas com `commissions.read`. Considera comissões das vendas no
escopo com `tipo != ESTORNO` e `status notIn CANCELADA/ESTORNADA`. Valores são
somados com `FinancialDecimal` (precisão decimal → centavos → `BigInt`),
evitando erro de ponto flutuante, e formatados com duas casas:

- `expected`: soma de `valorPrevisto` (previsto).
- `confirmed`: soma de `valorConfirmado` quando presente.
- `received`: soma de `valorRecebido`.
- `confirmedReceivable`: `max(confirmed - received, 0)` — saldo confirmado a
  receber.

## 11. Uso pela IA

- Prompt `manager-summary` (`prompt-registry.ts`) exige contexto
  `DASHBOARD` + `COMMERCIAL_MANAGEMENT`, versão `v1`, saída
  `aiStructuredResponseSchema`.
- Contexto `COMMERCIAL_MANAGEMENT` exige `sales.read_own|team|all`
  (`ai.service.ts`).
- `AiContextBuilder.buildCommercialManagement` chama
  `overview(actor, { period: '30d' })` e converte a resposta em **fatos
  mínimos** (escopo, período, resumo, conversões, atenção e financeiro). O
  modelo nunca recebe linhas cruas do Prisma.
- A IA é somente leitura: não cria, altera nem executa ações; qualquer ação
  passa pelos endpoints normais com auditoria.

## 12. Frontend

`CommercialIntelligenceView` exibe cartões de resumo clicáveis (drill-down),
bloco de comissões (quando autorizado), pipeline, conversões, alertas e tabela
de performance, além de fontes e horário de atualização. O formulário da página
oferece período, escopo (apenas `availableScopes`) e datas personalizadas; o
`ai-context.ts` do frontend sinaliza a rota para o copiloto.

## 13. Testes

- Unitários de contrato/serviço no backend (`npm run test`).
- Integração PostgreSQL em `apps/backend/test/integration/`
  (`npm run test:integration`), incluindo limpeza FK-safe de vendas/propostas/
  simulações via `test/integration/clean-vendas.ts`.
- E2E Playwright em `tests/e2e/gestao-comercial.spec.ts` (fixture
  `commercial-fixture.ts`), cobrindo vendedor, gestor, financeiro, período e
  IA.

## 14. Limitações

- Indicadores descritivos; dependem da qualidade/completude dos dados.
- Sem previsão, probabilidade, recomendação, score ou ranking global.
- Sem escrita: a central apenas lê e direciona para os fluxos existentes.
- Sem dados, retorna contagens zero, `rate = null` ou estados vazios com HTTP
  200; sem base anterior, `changePercent = null`.
