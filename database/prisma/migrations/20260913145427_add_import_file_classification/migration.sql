-- CreateEnum
CREATE TYPE "arquivo_classificacao" AS ENUM ('COMMERCIAL_TABLE', 'GROUP_PORTFOLIO', 'QUOTA_PORTFOLIO', 'ASSEMBLY_HISTORY', 'MIXED');

-- AlterTable
ALTER TABLE "importacoes" ADD COLUMN     "classificacao_arquivo" "arquivo_classificacao";
