CREATE TYPE "grupo_snapshot_origin" AS ENUM (
  'MANUAL',
  'IMPORTACAO',
  'INTEGRACAO_FUTURA',
  'PROCESSAMENTO_INTERNO'
);

ALTER TABLE "grupo_historicos"
  ADD COLUMN "origem" "grupo_snapshot_origin" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "criado_por_id" UUID,
  ADD COLUMN "fonte_dados_id" UUID,
  ADD COLUMN "importacao_id" UUID,
  ADD COLUMN "idempotency_key" UUID,
  ADD COLUMN "status" VARCHAR(80),
  ADD COLUMN "prazo_meses" INTEGER,
  ADD COLUMN "quantidade_cotas_declarada" INTEGER,
  ADD COLUMN "quantidade_cotas_registradas" INTEGER,
  ADD COLUMN "assembleias_realizadas" INTEGER,
  ADD COLUMN "assembleias_com_dados_lance" INTEGER,
  ADD COLUMN "assembleias_com_dados_contemplacao" INTEGER,
  ADD COLUMN "lances_registrados" INTEGER,
  ADD COLUMN "lances_contemplados" INTEGER,
  ADD COLUMN "contemplacoes_registradas" INTEGER,
  ADD COLUMN "contemplacoes_sorteio" INTEGER,
  ADD COLUMN "contemplacoes_lance" INTEGER,
  ADD COLUMN "contemplacoes_outras" INTEGER,
  ADD COLUMN "percentual_lance_contemplado_minimo" DECIMAL(9,6),
  ADD COLUMN "percentual_lance_contemplado_maximo" DECIMAL(9,6),
  ADD COLUMN "percentual_lance_contemplado_medio" DECIMAL(9,6),
  ADD COLUMN "percentual_lance_contemplado_mediano" DECIMAL(9,6),
  ADD COLUMN "issues_abertas" INTEGER,
  ADD COLUMN "issues_criticas" INTEGER;

CREATE UNIQUE INDEX "grupo_historicos_grupo_id_idempotency_key_key"
  ON "grupo_historicos"("grupo_id", "idempotency_key");
CREATE INDEX "grupo_historicos_fonte_dados_id_idx"
  ON "grupo_historicos"("fonte_dados_id");
CREATE INDEX "grupo_historicos_importacao_id_idx"
  ON "grupo_historicos"("importacao_id");
CREATE INDEX "grupo_historicos_criado_por_id_data_referencia_idx"
  ON "grupo_historicos"("criado_por_id", "data_referencia");

ALTER TABLE "grupo_historicos"
  ADD CONSTRAINT "grupo_historicos_criado_por_id_fkey"
  FOREIGN KEY ("criado_por_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "grupo_historicos_fonte_dados_id_fkey"
  FOREIGN KEY ("fonte_dados_id") REFERENCES "fontes_dados"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "grupo_historicos_importacao_id_fkey"
  FOREIGN KEY ("importacao_id") REFERENCES "importacoes"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
