import {
  BadRequestException, Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, Post, Put, Query,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { memoryStorage } from 'multer';
import * as QRCode from 'qrcode';
import { PaymentQrMode } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequireAnyPermissions, RequirePermissions } from '@/common/decorators/permissions.decorator';
import { FilesModule, FilesService } from '@/modules/files/files.module';
import { AuditLogModule, AuditLogService } from '@/modules/audit-log/audit-log.module';
import { resolveBranchScope } from '@/shared/branch-scope.helper';
import {
  buildDynamicEmvPayload, emvMerchantName, QR_IMAGE_MAX_BYTES, QR_IMAGE_MIME, validateEmvPayload,
} from './payment-qr.helper';

export class CreatePaymentQrDto {
  @ApiProperty() @IsString() @MaxLength(80) label: string;
  @ApiProperty({ description: 'Bank account (Accounting → Banking) that receives the money' }) @IsString() bankAccountId: string;
  @ApiPropertyOptional({ enum: PaymentQrMode }) @IsOptional() @IsEnum(PaymentQrMode) mode?: PaymentQrMode;
  @ApiPropertyOptional({ description: 'EMVCo / LankaQR text printed in the QR (needed for DYNAMIC)' })
  @IsOptional() @IsString() @MaxLength(512) merchantPayload?: string;
  @ApiPropertyOptional({ description: 'Limit to one branch; empty = all branches' }) @IsOptional() @IsString() branchId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefault?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class UpdatePaymentQrDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) label?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bankAccountId?: string;
  @ApiPropertyOptional({ enum: PaymentQrMode }) @IsOptional() @IsEnum(PaymentQrMode) mode?: PaymentQrMode;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(512) merchantPayload?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() branchId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefault?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class RenderPaymentQrDto {
  @ApiProperty() @IsNumber() @Min(0.01) amount: number;
}

const PUBLIC_SELECT = {
  id: true, label: true, mode: true, imageUrl: true, branchId: true, isActive: true, isDefault: true, sortOrder: true,
  bankAccountId: true, merchantPayload: true, createdAt: true, updatedAt: true,
  bankAccount: { select: { id: true, name: true, code: true, bankName: true, accountNumber: true, accountHolderName: true, branchName: true, branchCode: true } },
} as const;

