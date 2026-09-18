-- Distinguish commercial offers by plan as well as credit, term and modality.
-- Replace only the business-key index; preserve the primary key on id.
-- Keep the change atomic if creating the replacement index fails.
BEGIN;

DROP INDEX "public"."tabelas_comerciais_itens_tabela_comercial_id_credito_refere_key";

CREATE UNIQUE INDEX "tabelas_comerciais_itens_tabela_comercial_id_credito_refere_key"
ON "public"."tabelas_comerciais_itens"
("tabela_comercial_id", "credito_referencia", "prazo_meses", "modalidade", "codigo_plano");

COMMIT;
