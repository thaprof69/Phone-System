import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json(
    { service: 'admin-web', status: 'ok' },
    { headers: { 'cache-control': 'no-store' } },
  );
}
