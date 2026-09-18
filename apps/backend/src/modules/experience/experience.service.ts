import { hasPermission } from '../../core/auth/rbac.js';
import {
  adminThemeDefaults,
  adminThemeSchema,
  adminThemeFromAppearance,
  updateAdminThemeSchema,
  type UpdateAdminTheme,
  publicThemeDefaults,
  publicThemeSchema,
  updatePublicThemeSchema,
  type UpdatePublicTheme,
  interfacePreferencesSchema,
  type AppearanceConfiguration,
  type InterfacePreferences,
  type MyAccount,
  type UpdateAppearanceConfigurationRequest,
  type UpdateMyAccountRequest,
} from '@larcarvalho/shared';

import type { AuthContext } from '../../core/auth/auth-context.js';
import { AppError } from '../../core/errors/app-error.js';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import type { RequestMetadata } from '../identity/identity.service.js';

const defaultPreferences: InterfacePreferences = {
  density: 'comfortable',
  reducedMotion: false,
  theme: 'light',
};

const audit = (actor: AuthContext, request: RequestMetadata) => ({
  actorId: actor.user.id,
  ipAddress: request.ipAddress ?? null,
  userAgent: request.userAgent?.slice(0, 2048) ?? null,
});

function forbidden(message = 'Acesso não autorizado') {
  return new AppError({ code: 'FORBIDDEN', message, statusCode: 403 });
}

function appearanceDto(row: {
  active: boolean;
  accentColor: string;
  commercialName: string;
  createdAt: Date;
  darkBackground: string;
  id: string;
  lightBackground: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  updatedAt: Date;
  version: number;
  warningColor: string;
}): AppearanceConfiguration {
  return {
    ...row,
    accentColor: row.accentColor.trim(),
    createdAt: row.createdAt.toISOString(),
    darkBackground: row.darkBackground.trim(),
    lightBackground: row.lightBackground.trim(),
    primaryColor: row.primaryColor.trim(),
    secondaryColor: row.secondaryColor.trim(),
    updatedAt: row.updatedAt.toISOString(),
    warningColor: row.warningColor.trim(),
  };
}

