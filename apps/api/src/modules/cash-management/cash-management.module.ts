import { Module } from '@nestjs/common';
import {
  Controller, Get, Post, Put, Body, Param, Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { IsString, IsOptional, IsNumber, IsEnum, IsObject, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CashMovementType, CashRegisterStatus, PaymentMethod, RoleType } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions, RequireAnyPermissions } from '@/common/decorators/permissions.decorator';
import {
  CASH_VARIANCE_APPROVAL_THRESHOLD,
  computeExpectedCashFromMovements,
  denominationTotal,
  findOpenRegister,
  recordCashMovement,
  summarizeMovements,
} from '@/shared/cash-register.helper';
import { WorkflowService } from '@/modules/workflow/workflow.module';
import { WorkflowModule } from '@/modules/workflow/workflow.module';
import { bypassesWorkflowApproval } from '@/shared/workflow-bypass.helper';
import * as dayjs from 'dayjs';

export class OpenCashRegisterDto {
  @ApiProperty() @IsNumber() @Min(0) openingCash: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CashMovementDto {
  @ApiProperty({ enum: CashMovementType }) @IsEnum(CashMovementType) type: CashMovementType;
  @ApiProperty() @IsNumber() @Min(0.01) amount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reference?: string;
}

export class CloseCashRegisterDto {
  @ApiProperty() @IsNumber() @Min(0) actualCash: number;
  @ApiPropertyOptional() @IsOptional() @IsObject() denominations?: Record<string, number>;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

@Injectable()
export class CashManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly workflowService: WorkflowService,
  ) {}

  private async resolveBranchId(tenantId: string, branchId?: string): Promise<string> {
    if (branchId) return branchId;
    const branch = await this.prisma.branch.findFirst({ where: { tenantId }, select: { id: true } });
    if (!branch) throw new NotFoundException('No branch found');
    return branch.id;
  }

  async getActiveRegister(tenantId: string, branchId: string | undefined, cashierId: string) {
    const resolvedBranchId = await this.resolveBranchId(tenantId, branchId);
    const register = await findOpenRegister(this.prisma, tenantId, resolvedBranchId, cashierId);
    if (!register) return null;
    return this.buildRegisterView(register);
  }

  async openRegister(
    tenantId: string,
    branchId: string | undefined,
    cashierId: string,
    dto: OpenCashRegisterDto,
  ) {
    const resolvedBranchId = await this.resolveBranchId(tenantId, branchId);
    const existing = await findOpenRegister(this.prisma, tenantId, resolvedBranchId, cashierId);
    if (existing?.status === CashRegisterStatus.OPEN) {
      throw new BadRequestException('You already have an open cash shift. Close it before starting a new one.');
    }
    if (existing?.status === CashRegisterStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Previous shift is pending manager approval. Contact your manager.');
    }

    const register = await this.prisma.$transaction(async (tx) => {
      const created = await tx.cashRegister.create({
        data: {
          tenantId,
          branchId: resolvedBranchId,
          cashierId,
          openingCash: dto.openingCash,
          notes: dto.notes,
          status: CashRegisterStatus.OPEN,
        },
      });
      await recordCashMovement(tx, {
        tenantId,
        registerId: created.id,
        type: CashMovementType.OPENING,
        amount: dto.openingCash,
        description: 'Opening float',
        createdById: cashierId,
      });
      return created;
    });

    this.eventEmitter.emit('cash.shift.opened', {
      tenantId,
      branchId: resolvedBranchId,
      registerId: register.id,
      cashierId,
      openingCash: dto.openingCash,
    });

    return this.getRegisterById(register.id, tenantId);
  }

  async getCloseSummary(registerId: string, tenantId: string) {
    const register = await this.getRegisterEntity(registerId, tenantId);
    if (register.status === CashRegisterStatus.CLOSED) {
      throw new BadRequestException('This shift is already closed');
    }
    return this.buildCloseSummary(register);
  }

