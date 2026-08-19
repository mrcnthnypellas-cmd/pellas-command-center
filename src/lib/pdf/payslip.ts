import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { formatDate } from '@/lib/utils';

// pdf-lib's standard fonts only support WinAnsi encoding, which has no glyph for
// the Peso sign (₱, U+20B1) — Intl.NumberFormat's "PHP" currency renders that glyph
// and crashes doc.save() with "WinAnsi cannot encode". Use a plain "PHP" prefix here
// instead; this formatter is PDF-only, the web UI still shows the real ₱ symbol.
function formatCurrencyForPdf(amount: number): string {
  return `PHP ${new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;
}

export interface PayslipPdfInput {
  companyName: string;
  employeeName: string;
  employeeCode: string;
  department: string;
  payPeriodStart: Date;
  payPeriodEnd: Date;
  gross: number;
  sssDeduction: number;
  philhealthDeduction: number;
  pagibigDeduction: number;
  taxDeduction: number;
  otherDeductions: number;
  otherDeductionsNote?: string | null;
  net: number;
}

export async function generatePayslipPdf(input: PayslipPdfInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = 800;
  const left = 50;

  page.drawText(input.companyName, { x: left, y, size: 16, font: bold });
  y -= 24;
  page.drawText('Payslip', { x: left, y, size: 12, font, color: rgb(0.4, 0.4, 0.4) });
  y -= 30;

  const line = (label: string, value: string, size = 10) => {
    page.drawText(label, { x: left, y, size, font, color: rgb(0.35, 0.35, 0.35) });
    page.drawText(value, { x: left + 200, y, size, font: bold });
    y -= 18;
  };

  line('Employee', input.employeeName);
  line('Employee Code', input.employeeCode);
  line('Department', input.department);
  line('Pay Period', `${formatDate(input.payPeriodStart)} – ${formatDate(input.payPeriodEnd)}`);
  y -= 12;

  page.drawLine({ start: { x: left, y }, end: { x: 545, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
  y -= 24;

  page.drawText('Earnings', { x: left, y, size: 11, font: bold });
  y -= 18;
  line('Gross Pay', formatCurrencyForPdf(input.gross));
  y -= 6;

  page.drawText('Deductions', { x: left, y, size: 11, font: bold });
  y -= 18;
  line('SSS', formatCurrencyForPdf(input.sssDeduction));
  line('PhilHealth', formatCurrencyForPdf(input.philhealthDeduction));
  line('Pag-IBIG', formatCurrencyForPdf(input.pagibigDeduction));
  line('Withholding Tax', formatCurrencyForPdf(input.taxDeduction));
  line('Other Deductions', formatCurrencyForPdf(input.otherDeductions));
  if (input.otherDeductionsNote) {
    page.drawText(`Note: ${input.otherDeductionsNote}`, { x: left, y, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
    y -= 16;
  }

  y -= 12;
  page.drawLine({ start: { x: left, y }, end: { x: 545, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
  y -= 24;

  page.drawText('Net Pay', { x: left, y, size: 13, font: bold });
  page.drawText(formatCurrencyForPdf(input.net), { x: left + 200, y, size: 13, font: bold, color: rgb(0.15, 0.4, 0.15) });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
