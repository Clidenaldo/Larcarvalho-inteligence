# Implantação

## Estado

Esta é uma preparação, não um procedimento de produção aprovado. Docker Desktop/WSL 2 e PostgreSQL 17.11 foram validados localmente; isso não equivale a homologar imagens, rede, secrets ou VPS de produção. O Git local foi inicializado sem repositório remoto.

## Topologia recomendada para a VPS Hostinger

1. DNS apontando para a VPS.
2. Firewall expondo apenas SSH, HTTP e HTTPS.
3. Nginx como reverse proxy e terminação TLS.
4. Frontend e backend em contêineres sem privilégio.
5. PostgreSQL sem porta pública, em rede privada ou serviço gerenciado.
6. Volumes persistentes, backups externos criptografados e teste periódico de restauração.
7. Deploy via pipeline GitHub com ambiente protegido e secrets do provedor, após autorização.

## Fluxo futuro sugerido

```text
Pull request -> lint/types/test/build -> análise de vulnerabilidades
             -> imagem imutável -> aprovação -> deploy -> smoke test
             -> rollback por imagem anterior se necessário
```

## Requisitos antes do primeiro deploy

- Disponibilizar Git no PATH; Docker Desktop/WSL 2 já foi validado localmente.
- Criar repositório GitHub privado e regras de branch, somente com autorização.
- Definir domínio, DNS e versão/sistema da VPS.
- Definir autenticação e política testada de backups e restauração do PostgreSQL.
- Separar ambientes e secrets; nunca copiar `.env` local para o Git.
- Adicionar TLS, headers na borda, rate limits ajustados e monitoramento.
- Executar `npm run check` e validar `docker compose config` e builds.
- Configurar migração automatizada com etapa segura e backup.

## Banco e migrations

Forneça `DATABASE_URL` pelo mecanismo de secrets do ambiente, nunca na imagem ou no repositório. Execute `npm run prisma:migrate:deploy` como etapa única e controlada antes de promover a nova aplicação. Faça backup antes de mudanças destrutivas e impeça que múltiplas réplicas executem migrations simultaneamente.

A migration inicial está em `database/prisma/migrations/20260831130000_initial`. Ela foi aplicada e inspecionada em PostgreSQL 17.11 local, mas ainda exige uma etapa controlada em cada ambiente futuro. Em produção, não exponha a porta 5432 publicamente.

## Backup e restore

O fluxo local `pg_dump -Fc -> createdb -> pg_restore --exit-on-error` foi validado com contagem de tabelas, migration e registro técnico. Em produção, automatize backups para armazenamento externo criptografado, defina retenção, monitore falhas e execute restaurações periódicas em ambiente isolado. Um dump no mesmo host não é backup suficiente.

## Nginx

`docker/nginx/nginx.conf` é uma base de reverse proxy, ainda sem TLS e sem domínio. A rota `/api/` preserva o prefixo ao encaminhar para as rotas versionadas do backend. Ela deverá ser revisada quando o contrato real da API existir.

## Rollback e dados

Aplicações devem usar imagens versionadas e permitir retorno à versão anterior. Migrações destrutivas precisam de estratégia expand/contract; rollback de aplicação não garante rollback de dados. Backups devem existir fora da própria VPS.
