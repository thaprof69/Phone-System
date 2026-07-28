import { describe, expect, it } from 'vitest';
import { reportCsv, reportExcel, reportPdf, type ExportableReportRow } from './report-export';

const row: ExportableReportRow = {
  id: '00000000-0000-4000-8000-000000000001',
  receivedAt: '2026-07-27T12:00:00.000Z',
  durationSeconds: 95,
  park: 'Lisboa',
  language: 'EN',
  callStatus: 'COMPLETED',
  processingState: 'COMPLETED',
  origin: 'LIVE',
  mode: 'VOICE',
  intent: 'Ticket pricing',
  classificationConfidence: 0.92,
  sentiment: 'NEUTRAL',
  urgency: 'LOW',
  outcome: 'RESOLVED_BY_AGENT',
  agentVersion: 3,
  sensitive: false,
  summary: 'Asked about tickets, prices, and opening times',
};

describe('report exports', () => {
  it('creates a quoted CSV with the complete row', () => {
    const csv = reportCsv([row]);
    expect(csv).toContain('Call ID,Received at');
    expect(csv).toContain('"Asked about tickets, prices, and opening times"');
  });

  it('creates an Excel-readable SpreadsheetML workbook with filters', () => {
    const workbook = reportExcel([row]);
    expect(workbook).toContain('<?mso-application progid="Excel.Sheet"?>');
    expect(workbook).toContain('<AutoFilter');
    expect(workbook).toContain('Ticket pricing');
  });

  it('creates a valid paginated PDF document', () => {
    const pdf = new TextDecoder().decode(
      reportPdf(
        Array.from({ length: 40 }, () => row),
        row.receivedAt,
      ),
    );
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf).toContain('/Count 2');
    expect(pdf).toContain('Quantum Parks - Call Intelligence Report');
    expect(pdf.endsWith('%%EOF')).toBe(true);
  });
});
