import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

import { getFrontendConfig } from '../../config/env';

const STREAM_TIMEOUT_MS = 90_000;

/**
 * Raw SSE passthrough (no buffering): backend events flow straight to the
 * browser. Client disconnect aborts the backend request.
 */
export async function proxyIdentityStream(
  request: Request,
  backendPath: string,
): Promise<NextResponse> {
  const config = getFrontendConfig();
  const headers = new Headers({ accept: 'text/event-stream' });
  const cookie = request.headers.get('cookie');
  const origin = request.headers.get('origin');
  const contentType = request.headers.get('content-type');
  if (cookie) headers.set('cookie', cookie);
  if (origin) headers.set('origin', origin);
  if (contentType) headers.set('content-type', contentType);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);
  const onClientAbort = () => controller.abort();
  request.signal.addEventListener('abort', onClientAbort, { once: true });
  try {
    const response = await fetch(`${config.apiBaseUrl}${backendPath}`, {
      body: await request.text(),
      cache: 'no-store',
      headers,
      method: 'POST',
      signal: controller.signal,
    } as RequestInit & { duplex: 'half' });
    if (!response.ok || !response.body) {
      clearTimeout(timeout);
      const text = await response.text().catch(() => '');
      return new NextResponse(text, {
        headers: {
          'content-type':
            response.headers.get('content-type') ?? 'application/json',
        },
        status: response.status,
      });
    }
    return new NextResponse(response.body, {
      headers: {
        'cache-control': 'no-cache',
        connection: 'keep-alive',
        'content-type': 'text/event-stream',
      },
    });
  } catch {
    clearTimeout(timeout);
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
  } finally {
    request.signal.removeEventListener('abort', onClientAbort);
  }
}
