-- CreateEnum
CREATE TYPE "knowledge_category" AS ENUM ('MANUAL', 'REGULAMENTO', 'TABELA', 'PROCEDIMENTO', 'PRODUTO', 'COMERCIAL', 'INSTITUCIONAL', 'OUTRO');

-- CreateEnum
CREATE TYPE "knowledge_visibility" AS ENUM ('PUBLIC', 'TEAM', 'PRIVATE');

-- CreateEnum
CREATE TYPE "knowledge_document_status" AS ENUM ('PROCESSING', 'READY', 'FAILED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "knowledge_source_type" AS ENUM ('MANUAL', 'UPLOAD');

-- CreateEnum
CREATE TYPE "knowledge_ingestion_status" AS ENUM ('PENDING', 'EXTRACTING', 'CHUNKING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "knowledge_documents" (
    "id" UUID NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "description" VARCHAR(2000),
    "category" "knowledge_category" NOT NULL DEFAULT 'OUTRO',
    "visibility" "knowledge_visibility" NOT NULL DEFAULT 'PUBLIC',
    "status" "knowledge_document_status" NOT NULL DEFAULT 'PROCESSING',
    "source_type" "knowledge_source_type" NOT NULL DEFAULT 'MANUAL',
    "original_name" VARCHAR(300),
    "mime_type" VARCHAR(200),
    "size_bytes" INTEGER NOT NULL DEFAULT 0,
    "checksum" VARCHAR(128),
    "storage_key" VARCHAR(600),
    "content_text" TEXT,
    "owner_user_id" UUID,
    "team_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "document_group_id" UUID NOT NULL,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "chunk_count" INTEGER NOT NULL DEFAULT 0,
    "failure_reason" VARCHAR(500),
    "processed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_chunks" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "content_hash" CHAR(64) NOT NULL,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "section" VARCHAR(300),
    "page" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_ingestions" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "status" "knowledge_ingestion_status" NOT NULL DEFAULT 'PENDING',
    "chunks_created" INTEGER NOT NULL DEFAULT 0,
    "error" VARCHAR(500),
    "started_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_ingestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_documents_checksum_idx" ON "knowledge_documents"("checksum");

-- CreateIndex
CREATE INDEX "knowledge_documents_status_category_idx" ON "knowledge_documents"("status", "category");

-- CreateIndex
CREATE INDEX "knowledge_documents_visibility_team_id_idx" ON "knowledge_documents"("visibility", "team_id");

-- CreateIndex
CREATE INDEX "knowledge_documents_owner_user_id_idx" ON "knowledge_documents"("owner_user_id");

-- CreateIndex
CREATE INDEX "knowledge_documents_document_group_id_version_idx" ON "knowledge_documents"("document_group_id", "version");

-- CreateIndex
CREATE INDEX "knowledge_documents_category_created_at_idx" ON "knowledge_documents"("category", "created_at");

-- CreateIndex
CREATE INDEX "knowledge_chunks_document_id_idx" ON "knowledge_chunks"("document_id");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_chunks_document_id_ordinal_key" ON "knowledge_chunks"("document_id", "ordinal");

-- CreateIndex
CREATE INDEX "knowledge_ingestions_document_id_created_at_idx" ON "knowledge_ingestions"("document_id", "created_at");

-- Full text search (Portuguese) over chunk content. Immutable expression index.
CREATE INDEX "knowledge_chunks_search_idx" ON "knowledge_chunks" USING GIN (to_tsvector('portuguese', "content"));

-- AddForeignKey
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "knowledge_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_ingestions" ADD CONSTRAINT "knowledge_ingestions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "knowledge_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
