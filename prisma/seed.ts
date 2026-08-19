import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Seed data is deliberately built with TWO companies and duplicated roles/records
// in each, so the RBAC negative test cases in §3 (cross-company, cross-employee,
// cross-client access denial) have real fixtures to exercise against.

async function hash(pw: string) {
  return bcrypt.hash(pw, 10);
}

async function main() {
  // Plain usernames + a simple shared password, per explicit request — this is for
  // local/demo testing only. NEVER use a password this weak on a deployment reachable
  // by anyone but you.
  const passwordHash = await hash('12345');

  const companyA = await prisma.company.create({
    data: { name: 'Acme Manufacturing Corp', settings: {} },
  });
  const companyB = await prisma.company.create({
    data: { name: 'Northwind Trading Inc', settings: {} },
  });

  const superAdmin = await prisma.user.create({
    data: {
      role: Role.SUPER_ADMIN,
      email: 'superadmin',
      passwordHash,
      firstName: 'Sam',
      lastName: 'Root',
      status: 'ACTIVE',
    },
  });

  async function seedCompany(company: { id: string; name: string }, suffix: string) {
    const companyAdmin = await prisma.user.create({
      data: {
        companyId: company.id,
        role: Role.COMPANY_ADMIN,
        email: `admin${suffix}`.toLowerCase(),
        passwordHash,
        firstName: 'Carla',
        lastName: `Admin${suffix}`,
        status: 'ACTIVE',
      },
    });

    const hrAdminUser = await prisma.user.create({
      data: {
        companyId: company.id,
        role: Role.HR_ADMIN,
        email: `hr${suffix}`.toLowerCase(),
        passwordHash,
        firstName: 'Helen',
        lastName: `HR${suffix}`,
        status: 'ACTIVE',
      },
    });

    const itAdminUser = await prisma.user.create({
      data: {
        companyId: company.id,
        role: Role.IT_ADMIN,
        email: `it${suffix}`.toLowerCase(),
        passwordHash,
        firstName: 'Ivan',
        lastName: `IT${suffix}`,
        status: 'ACTIVE',
      },
    });

    const employeeUserA = await prisma.user.create({
      data: {
        companyId: company.id,
        role: Role.EMPLOYEE,
        email: `employee.a${suffix}`.toLowerCase(),
        passwordHash,
        firstName: 'Ella',
        lastName: `EmployeeA${suffix}`,
        status: 'ACTIVE',
      },
    });
    const employeeA = await prisma.employee.create({
      data: {
        companyId: company.id,
        userId: employeeUserA.id,
        employeeCode: `EMP-${suffix}-001`,
        department: 'Operations',
        position: 'Associate',
        hireDate: new Date('2024-01-15'),
        salary: 35000,
        sssNumber: '01-2345678-9',
        philhealthNumber: '12-345678901-2',
        pagibigNumber: '1234-5678-9012',
        tinNumber: '123-456-789-000',
      },
    });

    const employeeUserB = await prisma.user.create({
      data: {
        companyId: company.id,
        role: Role.EMPLOYEE,
        email: `employee.b${suffix}`.toLowerCase(),
        passwordHash,
        firstName: 'Ben',
        lastName: `EmployeeB${suffix}`,
        status: 'ACTIVE',
      },
    });
    const employeeB = await prisma.employee.create({
      data: {
        companyId: company.id,
        userId: employeeUserB.id,
        employeeCode: `EMP-${suffix}-002`,
        department: 'Finance',
        position: 'Analyst',
        hireDate: new Date('2023-06-01'),
        salary: 40000,
        sssNumber: '01-8765432-1',
        philhealthNumber: '12-109876543-2',
        pagibigNumber: '9876-5432-1098',
        tinNumber: '987-654-321-000',
      },
    });

    const clientUserA = await prisma.user.create({
      data: {
        companyId: company.id,
        role: Role.CLIENT,
        email: `client.a${suffix}`.toLowerCase(),
        passwordHash,
        firstName: 'Chris',
        lastName: `ClientA${suffix}`,
        status: 'ACTIVE',
      },
    });
    const clientA = await prisma.client.create({
      data: {
        companyId: company.id,
        userId: clientUserA.id,
        clientCode: `CLI-${suffix}-001`,
        businessName: `Client A Holdings ${suffix}`,
      },
    });

    const clientUserB = await prisma.user.create({
      data: {
        companyId: company.id,
        role: Role.CLIENT,
        email: `client.b${suffix}`.toLowerCase(),
        passwordHash,
        firstName: 'Cara',
        lastName: `ClientB${suffix}`,
        status: 'ACTIVE',
      },
    });
    const clientB = await prisma.client.create({
      data: {
        companyId: company.id,
        userId: clientUserB.id,
        clientCode: `CLI-${suffix}-002`,
        businessName: `Client B Trading ${suffix}`,
      },
    });

    await prisma.transaction.create({
      data: {
        companyId: company.id,
        clientId: clientA.id,
        transactionCode: `TXN-${suffix}-001`,
        service: 'Business Permit Renewal',
        amount: 5000,
        status: 'PENDING',
        assignedStaffUserId: companyAdmin.id,
      },
    });
    await prisma.transaction.create({
      data: {
        companyId: company.id,
        clientId: clientB.id,
        transactionCode: `TXN-${suffix}-002`,
        service: 'SEC Registration',
        amount: 15000,
        status: 'PROCESSING',
        assignedStaffUserId: companyAdmin.id,
      },
    });

    const asset = await prisma.asset.create({
      data: {
        companyId: company.id,
        assetTag: `AST-${suffix}-001`,
        category: 'Laptop',
        brand: 'Dell',
        model: 'Latitude 5440',
        serialNumber: `SN${suffix}0001`,
        purchaseDate: new Date('2024-02-01'),
        cost: 55000,
        status: 'ASSIGNED',
        condition: 'GOOD',
        assignedEmployeeId: employeeA.id,
      },
    });
    await prisma.assetHistory.create({
      data: {
        companyId: company.id,
        assetId: asset.id,
        action: 'ASSIGN',
        toEmployeeId: employeeA.id,
        performedByUserId: itAdminUser.id,
        notes: 'Initial assignment on onboarding',
      },
    });

    await prisma.payroll.create({
      data: {
        companyId: company.id,
        employeeId: employeeA.id,
        payPeriodStart: new Date('2026-07-16'),
        payPeriodEnd: new Date('2026-07-31'),
        gross: 17500,
        sssDeduction: 875,
        philhealthDeduction: 437.5,
        pagibigDeduction: 100,
        taxDeduction: 500,
        net: 15587.5,
        status: 'PAID',
        processedByUserId: hrAdminUser.id,
        processedAt: new Date('2026-07-31'),
      },
    });

    await prisma.calendarEvent.create({
      data: {
        companyId: company.id,
        title: 'Payroll Day',
        description: 'Bi-monthly payroll release',
        startAt: new Date('2026-08-31'),
        isDeadline: true,
        source: 'MANUAL',
        createdByUserId: companyAdmin.id,
      },
    });

    return { companyAdmin, hrAdminUser, itAdminUser, employeeA, employeeUserA, employeeB, employeeUserB, clientA, clientUserA, clientB, clientUserB };
  }

  const a = await seedCompany(companyA, 'A');
  const b = await seedCompany(companyB, 'B');

  console.info('Seed complete.');
  console.info('Super Admin:        superadmin / 12345');
  console.info('Company A Admin:    admina / 12345');
  console.info('Company A HR:       hra / 12345');
  console.info('Company A IT:       ita / 12345');
  console.info('Company A Emp A:    employee.aa / 12345');
  console.info('Company A Emp B:    employee.ba / 12345');
  console.info('Company A Client A: client.aa / 12345');
  console.info('Company A Client B: client.ba / 12345');
  console.info('(Company B has the same set with a "b" suffix, e.g. adminb — usernames are case-insensitive to type, but stored lowercase)');
  void superAdmin;
  void a;
  void b;
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
