import { Module, MiddlewareConsumer, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';

import appConfig from './config/app.config';
import jwtConfig from './config/jwt.config';
import redisConfig from './config/redis.config';
import databaseConfig from './config/database.config';
import storageConfig from './config/storage.config';
import mailConfig from './config/mail.config';
import keycloakConfig from './config/keycloak.config';

import { PrismaModule } from './prisma/prisma.module';
import { TenantMiddleware } from './common/middleware/tenant.middleware';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { ProductsModule } from './modules/products/products.module';
import { VariantsModule } from './modules/variants/variants.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { PosModule } from './modules/pos/pos.module';
import { SalesModule } from './modules/sales/sales.module';
import { ReturnsModule } from './modules/returns/returns.module';
import { CustomersModule } from './modules/customers/customers.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { PurchasesModule } from './modules/purchases/purchases.module';
import { AccountingModule } from './modules/accounting/accounting.module';
import { HrModule } from './modules/hr/hr.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ReportsModule } from './modules/reports/reports.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { BranchesModule } from './modules/branches/branches.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { FilesModule } from './modules/files/files.module';
import { PromotionsModule } from './modules/promotions/promotions.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { MailModule } from './modules/mail/mail.module';
import { CollectionsModule } from './modules/collections/collections.module';
import { WebsocketModule } from './websocket/websocket.module';
import { QueuesModule } from './queues/queues.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    // ── Config ──────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, jwtConfig, redisConfig, databaseConfig, storageConfig, mailConfig, keycloakConfig],
      envFilePath: ['.env.local', '.env'],
      expandVariables: true,
    }),

    // ── Rate Limiting ────────────────────────────────────────
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: () => ({
        throttlers: [
          { name: 'short', ttl: 1000, limit: 10 },
          { name: 'medium', ttl: 10000, limit: 50 },
          { name: 'long', ttl: 60000, limit: 200 },
        ],
      }),
    }),

    // ── Events ───────────────────────────────────────────────
    EventEmitterModule.forRoot({ wildcard: true, delimiter: '.', maxListeners: 20 }),

    // ── Scheduler ────────────────────────────────────────────
    ScheduleModule.forRoot(),

    // ── Core ─────────────────────────────────────────────────
    PrismaModule,

    // ── Feature Modules ──────────────────────────────────────
    AuthModule,
    UsersModule,
    RolesModule,
    ProductsModule,
    VariantsModule,
    InventoryModule,
    PosModule,
    SalesModule,
    ReturnsModule,
    CustomersModule,
    SuppliersModule,
    PurchasesModule,
    AccountingModule,
    HrModule,
    DashboardModule,
    ReportsModule,
    NotificationsModule,
    BranchesModule,
    TenantsModule,
    FilesModule,
    PromotionsModule,
    AuditLogModule,
    CollectionsModule,

    // ── Infrastructure ────────────────────────────────────────
    MailModule,
    HealthModule,
    WebsocketModule,
    QueuesModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(TenantMiddleware)
      .exclude(
        { path: 'api/v1/tenants/register', method: RequestMethod.POST },
        { path: 'api/v1/auth/login', method: RequestMethod.POST },
        { path: 'api/v1/auth/platform-login', method: RequestMethod.POST },
        { path: 'api/v1/health', method: RequestMethod.GET },
      )
      .forRoutes('*');
  }
}
