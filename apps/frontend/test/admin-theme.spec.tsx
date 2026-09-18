import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  adminThemeDefaults,
  publicThemeDefaults,
  type AuthResponse,
} from '@larcarvalho/shared';
import { AdminThemePreview } from '../src/components/admin-theme-preview';
import { PublicThemePreview } from '../src/components/public-theme-preview';
import { AppShell } from '../src/components/app-shell';
import { adminThemeStyle } from '../src/lib/admin-theme';
import { GET, PATCH } from '../src/app/api/appearance/admin-theme/route';
import { POST as resetAdmin } from '../src/app/api/appearance/admin-theme/reset/route';
import { POST as resetPublic } from '../src/app/api/appearance/public-theme/reset/route';
import { getAdminTheme } from '../src/services/api/experience';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ toString: () => 'larcarvalho_session=test' }),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const identity: AuthResponse = {
  user: {
    id: crypto.randomUUID(),
    nome: 'Theme admin',
    email: 'themes@example.test',
    role: 'SUPER_ADMIN',
  },
  permissions: [],
};

describe('administrative theme rendering and loading', () => {
  it('scopes the real shell, sidebar and dashboard separately from nested public previews', () => {
    const theme = {
      ...adminThemeDefaults,
      sidebarBackground: '#123456',
      primary: '#aabbcc',
    };
    const html = renderToStaticMarkup(
      <AppShell identity={identity} adminTheme={theme}>
        <AdminThemePreview theme={{ ...theme, primary: '#987654' }} />
        <PublicThemePreview theme={publicThemeDefaults} mode="Landing Page" />
      </AppShell>,
    );
    expect(html).toContain('app-shell admin-theme');
    expect(html).toContain('app-navigation');
    expect(html).toContain('--admin-sidebar-background:#123456');
    expect(html).toContain('--admin-primary:#aabbcc');
    expect(html).toContain('--admin-primary:#987654');
    expect(html).toContain('--public-primary:#34806b');
    const style = adminThemeStyle(theme);
    expect(Object.keys(style).every((key) => key.startsWith('--admin-'))).toBe(
      true,
    );
    expect(
      JSON.stringify(adminThemeStyle({ ...theme, text: 'url(bad)' })),
    ).not.toContain('url(bad)');
  });
  it('renders a safe administrative default when no configuration is available', () => {
    const html = renderToStaticMarkup(
      <AppShell identity={identity}>Dashboard</AppShell>,
    );
    expect(html).toContain('--admin-primary:#34806b');
    expect(html).toContain('--admin-background:#f2f2f2');
    expect(html).not.toContain('--public-');
  });
  it('loads the authenticated admin palette without caching', async () => {
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend.test');
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json(adminThemeDefaults));
    vi.stubGlobal('fetch', fetchMock);
    expect(await getAdminTheme()).toEqual(adminThemeDefaults);
    expect(fetchMock.mock.calls[0]).toEqual([
      'http://backend.test/api/v1/appearance/admin-theme',
      expect.objectContaining({
        cache: 'no-store',
        headers: {
          accept: 'application/json',
          cookie: 'larcarvalho_session=test',
        },
      }),
    ]);
  });
  it.each([
    ['GET', '/admin-theme', GET],
    ['PATCH', '/admin-theme', PATCH],
    ['POST', '/admin-theme/reset', resetAdmin],
    ['POST', '/public-theme/reset', resetPublic],
  ] as const)(
    'proxies %s %s with session and origin',
    async (method, path, handler) => {
      vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend.test');
      const fetchMock = vi
        .fn()
        .mockResolvedValue(Response.json(adminThemeDefaults));
      vi.stubGlobal('fetch', fetchMock);
      const response = await handler(
        new Request(`http://frontend.test/api/appearance${path}`, {
          method,
          headers: {
            cookie: 'larcarvalho_session=test',
            origin: 'http://frontend.test',
            'content-type': 'application/json',
          },
          ...(method !== 'GET' ? { body: '{}' } : {}),
        }),
      );
      expect(response.status).toBe(200);
      expect(fetchMock.mock.calls[0]?.[0]).toBe(
        `http://backend.test/api/v1/appearance${path}`,
      );
      expect(fetchMock.mock.calls[0]?.[1].headers.get('cookie')).toBe(
        'larcarvalho_session=test',
      );
      expect(fetchMock.mock.calls[0]?.[1].headers.get('origin')).toBe(
        'http://frontend.test',
      );
    },
  );
});
