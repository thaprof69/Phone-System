const MAX_SOURCE_CHARACTERS = 80_000;
const MAX_PDF_PAGES = 60;

export type ExtractedKnowledgeDocument = {
  kind: 'PDF' | 'Word' | 'Sheets' | 'Markdown' | 'Text';
  text: string;
};

function compact(text: string) {
  return text
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
    .slice(0, MAX_SOURCE_CHARACTERS);
}

function extensionOf(name: string) {
  return name.toLowerCase().split('.').pop() ?? '';
}

export async function extractKnowledgeDocument(file: File): Promise<ExtractedKnowledgeDocument> {
  if (file.size === 0) throw new Error('The selected file is empty.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Files must be 10 MB or smaller.');

  const extension = extensionOf(file.name);

  if (extension === 'txt' || extension === 'md' || extension === 'markdown') {
    const text = compact(await file.text());
    if (text.length < 20) throw new Error('The file does not contain enough text to analyse.');
    return { kind: extension === 'txt' ? 'Text' : 'Markdown', text };
  }

  if (extension === 'csv') {
    const text = compact(await file.text());
    if (text.length < 20) throw new Error('The spreadsheet does not contain enough data.');
    return { kind: 'Sheets', text };
  }

  if (extension === 'docx') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({
      buffer: Buffer.from(await file.arrayBuffer()),
    });
    const text = compact(result.value);
    if (text.length < 20) throw new Error('No readable text was found in the Word document.');
    return { kind: 'Word', text };
  }

  if (extension === 'xlsx') {
    const { readSheet } = await import('read-excel-file/node');
    const rows = await readSheet(Buffer.from(await file.arrayBuffer()));
    const text = compact(
      rows
        .map((row) =>
          row
            .map((cell) => {
              if (cell instanceof Date) return cell.toISOString();
              return cell === null ? '' : String(cell);
            })
            .join(' | '),
        )
        .join('\n'),
    );
    if (text.length < 20) throw new Error('No readable rows were found in the spreadsheet.');
    return { kind: 'Sheets', text };
  }

  if (extension === 'pdf') {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      useWorkerFetch: false,
    });
    const document = await task.promise;
    if (document.numPages > MAX_PDF_PAGES) {
      await task.destroy();
      throw new Error(`PDFs must contain ${MAX_PDF_PAGES} pages or fewer.`);
    }

    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(
        content.items
          .map((item) => ('str' in item ? item.str : ''))
          .filter(Boolean)
          .join(' '),
      );
    }
    await task.destroy();
    const text = compact(pages.join('\n\n'));
    if (text.length < 20) {
      throw new Error('No readable text was found. Scanned PDFs require approved OCR support.');
    }
    return { kind: 'PDF', text };
  }

  throw new Error('Use PDF, DOCX, XLSX, CSV, Markdown, or text files.');
}
