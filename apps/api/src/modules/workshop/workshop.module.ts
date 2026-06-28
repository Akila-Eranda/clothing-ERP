import {
  Injectable, Module, NotFoundException, BadRequestException,
  Controller, Get, Post, Put, Body, Param, Query,
} from '@nestjs/common';
import {
  ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags,
} from '@nestjs/swagger';
import {
  IsArray, IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  AppointmentStatus, JobCardStatus, ServiceLineType, ServiceReminderChannel,
  ServiceReminderStatus, TyreSerialStatus,
} from '@prisma/client';
import { nanoid } from 'nanoid';
import { PrismaService } from '@/prisma/prisma.service';
import { assertShopModule } from '@/shared/shop-module.helper';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { NotificationsService, NotificationsModule } from '@/modules/notifications/notifications.module';

// ── DTOs ─────────────────────────────────────────────────────

export class CreateServiceCatalogDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) defaultPrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) durationMinutes?: number;
}

export class JobCardLineDto {
  @ApiProperty({ enum: ServiceLineType }) @IsEnum(ServiceLineType) lineType: ServiceLineType;
  @ApiPropertyOptional() @IsOptional() @IsString() variantId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() serviceCatalogId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsInt() @Min(1) quantity: number;
  @ApiProperty() @IsNumber() @Min(0) unitPrice: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() discount?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() taxRate?: number;
}

export class CreateJobCardDto {
  @ApiProperty() @IsString() customerId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() customerVehicleId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() appointmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() technicianId?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() odometer?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() complaintNotes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() beforeNotes?: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => JobCardLineDto)
  lines?: JobCardLineDto[];
}

export class UpdateJobCardDto {
  @ApiPropertyOptional({ enum: JobCardStatus }) @IsOptional() @IsEnum(JobCardStatus) status?: JobCardStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() technicianId?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() odometer?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() complaintNotes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() beforeNotes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() afterNotes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() technicianNotes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() customerSignature?: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => JobCardLineDto)
  lines?: JobCardLineDto[];
}

