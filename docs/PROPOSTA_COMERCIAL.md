# Proposta Comercial Inteligente (Fase 24)

## 1. Decisão de modelo (auditoria, item 1)
- **Reutilizado sem reimplementar**: `Proposal`/`ProposalItem`/
  `ProposalStatusHistory`, snapshot JsonB (simulação + configuração +
  resultados), `version`, `validUntil`, `issuedAt`, transições,
  `generatePdf` (pdf-lib, marca, número+versão, validade, disclaimer
  anti-contemplação), auditoria `PROPOSAL_*`, permissões `proposals.*`,
  limite de 3 resultados, editor e lista existentes.
- **Sem link público** (não existia; não criado — exige proposta técnica
  de segurança antes).
- **Nova tabela? Não**: abordagem B — `parentId` auto-FK nullable em
  `Proposal` (+ índice). Propostas antigas têm `parentId` nulo e seguem
  abrindo normalmente.

## 2. Versionamento (cadeia linear)
- Editável somente se `DRAFT + issuedAt nulo + sem versões derivadas`.
  Depois de apresentada: só nova versão (`POST /:id/versions`).
- Nova versão = nova linha (novo número único), `version+1`, snapshot e
  itens copiados integralmente, `validUntil` recalculado, status DRAFT,
  auditoria `PROPOSAL_VERSION_CREATED`. Linearidade forçada (409 se já
  existir derivada). `GET /:id/versions` retorna a cadeia raiz→atual.

## 3. Status e canais
- Enums existentes preservados (DRAFT→GENERATED→SENT→…); "apresentada"
  = SENT com `reason` no formato `Canal: <canal> — <observação>` (data,
  usuário e canal ficam no histórico). Aceite/rejeição só por usuário
  autorizado; sem aceite = venda (Fase 25).

## 4. PDF histórico
- Gera sempre do snapshot da versão (nunca dados atuais); regeneração
  produz o mesmo conteúdo; cabeçalho com número + versão + emissão +
  validade + disclaimer.

## 5. Matriz (reuso, sem permissão nova)
- Ler: `proposals.read_*` + escopo; criar versão: `proposals.create`;
  editar: `proposals.update_*`; PDF: `proposals.export`; IA:
  prompts/ferramentas existentes (`commercial-copilot`,
  `comparison-analysis`, `follow-up-draft`).

## 6. Testes
- `backend/test/proposals-smart.spec.ts` (10): limite 3, snapshot
  imutável, edição bloqueada pós-apresentação, versão linear,
  transições, isolamento, PDF determinístico.
- `frontend/test/proposal-smart.spec.tsx` (5): editor, versão,
  follow-up sugerido, histórico.
- `tests/e2e/proposal.spec.ts` (3): fluxo completo, isolamento,
  gestor. Fixture SQL isolada com tearDown (inclui cadeia de
  simulações).
