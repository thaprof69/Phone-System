import { NextResponse } from 'next/server';
import { z } from 'zod';

const schema = z
  .object({
    token: z.string().min(20).max(512),
    firstName: z.string().min(2).max(80),
    lastName: z.string().min(2).max(80),
    email: z.email(),
    phone: z.string().min(7).max(24),
    park: z.enum(['lisboa', 'porto', 'sintra']),
    whatsapp: z.string().optional(),
    sms: z.string().optional(),
    emailUpdates: z.string().optional(),
    privacyConsent: z.literal('accepted'),
  })
  .strict();

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { message: 'Please check the highlighted details and try again.' },
      { status: 400 },
    );
  try {
    const response = await fetch(
      `${process.env.API_INTERNAL_URL ?? 'http://localhost:4000/v1'}/public/handoffs/register`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
        signal: AbortSignal.timeout(5_000),
        cache: 'no-store',
      },
    );
    const result = await response.json().catch(() => ({}));
    return NextResponse.json(result, { status: response.status });
  } catch {
    return NextResponse.json(
      {
        message:
          'The secure registration service is temporarily unavailable. No details were saved.',
      },
      { status: 503 },
    );
  }
}
