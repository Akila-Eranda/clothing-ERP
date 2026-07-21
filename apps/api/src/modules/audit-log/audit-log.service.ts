/** Audit Engine — sole audit/activity write + query boundary. */

import { Injectable, BadRequestException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '@/prisma/prisma.service';
import { IAuthUser } from '@/common/decorators/current-user.decorator';
import { paginate, getPaginationArgs } from '@/shared/pagination.helper';
import * as dayjs from 'dayjs';
import {
  AUDIT_ACTIONS,
  AUDIT_ACTION_LIST,
  normalizeClientAuditAction,
  sanitizeAuditData,
  buildAuthLoginAudit,
  buildAuthLogoutAudit,
  buildAuthLoginFailedAudit,
  buildPosSaleAudit,
  buildDayClosedAudit,
  buildWorkflowApprovedAudit,
  buildWorkflowRejectedAudit,
} from './audit-engine.helper';
import { AuditLogPayload, ClientAuditEventDto } from './audit-log.dto';

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async log(payload: AuditLogPayload) {
    const data = { ...payload };
    try {
      if (data.userId) {
        const userOk = await this.prisma.user.findUnique({
          where: { id: data.userId },
          select: { id: true },
        });
        if (!userOk) data.userId = undefined;
      }
      return await this.prisma.auditLog.create({ data });
    } catch {
      // Retry without userId (orphan JWT / soft-deleted user must never break writes)
      if (data.userId) {
        try {
          return await this.prisma.auditLog.create({
            data: { ...data, userId: null },
          });
        } catch {
          /* audit must never break main flow */
        }
      }
    }
  }

  async findAll(
    tenantId: string,
    query: {
      page?: number;
      limit?: number;
      userId?: string;
      resource?: string;
      action?: string;
      startDate?: string;
      endDate?: string;
      search?: string;
    },
  ) {
    const { skip, take } = getPaginationArgs(query.page, query.limit);
    const search = query.search?.trim();
    const where = {
      tenantId,
      ...(query.userId && { userId: query.userId }),
      ...(query.resource && { resource: { contains: query.resource, mode: 'insensitive' as const } }),
      ...(query.action && { action: { contains: query.action, mode: 'insensitive' as const } }),
      ...(query.startDate &&
        query.endDate && {
          createdAt: {
            gte: dayjs(query.startDate).startOf('day').toDate(),
            lte: dayjs(query.endDate).endOf('day').toDate(),
          },
        }),
      ...(search && {
        OR: [
          { action: { contains: search, mode: 'insensitive' as const } },
          { resource: { contains: search, mode: 'insensitive' as const } },
          { resourceId: { contains: search, mode: 'insensitive' as const } },
          { ipAddress: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take,
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paginate(data, total, query.page ?? 1, query.limit ?? 50);
  }

  async findAllPlatform(query: {
    page?: number;
    limit?: number;
    search?: string;
    action?: string;
  }) {
    const { skip, take } = getPaginationArgs(query.page, query.limit);
    const where = {
      ...(query.action &&
        query.action !== 'ALL' && {
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
      this.prisma.activityLog.findMany({
        where: { userId },
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.activityLog.count({ where: { userId } }),
    ]);
    return paginate(data, total, query.page ?? 1, query.limit ?? 20);
  }

  async logActivity(
    userId: string,
    action: string,
    description?: string,
    metadata?: object,
    ipAddress?: string,
  ) {
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
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              lastLoginAt: true,
              lastLoginIp: true,
            },
          },
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

  /** Summary counts by Sprint-12 action for the tenant (dashboard chips). */
  async getActionSummary(tenantId: string, days = 30) {
    const since = dayjs().subtract(days, 'day').startOf('day').toDate();
    const rows = await this.prisma.auditLog.groupBy({
      by: ['action'],
      where: { tenantId, createdAt: { gte: since } },
      _count: { _all: true },
    });
    const byAction: Record<string, number> = {};
    for (const a of AUDIT_ACTION_LIST) byAction[a] = 0;
    for (const row of rows) {
      const key = row.action.toUpperCase();
      byAction[key] = (byAction[key] ?? 0) + row._count._all;
    }
    return { days, total: rows.reduce((s, r) => s + r._count._all, 0), byAction };
  }

  async logClientEvent(
    user: IAuthUser,
    dto: ClientAuditEventDto,
    ip?: string,
    userAgent?: string,
  ) {
    const action = normalizeClientAuditAction(dto.action);
    if (!action) {
      throw new BadRequestException('Client audit action must be PRINT or EXPORT');
    }
    return this.log({
      tenantId: user.tenantId,
      userId: user.id,
      action,
      resource: dto.resource,
      resourceId: dto.resourceId,
      newData: sanitizeAuditData(dto.metadata ?? {}),
      ipAddress: ip,
      userAgent,
    });
  }

  @OnEvent('auth.login')
  async onAuthLogin(payload: {
    userId: string;
    tenantId: string;
    ip?: string;
    userAgent?: string;
  }) {
    await this.logActivity(payload.userId, AUDIT_ACTIONS.LOGIN, 'User signed in', {}, payload.ip);
    await this.log(buildAuthLoginAudit(payload));
  }

  @OnEvent('auth.logout')
  async onAuthLogout(payload: {
    userId: string;
    tenantId: string;
    ip?: string;
    userAgent?: string;
  }) {
    await this.logActivity(payload.userId, AUDIT_ACTIONS.LOGOUT, 'User signed out', {}, payload.ip);
    await this.log(buildAuthLogoutAudit(payload));
  }

  @OnEvent('auth.login.failed')
  async onAuthLoginFailed(payload: {
    tenantId?: string;
    userId?: string;
    email?: string;
    ip?: string;
    userAgent?: string;
    reason?: string;
  }) {
    if (!payload.tenantId) return;
    await this.log(buildAuthLoginFailedAudit({ ...payload, tenantId: payload.tenantId }));
  }

  @OnEvent('pos.sale.completed')
  async onSaleCompleted(payload: {
    saleId: string;
    tenantId: string;
    branchId: string;
    total: number;
  }) {
    await this.log(buildPosSaleAudit(payload));
  }

  @OnEvent('pos.day.closed')
  async onDayClosed(payload: {
    tenantId: string;
    branchId: string;
    closedBy: string;
    totalRevenue: number;
  }) {
    await this.log(buildDayClosedAudit(payload));
  }

  @OnEvent('workflow.approved')
  async onWorkflowApproved(payload: {
    tenantId: string;
    userId: string;
    taskId: string;
    entityType: string;
    entityId: string;
    final?: boolean;
  }) {
    await this.log(buildWorkflowApprovedAudit(payload));
  }

  @OnEvent('workflow.rejected')
  async onWorkflowRejected(payload: {
    tenantId: string;
    userId: string;
    taskId: string;
    entityType: string;
    entityId: string;
    comment?: string;
  }) {
    await this.log(buildWorkflowRejectedAudit(payload));
  }
}
