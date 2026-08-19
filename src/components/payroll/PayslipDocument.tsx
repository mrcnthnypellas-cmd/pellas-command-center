'use client';

import { Download, Printer } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';

export interface PayslipDocumentData {
  id: string;
  companyName: string;
  employeeName: string;
  employeeCode: string;
  department: string;
  position: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  gross: number;
  sssDeduction: number;
  philhealthDeduction: number;
  pagibigDeduction: number;
  taxDeduction: number;
  otherDeductions: number;
  net: number;
}

export function PayslipDocument({ payslip }: { payslip: PayslipDocumentData }) {
  const totalDeductions =
    payslip.sssDeduction + payslip.philhealthDeduction + payslip.pagibigDeduction + payslip.taxDeduction + payslip.otherDeductions;

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Payslip</div>
          <div className="text-sm text-slate-500">
            Period: {formatDate(payslip.payPeriodStart)} – {formatDate(payslip.payPeriodEnd)}
          </div>
        </div>
        <div className="flex gap-2">
          <a
            href={`/api/payslips/${payslip.id}/download`}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary py-1.5 text-xs"
          >
            <Download className="h-3.5 w-3.5" />
            Download PDF
          </a>
          <button type="button" onClick={() => window.print()} className="btn-secondary py-1.5 text-xs">
            <Printer className="h-3.5 w-3.5" />
            Print
          </button>
        </div>
      </div>

      <div className="p-5">
        <div className="mb-4 text-base font-semibold text-slate-900">{payslip.companyName}</div>

        <div className="mb-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <div className="text-xs text-slate-400">Employee Name</div>
            <div className="font-medium text-slate-900">{payslip.employeeName}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Employee ID</div>
            <div className="font-medium text-slate-900">{payslip.employeeCode}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Department</div>
            <div className="font-medium text-slate-900">{payslip.department}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Position</div>
            <div className="font-medium text-slate-900">{payslip.position}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-600">Earnings</div>
            <div className="flex justify-between border-b border-slate-100 py-1.5 text-sm">
              <span className="text-slate-600">Gross Pay</span>
              <span className="font-medium text-slate-900">{formatCurrency(payslip.gross)}</span>
            </div>
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-600">Deductions</div>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">SSS</span>
                <span className="text-slate-900">{formatCurrency(payslip.sssDeduction)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">PhilHealth</span>
                <span className="text-slate-900">{formatCurrency(payslip.philhealthDeduction)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">Pag-IBIG</span>
                <span className="text-slate-900">{formatCurrency(payslip.pagibigDeduction)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">Withholding Tax</span>
                <span className="text-slate-900">{formatCurrency(payslip.taxDeduction)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-600">Others</span>
                <span className="text-slate-900">{formatCurrency(payslip.otherDeductions)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1.5 font-medium text-red-600">
                <span>Total Deductions</span>
                <span>{formatCurrency(totalDeductions)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-slate-200 pt-4">
          <span className="text-sm font-semibold text-slate-900">Net Pay</span>
          <span className="text-2xl font-bold text-emerald-600">{formatCurrency(payslip.net)}</span>
        </div>

        <p className="mt-4 text-center text-[11px] text-slate-400">This is a system-generated payslip. No signature required.</p>
      </div>
    </div>
  );
}
