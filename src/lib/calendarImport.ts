import * as XLSX from 'xlsx';
import { calendarImportRowSchema, type CalendarImportRowResult } from '@/lib/validation/calendar';

const EXPECTED_COLUMNS = [
  'Date',
  'Title',
  'Description',
  'Department',
  'Start Time',
  'End Time',
  'Deadline',
  'Location',
  'Status',
];

/**
 * Parses an uploaded .xlsx buffer and validates every row against the expected
 * calendar import schema (spec §7). Never throws on bad data — every row, valid or
 * not, comes back with its own error list so the caller can render a full preview.
 */
export function parseAndValidateCalendarImport(buffer: Buffer): {
  results: CalendarImportRowResult[];
  missingColumns: string[];
} {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const firstSheet = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheet!];
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet!, { defval: '' });

  const actualColumns = rows.length > 0 ? Object.keys(rows[0]!) : [];
  const missingColumns = EXPECTED_COLUMNS.filter(
    (col) => col !== 'Description' && col !== 'Department' && col !== 'End Time' && col !== 'Location' && col !== 'Status'
      ? !actualColumns.includes(col)
      : false,
  );

  const results: CalendarImportRowResult[] = rows.map((raw, index) => {
    const parsed = calendarImportRowSchema.safeParse(raw);
    if (parsed.success) {
      return { rowNumber: index + 2, raw, valid: true, errors: [], parsed: parsed.data };
    }
    const errors = parsed.error.errors.map((e) => `${e.path.join('.') || 'row'}: ${e.message}`);
    return { rowNumber: index + 2, raw, valid: false, errors };
  });

  return { results, missingColumns };
}
