# Agenda Comercial Inteligente (Fase 23)

## 1. Regras operacionais determinísticas (sem score oculto)
| Regra | Definição |
|---|---|
| FOLLOWUP_OVERDUE | `PENDING + dueAt < agora` |
| FOLLOWUP_TODAY | `PENDING + dueAt` dentro do dia (fuso America/Fortaleza) |
| FOLLOWUP_UPCOMING | `PENDING + dueAt` em (amanhã, hoje+`days`] (`days` 1–30, padrão 7) |
| PROPOSAL_NO_FOLLOWUP | proposta GENERATED/SENT/VIEWED + lead sem follow-up PENDING |
| NO_NEXT_ACTION | lead em estágio não terminal + nenhum follow-up PENDING |
| STALE_CONTACT | estágio não terminal + nenhuma interação há 7 dias (`STALE_CONTACT_DAYS`) |

Estágios terminais (CONVERTIDO/PERDIDO) nunca geram NO_NEXT_ACTION nem
STALE automaticamente; follow-ups explícitos continuam valendo.

## 2. Prioridade operacional (documentada, explicável, não probabilística)
1. atrasados · 2. vencem hoje · 3. proposta sem retorno · 4. sem próxima
ação · 5. contato desatualizado · 6. demais próximos. Cada item exibe
"Por que está aqui?" com o motivo factual.

## 3. Reagendamento rápido
"Hoje mais tarde" = agora + 4h (após 18h de Fortaleza, amanhã 09h);
"Amanhã/+2/+7" às 09h; data livre. Cada opção exige clique explícito;
conflito responde 409 (trava otimista).

## 4. Ação assistida (sugestão → revisão → confirmação → ação)
A IA anexa `suggestedAction` determinístico (hoje: só `CREATE_FOLLOWUP`
com `leadId` + `dueAt` +3 dias). O frontend exibe [Aplicar sugestão],
o usuário revisa/edita e confirma; a criação usa o endpoint normal
(auditoria padrão `FOLLOWUP_CREATED`). A IA nunca escreve sozinha.

## 5. Matriz de permissão (reuso, sem permissão nova)
Agenda/timeline/carteira: `leads.read_*` + escopo do lead pai.
Concluir: `leads.add_interaction`. Reagendar/editar: `leads.update_*`.
IA: `my-day`→`ai.lead_analysis`, mensagem→`ai.draft_messages`.

## 6. Limites
Blocos limitados (200 por bloco) + totais reais; ordenações calculadas da
carteira limitadas a 500 linhas. Sem push/e-mail/WhatsApp automáticos.
Sem notification center: badge na navegação (atrasados + hoje).
Fuso "hoje": America/Fortaleza, com testes na virada (23:59/00:01).
