import { Module } from '@nestjs/common';
import { Controller, Get, Post, Put, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IsString, IsOptional, IsEmail } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubscriptionPlan, TenantStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { Public } from '@/common/decorators/public.decorator';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { RoleType } from '@prisma/client';

export class ReceiptSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() shopName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() tagline?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() logoUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address1?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address2?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() website?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() headerText?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() footerText?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() paperWidth?: string;
  @ApiPropertyOptional() @IsOptional() showTax?: boolean;
  @ApiPropertyOptional() @IsOptional() showDiscount?: boolean;
  @ApiPropertyOptional() @IsOptional() showCashier?: boolean;
  @ApiPropertyOptional() @IsOptional() showCustomer?: boolean;
  @ApiPropertyOptional() @IsOptional() showBarcode?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() fontSize?: string;
}

export class RegisterTenantDto {
  @ApiProperty() @IsString() companyName: string;
  @ApiProperty() @IsString() subdomain: string;
  @ApiProperty() @IsEmail() adminEmail: string;
  @ApiProperty() @IsString() adminPassword: string;
  @ApiProperty() @IsString() adminFirstName: string;
  @ApiProperty() @IsString() adminLastName: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() country?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() timezone?: string;
}

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async register(dto: RegisterTenantDto) {
    const existing = await this.prisma.tenant.findFirst({
      where: { subdomain: dto.subdomain },
    });
    if (existing) throw new ConflictException('Subdomain already in use');

    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.hash(dto.adminPassword, 12);

    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.companyName,
          subdomain: dto.subdomain,
          email: dto.adminEmail,
          phone: dto.phone,
          country: dto.country ?? 'IN',
          currency: dto.currency ?? 'INR',
          timezone: dto.timezone ?? 'Asia/Kolkata',
          plan: SubscriptionPlan.STARTER,
          status: TenantStatus.ACTIVE,
        },
      });

      const branch = await tx.branch.create({
        data: {
          tenantId: tenant.id,
          name: `${dto.companyName} - Main`,
          code: 'HO-001',
          isDefault: true,
        },
      });

      const adminRole = await tx.role.create({
        data: {
          tenantId: tenant.id,
          name: 'Tenant Admin',
          type: RoleType.TENANT_ADMIN,
          isSystem: true,
        },
      });

      const adminUser = await tx.user.create({
        data: {
          tenantId: tenant.id,
          branchId: branch.id,
          email: dto.adminEmail,
          firstName: dto.adminFirstName,
          lastName: dto.adminLastName,
          passwordHash,
          status: UserStatus.ACTIVE,
          emailVerified: true,
          roles: { create: [{ roleId: adminRole.id }] },
        },
      });

      return { tenant, branch, adminUser };
    }).then((result) => {
      this.eventEmitter.emit('tenant.registered', {
        email: dto.adminEmail,
        name: dto.companyName,
        subdomain: dto.subdomain,
        adminName: `${dto.adminFirstName} ${dto.adminLastName}`,
      });
      return result;
    });
  }

  async findAll() {
    return this.prisma.tenant.findMany({
      include: { _count: { select: { users: true, branches: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        branches: true,
        _count: { select: { users: true, branches: true } },
      },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async getMyTenant(tenantId: string) {
    return this.findOne(tenantId);
  }

  async update(id: string, dto: Partial<RegisterTenantDto>) {
    return this.prisma.tenant.update({
      where: { id },
      data: {
        name: dto.companyName,
        phone: dto.phone,
        country: dto.country,
        currency: dto.currency,
        timezone: dto.timezone,
      },
    });
  }

  async getReceiptSettings(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true, name: true, phone: true, email: true } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    const s = (tenant.settings as Record<string, unknown>) ?? {};
    const receipt = (s['receipt'] as Record<string, unknown>) ?? {};
    return {
      shopName:     receipt['shopName']     ?? tenant.name,
      tagline:      receipt['tagline']      ?? '',
      logoUrl:      receipt['logoUrl']      ?? '',
      address1:     receipt['address1']     ?? '',
      address2:     receipt['address2']     ?? '',
      phone:        receipt['phone']        ?? tenant.phone ?? '',
      email:        receipt['email']        ?? tenant.email ?? '',
      website:      receipt['website']      ?? '',
      headerText:   receipt['headerText']   ?? '',
      footerText:   receipt['footerText']   ?? 'Thank you for shopping with us!',
      paperWidth:   receipt['paperWidth']   ?? '80mm',
      showTax:      receipt['showTax']      ?? true,
      showDiscount: receipt['showDiscount'] ?? true,
      showCashier:  receipt['showCashier']  ?? true,
      showCustomer: receipt['showCustomer'] ?? true,
      showBarcode:  receipt['showBarcode']  ?? false,
      fontSize:     receipt['fontSize']     ?? 'medium',
    };
  }

  async saveReceiptSettings(tenantId: string, dto: ReceiptSettingsDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    const existing = (tenant.settings as Record<string, unknown>) ?? {};
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { settings: { ...existing, receipt: { ...dto } } },
    });
    return this.getReceiptSettings(tenantId);
  }
}

@ApiTags('Tenants')
@Controller({ path: 'tenants', version: '1' })
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register new tenant (SaaS onboarding)' })
  register(@Body() dto: RegisterTenantDto) {
    return this.tenantsService.register(dto);
  }

  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get current tenant details' })
  getMyTenant(@CurrentUser() user: IAuthUser) {
    return this.tenantsService.getMyTenant(user.tenantId);
  }

  @Put('me')
  @ApiBearerAuth('access-token')
  @Roles(RoleType.TENANT_ADMIN, RoleType.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update tenant settings' })
  update(@CurrentUser() user: IAuthUser, @Body() dto: Partial<RegisterTenantDto>) {
    return this.tenantsService.update(user.tenantId, dto);
  }

  @Get('receipt-settings')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get receipt/thermal print settings' })
  getReceiptSettings(@CurrentUser() user: IAuthUser) {
    return this.tenantsService.getReceiptSettings(user.tenantId);
  }

  @Put('receipt-settings')
  @ApiBearerAuth('access-token')
  @Roles(RoleType.TENANT_ADMIN, RoleType.SUPER_ADMIN)
  @ApiOperation({ summary: 'Save receipt/thermal print settings' })
  saveReceiptSettings(@CurrentUser() user: IAuthUser, @Body() dto: ReceiptSettingsDto) {
    return this.tenantsService.saveReceiptSettings(user.tenantId, dto);
  }

  @Get()
  @ApiBearerAuth('access-token')
  @Roles(RoleType.SUPER_ADMIN)
  @ApiOperation({ summary: 'List all tenants (Super Admin only)' })
  findAll() {
    return this.tenantsService.findAll();
  }
}

@Module({
  controllers: [TenantsController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
