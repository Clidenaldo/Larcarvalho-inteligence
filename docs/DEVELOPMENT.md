# Desenvolvimento

## Preparação da máquina

1. Disponibilize Git 2.x no PATH e confirme com `git --version`. O Git embutido no GitHub Desktop permitiu inicializar este repositório, mas não está exposto no terminal atual.
2. Mantenha Docker Desktop e WSL 2 ativos para usar o PostgreSQL local.
3. Use Node.js 24.x e npm 11.x, conforme `.node-version` e `package.json`.
4. Não altere políticas globais ou PATH sem revisar a auditoria.

## Primeiro uso

```powershell
Set-Location C:\larcarvalho-intelligence
Copy-Item .env.example .env
npm install
npm run check
```

Se o npm retornar `UNABLE_TO_VERIFY_LEAF_SIGNATURE` nesta rede, habilite as CAs confiáveis do Windows somente na sessão antes de repetir o comando:

```powershell
$env:NODE_OPTIONS = '--use-system-ca'
```

Não desabilite `strict-ssl`.

O backend e o frontend funcionam sem banco nesta etapa. Para desenvolvimento simultâneo:

```powershell
npm run dev
```

Também é possível iniciar separadamente:

```powershell
npm run dev:backend
npm run dev:frontend
```

O frontend consulta `GET /api/v1/health` no backend durante a renderização da página inicial. Se o backend estiver parado, a página continua disponível e mostra o estado indisponível.

## Variáveis de ambiente

| Variável                                | Padrão local            | Uso                                              |
| --------------------------------------- | ----------------------- | ------------------------------------------------ |
| `BACKEND_HOST`                          | `0.0.0.0`               | Interface HTTP do Fastify.                       |
| `BACKEND_PORT`                          | `3001`                  | Porta do Fastify.                                |
| `FRONTEND_URL`                          | `http://localhost:3000` | Único origin aceito pelo CORS.                   |
| `BACKEND_INTERNAL_URL`                  | `http://localhost:3001` | URL usada pelo Next.js no servidor.              |
| `NEXT_PUBLIC_API_BASE_URL`              | `http://localhost:3001` | URL pública reservada para clientes futuros.     |
| `API_TIMEOUT_MS`                        | `3000`                  | Timeout do cliente HTTP do frontend.             |
| `LOG_LEVEL`                             | `info`                  | Nível mínimo do Pino.                            |
| `REQUEST_BODY_LIMIT_BYTES`              | `1048576`               | Limite de corpo recebido pelo backend.           |
| `REQUEST_TIMEOUT_MS`                    | `10000`                 | Timeout de requisição do Fastify.                |
| `DATABASE_URL`                          | sem padrão              | URL PostgreSQL; obrigatória para persistência.   |
| `TEST_DATABASE_URL`                     | sem padrão              | URL exclusiva de `larcarvalho_test`.             |
| `DATABASE_CONNECTION_TIMEOUT_MS`        | `3000`                  | Timeout de conexão do pool em milissegundos.     |
| `DATABASE_POOL_MAX`                     | `10`                    | Máximo de conexões por processo backend.         |
| `AUTH_SESSION_TTL_HOURS`                | `12`                    | Duração absoluta da sessão, de 1 a 168 horas.    |
| `AUTH_LOGIN_RATE_LIMIT_MAX`             | `5`                     | Tentativas por janela e IP.                      |
| `AUTH_LOGIN_RATE_LIMIT_WINDOW_MS`       | `60000`                 | Janela do rate limit em milissegundos.           |
| `PUBLIC_SIMULATOR_CANDIDATE_LIMIT`      | `100`                   | Máximo de candidatos avaliados por simulação.    |
| `PUBLIC_SIMULATOR_RATE_LIMIT_MAX`       | `30`                    | Simulações públicas por IP e janela.             |
| `PUBLIC_SIMULATOR_RATE_LIMIT_WINDOW_MS` | `600000`                | Janela pública em milissegundos.                 |
| `PUBLIC_SIMULATOR_TIMEOUT_MS`           | `5000`                  | Tempo máximo lógico da simulação.                |
| `PUBLIC_WHATSAPP_NUMBER`                | vazio                   | Número opcional, somente dígitos com DDI/DDD.    |
| `PUBLIC_PRIVACY_POLICY_URL`             | vazio                   | URL opcional da política de privacidade.         |
| `PUBLIC_LEAD_RATE_LIMIT_MAX`            | `10`                    | Capturas públicas por IP e janela.               |
| `PUBLIC_LEAD_RATE_LIMIT_WINDOW_MS`      | `600000`                | Janela de captura em milissegundos.              |
| `TRUST_PROXY_HOPS`                      | `0`                     | Saltos de proxy confiáveis para resolução de IP. |

Configurações inválidas falham sem registrar seus valores brutos.

## Primeiro SUPER_ADMIN

Depois de aplicar as migrations, forneça a senha exclusivamente por variável de ambiente temporária. Nome e email podem ser argumentos; nenhum deles é gravado no repositório:

