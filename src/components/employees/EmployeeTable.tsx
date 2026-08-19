'use client';

import Link from 'next/link';
import { formatDate } from '@/lib/utils';

interface EmployeeRow {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  department: string;
  position: string;
  employmentStatus: string;
  hireDate: string | Date;
  status: string;
}

export function EmployeeTable({ employees }: { employees: EmployeeRow[] }) {
  if (employees.length === 0) {
    return <div className="card p-8 text-center text-sm text-slate-500">No employees yet.</div>;
  }

  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <th className="px-4 py-3">Employee</th>
            <th className="px-4 py-3">Code</th>
            <th className="px-4 py-3">Department</th>
            <th className="px-4 py-3">Position</th>
            <th className="px-4 py-3">Hired</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {employees.map((e) => (
            <tr key={e.id} className="hover:bg-slate-50">
              <td className="px-4 py-3">
                <Link href={`/dashboard/employees/${e.id}`} className="font-medium text-brand-700 hover:underline">
                  {e.firstName} {e.lastName}
                </Link>
                <div className="text-xs text-slate-500">{e.email}</div>
              </td>
              <td className="px-4 py-3 text-slate-600">{e.employeeCode}</td>
              <td className="px-4 py-3 text-slate-600">{e.department}</td>
              <td className="px-4 py-3 text-slate-600">{e.position}</td>
              <td className="px-4 py-3 text-slate-600">{formatDate(e.hireDate)}</td>
              <td className="px-4 py-3">
                <span
                  className={
                    e.status === 'ACTIVE'
                      ? 'badge bg-emerald-50 text-emerald-700'
                      : 'badge bg-slate-100 text-slate-600'
                  }
                >
                  {e.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
