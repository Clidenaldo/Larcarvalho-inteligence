# Arquitetura

## Tabelas comerciais

O módulo `tabelas-comerciais` separa rotas Fastify, serviço de aplicação e repository Prisma, com contratos em `packages/shared`, BFF Next.js e páginas administrativas server-side com ilhas client-side para comandos. Tabelas e itens são um bounded context comercial independente de grupos e cotas. Consultas e paginação são executadas no PostgreSQL; alterações e auditoria compartilham transação. O importador central foi estendido, sem criar pipeline paralelo.

Simulador e Comparador permanecem inalterados. Uma evolução futura poderá selecionar uma versão vigente e seus itens por critérios objetivos para complementar, nunca substituir, os dados de grupos. Essa consulta não deverá converter condição comercial em probabilidade ou garantia de contemplação.

## Integrações com administradoras

A Fase 15 introduz connectors tipados, runs isoladas, logs sanitizados e mapeamento externo centralizado. O REST connector possui proteção SSRF e allowlist; arquivos manuais convergem para o importador existente. Connectors sem documentação real permanecem `NAO_CONFIGURADA`. Consulte [INTEGRATIONS.md](INTEGRATIONS.md).

## Simulador público

`simulador-publico` é um módulo isolado, read-only e sem autenticação. Seu service reutiliza a consulta em lote do comparador e as funções puras do Índice de Aderência, mapeia um DTO público restrito, ordena o conjunto limitado e só então pagina. A rota aplica rate limit e registra métricas agregadas de duração.

O navegador oficial acessa diretamente `/api/v1/public/simulador`, mantendo CORS e rate limit por IP no Fastify/Nginx. Um BFF público equivalente permanece disponível para topologias que precisem de proxy. Nenhuma API administrativa perdeu seus guards.

## Índice de Aderência

O módulo `indice-aderencia` contém funções puras Decimal, configuração central de pesos, serviço de aplicação e rota. O serviço reutiliza em lote o DTO normalizado do comparador e não executa query por componente ou grupo. Ausências reduzem o peso avaliável; o resultado só é publicado a partir de 40% de cobertura.

O frontend preserva o comparador factual e solicita aderência apenas por ação explícita. Resultados não são persistidos nem auditados como eventos de domínio. Fórmula, classificação e disclaimer permanecem exclusivamente no backend e nos contratos compartilhados.

## Comparador factual

O módulo `comparador` separa repository, composição do DTO e rotas. Uma query PostgreSQL em lote aplica filtros, paginação e ordenação por whitelist, seleciona o snapshot mais recente com `JOIN LATERAL` e agrega cotas e qualidade sem N+1. O serviço calcula compatibilidades exatas com `Prisma.Decimal` e produz motivos determinísticos. A busca e a comparação reutilizam o mesmo DTO compartilhado.

O módulo é somente leitura e não possui modelo persistente. O Next.js usa BFF e páginas server-side, com uma pequena ilha client-side para limitar a seleção a quatro grupos. A saída permanece neutra: não há score, ranking, recomendação ou previsão.

## Consolidação histórica

O módulo `grupo-historico` separa cálculos Decimal, repository, serviço transacional e rotas. A consolidação usa isolamento `RepeatableRead`, filtros temporais no PostgreSQL e um conjunto fixo de agregações sem N+1. A mediana carrega no máximo dois Decimals centrais. Persistência e `AuditLog` são atômicos; a chave de idempotência é protegida também por constraint.

O frontend consulta contratos compactos por BFF. Gráficos SVG não dependem de biblioteca externa e sempre possuem resumo e tabela equivalentes. O estado operacional de `Grupo` nunca é sobrescrito por um snapshot.

## Qualidade dos dados

O módulo `data-quality` separa regras puras, serviço de aplicação e rotas Fastify. A listagem e os contadores são calculados no PostgreSQL; o contexto relacionado é carregado em lotes para evitar N+1. O scanner manual lê entidades em lotes de 500, usa chave determinística para idempotência e registra seu ciclo no `AuditLog`. O Next.js mantém páginas server-side e pequenas ilhas client-side apenas para comandos de workflow e varredura.

O módulo observa dados operacionais, mas não altera automaticamente administradoras, produtos, grupos, cotas ou registros históricos. Somente uma inconsistência de origem `VALIDACAO_INTERNA` pode ser encerrada automaticamente quando a revalidação prova que deixou de existir.

## Importador

O BFF transmite multipart, o backend usa arquivo temporário privado e o PostgreSQL persiste estado. Parsing, normalização, referências e classificação precedem a escrita. Execução síncrona é reivindicada por update condicional e usa lotes transacionais de 200; fila/storage compartilhado dependem de escala real.

## Objetivo

Fornecer uma base modular, segura e implantável sem antecipar regras de consórcio, contratos de administradoras ou entidades ainda não confirmadas.

## Organização