@Injectable()
export class PaymentQrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
    private readonly audit: AuditLogService,
  ) {}

  private async assertBankAccount(tenantId: string, bankAccountId: string) {
    const acct = await this.prisma.bankAccount.findFirst({ where: { id: bankAccountId, tenantId, isActive: true }, select: { id: true } });
    if (!acct) throw new BadRequestException('Bank account not found or inactive');
  }

  private async assertBranch(tenantId: string, branchId?: string | null) {
    if (!branchId) return;
    const b = await this.prisma.branch.findFirst({ where: { id: branchId, tenantId }, select: { id: true } });
    if (!b) throw new BadRequestException('Branch not found');
  }

  private checkModePayload(mode: PaymentQrMode, payload: string | null | undefined) {
    if (payload) {
      const err = validateEmvPayload(payload);
      if (err) throw new BadRequestException(err);
    }
    if (mode === PaymentQrMode.DYNAMIC && !payload) {
      throw new BadRequestException('A dynamic QR needs the QR text (EMVCo / LankaQR payload) from your bank');
    }
  }

  private shape<T extends { merchantPayload: string | null }>(row: T) {
    const { merchantPayload, ...rest } = row;
    return { ...rest, hasPayload: !!merchantPayload, merchantName: emvMerchantName(merchantPayload) };
  }

  async list(tenantId: string, branchId?: string) {
    const rows = await this.prisma.paymentQrCode.findMany({
      where: {
        tenantId,
        ...(branchId ? { OR: [{ branchId: null }, { branchId }] } : {}),
      },
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { label: 'asc' }],
      select: PUBLIC_SELECT,
    });
    return rows.map((r) => this.shape(r));
  }

  /** Active codes usable at this branch's POS (images and labels only; payload stays on the server). */
  async listForPos(tenantId: string, branchId?: string | null) {
    const rows = await this.prisma.paymentQrCode.findMany({
      where: {
        tenantId, isActive: true, bankAccount: { isActive: true },
        ...(branchId ? { OR: [{ branchId: null }, { branchId }] } : {}),
      },
      orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { label: 'asc' }],
      select: PUBLIC_SELECT,
    });
    return rows.map((r) => this.shape(r));
  }

  async create(tenantId: string, userId: string, dto: CreatePaymentQrDto) {
    const label = dto.label.trim();
    if (!label) throw new BadRequestException('Label is required');
    await this.assertBankAccount(tenantId, dto.bankAccountId);
    await this.assertBranch(tenantId, dto.branchId);
    const mode = dto.mode ?? PaymentQrMode.STATIC;
    const payload = dto.merchantPayload?.trim() || null;
    this.checkModePayload(mode, payload);
    const created = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await tx.paymentQrCode.updateMany({ where: { tenantId, isDefault: true }, data: { isDefault: false } });
      return tx.paymentQrCode.create({
        data: {
          tenantId, label, mode, bankAccountId: dto.bankAccountId, branchId: dto.branchId || null,
          merchantPayload: payload, isDefault: !!dto.isDefault, sortOrder: dto.sortOrder ?? 0,
          createdById: userId, updatedById: userId,
        },
        select: PUBLIC_SELECT,
      });
    });
    await this.audit.log({ tenantId, userId, action: 'CREATE', resource: 'payment_qr_codes', resourceId: created.id, newData: { label, mode, bankAccountId: dto.bankAccountId } });
    return this.shape(created);
  }

  async update(tenantId: string, userId: string, id: string, dto: UpdatePaymentQrDto) {
    const existing = await this.prisma.paymentQrCode.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('QR code not found');
    if (dto.bankAccountId) await this.assertBankAccount(tenantId, dto.bankAccountId);
    if (dto.branchId) await this.assertBranch(tenantId, dto.branchId);
    const mode = dto.mode ?? existing.mode;
    const payload = dto.merchantPayload !== undefined ? dto.merchantPayload.trim() || null : existing.merchantPayload;
    this.checkModePayload(mode, payload);
    if (dto.label !== undefined && !dto.label.trim()) throw new BadRequestException('Label is required');
    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await tx.paymentQrCode.updateMany({ where: { tenantId, isDefault: true, NOT: { id } }, data: { isDefault: false } });
      return tx.paymentQrCode.update({
        where: { id },
        data: {
          ...(dto.label !== undefined ? { label: dto.label.trim() } : {}),
          ...(dto.bankAccountId ? { bankAccountId: dto.bankAccountId } : {}),
          ...(dto.branchId !== undefined ? { branchId: dto.branchId || null } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
          mode, merchantPayload: payload, updatedById: userId,
        },
        select: PUBLIC_SELECT,
      });
    });
    await this.audit.log({
      tenantId, userId, action: 'UPDATE', resource: 'payment_qr_codes', resourceId: id,
      oldData: { label: existing.label, mode: existing.mode, bankAccountId: existing.bankAccountId, isActive: existing.isActive },
      newData: { label: updated.label, mode: updated.mode, bankAccountId: updated.bankAccountId, isActive: updated.isActive },
    });
    return this.shape(updated);
  }

  async uploadImage(tenantId: string, userId: string, id: string, file: Express.Multer.File) {
    const existing = await this.prisma.paymentQrCode.findFirst({ where: { id, tenantId }, select: { id: true, imageUrl: true } });
    if (!existing) throw new NotFoundException('QR code not found');
    if (!file) throw new BadRequestException('Choose a QR image (PNG, JPG or WebP)');
    if (!QR_IMAGE_MIME.has(file.mimetype)) throw new BadRequestException('QR image must be PNG, JPG or WebP');
    if ((file.size ?? file.buffer?.length ?? 0) > QR_IMAGE_MAX_BYTES) throw new BadRequestException('QR image must be 2 MB or smaller');
    // FilesService checks the bytes match the declared type, stores under the tenant with a random name.
    const stored = await this.files.uploadFile(tenantId, userId, file, 'payment-qr');
    const updated = await this.prisma.paymentQrCode.update({
      where: { id }, data: { imageUrl: stored.url, updatedById: userId }, select: PUBLIC_SELECT,
    });
    await this.audit.log({ tenantId, userId, action: 'UPDATE', resource: 'payment_qr_codes', resourceId: id, oldData: { imageUrl: existing.imageUrl }, newData: { imageUrl: stored.url } });
    return this.shape(updated);
  }

  async removeImage(tenantId: string, userId: string, id: string) {
    const existing = await this.prisma.paymentQrCode.findFirst({
      where: { id, tenantId },
      select: { id: true, imageUrl: true },
    });
    if (!existing) throw new NotFoundException('QR code not found');
    if (existing.imageUrl) {
      const file = await this.prisma.fileUpload.findFirst({
        where: { tenantId, url: existing.imageUrl },
        select: { id: true },
      });
      if (file) await this.files.remove(file.id, tenantId);
    }

    const updated = await this.prisma.paymentQrCode.update({
      where: { id },
      data: { imageUrl: null, updatedById: userId },
      select: PUBLIC_SELECT,
    });
    await this.audit.log({
      tenantId,
      userId,
      action: 'UPDATE',
      resource: 'payment_qr_codes',
      resourceId: id,
      oldData: { imageUrl: existing.imageUrl },
      newData: { imageUrl: null },
    });
    return this.shape(updated);
  }

  /**
   * What to show the customer: DYNAMIC codes get a QR with the exact amount (generated here);
   * STATIC codes show the uploaded image (or a QR of the static payload when no image was uploaded).
   */
  async render(tenantId: string, branchId: string | null | undefined, id: string, amount: number) {
    const code = await this.prisma.paymentQrCode.findFirst({
      // a QR code whose bank account has been disabled is no longer usable, even from a screen that still lists it
      where: { id, tenantId, isActive: true, bankAccount: { isActive: true }, ...(branchId ? { OR: [{ branchId: null }, { branchId }] } : {}) },
      select: { ...PUBLIC_SELECT },
    });
    if (!code) throw new NotFoundException('QR code not found or inactive');
    const base = {
      qrCodeId: code.id, label: code.label, bankAccountId: code.bankAccountId, bankAccount: code.bankAccount,
      merchantName: emvMerchantName(code.merchantPayload), amount: Math.round(amount * 100) / 100,
    };
    if (code.mode === PaymentQrMode.DYNAMIC && code.merchantPayload) {
      const payload = buildDynamicEmvPayload(code.merchantPayload, amount);
      return { ...base, mode: 'DYNAMIC' as const, imageUrl: null, dataUrl: await QRCode.toDataURL(payload, { margin: 1, width: 320, errorCorrectionLevel: 'M' }) };
    }
    if (code.imageUrl) {
      const image = await this.files.readByUrl(tenantId, code.imageUrl);
      if (!image) throw new NotFoundException('The selected QR image is missing from tenant storage');
      return {
        ...base,
        mode: 'STATIC' as const,
        imageUrl: code.imageUrl,
        dataUrl: `data:${image.mimeType};base64,${image.data.toString('base64')}`,
      };
    }
    if (code.merchantPayload) {
      return { ...base, mode: 'STATIC' as const, imageUrl: null, dataUrl: await QRCode.toDataURL(code.merchantPayload, { margin: 1, width: 320, errorCorrectionLevel: 'M' }) };
    }
    throw new BadRequestException('This QR code has no image or QR text yet — configure it in Accounting → Cash & Bank → Accounts');
  }
}

