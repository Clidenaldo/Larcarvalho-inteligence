import { describe, expect, it, vi } from 'vitest';
import {
  adminThemeDefaults,
  adminThemeFromAppearance,
  publicThemeDefaults,
  type AdminTheme,
  type PublicTheme,
} from '@larcarvalho/shared';
import { ExperienceService } from '../src/modules/experience/experience.service.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import type { IdentityService } from '../src/modules/identity/identity.service.js';
import { buildApp } from '../src/app.js';
import { parseEnvironment } from '../src/config/env.js';

const actor = {
  sessionId: 'session',
  user: {
    id: crypto.randomUUID(),
    email: 'themes@example.test',
    nome: 'Themes',
    role: 'SUPER_ADMIN' as const,
  },
};
function fixture(empty = false) {
  const legacy = {
    primaryColor: '#123456',
    secondaryColor: '#000000',
    accentColor: '#c05400',
    warningColor: '#9a5b08',
    lightBackground: '#f2f2f2',
  };
  type Row = typeof legacy & {
    id: string;
    version: number;
    publicTheme: PublicTheme | null;
    adminTheme: AdminTheme | null;
  };
  let row: Row | null = empty
    ? null
    : {
        ...legacy,
        id: 'appearance',
        version: 1,
        publicTheme: null,
        adminTheme: null,
      };
  const audits = vi.fn().mockResolvedValue({});
  const appearanceConfiguration = {
    findFirst: async () => row,
    create: async ({
      data,
    }: {
      data: { adminTheme?: AdminTheme; publicTheme?: PublicTheme };
    }) => {
      row = {
        ...legacy,
        id: 'appearance',
        version: 1,
        publicTheme: null,
        adminTheme: null,
        ...data,
      };
      return row;
    },
    update: async ({
      data,
    }: {
      data: { adminTheme?: AdminTheme; publicTheme?: PublicTheme };
    }) => {
      if (!row) throw new Error('Missing fixture');
      row = { ...row, ...data, version: row.version + 1 };
      return row;
    },
  };
  const tx = {
    appearanceConfiguration,
    auditLog: { create: audits },
    $executeRaw: vi.fn().mockResolvedValue(1),
  };
  const db = {
    ...tx,
    $transaction: async (callback: (value: typeof tx) => Promise<unknown>) =>
      callback(tx),
  } as unknown as PrismaClient;
  return { db, service: new ExperienceService(db), audits, legacy };
}

