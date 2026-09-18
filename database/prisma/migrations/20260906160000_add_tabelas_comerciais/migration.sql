ALTER TYPE "importacao_tipo" ADD VALUE 'TABELAS_COMERCIAIS';

CREATE TYPE "tabela_comercial_status" AS ENUM ('ATIVA', 'INATIVA', 'ENCERRADA');
CREATE TYPE "modalidade_comercial" AS ENUM ('NORMAL', 'MAIS_POR_MENOS', 'OUTRA');
CREATE TYPE "tabela_comercial_origem" AS ENUM ('MANUAL', 'IMPORTACAO', 'INTEGRACAO');

CREATE TABLE "tabelas_comerciais" (
  "id" UUID NOT NULL,
  "administradora_id" UUID NOT NULL,
  "produto_id" UUID,
  "nome" VARCHAR(200) NOT NULL,
  "codigo" VARCHAR(100) NOT NULL,
  "categoria" VARCHAR(80) NOT NULL,
  "inicio_vigencia" DATE NOT NULL,
  "fim_vigencia" DATE,
  "status" "tabela_comercial_status" NOT NULL DEFAULT 'ATIVA',
  "descricao" TEXT,
  "origem" "tabela_comercial_origem" NOT NULL DEFAULT 'MANUAL',
  "indice_correcao" VARCHAR(100),
  "regra_seguro" TEXT,
  "regra_contemplacao" TEXT,
  "lance_facilitado" BOOLEAN,
  "cartao_credito" BOOLEAN,
  "descricao_bem" TEXT,
  "fundo_reserva_percentual" DECIMAL(9,6),
  "taxa_administracao_percentual" DECIMAL(9,6),
  "taxa_total_percentual" DECIMAL(9,6),
  "seguro_vida_percentual" DECIMAL(9,6),
  "participantes_grupo" INTEGER,
  "codigo_plano_normal" VARCHAR(100),
  "codigo_plano_mais_por_menos" VARCHAR(100),
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "tabelas_comerciais_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tabelas_comerciais_vigencia_check" CHECK ("fim_vigencia" IS NULL OR "fim_vigencia" >= "inicio_vigencia"),
  CONSTRAINT "tabelas_comerciais_percentuais_check" CHECK (
    ("fundo_reserva_percentual" IS NULL OR "fundo_reserva_percentual" BETWEEN 0 AND 100) AND
    ("taxa_administracao_percentual" IS NULL OR "taxa_administracao_percentual" BETWEEN 0 AND 100) AND
    ("taxa_total_percentual" IS NULL OR "taxa_total_percentual" BETWEEN 0 AND 100) AND
    ("seguro_vida_percentual" IS NULL OR "seguro_vida_percentual" BETWEEN 0 AND 100)
  ),
  CONSTRAINT "tabelas_comerciais_participantes_check" CHECK ("participantes_grupo" IS NULL OR "participantes_grupo" >= 0)
);

CREATE TABLE "tabelas_comerciais_itens" (
  "id" UUID NOT NULL,
  "tabela_comercial_id" UUID NOT NULL,
  "codigo_externo" VARCHAR(100),
  "credito_referencia" DECIMAL(19,2) NOT NULL,
  "seguro" DECIMAL(19,2),
  "taxa_antecipada_valor" DECIMAL(19,2),
  "taxa_antecipada_percentual" DECIMAL(9,6),
  "prazo_meses" INTEGER NOT NULL,
  "modalidade" "modalidade_comercial" NOT NULL,
  "primeira_parcela" DECIMAL(19,2),
  "demais_parcelas" DECIMAL(19,2),
  "parcela_padrao" DECIMAL(19,2),
  "fundo_reserva_percentual" DECIMAL(9,6),
  "taxa_administracao_percentual" DECIMAL(9,6),
  "taxa_total_percentual" DECIMAL(9,6),
  "seguro_vida_percentual" DECIMAL(9,6),
  "participantes_grupo" INTEGER,
  "codigo_plano" VARCHAR(100),
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "tabelas_comerciais_itens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tabelas_comerciais_itens_credito_check" CHECK ("credito_referencia" > 0),
  CONSTRAINT "tabelas_comerciais_itens_prazo_check" CHECK ("prazo_meses" > 0),
  CONSTRAINT "tabelas_comerciais_itens_monetarios_check" CHECK (
    ("seguro" IS NULL OR "seguro" >= 0) AND
    ("taxa_antecipada_valor" IS NULL OR "taxa_antecipada_valor" >= 0) AND
    ("primeira_parcela" IS NULL OR "primeira_parcela" >= 0) AND
    ("demais_parcelas" IS NULL OR "demais_parcelas" >= 0) AND
    ("parcela_padrao" IS NULL OR "parcela_padrao" >= 0)
  ),
  CONSTRAINT "tabelas_comerciais_itens_percentuais_check" CHECK (
    ("taxa_antecipada_percentual" IS NULL OR "taxa_antecipada_percentual" BETWEEN 0 AND 100) AND
    ("fundo_reserva_percentual" IS NULL OR "fundo_reserva_percentual" BETWEEN 0 AND 100) AND
    ("taxa_administracao_percentual" IS NULL OR "taxa_administracao_percentual" BETWEEN 0 AND 100) AND
    ("taxa_total_percentual" IS NULL OR "taxa_total_percentual" BETWEEN 0 AND 100) AND
    ("seguro_vida_percentual" IS NULL OR "seguro_vida_percentual" BETWEEN 0 AND 100)
  ),
  CONSTRAINT "tabelas_comerciais_itens_participantes_check" CHECK ("participantes_grupo" IS NULL OR "participantes_grupo" >= 0)
);

CREATE UNIQUE INDEX "tabelas_comerciais_administradora_id_codigo_inicio_vigencia_key"
  ON "tabelas_comerciais"("administradora_id", "codigo", "inicio_vigencia");
CREATE INDEX "tabelas_comerciais_administradora_id_status_inicio_vigencia_idx"
  ON "tabelas_comerciais"("administradora_id", "status", "inicio_vigencia");
CREATE INDEX "tabelas_comerciais_produto_id_status_idx"
  ON "tabelas_comerciais"("produto_id", "status");
CREATE INDEX "tabelas_comerciais_categoria_status_idx"
  ON "tabelas_comerciais"("categoria", "status");
CREATE INDEX "tabelas_comerciais_codigo_idx" ON "tabelas_comerciais"("codigo");

CREATE UNIQUE INDEX "tabelas_comerciais_itens_tabela_credito_prazo_modalidade_key"
  ON "tabelas_comerciais_itens"("tabela_comercial_id", "credito_referencia", "prazo_meses", "modalidade");
CREATE INDEX "tabelas_comerciais_itens_tabela_modalidade_prazo_idx"
  ON "tabelas_comerciais_itens"("tabela_comercial_id", "modalidade", "prazo_meses");
CREATE INDEX "tabelas_comerciais_itens_codigo_externo_idx"
  ON "tabelas_comerciais_itens"("codigo_externo");

ALTER TABLE "tabelas_comerciais"
  ADD CONSTRAINT "tabelas_comerciais_administradora_id_fkey"
  FOREIGN KEY ("administradora_id") REFERENCES "administradoras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tabelas_comerciais"
  ADD CONSTRAINT "tabelas_comerciais_produto_id_fkey"
  FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tabelas_comerciais_itens"
  ADD CONSTRAINT "tabelas_comerciais_itens_tabela_comercial_id_fkey"
  FOREIGN KEY ("tabela_comercial_id") REFERENCES "tabelas_comerciais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
