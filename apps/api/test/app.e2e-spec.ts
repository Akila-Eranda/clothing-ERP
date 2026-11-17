/**
 * Smoke test of the FULL AppModule, bootstrapped like main.ts (prefix, URI versioning, pipes,
 * filters, interceptors). It is the only suite that exercises the real middleware wiring in
 * app.module.ts. Needs PostgreSQL (DATABASE_URL) and Redis (REDIS_HOST / REDIS_PORT / REDIS_PASSWORD).
 *
 * F-33b: the old version referenced a hard-coded pnpm path to @types/jest and did not compile.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

jest.setTimeout(120_000);

describe('HexaOne API smoke (full AppModule)', () => {
  let app: INestApplication;
  const run = Date.now().toString(36);
  const shop = `smoke${run}`;
  const adminEmail = `owner-${run}@smoke.test`;
  const adminPassword = `Smoke-${run}-Pass!`;
  // supertest's default Host (127.0.0.1) would itself count as a shop hint; use a plain host.
  const http = () => {
    const agent = request(app.getHttpServer());
    return {
      get: (u: string) => agent.get(u).set('Host', 'localhost'),
      post: (u: string) => agent.post(u).set('Host', 'localhost'),
    };
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
    app.useGlobalFilters(new HttpExceptionFilter(), new PrismaExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();
  });

  afterAll(async () => { await app?.close(); });

  it('GET /api/v1/health → 200 without any tenant', async () => {
    expect((await http().get('/api/v1/health')).status).toBe(200);
  });

  it('registers a new shop without a tenant header', async () => {
    const res = await http().post('/api/v1/tenants/register').send({
      companyName: `Smoke ${run}`, subdomain: shop, adminEmail, adminPassword,
      adminFirstName: 'Smoke', adminLastName: 'Owner', shopType: 'GROCERY',
    });
    expect(res.status).toBe(201);
  });

  it('registration without adminPassword → 400', async () => {
    const res = await http().post('/api/v1/tenants/register').send({
      companyName: 'No Pass', subdomain: `nopass${run}`, adminEmail: `nopass-${run}@smoke.test`, adminFirstName: 'No', adminLastName: 'Pass',
    });
    expect(res.status).toBe(400);
  });

  it('login with no shop → 400; unknown shop → 401; wrong password → 401', async () => {
    expect((await http().post('/api/v1/auth/login').send({ email: adminEmail, password: adminPassword })).status).toBe(400);
    expect((await http().post('/api/v1/auth/login').set('x-tenant-id', `ghost${run}`).send({ email: adminEmail, password: adminPassword })).status).toBe(401);
    expect((await http().post('/api/v1/auth/login').set('x-tenant-id', shop).send({ email: adminEmail, password: 'wrong-password' })).status).toBe(401);
  });

  it('the new shop admin can sign in and read their own customers; protected routes need a shop', async () => {
    const login = await http().post('/api/v1/auth/login').set('x-tenant-id', shop).send({ email: adminEmail, password: adminPassword });
    expect(login.status).toBe(200);
    const token = login.body.data.accessToken as string;
    expect(token).toBeTruthy();
    const own = await http().get('/api/v1/customers').set({ Authorization: `Bearer ${token}`, 'x-tenant-id': shop });
    expect(own.status).toBe(200);
    const noShop = await http().get('/api/v1/customers').set({ Authorization: `Bearer ${token}` });
    expect(noShop.status).toBe(400);
  });
});
