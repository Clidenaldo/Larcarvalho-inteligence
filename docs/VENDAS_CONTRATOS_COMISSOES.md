# Vendas, Contratos e Comissões (Fase 26)

## 1. Escopo
Fluxo comercial pós-proposta: **Venda** → **Contrato** → **Comissão**, com
auditoria, RBAC, timeline, IA read-only e frontend completo.

## 2. Entidades (Prisma)

| Modelo | Descrição |
|---|---|
| `Sale` | Venda originada de proposta aceita. Snapshot imutável copiado do `ProposalItem.financialSnapshot`. Número sequencial `VEN-YYYY-NNNNNN`. |
| `SaleStatusHistory` | Auditoria de transições de status. |
| `SaleContract` | Contrato(s) vinculados à venda. |
| `SaleDocument` | Checklist de documentos (CPF, RG, comprovante, etc.). |
| `Commission` | Comissão prevista → confirmada → recebida, com estorno. |
| `CommissionRule` | Regra de cálculo vigente por administradora/categoria. |
| `SaleSequence` | Controle de numeração com advisory lock. |

## 3. Máquinas de status

### Venda
RASCUNHO → AGUARDANDO_DOCUMENTOS → DOCUMENTOS_RECEBIDOS →
ENVIADA_ADMINISTRADORA → EM_ANALISE → APROVADA → CONTRATADA.
Etapas não terminais permitem CANCELADA; EM_ANALISE também permite RECUSADA.

### Contrato
RASCUNHO → EMITIDO → ASSINADO → ATIVO. Antes de ATIVO, permite CANCELADO.

### Comissão
PREVISTA → CONFIRMADA → PARCIALMENTE_RECEBIDA → RECEBIDA.
Recebimento integral pode ir diretamente de CONFIRMADA para RECEBIDA.
PREVISTA e CONFIRMADA permitem cancelamento. Recebidas, inclusive parciais,
permitem estorno com registro separado e preservação do recebimento original.

## 4. RBAC

| Permissão | VENDEDOR | GESTOR | ADMIN | SUPER_ADMIN |
|---|---|---|---|---|
| `sales.read_own/team/all` | OWN | TEAM | ALL | ALL |
| `sales.create` | ✅ | ✅ | ✅ | ✅ |
| `sales.update_*` | OWN | TEAM | ALL | ALL |
| `sales.change_status` | OWN | TEAM | ALL | ALL |
| `sales.assign` | — | TEAM | ALL | ALL |
| `sales.cancel` | OWN | TEAM | ALL | ALL |
| `contracts.*` | read+create+update (OWN) | read+create+update (TEAM) | ALL | ALL |
| `commissions.read/create` | OWN | TEAM | ALL | ALL |
| `commissions.confirm` | — | TEAM | ALL | ALL |
| `commissions.receive` | — | — | ALL | ALL |
| `commissions.reverse` | — | — | ALL | ALL |
| `commission_rules.*` | — | read | ALL | ALL |
| `ai.sales_summary` | ✅ | ✅ | ✅ | ✅ |

## 5. Regras de negócio

- **Snapshot imutável**: copiado de `ProposalItem.financialSnapshot` no
  momento da criação da venda. Nunca recalculado.
- **Numeração**: `VEN-YYYY-NNNNNN` via tabela `SaleSequence` com
  `pg_advisory_xact_lock` dentro da transação.
- **Documentos**: checklist sem upload binário (sem storage seguro).
- **Comissão**: Decimal com precisão 50 e centavos BigInt, sem float. IA apenas
  interpreta, nunca calcula.
- **Estorno**: cria registro `ESTORNO` com link via `estornoDeId`. Original
  marcada `ESTORNADA`. Nada é deletado.
- **Cancelamento**: recebimentos integrais ou parciais exigem estorno prévio.
- **Concorrência**: `expectedUpdatedAt` verifica a versão do cliente. Comissões
  também comparam atomicamente a versão, o status e o valor recebido lidos no
  servidor quando o cliente omite o token. Conflitos retornam 409.
