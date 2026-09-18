-- Existing administrative palettes remain the fallback; no data is rewritten.
ALTER TABLE "appearance_configurations" ADD COLUMN "admin_theme" JSONB;
