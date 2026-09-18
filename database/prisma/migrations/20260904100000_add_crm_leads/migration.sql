CREATE TYPE "lead_origin" AS ENUM ('SIMULADOR_PUBLICO', 'CADASTRO_MANUAL', 'WHATSAPP', 'INDICACAO', 'OUTRO');
CREATE TYPE "lead_status" AS ENUM ('NOVO', 'EM_ATENDIMENTO', 'CONTATO_REALIZADO', 'QUALIFICADO', 'PROPOSTA', 'NEGOCIACAO', 'CONVERTIDO', 'PERDIDO');
CREATE TYPE "lead_loss_reason" AS ENUM ('SEM_INTERESSE', 'SEM_RETORNO', 'VALOR_INCOMPATIVEL', 'PARCELA_INCOMPATIVEL', 'PRAZO_INCOMPATIVEL', 'ESCOLHEU_CONCORRENTE', 'ADIADO', 'OUTRO');
CREATE TYPE "lead_interaction_type" AS ENUM ('NOTA', 'LIGACAO', 'WHATSAPP', 'EMAIL', 'REUNIAO', 'STATUS', 'OUTRO');

CREATE TABLE "leads" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "nome" VARCHAR(120) NOT NULL,
  "telefone_normalizado" VARCHAR(15), "email_normalizado" VARCHAR(254),
  "origem" "lead_origin" NOT NULL, "status" "lead_status" NOT NULL DEFAULT 'NOVO',
  "responsavel_id" UUID, "categoria_interesse" VARCHAR(80),
  "valor_credito_desejado" DECIMAL(19,2), "parcela_maxima" DECIMAL(19,2),
  "prazo_minimo" INTEGER, "prazo_maximo" INTEGER, "lance_disponivel_percentual" DECIMAL(7,4),
  "observacoes" VARCHAR(500), "proximo_contato_em" TIMESTAMPTZ(3), "convertido_em" TIMESTAMPTZ(3),
  "motivo_perda" "lead_loss_reason", "descricao_motivo_perda" VARCHAR(300),
  "consentimento_contato_em" TIMESTAMPTZ(3), "versao_texto_consentimento" VARCHAR(40),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "leads_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "leads_contact_check" CHECK ("telefone_normalizado" IS NOT NULL OR "email_normalizado" IS NOT NULL),
  CONSTRAINT "leads_loss_check" CHECK (("status" <> 'PERDIDO') OR "motivo_perda" IS NOT NULL),
  CONSTRAINT "leads_converted_check" CHECK (("status" <> 'CONVERTIDO') OR "convertido_em" IS NOT NULL)
);

CREATE TABLE "lead_interesses" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "lead_id" UUID NOT NULL, "grupo_id" UUID NOT NULL,
  "indice_aderencia_capturado" DECIMAL(7,4), "cobertura_avaliacao_capturada" DECIMAL(7,4),
  "capturado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "principal" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lead_interesses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lead_interesses_indice_check" CHECK ("indice_aderencia_capturado" BETWEEN 0 AND 100),
  CONSTRAINT "lead_interesses_cobertura_check" CHECK ("cobertura_avaliacao_capturada" BETWEEN 0 AND 100)
);

CREATE TABLE "lead_interacoes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "lead_id" UUID NOT NULL,
  "tipo" "lead_interaction_type" NOT NULL, "descricao" VARCHAR(2000) NOT NULL, "criado_por_id" UUID,
  "ocorrido_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lead_interacoes_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "leads" ADD CONSTRAINT "leads_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "lead_interesses" ADD CONSTRAINT "lead_interesses_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lead_interesses" ADD CONSTRAINT "lead_interesses_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "grupos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lead_interacoes" ADD CONSTRAINT "lead_interacoes_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lead_interacoes" ADD CONSTRAINT "lead_interacoes_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "leads_status_created_at_idx" ON "leads"("status", "created_at");
CREATE INDEX "leads_responsavel_id_status_idx" ON "leads"("responsavel_id", "status");
CREATE INDEX "leads_origem_created_at_idx" ON "leads"("origem", "created_at");
CREATE INDEX "leads_proximo_contato_em_status_idx" ON "leads"("proximo_contato_em", "status");
CREATE INDEX "leads_telefone_normalizado_idx" ON "leads"("telefone_normalizado");
CREATE INDEX "leads_email_normalizado_idx" ON "leads"("email_normalizado");
CREATE UNIQUE INDEX "lead_interesses_lead_id_grupo_id_key" ON "lead_interesses"("lead_id", "grupo_id");
CREATE UNIQUE INDEX "lead_interesses_one_principal_per_lead" ON "lead_interesses"("lead_id") WHERE "principal" = true;
CREATE INDEX "lead_interesses_grupo_id_created_at_idx" ON "lead_interesses"("grupo_id", "created_at");
CREATE INDEX "lead_interacoes_lead_id_ocorrido_em_created_at_idx" ON "lead_interacoes"("lead_id", "ocorrido_em", "created_at");
CREATE INDEX "lead_interacoes_criado_por_id_created_at_idx" ON "lead_interacoes"("criado_por_id", "created_at");
