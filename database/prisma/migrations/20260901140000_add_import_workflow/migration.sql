ALTER TYPE "importacao_status" ADD VALUE 'VALIDANDO' AFTER 'PENDENTE';
ALTER TYPE "importacao_status" ADD VALUE 'PRONTA' AFTER 'VALIDANDO';

CREATE TYPE "importacao_tipo" AS ENUM ('ADMINISTRADORAS', 'PRODUTOS', 'GRUPOS', 'COTAS', 'ASSEMBLEIAS', 'LANCES', 'CONTEMPLACOES');
CREATE TYPE "importacao_estrategia" AS ENUM ('IGNORAR', 'ATUALIZAR');

ALTER TABLE "importacoes"
  ADD COLUMN "criado_por_id" UUID,
  ADD COLUMN "tipo" "importacao_tipo",
  ADD COLUMN "mime_type" VARCHAR(150),
  ADD COLUMN "tamanho_bytes" INTEGER,
  ADD COLUMN "arquivo_temporario" VARCHAR(1024),
  ADD COLUMN "abas" JSONB,
  ADD COLUMN "aba_selecionada" VARCHAR(200),
  ADD COLUMN "colunas" JSONB,
  ADD COLUMN "mapeamento" JSONB,
  ADD COLUMN "mapeamento_confirmado" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "estrategia" "importacao_estrategia",
  ADD COLUMN "validada_em" TIMESTAMPTZ(3),
  ADD COLUMN "registros_com_aviso" INTEGER,
  ADD COLUMN "registros_ignorados" INTEGER,
  ADD COLUMN "registros_processados" INTEGER;

-- Existing installations may contain historical imports without an authenticated actor.
-- The workflow requires both fields for every newly created import; legacy rows remain nullable.
ALTER TABLE "importacoes"
  ADD CONSTRAINT "importacoes_criado_por_id_fkey"
  FOREIGN KEY ("criado_por_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "data_quality_issues"
  ADD COLUMN "linha" INTEGER,
  ADD COLUMN "valor_recebido" TEXT;

CREATE INDEX "importacoes_criado_por_id_created_at_idx" ON "importacoes"("criado_por_id", "created_at");
CREATE INDEX "importacoes_tipo_created_at_idx" ON "importacoes"("tipo", "created_at");
