ALTER TABLE "users"
  ADD COLUMN "telefone_whatsapp" VARCHAR(30),
  ADD COLUMN "foto_url" VARCHAR(2048),
  ADD COLUMN "interface_preferences" JSONB,
  ADD COLUMN "email_managed" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "appearance_configurations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "commercial_name" VARCHAR(200) NOT NULL DEFAULT 'Larcarvalho Consórcios',
  "logo_url" VARCHAR(2048),
  "primary_color" CHAR(7) NOT NULL DEFAULT '#0c6257',
  "secondary_color" CHAR(7) NOT NULL DEFAULT '#244b68',
  "accent_color" CHAR(7) NOT NULL DEFAULT '#9a6a00',
  "warning_color" CHAR(7) NOT NULL DEFAULT '#9a5b08',
  "light_background" CHAR(7) NOT NULL DEFAULT '#f4f7f8',
  "dark_background" CHAR(7) NOT NULL DEFAULT '#15232d',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "appearance_configurations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "appearance_configurations_active_updated_at_idx"
  ON "appearance_configurations"("active", "updated_at");

INSERT INTO "appearance_configurations" (
  "commercial_name",
  "primary_color",
  "secondary_color",
  "accent_color",
  "warning_color",
  "light_background",
  "dark_background",
  "active",
  "version"
) VALUES (
  'Larcarvalho Consórcios',
  '#0c6257',
  '#244b68',
  '#9a6a00',
  '#9a5b08',
  '#f4f7f8',
  '#15232d',
  true,
  1
);
