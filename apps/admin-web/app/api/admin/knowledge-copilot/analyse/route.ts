import { headers } from 'next/headers';
import { extractKnowledgeDocument } from '../../../../../lib/document-extraction';

export const runtime = 'nodejs';

const apiBase = process.env.API_INTERNAL_URL ?? 'http://localhost:4000/v1';

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) {
    return Response.json({ message: 'Choose a document to analyse.' }, { status: 400 });
  }

  try {
    const extracted = await extractKnowledgeDocument(file);
    const requestHeaders = await headers();
    const accessToken = requestHeaders.get('x-amzn-oidc-accesstoken');
    const upstream = await fetch(`${apiBase}/admin/ai/intelligence/knowledge/analyse`, {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(60_000),
      headers: {
        'content-type': 'application/json',
        'x-qp-purpose': 'RELEASE_MANAGEMENT',
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({
        title: file.name,
        kind: extracted.kind,
        sourceText: extracted.text,
      }),
    });
    const payload: unknown = await upstream
      .json()
      .catch(() => ({ message: 'The AI Router returned an unreadable response.' }));
    return Response.json(payload, {
      status: upstream.status,
      headers: { 'cache-control': 'no-store, private' },
    });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : 'The document could not be analysed.' },
      { status: 422, headers: { 'cache-control': 'no-store, private' } },
    );
  }
}