describe('independent themes persistence and audit', () => {
  it('rechecks initialization under the lock instead of hiding a concurrently saved theme', async () => {
    const row = {
      id: crypto.randomUUID(),
      version: 2,
      active: true,
      primaryColor: '#34806b',
      secondaryColor: '#000000',
      accentColor: '#c05400',
      warningColor: '#9a5b08',
      lightBackground: '#f2f2f2',
      darkBackground: '#1a1a1a',
      commercialName: 'Larcarvalho',
      logoUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      adminTheme: { ...adminThemeDefaults, primary: '#123456' },
    };
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValue(row);
    const create = vi.fn();
    const tx = {
      appearanceConfiguration: { findFirst, create },
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const db = {
      ...tx,
      $transaction: async (callback: (value: typeof tx) => Promise<unknown>) =>
        callback(tx),
    } as unknown as PrismaClient;
    const service = new ExperienceService(db);
    expect((await service.getAppearance()).id).toBe(row.id);
    expect(create).not.toHaveBeenCalled();
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
    expect((await service.getAdminTheme()).primary).toBe('#123456');
  });
  it('keeps the existing admin palette as fallback and the public default independent', async () => {
    const { service, legacy } = fixture();
    expect(await service.getAdminTheme()).toEqual(
      adminThemeFromAppearance(legacy),
    );
    expect(await service.getPublicTheme()).toEqual(publicThemeDefaults);
    const missing = fixture(true);
    expect(await missing.service.getAdminTheme()).toEqual(adminThemeDefaults);
    expect(await missing.service.getPublicTheme()).toEqual(publicThemeDefaults);
    expect(missing.audits).not.toHaveBeenCalled();
  });
  it.each(['public', 'admin'] as const)(
    'can create the first %s configuration',
    async (area) => {
      const { service } = fixture(true);
      const saved =
        area === 'public'
          ? await service.updatePublicTheme(actor, { primary: '#aabbcc' }, {})
          : await service.updateAdminTheme(actor, { primary: '#aabbcc' }, {});
      expect(saved.primary).toBe('#aabbcc');
      expect(
        area === 'public'
          ? await service.getPublicTheme()
          : await service.getAdminTheme(),
      ).toEqual(saved);
    },
  );
  it('saves and resets each theme without changing its counterpart, including a new service instance', async () => {
    const { service, db, audits } = fixture();
    const originalAdmin = await service.getAdminTheme();
    const publicTheme = await service.updatePublicTheme(
      actor,
      { primary: '#abcdef', surface: '#112233' },
      {},
    );
    expect(await service.getAdminTheme()).toEqual(originalAdmin);
    const adminTheme = await service.updateAdminTheme(
      actor,
      { primary: '#456789', sidebarBackground: '#010203' },
      {},
    );
    expect(await service.getPublicTheme()).toEqual(publicTheme);
    const reloaded = new ExperienceService(db);
    expect(await reloaded.getAdminTheme()).toEqual(adminTheme);
    expect(await reloaded.getPublicTheme()).toEqual(publicTheme);
    await service.updatePublicTheme(actor, {}, {}, true);
    expect(await reloaded.getPublicTheme()).toEqual(publicThemeDefaults);
    expect(await reloaded.getAdminTheme()).toEqual(adminTheme);
    await service.updatePublicTheme(actor, publicTheme, {});
    await service.updateAdminTheme(actor, {}, {}, true);
    expect(await reloaded.getAdminTheme()).toEqual(adminThemeDefaults);
    expect(await reloaded.getPublicTheme()).toEqual(publicTheme);
    expect(audits.mock.calls.map(([input]) => input.data.action)).toEqual([
      'PUBLIC_THEME_UPDATED',
      'ADMIN_THEME_UPDATED',
      'PUBLIC_THEME_RESET',
      'PUBLIC_THEME_UPDATED',
      'ADMIN_THEME_RESET',
    ]);
    expect(audits.mock.calls[1]?.[0].data).toMatchObject({
      actorId: actor.user.id,
      metadata: {
        previousTheme: originalAdmin,
        theme: adminTheme,
        changedFields: ['primary', 'sidebarBackground'],
      },
    });
  });
  it('enforces roles in the service, even without the HTTP layer', async () => {
    const { service, audits } = fixture();
    const seller = {
      ...actor,
      user: { ...actor.user, role: 'VENDEDOR' as const },
    };
    await expect(
      service.updateAdminTheme(seller, adminThemeDefaults, {}),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      service.updatePublicTheme(seller, publicThemeDefaults, {}),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(audits).not.toHaveBeenCalled();
  });
});

describe('theme HTTP boundaries', () => {
  it('protects writes and resets, permits existing administrators and never exposes admin data publicly', async () => {
    const { service } = fixture();
    const identityService = {
      authenticate: async (token: string) =>
        ['SUPER_ADMIN', 'ADMIN', 'VENDEDOR'].includes(token)
          ? { ...actor, user: { ...actor.user, role: token } }
          : null,
    } as unknown as IdentityService;
    const app = await buildApp({
      config: parseEnvironment({
        NODE_ENV: 'test',
        FRONTEND_URL: 'http://frontend.test',
        LOG_LEVEL: 'silent',
      }),
      identityService,
      experienceService: service,
      logger: false,
    });
    try {
      for (const area of ['public', 'admin']) {
        for (const reset of [false, true]) {
          const send = (
            token?: string,
            origin = 'http://frontend.test',
            payload = reset ? {} : { primary: '#abcdef' },
          ) =>
            app.inject({
              method: reset ? 'POST' : 'PATCH',
              url: `/api/v1/appearance/${area}-theme${reset ? '/reset' : ''}`,
              headers: {
                origin,
                ...(token ? { cookie: `larcarvalho_session=${token}` } : {}),
              },
              payload,
            });
          expect((await send()).statusCode).toBe(401);
          expect((await send('VENDEDOR')).statusCode).toBe(403);
          expect(
            (await send('SUPER_ADMIN', 'http://untrusted.test')).statusCode,
          ).toBe(403);
          expect((await send('SUPER_ADMIN')).statusCode).toBe(200);
          expect((await send('ADMIN')).statusCode).toBe(200);
          if (!reset)
            expect(
              (
                await send('SUPER_ADMIN', 'http://frontend.test', {
                  primary: 'url(bad)',
                })
              ).statusCode,
            ).toBe(400);
        }
      }
      await service.updateAdminTheme(actor, { primary: '#987654' }, {});
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/public/theme',
      });
      expect(response.json()).toEqual(publicThemeDefaults);
      expect(response.body).not.toContain('987654');
      expect(response.body).not.toContain('adminTheme');
      expect(response.body).not.toContain('sidebar');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/api/v1/appearance/admin-theme',
          })
        ).statusCode,
      ).toBe(401);
      const admin = await app.inject({
        method: 'GET',
        url: '/api/v1/appearance/admin-theme',
        headers: { cookie: 'larcarvalho_session=VENDEDOR' },
      });
      expect(admin.statusCode).toBe(200);
      expect(admin.json().primary).toBe('#987654');
      expect(admin.headers['cache-control']).toBe('no-store');
    } finally {
      await app.close();
    }
  });
});
