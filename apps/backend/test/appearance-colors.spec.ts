import { describe, expect, it, vi } from 'vitest';
import { updateAppearanceConfigurationRequestSchema } from '@larcarvalho/shared';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { ExperienceService } from '../src/modules/experience/experience.service.js';

describe('appearance color persistence', () => {
  it('saves low-contrast colors and records the audit entry', async () => {
    const row = {
      id: crypto.randomUUID(),
      commercialName: 'Larcarvalho',
      logoUrl: null,
      primaryColor: '#ffffff',
      secondaryColor: '#ffffff',
      accentColor: '#ffffff',
      warningColor: '#ffffff',
      lightBackground: '#ffffff',
      darkBackground: '#ffffff',
      active: true,
      version: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const update = vi.fn().mockResolvedValue(row);
    const audit = vi.fn().mockResolvedValue({});
    const transaction = {
      appearanceConfiguration: { update },
      auditLog: { create: audit },
    };
    const db = {
      appearanceConfiguration: {
        findFirst: vi.fn().mockResolvedValue({ ...row, version: 1 }),
      },
      $transaction: async (
        callback: (tx: typeof transaction) => Promise<unknown>,
      ) => callback(transaction),
    } as unknown as PrismaClient;
    const service = new ExperienceService(db);
    const input = updateAppearanceConfigurationRequestSchema.parse({
      primaryColor: '#ffffff',
      secondaryColor: '#ffffff',
      accentColor: '#ffffff',
      warningColor: '#ffffff',
      lightBackground: '#ffffff',
      darkBackground: '#ffffff',
    });
    const actor = {
      sessionId: crypto.randomUUID(),
      user: {
        id: crypto.randomUUID(),
        email: 'admin@example.com',
        nome: 'Admin',
        role: 'ADMIN' as const,
      },
    };
    const result = await service.updateAppearance(actor, input, {});
    expect(result).toMatchObject({ ...input, version: 2 });
    expect(update).toHaveBeenCalledWith({
      where: { id: row.id },
      data: { ...input, version: { increment: 1 } },
    });
    expect(audit).toHaveBeenCalledOnce();
    await expect(
      service.updateAppearance(
        { ...actor, user: { ...actor.user, role: 'VENDEDOR' } },
        input,
        {},
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(update).toHaveBeenCalledOnce();
  });
});
