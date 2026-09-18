import { describe, expect, it } from 'vitest';
import { publicThemeDefaults, adminThemeDefaults } from '@larcarvalho/shared';
import '../../src/config/load-env.js';
import { parseEnvironment } from '../../src/config/env.js';
import { createPrismaClient } from '../../src/infrastructure/database/prisma-client.js';
import type {
  PrismaClient,
  Prisma,
} from '../../src/generated/prisma/client.js';
import { ExperienceService } from '../../src/modules/experience/experience.service.js';

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)(
  'public theme PostgreSQL persistence (rolled back)',
  () => {
    it('persists and audits colors independently of admin colors, then restores defaults', async () => {
      const target = new URL(url!);
      if (
        !['localhost', '127.0.0.1'].includes(target.hostname) ||
        target.pathname !== '/larcarvalho_test'
      )
        throw new Error('Use the isolated local test database');
      const db = createPrismaClient(
        parseEnvironment({
          ...process.env,
          DATABASE_URL: url,
          NODE_ENV: 'test',
          LOG_LEVEL: 'silent',
        }),
      );
      const rollback = new Error('rollback public theme fixture');
      const id = crypto.randomUUID();
      try {
        await db
          .$transaction(
            async (tx) => {
              const latest = await tx.appearanceConfiguration.aggregate({
                _max: { version: true },
              });
              await tx.appearanceConfiguration.create({
                data: {
                  id,
                  version: (latest._max.version ?? 0) + 100,
                  primaryColor: '#987654',
                },
              });
              const user = await tx.user.create({
                data: {
                  email: `theme-${id}@example.test`,
                  nome: 'Theme test',
                  passwordHash: 'unused-in-transaction',
                  role: 'SUPER_ADMIN',
                },
              });
              // Reuse this transaction for service calls so the entire fixture rolls back.
              const scoped = new Proxy(tx, {
                get: (value, property) =>
                  property === '$transaction'
                    ? (
                        callback: (
                          client: Prisma.TransactionClient,
                        ) => Promise<unknown>,
                      ) => callback(tx)
                    : Reflect.get(value, property),
              }) as unknown as PrismaClient;
              const service = new ExperienceService(scoped);
              const actor = {
                sessionId: id,
                user: {
                  id: user.id,
                  email: user.email,
                  nome: user.nome,
                  role: 'SUPER_ADMIN' as const,
                },
              };
              expect(await service.getPublicTheme()).toEqual(
                publicThemeDefaults,
              );
              const changes = {
                primary: '#ffffff',
                background: '#112233',
                buttonPrimary: '#abcdef',
              };
              const originalAdmin = await service.getAdminTheme();
              expect(originalAdmin.primary).toBe('#987654');
              await service.updatePublicTheme(actor, changes, {});
              expect(await service.getAdminTheme()).toEqual(originalAdmin);
              const customizedAdmin = await service.updateAdminTheme(
                actor,
                {
                  sidebarBackground: '#123456',
                  cardBackground: '#aabbcc',
                },
                {},
              );
              expect(
                await new ExperienceService(scoped).getAdminTheme(),
              ).toEqual(customizedAdmin);
              expect(
                await new ExperienceService(scoped).getPublicTheme(),
              ).toMatchObject(changes);
              expect(
                (
                  await tx.appearanceConfiguration.findUniqueOrThrow({
                    where: { id },
                  })
                ).primaryColor,
              ).toBe('#987654');
              expect(
                await tx.auditLog.findFirst({
                  where: { actorId: user.id, action: 'PUBLIC_THEME_UPDATED' },
                }),
              ).toMatchObject({
                metadata: expect.objectContaining({
                  changedFields: ['primary', 'background', 'buttonPrimary'],
                }),
              });
              await service.updatePublicTheme(actor, {}, {}, true);
              expect(await service.getPublicTheme()).toEqual(
                publicThemeDefaults,
              );
              expect(await service.getAdminTheme()).toEqual(customizedAdmin);
              await service.updatePublicTheme(actor, changes, {});
              await service.updateAdminTheme(actor, {}, {}, true);
              expect(await service.getAdminTheme()).toEqual(adminThemeDefaults);
              expect(await service.getPublicTheme()).toMatchObject(changes);
              for (const action of [
                'PUBLIC_THEME_RESET',
                'ADMIN_THEME_UPDATED',
                'ADMIN_THEME_RESET',
              ]) {
                expect(
                  await tx.auditLog.count({
                    where: { actorId: user.id, action },
                  }),
                ).toBe(1);
              }
              throw rollback;
            },
            { timeout: 15000 },
          )
          .catch((error: unknown) => {
            if (error !== rollback) throw error;
          });
        expect(
          await db.appearanceConfiguration.findUnique({ where: { id } }),
        ).toBeNull();
      } finally {
        await db.$disconnect();
      }
    });
  },
);
