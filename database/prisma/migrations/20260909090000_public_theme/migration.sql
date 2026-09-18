-- Additive only: existing administrator colors and public defaults are preserved.
ALTER TABLE "appearance_configurations" ADD COLUMN "public_theme" JSONB;
