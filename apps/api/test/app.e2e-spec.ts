/// <reference path="../node_modules/.pnpm/@types+jest@29.5.14/node_modules/@types/jest/index.d.ts" />
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('HexaOne API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix('api');

    prisma = moduleFixture.get<PrismaService>(PrismaService);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Health Check ──────────────────────────────────────────
  describe('GET /api/health', () => {
    it('should return 200 OK', () => {
      return request(app.getHttpServer())
        .get('/api/health')
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe('ok');
        });
    });
  });

  // ── Tenant Registration ───────────────────────────────────
  describe('POST /api/v1/tenants/register', () => {
    const registerDto = {
      companyName: 'Test Fashion Store',
      subdomain: `test-${Date.now()}`,
      adminEmail: `admin-${Date.now()}@test.com`,
      adminPassword: 'Admin@123456',
      adminFirstName: 'Admin',
      adminLastName: 'User',
    };

    it('should register a new tenant', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/tenants/register')
        .send(registerDto)
        .expect(201);

      expect(res.body.data.tenant).toBeDefined();
      expect(res.body.data.tenant.subdomain).toBe(registerDto.subdomain);
      expect(res.body.data.initialPassword).toBe(registerDto.adminPassword);
    });

    it('should return 400 when adminPassword is missing', () => {
      return request(app.getHttpServer())
        .post('/api/v1/tenants/register')
        .send({
          companyName: 'No Pass Store',
          subdomain: `nopass-${Date.now()}`,
          adminEmail: `nopass-${Date.now()}@test.com`,
          adminFirstName: 'No',
          adminLastName: 'Pass',
        })
        .expect(400);
    });
  });

  // ── Auth Flow ─────────────────────────────────────────────
  describe('Auth endpoints', () => {
    let accessToken: string;
    let refreshToken: string;

    const credentials = {
      email: `user-${Date.now()}@test.com`,
      password: 'Test@123456',
    };

    it('should return 401 for invalid credentials', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'nonexistent@test.com', password: 'wrong' })
        .expect(401);
    });

    // Additional auth tests would be set up with seeded test data
  });
});
