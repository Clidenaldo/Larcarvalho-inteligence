-- Fase 30: hub de integrações (aditivo; sem alterar tabelas existentes além de
-- colunas novas nuláveis/com default).

-- CreateTable: segredos cifrados (AES-256-GCM); nunca em texto puro.
CREATE TABLE "integration_secrets" (
    "id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "key_name" VARCHAR(80) NOT NULL DEFAULT 'default',
    "ciphertext" TEXT NOT NULL,
    "iv" VARCHAR(64) NOT NULL,
    "auth_tag" VARCHAR(64) NOT NULL,
    "key_version" VARCHAR(20) NOT NULL DEFAULT '1',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "rotated_at" TIMESTAMPTZ(3),

    CONSTRAINT "integration_secrets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integration_secrets_integration_id_key_name_key" ON "integration_secrets"("integration_id", "key_name");

-- CreateIndex
CREATE INDEX "integration_secrets_integration_id_idx" ON "integration_secrets"("integration_id");

-- CreateTable: staging de sincronização (payload recebido + checksum).
CREATE TABLE "integration_staging_records" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "external_id" VARCHAR(255) NOT NULL,
    "entity_type" VARCHAR(40) NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "payload" JSONB NOT NULL,
    "schema_version" VARCHAR(40) NOT NULL DEFAULT 'CANONICAL_V1',
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "error_code" VARCHAR(100),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_staging_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integration_staging_records_run_entity_external_key" ON "integration_staging_records"("run_id", "entity_type", "external_id");

-- CreateIndex
CREATE INDEX "integration_staging_records_run_id_idx" ON "integration_staging_records"("run_id");

-- CreateTable: eventos de webhook (idempotência por event_id).
CREATE TABLE "integration_webhook_events" (
    "id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "event_id" VARCHAR(200) NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'RECEIVED',
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integration_webhook_events_integration_event_key" ON "integration_webhook_events"("integration_id", "event_id");

-- CreateIndex
CREATE INDEX "integration_webhook_events_integration_id_idx" ON "integration_webhook_events"("integration_id");

-- AlterTable: cursor incremental, agendamento e lock de sincronização.
ALTER TABLE "integrations" ADD COLUMN "cursor" TEXT,
ADD COLUMN "intervalo_minutos" INTEGER,
ADD COLUMN "sync_locked_at" TIMESTAMPTZ(3),
ADD COLUMN "sync_locked_by" VARCHAR(200);

-- AlterTable: versões, cursor e contadores de rejeição/issues por run.
ALTER TABLE "integration_runs" ADD COLUMN "cursor" VARCHAR(200),
ADD COLUMN "mapping_version" VARCHAR(40),
ADD COLUMN "normalizer_version" VARCHAR(40),
ADD COLUMN "provider_schema_version" VARCHAR(40),
ADD COLUMN "registros_rejeitados" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "issues_criadas" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: checksum para detecção de mudança sem reprocessar.
ALTER TABLE "external_entity_mappings" ADD COLUMN "checksum" VARCHAR(64);

-- AddForeignKey
ALTER TABLE "integration_secrets" ADD CONSTRAINT "integration_secrets_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_staging_records" ADD CONSTRAINT "integration_staging_records_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "integration_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_staging_records" ADD CONSTRAINT "integration_staging_records_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_webhook_events" ADD CONSTRAINT "integration_webhook_events_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
