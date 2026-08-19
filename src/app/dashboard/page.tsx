import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  Users,
  UserCheck,
  Clock,
  Wallet,
  Laptop,
  Link2,
  Building2,
  Receipt,
  FolderOpen,
  UserPlus,
  PlusCircle,
  ClipboardList,
} from 'lucide-react';
import { requireSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { withCompanyScope } from '@/lib/scope';
import { StatCard } from '@/components/dashboard/StatCard';
import { DonutChart } from '@/components/dashboard/DonutChart';
import { StaticMap } from '@/components/dashboard/StaticMap';
import { EmployeeHomeDashboard } from '@/components/dashboard/EmployeeHomeDashboard';
import { AnnouncementCard } from '@/components/dashboard/AnnouncementCard';
import { formatCurrency } from '@/lib/utils';

export default async function DashboardHomePage() {
  const session = await requireSession();
  const ctx = {
    userId: session.user.id,
    role: session.user.role,
    companyId: session.user.companyId,
  };

  if (ctx.role === 'EMPLOYEE') {
    return <EmployeeHomeDashboard userId={ctx.userId} />;
  }

  if (ctx.role === 'SUPER_ADMIN') {
    const [companyCount, userCount, byRole, announcement] = await Promise.all([
      prisma.company.count(),
      prisma.user.count(),
      prisma.user.groupBy({ by: ['role'], _count: true }),
      prisma.announcement.findFirst({ where: { companyId: null, isActive: true }, orderBy: { createdAt: 'desc' } }),
    ]);
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Welcome back, {session.user.firstName}! 👋</h1>
          <p className="text-sm text-slate-500">Platform-wide overview across every company.</p>
        </div>
        {announcement && <AnnouncementCard title={announcement.title} message={announcement.body} />}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Companies" value={companyCount} icon={Building2} accent="brand" href="/dashboard/companies" />
          <StatCard label="Total Users" value={userCount} icon={Users} accent="purple" href="/dashboard/users" />
        </div>
        <div className="card p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Users by Role</h2>
          <DonutChart
            segments={byRole.map((r, i) => ({
              label: r.role.replace('_', ' '),
              value: r._count,
              color: ['#3b63f5', '#10b981', '#f59e0b', '#8b5cf6', '#14b8a6', '#ef4444'][i % 6]!,
            }))}
          />
        </div>
      </div>
    );
  }

  const scope = withCompanyScope(ctx);
  if (!('companyId' in scope) || !scope.companyId) redirect('/login');

  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const showHr = ctx.role === 'COMPANY_ADMIN' || ctx.role === 'HR_ADMIN';
  const showIt = ctx.role === 'COMPANY_ADMIN' || ctx.role === 'IT_ADMIN';
  const showBiz = ctx.role === 'COMPANY_ADMIN';

  const [
    employeeCount,
    todayEvents,
    assetCount,
    assignedAssetCount,
    clientCount,
    transactionCount,
    documentCount,
    monthlyPayroll,
    assetsByStatus,
    recentEvents,
    announcement,
  ] = await Promise.all([
    showHr ? prisma.employee.count({ where: scope }) : Promise.resolve(0),
    showHr
      ? prisma.attendance.findMany({
          where: { ...scope, timestamp: { gte: startOfDay, lt: endOfDay } },
          orderBy: { timestamp: 'asc' },
        })
      : Promise.resolve([]),
    showIt ? prisma.asset.count({ where: scope }) : Promise.resolve(0),
    showIt ? prisma.asset.count({ where: { ...scope, status: 'ASSIGNED' } }) : Promise.resolve(0),
    showBiz ? prisma.client.count({ where: scope }) : Promise.resolve(0),
    showBiz ? prisma.transaction.count({ where: scope }) : Promise.resolve(0),
    prisma.document.count({ where: scope }),
    showHr
      ? prisma.payroll.aggregate({
          where: { ...scope, status: 'PAID', payPeriodStart: { gte: startOfMonth } },
          _sum: { gross: true, net: true, sssDeduction: true, philhealthDeduction: true, pagibigDeduction: true, taxDeduction: true, otherDeductions: true },
        })
      : Promise.resolve(null),
    showIt ? prisma.asset.groupBy({ by: ['status'], where: scope, _count: true }) : Promise.resolve([]),
    showHr
      ? prisma.attendance.findMany({
          where: { ...scope, timestamp: { gte: startOfDay, lt: endOfDay } },
          include: { employee: { include: { user: true } } },
          orderBy: { timestamp: 'desc' },
          take: 6,
        })
      : Promise.resolve([]),
    prisma.announcement.findFirst({
      where: { OR: [{ companyId: null }, { companyId: ctx.companyId }], isActive: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const presentEmployeeIds = new Set(todayEvents.filter((e) => e.type === 'IN').map((e) => e.employeeId));
  const outEmployeeIds = new Set(todayEvents.filter((e) => e.type === 'OUT').map((e) => e.employeeId));
  const presentToday = presentEmployeeIds.size;
  const workingNow = [...presentEmployeeIds].filter((id) => !outEmployeeIds.has(id)).length;
  const absentToday = Math.max(employeeCount - presentToday, 0);

  const totalDeductions = monthlyPayroll?._sum
    ? Number(monthlyPayroll._sum.sssDeduction ?? 0) +
      Number(monthlyPayroll._sum.philhealthDeduction ?? 0) +
      Number(monthlyPayroll._sum.pagibigDeduction ?? 0) +
      Number(monthlyPayroll._sum.taxDeduction ?? 0) +
      Number(monthlyPayroll._sum.otherDeductions ?? 0)
    : 0;

  const ASSET_STATUS_COLORS: Record<string, string> = {
    AVAILABLE: '#3b63f5',
    ASSIGNED: '#10b981',
    IN_REPAIR: '#f59e0b',
    RETIRED: '#ef4444',
    LOST: '#94a3b8',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Welcome back, {session.user.firstName}! 👋</h1>
        <p className="text-sm text-slate-500">Here&apos;s what&apos;s happening today.</p>
      </div>

      {announcement && <AnnouncementCard title={announcement.title} message={announcement.body} />}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {showHr && (
          <StatCard label="Total Employees" value={employeeCount} icon={Users} accent="brand" href="/dashboard/employees" />
        )}
        {showHr && (
          <StatCard
            label="Present Today"
            value={presentToday}
            sublabel={employeeCount ? `${Math.round((presentToday / employeeCount) * 100)}% of total` : undefined}
            icon={UserCheck}
            accent="green"
          />
        )}
        {showHr && <StatCard label="Working Now" value={workingNow} icon={Clock} accent="teal" />}
        {showHr && (
          <StatCard
            label="Payroll (This Month)"
            value={formatCurrency(Number(monthlyPayroll?._sum.net ?? 0))}
            icon={Wallet}
            accent="purple"
            href="/dashboard/payroll"
          />
        )}
        {showIt && <StatCard label="IT Assets" value={assetCount} icon={Laptop} accent="brand" href="/dashboard/it-assets" />}
        {showIt && (
          <StatCard
            label="Assets Assigned"
            value={assignedAssetCount}
            sublabel={assetCount ? `${Math.round((assignedAssetCount / assetCount) * 100)}% of total` : undefined}
            icon={Link2}
            accent="purple"
          />
        )}
        {showBiz && <StatCard label="Clients" value={clientCount} icon={Building2} accent="brand" href="/dashboard/clients" />}
        {showBiz && (
          <StatCard label="Transactions" value={transactionCount} icon={Receipt} accent="amber" href="/dashboard/transactions" />
        )}
        <StatCard label="Documents" value={documentCount} icon={FolderOpen} accent="slate" href="/dashboard/documents" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {showHr && (
          <div className="card p-5">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">Today&apos;s Attendance Overview</h2>
            <DonutChart
              centerValue={employeeCount}
              centerLabel="Employees"
              segments={[
                { label: 'Present', value: presentToday, color: '#10b981' },
                { label: 'Absent', value: absentToday, color: '#ef4444' },
              ]}
            />
          </div>
        )}

        {showHr && (
          <div className="card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Recent Time In / Time Out</h2>
              <Link href="/dashboard/attendance" className="text-xs font-medium text-brand-600 hover:underline">
                View all
              </Link>
            </div>
            {recentEvents.length === 0 ? (
              <p className="text-sm text-slate-500">No attendance events yet today.</p>
            ) : (
              <ul className="space-y-3">
                {recentEvents.map((e) => (
                  <li key={e.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-semibold text-brand-700">
                        {e.employee.user.firstName[0]}
                        {e.employee.user.lastName[0]}
                      </div>
                      <span className="text-slate-700">
                        {e.employee.user.firstName} {e.employee.user.lastName}
                      </span>
                    </div>
                    <span className={e.type === 'IN' ? 'badge bg-emerald-50 text-emerald-700' : 'badge bg-red-50 text-red-700'}>
                      {e.type === 'IN' ? 'IN' : 'OUT'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {showHr && (
          <div className="card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Payroll Summary (This Month)</h2>
              <Link href="/dashboard/payroll" className="text-xs font-medium text-brand-600 hover:underline">
                View report
              </Link>
            </div>
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Total Gross</dt>
                <dd className="font-medium text-slate-900">{formatCurrency(Number(monthlyPayroll?._sum.gross ?? 0))}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Total Deductions</dt>
                <dd className="font-medium text-red-600">{formatCurrency(totalDeductions)}</dd>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-2.5">
                <dt className="font-medium text-slate-900">Net Pay</dt>
                <dd className="font-semibold text-emerald-600">{formatCurrency(Number(monthlyPayroll?._sum.net ?? 0))}</dd>
              </div>
            </dl>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {showHr && (
          <div className="card p-5 lg:col-span-1">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">Attendance Map (Today)</h2>
            <StaticMap
              pins={todayEvents
                .filter((e) => e.latitude != null && e.longitude != null)
                .slice(-10)
                .map((e) => ({ id: e.id, label: 'Employee', type: e.type, lat: e.latitude!, lng: e.longitude! }))}
            />
          </div>
        )}

        {showIt && (
          <div className="card p-5">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">IT Asset Overview</h2>
            <DonutChart
              centerValue={assetCount}
              centerLabel="Total Assets"
              segments={assetsByStatus.map((s) => ({
                label: s.status.replace('_', ' '),
                value: s._count,
                color: ASSET_STATUS_COLORS[s.status] ?? '#94a3b8',
              }))}
            />
          </div>
        )}

        <div className="card p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Shortcuts</h2>
          <div className="grid grid-cols-2 gap-3">
            {showHr && (
              <Link href="/dashboard/employees/new" className="flex flex-col items-center gap-2 rounded-xl border border-slate-100 p-4 text-center hover:bg-slate-50">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                  <UserPlus className="h-5 w-5" />
                </div>
                <span className="text-xs font-medium text-slate-700">Add Employee</span>
              </Link>
            )}
            {showHr && (
              <Link href="/dashboard/payroll" className="flex flex-col items-center gap-2 rounded-xl border border-slate-100 p-4 text-center hover:bg-slate-50">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-50 text-violet-600">
                  <Wallet className="h-5 w-5" />
                </div>
                <span className="text-xs font-medium text-slate-700">Process Payroll</span>
              </Link>
            )}
            {showIt && (
              <Link href="/dashboard/it-assets" className="flex flex-col items-center gap-2 rounded-xl border border-slate-100 p-4 text-center hover:bg-slate-50">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-50 text-teal-600">
                  <PlusCircle className="h-5 w-5" />
                </div>
                <span className="text-xs font-medium text-slate-700">Add Asset</span>
              </Link>
            )}
            {showHr && (
              <Link href="/dashboard/reports" className="flex flex-col items-center gap-2 rounded-xl border border-slate-100 p-4 text-center hover:bg-slate-50">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                  <ClipboardList className="h-5 w-5" />
                </div>
                <span className="text-xs font-medium text-slate-700">Attendance Report</span>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
