import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './notifications.dto';

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
