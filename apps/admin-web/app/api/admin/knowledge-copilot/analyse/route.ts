import { headers } from 'next/headers';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { extractKnowledgeDocument } from '../../../../../lib/document-extraction';

export const runtime = 'nodejs';

const apiBase = process.env.API_INTERNAL_URL ?? 'http://localhost:4000/v1';
const maxUrlPages = 8;
const maxPageCharacters = 8_000;
const maxSourceCharacters = 12_000;
const maxEvidenceCharacters = 9_000;

type CrawledPage = {
  url: string;
  title: string;
  text: string;
  sameOriginLinks: string[];
  externalCues: string[];
};

export function basicEntityDecode(input: string) {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (entity, code: string) => {
      const codePoint = Number(code);
      return Number.isSafeInteger(codePoint) && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    })
    .replace(/&#x([\da-f]+);/gi, (entity, code: string) => {
      const codePoint = Number.parseInt(code, 16);
      return Number.isSafeInteger(codePoint) && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    });
}

function extractTitle(html: string, fallback: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return basicEntityDecode(title?.replace(/\s+/g, ' ').trim() || fallback);
}

function extractText(html: string) {
  return basicEntityDecode(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<header[\s\S]*?<\/header>/gi, ' ')
      .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  ).slice(0, maxPageCharacters);
}

export function shouldCrawl(url: URL) {
  const pathname = url.pathname.toLowerCase().replace(/\/+$/, '') || '/';
  return (
    !/\.(?:avif|css|gif|ico|jpe?g|js|json|mp3|mp4|pdf|png|svg|webm|webp|woff2?)$/i.test(pathname) &&
    !/(?:^|\/)(?:feed|comments\/feed|wp-admin|wp-login|wp-json)(?:\/|$)/i.test(pathname) &&
    !/(?:^|\/)xmlrpc\.php$/i.test(pathname) &&
    (url.protocol === 'http:' || url.protocol === 'https:')
  );
}

export function extractLinks(html: string, base: URL) {
  const sameOriginLinks: string[] = [];
  const externalCues: string[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(/<a\b[^>]*\shref=["']([^"']+)["'][^>]*>/gi)) {
    const raw = match[1];
    if (!raw || raw.startsWith('mailto:') || raw.startsWith('tel:')) continue;
    try {
      const next = new URL(raw, base);
      next.hash = '';
      const normalized = next.toString();
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      if (next.origin === base.origin && shouldCrawl(next)) {
        sameOriginLinks.push(normalized);
      } else if (next.protocol === 'http:' || next.protocol === 'https:') {
        externalCues.push(normalized);
      }
    } catch {
      // Ignore malformed links in untrusted source HTML.
    }
  }
  return { sameOriginLinks, externalCues };
}

function isBlockedIp(address: string) {
  if (isIP(address) === 6) {
    const lower = address.toLowerCase();
    return (
      lower === '::1' ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      lower.startsWith('fe80:') ||
      lower.startsWith('::ffff:127.') ||
      lower.startsWith('::ffff:10.') ||
      lower.startsWith('::ffff:192.168.')
    );
  }
  const [first, second, third, fourth] = address.split('.').map((part) => Number(part));
  if (
    first === undefined ||
    second === undefined ||
    third === undefined ||
    fourth === undefined ||
    ![first, second, third, fourth].every((part) => Number.isInteger(part))
  )
    return true;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

async function assertPublicUrl(url: URL) {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Enter a public http or https URL.');
  }
  if (url.username || url.password) {
    throw new Error('URLs with embedded credentials are not accepted.');
  }

  const hostname = url.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.test')
  ) {
    throw new Error('Enter a public URL, not a local or internal address.');
  }
  if (isIP(hostname) && isBlockedIp(hostname)) {
    throw new Error('Enter a public URL, not a private network address.');
  }

  const resolved = await lookup(hostname, { all: true, verbatim: true });
  if (resolved.some((entry) => isBlockedIp(entry.address))) {
    throw new Error('This URL resolves to a private or local network address.');
  }
}

async function fetchPage(url: URL): Promise<CrawledPage> {
  await assertPublicUrl(url);
  let response: Response;
  try {
    response = await fetch(url, {
      cache: 'no-store',
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
      headers: {
        accept: 'text/html, application/xhtml+xml, text/plain;q=0.8',
        'user-agent': 'QuantumParksKnowledgeCrawler/1.0 (+website knowledge review)',
      },
    });
  } catch (error) {
    const cause =
      error instanceof Error && error.cause && typeof error.cause === 'object'
        ? (error.cause as { code?: unknown }).code
        : undefined;
    const detail =
      error instanceof Error && error.name === 'TimeoutError'
        ? 'the request timed out'
        : cause === 'UND_ERR_SOCKET'
          ? 'the remote server closed the connection'
          : 'the remote server could not be reached';
    throw new Error(`Could not fetch ${url.toString()}: ${detail}.`, { cause: error });
  }
  await assertPublicUrl(new URL(response.url));
  if (!response.ok) throw new Error(`The site returned ${response.status} for ${url.toString()}.`);

  const contentType = response.headers.get('content-type') ?? '';
  if (!/text\/html|text\/plain|application\/xhtml\+xml/i.test(contentType)) {
    throw new Error('The URL did not return readable page text.');
  }

  const html = await response.text();
  const finalUrl = new URL(response.url);
  const links = extractLinks(html, finalUrl);
  return {
    url: finalUrl.toString(),
    title: extractTitle(html, finalUrl.pathname || finalUrl.hostname),
    text: extractText(html),
    ...links,
  };
}

