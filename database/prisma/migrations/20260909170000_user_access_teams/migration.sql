CREATE TYPE "permission_effect" AS ENUM ('ALLOW', 'DENY');
CREATE TABLE "teams" (
  "id" UUID NOT NULL, "name" VARCHAR(120) NOT NULL, "description" VARCHAR(1000),
  "manager_id" UUID, "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "teams_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "teams_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "teams_manager_id_active_idx" ON "teams"("manager_id", "active");
ALTER TABLE "users" ADD COLUMN "team_id" UUID;
ALTER TABLE "users" ADD CONSTRAINT "users_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "users_team_id_idx" ON "users"("team_id");
CREATE TABLE "user_permission_overrides" (
  "user_id" UUID NOT NULL, "permission" VARCHAR(100) NOT NULL, "effect" "permission_effect" NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "user_permission_overrides_pkey" PRIMARY KEY ("user_id", "permission"),
  CONSTRAINT "user_permission_overrides_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "seller_profiles" (
  "user_id" UUID NOT NULL, "registration" VARCHAR(80), "hired_at" DATE, "notes" VARCHAR(2000),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "seller_profiles_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "seller_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
