import { describe, expect, it } from 'vitest';

import {
  changePasswordRequestSchema,
  createCotaRequestSchema,
  createGrupoRequestSchema,
  createProdutoRequestSchema,
  createAssembleiaRequestSchema,
  createLanceRequestSchema,
  createContemplacaoRequestSchema,
  assembleiaListQuerySchema,
  createAdministradoraRequestSchema,
  isValidCnpj,
  normalizeCnpj,
  createUserRequestSchema,
  apiErrorResponseSchema,
  healthResponseSchema,
  readinessResponseSchema,
  perfilAderenciaSchema,
  calcularIndiceAderenciaRequestSchema,
  simuladorPublicoRequestSchema,
  publicLeadRequestSchema,
  changeLeadStatusRequestSchema,
  analyticsEventRequestSchema,
  analyticsQuerySchema,
} from '../src/index.js';

const baseTechnicalResponse = {
  requestId: 'request-1',
  service: 'backend',
  timestamp: '2026-08-31T12:00:00.000Z',
  version: 'v1',
} as const;

describe('shared API contracts', () => {
  it('strictly validates canonical analytics events without PII', () => {
    const event = {
      anonymousId: '00000000-0000-4000-8000-000000000001',
      type: 'LANDING_VIEWED',
      path: '/',
      category: null,
      metadata: { deviceClass: 'MOBILE' },
      utmSource: 'instagram',
      utmMedium: 'paid_social',
      utmCampaign: 'test',
      utmContent: null,
      utmTerm: null,
      referrerHost: 'instagram.com',
    };
    expect(analyticsEventRequestSchema.parse(event)).toEqual(event);
    expect(
      analyticsEventRequestSchema.safeParse({
        ...event,
        email: 'person@example.com',
      }).success,
    ).toBe(false);
    expect(
      analyticsEventRequestSchema.safeParse({ ...event, type: 'INVALID' })
        .success,
    ).toBe(false);
    expect(
      analyticsEventRequestSchema.safeParse({ ...event, category: 'UNKNOWN' })
        .success,
    ).toBe(false);
    expect(
      analyticsEventRequestSchema.safeParse({
        ...event,
        metadata: { creditBand: 'CREDIT_100K_300K', deviceClass: 'MOBILE' },
      }).success,
    ).toBe(true);
    expect(
      analyticsEventRequestSchema.safeParse({
        ...event,
        metadata: { creditBand: 'OVER_9000', deviceClass: 'MOBILE' },
      }).success,
    ).toBe(false);
  });

  it('requires ordered dates for custom analytics periods', () => {
    expect(
      analyticsQuerySchema.safeParse({
        period: 'custom',
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-09-02T00:00:00.000Z',
      }).success,
    ).toBe(true);
    expect(
      analyticsQuerySchema.safeParse({
        period: 'custom',
        from: '2026-09-02T00:00:00.000Z',
        to: '2026-09-01T00:00:00.000Z',
      }).success,
    ).toBe(false);
  });
  it('accepts the health response contract', () => {
    expect(
      healthResponseSchema.parse({
        ...baseTechnicalResponse,
        status: 'ok',
      }),
    ).toEqual({ ...baseTechnicalResponse, status: 'ok' });
  });

  it('accepts readiness without invented dependencies', () => {
    expect(
      readinessResponseSchema.parse({
        ...baseTechnicalResponse,
        checks: [],
        status: 'ready',
      }),
    ).toEqual({ ...baseTechnicalResponse, checks: [], status: 'ready' });
  });

  it('rejects an error without a request ID', () => {
    expect(() =>
      apiErrorResponseSchema.parse({
        error: { code: 'NOT_FOUND', message: 'Rota não encontrada' },
      }),
    ).toThrow();
  });

  it('enforces passphrases between 12 and 128 characters', () => {
    expect(() =>
      createUserRequestSchema.parse({
        email: 'admin@example.com',
        nome: 'Administrador',
        password: 'curta',
        role: 'ADMIN',
      }),
    ).toThrow();
    expect(() =>
      changePasswordRequestSchema.parse({
        currentPassword: 'senha atual longa',
        newPassword: 'x'.repeat(129),
      }),
    ).toThrow();
  });

  it('rejects unknown roles and invalid emails', () => {
    expect(() =>
      createUserRequestSchema.parse({
        email: 'not-an-email',
        nome: 'Usuário',
        password: 'uma frase senha válida',
        role: 'OWNER',
      }),
    ).toThrow();
  });

  it('normalizes and validates CNPJ and commercial URLs', () => {
    expect(normalizeCnpj('04.252.011/0001-10')).toBe('04252011000110');
    expect(isValidCnpj('04.252.011/0001-10')).toBe(true);
    expect(isValidCnpj('11.111.111/1111-11')).toBe(false);
    expect(
      createAdministradoraRequestSchema.parse({
        cnpj: '04.252.011/0001-10',
        nome: 'Administradora Exemplo',
        site: 'https://example.com',
      }),
    ).toMatchObject({ cnpj: '04252011000110' });
    expect(() =>
      createAdministradoraRequestSchema.parse({
        nome: 'Administradora Exemplo',
        site: 'ftp://example.com',
      }),
    ).toThrow();
  });

  it('validates operational categories, dates, values and quota fields', () => {
    expect(
      createProdutoRequestSchema.parse({
        administradoraId: '3343309c-541f-4457-8d6b-a42f7e02bd9c',
        categoria: 'IMOVEL',
        nome: 'Imóvel',
      }).categoria,
    ).toBe('IMOVEL');
    expect(() =>
      createGrupoRequestSchema.parse({
        administradoraId: '3343309c-541f-4457-8d6b-a42f7e02bd9c',
        codigo: 'G1',
        status: 'ATIVO',
        dataInicio: '2026-02-01',
        dataEncerramento: '2026-01-01',
      }),
    ).toThrow();
    expect(() =>
      createGrupoRequestSchema.parse({
        administradoraId: '3343309c-541f-4457-8d6b-a42f7e02bd9c',
        codigo: 'G1',
        status: 'ATIVO',
        valorCreditoMinimo: '20.00',
        valorCreditoMaximo: '10.00',
      }),
    ).toThrow();
    expect(() =>
      createCotaRequestSchema.parse({
        grupoId: '3343309c-541f-4457-8d6b-a42f7e02bd9c',
        numero: '001',
        status: 'ATIVO',
        prazoRestante: -1,
      }),
    ).toThrow();
  });

  it('validates historical dates, decimals and generic classifications', () => {
    const assembleia = createAssembleiaRequestSchema.parse({
      grupoId: '3343309c-541f-4457-8d6b-a42f7e02bd9c',
      dataAssembleia: '2026-09-01',
      status: 'REALIZADA',
    });
    expect(assembleia.dataAssembleia).toBe('2026-09-01T00:00:00.000Z');
    expect(() =>
      assembleiaListQuerySchema.parse({
        dataInicio: '2026-09-02',
        dataFim: '2026-09-01',
      }),
    ).toThrow();
    expect(() =>
      createLanceRequestSchema.parse({
        assembleiaId: '3343309c-541f-4457-8d6b-a42f7e02bd9c',
        tipo: 'LIVRE',
        origem: 'MANUAL',
        percentual: '-1',
      }),
    ).toThrow();
    expect(() =>
      createContemplacaoRequestSchema.parse({
        assembleiaId: '3343309c-541f-4457-8d6b-a42f7e02bd9c',
        tipo: 'SORTEIO',
        valorLance: '-10',
      }),
    ).toThrow();
  });

  it('requires a supported scoring criterion for an adherence profile', () => {
    expect(() =>
      perfilAderenciaSchema.parse({ categoria: 'IMOVEL' }),
    ).toThrow();
    expect(
      perfilAderenciaSchema.parse({
        categoria: 'IMOVEL',
        lanceDisponivelPercentual: '32.5',
      }),
    ).toMatchObject({ lanceDisponivelPercentual: '32.5' });
    expect(() =>
      perfilAderenciaSchema.parse({ lanceDisponivelPercentual: '100.1' }),
    ).toThrow();
  });

  it('limits adherence calculation to four unique group IDs', () => {
    const id = '3343309c-541f-4457-8d6b-a42f7e02bd9c';
    expect(() =>
      calcularIndiceAderenciaRequestSchema.parse({
        perfil: { valorCreditoDesejado: '100000' },
        grupoIds: [id, id],
      }),
    ).toThrow();
  });

  it('validates the minimal public simulation profile and abuse limits', () => {
    expect(
      simuladorPublicoRequestSchema.parse({
        perfil: { categoria: 'IMOVEL', valorCreditoDesejado: '150000' },
      }),
    ).toMatchObject({ page: 1, pageSize: 6 });
    expect(() =>
      simuladorPublicoRequestSchema.parse({
        perfil: { categoria: 'INVALIDA', valorCreditoDesejado: '-1' },
        pageSize: 1_000,
        incluirInativos: true,
      }),
    ).toThrow();
    expect(() =>
      simuladorPublicoRequestSchema.parse({
        perfil: {
          categoria: 'IMOVEL',
          valorCreditoDesejado: '150000',
          incluirInativos: true,
        },
      }),
    ).toThrow();
  });

  it('normalizes lead identity and requires one contact plus consent', () => {
    expect(
      publicLeadRequestSchema.parse({
        nome: '  Maria   Silva ',
        telefone: '(85) 99999-0000',
        consentimento: true,
        versaoTextoConsentimento: '2026-09-02.v1',
      }),
    ).toMatchObject({ nome: 'Maria Silva', telefone: '5585999990000' });
    expect(
      publicLeadRequestSchema.parse({
        nome: 'DDD cinquenta e cinco',
        telefone: '(55) 99999-0000',
        consentimento: true,
        versaoTextoConsentimento: '2026-09-02.v1',
      }).telefone,
    ).toBe('5555999990000');
    expect(
      publicLeadRequestSchema.parse({
        nome: 'Maria Silva',
        email: ' MARIA@EXAMPLE.COM ',
        consentimento: true,
        versaoTextoConsentimento: '2026-09-02.v1',
      }).email,
    ).toBe('maria@example.com');
    expect(() =>
      publicLeadRequestSchema.parse({
        nome: 'Maria Silva',
        consentimento: true,
        versaoTextoConsentimento: '2026-09-02.v1',
      }),
    ).toThrow();
    expect(() =>
      publicLeadRequestSchema.parse({
        nome: 'Maria Silva',
        email: 'maria@example.com',
        consentimento: false,
        versaoTextoConsentimento: '2026-09-02.v1',
      }),
    ).toThrow();
  });

  it('requires controlled loss reasons and rejects mass assignment', () => {
    expect(() =>
      changeLeadStatusRequestSchema.parse({ status: 'PERDIDO' }),
    ).toThrow();
    expect(() =>
      changeLeadStatusRequestSchema.parse({
        status: 'PERDIDO',
        motivoPerda: 'OUTRO',
      }),
    ).toThrow();
    expect(
      changeLeadStatusRequestSchema.parse({
        status: 'PERDIDO',
        motivoPerda: 'SEM_RETORNO',
      }),
    ).toMatchObject({ status: 'PERDIDO' });
    expect(() =>
      publicLeadRequestSchema.parse({
        nome: 'Maria Silva',
        email: 'maria@example.com',
        consentimento: true,
        versaoTextoConsentimento: '2026-09-02.v1',
        status: 'CONVERTIDO',
      }),
    ).toThrow();
  });
});
