-- CreateEnum
CREATE TYPE "embedded_bid_basis" AS ENUM ('CONTRACTED_CREDIT', 'PLAN_TOTAL');

-- CreateEnum
CREATE TYPE "bid_type" AS ENUM ('FIXED', 'FREE', 'PERCENTUAL');

-- AlterEnum
ALTER TYPE "simulation_credit_mode" ADD VALUE 'CATEGORY_VALUE';

-- AlterTable
ALTER TABLE "product_commercial_rules"
ADD COLUMN "embedded_bid_basis" "embedded_bid_basis" NOT NULL DEFAULT 'CONTRACTED_CREDIT',
ADD COLUMN "dilute_reduced_installments" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "category_value_credit_ratio" DECIMAL(9,6),
ADD COLUMN "bid_type" "bid_type" NOT NULL DEFAULT 'FREE',
ADD COLUMN "own_bid_max_percent" DECIMAL(9,6);