import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseEnvironment } from '../src/config/env.js';
import type { AuthContext } from '../src/core/auth/auth-context.js';
import { AiConfigService } from '../src/modules/ai/ai-config.service.js';
import type { AiContextBuilder } from '../src/modules/ai/ai-context-builder.js';
import { MockAiProvider } from '../src/modules/ai/ai-provider.js';
import { AiService } from '../src/modules/ai/ai.service.js';
import {
  AgendaService,
  FOLLOWUP_LOOKAHEAD_DAYS,
  overdueReason,
  priorityFor,
} from '../src/modules/agenda/agenda.service.js';
import { fortalezaDayBounds } from '../src/modules/leads/lead-rules.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';

function actor(
  role: AuthContext['user']['role'],
  id = '00000000-0000-4000-8000-000000000001',
  teamIds: readonly string[] = [],
): AuthContext {
  return {
    sessionId: 'session-agenda',
    teamIds: [...teamIds],
    user: { email: 'vendedor@larcarvalho.com.br', id, nome: 'Vendedor Teste', role },
  };
}

function followUpRow(overrides: Record<string, unknown> = {}) {
  const base = {
    assignedUser: { id: 'u1', nome: 'Vendedor Teste' },
    dueAt: new Date('2026-09-12T12:00:00.000Z'),
    id: 'f0000000-0000-4000-8000-000000000001',
    lead: {
      categoriaInteresse: 'IMOVEL',
      id: 'l0000000-0000-4000-8000-000000000001',
      nome: 'João Silva',
      responsavel: { id: 'u1', nome: 'Vendedor Teste' },
      status: 'QUALIFICADO',
    },
    title: 'Ligar para João',
    type: 'CALL',
  };
  return { ...base, ...overrides };
}

