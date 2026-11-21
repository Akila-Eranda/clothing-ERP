/**
 * Opening stock keeps decimals (loose goods). Found during the CSV import QA on 6 Nov 2026:
 * POST /products with openingStock 50.5 stored 51. Real HTTP + PostgreSQL, synthetic shop.
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
import { ProductsModule } from '../src/modules/products/products.module';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { TenantGuard } from '../src/common/guards/tenant.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { BranchContextInterceptor } from '../src/common/interceptors/branch-context.interceptor';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';

jest.setTimeout(90_000);

describe('Products: opening stock keeps decimal quantities (HTTP + DB)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const run = Date.now().toString(36);
  let tenantId = '';
  let subdomain = '';
  let token = '';

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [appConfig, jwtConfig, databaseConfig, keycloakConfig], ignoreEnvFile: true }),
        EventEmitterModule.forRoot({ wildcard: true, delimiter: '.' }),
        PrismaModule, AuthModule, ProductsModule,
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
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
    app.useGlobalFilters(new HttpExceptionFilter(), new PrismaExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();
    prisma = moduleRef.get(PrismaService);

    subdomain = `os${run}`;
    const tenant = await prisma.tenant.create({ data: { name: `OS ${run}`, subdomain, shopType: 'GROCERY', plan: 'PROFESSIONAL', status: 'ACTIVE' } });
    tenantId = tenant.id;
    const branch = await prisma.branch.create({ data: { tenantId, name: 'Main', code: 'MAIN' } });
    const perms = await Promise.all(['products:create', 'products:read'].map((k) => {
      const [resource, action] = k.split(':');
      return prisma.permission.upsert({ where: { resource_action: { resource, action } }, update: {}, create: { resource, action } });
    }));
    const role = await prisma.role.create({ data: { tenantId, name: 'Admin', type: RoleType.TENANT_ADMIN, permissions: { create: perms.map((p) => ({ permissionId: p.id })) } } });
    const user = await prisma.user.create({
      data: { tenantId, branchId: branch.id, email: `admin-${run}@os.test`, passwordHash: 'x', firstName: 'A', lastName: 'B', status: 'ACTIVE', emailVerified: true, roles: { create: { roleId: role.id } } },
    });
    token = moduleRef.get(JwtService).sign({ sub: user.id, email: user.email, tenantId, roles: [], permissions: [] });
  });

  afterAll(async () => { await app?.close(); });

  it.each([
    [50.5, 50.5],
    [0.125, 0.125],
    [24, 24],
    [1.23456, 1.235], // 3 dp (gram precision)
  ])('openingStock %p is stored as %p', async (sent, stored) => {
    const r = await request(app.getHttpServer()).post('/api/v1/products')
      .set({ Authorization: `Bearer ${token}`, 'x-tenant-id': subdomain })
      .send({ name: `Loose ${sent} ${run}`, sellingPrice: 260, costPrice: 225, mrp: 260, unit: 'kg', trackInventory: true, openingStock: sent, status: 'ACTIVE' });
    expect(r.status).toBe(201);
    const rows = await prisma.inventory.findMany({ where: { tenantId, variant: { productId: r.body.data.id } }, select: { quantity: true } });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.quantity).toBe(stored);
  });
});