```powershell
$bootstrapCredential = Get-Credential -UserName 'bootstrap' -Message 'Informe a senha inicial (mínimo 12 caracteres)'
$env:FIRST_SUPER_ADMIN_PASSWORD = $bootstrapCredential.GetNetworkCredential().Password
npm run create-super-admin -- --nome "Administrador Inicial" --email "admin@example.com"
Remove-Item Env:FIRST_SUPER_ADMIN_PASSWORD
Remove-Variable bootstrapCredential
```

Alternativamente, `FIRST_SUPER_ADMIN_NAME` e `FIRST_SUPER_ADMIN_EMAIL` podem vir do ambiente. O comando usa lock transacional e falha se já existir qualquer `SUPER_ADMIN`; não é seed e nunca possui senha padrão.

## PostgreSQL e Prisma

O Docker Desktop/WSL 2 foi validado com PostgreSQL 17.11. Defina credenciais exclusivamente locais no `.env` ignorado e execute:

```powershell
docker compose --env-file .env -f docker/compose.yaml --profile database up -d postgres
```

Espere o healthcheck ficar saudável e aplique a migration controlada:

```powershell
npm run prisma:validate
npm run prisma:migrate:deploy
npm run prisma:migrate:status
```

Para criar migrations durante o desenvolvimento, use `npm run prisma:migrate:dev`. Não edite ou recrie migrations já aplicadas. O schema fica em `database/prisma/schema.prisma`, e o client gerado em `apps/backend/src/generated/prisma` não é versionado.

Nesta máquina, a migration inicial foi aplicada tanto em `larcarvalho` quanto em `larcarvalho_test`. O banco comercial permanece intencionalmente sem seed.

Para verificar ou parar somente o PostgreSQL:

```powershell
docker compose --env-file .env -f docker/compose.yaml --profile database ps postgres
docker compose --env-file .env -f docker/compose.yaml --profile database stop postgres
```

O volume nomeado `larcarvalho-intelligence_postgres_data` sobrevive a `stop`, `start` e recriação do container. Não execute `docker compose down -v`, `docker volume rm` ou `docker system prune` sem backup e autorização explícita.

## Testes de integração PostgreSQL

`TEST_DATABASE_URL` deve apontar exatamente para `larcarvalho_test` em `localhost`/`127.0.0.1`. A preparação rejeita outro host ou nome, cria o banco técnico se ausente e aplica a migration versionada antes dos testes:

```powershell
npm run test:integration
npm run prisma:migrate:test:status
```

A suíte limpa seus próprios registros, usa transações com rollback nos testes de constraints e não deve receber dados reais.

## Backup e restore local

As ferramentas oficiais ficam no container PostgreSQL. Exemplo de dump customizado, mantido fora do repositório:

```powershell
docker compose --env-file .env -f docker/compose.yaml --profile database exec -T postgres pg_dump -U larcarvalho -d larcarvalho -Fc -f /tmp/larcarvalho.dump
docker compose --env-file .env -f docker/compose.yaml --profile database exec -T postgres createdb -U larcarvalho larcarvalho_restore_test
docker compose --env-file .env -f docker/compose.yaml --profile database exec -T postgres pg_restore -U larcarvalho -d larcarvalho_restore_test --exit-on-error /tmp/larcarvalho.dump
```

Valide tabelas e migrations no banco restaurado antes de qualquer descarte. Dumps temporários não devem ser versionados; backups reais precisam sair da máquina e ser criptografados.

## Ambientes

- Desenvolvimento: `larcarvalho`, credenciais locais e volume persistente.
- Teste: `larcarvalho_test`, isolado e destinado somente a dados descartáveis.
- Produção: serviço/host separado, secrets externos, porta não pública, backup e restore operacionais. Nunca reutilize o `.env` local.

## Convenções

- TypeScript estrito e nomes explícitos.
- Imports de tipo com `import type`.
- Código de domínio não depende de Fastify, ORM ou detalhes externos.
- Segredos nunca entram em código, fixtures, logs ou commits.
- Novas dependências precisam de justificativa, manutenção ativa e revisão de licença/vulnerabilidade.
- Testes ficam próximos da unidade; E2E e contratos transversais ficam em `tests/`.

## Antes de integrar uma mudança

```powershell
npm run check
npm run format:check
```

Depois que Git estiver disponível no PATH, usar branches curtas e commits pequenos. Não adicionar remoto nem fazer push sem autorização.

## Portas padrão

Para diagnóstico de IPv4/IPv6, escolha entre `localhost` e `127.0.0.1` e comandos somente de leitura, consulte [Conectividade local](CONECTIVIDADE_LOCAL.md). A auditoria de 10/09/2026 confirmou o frontend acessível pelas duas famílias e PostgreSQL publicado no Windows/backend acessíveis apenas por IPv4. Use override temporário de `TEST_DATABASE_URL` nos processos de teste, sem editar `.env`.

| Serviço          | Porta |
| ---------------- | ----: |
| Next.js          |  3000 |
| Fastify          |  3001 |
| PostgreSQL local |  5432 |

Na auditoria inicial, essas portas estavam livres.
