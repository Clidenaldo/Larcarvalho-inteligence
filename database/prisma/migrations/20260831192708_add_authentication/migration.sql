-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'GESTOR', 'VENDEDOR', 'OPERADOR');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "nome" VARCHAR(200) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" "user_role" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "email_verificado_em" TIMESTAMPTZ(3),
    "ultimo_login_em" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "ip_address" INET,
    "user_agent" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_ativo_idx" ON "users"("role", "ativo");

-- CreateIndex
CREATE INDEX "users_ativo_idx" ON "users"("ativo");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_expires_at_idx" ON "sessions"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "sessions_user_id_revoked_at_idx" ON "sessions"("user_id", "revoked_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Authentication invariants maintained as SQL because Prisma does not
-- represent PostgreSQL CHECK constraints in the schema language.
ALTER TABLE "users" ADD CONSTRAINT "users_nome_ck" CHECK (length(btrim("nome")) > 0);
ALTER TABLE "users" ADD CONSTRAINT "users_email_normalized_ck" CHECK ("email" = lower(btrim("email")) AND length("email") > 3);
ALTER TABLE "users" ADD CONSTRAINT "users_password_hash_ck" CHECK (length(btrim("password_hash")) > 0);

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_token_hash_ck" CHECK ("token_hash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_expiration_ck" CHECK ("expires_at" > "created_at");
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_last_used_ck" CHECK ("last_used_at" IS NULL OR "last_used_at" >= "created_at");
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_revoked_ck" CHECK ("revoked_at" IS NULL OR "revoked_at" >= "created_at");