function mockDb() {
  const db = {
    $transaction: vi.fn(async (queries: Promise<unknown>[]) => Promise.all(queries)),
    followUp: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    lead: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    proposal: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    sale: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaClient;
  return db;
}

describe('agenda comercial inteligente', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-12T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ordena prioridades de forma determinística e explicável', () => {
    expect(priorityFor('FOLLOWUP_OVERDUE')).toBe(1);
    expect(priorityFor('FOLLOWUP_TODAY')).toBe(2);
    expect(priorityFor('PROPOSAL_NO_FOLLOWUP')).toBe(3);
    expect(priorityFor('NO_NEXT_ACTION')).toBe(4);
    expect(priorityFor('STALE_CONTACT')).toBe(5);
    expect(priorityFor('FOLLOWUP_UPCOMING')).toBe(6);
    expect(FOLLOWUP_LOOKAHEAD_DAYS).toBe(7);
  });

  it('explica o motivo do atraso em dias corridos', () => {
    expect(overdueReason(new Date('2026-09-10T09:00:00.000Z'), new Date('2026-09-12T12:00:00.000Z'))).toBe(
      'Follow-up atrasado há 2 dia(s).',
    );
    expect(overdueReason(new Date('2026-09-12T09:00:00.000Z'), new Date('2026-09-12T12:00:00.000Z'))).toBe(
      'Follow-up com horário já passado hoje.',
    );
  });

  it('calcula "hoje" no fuso da operação na virada do dia', () => {
    // 23:59 em Fortaleza ainda pertence ao dia 11.
    vi.setSystemTime(new Date('2026-09-12T02:59:00.000Z'));
    expect(fortalezaDayBounds().start.toISOString()).toBe('2026-09-11T03:00:00.000Z');
    expect(fortalezaDayBounds().end.toISOString()).toBe('2026-09-12T03:00:00.000Z');
    // 00:01 em Fortaleza já pertence ao dia 12.
    vi.setSystemTime(new Date('2026-09-12T03:01:00.000Z'));
    expect(fortalezaDayBounds().start.toISOString()).toBe('2026-09-12T03:00:00.000Z');
  });

  it('classifica atrasados, hoje e próximos com totais reais', async () => {
    const db = mockDb();
    const overdue = followUpRow({ dueAt: new Date('2026-09-10T09:00:00.000Z') });
    const today = followUpRow({
      dueAt: new Date('2026-09-12T15:00:00.000Z'),
      id: 'f0000000-0000-4000-8000-000000000002',
    });
    const upcoming = followUpRow({
      dueAt: new Date('2026-09-15T09:00:00.000Z'),
      id: 'f0000000-0000-4000-8000-000000000003',
    });
    const findMany = db.followUp.findMany as unknown as { mockResolvedValueOnce: (v: unknown) => void };
    findMany.mockResolvedValueOnce([overdue]);
    findMany.mockResolvedValueOnce([today]);
    findMany.mockResolvedValueOnce([upcoming]);
    const service = new AgendaService(db);
    const agenda = await service.getAgenda(actor('VENDEDOR'), {
      days: 7,
      page: 1,
      pageSize: 50,
    });
    expect(agenda.overdue).toHaveLength(1);
    expect(agenda.overdue[0]?.priority).toBe(1);
    expect(agenda.overdue[0]?.reason).toContain('há 2 dia(s)');
    expect(agenda.today).toHaveLength(1);
    expect(agenda.today[0]?.reason).toContain('Vence hoje às');
    expect(agenda.upcoming).toHaveLength(1);
    expect(agenda.upcoming[0]?.priority).toBe(6);
  });

  it('aplica escopo do ator em todas as consultas (sem vazar)', async () => {
    const db = mockDb();
    const service = new AgendaService(db);
    await service.getAgenda(actor('VENDEDOR', 'user-1'), {
      days: 7,
      page: 1,
      pageSize: 50,
    });
    const calls = (db.followUp.findMany as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(JSON.stringify(calls[0])).toContain('user-1');
  });

  it('nega operador sem permissão de leitura', async () => {
    const db = mockDb();
    const service = new AgendaService(db);
    await expect(
      service.getAgenda(actor('OPERADOR'), { days: 7, page: 1, pageSize: 50 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('lista sem próxima ação e contato desatualizado sem estágios terminais', async () => {
    const db = mockDb();
    const leadRow = {
      categoriaInteresse: null,
      id: 'lead-1',
      interacoes: [],
      nome: 'Sem Ação',
      responsavel: null,
      status: 'QUALIFICADO',
    };
    const findMany = db.lead.findMany as unknown as { mockResolvedValueOnce: (v: unknown) => void };
    findMany.mockResolvedValueOnce([leadRow]);
    findMany.mockResolvedValueOnce([leadRow]);
    const service = new AgendaService(db);
    const agenda = await service.getAgenda(actor('VENDEDOR'), {
      days: 7,
      page: 1,
      pageSize: 50,
    });
    expect(agenda.noNextAction).toHaveLength(1);
    expect(agenda.noNextAction[0]?.reason).toBe('Não existe próxima ação cadastrada.');
    expect(agenda.staleContacts).toHaveLength(1);
    expect(agenda.staleContacts[0]?.reason).toContain('sem nenhuma interação');
  });

  it('monta distribuição da equipe e vendedores sem agenda futura', async () => {
    const db = mockDb();
    const pending = followUpRow({});
    const findMany = db.followUp.findMany as unknown as { mockResolvedValue: (v: unknown) => void };
    findMany.mockResolvedValue([pending]);
    const users = db.user.findMany as unknown as { mockResolvedValue: (v: unknown) => void };
    users.mockResolvedValue([
      { id: 'u1', nome: 'Vendedor Teste' },
      { id: 'u2', nome: 'Vendedor Livre' },
    ]);
    const service = new AgendaService(db);
    const team = await service.getTeamAgenda(actor('GESTOR', 'g1', ['team-1']), {
      days: 7,
      page: 1,
      pageSize: 50,
    });
    expect(team.distribution).toContainEqual({ nome: 'Vendedor Teste', overdue: 0, today: 1, userId: 'u1' });
    expect(team.withoutFutureAgenda).toContainEqual({ nome: 'Vendedor Livre', userId: 'u2' });
  });

  it('ferramenta "meu dia" usa agenda real com sequência explicável', async () => {
    const builder = {
      getMyAgendaFacts: vi.fn().mockResolvedValue({
        attentionPoints: ['1 follow-up(s) em atraso.'],
        facts: [
          'Follow-ups vencidos: 1',
          'Follow-ups para hoje: 2',
          'Prioridade 1: João Silva — Follow-up atrasado há 2 dia(s).',
        ],
        missingInformation: [],
        sources: [{ kind: 'Agenda', label: 'Minha agenda operacional' }],
      }),
    } as unknown as AiContextBuilder;
    const config = parseEnvironment({});
    const service = new AiService(config, new AiConfigService(config), new MockAiProvider(), builder);
    const { response } = await service.chat(actor('VENDEDOR'), {
      contextType: 'GENERAL',
      message: 'O que tenho para hoje?',
      promptId: 'my-day',
    });
    const text = response.response.facts.join('\n');
    expect(text).toContain('Follow-ups vencidos: 1');
    expect(text).toContain('Prioridade 1');
    expect(text).not.toMatch(/chance de fechar|probabilidade|score/i);
  });

  it('anexa rascunho de ação determinístico sem executar nada', async () => {
    const builder = {
      buildCustomer360: vi.fn().mockResolvedValue({
        attentionPoints: [],
        facts: ['Cliente: João Silva'],
        missingInformation: [],
        sources: [{ kind: 'Cliente', label: 'Cliente — João' }],
      }),
    } as unknown as AiContextBuilder;
    const config = parseEnvironment({});
    const service = new AiService(config, new AiConfigService(config), new MockAiProvider(), builder);
    const { response } = await service.chat(actor('VENDEDOR'), {
      contextId: 'lead-1',
      contextType: 'LEAD',
      message: 'Prepare uma mensagem de follow-up',
      promptId: 'follow-up-draft',
    });
    expect(response.response.suggestedAction).toMatchObject({
      leadId: 'lead-1',
      type: 'CREATE_FOLLOWUP',
    });
  });
});