```text
larcarvalho-intelligence/
├── apps/
│   ├── frontend/       # Next.js; BFF e interface administrativa
│   └── backend/        # Fastify; API v1 e módulos de domínio
├── packages/
│   └── shared/         # Contratos técnicos compartilhados e validados
├── database/           # Schema Prisma e migrations controladas
├── docker/             # Imagens, Compose e configuração Nginx
├── docs/               # Decisões e procedimentos
├── scripts/            # Automação local segura
├── tests/              # Reserva para E2E e contratos
├── eslint.config.mjs
├── tsconfig.base.json
└── package.json        # Workspaces e comandos comuns
```

## Arquitetura recomendada

### Frontend

Next.js com App Router, React e TypeScript estrito. O navegador usa route handlers do próprio Next.js como BFF para identidade e usuários. O layout de `/dashboard` valida a sessão no servidor antes de renderizar e mantém um shell responsivo persistente; não há token em estado React ou Web Storage. Componentes interativos são ilhas client-side pequenas dentro de páginas e layouts server-side.

### Backend

Fastify com TypeScript separado em configuração, núcleo, plugins e rotas. `buildApp()` configura a aplicação sem abrir porta; `server.ts` cuida apenas do ciclo do processo. Rotas de domínio futuras ficarão em `modules/`, isolando HTTP, casos de uso, regras e adaptadores. O tratamento de erros é centralizado e os logs são JSON estruturados, com cabeçalhos sensíveis redigidos.

Os módulos `auth`, `identity` e `users` implementam identidade. `administradoras` possui rota, serviço e repositório próprios; cria, atualiza e altera status junto ao `AuditLog` na mesma transação. O contexto `request.auth` e guards reutilizáveis centralizam autenticação e capacidades. Produtos, grupos, scraping e integrações permanecem fora do escopo.

Os módulos históricos `assembleias`, `lances` e `contemplacoes` possuem repositórios e serviços específicos. Consultas relacionais e por período são executadas no PostgreSQL; regras entre assembleia, grupo e cota permanecem na camada de serviço. Nenhum cálculo preditivo faz parte desse fluxo.

### Dados

PostgreSQL é o banco principal e Prisma 7.10 fornece schema, migration e Client tipado. O adapter `pg` usa pool único por processo; a aplicação desconecta o Client no encerramento. O acesso permanece em `infrastructure/database`, sem repository genérico. Módulos futuros criarão repositories específicos quando houver casos de uso reais.

O modelo futuro deve considerar, após validação:

- chaves e restrições no banco, além da validação da aplicação;
- índices baseados em consultas reais;
- migrations imutáveis e revisão de rollback;
- trilha de auditoria para mudanças sensíveis;
- retenção e anonimização alinhadas à LGPD;
- seeds exclusivamente sintéticos fora de produção;
- transações e idempotência nas integrações.

### Infraestrutura

Para desenvolvimento, Docker Compose poderá executar aplicações e PostgreSQL. O banco está sob o profile `database` e exige senha fornecida por `.env`, evitando credencial embutida. Em produção, Nginx ficará na borda, TLS será automatizado e aplicações rodarão como contêineres sem privilégio.

Para uma única VPS, começar com um monólito modular é mais simples e operacionalmente seguro que microsserviços. Filas, cache, object storage e serviços separados só devem ser introduzidos quando carga ou requisitos comprovarem necessidade.

## Fluxo futuro

```text
Navegador -> Nginx/TLS -> Next.js/BFF -> Fastify /api/v1 -> PostgreSQL
                  cookie HttpOnly              |             users/sessions
                                               -> integrações futuras aprovadas
```

## Contratos e observabilidade

- API técnica versionada em `/api/v1`; contratos de domínio só serão adicionados após aprovação.
- `packages/shared` publica schemas Zod de health, readiness e erros. Não compartilha entidades de banco ou configuração do servidor.
- OpenAPI gerado a partir de schemas validados quando houver endpoints reais.
- Request ID UUID por requisição, logs JSON e redaction de cabeçalhos sensíveis já estão ativos. Métricas e alertas permanecem futuros.
- O healthcheck confirma apenas que o processo está vivo. O readiness executa um `SELECT 1` no PostgreSQL quando `DATABASE_URL` está configurada; em testes, o probe pode ser injetado sem depender de banco externo.

## Testes

- Unitários para regras e casos de uso.
- Integração para adaptadores, banco e contratos HTTP.
- API com injeção Fastify sem abrir portas quando possível.
- End-to-end somente para jornadas críticas estabilizadas.
- Testes de segurança e recuperação antes da entrada em produção.

## Decisões adiadas conscientemente

Refinamentos do modelo com regras oficiais, provedor de autenticação, RBAC/ABAC, storage de documentos, mensageria, cache, conectores de administradoras, CI/CD e plataforma de observabilidade dependem de requisitos ainda não fornecidos.

## CRM comercial

O domínio `leads` usa contratos compartilhados, `LeadsService`, Prisma/PostgreSQL, rotas públicas isoladas e rotas administrativas autenticadas. O BFF `/api/leads` repassa sessão/origem; o formulário público chama a API pública diretamente para preservar o IP do rate limit. Veja [CRM_LEADS.md](CRM_LEADS.md).
Analytics first-party é persistido em PostgreSQL (`analytics_sessions` e
`analytics_events`) e agregado no banco para o dashboard protegido por RBAC.
