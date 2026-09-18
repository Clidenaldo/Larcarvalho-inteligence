import { z } from 'zod';

import { userRoleSchema } from './auth.js';

const id = z.uuid();
const iso = z.iso.datetime();
const nullableUrl = z.string().trim().max(2048).pipe(z.url()).nullable();
const optionalNullableUrl = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  nullableUrl.optional(),
);
export const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Use uma cor hexadecimal no formato #RRGGBB')
  .transform((value) => value.toLowerCase());

export const interfacePreferencesSchema = z
  .object({
    density: z.enum(['comfortable', 'compact']).default('comfortable'),
    reducedMotion: z.boolean().default(false),
    theme: z.enum(['light', 'dark', 'system']).default('light'),
  })
  .strict();

export const appearanceConfigurationSchema = z.object({
  id,
  commercialName: z.string(),
  logoUrl: nullableUrl,
  primaryColor: hexColorSchema,
  secondaryColor: hexColorSchema,
  accentColor: hexColorSchema,
  warningColor: hexColorSchema,
  lightBackground: hexColorSchema,
  darkBackground: hexColorSchema,
  active: z.boolean(),
  version: z.number().int(),
  createdAt: iso,
  updatedAt: iso,
});

export const updateAppearanceConfigurationRequestSchema = z
  .object({
    commercialName: z.string().trim().min(2).max(200).optional(),
    logoUrl: optionalNullableUrl,
    primaryColor: hexColorSchema.optional(),
    secondaryColor: hexColorSchema.optional(),
    accentColor: hexColorSchema.optional(),
    warningColor: hexColorSchema.optional(),
    lightBackground: hexColorSchema.optional(),
    darkBackground: hexColorSchema.optional(),
  })
  .strict();

export const accountActivitySchema = z.object({
  action: z.string(),
  createdAt: iso,
  entity: z.string(),
});

export const myAccountSchema = z.object({
  id,
  nome: z.string(),
  email: z.string().email(),
  emailManaged: z.boolean(),
  role: userRoleSchema,
  telefoneWhatsapp: z.string().nullable(),
  fotoUrl: nullableUrl,
  interfacePreferences: interfacePreferencesSchema,
  activity: z.array(accountActivitySchema),
});

export const updateMyAccountRequestSchema = z
  .object({
    nome: z.string().trim().min(2).max(200).optional(),
    telefoneWhatsapp: z.preprocess(
      (value) =>
        typeof value === 'string' && value.trim() === '' ? null : value,
      z
        .string()
        .trim()
        .regex(/^[0-9+()\-\s]{8,30}$/, 'Telefone/WhatsApp invalido')
        .nullable()
        .optional(),
    ),
    fotoUrl: optionalNullableUrl,
    interfacePreferences: interfacePreferencesSchema.optional(),
  })
  .strict();

export type AccountActivity = z.infer<typeof accountActivitySchema>;
export type AppearanceConfiguration = z.infer<
  typeof appearanceConfigurationSchema
>;
export type InterfacePreferences = z.infer<typeof interfacePreferencesSchema>;
export type MyAccount = z.infer<typeof myAccountSchema>;
export type UpdateAppearanceConfigurationRequest = z.infer<
  typeof updateAppearanceConfigurationRequestSchema
>;
export type UpdateMyAccountRequest = z.infer<
  typeof updateMyAccountRequestSchema
>;