  async closeRegister(
    registerId: string,
    tenantId: string,
    userId: string,
    dto: CloseCashRegisterDto,
  ) {
    const register = await this.getRegisterEntity(registerId, tenantId);
    if (register.cashierId !== userId) {
      throw new ForbiddenException('Only the cashier who opened this shift can close it');
    }
    if (register.status === CashRegisterStatus.CLOSED) {
      throw new BadRequestException('Shift already closed');
    }

    const summary = this.buildCloseSummary(register);
    const denomTotal = dto.denominations ? denominationTotal(dto.denominations) : 0;
    const actualCash = denomTotal > 0 ? denomTotal : dto.actualCash;
    const variance = Math.round((actualCash - summary.expectedCash) * 100) / 100;
    const needsApproval = Math.abs(variance) > CASH_VARIANCE_APPROVAL_THRESHOLD;

    const updated = await this.prisma.cashRegister.update({
      where: { id: registerId },
      data: {
        closingCash: actualCash,
        closingTime: new Date(),
        expectedCash: summary.expectedCash,
        actualCash,
        variance,
        denominationCount: (dto.denominations ?? {}) as object,
        notes: dto.notes ?? register.notes,
        status: needsApproval ? CashRegisterStatus.PENDING_APPROVAL : CashRegisterStatus.CLOSED,
      },
      include: {
        movements: true,
        cashier: { select: { id: true, firstName: true, lastName: true } },
        branch: { select: { id: true, name: true } },
      },
    });

    if (needsApproval) {
      await this.workflowService.ensureDefinition(tenantId, 'cash_variance');
      await this.workflowService.start(tenantId, userId, {
        key: 'cash_variance',
        entityType: 'CashRegister',
        entityId: registerId,
        metadata: {
          variance,
          expectedCash: summary.expectedCash,
          actualCash,
          cashierName: `${updated.cashier.firstName} ${updated.cashier.lastName}`.trim(),
        },
      });
    }

    this.eventEmitter.emit('cash.shift.closed', {
      tenantId,
      registerId,
      variance,
      needsApproval,
      expectedCash: summary.expectedCash,
      actualCash,
    });

    return {
      ...this.buildRegisterView(updated),
      summary,
      needsApproval,
      approvalThreshold: CASH_VARIANCE_APPROVAL_THRESHOLD,
    };
  }

  async approveRegister(
    registerId: string,
    tenantId: string,
    approverId: string,
    userRoles: string[] = [],
  ) {
    const register = await this.getRegisterEntity(registerId, tenantId);
    if (register.status !== CashRegisterStatus.PENDING_APPROVAL) {
      throw new BadRequestException('This shift is not pending approval');
    }

    const canForceClose =
      bypassesWorkflowApproval(userRoles)
      || userRoles.includes(RoleType.BRANCH_MANAGER)
      || userRoles.includes(RoleType.ACCOUNTANT)
      || userRoles.includes(RoleType.INVENTORY_MANAGER);

    const instance = await this.prisma.workflowInstance.findUnique({
      where: {
        tenantId_entityType_entityId: {
          tenantId,
          entityType: 'CashRegister',
          entityId: registerId,
        },
      },
      include: { tasks: { where: { status: 'PENDING' }, orderBy: { stepOrder: 'asc' }, take: 1 } },
    });

    if (instance?.tasks[0]) {
      try {
        await this.workflowService.approveTask(
          instance.tasks[0].id,
          tenantId,
          approverId,
          userRoles,
          'Cash variance approved',
        );
      } catch (err) {
        // Cashiers who are also managers often closed their own shift — allow override
        if (!canForceClose) throw err;
      }
    } else if (!canForceClose) {
      throw new ForbiddenException(
        'No pending approval workflow found. A branch manager or admin must approve this shift.',
      );
    }

    // Always persist CLOSED (workflow may have already done this — idempotent)
    return this.prisma.cashRegister.update({
      where: { id: registerId },
      data: {
        status: CashRegisterStatus.CLOSED,
        approvedById: approverId,
        approvedAt: new Date(),
      },
      include: {
        cashier: { select: { id: true, firstName: true, lastName: true } },
        approvedBy: { select: { id: true, firstName: true, lastName: true } },
        movements: true,
      },
    });
  }

  async addMovement(
    registerId: string,
    tenantId: string,
    userId: string,
    dto: CashMovementDto,
  ) {
    const register = await this.getRegisterEntity(registerId, tenantId);
    if (register.status !== CashRegisterStatus.OPEN) {
      throw new BadRequestException('Cannot add movements to a closed shift');
    }
    if (register.cashierId !== userId) {
      throw new ForbiddenException('Only the cashier who opened this shift can add cash movements');
    }
    const allowed: CashMovementType[] = [
      CashMovementType.DEPOSIT,
      CashMovementType.WITHDRAWAL,
      CashMovementType.EXPENSE,
      CashMovementType.PAYMENT,
    ];
    if (!allowed.includes(dto.type)) {
      throw new BadRequestException(`Movement type ${dto.type} not allowed manually`);
    }

    await recordCashMovement(this.prisma, {
      tenantId,
      registerId,
      type: dto.type,
      amount: dto.amount,
      description: dto.description,
      reference: dto.reference,
      createdById: userId,
    });

    return this.getRegisterById(registerId, tenantId);
  }