- **Saldo**: valor confirmado menos recebido, com aritmética decimal exata.
- **Auditoria**: atualizações sem mudança efetiva de venda e contrato não geram eventos.

## 6. APIs

### Rotas
- `GET/POST /api/v1/sales` — listagem e criação
- `PATCH /api/v1/sales/:id` — atualização
- `POST /api/v1/sales/:id/status` — transição de status
- `POST /api/v1/sales/:id/assign` — transferência
- `POST /api/v1/sales/:id/cancel` — cancelamento
- `PATCH /api/v1/sales/:saleId/documents/:documentId` — status de documento
- `GET/POST /api/v1/sales/:saleId/contracts` — listagem e criação
- `PATCH /api/v1/contracts/:id` — atualização
- `GET /api/v1/commissions` — listagem
- `POST /api/v1/commissions/sales/:saleId/commissions` — criação
- `POST /api/v1/commissions/:id/confirm` — confirmação
- `POST /api/v1/commissions/:id/receive` — recebimento
- `POST /api/v1/commissions/:id/reverse` — estorno
- `POST /api/v1/commissions/:id/cancel` — cancelamento
- `GET/POST/PATCH /api/v1/commission-rules` — regras de cálculo

### BFF (Frontend)
- `/api/sales/[...path]` — proxy para backend
- `/api/contracts/[...path]` — proxy para backend
- `/api/commissions/[...path]` — proxy para backend
- `/api/commission-rules/[...path]` — proxy para backend

## 7. Frontend

| Rota | Descrição |
|---|---|
| `/dashboard/vendas` | Listagem com cards (KPIs), filtros, tabela |
| `/dashboard/vendas/[id]` | Detalhe completo: snapshot, status, documentos, contrato, comissões, timeline, gestão, auditoria |
| `/dashboard/comissoes` | Listagem com indicadores financeiros, filtros, tabela com destaque de divergência |

## 8. IA

- **Contexto**: `SALE` derive da rota `/dashboard/vendas/[id]`
- **Prompt**: `sale-summary` (read-only, sem cálculo financeiro)
- **Tools**: `getSaleContext`, `getCommissionContext`, `getMySalesPipeline`
- **Shortcuts no copiloto**: Resumo da venda, O que falta, Documentos, Divergência

## 9. Timeline e Carteira

- Eventos: `SALE_CREATED`, `SALE_STATUS_CHANGED`, `CONTRACT_CREATED`,
  `CONTRACT_STATUS_CHANGED`, `COMMISSION_CREATED`, `COMMISSION_STATUS_CHANGED`
- Agenda: bloco "Vendas aguardando documentos" com KPI
- Carteira: filtros `comVenda`, `emContratacao`, `contratada`,
  `vendaCancelada`; itens exibem dados da venda

## 10. Testes

| Tipo | Qtd | Arquivo |
|---|---|---|
| Unit (transições) | 8 | `test/sales-transitions.spec.ts` |
| Integração PG | 14 | `test/integration/sales.spec.ts` |
| Frontend | 5 | `test/sales-flow.spec.ts` |
| E2E Playwright | 5 | `tests/e2e/vendas.spec.ts` |

## 11. Validação

Para validar vendas no Chromium, execute `npm run e2e:sales`. O comando primeiro
gera o build e depois inicia o frontend standalone, sem compilação de desenvolvimento
durante os testes. Para reutilizar um build já validado, execute
`npx playwright test --config playwright.sales.config.ts`.

A configuração herda as proteções de banco do Playwright principal: backend
com `E2E_TEST=true`, banco local `larcarvalho_test`, portas 3100/3101 e
`reuseExistingServer=false`. No frontend, `E2E_TEST=false` seleciona o artefato
de produção `.next`; o backend continua obrigatoriamente isolado no banco de teste.
O provedor de IA é mock. Execute build, integração PostgreSQL e E2E em sequência.

- `npm run check`: prisma validate + lint (0 warnings) + typecheck +
  testes + build — **exit code 0**
- Migration aditiva: `20260913222946_fase26_venda_contrato_comissao`
- `tsc --noEmit` para os 3 pacotes: **0 erros**
