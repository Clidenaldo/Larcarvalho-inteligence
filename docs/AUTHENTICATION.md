# Autenticação

## Decisão

A aplicação first-party usa sessão opaca em cookie, não JWT. No login, o backend gera 32 bytes aleatórios, entrega o valor somente em `Set-Cookie` e persiste no PostgreSQL apenas seu SHA-256 hexadecimal. Um vazamento da tabela de sessões não fornece tokens reutilizáveis.

O Next.js funciona como BFF para login/logout. O JavaScript da interface nunca lê a credencial, e `localStorage`/`sessionStorage` não são usados. O dashboard chama `/auth/me` no servidor com o cookie recebido e redireciona para `/login` antes de renderizar quando a sessão não é válida.

## Cookie e ciclo da sessão

- desenvolvimento/teste: `larcarvalho_session`;
- produção: `__Host-larcarvalho_session`;
- `HttpOnly`, `SameSite=Strict`, `Path=/`;
- `Secure` obrigatório em produção;
- expiração absoluta padrão de 12 horas, configurável entre 1 e 168;
- `lastUsedAt` é atualizado no máximo a cada cinco minutos;
- logout preenche `revokedAt` e expira o cookie;
- sessão expirada, revogada ou pertencente a usuário inativo retorna `401`.

Troca de senha mantém somente a sessão atual e revoga as demais. Desativação e troca de papel revogam todas as sessões do alvo. Não há “lembrar de mim”, gestão de dispositivos, MFA ou recuperação por email nesta fase.

## Senhas

São aceitas frases-senha de 12 a 128 caracteres. Não há regras artificiais de composição. O hash usa Argon2id com 19.456 KiB de memória, custo temporal 2, paralelismo 1 e saída de 32 bytes. Senha, hash, cookie e token estão na lista de redaction do logger.

## Abuso e auditoria

Login é limitado por IP (5 tentativas por 60 segundos por padrão) usando o plugin oficial do Fastify. `TRUST_PROXY_HOPS=0` ignora cabeçalhos de proxy; em produção deve representar exatamente a quantidade de proxies controlados, nunca uma confiança ampla. Em múltiplas réplicas, o store em memória do rate limit deve ser substituído por store compartilhado.

Falhas devolvem sempre “Credenciais inválidas”, independentemente da existência do email, e executam uma verificação Argon2 dummy. `LOGIN_FAILED` grava somente os 16 primeiros caracteres do SHA-256 do email normalizado, IP e user-agent. Sucesso, logout, criação, status, papel e senha também usam `AuditLog`; nenhum metadata contém segredo.

## Bootstrap e operação

O primeiro super administrador é criado por `npm run create-super-admin -- --nome "Nome" --email "email"`, com a senha em `FIRST_SUPER_ADMIN_PASSWORD`. Um advisory lock PostgreSQL serializa o bootstrap e o comando recusa duplicação. Consulte `docs/DEVELOPMENT.md` para o procedimento completo.

Rotina automática de limpeza de sessões expiradas, MFA, reset administrativo, recuperação de senha e logout de todos os dispositivos ficam explicitamente para fases futuras.
