-- Fase 29: AI usage telemetry + versioned pricing (additive only).
-- No prompt/response content is stored here: telemetry only (tokens, cost, latency).

-- CreateTable
CREATE TABLE "ai_usage" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "provider" VARCHAR(20) NOT NULL,
    "model" VARCHAR(120) NOT NULL,
    "context_type" VARCHAR(40) NOT NULL,
    "prompt_id" VARCHAR(60),
    "prompt_version" VARCHAR(20),
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "total_tokens" INTEGER,
    "estimated" BOOLEAN NOT NULL DEFAULT false,
    "cost_micros" BIGINT,
    "currency" VARCHAR(8),
    "latency_ms" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "error_code" VARCHAR(80),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_pricing" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "model" VARCHAR(120) NOT NULL,
    "currency" VARCHAR(8) NOT NULL,
    "input_per_million_micros" BIGINT NOT NULL,
    "output_per_million_micros" BIGINT NOT NULL,
    "cached_per_million_micros" BIGINT,
    "valid_from" TIMESTAMPTZ(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ai_pricing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_usage_user_id_created_at_idx" ON "ai_usage"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_usage_created_at_idx" ON "ai_usage"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_pricing_provider_model_key" ON "ai_pricing"("provider", "model");
