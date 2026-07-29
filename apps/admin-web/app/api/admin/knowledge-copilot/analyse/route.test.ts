import { describe, expect, it } from 'vitest';
import { basicEntityDecode, buildAnalysisSource, extractLinks, shouldCrawl } from './route';

describe('website knowledge crawling', () => {
  it('decodes WordPress numeric entities before evidence analysis', () => {
    expect(basicEntityDecode('Clip &#8216;N Climb &#x26; VR')).toBe('Clip ‘N Climb & VR');
  });

  it('keeps public content pages and excludes WordPress infrastructure routes', () => {
    expect(shouldCrawl(new URL('https://example.com/visit-us/'))).toBe(true);
    expect(shouldCrawl(new URL('https://example.com/xmlrpc.php'))).toBe(false);
    expect(shouldCrawl(new URL('https://example.com/feed/'))).toBe(false);
    expect(shouldCrawl(new URL('https://example.com/comments/feed/'))).toBe(false);
    expect(shouldCrawl(new URL('https://example.com/wp-json/'))).toBe(false);
    expect(shouldCrawl(new URL('https://example.com/wp-admin/'))).toBe(false);
  });

  it('discovers navigational anchors without treating metadata and asset links as pages', () => {
    const links = extractLinks(
      `
        <link rel="pingback" href="https://example.com/xmlrpc.php">
        <script src="https://example.com/runtime"></script>
        <a href="/locations/lisbon/">Lisbon</a>
        <a href="https://partner.example/help">Partner help</a>
      `,
      new URL('https://example.com/'),
    );

    expect(links.sameOriginLinks).toEqual(['https://example.com/locations/lisbon/']);
    expect(links.externalCues).toEqual(['https://partner.example/help']);
  });

  it('balances the analysis budget across every crawled page', () => {
    const pages = Array.from({ length: 8 }, (_, index) => ({
      url: `https://example.com/page-${index + 1}`,
      title: `Page ${index + 1}`,
      text: `Evidence ${index + 1} `.repeat(1_000),
      sameOriginLinks: [],
      externalCues: [],
    }));

    const source = buildAnalysisSource(new URL('https://example.com/'), pages, [], []);

    expect(source.length).toBeLessThanOrEqual(12_000);
    for (const page of pages) {
      expect(source).toContain(`URL: ${page.url}`);
      expect(source).toContain(`Evidence ${pages.indexOf(page) + 1}`);
    }
  });
});
