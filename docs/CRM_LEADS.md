# CRM e Leads — Fase 14

## Modelo e finalidade

O CRM registra interesse comercial e atendimento humano. `Lead` contém identificação mínima, perfil, origem, status, responsável, acompanhamento e consentimento; `LeadInteresse` relaciona vários grupos e preserva o índice/cobertura apresentados; `LeadInteracao` é a timeline manual e imutável. Não há exclusão física normal.

Nome é reduzido a espaços simples (2–120 caracteres), telefone brasileiro é armazenado somente com dígitos, DDI 55, DDD e número, e e-mail é `trim` + lowercase. Nome igual não caracteriza duplicidade.

## Origem, funil e transições

Origens: `SIMULADOR_PUBLICO`, `CADASTRO_MANUAL`, `WHATSAPP`, `INDICACAO`, `OUTRO`. As duas primeiras funcionam nesta fase.

Fluxo principal: `NOVO → EM_ATENDIMENTO → CONTATO_REALIZADO → QUALIFICADO → PROPOSTA → NEGOCIACAO → CONVERTIDO`. Etapas intermediárias admitem o recuo operacional documentado no código e perda. `PERDIDO` exige motivo controlado; `OUTRO` exige descrição. Reabertura é somente `PERDIDO → EM_ATENDIMENTO` e é auditada. `CONVERTIDO` é terminal, registra timestamp e pode relacionar grupo, mas não cria contrato financeiro.

## Duplicidade e captura pública

`POST /api/v1/public/leads` exige nome, telefone ou e-mail, consentimento específico e versão `2026-09-02.v1`. Possui schema estrito, limite de dez tentativas por IP/dez minutos e honeypot `website`. Honeypot preenchido recebe a mesma resposta genérica sem persistência.

Quando os contatos normalizados apontam deterministicamente para um único lead, uma nova interação e o interesse são agregados. Contatos que apontem para pessoas diferentes criam outro lead para evitar associação indevida. Não há `UNIQUE` global em telefone/e-mail. Sucesso novo, repetido e honeypot sempre responde `202` sem ID ou indicação de cadastro existente.

O contexto preservado inclui perfil do simulador, grupo, índice, cobertura e `capturadoEm`. Esses números representam o que o navegador enviou como apresentado naquele momento, são validados entre 0 e 100 e não são recalculados retroativamente. Não substituem `GrupoHistorico` nem o índice atual.

## Interesses, interações e acompanhamento

Um lead aceita vários grupos, mas o índice parcial PostgreSQL garante no máximo um `principal=true`. A combinação lead/grupo é única. Interações manuais aceitam nota, ligação, WhatsApp, e-mail, reunião e outro; mudanças de status geram interação `STATUS`. Não existem endpoints de edição ou exclusão da timeline.

`proximoContatoEm < agora`, exceto convertido/perdido, significa atrasado. “Hoje” é calculado em `America/Fortaleza` e timestamps são `TIMESTAMPTZ(3)`.

## Responsável, RBAC e IDOR

- `VENDEDOR`: lê e altera apenas leads atribuídos a si; criação manual é autoatribuída a ele.
- `GESTOR`: lê e altera leads da própria equipe (escopo `TEAM`: mesmo `teamId` do gestor ou equipes que ele gerencia), cria, atribui/reatribui dentro do escopo e registra interações.
- `ADMIN`, `SUPER_ADMIN`: leem todos (escopo `ALL`), criam, atribuem/reatribuem, alteram e registram interações.
- `OPERADOR`: sem acesso comercial.

Responsáveis precisam estar ativos e ter papel `VENDEDOR`, `GESTOR`, `ADMIN` ou `SUPER_ADMIN`. Lead pode permanecer não atribuído. O escopo é reaplicado em cada leitura/mutação; UUID de outra carteira retorna 404. `PATCH /leads/:id` não aceita status, responsável, role ou campos internos. Alterações podem enviar `expectedUpdatedAt` para detectar concorrência com 409.

## API administrativa

- `GET/POST /api/v1/leads`
- `GET/PATCH /api/v1/leads/:id`
- `POST /api/v1/leads/:id/assign`
- `POST /api/v1/leads/:id/status`
- `POST /api/v1/leads/:id/interacoes`
- `POST/DELETE /api/v1/leads/:id/interesses[/:interestId]`
- `PATCH /api/v1/leads/:id/proximo-contato`

A listagem é paginada no PostgreSQL e filtra status, responsável, origem, categoria, período, próximo contato, atrasados, não atribuídos e busca simples por nome/telefone/e-mail. Ordenação usa whitelist.

## Auditoria, LGPD e segurança

Criação, atribuição, contato, status, interação, próximo contato, interesse, conversão, perda e reabertura são auditados na mesma transação da mudança. AuditLog recebe IDs, ação e metadata mínima; notas, telefone e e-mail não são copiados. Logs operacionais não recebem PII completa, IP nem user-agent são persistidos no lead.

O consentimento é apenas para contato sobre a solicitação, não para marketing genérico. A URL da Política de Privacidade é opcional por `PUBLIC_PRIVACY_POLICY_URL`; nenhuma URL foi inventada. A organização deve definir retenção e procedimentos jurídicos para acesso, correção, anonimização e eliminação antes da produção ampla.

## Frontend e limites

O simulador abre formulário curto somente após ação explícita. O CRM em `/dashboard/crm` oferece resumo factual, filtros, lista e funil por cards; `/dashboard/crm/leads/:id` oferece contato manual, status, atribuição, próximo contato, interesses e timeline. WhatsApp apenas abre `wa.me` e e-mail apenas `mailto:`.

Sem chatbot, disparos, campanhas, integração externa, previsão, probabilidade, score, IA ou machine learning. Rate limit é process-local; armazenamento distribuído será necessário com múltiplas réplicas. A captura de índice público não possui assinatura criptográfica nesta fase.

## Performance

Teste de volume cobre 500 leads. Um `EXPLAIN (ANALYZE, BUFFERS)` com 1.000 leads temporários e rollback mediu: listagem geral 0,306 ms; carteira 0,235 ms; atrasados 0,186 ms; não atribuídos 0,488 ms. Carteira/não atribuídos usaram `leads_responsavel_id_status_idx`; scans sequenciais nos demais casos foram adequados ao volume reduzido. Reavaliar com distribuição de produção.
Leads públicos preservam a atribuição first-touch da sessão analytics
(UTM/referrer sanitizados) em campos próprios, sem misturar com `origem`.
