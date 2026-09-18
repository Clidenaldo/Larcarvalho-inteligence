import { NextResponse } from 'next/server';

export function GET(): NextResponse {
  return NextResponse.json(
    {
      service: 'frontend',
      status: 'ok',
      timestamp: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
