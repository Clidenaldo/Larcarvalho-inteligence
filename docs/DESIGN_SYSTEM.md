# Design System — Larcarvalho Intelligence

## Direção visual

A interface administrativa combina clareza operacional, confiança e tecnologia sem reproduzir a aparência de um banco tradicional. Light mode é a experiência principal: superfícies brancas, fundo cinza neutro, verde-petróleo como cor institucional (inspirada na marca CIMU, ajustada para contraste WCAG AA) e laranja queimado como destaque. Sombras são discretas e bordas definem a maior parte da hierarquia.

## Paleta

| Token            | Valor     | Uso                                  |
| ---------------- | --------- | ------------------------------------ |
| `background`     | `#f2f2f2` | Fundo geral da aplicação             |
| `surface`        | `#ffffff` | Cards, sidebar, header e formulários |
| `surface-subtle` | `#f8fafb` | Cabeçalhos e áreas secundárias       |
| `primary`        | `#34806b` | Ações principais e seleção (verde CIMU AA) |
| `primary-hover`  | `#2a6b58` | Hover de ações principais            |
| `primary-soft`   | `#e8f4f1` | Ícones e navegação ativa             |
| `secondary`      | `#000000` | Ações secundárias de destaque        |
| `accent`         | `#c05400` | Destaque (laranja CIMU AA)           |
| `muted`          | `#6b7280` | Texto auxiliar                       |
| `border`         | `#b7c2cb` | Divisores e contornos                |
| `text`           | `#000000` | Texto principal                      |
| `success`        | `#34806b` | Ativo, pronto e sucesso              |
| `warning`        | `#9a5b08` | Atenção e estado não confirmado      |
| `danger`         | `#b42335` | Erro e ação destrutiva               |
| `info`           | `#1263a5` | Informação e papéis                  |

A paleta mantém contraste WCAG AA (≥ 4.5:1) nos pares de texto usados no painel, validado no backend e na tela de Aparência. Os tokens estão em `apps/frontend/src/app/design-tokens.css`. Novas telas devem reutilizar esses valores antes de introduzir outra cor.

## Tipografia e forma

- Geist variável, carregada e self-hosted por `next/font`.
- Geist Mono está preparada para identificadores técnicos futuros.
- Pesos usados: regular, semibold e bold.
- Raios: 8, 12, 16 e 24 px.
- Sombras: uma elevação pequena para componentes comuns e uma média para overlays.
- Transição padrão: 150 ms; `prefers-reduced-motion` reduz animações.

## Layout e navegação

O segmento `/dashboard` possui layout protegido e shell persistente: sidebar de 272 px em desktop, header sticky, conteúdo limitado a 1600 px e drawer com overlay e fechamento por Escape em telas menores. Tabelas têm rolagem horizontal controlada no mobile.

A navegação recebe capabilities retornadas pelo backend. Itens de usuário dependem de `users.read`/`users.create`; itens de sistema são exibidos somente ao `SUPER_ADMIN`. Isso melhora a experiência, mas o backend permanece a autoridade de segurança.

## Componentes

- `Button`: primary, secondary, outline, ghost e danger; loading e disabled.
- `Field`, `Input` e `Select`: label, obrigatório, ajuda, erro e estados nativos.
- `Card`: superfície padrão sem sombra excessiva.
- `Badge`: neutral, info, success, warning e danger.
- `Alert`: feedback de informação, sucesso e erro com `aria-live`.
- `Modal`: usa `<dialog>`, foco nativo, Escape, título e descrição acessíveis.
- `EmptyState`, `Skeleton` e error boundary: vazio, carregamento e recuperação.
- `Pagination`: navegação por links e rótulos acessíveis.
- Tabela administrativa: sem data grid; cabeçalho, status, ações e overflow responsivo.

## Formulários

Labels são sempre visíveis. Campos obrigatórios usam indicador visual sem substituir `required`. Erros esperados aparecem em alerts; botões indicam processamento. Senhas usam inputs não controlados: permanecem apenas no DOM durante o preenchimento e o formulário é limpo após sucesso ou fechamento.

## Acessibilidade

- foco visível global e contraste direcionado a WCAG AA;
- navegação semântica, `aria-current` e nomes acessíveis;
- ícones decorativos com `aria-hidden`;
- feedback com `role=status` ou `role=alert`;
- modal nativo e drawer operável por teclado;
- suporte a redução de movimento;
- nenhum emoji como ícone principal.

## Responsividade

- mobile: navegação em drawer, header compacto e cards em uma coluna;
- tablet: cards em duas colunas e tabelas roláveis;
- notebook: sidebar fixa e conteúdo fluido;
- desktop amplo: grade de quatro cards e largura máxima controlada.

O E2E visual nas resoluções-alvo depende de um navegador conectado. Até lá, build responsivo, breakpoints e testes estruturais são a cobertura disponível.

## Formatação

`lib/formatters.ts` centraliza `Intl.DateTimeFormat` e `Intl.NumberFormat` para datas no fuso `America/Fortaleza`, números pt-BR, moeda BRL e porcentagens. Nenhuma biblioteca de formatação foi introduzida.
