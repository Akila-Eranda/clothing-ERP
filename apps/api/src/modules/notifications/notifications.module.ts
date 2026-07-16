import { Module } from '@nestjs/common';
import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';
import { IsString, IsOptional, IsEnum, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationChannel, NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { paginate, getPaginationArgs } from '@/shared/pagination.helper';
import { PaginationDto } from '@/common/dto/pagination.dto';
import {
  dateKey,
  daysUntil,
  extractDedupeKey,
  isDueWithin,
  isExpiryAlert,
  isLowStock,
  isReorderNeeded,
  notificationTypeFor,
  planChequeDueAlert,
  planCustomerDueAlert,
  planDailySummaryAlert,
  planExpiryAlert,
  planGrnPendingAlert,
  planLowStockAlert,
  planPoPendingAlert,
  planReorderAlert,
  planSupplierDueAlert,
  shouldSendNotification,
  type PlannedAlert,
} from './notification-triggers.helper';

export class CreateNotificationDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsString() message: string;
  @ApiPropertyOptional({ enum: NotificationType }) @IsOptional() @IsEnum(NotificationType) type?: NotificationType;
  @ApiPropertyOptional({ enum: NotificationChannel }) @IsOptional() @IsEnum(NotificationChannel) channel?: NotificationChannel;
  @ApiPropertyOptional() @IsOptional() @IsString() link?: string;
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) recipientIds: string[];
  @ApiPropertyOptional() @IsOptional() data?: Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async send(tenantId: string, dto: CreateNotificationDto & { data?: Record<string, unknown> }) {
    const data = {
      ...(dto.data ?? {}),
      ...(dto.link ? { link: dto.link } : {}),
    };
    const notification = await this.prisma.notification.create({
      data: {
        tenantId,
        title: dto.title,
        message: dto.message,
        type: dto.type ?? NotificationType.INFO,
        channel: dto.channel ?? NotificationChannel.IN_APP,
        recipients: dto.recipientIds,
        data: data as Prisma.InputJsonValue,
        sentAt: new Date(),
      },
    });
    if (dto.recipientIds.length > 0) {
      await this.prisma.userNotification.createMany({
        data: dto.recipientIds.map((userId) => ({ userId, notificationId: notification.id })),
        skipDuplicates: true,
      });
    }
    return notification;
  }

  async getForUser(userId: string, tenantId: string, query: PaginationDto) {
    const { skip, take } = getPaginationArgs(query.page, query.limit);
    const where = { userId, notification: { tenantId } };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.userNotification.findMany({
        where, skip, take,
        include: { notification: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.userNotification.count({ where }),
    ]);
    const mapped = data.map((row) => {
      const n = row.notification;
      const payload = (n.data ?? {}) as Record<string, unknown>;
      return {
        ...row,
        notification: {
          ...n,
          link: typeof payload.link === 'string' ? payload.link : null,
        },
      };
    });
    return paginate(mapped, total, query.page ?? 1, query.limit ?? 20);
  }

  async getUnreadCount(userId: string, tenantId: string) {
    return this.prisma.userNotification.count({
      where: { userId, isRead: false, notification: { tenantId } },
    });
  }

  async markAsRead(id: string, userId: string) {
    return this.prisma.userNotification.updateMany({
      where: { notificationId: id, userId },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllAsRead(userId: string, tenantId: string) {
    return this.prisma.userNotification.updateMany({
      where: { userId, isRead: false, notification: { tenantId } },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async queueSms(tenantId: string, userId: string, body: { phone: string; message: string; type?: string }) {
    return this.prisma.notification.create({
      data: {
        tenantId,
        title: body.type ? `SMS: ${body.type}` : 'SMS Notification',
        message: `[${body.phone}] ${body.message}`,
        type: NotificationType.INFO,
        channel: NotificationChannel.SMS,
        recipients: [userId],
        data: { phone: body.phone, smsType: body.type ?? 'general', status: 'queued' },
      },
    });
  }

  private async managerIds(tenantId: string, includeCashier = false) {
    const types = includeCashier
      ? (['SUPER_ADMIN', 'TENANT_ADMIN', 'BRANCH_MANAGER', 'INVENTORY_MANAGER', 'ACCOUNTANT', 'CASHIER'] as const)
      : (['SUPER_ADMIN', 'TENANT_ADMIN', 'BRANCH_MANAGER', 'INVENTORY_MANAGER', 'ACCOUNTANT'] as const);
    const users = await this.prisma.user.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        roles: { some: { role: { type: { in: [...types] } } } },
      },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  private async recentDedupeKeys(tenantId: string, sinceHours = 24): Promise<Set<string>> {
    const since = new Date(Date.now() - sinceHours * 3600_000);
    const rows = await this.prisma.notification.findMany({
      where: { tenantId, createdAt: { gte: since } },
      select: { data: true },
      take: 2000,
    });
    const keys = new Set<string>();
    for (const r of rows) {
      const key = extractDedupeKey(r.data);
      if (key) keys.add(key);
    }
    return keys;
  }

  private resolveType(kind: string): NotificationType {
    const name = notificationTypeFor(kind as never);
    return (NotificationType as Record<string, NotificationType>)[name] ?? NotificationType.INFO;
  }

  private async dispatchPlanned(tenantId: string, alert: PlannedAlert, recipientIds: string[], existing: Set<string>) {
    if (!recipientIds.length) return false;
    if (!shouldSendNotification(alert.dedupeKey, existing)) return false;
    await this.send(tenantId, {
      title: alert.title,
      message: alert.message,
      type: this.resolveType(alert.kind),
      link: alert.link,
      recipientIds,
      data: { ...alert.data, dedupeKey: alert.dedupeKey, kind: alert.kind },
    });
    existing.add(alert.dedupeKey);
    return true;
  }

  @OnEvent('inventory.low-stock')
  async handleLowStock(payload: {
    tenantId: string;
    variantId: string;
    branchId: string;
    quantity: number;
    reorderPoint?: number;
    minStockLevel?: number;
    reservedQty?: number;
  }) {
    if (!isLowStock(payload.quantity, {
      reorderPoint: payload.reorderPoint,
      minStockLevel: payload.minStockLevel,
    })) return;

    const admins = await this.managerIds(payload.tenantId);
    if (!admins.length) return;

    const variant = await this.prisma.productVariant.findUnique({
      where: { id: payload.variantId },
      include: { product: true },
    });

    const existing = await this.recentDedupeKeys(payload.tenantId, 20);
    const alert = planLowStockAlert({
      variantId: payload.variantId,
      branchId: payload.branchId,
      sku: variant?.sku ?? payload.variantId,
      productName: variant?.product?.name ?? 'Product',
      quantity: payload.quantity,
      reorderPoint: payload.reorderPoint,
    });
    await this.dispatchPlanned(payload.tenantId, alert, admins, existing);

    if (isReorderNeeded(payload.quantity, payload.reservedQty ?? 0, payload.reorderPoint)) {
      const reorder = planReorderAlert({
        variantId: payload.variantId,
        branchId: payload.branchId,
        sku: variant?.sku ?? payload.variantId,
        productName: variant?.product?.name ?? 'Product',
        available: Math.max(0, payload.quantity - (payload.reservedQty ?? 0)),
        reorderPoint: payload.reorderPoint && payload.reorderPoint > 0 ? payload.reorderPoint : 5,
      });
      await this.dispatchPlanned(payload.tenantId, reorder, admins, existing);
    }
  }

  @OnEvent('pos.day.closed')
  async handleDayClosed(payload: { tenantId: string; closedBy: string; totalRevenue: number; totalSales: number }) {
    const admins = await this.managerIds(payload.tenantId);
    if (!admins.length) return;
    const existing = await this.recentDedupeKeys(payload.tenantId, 24);
    const alert = planDailySummaryAlert({
      salesCount: payload.totalSales,
      revenue: payload.totalRevenue,
      day: dateKey(),
    });
    await this.dispatchPlanned(payload.tenantId, alert, admins, existing);
  }

  @Cron('0 8 * * *')
  async sendBirthdayReminders() {
    const today = new Date();
    const month = today.getMonth() + 1;
    const day = today.getDate();
    const tenants = await this.prisma.tenant.findMany({ where: { status: { in: ['ACTIVE', 'TRIAL'] } }, select: { id: true } });
    for (const tenant of tenants) {
      const customers = await this.prisma.customer.findMany({
        where: { tenantId: tenant.id, isActive: true, dateOfBirth: { not: null } },
        select: { id: true, firstName: true, lastName: true, dateOfBirth: true },
      });
      const birthdays = customers.filter((c) => {
        if (!c.dateOfBirth) return false;
        const d = new Date(c.dateOfBirth);
        return d.getMonth() + 1 === month && d.getDate() === day;
      });
      if (!birthdays.length) continue;
      const admins = await this.managerIds(tenant.id, true);
      if (!admins.length) continue;
      await this.send(tenant.id, {
        title: `Birthday Reminders — ${birthdays.length} customer(s) today`,
        message: birthdays.map((c) => `${c.firstName} ${c.lastName ?? ''}`.trim()).join(', '),
        type: NotificationType.BIRTHDAY_REMINDER,
        recipientIds: admins,
        data: { dedupeKey: `BIRTHDAY:${dateKey()}` },
      });
    }
  }

  /** Morning scan: expiry, dues, pending PO/GRN, reorder. */
  @Cron('15 7 * * *')
  async runMorningAlertScan() {
    await this.runPhase12Scans('morning');
  }

  /** Evening fallback daily summary if day was not closed. */
  @Cron('0 21 * * *')
  async runEveningDailySummary() {
    await this.runPhase12Scans('evening-summary');
  }

  /** Manual trigger for ops / tests. */
  async runPhase12Scans(mode: 'morning' | 'evening-summary' | 'all' = 'all') {
    const tenants = await this.prisma.tenant.findMany({
      where: { status: { in: ['ACTIVE', 'TRIAL'] } },
      select: { id: true },
    });
    let sent = 0;
    for (const tenant of tenants) {
      try {
        if (mode === 'morning' || mode === 'all') {
          sent += await this.scanTenantAlerts(tenant.id);
        }
        if (mode === 'evening-summary' || mode === 'all') {
          sent += await this.scanDailySummary(tenant.id);
        }
      } catch (err) {
        this.logger.warn(`Phase12 scan failed for tenant ${tenant.id}: ${(err as Error).message}`);
      }
    }
    return { tenants: tenants.length, sent };
  }

  private async scanTenantAlerts(tenantId: string): Promise<number> {
    const admins = await this.managerIds(tenantId);
    if (!admins.length) return 0;
    const existing = await this.recentDedupeKeys(tenantId, 22);
    const now = new Date();
    let sent = 0;

    // Low stock + reorder (batch)
    const inventory = await this.prisma.inventory.findMany({
      where: { tenantId, quantity: { lte: 50 } },
      include: { variant: { include: { product: true } } },
      take: 300,
    });
    for (const inv of inventory) {
      if (!isLowStock(inv.quantity, { reorderPoint: inv.reorderPoint, minStockLevel: inv.minStockLevel })) continue;
      const low = planLowStockAlert({
        variantId: inv.variantId,
        branchId: inv.branchId,
        sku: inv.variant.sku,
        productName: inv.variant.product.name,
        quantity: inv.quantity,
        reorderPoint: inv.reorderPoint,
      });
      if (await this.dispatchPlanned(tenantId, low, admins, existing)) sent += 1;

      if (isReorderNeeded(inv.quantity, inv.reservedQty, inv.reorderPoint)) {
        const reorder = planReorderAlert({
          variantId: inv.variantId,
          branchId: inv.branchId,
          sku: inv.variant.sku,
          productName: inv.variant.product.name,
          available: Math.max(0, inv.quantity - inv.reservedQty),
          reorderPoint: inv.reorderPoint > 0 ? inv.reorderPoint : 5,
        });
        if (await this.dispatchPlanned(tenantId, reorder, admins, existing)) sent += 1;
      }
    }

    // Expiry (≤7d or expired)
    const until = new Date(now);
    until.setDate(until.getDate() + 7);
    const lots = await this.prisma.inventoryLot.findMany({
      where: {
        tenantId,
        isActive: true,
        quantity: { gt: 0 },
        expiryDate: { not: null, lte: until },
      },
      include: { variant: { include: { product: true } } },
      take: 200,
      orderBy: { expiryDate: 'asc' },
    });
    for (const lot of lots) {
      if (!isExpiryAlert(lot.expiryDate, 7, now)) continue;
      const alert = planExpiryAlert({
        lotId: lot.id,
        productName: lot.variant.product.name,
        batchNumber: lot.batchNumber,
        daysToExpiry: daysUntil(lot.expiryDate!, now),
        quantity: lot.quantity,
      });
      if (await this.dispatchPlanned(tenantId, alert, admins, existing)) sent += 1;
    }

    // Customer due (open/partial charges due within 3d or overdue)
    const creditDue = await this.prisma.customerCreditTransaction.findMany({
      where: {
        tenantId,
        type: 'CHARGE',
        status: { in: ['OPEN', 'PARTIAL'] },
        dueDate: { not: null, lte: new Date(now.getTime() + 3 * 86400000) },
      },
      include: { customer: { select: { id: true, firstName: true, lastName: true } } },
      take: 150,
    });
    for (const c of creditDue) {
      if (!c.dueDate) continue;
      const outstanding = Math.max(0, c.amount - (c.paidAmount ?? 0));
      if (outstanding <= 0) continue;
      const alert = planCustomerDueAlert({
        customerId: c.customerId,
        customerName: `${c.customer.firstName} ${c.customer.lastName ?? ''}`.trim(),
        amount: outstanding,
        dueDate: c.dueDate,
        now,
      });
      if (await this.dispatchPlanned(tenantId, alert, admins, existing)) sent += 1;
    }

    // Supplier invoices due
    const invoices = await this.prisma.supplierInvoice.findMany({
      where: {
        tenantId,
        status: { in: ['POSTED', 'PARTIALLY_PAID'] },
        dueDate: { not: null, lte: new Date(now.getTime() + 3 * 86400000) },
      },
      include: { supplier: { select: { name: true } } },
      take: 150,
    });
    for (const inv of invoices) {
      if (!inv.dueDate) continue;
      const outstanding = Math.max(0, inv.total - (inv.paidAmount ?? 0));
      if (outstanding <= 0) continue;
      if (!isDueWithin(inv.dueDate, 3, now)) continue;
      const alert = planSupplierDueAlert({
        invoiceId: inv.id,
        supplierName: inv.supplier.name,
        amount: outstanding,
        dueDate: inv.dueDate,
        now,
      });
      if (await this.dispatchPlanned(tenantId, alert, admins, existing)) sent += 1;
    }

    // Cheques due
    const cheques = await this.prisma.cheque.findMany({
      where: {
        tenantId,
        status: { in: ['RECEIVED', 'ISSUED', 'DEPOSITED'] },
        dueDate: { not: null, lte: new Date(now.getTime() + 3 * 86400000) },
      },
      take: 150,
    });
    for (const ch of cheques) {
      if (!ch.dueDate || !isDueWithin(ch.dueDate, 3, now)) continue;
      const alert = planChequeDueAlert({
        chequeId: ch.id,
        chequeNumber: ch.chequeNumber,
        amount: ch.amount,
        dueDate: ch.dueDate,
        partyName: ch.partyName,
        now,
      });
      if (await this.dispatchPlanned(tenantId, alert, admins, existing)) sent += 1;
    }

    // PO pending approval / sent
    const pendingPos = await this.prisma.purchaseOrder.findMany({
      where: {
        tenantId,
        status: { in: ['PENDING_APPROVAL', 'SENT', 'CONFIRMED'] },
      },
      include: {
        supplier: { select: { name: true } },
        items: { select: { orderedQty: true, receivedQty: true } },
      },
      take: 100,
    });
    for (const po of pendingPos) {
      if (po.status === 'PENDING_APPROVAL' || po.status === 'SENT') {
        const alert = planPoPendingAlert({
          poId: po.id,
          poNumber: po.poNumber,
          supplierName: po.supplier.name,
          status: po.status,
          expectedDate: po.expectedDate,
        });
        if (await this.dispatchPlanned(tenantId, alert, admins, existing)) sent += 1;
      }

      const orderedQty = po.items.reduce((s, i) => s + i.orderedQty, 0);
      const receivedQty = po.items.reduce((s, i) => s + i.receivedQty, 0);
      if ((po.status === 'CONFIRMED' || po.status === 'SENT' || po.status === 'PARTIALLY_RECEIVED') && receivedQty < orderedQty) {
        const alert = planGrnPendingAlert({
          poId: po.id,
          poNumber: po.poNumber,
          supplierName: po.supplier.name,
          orderedQty,
          receivedQty,
        });
        if (await this.dispatchPlanned(tenantId, alert, admins, existing)) sent += 1;
      }
    }

    return sent;
  }

  private async scanDailySummary(tenantId: string): Promise<number> {
    const admins = await this.managerIds(tenantId);
    if (!admins.length) return 0;
    const existing = await this.recentDedupeKeys(tenantId, 24);
    const day = dateKey();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const agg = await this.prisma.sale.aggregate({
      where: {
        tenantId,
        status: { not: 'CANCELLED' },
        invoiceDate: { gte: start, lte: end },
      },
      _sum: { total: true },
      _count: { _all: true },
    });

    const alert = planDailySummaryAlert({
      salesCount: agg._count._all,
      revenue: agg._sum.total ?? 0,
      day,
    });
    return (await this.dispatchPlanned(tenantId, alert, admins, existing)) ? 1 : 0;
  }
}

@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@Controller({ path: 'notifications', version: '1' })
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get my notifications' })
  getNotifications(@CurrentUser() user: IAuthUser, @Query() query: PaginationDto) {
    return this.notificationsService.getForUser(user.id, user.tenantId, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  getUnreadCount(@CurrentUser() user: IAuthUser) {
    return this.notificationsService.getUnreadCount(user.id, user.tenantId);
  }

  @Post('scan')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Run Phase 12 notification scans (manual / ops)' })
  runScan(@Query('mode') mode?: 'morning' | 'evening-summary' | 'all') {
    return this.notificationsService.runPhase12Scans(mode ?? 'all');
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllAsRead(@CurrentUser() user: IAuthUser) {
    return this.notificationsService.markAllAsRead(user.id, user.tenantId);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  markAsRead(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.notificationsService.markAsRead(id, user.id);
  }

  @Post('send')
  @RequirePermissions('users:update')
  @ApiOperation({ summary: 'Send notification to users' })
  send(@CurrentUser() user: IAuthUser, @Body() dto: CreateNotificationDto) {
    return this.notificationsService.send(user.tenantId, dto);
  }

  @Post('sms')
  @RequirePermissions('customers:update')
  @ApiOperation({ summary: 'Queue SMS notification (invoice, reminder, promo)' })
  sendSms(
    @CurrentUser() user: IAuthUser,
    @Body() body: { phone: string; message: string; type?: string },
  ) {
    return this.notificationsService.queueSms(user.tenantId, user.id, body);
  }
}

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
