CREATE TYPE "data_quality_status" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'IGNORED');
CREATE TYPE "data_quality_origin" AS ENUM ('IMPORTACAO', 'VALIDACAO_INTERNA', 'PROCESSAMENTO', 'INTEGRACAO_FUTURA', 'AUDITORIA_MANUAL');

ALTER TABLE "data_quality_issues"
  ADD COLUMN "status" "data_quality_status" NOT NULL DEFAULT 'OPEN',
  ADD COLUMN "origem" "data_quality_origin" NOT NULL DEFAULT 'IMPORTACAO',
  ADD COLUMN "metadata" JSONB,
  ADD COLUMN "dedup_key" VARCHAR(255),
  ADD COLUMN "administradora_id" UUID,
  ADD COLUMN "produto_id" UUID,
  ADD COLUMN "grupo_id" UUID,
  ADD COLUMN "resolved_by_id" UUID,
  ADD COLUMN "resolution_action" VARCHAR(300),
  ADD COLUMN "resolution_note" TEXT,
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "data_quality_issues"
SET "status" = 'RESOLVED'
WHERE "resolvido" = true;

ALTER TABLE "data_quality_issues" DROP CONSTRAINT "data_quality_issues_resolucao_ck";
ALTER TABLE "data_quality_issues" ADD CONSTRAINT "data_quality_issues_resolucao_status_ck"
  CHECK (
    ("status" IN ('RESOLVED', 'IGNORED') AND "resolvido" = true AND "resolved_at" IS NOT NULL)
    OR
    ("status" IN ('OPEN', 'IN_REVIEW') AND "resolvido" = false AND "resolved_at" IS NULL)
  );
ALTER TABLE "data_quality_issues" ADD CONSTRAINT "data_quality_issues_resolved_by_id_fkey"
  FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "data_quality_issues_dedup_key_key" ON "data_quality_issues"("dedup_key");
CREATE INDEX "data_quality_issues_status_severidade_created_at_idx" ON "data_quality_issues"("status", "severidade", "created_at");
CREATE INDEX "data_quality_issues_codigo_status_idx" ON "data_quality_issues"("codigo", "status");
CREATE INDEX "data_quality_issues_administradora_id_status_idx" ON "data_quality_issues"("administradora_id", "status");
CREATE INDEX "data_quality_issues_produto_id_status_idx" ON "data_quality_issues"("produto_id", "status");
CREATE INDEX "data_quality_issues_grupo_id_status_idx" ON "data_quality_issues"("grupo_id", "status");
