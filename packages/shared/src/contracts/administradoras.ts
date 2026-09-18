import { z } from 'zod';

export function normalizeCnpj(value: string): string {
  return value.replace(/\D/g, '');
}

export function isValidCnpj(value: string): boolean {
  const digits = normalizeCnpj(value);
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;

  const calculate = (length: number): number => {
    let factor = length - 7;
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(digits[index]) * factor;
      factor -= 1;
      if (factor === 1) factor = 9;
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  return (
    calculate(12) === Number(digits[12]) && calculate(13) === Number(digits[13])
  );
}

const optionalText = (maximum: number) =>
  z.preprocess(
    (value) =>
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().trim().min(1).max(maximum).optional(),
  );

const optionalCnpjSchema = z.preprocess((value) => {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  return normalizeCnpj(value);
}, z.string().length(14).refine(isValidCnpj, 'CNPJ inválido').optional());

const optionalSiteSchema = z.preprocess(
  (value) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  z
    .url()
    .max(2048)
    .refine(
      (value) => ['http:', 'https:'].includes(new URL(value).protocol),
      'URL deve usar http ou https',
    )
    .optional(),
);

const fields = {
  cnpj: optionalCnpjSchema,
  codigoExterno: optionalText(100),
  nome: z.string().trim().min(2).max(200),
  nomeFantasia: optionalText(200),
  site: optionalSiteSchema,
};

export const createAdministradoraRequestSchema = z.object(fields).strict();
export const updateAdministradoraRequestSchema = z
  .object(fields)
  .partial()
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    'Informe ao menos um campo',
  );
export const updateAdministradoraStatusRequestSchema = z
  .object({ ativa: z.boolean() })
  .strict();

export const administradoraSchema = z.object({
  ativa: z.boolean(),
  cnpj: z.string().length(14).nullable(),
  codigoExterno: z.string().nullable(),
  createdAt: z.iso.datetime(),
  id: z.uuid(),
  nome: z.string(),
  nomeFantasia: z.string().nullable(),
  site: z.string().nullable(),
  updatedAt: z.iso.datetime(),
});

export const administradoraListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.preprocess(
    (value) =>
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().trim().max(200).optional(),
  ),
  status: z.enum(['todas', 'ativas', 'inativas']).default('todas'),
});

export const administradoraListResponseSchema = z.object({
  items: z.array(administradoraSchema),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0),
});

export type Administradora = z.infer<typeof administradoraSchema>;
export type AdministradoraListQuery = z.infer<
  typeof administradoraListQuerySchema
>;
export type AdministradoraListResponse = z.infer<
  typeof administradoraListResponseSchema
>;
export type CreateAdministradoraRequest = z.infer<
  typeof createAdministradoraRequestSchema
>;
export type UpdateAdministradoraRequest = z.infer<
  typeof updateAdministradoraRequestSchema
>;
