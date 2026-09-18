-- PostgreSQL treats NULL values as distinct in composite unique constraints.
-- Partial indexes make each favorite target idempotent under concurrent requests.
CREATE UNIQUE INDEX "simulation_favorites_user_administrator_unique"
ON "simulation_favorites" ("user_id", "administradora_id")
WHERE "type" = 'ADMINISTRATOR' AND "administradora_id" IS NOT NULL;

CREATE UNIQUE INDEX "simulation_favorites_user_product_unique"
ON "simulation_favorites" ("user_id", "produto_id")
WHERE "type" = 'PRODUCT' AND "produto_id" IS NOT NULL;

CREATE UNIQUE INDEX "simulation_favorites_user_simulation_unique"
ON "simulation_favorites" ("user_id", "simulation_id")
WHERE "type" = 'SIMULATION' AND "simulation_id" IS NOT NULL;
