import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

import { getFrontendConfig } from '../../config/env';

export async function proxyIdentityRequest(
  request: Request,
  backendPath: string,
  timeoutMs?: number,
): Promise<NextResponse> {
  const config = getFrontendConfig();
  const headers = new Headers({ accept: 'application/json' });
  const cookie = request.headers.get('cookie');
  const origin = request.headers.get('origin');
  const contentType = request.headers.get('content-type');
  if (cookie) headers.set('cookie', cookie);
  if (origin) headers.set('origin', origin);
  if (contentType) headers.set('content-type', contentType);

  try {
    const hasBody = !['GET', 'HEAD'].includes(request.method);
    const multipart = contentType?.startsWith('multipart/form-data') ?? false;
    const init: RequestInit & { duplex?: 'half' } = {
      ...(hasBody
        ? { body: multipart ? request.body : await request.text() }
        : {}),
      cache: 'no-store',
      headers,
      method: request.method,
      signal: AbortSignal.timeout(timeoutMs ?? config.apiTimeoutMs),
      ...(multipart ? { duplex: 'half' } : {}),
    };
    const response = await fetch(`${config.apiBaseUrl}${backendPath}`, init);
    if (response.status === 204) return new NextResponse(null, { status: 204 });
    return new NextResponse(await response.text(), {
      headers: {
        'content-type':
          response.headers.get('content-type') ?? 'application/json',
      },
      status: response.status,
    });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Serviço temporariamente indisponível',
          requestId: randomUUID(),
        },
      },
      { status: 502 },
    );
  }
}
