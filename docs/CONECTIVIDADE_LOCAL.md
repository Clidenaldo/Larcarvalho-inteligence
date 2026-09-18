# Conectividade local — auditoria de 10/09/2026

Escopo: inspeção e consultas somente de leitura no Windows e no PostgreSQL Docker existente. Nenhuma alteração em código, scripts, `.env`, credenciais, usuários/SUPER_ADMIN, migrations ou regras comerciais. Nenhum commit, push ou deploy.

Alterações desta auditoria: este documento e um link em `docs/DEVELOPMENT.md`. SHA-256 do `.env` conferido antes/depois da documentação: idêntico. Ambos os documentos foram verificados como UTF-8.

## Evidências e causa provável

`dns.lookup('localhost', { all: true })` e a resolução do Windows retornaram `::1` antes de `127.0.0.1`.

| Serviço observado | Escuta efetiva | Validação por endereço |
| --- | --- | --- |
| PostgreSQL publicado no Windows, 5432 | `127.0.0.1:5432` | TCP IPv4 OK; `::1` recusado (`ECONNREFUSED`) |
| PostgreSQL dentro do container | `0.0.0.0:5432` e `[::]:5432` | `SHOW listen_addresses` = `*`; `/proc/net/tcp` e `tcp6` mostram listeners na porta hexadecimal `1538` |
| Backend no Windows, 3001 | `0.0.0.0:3001` (IPv4, não limitado ao loopback) | TCP IPv4 OK; `::1` recusado; `/api/v1/health` e `/api/v1/ready` por IPv4 = HTTP 200 |
| Frontend no Windows, 3000 | `[::]:3000`, aceitando também IPv4 | TCP e `/health` = HTTP 200 em `127.0.0.1`, `::1` e `localhost` |
| Serviços E2E, 3100/3101 | Sem listeners durante a inspeção | Não iniciados nesta auditoria; configuração apenas inspecionada |

`docker inspect` confirmou a publicação `5432/tcp → HostIp: 127.0.0.1, HostPort: 5432`, igual a `docker/compose.yaml`. Portanto, **a limitação IPv4 está na publicação para o Windows, não na escuta interna do PostgreSQL**. A escuta atual do frontend em desenvolvimento não deve ser confundida com seu Dockerfile, que define `HOSTNAME=0.0.0.0`.

Comparações com a mesma configuração e credenciais, alterando somente o host em memória:

- Prisma `migrate status`, banco `larcarvalho_test`: `localhost` retornou `Schema engine error` e código **1**; `127.0.0.1` retornou **19 migrations, banco atualizado**, código **0**. Nenhuma migration foi aplicada.
- Cliente Node `pg`, consulta `SELECT` com `default_transaction_read_only=on`: `localhost` e `127.0.0.1` passaram; `::1` retornou `ECONNREFUSED`. A consulta confirmou `transaction_read_only=on` e o banco `larcarvalho_test`.
- Node `fetch` no backend: `localhost` e IPv4 retornaram HTTP 200; IPv6 explícito falhou. `curl.exe -4` retornou HTTP 200 e `curl.exe -6` expirou em dois segundos (código 28).

**Causa provável:** resolução IPv6 prioritária de `localhost`, combinada com serviços publicados apenas em IPv4 e diferenças entre clientes na escolha/fallback de endereço. A comparação Prisma reproduziu o problema; não foi capturado um trace de rede do engine para afirmar qual endereço ele tentou internamente. O sucesso de `pg`/HTTP mostra que `localhost` não falha universalmente. Estas evidências são locais e datadas.

## Padrão de uso documentado

- **`127.0.0.1`:** conexão ao PostgreSQL publicado no Windows e verificações diretas da API (`http://127.0.0.1:3001/api/v1/health` e `/api/v1/ready`). Para testes, substituir somente o host de `TEST_DATABASE_URL` no ambiente temporário do processo; manter banco, parâmetros e credenciais. O `.env` permanece intacto.
- **`localhost`:** endereço anunciado do frontend (`http://localhost:3000`; `3100` na configuração E2E de temas). Manter a mesma origem no navegador e em `FRONTEND_URL`: autenticação valida a origem, e trocar o hostname também muda o domínio dos cookies.
- **Entre containers:** usar nomes da rede Compose (`postgres:5432` e `backend:3001`), como já configurado. `127.0.0.1` dentro de um container aponta para ele próprio.
- `0.0.0.0` e `::` são endereços de escuta, não URLs a anunciar. Não foi necessário alterar listeners, DNS, arquivo hosts ou configuração do Docker.

## Consistências, diferenças e arquivos inspecionados

