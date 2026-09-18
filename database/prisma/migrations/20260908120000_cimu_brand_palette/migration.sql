-- Aplica a paleta inspirada no CIMU (ajustada para contraste WCAG AA)
-- aos valores padrão e ao registro ativo de aparência.

ALTER TABLE "appearance_configurations"
  ALTER COLUMN "primary_color" SET DEFAULT '#34806b',
  ALTER COLUMN "secondary_color" SET DEFAULT '#000000',
  ALTER COLUMN "accent_color" SET DEFAULT '#c05400',
  ALTER COLUMN "warning_color" SET DEFAULT '#9a5b08',
  ALTER COLUMN "light_background" SET DEFAULT '#f2f2f2',
  ALTER COLUMN "dark_background" SET DEFAULT '#1a1a1a';

UPDATE "appearance_configurations"
SET
  "primary_color"    = '#34806b',
  "secondary_color"  = '#000000',
  "accent_color"     = '#c05400',
  "warning_color"    = '#9a5b08',
  "light_background" = '#f2f2f2',
  "dark_background"  = '#1a1a1a',
  "version"          = "version" + 1,
  "updated_at"       = CURRENT_TIMESTAMP
WHERE "active" = true;