import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../src/app/api/public/simulador/route';
import { metadata } from '../src/app/simulador/page';
import {
  buildPublicSimulationProfile,
  publicSimulationInitialForm,
  SimuladorPublico,
  validatePublicSimulationStep,
  type SimulatorFormState,
} from '../src/components/simulador-publico';
import { buildWhatsAppLink, normalizeBrlInput } from '../src/lib/simulador';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const validForm: SimulatorFormState = {
  categoria: 'IMOVEL',
  credito: 'R$ 150.000',
  parcela: '1.500,50',
  prazo: '120',
  lanceIntent: 'SIM',
  lance: '25.5',
};

describe('public simulator frontend', () => {
  it('normalizes Brazilian monetary input without accepting negative values', () => {
    expect(normalizeBrlInput('R$ 150.000')).toBe('150000');
    expect(normalizeBrlInput('1.500,50')).toBe('1500.50');
    expect(normalizeBrlInput('-100')).toBeNull();
    expect(normalizeBrlInput('inválido')).toBeNull();
  });

  it('builds a supported profile from optional wizard answers', () => {
    expect(buildPublicSimulationProfile(validForm)).toEqual({
      categoria: 'IMOVEL',
      valorCreditoDesejado: '150000',
      parcelaMaxima: '1500.50',
      prazoMaximo: 120,
      lanceDisponivelPercentual: '25.5',
    });
    expect(
      buildPublicSimulationProfile({
        ...validForm,
        parcela: '',
        prazo: '',
        lanceIntent: 'NAO',
      }),
    ).toEqual({ categoria: 'IMOVEL', valorCreditoDesejado: '150000' });
  });

  it('validates every wizard step and preserves valid state', () => {
    expect(
      validatePublicSimulationStep(publicSimulationInitialForm, 0),
    ).toContain('tipo de bem');
    expect(
      validatePublicSimulationStep({ ...validForm, credito: '-1' }, 1),
    ).toContain('crédito válido');
    expect(
      validatePublicSimulationStep({ ...validForm, parcela: 'x' }, 2),
    ).toContain('parcela válida');
    expect(
      validatePublicSimulationStep({ ...validForm, prazo: '0' }, 3),
    ).toContain('entre 1 e 1200');
    expect(
      validatePublicSimulationStep({ ...validForm, lance: '101' }, 4),
    ).toContain('entre 0 e 100');
    expect(validatePublicSimulationStep(validForm, 4)).toBeNull();
  });

  it('renders a keyboard-accessible mobile-first initial step', () => {
    const html = renderToStaticMarkup(
      <SimuladorPublico
        apiBaseUrl="http://backend.test"
        privacyPolicyUrl={null}
      />,
    );
    expect(html).toContain('Etapa 1 de 5');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('type="radio"');
    expect(html).toContain('Imóvel');
    expect(html).toContain('Continuar');
  });

  it('publishes safe and non-misleading SEO metadata', () => {
    expect(metadata.title).toBe(
      'Simulador de Consórcio | Larcarvalho Consórcios',
    );
    expect(metadata.description).toContain('crédito, parcela, prazo');
  });

  it('builds WhatsApp only from trusted numeric configuration with encoded content', () => {
    const profile = buildPublicSimulationProfile(validForm)!;
    const link = buildWhatsAppLink(
      '5585999999999',
      profile,
      '<script>G1</script>',
    )!;
    expect(link).toMatch(/^https:\/\/wa\.me\/5585999999999\?text=/);
    expect(link).not.toContain('<script>');
    expect(decodeURIComponent(link)).toContain(
      'Grupo consultado: scriptG1script.',
    );
    expect(buildWhatsAppLink('https://evil.example', profile)).toBeNull();
  });

  it('forwards a public request without requiring an authentication cookie', async () => {
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend.test');
    const backendFetch = vi.fn(async () => Response.json({ items: [] }));
    vi.stubGlobal('fetch', backendFetch);
    const response = await POST(
      new Request('http://frontend.test/api/public/simulador', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          perfil: { categoria: 'IMOVEL', valorCreditoDesejado: '150000' },
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(backendFetch.mock.calls[0]?.[0]).toBe(
      'http://backend.test/api/v1/public/simulador',
    );
  });
});
