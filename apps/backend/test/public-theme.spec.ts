import { describe, expect, it, vi } from 'vitest';
import { publicThemeDefaults, type PublicTheme } from '@larcarvalho/shared';
import { buildApp } from '../src/app.js';
import { parseEnvironment } from '../src/config/env.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { ExperienceService } from '../src/modules/experience/experience.service.js';
import type { IdentityService } from '../src/modules/identity/identity.service.js';

function fixture() {
  let stored: PublicTheme | null = null;
  const audit = vi.fn().mockResolvedValue({});
  const update = vi.fn(
    async ({ data }: { data: { publicTheme: PublicTheme } }) => {
      stored = data.publicTheme;
      return { id: 'appearance', version: 2 };
    },
  );
  const transaction = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    appearanceConfiguration: {
      findFirst: async () => ({ id: 'appearance', publicTheme: stored }),
      update,
    },
    auditLog: { create: audit },
  };
  const db = {
    appearanceConfiguration: {
      findFirst: async () => ({ publicTheme: stored }),
    },
    $transaction: async (
      callback: (tx: typeof transaction) => Promise<unknown>,
    ) => callback(transaction),
  } as unknown as PrismaClient;
  return { db, service: new ExperienceService(db), update, audit };
}
const actor = {
  sessionId: 'session',
  user: {
    id: crypto.randomUUID(),
    email: 'test@example.com',
    nome: 'Admin',
    role: 'SUPER_ADMIN' as const,
  },
};

describe('public theme service and HTTP authorization', () => {
  it('loads defaults, persists changes, reloads in a new service and restores defaults with audit', async () => {
    const { db, service, update, audit } = fixture();
    expect(await service.getPublicTheme()).toEqual(publicThemeDefaults);
    const saved = await service.updatePublicTheme(
      actor,
      { primary: '#ffffff', background: '#010203', buttonPrimary: '#123456' },
      {},
    );
    expect(saved).toMatchObject({
      primary: '#ffffff',
      background: '#010203',
      buttonPrimary: '#123456',
    });
    expect(await new ExperienceService(db).getPublicTheme()).toEqual(saved);
    expect(update.mock.calls[0]?.[0].data).not.toHaveProperty('primaryColor');
    expect(audit.mock.calls[0]?.[0].data).toMatchObject({
      action: 'PUBLIC_THEME_UPDATED',
      actorId: actor.user.id,
      metadata: { changedFields: ['primary', 'background', 'buttonPrimary'] },
    });
    expect(
      await service.updatePublicTheme(actor, publicThemeDefaults, {}),
    ).toEqual(publicThemeDefaults);
  });
  it('serves only colors anonymously and protects updates and invalid values', async () => {
    const { service, update } = fixture();
    const identity = {
      authenticate: async (token: string) =>
        token === 'admin'
          ? actor
          : token === 'seller'
            ? { ...actor, user: { ...actor.user, role: 'VENDEDOR' } }
            : null,
    } as unknown as IdentityService;
    const app = await buildApp({
      config: parseEnvironment({
        NODE_ENV: 'test',
        FRONTEND_URL: 'http://frontend.test',
        LOG_LEVEL: 'silent',
      }),
      identityService: identity,
      experienceService: service,
      logger: false,
    });
    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/public/theme',
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(publicThemeDefaults);
      expect(response.headers['cache-control']).toBe('no-store');
      const patch = (token?: string, body: object = { primary: '#123456' }) =>
        app.inject({
          method: 'PATCH',
          url: '/api/v1/appearance/public-theme',
          headers: {
            origin: 'http://frontend.test',
            ...(token ? { cookie: `larcarvalho_session=${token}` } : {}),
          },
          payload: body,
        });
      expect((await patch()).statusCode).toBe(401);
      expect((await patch('seller')).statusCode).toBe(403);
      expect((await patch('admin', { primary: 'url(bad)' })).statusCode).toBe(
        400,
      );
      expect(update).not.toHaveBeenCalled();
      expect((await patch('admin')).statusCode).toBe(200);
      expect(
        (
          await app.inject({ method: 'GET', url: '/api/v1/public/theme' })
        ).json().primary,
      ).toBe('#123456');
    } finally {
      await app.close();
    }
  });
});
