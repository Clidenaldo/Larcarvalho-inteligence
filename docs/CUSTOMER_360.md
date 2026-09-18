# Cliente 360° — Memória Comercial (Fase 22)

## 1. Decisão de modelo (auditoria, item 1)
- **Sem tabela Cliente**: o `Lead` já é a entidade central consolidada
  (contato, origem, status/pipeline real de 8 estágios, responsável,
  categoria, crédito, parcela, prazos, lance, observações, próximo contato,
  relações com interações, interesses, simulações e propostas).
- **Nova tabela `follow_ups`** (migration `add_customer_360_follow_ups`,
  aditiva): `lead_id`, `assigned_user_id`, `due_at`, `type`
  (CALL/WHATSAPP/EMAIL/MEETING/OTHER), `status`
  (PENDING/COMPLETED/CANCELED), `title`, `notes`, `completed_at`,
  `created_by_id`, timestamps, índices `(lead_id, due_at)` e
  `(assigned_user_id, status, due_at)`.
- **Lead += 3 colunas opcionais** (sem backfill; "Não informado" quando
  nulas): `objetivo`, `data_pretendida_aquisicao`, `restricoes`.
- Transferência usa `leads.assign` existente + auditoria `LEAD_ASSIGNED`
  (histórico preservado no auditLog; sem tabela nova).
- Sem probabilidade de fechamento, sem score secreto, sem escrita da IA.

## 2. Completude do perfil (determinística, soma 100)
| Campo | Peso |
|---|---|
| contato (telefone ou e-mail) | 15 |
| categoria de interesse | 10 |
| crédito desejado | 15 |
| parcela máxima | 15 |
| prazo (mínimo + máximo) | 10 |
| lance disponível | 10 |
| objetivo | 15 |
| data pretendida de aquisição | 10 |

## 3. Regras temporais explícitas
- Atrasado (follow-up): `PENDING + dueAt < agora` (calculado, nunca persistido).
- Sem contato recente: 7 dias sem interação (`STALE_CONTACT_DAYS = 7`),
  só para estágios não terminais.
- Próxima ação = FollowUp (sem duplicar `nextAction*`).

## 4. Matriz tool → permissão (reuso de `leads.*`, sem permissão nova)
| Operação | Permissão |
|---|---|
| follow-ups listar/ver | `leads.read_*` + escopo do lead pai |
| follow-up criar/concluir | `leads.add_interaction` + escopo |
| follow-up editar/cancelar | `leads.update_*` + escopo |
| carteira/timeline/360 | `leads.read_*` + escopo |
| transferência | `leads.assign` existente |
| IA 360 (`customer-360`) | `ai.lead_analysis` |
| IA follow-ups/carteira | `ai.lead_analysis` / `ai.manager_summary` |

## 5. Rotas
- Backend: `/api/v1/follow-ups` (CRUD + `POST /:id/status`),
  `/api/v1/portfolio` (`/summary`, `/follow-ups/my`, `/wallet`,
  `/leads/:id/timeline`, `/leads/:id/overview`).
- Frontend: `/dashboard/carteira`, `/dashboard/clientes/[id]`,
  BFF `/api/followups`, `/api/portfolio`.

## 6. Auditoria e analytics
- Ações auditadas: `FOLLOWUP_CREATED/UPDATED/COMPLETED/CANCELED`
  (entidade `FollowUp`); interações e transferências seguem `LEAD_*`.
- Sem eventos analytics novos: o módulo existente é de funil anônimo;
  a rastreabilidade operacional está no auditLog.

## 7. Testes
- `backend/test/customer-360.spec.ts` (11): pesos, atraso, CRUD,
  404 sem vazar, responsável inválido, operador negado, conclusão única,
  conflito de edição, merge 360, sem probabilidade.
- `frontend/test/customer-360.spec.tsx` (5): follow-up manager,
  timeline, estados vazios/erro.
- `tests/e2e/customer-360.spec.ts` (3): fluxo carteira→cliente→
  interação→follow-up→IA; bloqueio A/B (tela 404 + API); gestor equipe.