| Arquivos/grupo | Constatação |
| --- | --- |
| `docker/compose.yaml`, `docker/Dockerfile.backend`, `docker/Dockerfile.frontend` | PostgreSQL publicado apenas em IPv4; healthchecks em IPv4; comunicação entre containers por nomes de serviço. |
| `scripts/prepare-integration-database.ps1`, `package.json` | A preparação lê `.env`, pode iniciar container/criar banco/aplicar migrations e verifica `$LASTEXITCODE`. Não é uma validação somente de leitura. Sua validação inicial continua baseada no arquivo; o override temporário de `TEST_DATABASE_URL` é consumido pelo Prisma filho. |
| `apps/backend/prisma.config.ts`, `prisma.test.config.ts`, `src/config/{env,load-env}.ts`, `src/server.ts`, `src/infrastructure/database/prisma-client.ts`, `src/core/auth/http-auth.ts` | Prisma de teste aceita `localhost`/`127.0.0.1` e exige `larcarvalho_test`; `dotenv` não sobrescreve variável já definida. Backend usa `BACKEND_HOST`, padrão `0.0.0.0`; adapter utiliza `pg.Pool`; origem é validada contra `FRONTEND_URL`. |
| `apps/frontend/src/config/env.ts`, `apps/frontend/package.json`, `iniciar-sistema.bat` | Desenvolvimento anuncia `localhost:3000`; URL interna padrão da API usa `localhost:3001`. |
| `playwright.config.ts`, `tests/e2e/{health,rbac,public}.spec.ts` | Readiness e testes health/RBAC usam IPv4; `public.spec.ts` chama `localhost:3001`. `baseURL` permanece `localhost:3000`. URLs absolutas não são alteradas por `PLAYWRIGHT_TEST_BASE_URL`. |
| `playwright.public-theme.config.ts`, `tests/public-theme/*.spec.ts` | HTTP usa `localhost:3100/3101`; banco recebe `TEST_DATABASE_URL`. O override do banco não altera as URLs HTTP fixas, inclusive `BACKEND_INTERNAL_URL` definido pela configuração. |
| `tests/e2e/global-{setup,teardown}.ts`, `apps/backend/test/integration/*.ts` | Fixtures escrevem/removem dados; não foram executadas nesta auditoria. Integrações consultam `TEST_DATABASE_URL`. |
| `README.md`, `E2E.md`, `STAGING.md`, `RUNBOOK.md`, `docs/{DEVELOPMENT,DEPLOYMENT,PUBLIC_THEME,TEMAS_INDEPENDENTES}.md` | Há exemplos legados com `localhost` no backend/banco. RUNBOOK/STAGING também exibem `/health` e `/ready` sem o prefixo real `/api/v1`; usar os endpoints validados acima. |

A mistura dos hostnames HTTP existe e foi registrada, sem substituição global. O override temporário já atende à conexão do banco; não garante corrigir URLs HTTP fixas em clientes sem fallback. `reuseExistingServer: true` no Playwright geral também não muda o ambiente de um servidor já aberto. Nenhuma suíte E2E ou preparação foi iniciada para esta auditoria.

## Comandos de validação somente de leitura

Executar em PowerShell, na raiz do projeto, com os serviços existentes ligados:

```powershell
[System.Net.Dns]::GetHostAddresses('localhost')
Get-NetTCPConnection -State Listen |
  Where-Object { $_.LocalPort -in @(5432,3000,3001,3100,3101) } |
  Select-Object LocalAddress,LocalPort
docker inspect --format '{{json .NetworkSettings.Ports}}' larcarvalho-intelligence-postgres-1
curl.exe --noproxy '*' -4 --connect-timeout 2 --max-time 5 -I http://localhost:3000/health
curl.exe --noproxy '*' -6 --connect-timeout 2 --max-time 5 -I http://localhost:3000/health
curl.exe --noproxy '*' -4 --connect-timeout 2 --max-time 5 http://localhost:3001/api/v1/health
curl.exe --noproxy '*' -6 --connect-timeout 2 --max-time 5 http://localhost:3001/api/v1/health
```

Para reproduzir a comparação Prisma sem editar `.env`, sem imprimir credenciais e sem aplicar migrations:

```powershell
@'
import { config } from 'dotenv';
import { spawnSync } from 'node:child_process';
config({ quiet: true });
const base = new URL(process.env.TEST_DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(base.hostname) ||
    base.pathname !== '/larcarvalho_test') throw new Error('Banco local de teste exigido');
for (const host of ['localhost', '127.0.0.1']) {
  const url = new URL(base);
  url.hostname = host;
  const result = spawnSync(process.execPath, [
    'node_modules/prisma/build/index.js', 'migrate', 'status',
    '--config', 'apps/backend/prisma.test.config.ts'
  ], { stdio: 'inherit', env: { ...process.env, TEST_DATABASE_URL: url.toString() } });
  console.log('Host:', host, 'codigo:', result.status);
}
'@ | node --input-type=module
```

O código de cada subprocesso é impresso separadamente; o término normal do comparador não significa que ambos passaram. Não usar `test:integration:prepare`, `test:integration`, `e2e`, `migrate deploy/dev/reset` ou `docker compose up/down` como diagnóstico somente de leitura.