export class CreateAppointmentDto {
  @ApiProperty() @IsString() customerId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() customerVehicleId?: string;
  @ApiProperty() @IsString() scheduledAt: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(15) durationMinutes?: number;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) serviceTypes?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class UpdateAppointmentDto {
  @ApiPropertyOptional({ enum: AppointmentStatus }) @IsOptional() @IsEnum(AppointmentStatus) status?: AppointmentStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() scheduledAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() durationMinutes?: number;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) serviceTypes?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CreateTyreSerialDto {
  @ApiProperty() @IsString() variantId: string;
  @ApiProperty() @IsString() serialNumber: string;
  @ApiPropertyOptional() @IsOptional() @IsString() dotCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() branchId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CreateServiceReminderDto {
  @ApiProperty() @IsString() customerId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() customerVehicleId?: string;
  @ApiProperty() @IsString() scheduledFor: string;
  @ApiProperty() @IsString() message: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reminderType?: string;
  @ApiPropertyOptional({ enum: ServiceReminderChannel }) @IsOptional() @IsEnum(ServiceReminderChannel) channel?: ServiceReminderChannel;
}

function calcLineTotal(qty: number, unitPrice: number, discount = 0, taxRate = 0) {
  const base = qty * unitPrice - discount;
  return base + (base * taxRate) / 100;
}

function recalcJobTotals(lines: { quantity: number; unitPrice: number; discount: number; taxRate: number }[]) {
  let subtotal = 0;
  let taxAmount = 0;
  for (const l of lines) {
    const lineBase = l.quantity * l.unitPrice - (l.discount ?? 0);
    subtotal += lineBase;
    taxAmount += (lineBase * (l.taxRate ?? 0)) / 100;
  }
  return { subtotal, taxAmount, total: subtotal + taxAmount };
}

@Injectable()
export class WorkshopService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private jobInclude = {
    customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
    customerVehicle: { include: { vehicleModel: { include: { brand: true } } } },
    lines: { include: { variant: { include: { product: { include: { brand: true } } } }, serviceCatalog: true } },
    appointment: true,
  };

  private appointmentInclude = {
    customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
    customerVehicle: { include: { vehicleModel: { include: { brand: true } } } },
    jobCard: { select: { id: true, jobNumber: true, status: true } },
  };

  // ── Service catalog ─────────────────────────────────────────

  async listServices(tenantId: string) {
    await assertShopModule(this.prisma, tenantId, 'workshop');
    return this.prisma.workshopServiceCatalog.findMany({
      where: { tenantId },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  async createService(tenantId: string, dto: CreateServiceCatalogDto) {
    await assertShopModule(this.prisma, tenantId, 'workshop');
    return this.prisma.workshopServiceCatalog.create({
      data: {
        tenantId,
        code: dto.code.toUpperCase(),
        name: dto.name,
        description: dto.description,
        category: dto.category ?? 'GENERAL',
        defaultPrice: dto.defaultPrice ?? 0,
        durationMinutes: dto.durationMinutes ?? 30,
      },
    });
  }

  async seedDefaultServices(tenantId: string) {
    await assertShopModule(this.prisma, tenantId, 'workshop');
    const defaults = [
      { code: 'FIT', name: 'Tyre Fitting', category: 'FITTING', defaultPrice: 1500, durationMinutes: 30 },
      { code: 'BAL', name: 'Wheel Balancing', category: 'BALANCING', defaultPrice: 2000, durationMinutes: 45 },
      { code: 'ALN', name: 'Wheel Alignment', category: 'ALIGNMENT', defaultPrice: 3500, durationMinutes: 60 },
      { code: 'ROT', name: 'Tyre Rotation', category: 'MAINTENANCE', defaultPrice: 2500, durationMinutes: 45 },
      { code: 'NIT', name: 'Nitrogen Filling', category: 'MAINTENANCE', defaultPrice: 1000, durationMinutes: 20 },
      { code: 'PUN', name: 'Puncture Repair', category: 'REPAIR', defaultPrice: 800, durationMinutes: 30 },
    ];
    for (const s of defaults) {
      await this.prisma.workshopServiceCatalog.upsert({
        where: { tenantId_code: { tenantId, code: s.code } },
        update: { name: s.name, defaultPrice: s.defaultPrice, durationMinutes: s.durationMinutes, category: s.category },
        create: { tenantId, ...s },
      });
    }
    return this.listServices(tenantId);
  }

  // ── Job cards ───────────────────────────────────────────────

  async listJobCards(tenantId: string, status?: JobCardStatus, branchId?: string) {
    await assertShopModule(this.prisma, tenantId, 'workshop');
    return this.prisma.jobCard.findMany({
      where: { tenantId, ...(status && { status }), ...(branchId && { branchId }) },
      include: this.jobInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getJobCard(tenantId: string, id: string) {
    await assertShopModule(this.prisma, tenantId, 'workshop');
    const row = await this.prisma.jobCard.findFirst({ where: { id, tenantId }, include: this.jobInclude });
    if (!row) throw new NotFoundException('Job card not found');
    return row;
  }

  async createJobCard(tenantId: string, branchId: string, userId: string, dto: CreateJobCardDto) {
    await assertShopModule(this.prisma, tenantId, 'workshop');
    const jobNumber = `JC-${nanoid(8).toUpperCase()}`;
    const lines = dto.lines ?? [];
    const lineData = lines.map((l) => {
      const discount = l.discount ?? 0;
      const taxRate = l.taxRate ?? 0;
      const total = calcLineTotal(l.quantity, l.unitPrice, discount, taxRate);
      return { ...l, discount, taxRate, total };
    });
    const totals = recalcJobTotals(lineData);

    return this.prisma.jobCard.create({
      data: {
        tenantId,
        branchId: branchId || undefined,
        customerId: dto.customerId,
        customerVehicleId: dto.customerVehicleId,
        appointmentId: dto.appointmentId,
        jobNumber,
        technicianId: dto.technicianId,
        odometer: dto.odometer,
        complaintNotes: dto.complaintNotes,
        beforeNotes: dto.beforeNotes,
        createdBy: userId,
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        total: totals.total,
        lines: lineData.length ? {
          create: lineData.map((l) => ({
            lineType: l.lineType,
            variantId: l.variantId,
            serviceCatalogId: l.serviceCatalogId,
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            discount: l.discount,
            taxRate: l.taxRate,
            total: l.total,
          })),
        } : undefined,
      },
      include: this.jobInclude,
    });
  }

  async updateJobCard(tenantId: string, id: string, dto: UpdateJobCardDto) {
    await assertShopModule(this.prisma, tenantId, 'workshop');
    const existing = await this.getJobCard(tenantId, id);

    if (dto.lines) {
      await this.prisma.jobCardLine.deleteMany({ where: { jobCardId: id } });
      const lineData = dto.lines.map((l) => {
        const discount = l.discount ?? 0;
        const taxRate = l.taxRate ?? 0;
        const total = calcLineTotal(l.quantity, l.unitPrice, discount, taxRate);
        return { jobCardId: id, lineType: l.lineType, variantId: l.variantId, serviceCatalogId: l.serviceCatalogId, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, discount, taxRate, total };
      });
      await this.prisma.jobCardLine.createMany({ data: lineData });
      const totals = recalcJobTotals(lineData);
      return this.prisma.jobCard.update({
        where: { id },
        data: {
          status: dto.status,
          technicianId: dto.technicianId,
          odometer: dto.odometer,
          complaintNotes: dto.complaintNotes,
          beforeNotes: dto.beforeNotes,
          afterNotes: dto.afterNotes,
          technicianNotes: dto.technicianNotes,
          customerSignature: dto.customerSignature,
          subtotal: totals.subtotal,
          taxAmount: totals.taxAmount,
          total: totals.total,
          ...(dto.status === JobCardStatus.IN_PROGRESS && !existing.startedAt ? { startedAt: new Date() } : {}),
          ...(dto.status === JobCardStatus.COMPLETED || dto.status === JobCardStatus.INVOICED ? { completedAt: new Date() } : {}),
        },
        include: this.jobInclude,
      });
    }

    return this.prisma.jobCard.update({
      where: { id },
      data: {
        status: dto.status,
        technicianId: dto.technicianId,
        odometer: dto.odometer,
        complaintNotes: dto.complaintNotes,
        beforeNotes: dto.beforeNotes,
        afterNotes: dto.afterNotes,
        technicianNotes: dto.technicianNotes,
        customerSignature: dto.customerSignature,
        ...(dto.status === JobCardStatus.IN_PROGRESS && !existing.startedAt ? { startedAt: new Date() } : {}),
        ...(dto.status === JobCardStatus.COMPLETED || dto.status === JobCardStatus.INVOICED ? { completedAt: new Date() } : {}),
      },
      include: this.jobInclude,
    });
  }

  // ── Appointments ────────────────────────────────────────────

  async listAppointments(tenantId: string, from?: string, to?: string) {
    await assertShopModule(this.prisma, tenantId, 'appointments');
    const where: Record<string, unknown> = { tenantId };
    if (from || to) {
      where.scheduledAt = {
        ...(from && { gte: new Date(from) }),
        ...(to && { lte: new Date(to) }),
      };
    }
    return this.prisma.appointment.findMany({
      where,
      include: this.appointmentInclude,
      orderBy: { scheduledAt: 'asc' },
    });
  }

  async createAppointment(tenantId: string, branchId: string, userId: string, dto: CreateAppointmentDto) {
    await assertShopModule(this.prisma, tenantId, 'appointments');
    const appointmentNumber = `APT-${nanoid(8).toUpperCase()}`;
    return this.prisma.appointment.create({
      data: {
        tenantId,
        branchId: branchId || undefined,
        customerId: dto.customerId,
        customerVehicleId: dto.customerVehicleId,
        appointmentNumber,
        scheduledAt: new Date(dto.scheduledAt),
        durationMinutes: dto.durationMinutes ?? 60,
        serviceTypes: dto.serviceTypes ?? [],
        notes: dto.notes,
        createdBy: userId,
      },
      include: this.appointmentInclude,
    });
  }

  async updateAppointment(tenantId: string, id: string, dto: UpdateAppointmentDto) {
    await assertShopModule(this.prisma, tenantId, 'appointments');
    const appt = await this.prisma.appointment.findFirst({ where: { id, tenantId } });
    if (!appt) throw new NotFoundException('Appointment not found');

    const updated = await this.prisma.appointment.update({
      where: { id },
      data: {
        status: dto.status,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        durationMinutes: dto.durationMinutes,
        serviceTypes: dto.serviceTypes,
        notes: dto.notes,
      },
      include: this.appointmentInclude,
    });

    if (dto.status === AppointmentStatus.CHECKED_IN && !updated.jobCard) {
      const job = await this.createJobCard(tenantId, appt.branchId ?? '', appt.createdBy ?? '', {
        customerId: appt.customerId,
        customerVehicleId: appt.customerVehicleId ?? undefined,
        appointmentId: appt.id,
        complaintNotes: appt.notes ?? undefined,
        lines: [],
      });
      return { ...updated, jobCard: { id: job.id, jobNumber: job.jobNumber, status: job.status } };
    }

    return updated;
  }

  // ── Tyre serials ────────────────────────────────────────────

  async listTyreSerials(tenantId: string, variantId?: string, status?: TyreSerialStatus) {
    await assertShopModule(this.prisma, tenantId, 'workshop');
    return this.prisma.tyreSerial.findMany({
      where: { tenantId, ...(variantId && { variantId }), ...(status && { status }) },
      include: { variant: { include: { product: { include: { brand: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTyreSerial(tenantId: string, dto: CreateTyreSerialDto) {
    await assertShopModule(this.prisma, tenantId, 'workshop');
    return this.prisma.tyreSerial.create({
      data: {
        tenantId,
        variantId: dto.variantId,
        serialNumber: dto.serialNumber,
        dotCode: dto.dotCode,
        branchId: dto.branchId,
        notes: dto.notes,
      },
      include: { variant: { include: { product: true } } },
    });
  }

  // ── Service reminders ───────────────────────────────────────

  async listReminders(tenantId: string, status?: ServiceReminderStatus) {
    await assertShopModule(this.prisma, tenantId, 'workshop');
    return this.prisma.serviceReminder.findMany({
      where: { tenantId, ...(status && { status }) },
      include: { customer: { select: { id: true, firstName: true, lastName: true, phone: true } } },
      orderBy: { scheduledFor: 'asc' },
    });
  }

  async createReminder(tenantId: string, dto: CreateServiceReminderDto) {
    await assertShopModule(this.prisma, tenantId, 'workshop');
    return this.prisma.serviceReminder.create({
      data: {
        tenantId,
        customerId: dto.customerId,
        customerVehicleId: dto.customerVehicleId,
        scheduledFor: new Date(dto.scheduledFor),
        message: dto.message,
        reminderType: dto.reminderType ?? 'SERVICE_DUE',
        channel: dto.channel ?? ServiceReminderChannel.SMS,
      },
      include: { customer: { select: { id: true, firstName: true, lastName: true, phone: true } } },
    });
  }

  async sendReminder(tenantId: string, userId: string, id: string) {
    await assertShopModule(this.prisma, tenantId, 'workshop');
    const reminder = await this.prisma.serviceReminder.findFirst({
      where: { id, tenantId },
      include: { customer: true },
    });
    if (!reminder) throw new NotFoundException('Reminder not found');
    if (reminder.status === ServiceReminderStatus.SENT) {
      throw new BadRequestException('Reminder already sent');
    }

    try {
      if (reminder.channel === ServiceReminderChannel.SMS || reminder.channel === ServiceReminderChannel.WHATSAPP) {
        await this.notifications.queueSms(tenantId, userId, {
          phone: reminder.customer.phone,
          message: reminder.message,
          type: reminder.reminderType,
        });
      }
      return this.prisma.serviceReminder.update({
        where: { id },
        data: { status: ServiceReminderStatus.SENT, sentAt: new Date() },
      });
    } catch {
      return this.prisma.serviceReminder.update({
        where: { id },
        data: { status: ServiceReminderStatus.FAILED },
      });
    }
  }

  // ── Fleet customers ─────────────────────────────────────────

  async listFleetCustomers(tenantId: string) {
    await assertShopModule(this.prisma, tenantId, 'workshop');
    return this.prisma.customer.findMany({
      where: { tenantId, isFleet: true, isActive: true },
      orderBy: { totalSpent: 'desc' },
    });
  }

  async setFleetFlag(tenantId: string, customerId: string, isFleet: boolean) {
    await assertShopModule(this.prisma, tenantId, 'workshop');
    return this.prisma.customer.update({
      where: { id: customerId },
      data: { isFleet },
    });
  }
}

@ApiTags('Workshop')
@ApiBearerAuth('access-token')
@Controller({ path: 'workshop', version: '1' })
export class WorkshopController {
  constructor(private readonly service: WorkshopService) {}

  @Get('services')
  @RequirePermissions('products:read')
  listServices(@CurrentUser() user: IAuthUser) {
    return this.service.listServices(user.tenantId);
  }

  @Post('services')
  @RequirePermissions('products:create')
  createService(@CurrentUser() user: IAuthUser, @Body() dto: CreateServiceCatalogDto) {
    return this.service.createService(user.tenantId, dto);
  }

  @Post('services/seed-defaults')
  @RequirePermissions('products:create')
  seedServices(@CurrentUser() user: IAuthUser) {
    return this.service.seedDefaultServices(user.tenantId);
  }

  @Get('job-cards')
  @RequirePermissions('sales:read')
  listJobCards(@CurrentUser() user: IAuthUser, @Query('status') status?: JobCardStatus) {
    return this.service.listJobCards(user.tenantId, status, user.branchId);
  }

  @Get('job-cards/:id')
  @RequirePermissions('sales:read')
  getJobCard(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.service.getJobCard(user.tenantId, id);
  }

  @Post('job-cards')
  @RequirePermissions('sales:create')
  createJobCard(@CurrentUser() user: IAuthUser, @Body() dto: CreateJobCardDto) {
    return this.service.createJobCard(user.tenantId, user.branchId ?? '', user.id, dto);
  }

  @Put('job-cards/:id')
  @RequirePermissions('sales:update')
  updateJobCard(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: UpdateJobCardDto) {
    return this.service.updateJobCard(user.tenantId, id, dto);
  }

  @Get('appointments')
  @RequirePermissions('customers:read')
  listAppointments(@CurrentUser() user: IAuthUser, @Query('from') from?: string, @Query('to') to?: string) {
    return this.service.listAppointments(user.tenantId, from, to);
  }

  @Post('appointments')
  @RequirePermissions('customers:create')
  createAppointment(@CurrentUser() user: IAuthUser, @Body() dto: CreateAppointmentDto) {
    return this.service.createAppointment(user.tenantId, user.branchId ?? '', user.id, dto);
  }

  @Put('appointments/:id')
  @RequirePermissions('customers:update')
  updateAppointment(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: UpdateAppointmentDto) {
    return this.service.updateAppointment(user.tenantId, id, dto);
  }

  @Get('tyre-serials')
  @RequirePermissions('products:read')
  listSerials(@CurrentUser() user: IAuthUser, @Query('variantId') variantId?: string, @Query('status') status?: TyreSerialStatus) {
    return this.service.listTyreSerials(user.tenantId, variantId, status);
  }

  @Post('tyre-serials')
  @RequirePermissions('products:create')
  createSerial(@CurrentUser() user: IAuthUser, @Body() dto: CreateTyreSerialDto) {
    return this.service.createTyreSerial(user.tenantId, dto);
  }

  @Get('reminders')
  @RequirePermissions('customers:read')
  listReminders(@CurrentUser() user: IAuthUser, @Query('status') status?: ServiceReminderStatus) {
    return this.service.listReminders(user.tenantId, status);
  }

  @Post('reminders')
  @RequirePermissions('customers:create')
  createReminder(@CurrentUser() user: IAuthUser, @Body() dto: CreateServiceReminderDto) {
    return this.service.createReminder(user.tenantId, dto);
  }

  @Post('reminders/:id/send')
  @RequirePermissions('customers:update')
  sendReminder(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.service.sendReminder(user.tenantId, user.id, id);
  }

  @Get('fleet-customers')
  @RequirePermissions('customers:read')
  listFleet(@CurrentUser() user: IAuthUser) {
    return this.service.listFleetCustomers(user.tenantId);
  }

  @Put('fleet-customers/:id')
  @RequirePermissions('customers:update')
  setFleet(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() body: { isFleet: boolean }) {
    return this.service.setFleetFlag(user.tenantId, id, body.isFleet);
  }
}

@Module({
  imports: [NotificationsModule],
  controllers: [WorkshopController],
  providers: [WorkshopService],
  exports: [WorkshopService],
})
export class WorkshopModule {}
