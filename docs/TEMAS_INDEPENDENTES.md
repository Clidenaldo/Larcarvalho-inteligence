# Separação de temas — relatório de implementação

Data: 09/09/2026. Projeto: `C:\larcarvalho-intelligence`.

## Auditoria e arquitetura

1. **Arquitetura anterior:** Tailwind 4, `design-tokens.css` com tokens semânticos globais e componentes compartilhados. O tema público já tinha contrato Zod, JSON `public_theme`, endpoint público, escopo `.public-theme`, editor e três previews. O painel aplicava somente alguns campos escalares de `AppearanceConfiguration` no `AppShell`; sidebar, header, cards e tabelas não tinham configuração completa. A tela já possuía abas, mas a aba administrativa ainda usava o editor antigo. A restauração pública não possuía evento específico.
2. **Arquitetura nova:** um design system e um editor reutilizável, com dois contratos, dois JSONs e dois escopos independentes. Metadados de marca continuam no endpoint existente, em formulário separado dos editores de cores.
3. **PUBLIC_THEME:** mantém seus valores e consumidores existentes. O editor agora compartilha a infraestrutura com o administrativo, mas possui estado, presets, endpoint e reset próprios. O escopo público também redefine aliases que poderiam herdar cores administrativas em previews.
4. **ADMIN_THEME:** contrato completo com defaults extraídos do design system e do shell. Os layouts autenticados de `dashboard` e `(commercial)` buscam o tema administrativo sem cache. Quando o JSON não existe, os campos escalares antigos são convertidos em tema administrativo, preservando personalizações anteriores. Sem configuração alguma, usa os defaults originais.

## Contratos, persistência e segurança

5. **Contratos:** `AdminTheme`, `AdminThemeKey`, `UpdateAdminTheme`, `adminThemeSchema` e `updateAdminThemeSchema`; schemas estritos, somente cores `#RRGGBB`, patches não vazios. Defaults, campos, presets, adaptação da paleta anterior e contraste exportados por `@larcarvalho/shared`. O contrato público foi preservado; o preset principal recebeu o nome explícito “Larcarvalho Público”.
6. **Persistência:** reutiliza `appearance_configurations`. `public_theme` e `admin_theme` são colunas JSONB distintas. Nenhuma tabela genérica de settings existia. Gravações de ambos os temas usam transação com auditoria e o mesmo advisory lock, incluindo a criação inicial. Atualizar um tema não escreve o JSON do outro.
7. **Migration:** `20260909150000_independent_admin_theme`, exclusivamente `ADD COLUMN admin_theme JSONB`, nullable. Não reescreve paletas nem dados comerciais. Aplicação e status finais registrados abaixo.
8. **Endpoints backend:**

| Método    | Caminho                                 | Acesso e resultado                                                         |
| --------- | --------------------------------------- | -------------------------------------------------------------------------- |
| GET       | `/api/v1/public/theme`                  | Anônimo; somente contrato público; `no-store`                              |
| GET       | `/api/v1/appearance/public-theme`       | Permissão de configuração; somente tema público                            |
| PATCH     | `/api/v1/appearance/public-theme`       | Salva somente tema público                                                 |
| POST      | `/api/v1/appearance/public-theme/reset` | Restaura somente tema público                                              |
| GET       | `/api/v1/appearance/admin-theme`        | Autenticado; somente tema administrativo                                   |
| PATCH     | `/api/v1/appearance/admin-theme`        | Salva somente tema administrativo                                          |
| POST      | `/api/v1/appearance/admin-theme/reset`  | Restaura somente tema administrativo                                       |
| GET/PATCH | `/api/v1/appearance`                    | Endpoint anterior preservado; formulário de marca envia apenas nome e logo |

O BFF utiliza `/api/appearance/...` e reaproveita o proxy autenticado, encaminhando cookie e origem. O visitante não consulta o endpoint administrativo. Os dois temas são carregados com `cache: 'no-store'`; basta atualizar a página após salvar.

