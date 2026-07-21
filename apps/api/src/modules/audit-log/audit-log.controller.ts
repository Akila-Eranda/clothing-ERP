import { Controller, Get, Post, Body, Query, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { RoleType } from '@prisma/client';
import { AuditLogService } from './audit-log.service';
import { ClientAuditEventDto } from './audit-log.dto';

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

  @Get('summary')
  @RequirePermissions('users:read')
  @ApiOperation({ summary: 'Audit action summary for tenant (Sprint 12)' })
  summary(@CurrentUser() user: IAuthUser, @Query('days') days?: string) {
    return this.auditLogService.getActionSummary(
      user.tenantId,
      days ? parseInt(days, 10) : 30,
    );
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
    @Query('search') search?: string,
  ) {
    return this.auditLogService.findAll(user.tenantId, {
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
      userId,
      resource,
      action,
      startDate,
      endDate,
      search,
    });
  }

  @Post('client-event')
  @ApiOperation({ summary: 'Record client-side PRINT / EXPORT audit events' })
  clientEvent(
    @CurrentUser() user: IAuthUser,
    @Body() dto: ClientAuditEventDto,
    @Req() req: Request,
  ) {
    return this.auditLogService.logClientEvent(
      user,
      dto,
      req.ip,
      req.headers['user-agent'],
    );
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
