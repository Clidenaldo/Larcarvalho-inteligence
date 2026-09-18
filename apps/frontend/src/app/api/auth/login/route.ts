import { apiErrorResponseSchema } from '@larcarvalho/shared';
import { NextResponse } from 'next/server';

import { getFrontendConfig } from '../../../../config/env';

export async function POST(request: Request): Promise<NextResponse> {
  const config = getFrontendConfig();
  const headers = new Headers({ 'content-type': 'application/json' });
  const origin = request.headers.get('origin');
  if (origin) headers.set('origin', origin);
  const response = await fetch(`${config.apiBaseUrl}/api/v1/auth/login`, {
    body: await request.text(),
    cache: 'no-store',
    headers,
    method: 'POST',
    signal: AbortSignal.timeout(config.apiTimeoutMs),
  });
  const payload: unknown = await response.json();
  const outgoing = NextResponse.json(
    response.ok ? payload : apiErrorResponseSchema.parse(payload),
    { status: response.status },
  );
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) outgoing.headers.set('set-cookie', setCookie);
  return outgoing;
}