9. **RBAC:** mantém `commercial_config.update`, autenticação e validação de origem nas escritas. O serviço mantém a restrição adicional a `SUPER_ADMIN` e `ADMIN`, conforme a autorização existente; nenhum papel ganhou permissão de escrita. A leitura administrativa é autenticada para permitir que todos os usuários autorizados a entrar no painel renderizem sua identidade visual.
10. **Auditoria:** `PUBLIC_THEME_UPDATED`, `ADMIN_THEME_UPDATED`, `PUBLIC_THEME_RESET`, `ADMIN_THEME_RESET`. Registra ator, entidade, versão, campos alterados, cores anteriores/novas e metadados de requisição existentes. Nenhum segredo é registrado pelos eventos de tema. Reset é uma operação explícita; editar o rascunho após selecionar restauração transforma o salvamento em atualização normal.

## CSS, componentes e experiência

11. **Tokens:** `--public-*` e `--admin-*` são definidos apenas nos respectivos containers. Aliases `--color-*` permitem reaproveitar componentes, Tailwind e estilos semânticos. O CSS administrativo usa `@scope (.admin-theme) to (.public-theme, .admin-theme)`, encerrando a aplicação de regras ao encontrar outro escopo ou preview.
12. **Tokens públicos:** primary, secondary, accent, background, backgroundSecondary, surface, surfaceSubtle, text, textMuted, title, border, buttonPrimary, buttonPrimaryText, buttonSecondary, buttonSecondaryText, headerBackground, headerText, footerBackground, footerText, heroBackground, heroText, simulatorAccent, inputBackground, focus; além dos aliases contextuais já existentes do simulador.
13. **Tokens administrativos:** primary, secondary, accent, warning, background, surface, surfaceSubtle, text, textMuted, textSoft, border, borderStrong, sidebarBackground, sidebarText, sidebarActive, sidebarActiveBackground, headerBackground, headerText, cardBackground, cardBorder, tableHeaderBackground, tableHeaderText, buttonPrimary, buttonPrimaryText, inputBackground, focus. Chaves camelCase viram kebab-case no CSS. Aliases auxiliares preservam cores contextuais anteriores, inclusive neutros do Tailwind.
14. **Componentes públicos:** Landing `/`, `/simulador`, resultados, formulário de contato, header/footer públicos e `/privacidade` continuam sob `PublicThemeScope`. A lógica de simulação não foi alterada.
15. **Componentes administrativos:** `AppShell`, sidebar desktop/móvel, header, dashboard e todas as páginas dos layouts autenticados, incluindo CRM, comparador, tabelas comerciais, importações, formulários e configurações. `Card` ganhou um marcador semântico para aplicar os tokens de cards; cores específicas anteriores são preservadas enquanto os respectivos tokens permanecem no padrão.
16. **Previews:** público com Landing, Simulador e Resultado; administrativo com sidebar, header, dashboard, card, campo, botão e tabela. Cada rascunho altera somente seu preview. Trocar abas preserva os dois rascunhos. O editor administrativo também preserva a configuração de nome e logotipo.
17. **Presets:** público com Larcarvalho Público, Azul profissional, Verde, Claro, Personalizado e o Escuro já existente; administrativo com Larcarvalho Admin, Sóbrio, Escuro, Claro e Personalizado.
18. **Restauração e contraste:** cada restauração apresenta o padrão no preview e só persiste ao salvar. Os resets usam endpoints/eventos distintos. Os avisos de contraste são calculados independentemente, incluindo texto/fundo, campos, cards, botões e áreas específicas: hero/header/footer público; sidebar/item ativo/header/tabelas administrativo. Os avisos não bloqueiam cores escolhidas pelo administrador, conforme o comportamento anterior.

## Arquivos desta implementação

19. Arquivos criados ou editados, sem operações de Git:

