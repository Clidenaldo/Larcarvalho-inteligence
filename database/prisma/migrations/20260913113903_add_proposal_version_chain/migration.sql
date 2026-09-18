-- AlterTable
ALTER TABLE "proposals" ADD COLUMN     "parent_id" UUID;

-- CreateIndex
CREATE INDEX "proposals_parent_id_idx" ON "proposals"("parent_id");

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
