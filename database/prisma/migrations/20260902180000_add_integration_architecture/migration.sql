CREATE TYPE "integration_connector_type" AS ENUM (
  'MOCK', 'REST_API', 'SOAP', 'SFTP', 'FILE_PULL', 'WEBHOOK', 'MANUAL_IMPORT'
);

CREATE TYPE "integration_status" AS ENUM (
  'NAO_CONFIGURADA', 'ATIVA', 'PAUSADA', 'ERRO', 'DESABILITADA'
);

CREATE TYPE "integration_run_status" AS ENUM (
  'PENDENTE', 'EXECUTANDO', 'SUCESSO', 'SUCESSO_PARCIAL', 'FALHA', 'CANCELADA'
);

CREATE TYPE "integration_trigger" AS ENUM (
  'MANUAL', 'SCHEDULED', 'WEBHOOK', 'RETRY', 'SYSTEM'
);

CREATE TYPE "integration_entity_type" AS ENUM (
  'ADMINISTRADORA', 'PRODUTO', 'GRUPO', 'COTA', 'ASSEMBLEIA', 'LANCE', 'CONTEMPLACAO'
);

ALTER TABLE "integrations"
  ADD COLUMN "fonte_dados_id" UUID,
  ADD COLUMN "secret_ref" VARCHAR(120),
  ADD COLUMN "frequencia" VARCHAR(100),
  ADD COLUMN "ultimo_sucesso_em" TIMESTAMPTZ(3),
  ADD COLUMN "ultima_tentativa_em" TIMESTAMPTZ(3),
  ADD COLUMN "proxima_execucao_em" TIMESTAMPTZ(3);

ALTER TABLE "integrations"
  ALTER COLUMN "tipo" TYPE "integration_connector_type"
  USING (
    CASE
      WHEN "tipo" IN ('MOCK', 'REST_API', 'SOAP', 'SFTP', 'FILE_PULL', 'WEBHOOK', 'MANUAL_IMPORT')
        THEN "tipo"
      ELSE 'MANUAL_IMPORT'
    END
  )::"integration_connector_type",
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "integration_status"
  USING (
    CASE
      WHEN "status" IN ('NAO_CONFIGURADA', 'ATIVA', 'PAUSADA', 'ERRO', 'DESABILITADA')
        THEN "status"
      ELSE 'NAO_CONFIGURADA'
    END
  )::"integration_status",
  ALTER COLUMN "status" SET DEFAULT 'NAO_CONFIGURADA';

CREATE TABLE "integration_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "integration_id" UUID NOT NULL,
  "importacao_id" UUID,
  "status" "integration_run_status" NOT NULL DEFAULT 'PENDENTE',
  "trigger" "integration_trigger" NOT NULL,
  "iniciado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finalizado_em" TIMESTAMPTZ(3),
  "registros_recebidos" INTEGER NOT NULL DEFAULT 0,
  "registros_validos" INTEGER NOT NULL DEFAULT 0,
  "registros_invalidos" INTEGER NOT NULL DEFAULT 0,
  "registros_criados" INTEGER NOT NULL DEFAULT 0,
  "registros_atualizados" INTEGER NOT NULL DEFAULT 0,
  "registros_ignorados" INTEGER NOT NULL DEFAULT 0,
  "erro_codigo" VARCHAR(100),
  "erro_resumo" VARCHAR(1000),
  "request_id" VARCHAR(100),
  "idempotency_key" VARCHAR(200),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "integration_runs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "integration_logs"
  ADD COLUMN "run_id" UUID,
  ADD COLUMN "request_id" VARCHAR(100),
  ADD COLUMN "evento" VARCHAR(100),
  ADD COLUMN "duracao_ms" INTEGER,
  ADD COLUMN "quantidade" INTEGER,
  ADD COLUMN "erro_codigo" VARCHAR(100);

CREATE TABLE "external_entity_mappings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "integration_id" UUID NOT NULL,
  "entity_type" "integration_entity_type" NOT NULL,
  "external_id" VARCHAR(255) NOT NULL,
  "internal_id" UUID NOT NULL,
  "external_updated_at" TIMESTAMPTZ(3),
  "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "external_entity_mappings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "integration_runs_integration_id_idempotency_key_key"
  ON "integration_runs"("integration_id", "idempotency_key");
CREATE INDEX "integration_runs_integration_id_iniciado_em_idx"
  ON "integration_runs"("integration_id", "iniciado_em");
CREATE INDEX "integration_runs_status_iniciado_em_idx"
  ON "integration_runs"("status", "iniciado_em");
CREATE INDEX "integration_runs_request_id_idx" ON "integration_runs"("request_id");
CREATE INDEX "integration_runs_importacao_id_idx" ON "integration_runs"("importacao_id");

CREATE UNIQUE INDEX "external_entity_mappings_integration_id_entity_type_external_id_key"
  ON "external_entity_mappings"("integration_id", "entity_type", "external_id");
CREATE INDEX "external_entity_mappings_entity_type_internal_id_idx"
  ON "external_entity_mappings"("entity_type", "internal_id");
CREATE INDEX "external_entity_mappings_integration_id_last_seen_at_idx"
  ON "external_entity_mappings"("integration_id", "last_seen_at");

CREATE INDEX "integrations_fonte_dados_id_status_idx"
  ON "integrations"("fonte_dados_id", "status");
CREATE INDEX "integrations_proxima_execucao_em_status_idx"
  ON "integrations"("proxima_execucao_em", "status");
CREATE INDEX "integration_logs_run_id_created_at_idx"
  ON "integration_logs"("run_id", "created_at");
CREATE INDEX "integration_logs_request_id_idx" ON "integration_logs"("request_id");

ALTER TABLE "integrations"
  ADD CONSTRAINT "integrations_fonte_dados_id_fkey"
  FOREIGN KEY ("fonte_dados_id") REFERENCES "fontes_dados"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "integration_runs"
  ADD CONSTRAINT "integration_runs_integration_id_fkey"
  FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "integration_runs"
  ADD CONSTRAINT "integration_runs_importacao_id_fkey"
  FOREIGN KEY ("importacao_id") REFERENCES "importacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "integration_logs"
  ADD CONSTRAINT "integration_logs_run_id_fkey"
  FOREIGN KEY ("run_id") REFERENCES "integration_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "external_entity_mappings"
  ADD CONSTRAINT "external_entity_mappings_integration_id_fkey"
  FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
