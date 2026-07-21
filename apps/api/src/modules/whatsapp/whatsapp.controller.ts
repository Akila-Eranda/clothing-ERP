import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequireAnyPermissions } from '@/common/decorators/permissions.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { RoleType } from '@prisma/client';
import { WhatsappSendBillDto, WhatsappSendDto } from './whatsapp.dto';
import { WhatsappService } from './whatsapp.service';

@ApiTags('WhatsApp')
@ApiBearerAuth('access-token')
@Controller({ path: 'whatsapp', version: '1' })
export class WhatsappController {
  constructor(private readonly whatsapp: WhatsappService) {}

  @Get('status')
  @RequireAnyPermissions('sales:read', 'settings:read', 'sales:create')
  @ApiOperation({ summary: 'WhatsApp connection status + QR (when connecting)' })
  status(@CurrentUser() user: IAuthUser) {
    return this.whatsapp.getStatus(user.tenantId);
  }

  @Post('connect')
  @Roles(RoleType.TENANT_ADMIN, RoleType.SUPER_ADMIN, RoleType.BRANCH_MANAGER, RoleType.CASHIER)
  @ApiOperation({ summary: 'Start WhatsApp Web session and show QR to scan' })
  connect(@CurrentUser() user: IAuthUser) {
    return this.whatsapp.connect(user.tenantId);
  }

  @Post('disconnect')
  @Roles(RoleType.TENANT_ADMIN, RoleType.SUPER_ADMIN, RoleType.BRANCH_MANAGER, RoleType.CASHIER)
  @ApiOperation({ summary: 'Logout WhatsApp session for this shop' })
  disconnect(@CurrentUser() user: IAuthUser) {
    return this.whatsapp.disconnect(user.tenantId);
  }

  @Post('send')
  @RequireAnyPermissions('sales:create', 'customers:update')
  @ApiOperation({ summary: 'Send a WhatsApp text message' })
  send(@CurrentUser() user: IAuthUser, @Body() dto: WhatsappSendDto) {
    return this.whatsapp.sendText(user.tenantId, user.id, dto);
  }

  @Post('send-bill')
  @RequireAnyPermissions('sales:create')
  @ApiOperation({ summary: 'Send sale bill / invoice summary via WhatsApp' })
  sendBill(@CurrentUser() user: IAuthUser, @Body() dto: WhatsappSendBillDto) {
    return this.whatsapp.sendBill(user.tenantId, user.id, dto);
  }
}
