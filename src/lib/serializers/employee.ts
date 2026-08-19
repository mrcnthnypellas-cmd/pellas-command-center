import type { Employee, Role, User } from '@prisma/client';

export type EmployeeWithUser = Employee & { user: User };

/**
 * Strips confidential HR fields (salary, SSS/PhilHealth/Pag-IBIG/TIN) for any caller
 * who isn't HR Admin / Company Admin / Super Admin — most importantly IT Admin, who
 * is explicitly denied this data by the spec, and Employees viewing colleagues.
 */
export function serializeEmployee(employee: EmployeeWithUser, viewerRole: Role, viewerUserId: string) {
  const canSeeConfidential =
    viewerRole === 'SUPER_ADMIN' || viewerRole === 'COMPANY_ADMIN' || viewerRole === 'HR_ADMIN';
  const isSelf = employee.userId === viewerUserId;

  const base = {
    id: employee.id,
    employeeCode: employee.employeeCode,
    department: employee.department,
    position: employee.position,
    hireDate: employee.hireDate,
    employmentStatus: employee.employmentStatus,
    firstName: employee.user.firstName,
    lastName: employee.user.lastName,
    email: employee.user.email,
    phone: employee.user.phone,
    avatarUrl: employee.user.avatarUrl,
    status: employee.user.status,
  };

  if (canSeeConfidential || isSelf) {
    return {
      ...base,
      salary: employee.salary ? Number(employee.salary) : null,
      sssNumber: employee.sssNumber,
      philhealthNumber: employee.philhealthNumber,
      pagibigNumber: employee.pagibigNumber,
      tinNumber: employee.tinNumber,
    };
  }

  return base;
}