  async getHistory(
    tenantId: string,
    branchId: string | undefined,
    query: { page?: number; limit?: number; from?: string; to?: string; status?: string },
  ) {
    const resolvedBranchId = branchId ? await this.resolveBranchId(tenantId, branchId) : undefined;
    const page = parseInt(String(query.page ?? 1), 10);
    const limit = parseInt(String(query.limit ?? 20), 10);
    const skip = (page - 1) * limit;

    const where = {
      tenantId,
      ...(resolvedBranchId && { branchId: resolvedBranchId }),
      ...(query.status && { status: query.status as CashRegisterStatus }),
      ...(query.from || query.to
        ? {
            openingTime: {
              ...(query.from && { gte: dayjs(query.from).startOf('day').toDate() }),
              ...(query.to && { lte: dayjs(query.to).endOf('day').toDate() }),
            },
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.cashRegister.findMany({
        where,
        skip,
        take: limit,
        orderBy: { openingTime: 'desc' },
        include: {
          cashier: { select: { id: true, firstName: true, lastName: true } },
          branch: { select: { id: true, name: true, code: true } },
          approvedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.cashRegister.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getVarianceReport(
    tenantId: string,
    branchId: string | undefined,
    opts: { days?: number; from?: string; to?: string } = {},
  ) {
    const resolvedBranchId = branchId ? await this.resolveBranchId(tenantId, branchId) : undefined;
    const since = opts.from
      ? dayjs(opts.from).startOf('day').toDate()
      : dayjs().subtract(opts.days ?? 30, 'day').startOf('day').toDate();
    const until = opts.to ? dayjs(opts.to).endOf('day').toDate() : undefined;

    const registers = await this.prisma.cashRegister.findMany({
      where: {
        tenantId,
        ...(resolvedBranchId && { branchId: resolvedBranchId }),
        closingTime: {
          gte: since,
          ...(until && { lte: until }),
        },
        variance: { not: null },
      },
      orderBy: { closingTime: 'desc' },
      include: {
        cashier: { select: { id: true, firstName: true, lastName: true } },
        branch: { select: { id: true, name: true } },
      },
    });

    const totalVariance = registers.reduce((s, r) => s + (r.variance ?? 0), 0);
    const overCount = registers.filter((r) => (r.variance ?? 0) > 0).length;
    const shortCount = registers.filter((r) => (r.variance ?? 0) < 0).length;
    const pendingApproval = registers.filter((r) => r.status === CashRegisterStatus.PENDING_APPROVAL).length;

    return {
      days: opts.days ?? 30,
      from: opts.from ?? dayjs(since).format('YYYY-MM-DD'),
      to: opts.to ?? dayjs().format('YYYY-MM-DD'),
      totalShifts: registers.length,
      totalVariance: Math.round(totalVariance * 100) / 100,
      overCount,
      shortCount,
      pendingApproval,
      registers,
    };
  }

  async getOpeningSuggestion(tenantId: string, branchId: string | undefined, cashierId: string) {
    const resolvedBranchId = await this.resolveBranchId(tenantId, branchId);
    const lastClosed = await this.prisma.cashRegister.findFirst({
      where: {
        tenantId,
        branchId: resolvedBranchId,
        cashierId,
        status: CashRegisterStatus.CLOSED,
      },
      orderBy: { closingTime: 'desc' },
      select: {
        actualCash: true,
        closingCash: true,
        openingCash: true,
        closingTime: true,
        variance: true,
      },
    });

    const raw = lastClosed?.actualCash ?? lastClosed?.closingCash ?? null;
    return {
      suggestedOpening: raw != null ? Math.round(raw * 100) / 100 : null,
      lastClosedAt: lastClosed?.closingTime ?? null,
      lastVariance: lastClosed?.variance ?? null,
      lastOpening: lastClosed?.openingCash ?? null,
    };
  }

  async getPeriodSummary(
    tenantId: string,
    branchId: string | undefined,
    from?: string,
    to?: string,
  ) {
    const resolvedBranchId = await this.resolveBranchId(tenantId, branchId);
    const rangeStart = dayjs(from || undefined).startOf('day');
    const rangeEnd = dayjs(to || from || undefined).endOf('day');
    const rangeStartDate = rangeStart.toDate();
    const rangeEndDate = rangeEnd.toDate();
    const includesToday = !dayjs().startOf('day').isBefore(rangeStart, 'day')
      && !dayjs().startOf('day').isAfter(rangeEnd, 'day');

    const registers = await this.prisma.cashRegister.findMany({
      where: {
        tenantId,
        branchId: resolvedBranchId,
        OR: [
          { openingTime: { gte: rangeStartDate, lte: rangeEndDate } },
          { closingTime: { gte: rangeStartDate, lte: rangeEndDate } },
          ...(includesToday
            ? [{ status: { in: [CashRegisterStatus.OPEN, CashRegisterStatus.PENDING_APPROVAL] } }]
            : []),
        ],
      },
      include: { movements: true },
    });

    const seen = new Set<string>();
    let openShifts = 0;
    let closedCount = 0;
    let expectedTotal = 0;
    let actualTotal = 0;
    let pendingApproval = 0;

    for (const reg of registers) {
      if (seen.has(reg.id)) continue;
      seen.add(reg.id);

      const openedInRange = reg.openingTime >= rangeStartDate && reg.openingTime <= rangeEndDate;
      const closedInRange =
        reg.closingTime != null
        && reg.closingTime >= rangeStartDate
        && reg.closingTime <= rangeEndDate;

      if (
        includesToday
        && (reg.status === CashRegisterStatus.OPEN || reg.status === CashRegisterStatus.PENDING_APPROVAL)
      ) {
        openShifts += 1;
        if (reg.status === CashRegisterStatus.PENDING_APPROVAL) pendingApproval += 1;
        expectedTotal += computeExpectedCashFromMovements(reg.openingCash, reg.movements);
      } else if (closedInRange) {
        closedCount += 1;
        expectedTotal += reg.expectedCash ?? 0;
        actualTotal += reg.actualCash ?? 0;
      } else if (openedInRange && reg.status === CashRegisterStatus.CLOSED) {
        closedCount += 1;
        expectedTotal += reg.expectedCash ?? 0;
        actualTotal += reg.actualCash ?? 0;
      }
    }

    const difference = actualTotal > 0 ? actualTotal - expectedTotal : 0;

    return {
      from: rangeStart.format('YYYY-MM-DD'),
      to: rangeEnd.format('YYYY-MM-DD'),
      isToday: includesToday && rangeStart.isSame(rangeEnd, 'day') && rangeStart.isSame(dayjs(), 'day'),
      openShifts,
      closedToday: closedCount,
      expected: Math.round(expectedTotal * 100) / 100,
      actual: Math.round(actualTotal * 100) / 100,
      difference: Math.round(difference * 100) / 100,
      pendingApproval,
    };
  }

  async getTodayWidget(tenantId: string, branchId: string | undefined) {
    const today = dayjs().format('YYYY-MM-DD');
    return this.getPeriodSummary(tenantId, branchId, today, today);
  }

  async getRegisterById(id: string, tenantId: string) {
    const register = await this.getRegisterEntity(id, tenantId);
    return this.buildRegisterView(register);
  }

  private async getRegisterEntity(id: string, tenantId: string) {
    const register = await this.prisma.cashRegister.findFirst({
      where: { id, tenantId },
      include: {
        movements: { orderBy: { createdAt: 'asc' } },
        cashier: { select: { id: true, firstName: true, lastName: true, email: true } },
        branch: { select: { id: true, name: true, code: true } },
        approvedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!register) throw new NotFoundException('Cash register session not found');
    return register;
  }

  private buildCloseSummary(register: {
    openingCash: number;
    movements: { type: CashMovementType; amount: number }[];
  }) {
    const breakdown = summarizeMovements(register.movements);
    const expectedCash = computeExpectedCashFromMovements(register.openingCash, register.movements);
    return {
      openingCash: register.openingCash,
      ...breakdown,
      expectedCash,
    };
  }

  private buildRegisterView(register: {
    id: string;
    tenantId: string;
    branchId: string;
    cashierId: string;
    openingCash: number;
    openingTime: Date;
    closingCash: number | null;
    closingTime: Date | null;
    expectedCash: number | null;
    actualCash: number | null;
    variance: number | null;
    status: CashRegisterStatus;
    denominationCount: unknown;
    notes: string | null;
    approvedAt: Date | null;
    movements: { id: string; type: CashMovementType; amount: number; reference: string | null; description: string | null; createdAt: Date }[];
    cashier?: { id: string; firstName: string; lastName: string; email?: string };
    branch?: { id: string; name: string; code?: string };
    approvedBy?: { id: string; firstName: string; lastName: string } | null;
  }) {
    const summary = this.buildCloseSummary(register);
    return {
      ...register,
      summary,
      cashierName: register.cashier
        ? `${register.cashier.firstName} ${register.cashier.lastName}`.trim()
        : undefined,
    };
  }
}

@ApiTags('Cash Management')
@ApiBearerAuth('access-token')
@Controller({ path: 'cash', version: '1' })
export class CashManagementController {
  constructor(private readonly cashService: CashManagementService) {}

  @Get('active')
  @RequireAnyPermissions('cash:read', 'sales:read')
  @ApiOperation({ summary: 'Get current open cash shift for cashier' })
  getActive(@CurrentUser() user: IAuthUser) {
    return this.cashService.getActiveRegister(user.tenantId, user.branchId, user.id);
  }

  @Post('open')
  @RequireAnyPermissions('cash:create', 'sales:create')
  @ApiOperation({ summary: 'Open cash shift with opening float' })
  openShift(@CurrentUser() user: IAuthUser, @Body() dto: OpenCashRegisterDto) {
    return this.cashService.openRegister(user.tenantId, user.branchId, user.id, dto);
  }

  @Get('summary')
  @RequirePermissions('cash:read')
  @ApiOperation({ summary: 'Cash summary for a date range' })
  getSummary(
    @CurrentUser() user: IAuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.cashService.getPeriodSummary(user.tenantId, user.branchId, from, to);
  }

  @Get('today')
  @RequirePermissions('cash:read')
  @ApiOperation({ summary: 'Today cash widget data' })
  getToday(@CurrentUser() user: IAuthUser) {
    return this.cashService.getTodayWidget(user.tenantId, user.branchId);
  }

  @Get('opening-suggestion')
  @RequireAnyPermissions('cash:read', 'sales:read')
  @ApiOperation({ summary: 'Suggested opening float from last closed shift' })
  getOpeningSuggestion(@CurrentUser() user: IAuthUser) {
    return this.cashService.getOpeningSuggestion(user.tenantId, user.branchId, user.id);
  }

  @Get('history')
  @RequirePermissions('cash:read')
  @ApiOperation({ summary: 'Cash shift history' })
  getHistory(
    @CurrentUser() user: IAuthUser,
    @Query() query: { page?: number; limit?: number; from?: string; to?: string; status?: string },
  ) {
    return this.cashService.getHistory(user.tenantId, user.branchId, query);
  }

  @Get('variance-report')
  @RequirePermissions('cash:read')
  @ApiOperation({ summary: 'Cash variance report' })
  getVarianceReport(
    @CurrentUser() user: IAuthUser,
    @Query('days') days?: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.cashService.getVarianceReport(user.tenantId, user.branchId, {
      days: days ? Number(days) : undefined,
      from,
      to,
    });
  }

  @Get(':id')
  @RequirePermissions('cash:read')
  @ApiOperation({ summary: 'Get cash shift by ID' })
  getById(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.cashService.getRegisterById(id, user.tenantId);
  }

  @Get(':id/close-summary')
  @RequireAnyPermissions('cash:read', 'sales:read')
  @ApiOperation({ summary: 'Get expected cash breakdown before closing' })
  getCloseSummary(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.cashService.getCloseSummary(id, user.tenantId);
  }

  @Post(':id/close')
  @RequireAnyPermissions('cash:update', 'sales:create')
  @ApiOperation({ summary: 'Close cash shift with physical count' })
  closeShift(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: CloseCashRegisterDto) {
    return this.cashService.closeRegister(id, user.tenantId, user.id, dto);
  }

  @Put(':id/approve')
  @RequirePermissions('cash:update')
  @ApiOperation({ summary: 'Manager approve cash variance' })
  approve(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.cashService.approveRegister(id, user.tenantId, user.id, user.roles ?? []);
  }

  @Post(':id/movements')
  @RequireAnyPermissions('cash:create', 'sales:create')
  @ApiOperation({ summary: 'Cash in / cash out / petty expense' })
  addMovement(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: CashMovementDto) {
    return this.cashService.addMovement(id, user.tenantId, user.id, dto);
  }
}

@Module({
  imports: [WorkflowModule],
  controllers: [CashManagementController],
  providers: [CashManagementService],
  exports: [CashManagementService],
})
export class CashManagementModule {}
