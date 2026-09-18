# Ajuda contextual dos formulários

Implementação estática no frontend. Não cria endpoints, migrations, dados, regras comerciais ou permissões. Os contratos existentes continuam sendo a fonte da validação.

## Uso e comportamento

`apps/frontend/src/lib/form-help.ts` contém o catálogo tipado `FormHelpContent`: `title`, `description`, `howToFill`, `example`, `validation`, `impact`, `warning?` e `learnMoreUrl?`. `FormHelpKey` restringe as referências às chaves existentes. URLs adicionais passam por uma lista restrita à página interna `/ajuda` e suas âncoras; URLs externas, redirecionamentos e caminhos de API são rejeitados.

```tsx
<Field label="Nome" helpKey="product.name" required>
  <Input name="nome" required />
</Field>
```

`FieldHelp` usa o `Button` existente e um ícone com área de toque de 44 pixels. Clique, Enter ou Espaço abrem uma região nomeada, no fluxo do layout, sem sobrepor o campo. O conteúdo recebe foco e pode ser percorrido pelo teclado. Fechamento por botão ou Escape retorna ao acionador; clique/foco fora fecha sem tirar o foco do destino. Escape não fecha a janela de cadastro que contém a ajuda.

`Field` associa o rótulo ao primeiro input/select/textarea real, mesmo dentro de controles com botões de incremento. Preserva IDs, descrições de acessibilidade, valores, handlers e validações nativas; acrescenta a associação das mensagens de erro/orientação. O botão de ajuda fica fora do `label` e nunca submete o formulário. `HelpLabel` atende os layouts existentes de checkbox/radio; `FieldHelp` direto atende permissões e cores.

## Cobertura

O catálogo contém 166 ajudas tipadas. Foram adicionadas referências explícitas em 212 usos de `Field`, além dos controles personalizados e suas listas dinâmicas:

- Administradoras, produtos, grupos e cotas.
- Assembleias, lances e contemplações.
- Tabelas comerciais, itens/parcelas/taxas, regras versionadas e configuração comercial.
- Criação de simulação, seleção da origem comercial, cenários, criação e acompanhamento de propostas.
- CRM: criação de lead/cliente, contato, status, perda, interações, responsável e interesses.
- Integrações: conector, origem REST, autenticação por referência, demonstração e importação pronta.
- Importações: arquivo, aba, mapeamento de colunas e duplicidades; decisões de qualidade dos dados.
- Usuários, papéis, equipes, gestor, permissões individuais, perfil de vendedor, conta e troca de senha.
- Aparência: marca, presets, cores administrativas/públicas; preferências pessoais.
- Filtros relevantes de cadastros, propostas, CRM, comparação, qualidade, dashboard e analytics.

Busca textual simples, ações de salvar/cancelar/atualizar, favoritos e controles de demonstração nos previews não recebem ajuda redundante. Formulários públicos e login não receberam chaves de ajuda nesta etapa; continuam usando o componente compartilhado e suas validações. Não existe um cadastro separado de clientes: o vínculo atual é feito com leads.

Exemplos específicos: nome do produto (2–200 caracteres), código oficial do grupo, número da cota com zeros à esquerda, faixa coerente de crédito do grupo, distinção entre crédito contratado/líquido, lance próprio/embutido, taxas baseadas em fonte válida e nova versão da regra. Os lances históricos têm limite de 999.999999 no contrato de eventos, distinto do limite 100 nas regras comerciais. A ajuda da cota usa ATIVO/INATIVO/ENCERRADO/SUSPENSO/OUTRO; contemplação é um evento da assembleia. Não foram inventados campo de data de contemplação na cota nem crédito/prazo no cadastro de produto.

Não há campo de formulário existente identificado como pendente de ajuda neste escopo. Novos campos e novas regras exigem revisão do catálogo; não há fallback que invente explicações a partir do nome do campo. Mapeamentos e cores usam conteúdo compartilhado contextualizado pelo rótulo.

## Arquivos alterados

- Infraestrutura: `apps/frontend/src/components/ui/field.tsx`, novo `ui/field-help.tsx`, novo `apps/frontend/src/lib/form-help.ts`.
- Componentes em `apps/frontend/src/components/`: `administradoras-manager`, `operacional-manager`, `assembleias-manager`, `assembleia-events`, `tabelas-comerciais-manager`, `tabela-comercial-detail-manager`, `commercial-configuration-manager`, `simulation-create-form`, `simulation-detail`, `proposal-detail`, `lead-create-form`, `lead-detail-manager`, `integration-create-form`, `importacoes-wizard`, `data-quality-actions`, `users-manager`, `user-access-editor`, `teams-manager`, `my-account-manager`, `change-password-form`, `appearance-configuration-manager`, `color-theme-editor`, `comparador-results`, `dashboard-period-filter` e `analytics-dashboard` (arquivos `.tsx`).
- Páginas: `apps/frontend/src/app/dashboard/{administradoras,produtos,grupos,cotas,assembleias,tabelas-comerciais,comparador,crm,qualidade-dados,users}/page.tsx` e `apps/frontend/src/app/(commercial)/propostas/page.tsx`.
- Testes: novo `apps/frontend/test/field-help.spec.tsx`; dependências de teste em `apps/frontend/package.json` e `package-lock.json` (`jsdom`, React Testing Library e user-event). Não são dependências de produção.
- Documentação: este arquivo.

## Validação

Os testes exercitam abertura/fechamento, Escape, teclado e foco, clique fora, checkbox sem alteração acidental, conteúdo em produto/grupo/cota, preservação de formulário modal, validação obrigatória, payload e erro da API simulada, contratos existentes e links seguros. Não acessam banco nem criam usuários; o `fetch` de envio é simulado.

Resultados: `npm run lint` aprovado; `npm run typecheck` aprovado nos três workspaces; `npm run test --workspace @larcarvalho/frontend -- --no-file-parallelism` aprovado com **77 testes em 20 arquivos**, incluindo **11 testes novos** de ajuda; `npm run build --workspace @larcarvalho/frontend` aprovado, com 36 páginas estáticas geradas. O teste inicial de interação excedeu o limite de 5 segundos nesta máquina; o limite local foi ajustado para 15 segundos e a suíte completa passou. Os testes de DOM usam jsdom; não constituem uma inspeção visual em dispositivo físico ou um E2E com banco.
