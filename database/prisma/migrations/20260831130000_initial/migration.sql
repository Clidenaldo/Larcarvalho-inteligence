-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "fonte_dados_tipo" AS ENUM ('API', 'CSV', 'XLSX', 'MANUAL', 'WEBSERVICE', 'PUBLIC_DATA', 'OUTRO');

-- CreateEnum
CREATE TYPE "importacao_status" AS ENUM ('PENDENTE', 'PROCESSANDO', 'CONCLUIDA', 'CONCLUIDA_COM_ERROS', 'FALHOU');

-- CreateEnum
CREATE TYPE "data_quality_severity" AS ENUM ('INFO', 'WARNING', 'ERROR', 'CRITICAL');

-- CreateTable
CREATE TABLE "administradoras" (
    "id" UUID NOT NULL,
    "nome" VARCHAR(200) NOT NULL,
    "nome_fantasia" VARCHAR(200),
    "cnpj" VARCHAR(14),
    "codigo_externo" VARCHAR(100),
    "site" VARCHAR(2048),
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "administradoras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produtos" (
    "id" UUID NOT NULL,
    "administradora_id" UUID NOT NULL,
    "nome" VARCHAR(200) NOT NULL,
    "categoria" VARCHAR(80) NOT NULL,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "codigo_externo" VARCHAR(100),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "produtos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grupos" (
    "id" UUID NOT NULL,
    "administradora_id" UUID NOT NULL,
    "produto_id" UUID,
    "codigo" VARCHAR(100) NOT NULL,
    "status" VARCHAR(80) NOT NULL,
    "data_inicio" DATE,
    "data_encerramento" DATE,
    "prazo_meses" INTEGER,
    "quantidade_cotas" INTEGER,
    "valor_credito_minimo" DECIMAL(19,2),
    "valor_credito_maximo" DECIMAL(19,2),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "grupos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cotas" (
    "id" UUID NOT NULL,
    "grupo_id" UUID NOT NULL,
    "numero" VARCHAR(50) NOT NULL,
    "status" VARCHAR(80) NOT NULL,
    "valor_credito" DECIMAL(19,2),
    "prazo_restante" INTEGER,
    "parcela_atual" DECIMAL(19,2),
    "codigo_externo" VARCHAR(100),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cotas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assembleias" (
    "id" UUID NOT NULL,
    "grupo_id" UUID NOT NULL,
    "numero" VARCHAR(50),
    "data_assembleia" TIMESTAMPTZ(3) NOT NULL,
    "status" VARCHAR(80) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "assembleias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lances" (
    "id" UUID NOT NULL,
    "assembleia_id" UUID NOT NULL,
    "cota_id" UUID,
    "tipo" VARCHAR(80) NOT NULL,
    "percentual" DECIMAL(9,6),
    "valor" DECIMAL(19,2),
    "contemplado" BOOLEAN,
    "origem" VARCHAR(80) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contemplacoes" (
    "id" UUID NOT NULL,
    "assembleia_id" UUID NOT NULL,
    "cota_id" UUID,
    "tipo" VARCHAR(80) NOT NULL,
    "codigo_externo" VARCHAR(100),
    "valor_lance" DECIMAL(19,2),
    "percentual_lance" DECIMAL(9,6),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contemplacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grupo_historicos" (
    "id" UUID NOT NULL,
    "grupo_id" UUID NOT NULL,
    "data_referencia" TIMESTAMPTZ(3) NOT NULL,
    "quantidade_participantes" INTEGER,
    "quantidade_cotas_ativas" INTEGER,
    "valor_credito_minimo" DECIMAL(19,2),
    "valor_credito_maximo" DECIMAL(19,2),
    "parcela_media" DECIMAL(19,2),
    "observacoes" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grupo_historicos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fontes_dados" (
    "id" UUID NOT NULL,
    "administradora_id" UUID,
    "nome" VARCHAR(200) NOT NULL,
    "tipo" "fonte_dados_tipo" NOT NULL,
    "descricao" TEXT,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fontes_dados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "importacoes" (
    "id" UUID NOT NULL,
    "fonte_dados_id" UUID NOT NULL,
    "nome_arquivo" VARCHAR(255),
    "status" "importacao_status" NOT NULL DEFAULT 'PENDENTE',
    "iniciada_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizada_em" TIMESTAMPTZ(3),
    "total_registros" INTEGER,
    "registros_validos" INTEGER,
    "registros_invalidos" INTEGER,
    "registros_criados" INTEGER,
    "registros_atualizados" INTEGER,
    "erro_resumo" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "importacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_quality_issues" (
    "id" UUID NOT NULL,
    "importacao_id" UUID,
    "entidade" VARCHAR(100) NOT NULL,
    "registro_id" VARCHAR(100),
    "campo" VARCHAR(100),
    "codigo" VARCHAR(100) NOT NULL,
    "severidade" "data_quality_severity" NOT NULL,
    "mensagem" TEXT NOT NULL,
    "resolvido" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),

    CONSTRAINT "data_quality_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrations" (
    "id" UUID NOT NULL,
    "administradora_id" UUID,
    "nome" VARCHAR(200) NOT NULL,
    "tipo" VARCHAR(100) NOT NULL,
    "status" VARCHAR(80) NOT NULL,
    "configuracao_nao_sensivel" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_logs" (
    "id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "tipo_operacao" VARCHAR(100) NOT NULL,
    "status" VARCHAR(80) NOT NULL,
    "iniciada_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizada_em" TIMESTAMPTZ(3),
    "registros_processados" INTEGER,
    "mensagem" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" VARCHAR(100),
    "action" VARCHAR(100) NOT NULL,
    "entity" VARCHAR(100) NOT NULL,
    "entity_id" VARCHAR(100),
    "metadata" JSONB,
    "ip_address" INET,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "administradoras_cnpj_key" ON "administradoras"("cnpj");

-- CreateIndex
CREATE INDEX "administradoras_nome_idx" ON "administradoras"("nome");

-- CreateIndex
CREATE INDEX "administradoras_ativa_idx" ON "administradoras"("ativa");

-- CreateIndex
CREATE INDEX "administradoras_codigo_externo_idx" ON "administradoras"("codigo_externo");

-- CreateIndex
CREATE INDEX "produtos_administradora_id_ativo_idx" ON "produtos"("administradora_id", "ativo");

-- CreateIndex
CREATE INDEX "produtos_administradora_id_categoria_idx" ON "produtos"("administradora_id", "categoria");

-- CreateIndex
CREATE INDEX "produtos_administradora_id_codigo_externo_idx" ON "produtos"("administradora_id", "codigo_externo");

-- CreateIndex
CREATE INDEX "grupos_administradora_id_status_idx" ON "grupos"("administradora_id", "status");

-- CreateIndex
CREATE INDEX "grupos_produto_id_idx" ON "grupos"("produto_id");

-- CreateIndex
CREATE UNIQUE INDEX "grupos_administradora_id_codigo_key" ON "grupos"("administradora_id", "codigo");

-- CreateIndex
CREATE INDEX "cotas_grupo_id_status_idx" ON "cotas"("grupo_id", "status");

-- CreateIndex
CREATE INDEX "cotas_grupo_id_codigo_externo_idx" ON "cotas"("grupo_id", "codigo_externo");

-- CreateIndex
CREATE UNIQUE INDEX "cotas_grupo_id_numero_key" ON "cotas"("grupo_id", "numero");

-- CreateIndex
CREATE INDEX "assembleias_grupo_id_data_assembleia_idx" ON "assembleias"("grupo_id", "data_assembleia");

-- CreateIndex
CREATE INDEX "assembleias_status_idx" ON "assembleias"("status");

-- CreateIndex
CREATE UNIQUE INDEX "assembleias_grupo_id_numero_key" ON "assembleias"("grupo_id", "numero");

-- CreateIndex
CREATE INDEX "lances_assembleia_id_tipo_idx" ON "lances"("assembleia_id", "tipo");

-- CreateIndex
CREATE INDEX "lances_cota_id_idx" ON "lances"("cota_id");

-- CreateIndex
CREATE INDEX "lances_contemplado_idx" ON "lances"("contemplado");

-- CreateIndex
CREATE INDEX "contemplacoes_assembleia_id_tipo_idx" ON "contemplacoes"("assembleia_id", "tipo");

-- CreateIndex
CREATE INDEX "contemplacoes_cota_id_idx" ON "contemplacoes"("cota_id");

-- CreateIndex
CREATE UNIQUE INDEX "contemplacoes_assembleia_id_codigo_externo_key" ON "contemplacoes"("assembleia_id", "codigo_externo");

-- CreateIndex
CREATE INDEX "grupo_historicos_data_referencia_idx" ON "grupo_historicos"("data_referencia");

-- CreateIndex
CREATE UNIQUE INDEX "grupo_historicos_grupo_id_data_referencia_key" ON "grupo_historicos"("grupo_id", "data_referencia");

-- CreateIndex
CREATE INDEX "fontes_dados_administradora_id_ativa_idx" ON "fontes_dados"("administradora_id", "ativa");

-- CreateIndex
CREATE INDEX "fontes_dados_tipo_ativa_idx" ON "fontes_dados"("tipo", "ativa");

-- CreateIndex
CREATE INDEX "importacoes_fonte_dados_id_status_idx" ON "importacoes"("fonte_dados_id", "status");

-- CreateIndex
CREATE INDEX "importacoes_status_created_at_idx" ON "importacoes"("status", "created_at");

-- CreateIndex
CREATE INDEX "data_quality_issues_importacao_id_severidade_idx" ON "data_quality_issues"("importacao_id", "severidade");

-- CreateIndex
CREATE INDEX "data_quality_issues_entidade_registro_id_idx" ON "data_quality_issues"("entidade", "registro_id");

-- CreateIndex
CREATE INDEX "data_quality_issues_resolvido_severidade_idx" ON "data_quality_issues"("resolvido", "severidade");

-- CreateIndex
CREATE INDEX "data_quality_issues_created_at_idx" ON "data_quality_issues"("created_at");

-- CreateIndex
CREATE INDEX "integrations_administradora_id_status_idx" ON "integrations"("administradora_id", "status");

-- CreateIndex
CREATE INDEX "integrations_tipo_status_idx" ON "integrations"("tipo", "status");

-- CreateIndex
CREATE INDEX "integration_logs_integration_id_status_idx" ON "integration_logs"("integration_id", "status");

-- CreateIndex
CREATE INDEX "integration_logs_iniciada_em_idx" ON "integration_logs"("iniciada_em");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_administradora_id_fkey" FOREIGN KEY ("administradora_id") REFERENCES "administradoras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grupos" ADD CONSTRAINT "grupos_administradora_id_fkey" FOREIGN KEY ("administradora_id") REFERENCES "administradoras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grupos" ADD CONSTRAINT "grupos_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotas" ADD CONSTRAINT "cotas_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "grupos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assembleias" ADD CONSTRAINT "assembleias_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "grupos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lances" ADD CONSTRAINT "lances_assembleia_id_fkey" FOREIGN KEY ("assembleia_id") REFERENCES "assembleias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lances" ADD CONSTRAINT "lances_cota_id_fkey" FOREIGN KEY ("cota_id") REFERENCES "cotas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contemplacoes" ADD CONSTRAINT "contemplacoes_assembleia_id_fkey" FOREIGN KEY ("assembleia_id") REFERENCES "assembleias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contemplacoes" ADD CONSTRAINT "contemplacoes_cota_id_fkey" FOREIGN KEY ("cota_id") REFERENCES "cotas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grupo_historicos" ADD CONSTRAINT "grupo_historicos_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "grupos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fontes_dados" ADD CONSTRAINT "fontes_dados_administradora_id_fkey" FOREIGN KEY ("administradora_id") REFERENCES "administradoras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "importacoes" ADD CONSTRAINT "importacoes_fonte_dados_id_fkey" FOREIGN KEY ("fonte_dados_id") REFERENCES "fontes_dados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_quality_issues" ADD CONSTRAINT "data_quality_issues_importacao_id_fkey" FOREIGN KEY ("importacao_id") REFERENCES "importacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_administradora_id_fkey" FOREIGN KEY ("administradora_id") REFERENCES "administradoras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_logs" ADD CONSTRAINT "integration_logs_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain-neutral data quality constraints maintained as SQL because Prisma
-- does not represent PostgreSQL CHECK constraints in the schema language.
ALTER TABLE "administradoras" ADD CONSTRAINT "administradoras_nome_ck" CHECK (length(btrim("nome")) > 0);
ALTER TABLE "administradoras" ADD CONSTRAINT "administradoras_cnpj_ck" CHECK ("cnpj" IS NULL OR "cnpj" ~ '^[0-9]{14}$');

ALTER TABLE "produtos" ADD CONSTRAINT "produtos_nome_categoria_ck" CHECK (length(btrim("nome")) > 0 AND length(btrim("categoria")) > 0);

ALTER TABLE "grupos" ADD CONSTRAINT "grupos_codigo_status_ck" CHECK (length(btrim("codigo")) > 0 AND length(btrim("status")) > 0);
ALTER TABLE "grupos" ADD CONSTRAINT "grupos_periodo_ck" CHECK ("data_encerramento" IS NULL OR "data_inicio" IS NULL OR "data_encerramento" >= "data_inicio");
ALTER TABLE "grupos" ADD CONSTRAINT "grupos_quantidades_ck" CHECK (("prazo_meses" IS NULL OR "prazo_meses" >= 0) AND ("quantidade_cotas" IS NULL OR "quantidade_cotas" >= 0));
ALTER TABLE "grupos" ADD CONSTRAINT "grupos_valores_credito_ck" CHECK (("valor_credito_minimo" IS NULL OR "valor_credito_minimo" >= 0) AND ("valor_credito_maximo" IS NULL OR "valor_credito_maximo" >= 0) AND ("valor_credito_minimo" IS NULL OR "valor_credito_maximo" IS NULL OR "valor_credito_maximo" >= "valor_credito_minimo"));

ALTER TABLE "cotas" ADD CONSTRAINT "cotas_numero_status_ck" CHECK (length(btrim("numero")) > 0 AND length(btrim("status")) > 0);
ALTER TABLE "cotas" ADD CONSTRAINT "cotas_valores_ck" CHECK (("valor_credito" IS NULL OR "valor_credito" >= 0) AND ("prazo_restante" IS NULL OR "prazo_restante" >= 0) AND ("parcela_atual" IS NULL OR "parcela_atual" >= 0));

ALTER TABLE "assembleias" ADD CONSTRAINT "assembleias_status_ck" CHECK (length(btrim("status")) > 0);

ALTER TABLE "lances" ADD CONSTRAINT "lances_tipo_origem_ck" CHECK (length(btrim("tipo")) > 0 AND length(btrim("origem")) > 0);
ALTER TABLE "lances" ADD CONSTRAINT "lances_valores_ck" CHECK (("percentual" IS NULL OR ("percentual" >= 0 AND "percentual" <= 100)) AND ("valor" IS NULL OR "valor" >= 0));

ALTER TABLE "contemplacoes" ADD CONSTRAINT "contemplacoes_tipo_ck" CHECK (length(btrim("tipo")) > 0);
ALTER TABLE "contemplacoes" ADD CONSTRAINT "contemplacoes_valores_ck" CHECK (("percentual_lance" IS NULL OR ("percentual_lance" >= 0 AND "percentual_lance" <= 100)) AND ("valor_lance" IS NULL OR "valor_lance" >= 0));

ALTER TABLE "grupo_historicos" ADD CONSTRAINT "grupo_historicos_quantidades_ck" CHECK (("quantidade_participantes" IS NULL OR "quantidade_participantes" >= 0) AND ("quantidade_cotas_ativas" IS NULL OR "quantidade_cotas_ativas" >= 0));
ALTER TABLE "grupo_historicos" ADD CONSTRAINT "grupo_historicos_valores_ck" CHECK (("valor_credito_minimo" IS NULL OR "valor_credito_minimo" >= 0) AND ("valor_credito_maximo" IS NULL OR "valor_credito_maximo" >= 0) AND ("parcela_media" IS NULL OR "parcela_media" >= 0) AND ("valor_credito_minimo" IS NULL OR "valor_credito_maximo" IS NULL OR "valor_credito_maximo" >= "valor_credito_minimo"));

ALTER TABLE "fontes_dados" ADD CONSTRAINT "fontes_dados_nome_ck" CHECK (length(btrim("nome")) > 0);

ALTER TABLE "importacoes" ADD CONSTRAINT "importacoes_periodo_ck" CHECK ("finalizada_em" IS NULL OR "finalizada_em" >= "iniciada_em");
ALTER TABLE "importacoes" ADD CONSTRAINT "importacoes_contagens_ck" CHECK (("total_registros" IS NULL OR "total_registros" >= 0) AND ("registros_validos" IS NULL OR "registros_validos" >= 0) AND ("registros_invalidos" IS NULL OR "registros_invalidos" >= 0) AND ("registros_criados" IS NULL OR "registros_criados" >= 0) AND ("registros_atualizados" IS NULL OR "registros_atualizados" >= 0));

ALTER TABLE "data_quality_issues" ADD CONSTRAINT "data_quality_issues_identificacao_ck" CHECK (length(btrim("entidade")) > 0 AND length(btrim("codigo")) > 0 AND length(btrim("mensagem")) > 0);
ALTER TABLE "data_quality_issues" ADD CONSTRAINT "data_quality_issues_resolucao_ck" CHECK ("resolvido" = ("resolved_at" IS NOT NULL));

ALTER TABLE "integrations" ADD CONSTRAINT "integrations_identificacao_ck" CHECK (length(btrim("nome")) > 0 AND length(btrim("tipo")) > 0 AND length(btrim("status")) > 0);

ALTER TABLE "integration_logs" ADD CONSTRAINT "integration_logs_identificacao_ck" CHECK (length(btrim("tipo_operacao")) > 0 AND length(btrim("status")) > 0);
ALTER TABLE "integration_logs" ADD CONSTRAINT "integration_logs_periodo_ck" CHECK ("finalizada_em" IS NULL OR "finalizada_em" >= "iniciada_em");
ALTER TABLE "integration_logs" ADD CONSTRAINT "integration_logs_contagem_ck" CHECK ("registros_processados" IS NULL OR "registros_processados" >= 0);

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_identificacao_ck" CHECK (length(btrim("action")) > 0 AND length(btrim("entity")) > 0);
