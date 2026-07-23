import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json(
    { service: 'customer-web', status: 'ok' },
    { headers: { 'cache-control': 'no-store' } },
  );
}
