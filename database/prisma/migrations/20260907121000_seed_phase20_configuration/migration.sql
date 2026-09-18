INSERT INTO "commercial_configurations" (
  "id",
  "organization_name",
  "currency",
  "rounding_mode",
  "proposal_validity_days",
  "rule_version_prefix",
  "required_disclaimer",
  "active",
  "version",
  "created_at",
  "updated_at"
) VALUES (
  '20000000-0000-4000-8000-000000000001',
  'Larcarvalho Consórcios',
  'BRL',
  'HALF_UP',
  7,
  'LC',
  'Esta simulação é informativa e utiliza exclusivamente as regras comerciais configuradas. Confirme as condições vigentes com a administradora antes da contratação.',
  true,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
) ON CONFLICT ("id") DO NOTHING;
