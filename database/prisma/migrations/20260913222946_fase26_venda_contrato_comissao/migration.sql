-- CreateEnum
CREATE TYPE "sale_status" AS ENUM ('RASCUNHO', 'AGUARDANDO_DOCUMENTOS', 'DOCUMENTOS_RECEBIDOS', 'ENVIADA_ADMINISTRADORA', 'EM_ANALISE', 'APROVADA', 'CONTRATADA', 'RECUSADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "sale_origin" AS ENUM ('SIMULADOR_PUBLICO', 'CRM', 'INDICACAO', 'WHATSAPP', 'INSTAGRAM', 'SITE', 'MANUAL', 'OUTRO');

-- CreateEnum
CREATE TYPE "sale_cancel_reason" AS ENUM ('CLIENTE_DESISTIU', 'CREDITO_NEGADO', 'DOCUMENTACAO_REPROVADA', 'VALOR_ALTERADO', 'ESCOLHEU_CONCORRENTE', 'OUTRO');

-- CreateEnum
CREATE TYPE "contract_status" AS ENUM ('RASCUNHO', 'EMITIDO', 'ASSINADO', 'ATIVO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "sale_document_type" AS ENUM ('CPF', 'RG_CNH', 'COMPROVANTE_RESIDENCIA', 'COMPROVANTE_RENDA', 'FICHA_CADASTRAL', 'CONTRATO_ASSINADO', 'OUTRO');

-- CreateEnum
CREATE TYPE "sale_document_status" AS ENUM ('PENDENTE', 'RECEBIDO', 'VALIDADO', 'REJEITADO', 'DISPENSADO');

-- CreateEnum
CREATE TYPE "commission_type" AS ENUM ('PRINCIPAL', 'BONIFICACAO', 'CAMPANHA', 'REPASSE', 'ESTORNO');

-- CreateEnum
CREATE TYPE "commission_status" AS ENUM ('PREVISTA', 'CONFIRMADA', 'PARCIALMENTE_RECEBIDA', 'RECEBIDA', 'CANCELADA', 'ESTORNADA');

-- CreateEnum
CREATE TYPE "commission_base" AS ENUM ('CREDITO', 'TAXA_ADMINISTRACAO', 'PARCELA', 'VALOR_FIXO', 'OUTRA');

-- CreateEnum
CREATE TYPE "commission_reverse_reason" AS ENUM ('CANCELAMENTO_VENDA', 'PAGAMENTO_INDEVIDO', 'OUTRO');

-- CreateTable
CREATE TABLE "sales" (
    "id" UUID NOT NULL,
    "numero" VARCHAR(20) NOT NULL,
    "lead_id" UUID NOT NULL,
    "proposal_id" UUID NOT NULL,
    "proposal_item_id" UUID,
    "administradora_id" UUID,
    "produto_id" UUID,
    "grupo_id" UUID,
    "cota_id" UUID,
    "responsavel_user_id" UUID NOT NULL,
    "team_id" UUID,
    "origem_venda" "sale_origin" NOT NULL,
    "canal_venda" VARCHAR(120),
    "valor_credito_contratado" DECIMAL(19,2) NOT NULL,
    "valor_parcela_contratada" DECIMAL(19,2),
    "prazo_contratado" INTEGER,
    "status" "sale_status" NOT NULL DEFAULT 'RASCUNHO',
    "data_aceite" TIMESTAMPTZ(3) NOT NULL,
    "data_venda" TIMESTAMPTZ(3),
    "data_envio_administradora" TIMESTAMPTZ(3),
    "data_contratacao" TIMESTAMPTZ(3),
    "data_cancelamento" TIMESTAMPTZ(3),
    "motivo_cancelamento" "sale_cancel_reason",
    "observacoes" VARCHAR(2000),
    "snapshot" JSONB NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_status_history" (
    "id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "from_status" "sale_status",
    "to_status" "sale_status" NOT NULL,
    "changed_by_id" UUID NOT NULL,
    "reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_contracts" (
    "id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "numero_contrato" VARCHAR(100),
    "numero_proposta_administradora" VARCHAR(100),
    "numero_cota" VARCHAR(50),
    "grupo_codigo" VARCHAR(100),
    "status_contrato" "contract_status" NOT NULL DEFAULT 'RASCUNHO',
    "data_emissao" TIMESTAMPTZ(3),
    "data_assinatura" TIMESTAMPTZ(3),
    "data_inicio" TIMESTAMPTZ(3),
    "valor_credito" DECIMAL(19,2),
    "valor_parcela" DECIMAL(19,2),
    "prazo" INTEGER,
    "documento_referencia" VARCHAR(2048),
    "observacoes" VARCHAR(2000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sale_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_documents" (
    "id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "tipo" "sale_document_type" NOT NULL,
    "status" "sale_document_status" NOT NULL DEFAULT 'PENDENTE',
    "obrigatorio" BOOLEAN NOT NULL DEFAULT true,
    "referencia" VARCHAR(2048),
    "observacoes" VARCHAR(2000),
    "recebido_em" TIMESTAMPTZ(3),
    "validado_em" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sale_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commissions" (
    "id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "administradora_id" UUID,
    "tipo" "commission_type" NOT NULL DEFAULT 'PRINCIPAL',
    "status" "commission_status" NOT NULL DEFAULT 'PREVISTA',
    "base_calculo" "commission_base" NOT NULL,
    "base_valor" DECIMAL(19,2) NOT NULL,
    "percentual" DECIMAL(9,6),
    "valor_previsto" DECIMAL(19,2) NOT NULL,
    "valor_confirmado" DECIMAL(19,2),
    "valor_recebido" DECIMAL(19,2) NOT NULL DEFAULT 0,
    "competencia" VARCHAR(7) NOT NULL,
    "data_prevista_pagamento" TIMESTAMPTZ(3),
    "data_confirmacao" TIMESTAMPTZ(3),
    "data_recebimento" TIMESTAMPTZ(3),
    "referencia_externa" VARCHAR(200),
    "observacoes" VARCHAR(2000),
    "regra_snapshot" JSONB,
    "estorno_de_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_rules" (
    "id" UUID NOT NULL,
    "administradora_id" UUID NOT NULL,
    "produto_id" UUID,
    "categoria" VARCHAR(80),
    "tipo_base" "commission_base" NOT NULL,
    "percentual" DECIMAL(9,6),
    "valor_fixo" DECIMAL(19,2),
    "vigencia_inicio" DATE NOT NULL,
    "vigencia_fim" DATE,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "prioridade" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "commission_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_sequences" (
    "year" INTEGER NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sale_sequences_pkey" PRIMARY KEY ("year")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_numero_key" ON "sales"("numero");

-- CreateIndex
CREATE INDEX "sales_lead_id_created_at_idx" ON "sales"("lead_id", "created_at");

-- CreateIndex
CREATE INDEX "sales_proposal_id_idx" ON "sales"("proposal_id");

-- CreateIndex
CREATE INDEX "sales_responsavel_user_id_status_idx" ON "sales"("responsavel_user_id", "status");

-- CreateIndex
CREATE INDEX "sales_team_id_status_idx" ON "sales"("team_id", "status");

-- CreateIndex
CREATE INDEX "sales_status_created_at_idx" ON "sales"("status", "created_at");

-- CreateIndex
CREATE INDEX "sales_administradora_id_status_idx" ON "sales"("administradora_id", "status");

-- CreateIndex
CREATE INDEX "sale_status_history_sale_id_created_at_idx" ON "sale_status_history"("sale_id", "created_at");

-- CreateIndex
CREATE INDEX "sale_contracts_sale_id_created_at_idx" ON "sale_contracts"("sale_id", "created_at");

-- CreateIndex
CREATE INDEX "sale_documents_sale_id_status_idx" ON "sale_documents"("sale_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sale_documents_sale_id_tipo_key" ON "sale_documents"("sale_id", "tipo");

-- CreateIndex
CREATE INDEX "commissions_sale_id_status_idx" ON "commissions"("sale_id", "status");

-- CreateIndex
CREATE INDEX "commissions_administradora_id_competencia_idx" ON "commissions"("administradora_id", "competencia");

-- CreateIndex
CREATE INDEX "commissions_status_competencia_idx" ON "commissions"("status", "competencia");

-- CreateIndex
CREATE INDEX "commission_rules_administradora_id_ativo_idx" ON "commission_rules"("administradora_id", "ativo");

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_administradora_id_fkey" FOREIGN KEY ("administradora_id") REFERENCES "administradoras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "grupos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_cota_id_fkey" FOREIGN KEY ("cota_id") REFERENCES "cotas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_responsavel_user_id_fkey" FOREIGN KEY ("responsavel_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_status_history" ADD CONSTRAINT "sale_status_history_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_status_history" ADD CONSTRAINT "sale_status_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_contracts" ADD CONSTRAINT "sale_contracts_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_documents" ADD CONSTRAINT "sale_documents_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_administradora_id_fkey" FOREIGN KEY ("administradora_id") REFERENCES "administradoras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_estorno_de_id_fkey" FOREIGN KEY ("estorno_de_id") REFERENCES "commissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_administradora_id_fkey" FOREIGN KEY ("administradora_id") REFERENCES "administradoras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
