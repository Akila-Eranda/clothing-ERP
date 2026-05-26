import { Module } from '@nestjs/common';
import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IsString, IsOptional, IsEnum, IsBoolean, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationChannel, NotificationType } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { paginate, getPaginationArgs } from '@/shared/pagination.helper';
import { PaginationDto } from '@/common/dto/pagination.dto';

export class CreateNotificationDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsString() message: string;
  @ApiPropertyOptional({ enum: NotificationType }) @IsOptional() @IsEnum(NotificationType) type?: NotificationType;
  @ApiPropertyOptional({ enum: NotificationChannel }) @IsOptional() @IsEnum(NotificationChannel) channel?: NotificationChannel;
  @ApiPropertyOptional() @IsOptional() @IsString() link?: string;
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) recipientIds: string[];
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async send(tenantId: string, dto: CreateNotificationDto) {
    const notification = await this.prisma.notification.create({
      data: {
        tenantId,
        title: dto.title,
        message: dto.message,
        type: dto.type ?? NotificationType.INFO,
        channel: dto.channel ?? NotificationChannel.IN_APP,
        recipients: dto.recipientIds,
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
    return paginate(data, total, query.page ?? 1, query.limit ?? 20);
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

  @OnEvent('inventory.low-stock')
  async handleLowStock(payload: { tenantId: string; variantId: string; branchId: string; quantity: number }) {
    const admins = await this.prisma.user.findMany({
      where: { tenantId: payload.tenantId, roles: { some: { role: { type: { in: ['SUPER_ADMIN', 'TENANT_ADMIN', 'BRANCH_MANAGER'] } } } } },
      select: { id: true },
    });

    if (admins.length === 0) return;

    const variant = await this.prisma.productVariant.findUnique({
      where: { id: payload.variantId },
      include: { product: true },
    });

    await this.send(payload.tenantId, {
      title: 'Low Stock Alert',
      message: `${variant?.product?.name ?? 'Product'} (${variant?.name ?? ''}) has only ${payload.quantity} units left`,
      type: NotificationType.LOW_STOCK,
      link: `/inventory`,
      recipientIds: admins.map((a) => a.id),
    });
  }

  @OnEvent('pos.sale.completed')
  async handleSaleCompleted(payload: { saleId: string; tenantId: string; total: number }) {
    // Could trigger external webhooks, emails, etc.
  }

  @OnEvent('pos.day.closed')
  async handleDayClosed(payload: { tenantId: string; closedBy: string; totalRevenue: number; totalSales: number }) {
    const admins = await this.prisma.user.findMany({
      where: { tenantId: payload.tenantId, roles: { some: { role: { type: { in: ['SUPER_ADMIN', 'TENANT_ADMIN'] } } } } },
      select: { id: true },
    });
    if (!admins.length) return;
    await this.send(payload.tenantId, {
      title: 'Day End Summary',
      message: `Today's closing: ${payload.totalSales} sales · LKR ${payload.totalRevenue.toFixed(2)} revenue`,
      type: NotificationType.DAILY_SUMMARY,
      recipientIds: admins.map(a => a.id),
    });
  }

  @Cron('0 8 * * *')
  async sendBirthdayReminders() {
    const today = new Date();
    const month = today.getMonth() + 1;
    const day   = today.getDate();
    const tenants = await this.prisma.tenant.findMany({ select: { id: true } });
    for (const tenant of tenants) {
      const customers = await this.prisma.customer.findMany({
        where: { tenantId: tenant.id, isActive: true, dateOfBirth: { not: null } },
        select: { id: true, firstName: true, lastName: true, dateOfBirth: true },
      });
      const birthdays = customers.filter(c => {
        if (!c.dateOfBirth) return false;
        const d = new Date(c.dateOfBirth);
        return d.getMonth() + 1 === month && d.getDate() === day;
      });
      if (!birthdays.length) continue;
      const admins = await this.prisma.user.findMany({
        where: { tenantId: tenant.id, roles: { some: { role: { type: { in: ['SUPER_ADMIN', 'TENANT_ADMIN', 'CASHIER'] } } } } },
        select: { id: true },
      });
      if (!admins.length) continue;
      await this.send(tenant.id, {
        title: `🎂 Birthday Reminders — ${birthdays.length} customer(s) today`,
        message: birthdays.map(c => `${c.firstName} ${c.lastName ?? ''}`.trim()).join(', '),
        type: NotificationType.BIRTHDAY_REMINDER,
        recipientIds: admins.map(a => a.id),
      });
    }
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

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  markAsRead(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.notificationsService.markAsRead(id, user.id);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllAsRead(@CurrentUser() user: IAuthUser) {
    return this.notificationsService.markAllAsRead(user.id, user.tenantId);
  }

  @Post('send')
  @ApiOperation({ summary: 'Send notification to users' })
  send(@CurrentUser() user: IAuthUser, @Body() dto: CreateNotificationDto) {
    return this.notificationsService.send(user.tenantId, dto);
  }
}

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
