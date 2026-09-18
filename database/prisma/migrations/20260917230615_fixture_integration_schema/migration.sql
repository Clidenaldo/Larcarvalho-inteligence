/*
  Warnings:

  - Changed the type of `entity_type` on the `external_entity_mappings` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `tipo` on the `integrations` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "IntegrationConnectorType" AS ENUM ('MOCK', 'REST_API', 'SOAP', 'SFTP', 'FILE_PULL', 'WEBHOOK', 'MANUAL_IMPORT', 'FIXTURE');

-- CreateEnum
CREATE TYPE "IntegrationEntityType" AS ENUM ('ADMINISTRADORA', 'PRODUTO', 'GRUPO', 'COTA', 'ASSEMBLEIA', 'LANCE', 'CONTEMPLACAO', 'TABELA_COMERCIAL');

-- AlterTable
ALTER TABLE "external_entity_mappings" DROP COLUMN "entity_type",
ADD COLUMN     "entity_type" "IntegrationEntityType" NOT NULL;

-- AlterTable
ALTER TABLE "integrations" DROP COLUMN "tipo",
ADD COLUMN     "tipo" "IntegrationConnectorType" NOT NULL;

-- DropEnum
DROP TYPE "integration_connector_type";

-- DropEnum
DROP TYPE "integration_entity_type";

-- CreateIndex
CREATE INDEX "external_entity_mappings_entity_type_internal_id_idx" ON "external_entity_mappings"("entity_type", "internal_id");

-- CreateIndex
CREATE UNIQUE INDEX "external_entity_mappings_integration_id_entity_type_externa_key" ON "external_entity_mappings"("integration_id", "entity_type", "external_id");

-- CreateIndex
CREATE INDEX "integrations_tipo_status_idx" ON "integrations"("tipo", "status");

-- RenameIndex
ALTER INDEX "integration_staging_records_run_entity_external_key" RENAME TO "integration_staging_records_run_id_entity_type_external_id_key";

-- RenameIndex
ALTER INDEX "integration_webhook_events_integration_event_key" RENAME TO "integration_webhook_events_integration_id_event_id_key";
