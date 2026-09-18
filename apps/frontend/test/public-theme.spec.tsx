import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { publicThemeDefaults } from '@larcarvalho/shared';
import { PublicThemePreview } from '../src/components/public-theme-preview';
import { PublicThemeScope } from '../src/components/public-theme';
import { PublicLanding } from '../src/components/public-landing';
import { SimuladorPublico } from '../src/components/simulador-publico';
import { LeadContactForm } from '../src/components/lead-contact-form';
import { publicThemeStyle } from '../src/lib/public-theme';
import { getPublicTheme } from '../src/services/api/public-theme';
import { PATCH } from '../src/app/api/appearance/public-theme/route';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe('public theme rendering and loading', () => {
  it('uses the same tokens in preview, landing, simulator and lead form without saving', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const theme = {
      ...publicThemeDefaults,
      primary: '#123456',
      background: '#102030',
      buttonPrimary: '#456789',
    };
    const html = renderToStaticMarkup(
      <PublicThemeScope theme={theme}>
        <PublicLanding />
        <SimuladorPublico
          apiBaseUrl=""
          privacyPolicyUrl={null}
          whatsappNumber={null}
        />
        <LeadContactForm
          apiBaseUrl=""
          perfil={{ categoria: 'IMOVEL', valorCreditoDesejado: '200000' }}
          privacyPolicyUrl={null}
          whatsappNumber={null}
        />
      </PublicThemeScope>,
    );
    expect(html).toContain('--public-primary:#123456');
    expect(html).toContain('public-button-primary');
    expect(html).toContain('public-simulator');
    expect(html).toContain('Quero falar com um especialista');
    for (const mode of ['Landing Page', 'Simulador', 'Resultado'] as const) {
      const preview = renderToStaticMarkup(
        <PublicThemePreview theme={theme} mode={mode} />,
      );
      expect(preview).toContain('--public-background:#102030');
      expect(preview).toContain('--public-button-primary:#456789');
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      publicThemeStyle({ ...theme, primary: 'url(bad)' })['background'],
    ).toBeUndefined();
    expect(
      JSON.stringify(publicThemeStyle({ ...theme, primary: 'url(bad)' })),
    ).not.toContain('url(bad)');
  });
  it('loads persisted public data uncached without forwarding cookies and falls back on outage', async () => {
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend.test');
    const theme = { ...publicThemeDefaults, primary: '#123456' };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(theme))
      .mockRejectedValueOnce(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);
    expect(await getPublicTheme()).toEqual(theme);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });
    expect(fetchMock.mock.calls[0]?.[1].headers).not.toHaveProperty('cookie');
    expect(await getPublicTheme()).toEqual(publicThemeDefaults);
  });
  it('forwards theme writes through the authenticated BFF', async () => {
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend.test');
    const backendFetch = vi
      .fn()
      .mockResolvedValue(Response.json(publicThemeDefaults));
    vi.stubGlobal('fetch', backendFetch);
    expect(
      (
        await PATCH(
          new Request('http://frontend.test/api/appearance/public-theme', {
            method: 'PATCH',
            body: JSON.stringify({ primary: '#123456' }),
            headers: {
              cookie: 'larcarvalho_session=test',
              'content-type': 'application/json',
            },
          }),
        )
      ).status,
    ).toBe(200);
    expect(backendFetch.mock.calls[0]?.[0]).toBe(
      'http://backend.test/api/v1/appearance/public-theme',
    );
    expect(backendFetch.mock.calls[0]?.[1].headers.get('cookie')).toBe(
      'larcarvalho_session=test',
    );
  });
});
