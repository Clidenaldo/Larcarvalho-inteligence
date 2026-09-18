export interface FrontendConfig {
  readonly apiBaseUrl: string;
  readonly apiTimeoutMs: number;
  readonly environment: 'development' | 'production' | 'test';
  readonly publicApiBaseUrl: string;
  readonly simulatorTimeoutMs: number;
  readonly whatsappNumber: string | null;
  readonly privacyPolicyUrl: string | null;
}

export class FrontendConfigurationError extends Error {
  override readonly name = 'FrontendConfigurationError';
}

function parseApiBaseUrl(value: string): string {
  try {
    const url = new URL(value);

    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('Unsupported protocol');
    }

    return url.toString().replace(/\/$/, '');
  } catch {
    throw new FrontendConfigurationError(
      'Invalid frontend configuration: BACKEND_INTERNAL_URL',
    );
  }
}

function parseTimeout(value: string | undefined): number {
  const timeout = Number(value ?? '3000');

  if (!Number.isInteger(timeout) || timeout < 100 || timeout > 30_000) {
    throw new FrontendConfigurationError(
      'Invalid frontend configuration: API_TIMEOUT_MS',
    );
  }

  return timeout;
}

function parseWhatsappNumber(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  const normalized = value.replace(/\D/g, '');
  if (normalized.length < 8 || normalized.length > 15)
    throw new FrontendConfigurationError(
      'Invalid frontend configuration: PUBLIC_WHATSAPP_NUMBER',
    );
  return normalized;
}

function parseOptionalUrl(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  return parseApiBaseUrl(value);
}

export function getFrontendConfig(): FrontendConfig {
  const apiBaseUrl =
    process.env.BACKEND_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    'http://localhost:3001';

  return Object.freeze({
    apiBaseUrl: parseApiBaseUrl(apiBaseUrl),
    apiTimeoutMs: parseTimeout(process.env.API_TIMEOUT_MS),
    environment: process.env.NODE_ENV,
    publicApiBaseUrl: parseApiBaseUrl(
      process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001',
    ),
    simulatorTimeoutMs:
      parseTimeout(process.env.PUBLIC_SIMULATOR_TIMEOUT_MS ?? '5000') + 1_000,
    whatsappNumber: parseWhatsappNumber(process.env.PUBLIC_WHATSAPP_NUMBER),
    privacyPolicyUrl: parseOptionalUrl(process.env.PUBLIC_PRIVACY_POLICY_URL),
  });
}
