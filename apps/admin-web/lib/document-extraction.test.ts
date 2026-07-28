import { describe, expect, it } from 'vitest';
import { extractKnowledgeDocument } from './document-extraction';

describe('knowledge document extraction', () => {
  it('extracts and compacts text documents', async () => {
    const file = new File(
      ['Opening hours are 10:00 to 20:00.   \n\n\n\nWeather closures are published online.'],
      'guest-information.txt',
      { type: 'text/plain' },
    );

    await expect(extractKnowledgeDocument(file)).resolves.toEqual({
      kind: 'Text',
      text: 'Opening hours are 10:00 to 20:00.\n\n\nWeather closures are published online.',
    });
  });

  it('refuses unsupported legacy spreadsheet files explicitly', async () => {
    const file = new File(['legacy spreadsheet content'], 'hours.xls');

    await expect(extractKnowledgeDocument(file)).rejects.toThrow(
      'Use PDF, DOCX, XLSX, CSV, Markdown, or text files.',
    );
  });
});
