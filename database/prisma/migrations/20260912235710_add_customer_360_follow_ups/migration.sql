-- CreateEnum
CREATE TYPE "follow_up_type" AS ENUM ('CALL', 'WHATSAPP', 'EMAIL', 'MEETING', 'OTHER');

-- CreateEnum
CREATE TYPE "follow_up_status" AS ENUM ('PENDING', 'COMPLETED', 'CANCELED');

-- AlterTable
ALTER TABLE "appearance_configurations" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "data_pretendida_aquisicao" DATE,
ADD COLUMN     "objetivo" VARCHAR(500),
ADD COLUMN     "restricoes" VARCHAR(1000);

-- CreateTable
CREATE TABLE "follow_ups" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "assigned_user_id" UUID,
    "due_at" TIMESTAMPTZ(3) NOT NULL,
    "type" "follow_up_type" NOT NULL DEFAULT 'CALL',
    "status" "follow_up_status" NOT NULL DEFAULT 'PENDING',
    "title" VARCHAR(200) NOT NULL,
    "notes" VARCHAR(2000),
    "completed_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "follow_ups_lead_id_due_at_idx" ON "follow_ups"("lead_id", "due_at");

-- CreateIndex
CREATE INDEX "follow_ups_assigned_user_id_status_due_at_idx" ON "follow_ups"("assigned_user_id", "status", "due_at");

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
