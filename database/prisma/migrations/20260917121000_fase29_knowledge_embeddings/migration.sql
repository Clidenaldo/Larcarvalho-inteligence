-- Fase 29: embedding pipeline metadata (additive only, no vector column).
-- pgvector is NOT available in the provisioned PostgreSQL images, so no
-- vector storage is created here. Retrieval stays LEXICAL; SEMANTIC/HYBRID
-- answer VECTOR_SEARCH_UNAVAILABLE until a real vector index exists.

-- CreateEnum
CREATE TYPE "knowledge_embedding_status" AS ENUM ('NONE', 'PENDING', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "knowledge_documents" ADD COLUMN "embedding_status" "knowledge_embedding_status" NOT NULL DEFAULT 'NONE',
ADD COLUMN "embedding_provider" VARCHAR(40),
ADD COLUMN "embedding_model" VARCHAR(120),
ADD COLUMN "embedding_version" VARCHAR(40),
ADD COLUMN "embedded_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "knowledge_chunks" ADD COLUMN "embedding_status" "knowledge_embedding_status" NOT NULL DEFAULT 'NONE',
ADD COLUMN "embedding_model" VARCHAR(120),
ADD COLUMN "embedding_version" VARCHAR(40),
ADD COLUMN "embedded_at" TIMESTAMPTZ(3);
