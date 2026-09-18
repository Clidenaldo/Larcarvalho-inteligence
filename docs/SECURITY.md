# Segurança

## Superfície pública do simulador

O único domínio público de negócio é `POST /api/v1/public/simulador`. O body é estrito, pequeno e limitado; não aceita IDs, inativos ou ordenação arbitrária. Rate limit process-local, timeout, CORS oficial, Helmet, request ID e envelope genérico de erro permanecem ativos. A resposta remove UUIDs, issues, auditoria, importações e metadados. `TRUST_PROXY_HOPS` deve ficar em `0` no acesso direto e ser definido como `1` quando houver exatamente um Nginx confiável à frente do backend.

Não são usados cookies de rastreamento, pixels, fingerprinting ou analytics de
terceiros. A aplicação possui analytics first-party limitado a eventos de
negócio e um UUID opaco em `sessionStorage`; não são registrados PII, IP ou
user-agent. O WhatsApp usa somente número de ambiente normalizado e mensagem
codificada; nenhuma URL fornecida pelo visitante é aceita.

## Saneamento de dados

Todas as entradas do módulo de qualidade são validadas por schemas compartilhados e cada comando exige capability específica e origem confiável. Justificativas e ações possuem limites explícitos; IDs são UUIDs. O detalhe não expõe credenciais, segredos ou conteúdo bruto de arquivos, e a listagem omite `metadata`. O scanner é manual, restrito, auditado e não corrige registros operacionais automaticamente.

## Uploads de importação

CSV/XLSX/XLS exigem extensão, MIME e assinatura coerentes e têm limite de 20 MiB. Fórmulas/macros nunca são executadas, conteúdo não entra em logs e temporários têm nome aleatório/permissão restrita. Limites de linhas/colunas reduzem abuso; isolamento, antivírus, expiração automática e teto de expansão ZIP são controles futuros antes de ampliar exposição.

## Princípios

- Negar por padrão e conceder apenas o necessário.
- Segredos somente em mecanismo próprio do ambiente ou `.env` local ignorado.
- Validar toda entrada nas fronteiras e codificar saídas conforme o contexto.
- Autenticação não substitui autorização por recurso e ação.
- Registrar eventos úteis sem expor credenciais, documentos ou dados pessoais.
- Minimizar coleta e retenção de dados conforme LGPD.
- Analytics first-party retém eventos brutos por 180 dias; não há venda ou
  compartilhamento com plataformas de publicidade.

## Medidas já presentes

- Nenhum segredo ou credencial real no repositório.
- Validação de variáveis do backend com Zod.
- Headers de segurança no backend via Helmet.
- CORS permite somente o `FRONTEND_URL` configurado; origins divergentes não recebem autorização.
- Corpo limitado a 1 MiB e requisições limitadas a 10 segundos por padrão.
- Request IDs UUID são devolvidos em `x-request-id` e no contrato de erro.
- Logs estruturados do Fastify com redaction de autorização, cookies, API keys e `set-cookie`.
- Erro interno genérico ao cliente e log estruturado apenas no servidor, sem stack na resposta.
- Contêineres preparados para executar como usuário sem privilégio.
- PostgreSQL opcional exige senha externa e publica porta apenas em loopback.
- `DATABASE_URL` é tratada como segredo: não possui valor real no exemplo, não é registrada em logs e seus arquivos de ambiente são ignorados pelo Git.
- O pool PostgreSQL tem limites explícitos por processo; credenciais de integração permanecem fora das tabelas de domínio e deverão usar um secret manager no futuro.
- Metadados JSON aceitam somente conteúdo variável e não sensível; logs de importação, integração e auditoria nunca devem receber tokens ou senhas.
- Nginx preparado com limite inicial de requisições na rota versionada da API.
- Senhas usam Argon2id (19 MiB, 2 iterações, paralelismo 1) e nunca são devolvidas ou registradas.
- Sessões opacas de 256 bits ficam em cookie HttpOnly, `SameSite=Strict`, `Path=/` e `Secure` em produção; PostgreSQL guarda apenas SHA-256 do token aleatório.
- Login tem resposta genérica, verificação dummy para emails inexistentes e rate limit por IP.
- Mutações de identidade rejeitam `Origin` divergente; CORS aceita somente `FRONTEND_URL`.
- Desativação, troca de papel e troca de senha revogam sessões conforme o risco.
- Logs redigem cookies, autorização, senhas e hashes; `LOGIN_FAILED` audita apenas fingerprint truncado do email, IP e user-agent.

## Riscos residuais e próximos controles

- Conduzir modelagem de ameaças e classificar dados pessoais/sensíveis.
- Implementar MFA e recuperação de conta somente após definição de provedor e política.
- Migrar rate limit para store compartilhado quando houver múltiplas réplicas do backend.
- Criar rotina de limpeza de sessões expiradas e política formal de retenção de auditoria.
- Escolher criptografia e storage seguro para documentos.
- Criar trilha de auditoria imutável para ações sensíveis.
- Definir política de retenção, descarte, consentimento e atendimento ao titular.
- Aplicar rate limiting por risco, proteção CSRF quando aplicável e CORS restrito.

## Produção

- TLS obrigatório, HSTS depois de validação e cookies `Secure`, `HttpOnly`, `SameSite`.
- Banco e serviços internos sem exposição pública.
- Secrets rotacionáveis e com menor privilégio.
- Dependências bloqueadas por lockfile, atualizações revisadas e varredura contínua.
- Backups criptografados e restauração testada.
- Alertas para autenticação anômala, erros, indisponibilidade e mudanças privilegiadas.

## Dependências conhecidas

Em 01/09/2026, `npm audit` e `npm audit --omit=dev` reportam 4 alertas altos em duas dependências transitivas da CLI Prisma 7.10.0:

- `GHSA-ggr8-5vv4-36mx`: exaustão de pilha em `deepmerge-ts 7.1.5`, pela cadeia `prisma -> @prisma/config`;
- `GHSA-3f6p-5ww8-9rcr`: downgrade do plugin de autenticação em `mysql2 3.15.3`, dependência direta do pacote `prisma`.

O código de `deepmerge-ts` pertence ao carregamento/merge de configuração da CLI Prisma e não à rota HTTP do Prisma Client. O projeto usa PostgreSQL e não configura nem conecta `mysql2` em runtime, reduzindo a exposição prática do segundo advisory. Ainda assim, ambos constam na árvore instalada e devem permanecer monitorados.

O Prisma instalado fixa essas versões transitivas. `npm audit fix --force` propõe downgrade incompatível para Prisma 6.19.3. Não foi aplicado downgrade, override transitivo ou versão pré-release. Reavaliar quando houver atualização compatível do Prisma ou uma migração planejada e testada.

## Resposta a incidente

Documentar responsáveis, contatos, contenção, preservação de evidências, rotação de secrets, comunicação e retrospectiva antes de operar dados reais.

Vulnerabilidades não devem ser abertas em issue pública. Definir um canal privado antes da publicação do projeto.

## Dados pessoais e CRM

A captura de lead minimiza PII, exige consentimento específico e não persiste IP/user-agent. Deduplicação pública não é enumerável; honeypot recebe resposta genérica. Escopo de carteira é aplicado no serviço contra IDOR, e endpoints distintos evitam mass assignment. AuditLog não recebe telefone, e-mail ou conteúdo integral de notas. A política de retenção precisa de definição jurídica antes da produção ampla.