export function buildAnalysisSource(
  start: URL,
  pages: CrawledPage[],
  externalCues: string[],
  skippedPages: string[],
) {
  const pageCharacterBudget = Math.max(
    600,
    Math.floor(maxEvidenceCharacters / Math.max(pages.length, 1)),
  );
  const warnings =
    skippedPages.length > 0
      ? `Crawl warnings: ${skippedPages.length} optional page${skippedPages.length === 1 ? '' : 's'} could not be fetched and did not cancel analysis.\n${skippedPages.join('\n')}`
      : '';
  const cues =
    externalCues.length > 0
      ? `--- Related research cues discovered but not verified
${externalCues.slice(0, 12).join('\n')}`
      : '';

  return [
    `Website crawl source: ${start.toString()}`,
    `Crawl boundary: ${pages.length} same-site page${pages.length === 1 ? '' : 's'} fetched. External links are retained only as research cues, not as verified facts.`,
    warnings,
    ...pages.map(
      (page, index) => `--- Page ${index + 1}: ${page.title}
URL: ${page.url}
${page.text.slice(0, pageCharacterBudget)}`,
    ),
    cues,
  ]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, maxSourceCharacters);
}

async function crawlWebsite(rawUrl: string) {
  const start = new URL(rawUrl.trim());
  await assertPublicUrl(start);
  const queue = [start.toString()];
  const visited = new Set<string>();
  const pages: CrawledPage[] = [];
  const externalCues = new Set<string>();
  const skippedPages: string[] = [];

  while (queue.length > 0 && pages.length < maxUrlPages) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    let page: CrawledPage;
    try {
      page = await fetchPage(new URL(current));
    } catch (error) {
      if (pages.length === 0) throw error;
      skippedPages.push(
        error instanceof Error ? error.message : `Could not fetch optional page ${current}.`,
      );
      continue;
    }
    pages.push(page);
    page.externalCues.slice(0, 12).forEach((cue) => externalCues.add(cue));
    for (const link of page.sameOriginLinks) {
      if (pages.length + queue.length >= maxUrlPages) break;
      if (!visited.has(link)) queue.push(link);
    }
  }

  if (pages.length === 0) throw new Error('No readable pages were found at that URL.');

  const sourceText = buildAnalysisSource(start, pages, Array.from(externalCues), skippedPages);

  return {
    title: start.hostname,
    kind: 'Text',
    sourceText,
    crawledPages: pages.map(({ url, title }) => ({ url, title })),
    researchCues: Array.from(externalCues).slice(0, 12),
  };
}

async function forwardForAnalysis(input: { title: string; kind: string; sourceText: string }) {
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
      title: input.title,
      kind: input.kind,
      sourceText: input.sourceText,
    }),
  });
  const payload: unknown = await upstream
    .json()
    .catch(() => ({ message: 'The AI Router returned an unreadable response.' }));
  return Response.json(payload, {
    status: upstream.status,
    headers: { 'cache-control': 'no-store, private' },
  });
}

export async function POST(request: Request) {
  if ((request.headers.get('content-type') ?? '').includes('application/json')) {
    const body = (await request.json().catch(() => null)) as { url?: unknown } | null;
    if (typeof body?.url !== 'string' || body.url.trim().length === 0) {
      return Response.json({ message: 'Enter a URL to analyse.' }, { status: 400 });
    }
    try {
      const crawl = await crawlWebsite(body.url);
      const response = await forwardForAnalysis(crawl);
      const payload = (await response.json()) as Record<string, unknown>;
      return Response.json(
        {
          ...payload,
          crawledPages: crawl.crawledPages,
          researchCues: crawl.researchCues,
        },
        { status: response.status, headers: { 'cache-control': 'no-store, private' } },
      );
    } catch (error) {
      return Response.json(
        { message: error instanceof Error ? error.message : 'The URL could not be analysed.' },
        { status: 422, headers: { 'cache-control': 'no-store, private' } },
      );
    }
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) {
    return Response.json({ message: 'Choose a document to analyse.' }, { status: 400 });
  }

  try {
    const extracted = await extractKnowledgeDocument(file);
    return forwardForAnalysis({
      title: file.name,
      kind: extracted.kind,
      sourceText: extracted.text,
    });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : 'The document could not be analysed.' },
      { status: 422, headers: { 'cache-control': 'no-store, private' } },
    );
  }
}
