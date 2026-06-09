import { Module } from '@nestjs/common';
import { Controller, Get, Query, Injectable } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '@/prisma/prisma.service';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { RoleType } from '@prisma/client';
import { paginate, getPaginationArgs } from '@/shared/pagination.helper';
import * as dayjs from 'dayjs';

export interface AuditLogPayload {
  tenantId: string;
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  oldData?: object;
  newData?: object;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async log(payload: AuditLogPayload) {
    try {
      return await this.prisma.auditLog.create({ data: payload });
    } catch {
      // audit logging should never break the main flow
    }
  }

  async findAll(tenantId: string, query: {
    page?: number; limit?: number; userId?: string;
    resource?: string; action?: string; startDate?: string; endDate?: string;
  }) {
    const { skip, take } = getPaginationArgs(query.page, query.limit);
    const where = {
      tenantId,
      ...(query.userId && { userId: query.userId }),
      ...(query.resource && { resource: query.resource }),
      ...(query.action && { action: { contains: query.action, mode: 'insensitive' as const } }),
      ...(query.startDate && query.endDate && {
        createdAt: {
          gte: dayjs(query.startDate).startOf('day').toDate(),
          lte: dayjs(query.endDate).endOf('day').toDate(),
        },
      }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where, skip, take,
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paginate(data, total, query.page ?? 1, query.limit ?? 50);
  }

  async findAllPlatform(query: {
    page?: number; limit?: number; search?: string; action?: string;
  }) {
    const { skip, take } = getPaginationArgs(query.page, query.limit);
    const where = {
      ...(query.action && query.action !== 'ALL' && {
        action: { contains: query.action, mode: 'insensitive' as const },
      }),
      ...(query.search?.trim() && {
        OR: [
          { action: { contains: query.search.trim(), mode: 'insensitive' as const } },
          { resource: { contains: query.search.trim(), mode: 'insensitive' as const } },
        ],
      }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
          tenant: { select: { id: true, name: true, subdomain: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paginate(data, total, query.page ?? 1, query.limit ?? 50);
  }

  async getActivityLogs(userId: string, query: { page?: number; limit?: number }) {
    const { skip, take } = getPaginationArgs(query.page, query.limit);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.activityLog.findMany({ where: { userId }, skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.activityLog.count({ where: { userId } }),
    ]);
    return paginate(data, total, query.page ?? 1, query.limit ?? 20);
  }

  async logActivity(userId: string, action: string, description?: string, metadata?: object, ipAddress?: string) {
    try {
      return await this.prisma.activityLog.create({
        data: { userId, action, description, metadata: metadata ?? {}, ipAddress },
      });
    } catch {
      // should never break main flow
    }
  }

  async getLoginHistory(tenantId: string, query: { page?: number; limit?: number }) {
    const { skip, take } = getPaginationArgs(query.page, query.limit);
    const users = await this.prisma.user.findMany({ where: { tenantId }, select: { id: true } });
    const userIds = users.map((u) => u.id);
    if (userIds.length === 0) return paginate([], 0, query.page ?? 1, query.limit ?? 30);

    const where = { userId: { in: userIds } };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.session.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true, lastLoginAt: true, lastLoginIp: true } },
        },
      }),
      this.prisma.session.count({ where }),
    ]);
    return paginate(
      data.map((s) => ({
        id: s.id,
        userId: s.userId,
        userName: `${s.user.firstName} ${s.user.lastName ?? ''}`.trim(),
        email: s.user.email,
        ipAddress: s.ipAddress ?? s.user.lastLoginIp,
        userAgent: s.userAgent,
        deviceName: s.deviceName,
        createdAt: s.createdAt,
        lastUsedAt: s.lastUsedAt,
        isActive: s.isActive,
      })),
      total,
      query.page ?? 1,
      query.limit ?? 30,
    );
  }

  @OnEvent('auth.login')
  async onAuthLogin(payload: { userId: string; tenantId: string; ip?: string }) {
    await this.logActivity(payload.userId, 'LOGIN', 'User signed in', {}, payload.ip);
    await this.log({
      tenantId: payload.tenantId,
      userId: payload.userId,
      action: 'LOGIN',
      resource: 'Auth',
      ipAddress: payload.ip,
    });
  }

  @OnEvent('pos.sale.completed')
  async onSaleCompleted(payload: { saleId: string; tenantId: string; branchId: string; total: number }) {
    await this.log({
      tenantId: payload.tenantId,
      action: 'CREATE',
      resource: 'Sale',
      resourceId: payload.saleId,
      newData: { total: payload.total, branchId: payload.branchId },
    });
  }

  @OnEvent('pos.day.closed')
  async onDayClosed(payload: { tenantId: string; branchId: string; closedBy: string; totalRevenue: number }) {
    await this.log({
      tenantId: payload.tenantId,
      userId: payload.closedBy,
      action: 'DAY_END',
      resource: 'POS',
      newData: { branchId: payload.branchId, totalRevenue: payload.totalRevenue },
    });
  }
}

@ApiTags('Audit Logs')
@ApiBearerAuth('access-token')
@Controller({ path: 'audit-logs', version: '1' })
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get('platform')
  @Roles(RoleType.SUPER_ADMIN)
  @ApiOperation({ summary: 'Platform-wide audit logs (Super Admin)' })
  findAllPlatform(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('action') action?: string,
  ) {
    return this.auditLogService.findAllPlatform({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
      search,
      action,
    });
  }

  @Get()
  @RequirePermissions('users:read')
  @ApiOperation({ summary: 'Get audit logs (admin)' })
  findAll(
    @CurrentUser() user: IAuthUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('userId') userId?: string,
    @Query('resource') resource?: string,
    @Query('action') action?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.auditLogService.findAll(user.tenantId, {
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
      userId, resource, action, startDate, endDate,
    });
  }

  @Get('login-history')
  @RequirePermissions('users:read')
  @ApiOperation({ summary: 'User login session history for tenant' })
  loginHistory(
    @CurrentUser() user: IAuthUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditLogService.getLoginHistory(user.tenantId, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 30,
    });
  }

  @Get('my-activity')
  @ApiOperation({ summary: 'Get current user activity log' })
  myActivity(
    @CurrentUser() user: IAuthUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditLogService.getActivityLogs(user.id, {
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
  }
}

@Module({
  controllers: [AuditLogController],
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditLogModule {}
