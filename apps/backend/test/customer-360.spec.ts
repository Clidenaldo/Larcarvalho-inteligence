import { describe, expect, it, vi } from 'vitest';

import type { AuthContext } from '../src/core/auth/auth-context.js';
import { AppError } from '../src/core/errors/app-error.js';
import { AiConfigService } from '../src/modules/ai/ai-config.service.js';
import type { AiContextBuilder } from '../src/modules/ai/ai-context-builder.js';
import { MockAiProvider } from '../src/modules/ai/ai-provider.js';
import { AiService } from '../src/modules/ai/ai.service.js';
import { FollowUpsService, isFollowUpOverdue } from '../src/modules/follow-ups/follow-ups.service.js';
import {
  PROFILE_COMPLETENESS_WEIGHTS,
  profileCompleteness,
  STALE_CONTACT_DAYS,
} from '../src/modules/portfolio/portfolio.service.js';
import { parseEnvironment } from '../src/config/env.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';

function actor(
  role: AuthContext['user']['role'],
  id = '00000000-0000-4000-8000-000000000001',
): AuthContext {
  return {
    sessionId: 'session-customer-360',
    teamIds: [],
    user: { email: 'vendedor@larcarvalho.com.br', id, nome: 'Vendedor Teste', role },
  };
}

function followUpRow(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    assignedUser: null,
    assignedUserId: null,
    completedAt: null,
    createdAt: now,
    createdBy: null,
    createdById: null,
    dueAt: new Date(now.getTime() + 86_400_000),
    id: 'f0000000-0000-4000-8000-000000000001',
    lead: { id: 'l0000000-0000-4000-8000-000000000001', nome: 'João Silva' },
    leadId: 'l0000000-0000-4000-8000-000000000001',
    notes: null,
    status: 'PENDING',
    title: 'Ligar para João',
    type: 'CALL',
    updatedAt: now,
    ...overrides,
  };
}

function mockDb(scenario: {
  readonly followUp?: Record<string, unknown> | null;
  readonly lead?: Record<string, unknown> | null;
  readonly user?: Record<string, unknown> | null;
}) {
  const row = scenario.followUp === undefined ? followUpRow() : scenario.followUp;
  const tx = {
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    followUp: {
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        ...followUpRow(),
        ...data,
      })),
      findUniqueOrThrow: vi.fn().mockResolvedValue(row),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const db = {
    $transaction: vi.fn(async (fn: (client: unknown) => Promise<unknown>) => fn(tx)),
    followUp: {
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(row),
      findMany: vi.fn().mockResolvedValue(row ? [row] : []),
    },
    lead: {
      findFirst: vi.fn().mockResolvedValue(scenario.lead === undefined ? { id: 'lead-1' } : scenario.lead),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue(scenario.user === undefined ? { ativo: true } : scenario.user),
    },
  } as unknown as PrismaClient;
  return { db, tx };
}

