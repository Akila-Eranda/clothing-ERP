import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, VersioningType, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import * as compression from 'compression';
import helmet from 'helmet';
import * as morgan from 'morgan';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { validateSecurityConfig } from './shared/security/bootstrap-validation';

async function bootstrap(): Promise<void> {
  validateSecurityConfig();
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
    bufferLogs: false,
  });

  const config = app.get(ConfigService);
  const port = config.get<number>('app.port', 4000);
  const isDev = config.get<string>('app.env') !== 'production';

  // ── Client IP behind the reverse proxy ────────────────────
  // Without this, every request seen by Express comes from the proxy's own address, so the rate limiter (per client
  // IP) treats ALL users of the platform as ONE client (verified: 30 requests claiming 30 different client IPs ->
  // 10 served, 20 x 429). Set TRUST_PROXY_HOPS to the number of proxies in front of the API (nginx only = 1).
  // Default 0 = do not trust X-Forwarded-For (the API is reachable directly, so a client could spoof its IP).
  const proxyHops = parseInt(process.env.TRUST_PROXY_HOPS ?? '0', 10);
  if (Number.isInteger(proxyHops) && proxyHops > 0) app.set('trust proxy', proxyHops);

  // ── Security ──────────────────────────────────────────────
  app.use(helmet({ contentSecurityPolicy: !isDev }));

  // ── CORS ──────────────────────────────────────────────────
  const allowedOrigins = config.get<string[]>('app.allowedOrigins', ['http://localhost:3000']);
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // allow server-to-server / Swagger
      const isStatic = allowedOrigins.includes(origin);
      const isTenantShop = /^https?:\/\/[a-z0-9-]+\.shop\.hexalyte\.com$/.test(origin);
      const isLocalDev   = /^https?:\/\/localhost(:\d+)?$/.test(origin);
      if (isStatic || isTenantShop || isLocalDev) return callback(null, true);
      return callback(new Error(`CORS: origin ${origin} not allowed`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-tenant-id',
      'x-branch-id',
      'x-request-id',
      'x-pos-cashier-token',
      'x-cash-approval-token',
      'x-pos-counter-id',
    ],
  });

  // ── Compression ───────────────────────────────────────────
  app.use(compression());

  // ── HTTP Logger ───────────────────────────────────────────
  if (isDev) app.use(morgan('dev'));

  // ── API Versioning ────────────────────────────────────────
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // ── Global Pipes ──────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ── Global Filters ────────────────────────────────────────
  app.useGlobalFilters(new HttpExceptionFilter(), new PrismaExceptionFilter());

  // ── Global Interceptors ───────────────────────────────────
  app.useGlobalInterceptors(new LoggingInterceptor(), new ResponseInterceptor());

  // ── WebSocket Adapter ─────────────────────────────────────
  app.useWebSocketAdapter(new IoAdapter(app));

  // ── Swagger Docs ──────────────────────────────────────────
  if (isDev) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('HexaOne API')
      .setDescription('Enterprise AI-Powered Fashion Retail ERP — REST API Documentation')
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
      .addApiKey({ type: 'apiKey', name: 'x-tenant-id', in: 'header' }, 'tenant-id')
      .addTag('Auth', 'Authentication & Authorization')
      .addTag('Users', 'User Management')
      .addTag('Roles', 'Role & Permission Management')
      .addTag('Products', 'Product Catalog')
      .addTag('Variants', 'Product Variant Engine')
      .addTag('Inventory', 'Inventory Management')
      .addTag('POS', 'Point of Sale')
      .addTag('Sales', 'Sales & Transactions')
      .addTag('Returns', 'Returns & Exchanges')
      .addTag('Customers', 'Customer & CRM')
      .addTag('Suppliers', 'Supplier Management')
      .addTag('Purchases', 'Purchase Orders')
      .addTag('Accounting', 'Accounting & Finance')
      .addTag('HR', 'Human Resources')
      .addTag('Reports', 'Reports & Analytics')
      .addTag('Dashboard', 'Dashboard & KPIs')
      .addTag('Notifications', 'Notifications')
      .addTag('Branches', 'Branch Management')
      .addTag('Tenants', 'SaaS Tenant Management')
      .addTag('Files', 'File Storage')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
    });

    logger.log(`📚 Swagger docs available at http://localhost:${port}/api/docs`);
  }

  // ── Graceful Shutdown ─────────────────────────────────────
  app.enableShutdownHooks();

  await app.listen(port);

  logger.log(`🚀 HexaOne API running on http://localhost:${port}/api/v1`);
  logger.log(`🌍 Environment: ${config.get('app.env', 'development')}`);
}

bootstrap().catch((err) => {
  new Logger('Bootstrap').error('Failed to start application', err);
  process.exit(1);
});
