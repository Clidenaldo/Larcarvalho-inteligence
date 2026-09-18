import { NextResponse } from 'next/server';

import { getFrontendConfig } from '../../../../config/env';

export async function POST(request: Request): Promise<NextResponse> {
  const config = getFrontendConfig();
  const headers = new Headers({
    cookie: request.headers.get('cookie') ?? '',
  });
  const origin = request.headers.get('origin');
  if (origin) headers.set('origin', origin);
  const response = await fetch(`${config.apiBaseUrl}/api/v1/auth/logout`, {
    cache: 'no-store',
    headers,
    method: 'POST',
    signal: AbortSignal.timeout(config.apiTimeoutMs),
  });
  const outgoing = new NextResponse(null, { status: response.status });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) outgoing.headers.set('set-cookie', setCookie);
  return outgoing;
}
