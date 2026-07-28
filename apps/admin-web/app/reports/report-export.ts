export type ExportableReportRow = {
  id: string;
  receivedAt: string;
  durationSeconds: number | null;
  park: string | null;
  language: string | null;
  callStatus: string;
  processingState: string;
  origin: string;
  mode: string | null;
  intent: string | null;
  classificationConfidence: number | null;
  sentiment: string | null;
  urgency: string | null;
  outcome: string | null;
  agentVersion: number | null;
  sensitive: boolean;
  summary: string | null;
};

const columns: Array<[keyof ExportableReportRow, string]> = [
  ['id', 'Call ID'],
  ['receivedAt', 'Received at'],
  ['durationSeconds', 'Duration seconds'],
  ['park', 'Park'],
  ['language', 'Language'],
  ['callStatus', 'Call status'],
  ['processingState', 'Processing state'],
  ['origin', 'Origin'],
  ['mode', 'Mode'],
  ['intent', 'Call reason'],
  ['classificationConfidence', 'Classification confidence'],
  ['sentiment', 'Sentiment'],
  ['urgency', 'Urgency'],
  ['outcome', 'Outcome'],
  ['agentVersion', 'Agent version'],
  ['sensitive', 'Sensitive'],
  ['summary', 'Summary'],
];

function textValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function csvCell(value: unknown): string {
  const text = textValue(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function reportCsv(rows: ExportableReportRow[]): string {
  return [
    columns.map(([, label]) => csvCell(label)).join(','),
    ...rows.map((row) => columns.map(([key]) => csvCell(row[key])).join(',')),
  ].join('\r\n');
}

function xml(value: unknown): string {
  return textValue(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/** SpreadsheetML is a genuine Excel workbook format and opens natively in Excel. */
export function reportExcel(rows: ExportableReportRow[]): string {
  const rowXml = (cells: unknown[], header = false) =>
    `<Row>${cells
      .map(
        (cell) =>
          `<Cell${header ? ' ss:StyleID="Header"' : ''}><Data ss:Type="String">${xml(cell)}</Data></Cell>`,
      )
      .join('')}</Row>`;
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles><Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#DDEBE5" ss:Pattern="Solid"/></Style></Styles>
 <Worksheet ss:Name="Call intelligence"><Table>
 ${rowXml(
   columns.map(([, label]) => label),
   true,
 )}
 ${rows.map((row) => rowXml(columns.map(([key]) => row[key]))).join('\n ')}
 </Table><AutoFilter x:Range="R1C1:R${rows.length + 1}C${columns.length}" xmlns:x="urn:schemas-microsoft-com:office:excel"/></Worksheet>
</Workbook>`;
}

function ascii(value: unknown): string {
  return textValue(value)
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replaceAll('\\', '\\\\')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)');
}

/**
 * Small dependency-free PDF writer for the filtered call register. It emits a real,
 * paginated PDF with one summary header and up to 34 call rows per page.
 */
export function reportPdf(rows: ExportableReportRow[], generatedAt: string): Uint8Array {
  const perPage = 34;
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  const objects: string[] = [];
  const pageIds: number[] = [];
  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

  for (let pageIndex = 0; pageIndex < pages; pageIndex += 1) {
    const pageId = 4 + pageIndex * 2;
    const contentId = pageId + 1;
    pageIds.push(pageId);
    const pageRows = rows.slice(pageIndex * perPage, (pageIndex + 1) * perPage);
    const lines = [
      `Quantum Parks - Call Intelligence Report`,
      `Generated ${new Date(generatedAt).toISOString()} | ${rows.length} filtered calls | Page ${pageIndex + 1} of ${pages}`,
      '',
      'Received             Park       Lang  Status     Origin      Duration  Reason / outcome',
      ...pageRows.map((row) => {
        const received = new Date(row.receivedAt).toISOString().slice(0, 16).replace('T', ' ');
        const park = (row.park ?? '-').slice(0, 10).padEnd(10);
        const language = (row.language ?? '-').toUpperCase().slice(0, 5).padEnd(5);
        const status = row.callStatus.slice(0, 10).padEnd(10);
        const origin = row.origin.slice(0, 10).padEnd(10);
        const duration =
          row.durationSeconds === null ? '-' : `${Math.floor(row.durationSeconds / 60)}m`;
        return `${received}  ${park} ${language} ${status} ${origin} ${duration.padEnd(8)} ${(row.intent ?? 'Unclassified').slice(0, 28)} / ${(row.outcome ?? 'No outcome').slice(0, 24)}`;
      }),
    ];
    const stream = [
      'BT',
      '/F1 9 Tf',
      '40 800 Td',
      ...lines.flatMap((line, index) => [
        index === 0 ? '/F1 14 Tf' : index === 1 ? '/F1 8 Tf' : index === 3 ? '/F1 8 Tf' : '',
        `(${ascii(line)}) Tj`,
        index === 0 ? '0 -22 Td' : '0 -18 Td',
      ]),
      'ET',
    ]
      .filter(Boolean)
      .join('\n');
    objects[pageId - 1] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId - 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  }

  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages} >>`;
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets[index + 1] = new TextEncoder().encode(pdf).length;
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

export function downloadReport(
  rows: ExportableReportRow[],
  format: 'csv' | 'excel' | 'pdf',
  generatedAt: string,
) {
  const stamp = new Date(generatedAt).toISOString().slice(0, 10);
  const pdfBytes = format === 'pdf' ? reportPdf(rows, generatedAt) : null;
  const pdfBuffer = pdfBytes
    ? pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength)
    : null;
  const payload =
    format === 'csv'
      ? new Blob([reportCsv(rows)], { type: 'text/csv;charset=utf-8' })
      : format === 'excel'
        ? new Blob([reportExcel(rows)], { type: 'application/vnd.ms-excel;charset=utf-8' })
        : new Blob([pdfBuffer as ArrayBuffer], { type: 'application/pdf' });
  const extension = format === 'excel' ? 'xls' : format;
  const url = URL.createObjectURL(payload);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `quantum-parks-call-intelligence-${stamp}.${extension}`;
  anchor.click();
  URL.revokeObjectURL(url);
}
