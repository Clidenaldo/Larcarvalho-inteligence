import { dashboardQuerySchema } from '@larcarvalho/shared';
import { describe, expect, it } from 'vitest';

import { AppError } from '../src/core/errors/app-error.js';
import type { DashboardRepository } from '../src/modules/dashboard/dashboard.repository.js';
import {
  resolveDashboardPeriod,
  DashboardService,
} from '../src/modules/dashboard/dashboard.service.js';
import {
  fortalezaDayBounds,
  isLeadOverdue,
} from '../src/modules/leads/lead-rules.js';

const now = new Date('2026-09-03T12:00:00.000Z');

describe('dashboard business rules', () => {
  it('resolves today in America/Fortaleza independently from machine timezone', () => {
    const period = resolveDashboardPeriod(
      dashboardQuerySchema.parse({ period: 'today' }),
      now,
    );
    expect(period.from.toISOString()).toBe('2026-09-03T03:00:00.000Z');
    expect(period.to.toISOString()).toBe('2026-09-04T03:00:00.000Z');
    expect(period.previousFrom.toISOString()).toBe('2026-09-02T03:00:00.000Z');
  });

  it('creates an equivalent previous window for 30 days and custom periods', () => {
    const thirty = resolveDashboardPeriod(
      dashboardQuerySchema.parse({ period: '30d' }),
      now,
    );
    expect(thirty.to.getTime() - thirty.from.getTime()).toBe(30 * 86_400_000);
    expect(thirty.from.getTime() - thirty.previousFrom.getTime()).toBe(
      30 * 86_400_000,
    );
    const custom = resolveDashboardPeriod(
      dashboardQuerySchema.parse({
        period: 'custom',
        from: '2026-08-01',
        to: '2026-08-03',
      }),
      now,
    );
    expect(custom.to.getTime() - custom.from.getTime()).toBe(3 * 86_400_000);
  });

  it('rejects reversed and overlong custom windows', () => {
    expect(() =>
      dashboardQuerySchema.parse({
        period: 'custom',
        from: '2026-08-03',
        to: '2026-08-01',
      }),
    ).toThrow();
    expect(() =>
      dashboardQuerySchema.parse({
        period: 'custom',
        from: '2025-01-01',
        to: '2026-01-01',
      }),
    ).toThrow();
  });

  it('uses the centralized active/overdue rule and excludes terminal leads', () => {
    const bounds = fortalezaDayBounds(now);
    expect(bounds.start.toISOString()).toBe('2026-09-03T03:00:00.000Z');
    expect(
      isLeadOverdue(
        { status: 'NOVO', proximoContatoEm: new Date('2026-09-03T11:59:00Z') },
        now,
      ),
    ).toBe(true);
    expect(
      isLeadOverdue(
        {
          status: 'CONVERTIDO',
          proximoContatoEm: new Date('2026-09-03T11:59:00Z'),
        },
        now,
      ),
    ).toBe(false);
  });

  it('prevents a seller from selecting another responsible ID before any query', async () => {
    const repository = {
      operationalActivity: async () => ({ issues: [], runs: [], imports: [] }),
    } as unknown as DashboardRepository;
    const service = new DashboardService(repository);
    await expect(
      service.overview(
        {
          sessionId: 'session',
          user: {
            id: '67c84cbc-dc1d-4a24-8cfb-86a7ce99de10',
            nome: 'A',
            email: 'a@example.com',
            role: 'VENDEDOR',
          },
        },
        dashboardQuerySchema.parse({
          period: '30d',
          responsibleId: 'c96e1d76-ac63-40cc-90c4-e1a622af7d1a',
        }),
        now,
      ),
    ).rejects.toBeInstanceOf(AppError);
  });
});
