import { describe, expect, it, vi } from 'vitest';
import {
  evaluateAssembly,
  evaluateAward,
  evaluateEvent,
  evaluateGroup,
  evaluateProduct,
  evaluateQuota,
} from '../src/modules/data-quality/quality-rules.js';
import { hasPermission } from '../src/core/auth/rbac.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { DataQualityService } from '../src/modules/data-quality/data-quality.service.js';

describe('defensible data quality rules', () => {
  it('flags active products under inactive administrators only', () => {
    expect(
      evaluateProduct({
        id: 'p',
        ativo: true,
        administradoraId: 'a',
        administradora: { ativa: false },
      })[0]?.code,
    ).toBe('ACTIVE_CHILD_INACTIVE_PARENT');
    expect(
      evaluateProduct({
        id: 'p',
        ativo: false,
        administradoraId: 'a',
        administradora: { ativa: false },
      }),
    ).toEqual([]);
  });
  it('detects divergent group ownership and inactive parents', () => {
    const findings = evaluateGroup({
      id: 'g',
      status: 'ATIVO',
      administradoraId: 'a1',
      produtoId: 'p',
      administradora: { ativa: false },
      produto: { ativo: true, administradoraId: 'a2' },
    });
    expect(findings.map((item) => item.code)).toEqual([
      'ACTIVE_CHILD_INACTIVE_PARENT',
      'RELATIONSHIP_MISMATCH',
    ]);
    expect(
      evaluateGroup({
        id: 'g',
        status: 'ATIVO',
        administradoraId: 'a',
        produtoId: 'p',
        administradora: { ativa: true },
        produto: { ativo: false, administradoraId: 'a' },
      })[0]?.code,
    ).toBe('ACTIVE_CHILD_INACTIVE_PARENT');
  });
  it('checks quota term limits without inventing values', () => {
    expect(
      evaluateQuota({
        id: 'c',
        status: 'ATIVO',
        prazoRestante: 121,
        grupoId: 'g',
        grupo: {
          status: 'ATIVO',
          prazoMeses: 120,
          administradoraId: 'a',
          produtoId: null,
        },
      })[0]?.code,
    ).toBe('REMAINING_TERM_EXCEEDS_GROUP');
    expect(
      evaluateQuota({
        id: 'c',
        status: 'ATIVO',
        prazoRestante: null,
        grupoId: 'g',
        grupo: {
          status: 'ATIVO',
          prazoMeses: 120,
          administradoraId: 'a',
          produtoId: null,
        },
      }),
    ).toEqual([]);
    expect(
      evaluateQuota({
        id: 'c',
        status: 'ATIVO',
        prazoRestante: 120,
        grupoId: 'g',
        grupo: {
          status: 'ENCERRADO',
          prazoMeses: 120,
          administradoraId: 'a',
          produtoId: null,
        },
      })[0]?.code,
    ).toBe('ACTIVE_CHILD_INACTIVE_PARENT');
  });
  it('evaluates assembly time against an explicit clock', () => {
    const base = {
      id: 'x',
      grupoId: 'g',
      grupo: { administradoraId: 'a', produtoId: null },
    };
    expect(
      evaluateAssembly(
        {
          ...base,
          status: 'REALIZADA',
          dataAssembleia: new Date('2027-01-01T00:00:00Z'),
        },
        new Date('2026-01-01T00:00:00Z'),
      )[0]?.code,
    ).toBe('FUTURE_ASSEMBLY_COMPLETED');
    expect(
      evaluateAssembly(
        {
          ...base,
          status: 'REALIZADA',
          dataAssembleia: new Date('2025-01-01T00:00:00Z'),
        },
        new Date('2026-01-01T00:00:00Z'),
      ),
    ).toEqual([]);
    expect(
      evaluateAssembly(
        {
          ...base,
          status: 'AGENDADA',
          dataAssembleia: new Date('2025-01-01T00:00:00Z'),
        },
        new Date('2026-01-01T00:00:00Z'),
      )[0]?.code,
    ).toBe('PAST_ASSEMBLY_SCHEDULED');
  });
  it('detects cross-group events and suspicious awards', () => {
    const event = {
      id: 'e',
      cota: { grupoId: 'g2' },
      assembleia: {
        grupoId: 'g1',
        grupo: { administradoraId: 'a', produtoId: null },
      },
    };
    expect(evaluateEvent(event, 'Lance')[0]?.severity).toBe('CRITICAL');
    expect(
      evaluateAward({
        ...event,
        tipo: 'SORTEIO',
        valorLance: '10',
        percentualLance: null,
      }).map((item) => item.code),
    ).toEqual(['RELATIONSHIP_MISMATCH', 'SUSPICIOUS_VALUE']);
  });
});
describe('data quality scanner failures', () => {
  it('records a controlled failure and preserves the original error', async () => {
    const actions: string[] = [];
    const failure = new Error('database unavailable');
    const database = {
      auditLog: {
        create: vi.fn(({ data }: { data: { action: string } }) => {
          actions.push(data.action);
          return Promise.resolve({ id: 'scan-id' });
        }),
      },
      produto: { findMany: vi.fn(() => Promise.reject(failure)) },
    } as unknown as PrismaClient;
    const service = new DataQualityService(database);
    await expect(
      service.scan(
        {
          sessionId: 'session',
          user: {
            id: 'actor',
            nome: 'Admin',
            email: 'admin@example.com',
            role: 'SUPER_ADMIN',
          },
        },
        {},
      ),
    ).rejects.toBe(failure);
    expect(actions).toEqual([
      'DATA_QUALITY_SCAN_STARTED',
      'DATA_QUALITY_SCAN_FAILED',
    ]);
  });
});
describe('data quality RBAC', () => {
  it('matches the operational policy', () => {
    for (const role of ['SUPER_ADMIN', 'ADMIN', 'GESTOR'] as const) {
      expect(hasPermission(role, 'data_quality.resolve')).toBe(true);
      expect(hasPermission(role, 'data_quality.scan')).toBe(true);
    }
    expect(hasPermission('OPERADOR', 'data_quality.review')).toBe(true);
    expect(hasPermission('OPERADOR', 'data_quality.resolve')).toBe(false);
    expect(hasPermission('VENDEDOR', 'data_quality.read')).toBe(false);
    expect(hasPermission('VENDEDOR', 'data_quality.review')).toBe(false);
  });
});
