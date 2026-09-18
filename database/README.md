# Database

Este diretório contém o schema Prisma e migrations controladas do PostgreSQL.

- `prisma/schema.prisma`: modelo relacional da Fase 02.
- `prisma/migrations/20260831130000_initial/migration.sql`: migration inicial gerada offline e complementada com constraints PostgreSQL.
- `prisma/migrations/migration_lock.toml`: provider fixado em PostgreSQL.

A migration ainda não foi aplicada: não havia instância PostgreSQL disponível durante a Fase 02. Não existe seed comercial; o banco deve nascer vazio.
