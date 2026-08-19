'use client';

import { useState } from 'react';
import { EditEmployeeForm } from './EditEmployeeForm';
import { formatCurrency, formatDate, roleLabel } from '@/lib/utils';

interface EmployeeData {
  id: string;
  employeeCode: string;
  department: string;
  position: string;
  hireDate: string;
  employmentStatus: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  status: string;
  salary?: number | null;
  sssNumber?: string | null;
  philhealthNumber?: string | null;
  pagibigNumber?: string | null;
  tinNumber?: string | null;
}

export function EmployeeDetailView({
  employee,
  canEdit,
  canEditConfidential,
}: {
  employee: EmployeeData;
  canEdit: boolean;
  canEditConfidential: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const hasConfidential = 'salary' in employee;

  if (editing) {
    return (
      <EditEmployeeForm
        employee={employee}
        canEditConfidential={canEditConfidential}
        onDone={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {employee.firstName} {employee.lastName}
          </h1>
          <p className="text-sm text-slate-500">
            {employee.position} — {employee.department}
          </p>
        </div>
        {canEdit && (
          <button type="button" onClick={() => setEditing(true)} className="btn-secondary">
            Edit
          </button>
        )}
      </div>

      <div className="card grid grid-cols-1 gap-4 p-6 sm:grid-cols-2">
        <Field label="Employee code" value={employee.employeeCode} />
        <Field label="Email" value={employee.email} />
        <Field label="Phone" value={employee.phone ?? '—'} />
        <Field label="Hire date" value={formatDate(employee.hireDate)} />
        <Field label="Department" value={employee.department} />
        <Field label="Position" value={employee.position} />
        <Field label="Employment status" value={roleLabel(employee.employmentStatus)} />
        <Field label="Account status" value={roleLabel(employee.status)} />
      </div>

      {hasConfidential && (
        <div className="card p-6">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Confidential HR Details</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Monthly salary" value={employee.salary != null ? formatCurrency(employee.salary) : '—'} />
            <Field label="SSS number" value={employee.sssNumber ?? '—'} />
            <Field label="PhilHealth number" value={employee.philhealthNumber ?? '—'} />
            <Field label="Pag-IBIG number" value={employee.pagibigNumber ?? '—'} />
            <Field label="TIN" value={employee.tinNumber ?? '—'} />
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 text-sm text-slate-900">{value}</div>
    </div>
  );
}
