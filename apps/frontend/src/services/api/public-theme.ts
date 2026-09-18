import {
  publicThemeDefaults,
  publicThemeSchema,
  type PublicTheme,
} from '@larcarvalho/shared';
import { getFrontendConfig } from '../../config/env';

export async function getPublicTheme(): Promise<PublicTheme> {
  const config = getFrontendConfig();
  try {
    const response = await fetch(`${config.apiBaseUrl}/api/v1/public/theme`, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(config.apiTimeoutMs),
    });
    if (!response.ok) return { ...publicThemeDefaults };
    return publicThemeSchema.parse(await response.json());
  } catch {
    // Keep public navigation usable when the configuration service is unavailable.
    return { ...publicThemeDefaults };
  }
}