function hexToRgb(color: string) {
  const value = color.replace('#', '');
  return {
    b: Number.parseInt(value.slice(4, 6), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    r: Number.parseInt(value.slice(0, 2), 16),
  };
}

function channel(value: number) {
  const normalized = value / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

export function contrastRatio(foreground: string, background: string): number {
  const fg = hexToRgb(foreground);
  const bg = hexToRgb(background);
  const fgLuminance =
    0.2126 * channel(fg.r) + 0.7152 * channel(fg.g) + 0.0722 * channel(fg.b);
  const bgLuminance =
    0.2126 * channel(bg.r) + 0.7152 * channel(bg.g) + 0.0722 * channel(bg.b);
  const lighter = Math.max(fgLuminance, bgLuminance);
  const darker = Math.min(fgLuminance, bgLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

export function assertAccessiblePalette(input: {
  accentColor: string;
  darkBackground: string;
  lightBackground: string;
  primaryColor: string;
  secondaryColor: string;
  warningColor: string;
}) {
  const white = '#ffffff';
  const checks = [
    ['cor primária sobre branco', input.primaryColor, white],
    ['cor secundária sobre branco', input.secondaryColor, white],
    ['cor de destaque sobre branco', input.accentColor, white],
    ['cor de alerta sobre branco', input.warningColor, white],
    [
      'texto escuro sobre fundo claro',
      input.darkBackground,
      input.lightBackground,
    ],
    ['texto branco sobre fundo escuro', white, input.darkBackground],
  ] as const;
  const failed = checks.find(
    ([, foreground, background]) => contrastRatio(foreground, background) < 4.5,
  );
  if (failed) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: `A paleta não atinge contraste AA para ${failed[0]}.`,
      statusCode: 400,
    });
  }
}

export class ExperienceService {
  constructor(private readonly db: PrismaClient) {}

  async getPublicTheme() {
    const row = await this.db.appearanceConfiguration.findFirst({
      where: { active: true },
      orderBy: [{ version: 'desc' }, { updatedAt: 'desc' }],
      select: { publicTheme: true },
    });
    return publicThemeSchema.parse(row?.publicTheme ?? publicThemeDefaults);
  }

  async updatePublicTheme(
    actor: AuthContext,
    input: UpdatePublicTheme,
    request: RequestMetadata,
    reset = false,
  ) {
    if (!hasPermission(actor, 'themes.public.manage'))
      throw forbidden(
        'Tema público pode ser alterado apenas por administradores',
      );
    const patch = updatePublicThemeSchema.parse(
      reset ? publicThemeDefaults : input,
    );
    return this.db.$transaction(async (tx) => {
      // Serialize writes, including first-time configuration creation.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(90421001)`;
      const current = await tx.appearanceConfiguration.findFirst({
        where: { active: true },
        orderBy: [{ version: 'desc' }, { updatedAt: 'desc' }],
      });
      const previous = publicThemeSchema.parse(
        current?.publicTheme ?? publicThemeDefaults,
      );
      const theme = publicThemeSchema.parse({ ...previous, ...patch });
      const row = current
        ? await tx.appearanceConfiguration.update({
            where: { id: current.id },
            data: { publicTheme: theme, version: { increment: 1 } },
          })
        : await tx.appearanceConfiguration.create({
            data: { publicTheme: theme },
          });
      const changedFields = Object.keys(patch).filter(
        (key) =>
          previous[key as keyof typeof previous] !==
          theme[key as keyof typeof theme],
      );
      await tx.auditLog.create({
        data: {
          ...audit(actor, request),
          action: reset ? 'PUBLIC_THEME_RESET' : 'PUBLIC_THEME_UPDATED',
          entity: 'AppearanceConfiguration',
          entityId: row.id,
          metadata: {
            changedFields,
            previousTheme: previous,
            theme,
            version: row.version,
          },
        },
      });
      return theme;
    });
  }

  async getAdminTheme() {
    const row = await this.db.appearanceConfiguration.findFirst({
      where: { active: true },
      orderBy: [{ version: 'desc' }, { updatedAt: 'desc' }],
    });
    return adminThemeSchema.parse(
      row?.adminTheme ?? adminThemeFromAppearance(row),
    );
  }

  async updateAdminTheme(
    actor: AuthContext,
    input: UpdateAdminTheme,
    request: RequestMetadata,
    reset = false,
  ) {
    if (!hasPermission(actor, 'themes.admin.manage'))
      throw forbidden(
        'Tema administrativo pode ser alterado apenas por administradores',
      );
    const patch = updateAdminThemeSchema.parse(
      reset ? adminThemeDefaults : input,
    );
    return this.db.$transaction(async (tx) => {
      // Same lock as public-theme writes: safe even when neither setting exists yet.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(90421001)`;
      const current = await tx.appearanceConfiguration.findFirst({
        where: { active: true },
        orderBy: [{ version: 'desc' }, { updatedAt: 'desc' }],
      });
      const previous = adminThemeSchema.parse(
        current?.adminTheme ?? adminThemeFromAppearance(current),
      );
      const theme = adminThemeSchema.parse({ ...previous, ...patch });
      const row = current
        ? await tx.appearanceConfiguration.update({
            where: { id: current.id },
            data: { adminTheme: theme, version: { increment: 1 } },
          })
        : await tx.appearanceConfiguration.create({
            data: { adminTheme: theme },
          });
      const changedFields = Object.keys(patch).filter(
        (key) =>
          previous[key as keyof typeof previous] !==
          theme[key as keyof typeof theme],
      );
      await tx.auditLog.create({
        data: {
          ...audit(actor, request),
          action: reset ? 'ADMIN_THEME_RESET' : 'ADMIN_THEME_UPDATED',
          entity: 'AppearanceConfiguration',
          entityId: row.id,
          metadata: {
            changedFields,
            previousTheme: previous,
            theme,
            version: row.version,
          },
        },
      });
      return theme;
    });
  }

  async getAppearance() {
    const row = await this.db.appearanceConfiguration.findFirst({
      where: { active: true },
      orderBy: [{ version: 'desc' }, { updatedAt: 'desc' }],
    });
    if (row) return appearanceDto(row);
    // The layout and settings page can initialize concurrently with a theme save.
    // Recheck under the theme lock so a new empty row cannot supersede that save.
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(90421001)`;
      const current = await tx.appearanceConfiguration.findFirst({
        where: { active: true },
        orderBy: [{ version: 'desc' }, { updatedAt: 'desc' }],
      });
      return appearanceDto(
        current ?? (await tx.appearanceConfiguration.create({ data: {} })),
      );
    });
  }

  async updateAppearance(
    actor: AuthContext,
    input: UpdateAppearanceConfigurationRequest,
    request: RequestMetadata,
  ) {
    if (!hasPermission(actor, 'themes.admin.manage')) {
      throw forbidden('Aparência pode ser alterada apenas por administradores');
    }
    const current = await this.getAppearance();
    const updated = await this.db.$transaction(async (tx) => {
      const row = await tx.appearanceConfiguration.update({
        where: { id: current.id },
        data: {
          ...(input.commercialName !== undefined
            ? { commercialName: input.commercialName }
            : {}),
          ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
          ...(input.primaryColor !== undefined
            ? { primaryColor: input.primaryColor }
            : {}),
          ...(input.secondaryColor !== undefined
            ? { secondaryColor: input.secondaryColor }
            : {}),
          ...(input.accentColor !== undefined
            ? { accentColor: input.accentColor }
            : {}),
          ...(input.warningColor !== undefined
            ? { warningColor: input.warningColor }
            : {}),
          ...(input.lightBackground !== undefined
            ? { lightBackground: input.lightBackground }
            : {}),
          ...(input.darkBackground !== undefined
            ? { darkBackground: input.darkBackground }
            : {}),
          version: { increment: 1 },
        },
      });
      await tx.auditLog.create({
        data: {
          ...audit(actor, request),
          action: 'APPEARANCE_CONFIGURATION_UPDATED',
          entity: 'AppearanceConfiguration',
          entityId: row.id,
          metadata: {
            previousVersion: current.version,
            version: row.version,
          },
        },
      });
      return row;
    });
    return appearanceDto(updated);
  }

  async getAccount(actor: AuthContext): Promise<MyAccount> {
    const user = await this.db.user.findUnique({
      where: { id: actor.user.id },
      select: {
        email: true,
        emailManaged: true,
        fotoUrl: true,
        id: true,
        interfacePreferences: true,
        nome: true,
        role: true,
        telefoneWhatsapp: true,
      },
    });
    if (!user) throw forbidden();
    const activity = await this.db.auditLog.findMany({
      where: { actorId: actor.user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { action: true, createdAt: true, entity: true },
    });
    return {
      ...user,
      fotoUrl: user.fotoUrl,
      interfacePreferences: interfacePreferencesSchema.parse(
        user.interfacePreferences ?? defaultPreferences,
      ),
      telefoneWhatsapp: user.telefoneWhatsapp,
      activity: activity.map((item) => ({
        action: item.action,
        createdAt: item.createdAt.toISOString(),
        entity: item.entity,
      })),
    };
  }

  async updateAccount(
    actor: AuthContext,
    input: UpdateMyAccountRequest,
    request: RequestMetadata,
  ) {
    const preferences =
      input.interfacePreferences === undefined
        ? undefined
        : ({
            ...defaultPreferences,
            ...input.interfacePreferences,
          } satisfies InterfacePreferences);
    await this.db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: actor.user.id },
        data: {
          ...(input.nome !== undefined ? { nome: input.nome } : {}),
          ...(input.telefoneWhatsapp !== undefined
            ? { telefoneWhatsapp: input.telefoneWhatsapp }
            : {}),
          ...(input.fotoUrl !== undefined ? { fotoUrl: input.fotoUrl } : {}),
          ...(preferences !== undefined
            ? { interfacePreferences: preferences as Prisma.InputJsonValue }
            : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          ...audit(actor, request),
          action: 'USER_PROFILE_UPDATED',
          entity: 'User',
          entityId: actor.user.id,
          metadata: {
            changedName: input.nome !== undefined,
            changedPhoto: input.fotoUrl !== undefined,
            changedPreferences: preferences !== undefined,
            changedPhone: input.telefoneWhatsapp !== undefined,
          },
        },
      });
    });
    return this.getAccount(actor);
  }
}
