-- CreateEnum
CREATE TYPE "simulation_credit_mode" AS ENUM ('CONTRACTED_CREDIT', 'NET_CREDIT');

-- CreateEnum
CREATE TYPE "simulation_status" AS ENUM ('DRAFT', 'CALCULATED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "simulation_calculation_status" AS ENUM ('COMPLETE', 'INCOMPLETE_DATA', 'INELIGIBLE');

-- CreateEnum
CREATE TYPE "simulation_favorite_type" AS ENUM ('ADMINISTRATOR', 'PRODUCT', 'SIMULATION');

-- CreateEnum
CREATE TYPE "proposal_status" AS ENUM ('DRAFT', 'GENERATED', 'SENT', 'VIEWED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "commercial_rounding_mode" AS ENUM ('HALF_UP', 'UP', 'DOWN');

-- AlterTable
ALTER TABLE "data_quality_issues" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "external_entity_mappings" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "integration_runs" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "lead_interacoes" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "lead_interesses" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "leads" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "commercial_configurations" (
    "id" UUID NOT NULL,
    "organization_name" VARCHAR(200) NOT NULL DEFAULT 'Larcarvalho Consórcios',
    "currency" CHAR(3) NOT NULL DEFAULT 'BRL',
    "rounding_mode" "commercial_rounding_mode" NOT NULL DEFAULT 'HALF_UP',
    "proposal_validity_days" INTEGER NOT NULL DEFAULT 7,
    "rule_version_prefix" VARCHAR(20) NOT NULL DEFAULT 'LC',
    "required_disclaimer" VARCHAR(1000) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "commercial_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_commercial_rules" (
    "id" UUID NOT NULL,
    "administradora_id" UUID NOT NULL,
    "produto_id" UUID,
    "category" VARCHAR(80) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "version" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "valid_from" TIMESTAMPTZ(3) NOT NULL,
    "valid_until" TIMESTAMPTZ(3),
    "administration_fee_percent" DECIMAL(9,6),
    "administration_fee_amount" DECIMAL(19,2),
    "reserve_fund_percent" DECIMAL(9,6),
    "insurance_percent" DECIMAL(9,6),
    "insurance_amount" DECIMAL(19,2),
    "adhesion_fee_percent" DECIMAL(9,6),
    "adhesion_fee_amount" DECIMAL(19,2),
    "max_embedded_bid_percent" DECIMAL(9,6),
    "minimum_term_months" INTEGER,
    "maximum_term_months" INTEGER,
    "reduced_installment_percent" DECIMAL(9,6),
    "reduced_until_contemplation" BOOLEAN NOT NULL DEFAULT false,
    "in_progress_allowed" BOOLEAN NOT NULL DEFAULT false,
    "structured_operation_eligible" BOOLEAN NOT NULL DEFAULT false,
    "notes" VARCHAR(1000),
    "metadata" JSONB,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "product_commercial_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "simulations" (
    "id" UUID NOT NULL,
    "number" VARCHAR(30) NOT NULL,
    "created_by_id" UUID NOT NULL,
    "lead_id" UUID,
    "category" VARCHAR(80) NOT NULL,
    "credit_mode" "simulation_credit_mode" NOT NULL,
    "requested_credit" DECIMAL(19,2) NOT NULL,
    "desired_term_months" INTEGER NOT NULL,
    "own_bid_amount" DECIMAL(19,2) NOT NULL DEFAULT 0,
    "embedded_bid_percent" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "paid_installments" INTEGER NOT NULL DEFAULT 0,
    "structured_operation" BOOLEAN NOT NULL DEFAULT false,
    "selected_administrator_ids" JSONB,
    "selected_product_ids" JSONB,
    "selected_group_ids" JSONB,
    "selected_quota_ids" JSONB,
    "status" "simulation_status" NOT NULL DEFAULT 'DRAFT',
    "notes" VARCHAR(1000),
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "simulations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "simulation_scenarios" (
    "id" UUID NOT NULL,
    "simulation_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "sort_order" VARCHAR(40) NOT NULL DEFAULT 'ADHERENCE',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "parameters" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "simulation_scenarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "simulation_calculation_snapshots" (
    "id" UUID NOT NULL,
    "scenario_id" UUID NOT NULL,
    "engine_version" VARCHAR(40) NOT NULL,
    "input_snapshot" JSONB NOT NULL,
    "commercial_config_snapshot" JSONB NOT NULL,
    "rule_snapshots" JSONB NOT NULL,
    "source_data_snapshot" JSONB NOT NULL,
    "calculated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "simulation_calculation_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "simulation_results" (
    "id" UUID NOT NULL,
    "scenario_id" UUID NOT NULL,
    "calculation_snapshot_id" UUID NOT NULL,
    "commercial_rule_id" UUID NOT NULL,
    "administradora_id" UUID NOT NULL,
    "produto_id" UUID,
    "grupo_id" UUID,
    "cota_id" UUID,
    "calculation_status" "simulation_calculation_status" NOT NULL,
    "calculation_warnings" JSONB NOT NULL,
    "rule_version" VARCHAR(60) NOT NULL,
    "source_data_updated_at" TIMESTAMPTZ(3) NOT NULL,
    "administrator_name" VARCHAR(200) NOT NULL,
    "product_name" VARCHAR(200),
    "group_code" VARCHAR(100),
    "quota_number" VARCHAR(50),
    "category" VARCHAR(80) NOT NULL,
    "contracted_credit" DECIMAL(19,2),
    "net_credit" DECIMAL(19,2),
    "total_term_months" INTEGER,
    "remaining_term_months" INTEGER,
    "initial_installment" DECIMAL(19,2),
    "reduced_installment" DECIMAL(19,2),
    "later_installment" DECIMAL(19,2),
    "own_bid_amount" DECIMAL(19,2),
    "embedded_bid_amount" DECIMAL(19,2),
    "total_bid_amount" DECIMAL(19,2),
    "total_bid_percent" DECIMAL(9,6),
    "administration_fee" DECIMAL(19,2),
    "reserve_fund" DECIMAL(19,2),
    "insurance" DECIMAL(19,2),
    "adhesion_fee" DECIMAL(19,2),
    "adherence_score" INTEGER,
    "assumptions" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "simulation_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "simulation_favorites" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "simulation_favorite_type" NOT NULL,
    "administradora_id" UUID,
    "produto_id" UUID,
    "simulation_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "simulation_favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposals" (
    "id" UUID NOT NULL,
    "number" VARCHAR(30) NOT NULL,
    "simulation_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "status" "proposal_status" NOT NULL DEFAULT 'DRAFT',
    "title" VARCHAR(200) NOT NULL,
    "objective_summary" VARCHAR(1000) NOT NULL,
    "notes" VARCHAR(2000),
    "snapshot" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "issued_at" TIMESTAMPTZ(3),
    "valid_until" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposal_items" (
    "id" UUID NOT NULL,
    "proposal_id" UUID NOT NULL,
    "simulation_result_id" UUID,
    "position" INTEGER NOT NULL,
    "description" VARCHAR(300) NOT NULL,
    "financial_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proposal_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposal_status_history" (
    "id" UUID NOT NULL,
    "proposal_id" UUID NOT NULL,
    "from_status" "proposal_status",
    "to_status" "proposal_status" NOT NULL,
    "changed_by_id" UUID NOT NULL,
    "reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proposal_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "commercial_configurations_active_updated_at_idx" ON "commercial_configurations"("active", "updated_at");

-- CreateIndex
CREATE INDEX "product_commercial_rules_category_active_valid_from_idx" ON "product_commercial_rules"("category", "active", "valid_from");

-- CreateIndex
CREATE INDEX "product_commercial_rules_administradora_id_active_idx" ON "product_commercial_rules"("administradora_id", "active");

-- CreateIndex
CREATE INDEX "product_commercial_rules_produto_id_active_idx" ON "product_commercial_rules"("produto_id", "active");

-- CreateIndex
CREATE INDEX "product_commercial_rules_deleted_at_updated_at_idx" ON "product_commercial_rules"("deleted_at", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "product_commercial_rules_administradora_id_produto_id_categ_key" ON "product_commercial_rules"("administradora_id", "produto_id", "category", "version");

-- CreateIndex
CREATE UNIQUE INDEX "simulations_number_key" ON "simulations"("number");

-- CreateIndex
CREATE INDEX "simulations_created_by_id_created_at_idx" ON "simulations"("created_by_id", "created_at");

-- CreateIndex
CREATE INDEX "simulations_lead_id_created_at_idx" ON "simulations"("lead_id", "created_at");

-- CreateIndex
CREATE INDEX "simulations_category_status_created_at_idx" ON "simulations"("category", "status", "created_at");

-- CreateIndex
CREATE INDEX "simulations_status_created_at_idx" ON "simulations"("status", "created_at");

-- CreateIndex
CREATE INDEX "simulations_deleted_at_created_at_idx" ON "simulations"("deleted_at", "created_at");

-- CreateIndex
CREATE INDEX "simulation_scenarios_simulation_id_created_at_idx" ON "simulation_scenarios"("simulation_id", "created_at");

-- CreateIndex
CREATE INDEX "simulation_scenarios_simulation_id_pinned_idx" ON "simulation_scenarios"("simulation_id", "pinned");

-- CreateIndex
CREATE INDEX "simulation_calculation_snapshots_scenario_id_calculated_at_idx" ON "simulation_calculation_snapshots"("scenario_id", "calculated_at");

-- CreateIndex
CREATE INDEX "simulation_results_scenario_id_calculation_status_idx" ON "simulation_results"("scenario_id", "calculation_status");

-- CreateIndex
CREATE INDEX "simulation_results_administradora_id_category_idx" ON "simulation_results"("administradora_id", "category");

-- CreateIndex
CREATE INDEX "simulation_results_produto_id_created_at_idx" ON "simulation_results"("produto_id", "created_at");

-- CreateIndex
CREATE INDEX "simulation_results_grupo_id_created_at_idx" ON "simulation_results"("grupo_id", "created_at");

-- CreateIndex
CREATE INDEX "simulation_results_cota_id_created_at_idx" ON "simulation_results"("cota_id", "created_at");

-- CreateIndex
CREATE INDEX "simulation_results_created_at_idx" ON "simulation_results"("created_at");

-- CreateIndex
CREATE INDEX "simulation_favorites_user_id_type_created_at_idx" ON "simulation_favorites"("user_id", "type", "created_at");

-- CreateIndex
CREATE INDEX "simulation_favorites_administradora_id_idx" ON "simulation_favorites"("administradora_id");

-- CreateIndex
CREATE INDEX "simulation_favorites_produto_id_idx" ON "simulation_favorites"("produto_id");

-- CreateIndex
CREATE INDEX "simulation_favorites_simulation_id_idx" ON "simulation_favorites"("simulation_id");

-- CreateIndex
CREATE UNIQUE INDEX "simulation_favorites_user_id_type_administradora_id_produto_key" ON "simulation_favorites"("user_id", "type", "administradora_id", "produto_id", "simulation_id");

-- CreateIndex
CREATE UNIQUE INDEX "proposals_number_key" ON "proposals"("number");

-- CreateIndex
CREATE INDEX "proposals_lead_id_created_at_idx" ON "proposals"("lead_id", "created_at");

-- CreateIndex
CREATE INDEX "proposals_created_by_id_created_at_idx" ON "proposals"("created_by_id", "created_at");

-- CreateIndex
CREATE INDEX "proposals_status_created_at_idx" ON "proposals"("status", "created_at");

-- CreateIndex
CREATE INDEX "proposals_deleted_at_created_at_idx" ON "proposals"("deleted_at", "created_at");

-- CreateIndex
CREATE INDEX "proposal_items_simulation_result_id_idx" ON "proposal_items"("simulation_result_id");

-- CreateIndex
CREATE UNIQUE INDEX "proposal_items_proposal_id_position_key" ON "proposal_items"("proposal_id", "position");

-- CreateIndex
CREATE INDEX "proposal_status_history_proposal_id_created_at_idx" ON "proposal_status_history"("proposal_id", "created_at");

-- CreateIndex
CREATE INDEX "proposal_status_history_changed_by_id_created_at_idx" ON "proposal_status_history"("changed_by_id", "created_at");

-- AddForeignKey
ALTER TABLE "product_commercial_rules" ADD CONSTRAINT "product_commercial_rules_administradora_id_fkey" FOREIGN KEY ("administradora_id") REFERENCES "administradoras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_commercial_rules" ADD CONSTRAINT "product_commercial_rules_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulations" ADD CONSTRAINT "simulations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulations" ADD CONSTRAINT "simulations_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_scenarios" ADD CONSTRAINT "simulation_scenarios_simulation_id_fkey" FOREIGN KEY ("simulation_id") REFERENCES "simulations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_calculation_snapshots" ADD CONSTRAINT "simulation_calculation_snapshots_scenario_id_fkey" FOREIGN KEY ("scenario_id") REFERENCES "simulation_scenarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_results" ADD CONSTRAINT "simulation_results_scenario_id_fkey" FOREIGN KEY ("scenario_id") REFERENCES "simulation_scenarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_results" ADD CONSTRAINT "simulation_results_calculation_snapshot_id_fkey" FOREIGN KEY ("calculation_snapshot_id") REFERENCES "simulation_calculation_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_results" ADD CONSTRAINT "simulation_results_commercial_rule_id_fkey" FOREIGN KEY ("commercial_rule_id") REFERENCES "product_commercial_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_results" ADD CONSTRAINT "simulation_results_administradora_id_fkey" FOREIGN KEY ("administradora_id") REFERENCES "administradoras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_results" ADD CONSTRAINT "simulation_results_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_results" ADD CONSTRAINT "simulation_results_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "grupos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_results" ADD CONSTRAINT "simulation_results_cota_id_fkey" FOREIGN KEY ("cota_id") REFERENCES "cotas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_favorites" ADD CONSTRAINT "simulation_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_favorites" ADD CONSTRAINT "simulation_favorites_administradora_id_fkey" FOREIGN KEY ("administradora_id") REFERENCES "administradoras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_favorites" ADD CONSTRAINT "simulation_favorites_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_favorites" ADD CONSTRAINT "simulation_favorites_simulation_id_fkey" FOREIGN KEY ("simulation_id") REFERENCES "simulations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_simulation_id_fkey" FOREIGN KEY ("simulation_id") REFERENCES "simulations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_items" ADD CONSTRAINT "proposal_items_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_items" ADD CONSTRAINT "proposal_items_simulation_result_id_fkey" FOREIGN KEY ("simulation_result_id") REFERENCES "simulation_results"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_status_history" ADD CONSTRAINT "proposal_status_history_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_status_history" ADD CONSTRAINT "proposal_status_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "external_entity_mappings_integration_id_entity_type_external_id" RENAME TO "external_entity_mappings_integration_id_entity_type_externa_key";

-- RenameIndex
ALTER INDEX "tabelas_comerciais_deleted_at_administradora_id_status_inicio_v" RENAME TO "tabelas_comerciais_deleted_at_administradora_id_status_inic_idx";

-- RenameIndex
ALTER INDEX "tabelas_comerciais_itens_tabela_credito_prazo_modalidade_key" RENAME TO "tabelas_comerciais_itens_tabela_comercial_id_credito_refere_key";

-- RenameIndex
ALTER INDEX "tabelas_comerciais_itens_tabela_modalidade_prazo_idx" RENAME TO "tabelas_comerciais_itens_tabela_comercial_id_modalidade_pra_idx";