| Área            | Arquivos                                                                                                                                                                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contratos       | `packages/shared/src/contracts/admin-theme.ts`, `packages/shared/src/contracts/public-theme.ts`, `packages/shared/src/index.ts`                                                                                                                                                      |
| Banco           | `database/prisma/schema.prisma`, `database/prisma/migrations/20260909150000_independent_admin_theme/migration.sql`                                                                                                                                                                   |
| Backend         | `apps/backend/src/modules/experience/experience.service.ts`, `experience.routes.ts`                                                                                                                                                                                                  |
| CSS             | `apps/frontend/src/app/admin-theme.css`, `public-theme.css`, `globals.css`                                                                                                                                                                                                           |
| Tokens frontend | `apps/frontend/src/lib/admin-theme.ts`                                                                                                                                                                                                                                               |
| Componentes     | `apps/frontend/src/components/admin-theme.tsx`, `admin-theme-manager.tsx`, `admin-theme-preview.tsx`, `color-theme-editor.tsx`, `public-theme-manager.tsx`, `appearance-settings.tsx`, `appearance-configuration-manager.tsx`, `app-shell.tsx`, `ui/card.tsx`                        |
| Layouts/tela    | `apps/frontend/src/app/dashboard/layout.tsx`, `apps/frontend/src/app/(commercial)/layout.tsx`, `apps/frontend/src/app/(commercial)/configuracoes/aparencia/page.tsx`                                                                                                                 |
| API frontend    | `apps/frontend/src/services/api/experience.ts`, `apps/frontend/src/app/api/appearance/admin-theme/route.ts`, `admin-theme/reset/route.ts`, `public-theme/reset/route.ts`                                                                                                             |
| Testes          | `packages/shared/test/admin-theme.spec.ts`, `apps/backend/test/independent-themes.spec.ts`, `apps/backend/test/integration/public-theme.spec.ts`, `apps/frontend/test/admin-theme.spec.tsx`, `tests/public-theme/independent-themes.spec.ts`, `tests/e2e/phase21-experience.spec.ts` |
| Relatório       | `docs/TEMAS_INDEPENDENTES.md`                                                                                                                                                                                                                                                        |

Prisma Client, outputs de build, cache de tipos e artefatos de teste são regenerados pelos comandos normais do projeto.

## Validação

20. **Testes adicionados/ampliados:** defaults dos dois temas; compatibilidade da paleta administrativa antiga; criação sem configuração; atualização e reset sem alterar o outro JSON; recarga em nova instância; validação de cores e contratos sem campos cruzados; RBAC no serviço e HTTP; origem confiável; endpoint público sem dados internos; quatro eventos de auditoria; renderização e proxy frontend; contraste separado. A integração PostgreSQL usa transação com rollback. E2E usa registros próprios no banco isolado e remove apenas suas fixtures.
21. **Verificação do visual padrão:** E2E compara cores computadas dos elementos do dashboard com a configuração anterior do shell. Os demais passos verificam previews, persistência após reload, Landing/Simulador, independência nos dois sentidos e sidebar móvel.
22. **Resultados dos comandos (10/09/2026):** `npm run check` aprovado: schema Prisma válido, ESLint sem warnings, TypeScript, 262 testes unitários (21 shared, 175 backend, 66 frontend) e builds de produção dos três workspaces. Integração `test/integration/public-theme.spec.ts` aprovada no PostgreSQL real, com rollback das fixtures.
23. **Migration e E2E:** banco principal e banco isolado de testes com as 19 migrations aplicadas, incluindo `20260909150000_independent_admin_theme`. A preparação do banco de testes concluiu sem migrations pendentes. Nesta máquina, Prisma falhou usando `localhost`; a verificação de status, a preparação e a integração passaram usando `127.0.0.1` em `TEST_DATABASE_URL` somente no ambiente do processo, sem editar `.env`. E2E em validação nesta retomada.
24. **Correção e entrega:** o script `scripts/prepare-integration-database.ps1` agora verifica `$LASTEXITCODE` após iniciar o container, consultar/criar o banco e aplicar migrations. A falha de migration antes mascarada como sucesso passou a retornar código 1; a execução bem-sucedida retornou 0. Nenhum commit/push solicitado ou realizado; `.env`, regras comerciais e relatórios `FASE_*` não foram modificados.

25. **Pend?ncias:** nenhuma pend?ncia funcional identificada no escopo validado. Para reproduzir a integra??o/E2E nesta m?quina, usar temporariamente `127.0.0.1` no host de `TEST_DATABASE_URL` do processo; o arquivo `.env` permanece intacto. Valida??o conclu?da em 10/09/2026.