describe('cliente 360 e follow-ups', () => {
  it('calcula completude com pesos documentados que somam 100', () => {
    expect(Object.values(PROFILE_COMPLETENESS_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
    const full = profileCompleteness({
      categoriaInteresse: 'IMOVEL',
      dataPretendidaAquisicao: '2026-12-01',
      email: 'joao@exemplo.com.br',
      lanceDisponivelPercentual: '10',
      objetivo: 'Comprar imóvel',
      parcelaMaxima: '3000',
      prazoMaximo: 120,
      prazoMinimo: 60,
      telefone: null,
      valorCreditoDesejado: '300000',
    });
    expect(full.percent).toBe(100);
    expect(full.missingFields).toEqual([]);
    const empty = profileCompleteness({
      categoriaInteresse: null,
      dataPretendidaAquisicao: null,
      email: null,
      lanceDisponivelPercentual: null,
      objetivo: null,
      parcelaMaxima: null,
      prazoMaximo: null,
      prazoMinimo: null,
      telefone: null,
      valorCreditoDesejado: null,
    });
    expect(empty.percent).toBe(0);
    expect(empty.missingFields).toContain('parcela máxima');
    expect(empty.missingFields).toContain('data pretendida de aquisição');
  });

  it('define atraso de follow-up de forma determinística (PENDING + passado)', () => {
    const past = new Date(Date.now() - 1000);
    const future = new Date(Date.now() + 86_400_000);
    expect(isFollowUpOverdue({ dueAt: past, status: 'PENDING' })).toBe(true);
    expect(isFollowUpOverdue({ dueAt: future, status: 'PENDING' })).toBe(false);
    expect(isFollowUpOverdue({ dueAt: past, status: 'COMPLETED' })).toBe(false);
    expect(isFollowUpOverdue({ dueAt: past, status: 'CANCELED' })).toBe(false);
  });

  it('usa 7 dias como regra explícita de contato desatualizado', () => {
    expect(STALE_CONTACT_DAYS).toBe(7);
  });

  it('cria follow-up com auditoria sem exigir permissão nova', async () => {
    const { db, tx } = mockDb({});
    const service = new FollowUpsService(db);
    const created = await service.create(actor('VENDEDOR'), {
      dueAt: new Date(Date.now() + 86_400_000).toISOString(),
      leadId: 'l0000000-0000-4000-8000-000000000001',
      title: 'Ligar para João',
      type: 'CALL',
    });
    expect(created.title).toBe('Ligar para João');
    expect(created.isOverdue).toBe(false);
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'FOLLOWUP_CREATED' }) }),
    );
  });

  it('rejeita follow-up de lead fora do escopo sem revelar existência', async () => {
    const { db } = mockDb({ followUp: null, lead: null });
    const service = new FollowUpsService(db);
    await expect(
      service.create(actor('VENDEDOR'), {
        dueAt: new Date().toISOString(),
        leadId: 'lead-inexistente',
        title: 'X',
        type: 'CALL',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
    await expect(service.get(actor('VENDEDOR'), 'qualquer-id')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('rejeita responsável inválido e operador sem permissão', async () => {
    const { db } = mockDb({ user: null });
    const service = new FollowUpsService(db);
    await expect(
      service.create(actor('VENDEDOR'), {
        assignedUserId: '00000000-0000-4000-8000-000000000009',
        dueAt: new Date().toISOString(),
        leadId: 'lead-1',
        title: 'X',
        type: 'CALL',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', statusCode: 400 });
    const { db: db2 } = mockDb({});
    const denied = new FollowUpsService(db2);
    await expect(
      denied.create(actor('OPERADOR'), {
        dueAt: new Date().toISOString(),
        leadId: 'lead-1',
        title: 'X',
        type: 'CALL',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('conclui e cancela somente uma vez, com auditoria', async () => {
    const { db, tx } = mockDb({});
    tx.followUp.findUniqueOrThrow.mockResolvedValue(
      followUpRow({ completedAt: new Date(), status: 'COMPLETED' }),
    );
    const service = new FollowUpsService(db);
    const done = await service.setStatus(actor('VENDEDOR'), 'followup-1', {
      status: 'COMPLETED',
    });
    expect(done.status).toBe('COMPLETED');
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'FOLLOWUP_COMPLETED' }) }),
    );
    const finished = mockDb({ followUp: followUpRow({ status: 'COMPLETED' }) });
    const service2 = new FollowUpsService(finished.db);
    await expect(
      service2.setStatus(actor('VENDEDOR'), 'followup-1', { status: 'COMPLETED' }),
    ).rejects.toMatchObject({ code: 'CONFLICT', statusCode: 409 });
    await expect(
      service2.update(actor('VENDEDOR'), 'followup-1', { title: 'Novo' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('detecta conflito de edição concorrente', async () => {
    const { db, tx } = mockDb({});
    tx.followUp.updateMany.mockResolvedValue({ count: 0 });
    const service = new FollowUpsService(db);
    await expect(
      service.update(actor('VENDEDOR'), 'followup-1', { title: 'Novo' }),
    ).rejects.toMatchObject({ code: 'CONFLICT', statusCode: 409 });
  });

  it('ferramenta 360 mescla perfil, jornada e follow-ups com fontes', async () => {
    const builder = {
      buildCustomer360: vi.fn().mockResolvedValue({
        attentionPoints: ['Existe follow-up em atraso para este cliente.'],
        facts: [
          'Cliente: João Silva — status: QUALIFICADO',
          'Perfil comercial: 75% completo',
          'Jornada: 2 simulação(ões), 1 proposta(s)',
          'Follow-up pendente: Ligar — vencimento 2026-01-01 (em atraso)',
        ],
        missingInformation: ['Informação faltante: data pretendida de aquisição'],
        sources: [
          { kind: 'Cliente', label: 'Cliente — João' },
          { kind: 'Interações', label: 'Histórico de interações' },
        ],
      }),
    } as unknown as AiContextBuilder;
    const config = parseEnvironment({});
    const service = new AiService(
      config,
      new AiConfigService(config),
      new MockAiProvider(),
      builder,
    );
    const { response } = await service.chat(actor('VENDEDOR'), {
      contextId: 'lead-1',
      contextType: 'LEAD',
      message: 'Resuma este cliente',
      promptId: 'customer-360',
    });
    const text = response.response.facts.join('\n');
    expect(text).toContain('João Silva');
    expect(text).toContain('75% completo');
    expect(response.response.sources).toContainEqual({
      kind: 'Cliente',
      label: 'Cliente — João',
    });
  });

  it('resumo 360 nunca contém probabilidade de fechamento', async () => {
    const builder = {
      buildCustomer360: vi.fn().mockResolvedValue({
        attentionPoints: [],
        facts: ['Cliente: João Silva — status: QUALIFICADO', 'Perfil comercial: 75% completo'],
        missingInformation: [],
        sources: [{ kind: 'Cliente', label: 'Cliente — João' }],
      }),
    } as unknown as AiContextBuilder;
    const config = parseEnvironment({});
    const service = new AiService(
      config,
      new AiConfigService(config),
      new MockAiProvider(),
      builder,
    );
    const { response } = await service.chat(actor('VENDEDOR'), {
      contextId: 'lead-1',
      contextType: 'LEAD',
      message: 'Qual a chance de fechar?',
      promptId: 'customer-360',
    });
    const text = [
      response.response.summary,
      ...response.response.facts,
      ...(response.response.draft ? [response.response.draft] : []),
    ].join('\n');
    expect(text).not.toMatch(/chance de fechar|probabilidade|% de fechar/i);
  });

  it('lança AppError tipado em falhas de acesso', () => {
    const error = new AppError({ code: 'NOT_FOUND', message: 'x', statusCode: 404 });
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe('NOT_FOUND');
  });
});
