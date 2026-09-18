# Tema público

A configuração da área pública fica em **Configurações → Aparência → Área pública**. A área administrativa mantém o formulário e as cores anteriores. As cores de contraste insuficiente continuam permitidas; os indicadores são orientativos.

## Persistência e autorização

- `AppearanceConfiguration.publicTheme` é um JSONB opcional na tabela existente. A migration `20260909090000_public_theme` só adiciona a coluna. Não altera registros existentes nem cores administrativas.
- Uma configuração pública ausente usa `publicThemeDefaults`, independente da paleta administrativa.
- `GET /api/v1/public/theme` é anônimo, somente leitura, `no-store`, e devolve exclusivamente o contrato de cores. Não inicializa registros no banco.
- `GET/PATCH /api/v1/appearance/public-theme` usam autenticação e a permissão existente `commercial_config.update`. A escrita também verifica ADMIN/SUPER_ADMIN no serviço, valida Zod e usa transação com auditoria `PUBLIC_THEME_UPDATED` (ator, campos alterados, paletas anterior/nova, versão e data).
- O BFF `/api/appearance/public-theme` encaminha cookies e origem ao backend. O carregamento das páginas públicas não encaminha cookies.
- A escrita do tema público não altera `primaryColor` e demais campos do painel; a escrita administrativa não altera `publicTheme`.

## Tokens e componentes

`PublicThemeScope` aplica variáveis apenas ao seu contêiner. `/`, `/simulador` e `/privacidade` carregam o tema no servidor com `cache: no-store`. Indisponibilidade da leitura pública usa a paleta padrão; a tela administrativa apresenta falhas de salvamento, sem anunciar sucesso indevido.

Tokens editáveis, todos restritos a `#RRGGBB`:

- `--public-primary`, `--public-secondary`, `--public-accent`;
- `--public-background`, `--public-background-secondary`, `--public-surface`, `--public-surface-subtle`;
- `--public-text`, `--public-text-muted`, `--public-title`, `--public-border`;
- `--public-button-primary`, `--public-button-primary-text`, `--public-button-secondary`, `--public-button-secondary-text`;
- `--public-header-background`, `--public-header-text`, `--public-footer-background`, `--public-footer-text`;
- `--public-hero-background`, `--public-hero-text`, `--public-simulator-accent`, `--public-input-background`, `--public-focus`.

As variáveis semânticas existentes são mapeadas dentro de `.public-theme`. Landing, formulário inicial, simulador, cards de resultados e formulário de lead usam esse escopo. O botão compartilhado recebe apenas um atributo de variante para estilização pública; seu comportamento administrativo permanece igual. Cores e textos dos estados críticos permanecem no design system.

O header transparente e footer claro originais do simulador são preservados quando os valores correspondem ao padrão. Ao personalizar esses campos, o simulador usa as cores configuradas. Isso evita transformar o header/footer original do simulador nos blocos verde/preto da Landing ao instalar a migration.

## Edição e preview

- Presets: Larcarvalho, Azul profissional, Verde, Escuro e Claro; edição manual indica Personalizado.
- HEX e seletor visual alimentam estado local, sem chamadas de persistência.
- Previews de Landing Page, Simulador e Resultado usam os mesmos tokens. Os valores de oferta são ilustrativos e não executam o motor comercial.
- Restaurar cores padrão exige confirmação, altera apenas o rascunho e exige **Salvar alterações** para publicação.
- As verificações de contraste cobrem texto/fundo, cards, botões, header, footer, hero, campos e títulos. Nenhuma cor é corrigida automaticamente.
- Atualizar uma página pública após salvar consulta os valores persistidos. O tema não depende de memória do processo ou armazenamento do navegador.

## Validação

Testes de contrato: `packages/shared/test/public-theme.spec.ts`.

Serviço e HTTP/RBAC: `apps/backend/test/public-theme.spec.ts`.

Frontend/BFF/renderização: `apps/frontend/test/public-theme.spec.tsx`.

Integração real no PostgreSQL: `apps/backend/test/integration/public-theme.spec.ts`. A massa é criada dentro de uma transação e revertida integralmente ao final, sem limpar tabelas.

E2E: `npx playwright test --config playwright.public-theme.config.ts`. Usa exclusivamente `larcarvalho_test` local, portas 3100/3101 e diretório Next isolado dentro de `.next`. Cria IDs exclusivos para usuário, aparência e oferta; remove somente esses registros ao terminar. Não usa os hooks globais de limpeza do E2E antigo. Valida login, preview sem persistência, salvar/recarregar, Landing, simulador, resultado de plano sem produto, formulário de contato, mobile e restauração.

## Arquivos de implementação

- `packages/shared/src/contracts/public-theme.ts`, `packages/shared/src/index.ts`
- `database/prisma/schema.prisma`, `database/prisma/migrations/20260909090000_public_theme/migration.sql`
- `apps/backend/src/modules/experience/experience.service.ts`, `experience.routes.ts`, `apps/backend/src/app.ts`
- `apps/frontend/src/services/api/public-theme.ts`, `experience.ts`
- `apps/frontend/src/lib/public-theme.ts`
- `apps/frontend/src/components/public-theme.tsx`, `public-theme-manager.tsx`, `public-theme-preview.tsx`, `appearance-settings.tsx`
- `apps/frontend/src/components/public-landing.tsx`, `simulador-publico.tsx`, `lead-contact-form.tsx`, `ui/button.tsx`
- `apps/frontend/src/app/public-theme.css`, `globals.css`, `page.tsx`, `simulador/page.tsx`, `privacidade/page.tsx`
- `apps/frontend/src/app/(commercial)/configuracoes/aparencia/page.tsx`, `apps/frontend/src/app/api/appearance/public-theme/route.ts`
- `apps/frontend/next.config.ts`, `playwright.public-theme.config.ts`, testes citados acima e `tests/public-theme/public-theme.spec.ts`

Logo, banner, canais sociais e textos institucionais ficam para evolução posterior. O contrato público é separado para permitir acrescentar esses recursos com validação explícita, sem expor a configuração administrativa.
