/**
 * Security regression suite (incident 2026-11): tenant isolation, credential leakage,
 * mass assignment, privilege escalation and financial authorization — exercised over HTTP
 * through the real guards, ValidationPipe, filters and ResponseInterceptor.
 *
 * Needs PostgreSQL in DATABASE_URL with the schema applied (`npx prisma db push`). No Redis.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { RoleType } from '@prisma/client';

import appConfig from '../src/config/app.config';
import jwtConfig from '../src/config/jwt.config';
import databaseConfig from '../src/config/database.config';
import keycloakConfig from '../src/config/keycloak.config';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthModule } from '../src/modules/auth/auth.module';
import { RolesModule } from '../src/modules/roles/roles.module';
import { UsersModule } from '../src/modules/users/users.module';
import { VariantsModule } from '../src/modules/variants/variants.module';
import { ProductsModule } from '../src/modules/products/products.module';
import { CustomersModule } from '../src/modules/customers/customers.module';
import { HrModule } from '../src/modules/hr/hr.module';
import { BranchesModule } from '../src/modules/branches/branches.module';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { TenantGuard } from '../src/common/guards/tenant.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { BranchContextInterceptor } from '../src/common/interceptors/branch-context.interceptor';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';

jest.setTimeout(90_000);

const RESOURCES = ['roles', 'users', 'products', 'customers', 'hr', 'branches', 'inventory', 'sales'];
const ACTIONS = ['create', 'read', 'update', 'delete'];
const CASHIER_PERMS = ['customers:read', 'customers:update', 'products:read', 'sales:create', 'hr:read'];

type Shop = {
  tenantId: string;
  branchId: string;
  secondBranchId: string;
  adminRoleId: string;
  adminId: string;
  cashierId: string;
  productCreatorToken: string;
  productId: string;
  variantId: string;
  customerId: string;
  employeeId: string;
  adminToken: string;
  cashierToken: string;
};

describe('Security: tenant isolation & authorization (HTTP)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  const run = Date.now().toString(36);
  let A: Shop;
  let B: Shop;
  let platformRoleInA: string;

  const http = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const bodyText = (res: request.Response) => JSON.stringify(res.body);

  async function seedShop(label: string, permissionIds: Map<string, string>): Promise<Shop> {
    const tenant = await prisma.tenant.create({
      data: { name: `Sec ${label} ${run}`, subdomain: `sec-${label}-${run}`, shopType: 'GROCERY', plan: 'PROFESSIONAL', status: 'ACTIVE' },
    });
    const tenantId = tenant.id;
    const branch = await prisma.branch.create({ data: { tenantId, name: `Main ${label}`, code: 'MAIN' } });
    const secondBranch = await prisma.branch.create({ data: { tenantId, name: `Second ${label}`, code: 'SECOND' } });

    const adminRole = await prisma.role.create({
      data: {
        tenantId, name: `Admin ${label}`, type: RoleType.TENANT_ADMIN,
        permissions: { create: [...permissionIds.values()].map((permissionId) => ({ permissionId })) },
      },
    });
    const cashierRole = await prisma.role.create({
      data: {
        tenantId, name: `Cashier ${label}`, type: RoleType.CASHIER,
        permissions: { create: CASHIER_PERMS.map((k) => ({ permissionId: permissionIds.get(k)! })) },
      },
    });
    const productCreatorRole = await prisma.role.create({
      data: {
        tenantId,
        name: `Product Creator ${label}`,
        type: RoleType.CUSTOM,
        permissions: { create: [{ permissionId: permissionIds.get('products:create')! }] },
      },
    });
    const mkUser = (who: string, roleId: string) =>
      prisma.user.create({
        data: {
          tenantId, branchId: branch.id, email: `${who}-${label}-${run}@sec.test`,
          passwordHash: '$2a$12$SECRETHASHSHOULDNEVERLEAKxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          twoFactorSecret: 'JBSWY3DPEHPK3PXPSECRET', posPinHash: '$2a$10$PINHASHSECRET',
          firstName: who, lastName: label, status: 'ACTIVE', emailVerified: true,
          roles: { create: { roleId } },
        },
      });
    const admin = await mkUser('admin', adminRole.id);
    const cashier = await mkUser('cashier', cashierRole.id);
    const productCreator = await mkUser('product-creator', productCreatorRole.id);

    const product = await prisma.product.create({
      data: {
        tenantId, name: `Rice ${label}`, slug: `rice-${label}-${run}`, sku: `RICE-${label}-${run}`,
        sellingPrice: 250, costPrice: 200, mrp: 300,
        variants: { create: { sku: `RICE-${label}-${run}-V`, name: 'Default', sellingPrice: 250, costPrice: 200, mrp: 300 } },
      },
      include: { variants: true },
    });
    const customer = await prisma.customer.create({
      data: { tenantId, firstName: `Cust ${label}`, phone: `07${Math.floor(Math.random() * 1e8)}`, walletBalance: 0, loyaltyPoints: 10 },
    });
    const employee = await prisma.employee.create({
      data: { tenantId, branchId: branch.id, firstName: 'Emp', lastName: label, phone: '0770000000', joiningDate: new Date(), basicSalary: 50000 },
    });

    const sign = (id: string, email: string) => jwt.sign({ sub: id, email, tenantId, roles: [], permissions: [] });
    return {
      tenantId, branchId: branch.id, secondBranchId: secondBranch.id, adminRoleId: adminRole.id, adminId: admin.id, cashierId: cashier.id,
      productCreatorToken: sign(productCreator.id, productCreator.email),
      productId: product.id, variantId: product.variants[0].id, customerId: customer.id, employeeId: employee.id,
      adminToken: sign(admin.id, admin.email), cashierToken: sign(cashier.id, cashier.email),
    };
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [appConfig, jwtConfig, databaseConfig, keycloakConfig], ignoreEnvFile: true }),
        EventEmitterModule.forRoot({ wildcard: true, delimiter: '.' }),
        PrismaModule, AuthModule, RolesModule, UsersModule, VariantsModule, ProductsModule,
        CustomersModule, HrModule, BranchesModule,
      ],
      providers: [
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: TenantGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_GUARD, useClass: PermissionsGuard },
        { provide: APP_INTERCEPTOR, useClass: BranchContextInterceptor },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true, forbidNonWhitelisted: true, transform: true,
      transformOptions: { enableImplicitConversion: true },
    }));
    app.useGlobalFilters(new HttpExceptionFilter(), new PrismaExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();

    prisma = moduleRef.get(PrismaService);
    jwt = moduleRef.get(JwtService);

    const permissionIds = new Map<string, string>();
    for (const resource of RESOURCES) {
      for (const action of ACTIONS) {
        const p = await prisma.permission.upsert({
          where: { resource_action: { resource, action } }, update: {}, create: { resource, action },
        });
        permissionIds.set(`${resource}:${action}`, p.id);
      }
    }
    A = await seedShop('a', permissionIds);
    B = await seedShop('b', permissionIds);

    // Legacy data: a platform-type role sitting inside a shop (as the demo seed creates).
    platformRoleInA = (await prisma.role.create({
      data: { tenantId: A.tenantId, name: `Super Admin ${run}`, type: RoleType.SUPER_ADMIN, isSystem: true },
    })).id;
  });

  afterAll(async () => {
    await app?.close();
  });

  // ── Roles ──────────────────────────────────────────────────────────────

  describe('Roles API', () => {
    it("cannot read another shop's role (404) and never leaks credential fields", async () => {
      const res = await http().get(`/api/v1/roles/${B.adminRoleId}`).set(as(A.adminToken));
      expect(res.status).toBe(404);
      expect(bodyText(res)).not.toMatch(/SECRETHASH|PINHASHSECRET|JBSWY3DP/);
    });

    it('returns own role members without password / 2FA / PIN hashes', async () => {
      const res = await http().get(`/api/v1/roles/${A.adminRoleId}`).set(as(A.adminToken));
      expect(res.status).toBe(200);
      expect(res.body.data.users[0].user.email).toContain('admin-a');
      expect(bodyText(res)).not.toMatch(/passwordHash|twoFactorSecret|posPinHash|SECRETHASH|PINHASHSECRET/);
    });

    it("cannot rename or delete another shop's role", async () => {
      const put = await http().put(`/api/v1/roles/${B.adminRoleId}`).set(as(A.adminToken)).send({ name: 'pwned' });
      const del = await http().delete(`/api/v1/roles/${B.adminRoleId}`).set(as(A.adminToken));
      expect(put.status).toBe(404);
      expect(del.status).toBe(404);
      expect((await prisma.role.findUnique({ where: { id: B.adminRoleId } }))?.name).toBe('Admin b');
    });

    it('rejects creating a SUPER_ADMIN or PLATFORM_STAFF role from a shop', async () => {
      for (const type of ['SUPER_ADMIN', 'PLATFORM_STAFF']) {
        const res = await http().post('/api/v1/roles').set(as(A.adminToken)).send({ name: `x-${type}`, type });
        expect(res.status).toBe(400);
      }
      expect(await prisma.role.count({ where: { tenantId: A.tenantId, name: { startsWith: 'x-' } } })).toBe(0);
    });

    it('rejects assigning a platform role to a shop user (privilege escalation)', async () => {
      const res = await http()
        .patch(`/api/v1/users/${A.adminId}/roles`).set(as(A.adminToken))
        .send({ roleIds: [platformRoleInA] });
      expect(res.status).toBe(403);
      const roles = await prisma.userRole.findMany({ where: { userId: A.adminId }, include: { role: true } });
      expect(roles.map((r) => r.role.type)).not.toContain(RoleType.SUPER_ADMIN);
    });

    it("rejects assigning another shop's role", async () => {
      const res = await http()
        .patch(`/api/v1/users/${A.cashierId}/roles`).set(as(A.adminToken))
        .send({ roleIds: [B.adminRoleId] });
      expect(res.status).toBe(403);
    });
  });

  // ── Variants ───────────────────────────────────────────────────────────

  describe('Variants API', () => {
    it("cannot read, update or delete another shop's variant", async () => {
      const url = `/api/v1/products/${B.productId}/variants/${B.variantId}`;
      expect((await http().get(url).set(as(A.adminToken))).status).toBe(404);
      expect((await http().put(url).set(as(A.adminToken)).send({ sellingPrice: 1 })).status).toBe(404);
      expect((await http().delete(url).set(as(A.adminToken))).status).toBe(404);
      const v = await prisma.productVariant.findUnique({ where: { id: B.variantId } });
      expect(v?.sellingPrice).toBe(250);
    });

    it("cannot reach another shop's variant through an own productId", async () => {
      const res = await http()
        .put(`/api/v1/products/${A.productId}/variants/${B.variantId}`).set(as(A.adminToken))
        .send({ sellingPrice: 1 });
      expect(res.status).toBe(404);
    });

    it('rejects non-whitelisted fields such as productId (mass assignment)', async () => {
      const res = await http()
        .put(`/api/v1/products/${A.productId}/variants/${A.variantId}`).set(as(A.adminToken))
        .send({ sellingPrice: 260, productId: B.productId });
      expect(res.status).toBe(400);
      expect((await prisma.productVariant.findUnique({ where: { id: A.variantId } }))?.productId).toBe(A.productId);
    });

    it('still updates own variant', async () => {
      const res = await http()
        .put(`/api/v1/products/${A.productId}/variants/${A.variantId}`).set(as(A.adminToken))
        .send({ sellingPrice: 260 });
      expect(res.status).toBe(200);
      expect((await prisma.productVariant.findUnique({ where: { id: A.variantId } }))?.sellingPrice).toBe(260);
    });
  });

  // ── Customers: mass assignment + financial authority ──────────────────

  describe('Customers API', () => {
    it('rejects balance / tenant fields in a profile update', async () => {
      for (const extra of [{ walletBalance: 100000 }, { loyaltyPoints: 99999 }, { creditBalance: 0 }, { tenantId: B.tenantId }]) {
        const res = await http().put(`/api/v1/customers/${A.customerId}`).set(as(A.cashierToken))
          .send({ firstName: 'Kamal', ...extra });
        expect(res.status).toBe(400);
      }
      const c = await prisma.customer.findUnique({ where: { id: A.customerId } });
      expect(c).toMatchObject({ walletBalance: 0, tenantId: A.tenantId, loyaltyPoints: 10 });
    });

    it('lets a cashier edit profile fields (unchanged credit limit included)', async () => {
      const res = await http().put(`/api/v1/customers/${A.customerId}`).set(as(A.cashierToken))
        .send({ firstName: 'Kamal', phone: '0771234567', creditLimit: 0, creditDays: 30, tags: ['vip'] });
      expect(res.status).toBe(200);
      expect((await prisma.customer.findUnique({ where: { id: A.customerId } }))?.firstName).toBe('Kamal');
    });

    it('blocks a cashier from raising a credit limit, allows a shop admin', async () => {
      const cashier = await http().put(`/api/v1/customers/${A.customerId}/credit/limit`).set(as(A.cashierToken)).send({ creditLimit: 50000 });
      const viaEdit = await http().put(`/api/v1/customers/${A.customerId}`).set(as(A.cashierToken)).send({ creditLimit: 50000 });
      expect(cashier.status).toBe(403);
      expect(viaEdit.status).toBe(403);
      const admin = await http().put(`/api/v1/customers/${A.customerId}/credit/limit`).set(as(A.adminToken)).send({ creditLimit: 50000 });
      expect(admin.status).toBe(200);
    });

    it('blocks cashier wallet top-ups and loyalty adjustments; validates amounts for admins', async () => {
      expect((await http().post(`/api/v1/customers/${A.customerId}/wallet/topup`).set(as(A.cashierToken)).send({ amount: 5000 })).status).toBe(403);
      expect((await http().post(`/api/v1/customers/${A.customerId}/wallet/topup`).set(as(A.adminToken)).send({ amount: -50 })).status).toBe(400);
      expect((await http().post(`/api/v1/customers/${A.customerId}/wallet/topup`).set(as(A.adminToken)).send({ amount: 500 })).status).toBe(400); // a funded top-up must say how it was paid
      expect((await http().post(`/api/v1/customers/${A.customerId}/wallet/topup`).set(as(A.adminToken)).send({ amount: 500, paymentMethod: 'CASH' })).status).toBe(201);
      expect((await prisma.customer.findUnique({ where: { id: A.customerId } }))?.walletBalance).toBe(500);
      expect((await http().post(`/api/v1/customers/${A.customerId}/credit/credit-notes`).set(as(A.cashierToken)).send({ amount: 100 })).status).toBe(403);
    });

    it("cannot adjust loyalty points of another shop's customer", async () => {
      await prisma.tenant.update({ where: { id: A.tenantId }, data: { shopType: 'CLOTHING' } }); // loyalty module on
      const res = await http().post(`/api/v1/customers/${B.customerId}/loyalty/add`).set(as(A.adminToken)).send({ points: 500 });
      expect(res.status).toBe(404);
      expect((await prisma.customer.findUnique({ where: { id: B.customerId } }))?.loyaltyPoints).toBe(10);
    });
  });

  // ── HR, branches, users ───────────────────────────────────────────────

  describe('HR, branches and users', () => {
    it('limits branch list and detail access to the assigned branch while admins retain tenant scope', async () => {
      const cashierList = await http().get('/api/v1/branches').set(as(A.cashierToken));
      expect(cashierList.status).toBe(200);
      expect(cashierList.body.data.data.map((branch: { id: string }) => branch.id)).toEqual([A.branchId]);

      const cashierDetail = await http().get(`/api/v1/branches/${A.secondBranchId}`).set(as(A.cashierToken));
      expect(cashierDetail.status).toBe(404);

      const adminList = await http().get('/api/v1/branches').set(as(A.adminToken));
      expect(adminList.status).toBe(200);
      expect(adminList.body.data.data.map((branch: { id: string }) => branch.id)).toEqual(
        expect.arrayContaining([A.branchId, A.secondBranchId]),
      );
      expect((await http().get(`/api/v1/branches/${A.secondBranchId}`).set(as(A.adminToken))).status).toBe(200);
    });

    it("cannot move an employee into another shop's branch", async () => {
      const res = await http().put(`/api/v1/hr/employees/${A.employeeId}`).set(as(A.adminToken)).send({ branchId: B.branchId });
      expect(res.status).toBe(403);
      expect((await prisma.employee.findUnique({ where: { id: A.employeeId } }))?.branchId).toBe(A.branchId);
    });

    describe('product opening stock branch scope', () => {
      it('does not let an assigned user seed opening stock across all branches', async () => {
        const otherBranch = await prisma.branch.create({
          data: { tenantId: A.tenantId, name: 'Stock Other', code: `STOCK-${run}` },
        });
        const response = await http().post('/api/v1/products').set(as(A.productCreatorToken)).send({
          name: `Scoped Product ${run}`,
          sku: `SCOPED-${run}`,
          sellingPrice: 10,
          costPrice: 8,
          mrp: 12,
          openingStock: 2,
          branchScope: 'ALL',
        });
        expect(response.status).toBe(201);
        const variant = await prisma.productVariant.findFirstOrThrow({
          where: { productId: response.body.data.id },
          select: { id: true },
        });
        const stock = await prisma.inventory.findMany({
          where: { tenantId: A.tenantId, variantId: variant.id },
          select: { branchId: true, quantity: true },
        });
        expect(stock).toEqual([{ branchId: A.branchId, quantity: 2 }]);
        expect(await prisma.branch.findUnique({ where: { id: otherBranch.id } })).not.toBeNull();
      });
    });

    it('limits employee listing to the assigned branch', async () => {
      const otherBranch = await prisma.branch.create({
        data: { tenantId: A.tenantId, name: 'Other', code: `OTHER-${run}` },
      });
      const otherEmployee = await prisma.employee.create({
        data: {
          tenantId: A.tenantId,
          branchId: otherBranch.id,
          firstName: 'Other',
          lastName: 'Branch',
          phone: `078${run.slice(-7)}`,
          joiningDate: new Date(),
          basicSalary: 50000,
        },
      });
      const res = await http().get('/api/v1/hr/employees').set(as(A.cashierToken));
      expect(res.status).toBe(200);
      expect(res.body.data.data.map((employee: { id: string }) => employee.id)).toContain(A.employeeId);
      expect(res.body.data.data.map((employee: { id: string }) => employee.id)).not.toContain(otherEmployee.id);
    });

    it("cannot write attendance for another shop's employee", async () => {
      const res = await http().post('/api/v1/hr/employees/attendance/bulk').set(as(A.adminToken))
        .send({ date: '2026-11-02', rows: [{ employeeId: B.employeeId, status: 'PRESENT' }] });
      expect(res.status).toBe(404);
      expect(await prisma.attendance.count({ where: { employeeId: B.employeeId } })).toBe(0);
    });

    it('rejects tenantId in a branch update', async () => {
      const res = await http().put(`/api/v1/branches/${A.branchId}`).set(as(A.adminToken)).send({ name: 'Main', tenantId: B.tenantId });
      expect(res.status).toBe(400);
    });

    it('rejects an invalid user status instead of passing it to the database', async () => {
      const res = await http().patch(`/api/v1/users/${A.cashierId}/status`).set(as(A.adminToken)).send({ status: 'GOD_MODE' });
      expect(res.status).toBe(400);
    });

    it('never returns password / 2FA / PIN hashes from user endpoints', async () => {
      const one = await http().get(`/api/v1/users/${A.cashierId}`).set(as(A.adminToken));
      const list = await http().get('/api/v1/users').set(as(A.adminToken));
      expect(one.status).toBe(200);
      expect(list.status).toBe(200);
      expect(bodyText(one) + bodyText(list)).not.toMatch(/passwordHash|twoFactorSecret|posPinHash|SECRETHASH|PINHASHSECRET/);
    });

    it('rejects a forged x-tenant-id header for another shop', async () => {
      const res = await http().get('/api/v1/customers').set(as(A.adminToken)).set('x-tenant-id', B.tenantId);
      expect(res.status).toBe(403);
    });

    it('never returns session tokens from user endpoints', async () => {
      // Legacy row written before sessions.token was hashed: the raw JWT must still not leave the API.
      await prisma.session.create({
        data: { userId: A.adminId, token: `LIVE-ACCESS-JWT-${run}`, expiresAt: new Date(Date.now() + 900_000) },
      });
      const res = await http().get(`/api/v1/users/${A.adminId}`).set(as(A.adminToken));
      expect(res.status).toBe(200);
      expect(res.body.data.sessions.length).toBeGreaterThan(0);
      expect(bodyText(res)).not.toContain(`LIVE-ACCESS-JWT-${run}`);
      expect(res.body.data.sessions[0]).not.toHaveProperty('token');
    });
  });

  // ── The real default Cashier role (ensureSystemRoles), not a hand-picked permission set ──

  describe('default Cashier role', () => {
    let cashierToken: string;

    beforeAll(async () => {
      const { ensureSystemRoles } = await import('../src/modules/roles/default-system-roles');
      await ensureSystemRoles(prisma, A.tenantId);
      const role = await prisma.role.findFirstOrThrow({ where: { tenantId: A.tenantId, name: 'Cashier' } });
      const u = await prisma.user.create({
        data: {
          tenantId: A.tenantId, branchId: A.branchId, email: `default-cashier-${run}@sec.test`, passwordHash: 'x',
          firstName: 'Default', lastName: 'Cashier', status: 'ACTIVE', emailVerified: true,
          roles: { create: { roleId: role.id } },
        },
      });
      cashierToken = jwt.sign({ sub: u.id, email: u.email, tenantId: A.tenantId, roles: [], permissions: [] });
    });

    it('cannot rewrite variant price / cost / MRP (would defeat the POS price guard)', async () => {
      const res = await http().put(`/api/v1/products/${A.productId}/variants/${A.variantId}`).set(as(cashierToken))
        .send({ costPrice: 0, sellingPrice: 1, mrp: 1 });
      expect(res.status).toBe(403);
      const v = await prisma.productVariant.findUniqueOrThrow({ where: { id: A.variantId } });
      expect(v.costPrice).toBeGreaterThan(0);
    });

    it('cannot open a customer with a credit limit, but can register a cash customer', async () => {
      const phone = () => `071${Math.floor(1e6 + Math.random() * 8e6)}`;
      const credit = await http().post('/api/v1/customers').set(as(cashierToken))
        .send({ firstName: 'Credit', lastName: 'Abuse', phone: phone(), creditLimit: 999_999_999 });
      expect(credit.status).toBe(403);

      const cash = await http().post('/api/v1/customers').set(as(cashierToken))
        .send({ firstName: 'Walk', lastName: 'In', phone: phone(), creditLimit: 0 });
      expect(cash.status).toBe(201);
    });

    it('lets a shop admin open a customer with credit', async () => {
      const res = await http().post('/api/v1/customers').set(as(A.adminToken))
        .send({ firstName: 'Trusted', lastName: 'Buyer', phone: `072${Math.floor(1e6 + Math.random() * 8e6)}`, creditLimit: 50_000 });
      expect(res.status).toBe(201);
      expect(res.body.data.creditLimit).toBe(50_000);
    });
  });
});
