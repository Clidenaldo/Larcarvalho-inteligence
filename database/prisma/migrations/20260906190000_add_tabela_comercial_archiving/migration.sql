ALTER TABLE "tabelas_comerciais"
ADD COLUMN "deleted_at" TIMESTAMPTZ(3);

DROP INDEX "tabelas_comerciais_administradora_id_status_inicio_vigencia_idx";

CREATE INDEX "tabelas_comerciais_deleted_at_administradora_id_status_inicio_vigencia_idx"
ON "tabelas_comerciais"("deleted_at", "administradora_id", "status", "inicio_vigencia");