@ApiTags('Payment QR codes')
@ApiBearerAuth('access-token')
@Controller({ path: 'payment-qr', version: '1' })
export class PaymentQrController {
  constructor(private readonly service: PaymentQrService) {}

  @Get()
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'All QR payment codes (admin)' })
  list(@CurrentUser() user: IAuthUser) {
    return this.service.list(user.tenantId, resolveBranchScope(user));
  }

  @Get('pos')
  @RequireAnyPermissions('sales:create', 'accounting:read')
  @ApiOperation({ summary: 'Active QR codes for this branch POS' })
  listForPos(@CurrentUser() user: IAuthUser, @Query('branchId') branchId?: string) {
    return this.service.listForPos(user.tenantId, resolveBranchScope(user, branchId));
  }

  @Post()
  @RequirePermissions('accounting:update')
  @ApiOperation({ summary: 'Add a QR payment code' })
  create(@CurrentUser() user: IAuthUser, @Body() dto: CreatePaymentQrDto) {
    return this.service.create(user.tenantId, user.id, {
      ...dto,
      branchId: resolveBranchScope(user, dto.branchId),
    });
  }

  @Put(':id')
  @RequirePermissions('accounting:update')
  @ApiOperation({ summary: 'Update / deactivate a QR payment code' })
  update(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: UpdatePaymentQrDto) {
    return this.service.update(user.tenantId, user.id, id, {
      ...dto,
      ...(dto.branchId !== undefined
        ? { branchId: resolveBranchScope(user, dto.branchId) }
        : {}),
    });
  }

  @Post(':id/image')
  @RequirePermissions('accounting:update')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: QR_IMAGE_MAX_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload the QR image (PNG / JPG / WebP, max 2 MB)' })
  uploadImage(@CurrentUser() user: IAuthUser, @Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    return this.service.uploadImage(user.tenantId, user.id, id, file);
  }

  @Delete(':id/image')
  @RequirePermissions('accounting:update')
  @ApiOperation({ summary: 'Remove the uploaded QR image' })
  removeImage(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.service.removeImage(user.tenantId, user.id, id);
  }

  @Post(':id/render')
  @RequireAnyPermissions('sales:create', 'accounting:read')
  @ApiOperation({ summary: 'QR to show the customer for an amount (dynamic codes include the amount)' })
  render(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: RenderPaymentQrDto) {
    return this.service.render(user.tenantId, user.branchId, id, dto.amount);
  }
}

@Module({
  imports: [FilesModule, AuditLogModule],
  controllers: [PaymentQrController],
  providers: [PaymentQrService],
  exports: [PaymentQrService],
})
export class PaymentQrModule {}
