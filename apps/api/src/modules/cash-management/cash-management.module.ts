import { Module } from '@nestjs/common';
import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, Headers, StreamableFile, Header,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PinLockoutService } from '@/shared/security/pin-lockout.service';
import { Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException, HttpException } from '@nestjs/common';
import { IsString, IsOptional, IsNumber, IsEnum, IsObject, IsBoolean, Min, MaxLength } from 'class-validator';
import { countedCashError, openingFloatError, resolveMaxOpeningFloat } from '@/shared/opening-float.helper';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BankAccountType, BankTxnType, CashMovementType, CashRegisterStatus, PaymentMethod, Prisma, RoleType, SaleStatus } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { NoCardNumber } from '@/shared/security/card-number.validator';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions, RequireAnyPermissions } from '@/common/decorators/permissions.decorator';
import {
  CASH_VARIANCE_APPROVAL_THRESHOLD,
  cashOutApprovalThreshold,
  computeExpectedCashFromMovements,
  decideCashOut,
  denominationTotal,
  findOpenRegister,
  findAnyOpenRegisterOnBranch,
  recordCashMovement,
  summarizeMovements,
  walletFloatIssued,
} from '@/shared/cash-register.helper';
import { resolveActingCashierId, verifyPosPinHash, assertValidPosPin } from '@/modules/pos/pos-pin.helper';
import {
  CashActor, CashAuth, isCashManagerRole, managerApprovalRequired,
  resolveCashActor, signCashApprovalToken,
} from '@/shared/security/cash-actor';
import { HandoverPlan, planHandover, walletDrawerAmount } from '@/shared/cash-handover.helper';
import { buildDayEndTotals, buildDayEndSalesFigures, COLLECTED_SALE_STATUSES, DayEndShiftInput, shopDayBounds } from '@/shared/day-end-report.helper';
import { WorkflowService } from '@/modules/workflow/workflow.module';
import { WorkflowModule } from '@/modules/workflow/workflow.module';
import { bypassesWorkflowApproval } from '@/shared/workflow-bypass.helper';
import * as dayjs from 'dayjs';
import { PassThrough } from 'stream';
import * as fs from 'fs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit');

export class OpenCashRegisterDto {
  /** Ignored when the counter is handed over: the drawer balance is taken from the previous cashier. */
  @ApiProperty()
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 }, { message: 'openingCash must be a number with at most 2 decimal places' })
  @Min(0) // the upper limit (branch / shop maximum opening float) is checked by the service, with a clear message
  openingCash: number;
  @ApiPropertyOptional() @IsOptional() @IsString() counterId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional({ description: 'Required when a counted handover has a variance' })
  @IsOptional() @IsString() @MaxLength(200) @NoCardNumber()
  reason?: string;
  @ApiPropertyOptional({ description: 'Handover only: cash physically counted when taking over the counter' })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 }, { message: 'countedCash must be a number with at most 2 decimal places' })
  @Min(0) // an upper sanity bound is checked by the service against the recorded drawer balance (never below it)
  countedCash?: number;
}

export class CashMovementDto {
  @ApiProperty({ enum: CashMovementType }) @IsEnum(CashMovementType) type: CashMovementType;
  @ApiProperty() @IsNumber() @Min(0.01) amount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) @NoCardNumber() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) @NoCardNumber() reference?: string;
}

export enum CashTransferSource {
  SAFE = 'SAFE',
  REGISTER = 'REGISTER',
}

export class TransferFundsDto {
  @ApiProperty({ description: 'Destination open cash shift' })
  @IsString()
  toRegisterId: string;

  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({
    enum: CashTransferSource,
    description: 'SAFE = top-up from office float; REGISTER = move from another open till',
    default: CashTransferSource.SAFE,
  })
  @IsOptional()
  @IsEnum(CashTransferSource)
  from?: CashTransferSource;

  @ApiPropertyOptional({ description: 'Required when from=REGISTER (source open shift)' })
  @IsOptional()
  @IsString()
  fromRegisterId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class ManagerApprovalDto {
  @ApiProperty({ example: '1234' }) @IsString() @MaxLength(4) pin: string;
}

export class CloseCashRegisterDto {
  @ApiProperty() @IsNumber() @Min(0) actualCash: number;
  @ApiPropertyOptional() @IsOptional() @IsObject() denominations?: Record<string, number>;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class ClearWalletDto {
  @ApiPropertyOptional({ description: 'Physically counted cash; defaults to expected / closing amount' })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 }, { message: 'countedCash must be a number with at most 2 decimal places' })
  @Min(0) // an upper sanity bound is checked by the service against the recorded drawer balance (never below it)
  countedCash?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) notes?: string;
}

export class CreatePosCounterDto {
  @ApiProperty({ example: 'Counter 4' }) @IsString() @MaxLength(80) name: string;
  @ApiPropertyOptional({ example: 'C4' }) @IsOptional() @IsString() @MaxLength(20) code?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() sortOrder?: number;
}

export class UpdatePosCounterDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) code?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsNumber() sortOrder?: number;
}

@Injectable()
export class CashManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly workflowService: WorkflowService,
    private readonly pinLockout: PinLockoutService,
  ) {}

  private async resolveBranchId(tenantId: string, branchId?: string): Promise<string> {
    if (branchId) return branchId;
    const branch = await this.prisma.branch.findFirst({ where: { tenantId }, select: { id: true } });
    if (!branch) throw new NotFoundException('No branch found');
    return branch.id;
  }

  async getActiveRegister(
    tenantId: string,
    branchId: string | undefined,
    cashierId: string,
    counterId?: string | null,
  ) {
    const resolvedBranchId = await this.resolveBranchId(tenantId, branchId);
    const own = await findOpenRegister(this.prisma, tenantId, resolvedBranchId, cashierId, counterId || undefined);
    return own ? this.buildRegisterView(own) : null;
  }

  async listCounters(
    tenantId: string,
    branchId: string | undefined,
    opts?: { includeInactive?: boolean; seedDefaults?: boolean },
  ) {
    const resolvedBranchId = await this.resolveBranchId(tenantId, branchId);
    if (opts?.seedDefaults !== false) {
      await this.ensureDefaultCounters(tenantId, resolvedBranchId);
    }
    return this.prisma.posCounter.findMany({
      where: {
        tenantId,
        branchId: resolvedBranchId,
        ...(opts?.includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, code: true, sortOrder: true, isActive: true },
    });
  }

  private async ensureDefaultCounters(tenantId: string, branchId: string) {
    const count = await this.prisma.posCounter.count({ where: { tenantId, branchId } });
    if (count > 0) return;
    const defaults = [
      { name: 'Counter 1', code: 'C1', sortOrder: 1 },
      { name: 'Counter 2', code: 'C2', sortOrder: 2 },
      { name: 'Counter 3', code: 'C3', sortOrder: 3 },
    ];
    await this.prisma.posCounter.createMany({
      data: defaults.map((d) => ({ tenantId, branchId, ...d })),
      skipDuplicates: true,
    });
  }

  private normalizeCounterCode(raw: string) {
    return raw.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 20);
  }

  private async nextCounterCode(tenantId: string, branchId: string) {
    const existing = await this.prisma.posCounter.findMany({
      where: { tenantId, branchId },
      select: { code: true, sortOrder: true },
    });
    let n = existing.length + 1;
    const used = new Set(existing.map((c) => c.code.toUpperCase()));
    while (used.has(`C${n}`)) n += 1;
    return { code: `C${n}`, sortOrder: Math.max(0, ...existing.map((c) => c.sortOrder), 0) + 1 };
  }

  async createCounter(tenantId: string, branchId: string | undefined, dto: CreatePosCounterDto) {
    const resolvedBranchId = await this.resolveBranchId(tenantId, branchId);
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Counter name is required');

    const auto = await this.nextCounterCode(tenantId, resolvedBranchId);
    const code = this.normalizeCounterCode(dto.code || auto.code);
    if (!code) throw new BadRequestException('Counter code is required');

    const dup = await this.prisma.posCounter.findFirst({
      where: { tenantId, branchId: resolvedBranchId, code },
    });
    if (dup) throw new BadRequestException(`Counter code ${code} already exists`);

    return this.prisma.posCounter.create({
      data: {
        tenantId,
        branchId: resolvedBranchId,
        name,
        code,
        sortOrder: dto.sortOrder ?? auto.sortOrder,
        isActive: true,
      },
      select: { id: true, name: true, code: true, sortOrder: true, isActive: true },
    });
  }

  async updateCounter(
    tenantId: string,
    branchId: string | undefined,
    id: string,
    dto: UpdatePosCounterDto,
  ) {
    const resolvedBranchId = await this.resolveBranchId(tenantId, branchId);
    const existing = await this.prisma.posCounter.findFirst({
      where: { id, tenantId, branchId: resolvedBranchId },
    });
    if (!existing) throw new NotFoundException('Counter not found');

    const code = dto.code != null ? this.normalizeCounterCode(dto.code) : undefined;
    if (code !== undefined && !code) throw new BadRequestException('Counter code is required');
    if (code && code !== existing.code) {
      const dup = await this.prisma.posCounter.findFirst({
        where: { tenantId, branchId: resolvedBranchId, code, NOT: { id } },
      });
      if (dup) throw new BadRequestException(`Counter code ${code} already exists`);
    }

    if (dto.isActive === false) {
      const open = await findAnyOpenRegisterOnBranch(this.prisma, tenantId, resolvedBranchId, id);
      if (open) {
        throw new BadRequestException('Close the open shift on this counter before deactivating it');
      }
    }

    return this.prisma.posCounter.update({
      where: { id },
      data: {
        ...(dto.name != null ? { name: dto.name.trim() } : {}),
        ...(code != null ? { code } : {}),
        ...(dto.isActive != null ? { isActive: dto.isActive } : {}),
        ...(dto.sortOrder != null ? { sortOrder: dto.sortOrder } : {}),
      },
      select: { id: true, name: true, code: true, sortOrder: true, isActive: true },
    });
  }

  async deactivateCounter(tenantId: string, branchId: string | undefined, id: string) {
    return this.updateCounter(tenantId, branchId, id, { isActive: false });
  }

  /** Cash physically at each counter: every cashier wallet on it that is not yet cleared to main cash. */
  async getCounterCash(tenantId: string, branchId: string | undefined) {
    const resolvedBranchId = await this.resolveBranchId(tenantId, branchId);
    const registers = await this.prisma.cashRegister.findMany({
      where: { tenantId, branchId: resolvedBranchId, clearedAt: null, counterId: { not: null } },
      orderBy: { openingTime: 'asc' },
      include: {
        movements: { select: { type: true, amount: true } },
        cashier: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    const byCounter = new Map<string, {
      counterId: string;
      total: number;
      wallets: { registerId: string; cashierId: string; cashierName: string; status: CashRegisterStatus; amount: number }[];
    }>();
    for (const r of registers) {
      const counterId = r.counterId as string;
      const { amountToClear } = this.walletAmountToClear(r);
      const row = byCounter.get(counterId) ?? { counterId, total: 0, wallets: [] };
      row.wallets.push({
        registerId: r.id,
        cashierId: r.cashierId,
        cashierName: `${r.cashier.firstName} ${r.cashier.lastName}`.trim(),
        status: r.status,
        amount: amountToClear,
      });
      row.total = Math.round((row.total + amountToClear) * 100) / 100;
      byCounter.set(counterId, row);
    }
    return [...byCounter.values()];
  }

  async openRegister(
    tenantId: string,
    branchId: string | undefined,
    cashierId: string,
    dto: OpenCashRegisterDto,
    auth?: CashAuth,
  ) {
    const resolvedBranchId = await this.resolveBranchId(tenantId, branchId);
    const requestedCounterId = dto.counterId?.trim();
    const counter = requestedCounterId
      ? await this.prisma.posCounter.findFirst({
          where: { id: requestedCounterId, tenantId, branchId: resolvedBranchId, isActive: true },
        })
      : null;
    if (requestedCounterId && !counter) throw new BadRequestException('Invalid or inactive cashier counter');
    const counterId = counter?.id ?? null;

    const existing = await findOpenRegister(this.prisma, tenantId, resolvedBranchId, cashierId, counterId);
    if (existing?.status === CashRegisterStatus.OPEN) {
      throw new BadRequestException(
        counter
          ? `You already have an open cash wallet on ${counter.name}. Continue with it or ask an admin to clear it.`
          : 'You already have an open cash wallet. Continue with it or ask an admin to clear it.',
      );
    }
    if (existing?.status === CashRegisterStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Previous shift on this counter is pending manager approval. Contact your manager.');
    }

    // Any uncleared cash is still in this counter's drawer: take it over instead of starting a new float.
    if (counter && (await this.hasCashToHandOver(tenantId, resolvedBranchId, counter.id, cashierId))) {
      const actor = auth
        ? await resolveCashActor(this.prisma, { tenantId, ...auth })
        : { actorId: cashierId, actorRoles: [], actorIsManager: false, authorizerId: null };
      return this.handOverCounter(tenantId, resolvedBranchId, counter, cashierId, dto, actor);
    }

    // A NEW float (not a handover): reject unreasonable amounts before anything is written.
    const floatLimit = await this.openingFloatLimit(tenantId, resolvedBranchId);
    const floatError = openingFloatError(dto.openingCash, floatLimit);
    if (floatError) throw new BadRequestException(floatError);

    const register = await this.prisma.$transaction(async (tx) => {
      const created = await tx.cashRegister.create({
        data: {
          tenantId,
          branchId: resolvedBranchId,
          counterId,
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
        description: counter ? `Opening float · ${counter.name}` : 'Opening float',
        createdById: cashierId,
      });
      return created;
    });

    this.eventEmitter.emit('cash.shift.opened', {
      tenantId,
      branchId: resolvedBranchId,
      registerId: register.id,
      cashierId,
      counterId,
      openingCash: dto.openingCash,
    });

    return this.getRegisterById(register.id, tenantId);
  }

  /** Maximum opening float: branch setting, else shop setting (Settings → POS), else the default. */
  async openingFloatLimit(tenantId: string, branchId: string) {
    const [tenant, branch] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } }),
      this.prisma.branch.findFirst({ where: { id: branchId, tenantId }, select: { settings: true } }),
    ]);
    return resolveMaxOpeningFloat(tenant?.settings, branch?.settings);
  }

  private hasCashToHandOver(tenantId: string, branchId: string, counterId: string, cashierId: string) {
    return this.prisma.cashRegister
      .count({
        where: {
          tenantId,
          branchId,
          counterId,
          clearedAt: null,
          OR: [{ cashierId: { not: cashierId } }, { status: { not: CashRegisterStatus.OPEN } }],
        },
      })
      .then((n) => n > 0);
  }

  /** What the incoming cashier would take over on a counter (shown before starting the shift). */
  async getHandoverPreview(tenantId: string, branchId: string | undefined, cashierId: string, counterId: string) {
    const resolvedBranchId = await this.resolveBranchId(tenantId, branchId);
    const wallets = await this.prisma.cashRegister.findMany({
      where: {
        tenantId,
        branchId: resolvedBranchId,
        counterId,
        clearedAt: null,
        OR: [{ cashierId: { not: cashierId } }, { status: { not: CashRegisterStatus.OPEN } }],
      },
      orderBy: { openingTime: 'asc' },
      include: {
        movements: { select: { type: true, amount: true } },
        cashier: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!wallets.length) {
      return { required: false, expectedCash: 0, pendingApproval: false, approvalThreshold: CASH_VARIANCE_APPROVAL_THRESHOLD, wallets: [] };
    }
    const plan = planHandover(wallets);
    return {
      required: true,
      expectedCash: plan.expectedTotal,
      pendingApproval: wallets.some((w) => w.status === CashRegisterStatus.PENDING_APPROVAL),
      approvalThreshold: CASH_VARIANCE_APPROVAL_THRESHOLD,
      wallets: wallets.map((w) => ({
        registerId: w.id,
        cashierId: w.cashierId,
        cashierName: `${w.cashier.firstName} ${w.cashier.lastName}`.trim(),
        status: w.status,
        openingTime: w.openingTime,
        amount: plan.wallets.find((p) => p.id === w.id)?.expected ?? 0,
      })),
    };
  }

  /**
   * Counter handover. In ONE transaction, with the counter and the earlier wallets locked:
   * every earlier wallet on the counter is cleared into main cash at its drawer amount (the same
   * path as the day-end clear, so the GL stays balanced), and the incoming cashier's wallet opens
   * with exactly that amount (or what was counted). The counter's cash is never reset to zero.
   */
  private async handOverCounter(
    tenantId: string,
    branchId: string,
    counter: { id: string; name: string },
    cashierId: string,
    dto: OpenCashRegisterDto,
    actor: CashActor,
  ) {
    // The person really at the terminal; a difference above the threshold needs a manager acting or
    // an explicit manager approval token — a manager merely logged in on the terminal does not count.
    const performedById = actor.actorId;
    const mainCash = await this.resolveMainCashAccount(tenantId, branchId);
    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      // Serialise openings / handovers on this counter, then lock the wallets being handed over so a
      // concurrent cash movement or a second handover waits for this one.
      await tx.$queryRaw`SELECT "id" FROM "pos_counters" WHERE "id" = ${counter.id} AND "tenantId" = ${tenantId} FOR UPDATE`;
      const candidates = await tx.cashRegister.findMany({
        where: {
          tenantId,
          branchId,
          counterId: counter.id,
          clearedAt: null,
          OR: [{ cashierId: { not: cashierId } }, { status: { not: CashRegisterStatus.OPEN } }],
        },
        select: { id: true },
      });
      if (!candidates.length) throw new ConflictException('The counter was just taken over by someone else. Try again.');
      const ids = candidates.map((c) => c.id);
      await tx.$queryRaw`SELECT "id" FROM "cash_registers" WHERE "id" IN (${Prisma.join(ids)}) FOR UPDATE`;
      const wallets = await tx.cashRegister.findMany({
        where: { id: { in: ids }, tenantId, clearedAt: null },
        include: {
          movements: { orderBy: { createdAt: 'asc' } },
          cashier: { select: { id: true, firstName: true, lastName: true } },
        },
      });
      if (wallets.length !== ids.length) throw new ConflictException('The counter changed while handing over. Try again.');
      if (wallets.some((w) => w.status === CashRegisterStatus.PENDING_APPROVAL)) {
        throw new BadRequestException(
          `The previous shift on ${counter.name} is waiting for variance approval. A manager must approve it before the counter is handed over.`,
        );
      }

      let plan: HandoverPlan;
      try {
        plan = planHandover(wallets, dto.countedCash);
      } catch (e) {
        throw new BadRequestException((e as Error).message);
      }
      const countError = dto.countedCash != null ? countedCashError(plan.countedTotal, plan.expectedTotal) : null;
      if (countError) throw new BadRequestException(countError);
      const varianceReason = (dto.reason ?? dto.notes ?? '').trim();
      // The approved behavior remains handover-only: this compares the incoming count with the
      // drawer balance being handed over, not an earlier close variance. Cumulative treatment
      // requires an explicit business decision before it can replace this rule.
      if (plan.counted && Math.abs(plan.variance) > 0.004 && !varianceReason) {
        throw new BadRequestException('Enter a reason for the cash handover difference');
      }
      if (Math.abs(plan.variance) > CASH_VARIANCE_APPROVAL_THRESHOLD && !actor.authorizerId) {
        throw managerApprovalRequired(
          `Counted cash differs from the drawer balance by LKR ${plan.variance.toFixed(2)}. A manager must approve this handover with their PIN.`,
        );
      }
      const authorizedById = actor.authorizerId;

      const created = await tx.cashRegister.create({
        data: {
          tenantId,
          branchId,
          counterId: counter.id,
          cashierId,
          openingCash: plan.countedTotal,
          notes: dto.notes ?? dto.reason,
          status: CashRegisterStatus.OPEN,
        },
      });
      const fromNames = [...new Set(wallets.map((w) => `${w.cashier.firstName} ${w.cashier.lastName}`.trim()))];
      if (plan.countedTotal > 0) {
        await tx.cashMovement.create({
          data: {
            tenantId,
            registerId: created.id,
            type: CashMovementType.OPENING,
            amount: plan.countedTotal,
            reference: `HANDOVER-${created.id.slice(-8).toUpperCase()}`,
            description: `Handover from ${fromNames.join(', ')} · ${counter.name}`,
            createdById: performedById,
            authorizedById,
          },
        });
      }

      for (const w of wallets) {
        const row = plan.wallets.find((p) => p.id === w.id)!;
        const { expectedCash } = walletDrawerAmount(w);
        await this.clearWalletInTx(tx, {
          tenantId,
          register: w,
          counted: row.counted,
          expectedCash,
          actorId: performedById,
          mainCashId: mainCash.id,
          now,
          notes: `Handed over on ${counter.name}`,
          descriptionPrefix: 'Counter handover',
        });
        await tx.cashHandover.create({
          data: {
            tenantId,
            branchId,
            counterId: counter.id,
            fromRegisterId: w.id,
            toRegisterId: created.id,
            fromCashierId: w.cashierId,
            toCashierId: cashierId,
            expectedCash: row.expected,
            countedCash: row.counted,
            variance: row.variance,
            counted: plan.counted,
            performedById,
            authorizedById,
            notes: varianceReason || dto.notes || null,
          },
        });
      }
      return { register: created, wallets, plan, authorizedById };
    }, { timeout: 20_000 });

    for (const w of result.wallets) {
      this.eventEmitter.emit('cash.wallet.cleared', {
        tenantId,
        branchId,
        registerId: w.id,
        cashierId: w.cashierId,
        amount: result.plan.wallets.find((p) => p.id === w.id)?.counted ?? 0,
        mainCashAccountId: mainCash.id,
        clearedById: performedById,
        handover: true,
      });
    }
    this.eventEmitter.emit('cash.shift.opened', {
      tenantId,
      branchId,
      registerId: result.register.id,
      cashierId,
      counterId: counter.id,
      openingCash: result.plan.countedTotal,
      handover: true,
    });
    this.eventEmitter.emit('cash.counter.handover', {
      tenantId,
      branchId,
      counterId: counter.id,
      toRegisterId: result.register.id,
      fromRegisterIds: result.wallets.map((w) => w.id),
      expectedCash: result.plan.expectedTotal,
      countedCash: result.plan.countedTotal,
      variance: result.plan.variance,
      performedById,
      authorizedById: result.authorizedById,
    });

    const view = await this.getRegisterById(result.register.id, tenantId);
    return {
      ...view,
      handover: {
        fromRegisterIds: result.wallets.map((w) => w.id),
        expectedCash: result.plan.expectedTotal,
        countedCash: result.plan.countedTotal,
        variance: result.plan.variance,
        counted: result.plan.counted,
        authorizedById: result.authorizedById,
      },
    };
  }

  /**
   * Day-end report data for the thermal printer: one shift (registerId) or every shift of a branch
   * (optionally one counter) on a date. Tenant-scoped; branch from the user.
   */
  async getDayEndReport(
    tenantId: string,
    branchId: string | undefined,
    opts: { registerId?: string; date?: string; counterId?: string; requesterId?: string; ownOnlyCashierIds?: string[] },
  ) {
    const resolvedBranchId = await this.resolveBranchId(tenantId, branchId);
    const include = {
      movements: { select: { type: true, amount: true, reference: true, description: true } },
      cashier: { select: { id: true, firstName: true, lastName: true } },
      counter: { select: { id: true, name: true, code: true } },
    } as const;

    let registers;
    let periodFrom: Date;
    let periodTo: Date;
    if (opts.registerId) {
      const one = await this.prisma.cashRegister.findFirst({
        where: { id: opts.registerId, tenantId, branchId: resolvedBranchId },
        include,
      });
      if (!one) throw new NotFoundException('Cash register session not found');
      if (opts.ownOnlyCashierIds && !opts.ownOnlyCashierIds.includes(one.cashierId)) {
        throw new ForbiddenException('You can print the day-end report of your own shift only');
      }
      registers = [one];
      periodFrom = one.openingTime;
      periodTo = one.closingTime ?? new Date();
    } else {
      // The shop's calendar day (tenant timezone), not the server's UTC day.
      const tenantTz = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true } });
      try {
        ({ from: periodFrom, to: periodTo } = shopDayBounds(opts.date, tenantTz?.timezone));
      } catch {
        throw new BadRequestException('Invalid date (use YYYY-MM-DD)');
      }
      if (opts.counterId) {
        const c = await this.prisma.posCounter.findFirst({ where: { id: opts.counterId, tenantId, branchId: resolvedBranchId }, select: { id: true } });
        if (!c) throw new NotFoundException('Counter not found');
      }
      registers = await this.prisma.cashRegister.findMany({
        where: {
          tenantId,
          branchId: resolvedBranchId,
          ...(opts.counterId ? { counterId: opts.counterId } : {}),
          openingTime: { lte: periodTo },
          OR: [{ closingTime: null }, { closingTime: { gte: periodFrom } }],
        },
        orderBy: { openingTime: 'asc' },
        include,
      });
    }

    const ids = registers.map((r) => r.id);
    const saleSelect = {
      id: true, cashierId: true, cashRegisterId: true, subtotal: true, discountAmount: true, couponDiscount: true, taxAmount: true, total: true, status: true,
      changeDue: true, changeSavedToWallet: true,
      items: { select: { discount: true, taxRate: true, taxAmount: true, total: true } },
      payments: { select: { method: true, amount: true, cardLast4: true, feeAmount: true, status: true, bankAccount: { select: { name: true, bankName: true } } } },
    } as const;
    const linked = ids.length
      ? await this.prisma.sale.findMany({
          where: { tenantId, cashRegisterId: { in: ids }, status: { in: COLLECTED_SALE_STATUSES } },
          select: saleSelect,
        })
      : [];
    // Sales from before shifts were recorded on the sale: same cashier, branch and time window.
    const legacy = (
      await Promise.all(
        registers.map((r) =>
          this.prisma.sale.findMany({
            where: {
              tenantId,
              branchId: r.branchId,
              cashierId: r.cashierId,
              cashRegisterId: null,
              status: { in: COLLECTED_SALE_STATUSES },
              createdAt: { gte: r.openingTime, lte: r.closingTime ?? new Date() },
            },
            select: saleSelect,
          }),
        ),
      )
    ).flat();
    const seen = new Set<string>();
    const sales = [...linked, ...legacy].filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));

    const [supplierPayments, walletRows, voidedSales, supplierReturns, customerReturns, pendingApprovalRows] = await Promise.all([
      this.prisma.supplierPayment.findMany({
        where: { tenantId, paidAt: { gte: periodFrom, lte: periodTo } },
        select: { amount: true, advanceAmount: true, method: true, purchase: { select: { branchId: true } } },
      }),
      this.prisma.walletTransaction.findMany({
        where: { tenantId, createdAt: { lte: periodTo } },
        select: { amount: true, type: true, createdAt: true },
      }),
      this.prisma.sale.findMany({
        where: { tenantId, branchId: resolvedBranchId, status: SaleStatus.CANCELLED, createdAt: { gte: periodFrom, lte: periodTo } },
        select: { total: true, metadata: true, items: { select: { id: true } } },
      }),
      this.prisma.supplierReturn.findMany({
        where: { tenantId, branchId: resolvedBranchId, status: 'POSTED', postedAt: { gte: periodFrom, lte: periodTo } },
        select: { items: { select: { quantity: true, unitCost: true } } },
      }),
      this.prisma.return.findMany({
        where: { tenantId, branchId: resolvedBranchId, status: { in: ['APPROVED', 'REFUND_PROCESSED'] }, createdAt: { gte: periodFrom, lte: periodTo } },
        select: { refundAmount: true, items: { select: { totalAmount: true } } },
      }),
      this.prisma.cashRegister.findMany({
        where: { tenantId, branchId: resolvedBranchId, status: CashRegisterStatus.PENDING_APPROVAL, openingTime: { lte: periodTo }, OR: [{ closingTime: null }, { closingTime: { gte: periodFrom } }] },
        select: { id: true, variance: true, notes: true, openingTime: true, approvedById: true },
      }),
    ]);

    // Handovers between two shifts that are both in this report: that cash is counted once.
    const handovers = ids.length
      ? await this.prisma.cashHandover.findMany({
          where: { tenantId, fromRegisterId: { in: ids }, toRegisterId: { in: ids } },
          select: { fromRegisterId: true, countedCash: true },
        })
      : [];
    const handedWithin = new Map<string, number>();
    for (const h of handovers) handedWithin.set(h.fromRegisterId, (handedWithin.get(h.fromRegisterId) ?? 0) + h.countedCash);

    const shifts: DayEndShiftInput[] = registers.map((r) => ({
      id: r.id,
      cashierName: `${r.cashier.firstName} ${r.cashier.lastName}`.trim(),
      counterName: r.counter?.name ?? null,
      openingTime: r.openingTime,
      closingTime: r.closingTime,
      status: r.status,
      openingCash: r.openingCash,
      actualCash: r.actualCash,
      movements: r.movements,
      handedOverWithin: handedWithin.get(r.id) ?? 0,
      clearedAmount: r.clearedAmount,
      clearedAt: r.clearedAt,
    }));
    const totals = buildDayEndTotals(shifts, sales);
    const walletOpeningBalance = walletRows.filter((row) => row.createdAt < periodFrom).reduce((sum, row) => sum + row.amount, 0);
    const walletPeriodRows = walletRows.filter((row) => row.createdAt >= periodFrom);
    const walletCredits = walletPeriodRows.filter((row) => row.amount > 0).reduce((sum, row) => sum + row.amount, 0);
    const walletRedemptions = Math.abs(walletPeriodRows.filter((row) => row.type === 'SALE_DEBIT' && row.amount < 0).reduce((sum, row) => sum + row.amount, 0));
    const walletRefunds = walletPeriodRows.filter((row) => row.type === 'RETURN_REFUND' || row.type === 'REFUND').reduce((sum, row) => sum + Math.max(0, row.amount), 0);
    const walletClosingBalance = walletOpeningBalance + walletPeriodRows.reduce((sum, row) => sum + row.amount, 0);
    const cashierWalletClearings = shifts.reduce((sum, shift) => sum + (shift.clearedAmount ?? 0), 0);
    const supplierAdvances = supplierPayments.reduce((sum, payment) => sum + payment.advanceAmount, 0);
    const supplierRefunds = supplierReturns.reduce((sum, ret) => sum + ret.items.reduce((itemSum, item) => itemSum + item.quantity * item.unitCost, 0), 0);
    const returnRefunds = customerReturns.reduce((sum, ret) => sum + ret.refundAmount, 0);
    const qrPayments = sales.flatMap((sale) => sale.payments.filter((payment) => payment.method === PaymentMethod.QR));
    const qrBanks = new Map<string, number>();
    for (const payment of qrPayments) {
      const bank = payment.bankAccount?.bankName || payment.bankAccount?.name || 'Unassigned';
      qrBanks.set(bank, (qrBanks.get(bank) ?? 0) + payment.amount);
    }
    const supplierCash = supplierPayments.filter((p) => p.method === PaymentMethod.CASH).reduce((sum, p) => sum + p.amount, 0);
    const supplierNonCash = supplierPayments.filter((p) => p.method !== PaymentMethod.CASH).reduce((sum, p) => sum + p.amount, 0);
    const supplierByMethod = new Map<string, number>();
    for (const payment of supplierPayments) {
      supplierByMethod.set(payment.method, (supplierByMethod.get(payment.method) ?? 0) + payment.amount);
    }
    const safeDrops = shifts.flatMap((s) => s.movements)
      .filter((m) => (m.reference ?? '').startsWith('XFER-SAFE'))
      .reduce((sum, m) => sum + m.amount, 0);
    const expenseByCategory = new Map<string, number>();
    for (const movement of shifts.flatMap((shift) => shift.movements).filter((movement) => movement.type === CashMovementType.EXPENSE)) {
      const category = movement.description?.trim() || 'Uncategorised';
      expenseByCategory.set(category, (expenseByCategory.get(category) ?? 0) + movement.amount);
    }
    const varianceReasons = shifts
      .filter((s) => s.actualCash !== null && Math.abs((s.actualCash ?? 0) - buildDayEndTotals([{ ...s, handedOverWithin: 0 }], []).expectedClosingCash) > 0.004)
      .map((s) => ({ shiftId: s.id, cashierName: s.cashierName, reason: s.movements.find((m) => m.description)?.description ?? null, variance: Math.round(((s.actualCash ?? 0) - buildDayEndTotals([{ ...s, handedOverWithin: 0 }], []).expectedClosingCash) * 100) / 100 }));
    const paymentBreakdown = [...new Set(sales.map((s) => s.cashRegisterId).filter(Boolean))].map((registerId) => {
      const shift = shifts.find((s) => s.id === registerId);
      const rows = sales.filter((s) => s.cashRegisterId === registerId);
      const methods = new Map<string, number>();
      for (const sale of rows) for (const payment of sale.payments) methods.set(payment.method, (methods.get(payment.method) ?? 0) + payment.amount);
      return {
        registerId,
        cashierName: shift?.cashierName ?? 'Unassigned',
        counterName: shift?.counterName ?? null,
        methods: [...methods.entries()].map(([method, amount]) => ({ method, amount: Math.round(amount * 100) / 100 })),
        transactionCount: rows.length,
      };
    });
    const cashierBreakdown = [...new Set(sales.map((sale) => sale.cashierId).filter(Boolean))].map((cashierId) => {
      const shift = shifts.find((candidate) => candidate.id === sales.find((sale) => sale.cashierId === cashierId)?.cashRegisterId);
      const rows = sales.filter((sale) => sale.cashierId === cashierId);
      return {
        cashierId,
        cashierName: shift?.cashierName ?? 'Unassigned',
        transactionCount: rows.length,
        grossRevenue: Math.round(rows.reduce((sum, sale) => sum + (sale.subtotal ?? sale.total), 0) * 100) / 100,
        netRevenue: Math.round(rows.reduce((sum, sale) => sum + (sale.total ?? 0), 0) * 100) / 100,
      };
    });
    const counterBreakdown = [...new Set(shifts.map((shift) => shift.counterName).filter(Boolean))].map((counterName) => {
      const registerIds = shifts.filter((shift) => shift.counterName === counterName).map((shift) => shift.id);
      const rows = sales.filter((sale) => sale.cashRegisterId && registerIds.includes(sale.cashRegisterId));
      return {
        counterName,
        transactionCount: rows.length,
        netRevenue: Math.round(rows.reduce((sum, sale) => sum + (sale.total ?? 0), 0) * 100) / 100,
      };
    });

    const [tenant, branch, requester] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, phone: true, email: true } }),
      this.prisma.branch.findFirst({ where: { id: resolvedBranchId, tenantId }, select: { name: true, code: true, address: true, phone: true } }),
      opts.requesterId
        ? this.prisma.user.findFirst({ where: { id: opts.requesterId, tenantId }, select: { firstName: true, lastName: true } })
        : null,
    ]);
    const counters = [...new Set(shifts.map((s) => s.counterName).filter(Boolean))] as string[];
    const cashiers = [...new Set(shifts.map((s) => s.cashierName))];
    const reportId = `DAY-END-${resolvedBranchId}-${periodFrom.toISOString().slice(0, 10)}${opts.registerId ? `-${opts.registerId}` : ''}`;

    return {
      scope: opts.registerId ? 'SHIFT' : opts.counterId ? 'COUNTER_DAY' : 'BRANCH_DAY',
      business: { name: tenant?.name ?? '', phone: tenant?.phone ?? null, email: tenant?.email ?? null },
      branch: branch ?? null,
      counters,
      cashiers,
      periodFrom,
      periodTo,
      generatedAt: new Date(),
      generatedBy: requester ? `${requester.firstName} ${requester.lastName}`.trim() : null,
      reportId,
      preparedBy: requester ? `${requester.firstName} ${requester.lastName}`.trim() : null,
      checkedBy: null,
      approvedBy: null,
      totals,
      returns: {
        count: customerReturns.length,
        itemCount: customerReturns.reduce((sum, ret) => sum + ret.items.length, 0),
        amount: Math.round(returnRefunds * 100) / 100,
        cash: totals.cashRefunds,
        nonCash: Math.round(Math.max(0, returnRefunds - totals.cashRefunds) * 100) / 100,
        paymentMethods: [
          { method: PaymentMethod.CASH, amount: Math.round(totals.cashRefunds * 100) / 100 },
          { method: 'NON_CASH', amount: Math.round(Math.max(0, returnRefunds - totals.cashRefunds) * 100) / 100 },
        ],
      },
      netSales: Math.round((totals.netRevenue - returnRefunds) * 100) / 100,
      supplierPayments: {
        total: Math.round((supplierCash + supplierNonCash) * 100) / 100,
        cash: Math.round(supplierCash * 100) / 100,
        nonCash: Math.round(supplierNonCash * 100) / 100,
        byMethod: [...supplierByMethod.entries()].map(([method, amount]) => ({ method, amount: Math.round(amount * 100) / 100 })),
        advances: Math.round(supplierAdvances * 100) / 100,
        refunds: Math.round(supplierRefunds * 100) / 100,
        scopeNote: 'Payments without a branch-linked purchase are included for the tenant day; branch attribution is not available in the approved data model.',
      },
      voids: {
        count: voidedSales.length,
        itemCount: voidedSales.reduce((sum, sale) => sum + sale.items.length, 0),
        amount: Math.round(voidedSales.reduce((sum, sale) => sum + sale.total, 0) * 100) / 100,
        byReason: [...voidedSales.reduce((map, sale) => {
          const metadata = sale.metadata;
          const reason = metadata && typeof metadata === 'object' && !Array.isArray(metadata) && 'voidReason' in metadata
            && typeof metadata.voidReason === 'string'
            ? metadata.voidReason
            : 'Unspecified';
          return map.set(reason, (map.get(reason) ?? 0) + 1);
        }, new Map<string, number>())]
          .map(([reason, count]) => ({ reason, count })),
      },
      pendingApprovals: {
        count: pendingApprovalRows.length,
        variance: Math.round(pendingApprovalRows.reduce((sum, row) => sum + (row.variance ?? 0), 0) * 100) / 100,
        byCategory: pendingApprovalRows.map((row) => ({
          category: 'CASH_VARIANCE',
          status: 'PENDING',
          ageMinutes: Math.max(0, Math.round((Date.now() - row.openingTime.getTime()) / 60000)),
          responsibleApproverId: row.approvedById,
        })),
      },
      savedChangeWallet: totals.savedChange,
      savedChangeMovements: Math.round(walletPeriodRows.filter((row) => row.type === 'CHANGE_SAVED').reduce((sum, row) => sum + row.amount, 0) * 100) / 100,
      wallet: {
        openingBalance: Math.round(walletOpeningBalance * 100) / 100,
        credits: Math.round(walletCredits * 100) / 100,
        redemptions: Math.round(walletRedemptions * 100) / 100,
        refunds: Math.round(walletRefunds * 100) / 100,
        closingBalance: Math.round(walletClosingBalance * 100) / 100,
      },
      cashierWallet: {
        clearingTotal: Math.round(cashierWalletClearings * 100) / 100,
        registerBalances: shifts.map((shift) => ({ registerId: shift.id, expected: buildDayEndTotals([{ ...shift, handedOverWithin: 0 }], []).expectedClosingCash, actual: shift.actualCash })),
      },
      safeDrops: Math.round(safeDrops * 100) / 100,
      cashMovements: {
        inflows: Math.round((totals.cashSales + totals.deposits + totals.transfersIn) * 100) / 100,
        outflows: Math.round((totals.cashRefunds + totals.expenses + totals.withdrawals + totals.transfersOut) * 100) / 100,
        internalTransfers: Math.round((totals.transfersIn + totals.transfersOut) * 100) / 100,
      },
      expenseBreakdown: [...expenseByCategory.entries()].map(([category, amount]) => ({ category, amount: Math.round(amount * 100) / 100 })),
      qrReconciliation: {
        gross: Math.round(qrPayments.filter((payment) => !payment.status || payment.status === 'COMPLETED').reduce((sum, payment) => sum + payment.amount, 0) * 100) / 100,
        fees: totals.qrFees,
        net: Math.round((qrPayments.filter((payment) => !payment.status || payment.status === 'COMPLETED').reduce((sum, payment) => sum + payment.amount - (payment.feeAmount ?? 0), 0)) * 100) / 100,
        byBank: [...qrBanks.entries()].map(([bank, amount]) => ({ bank, gross: Math.round(amount * 100) / 100 })),
        unsettled: qrPayments.filter((payment) => payment.status === 'PENDING').length,
        failedOrCancelled: qrPayments.filter((payment) => payment.status === 'FAILED' || payment.status === 'REFUNDED').length,
      },
      varianceReasons,
      paymentBreakdown,
      cashierBreakdown,
      counterBreakdown,
      shifts: shifts.map((s) => {
        const t = buildDayEndTotals([{ ...s, handedOverWithin: 0 }], []); // each shift shows its own closing
        return {
          id: s.id,
          cashierName: s.cashierName,
          counterName: s.counterName,
          status: s.status,
          openingTime: s.openingTime,
          closingTime: s.closingTime,
          openingCash: s.openingCash,
          expectedClosingCash: t.expectedClosingCash,
          actualClosingCash: t.actualClosingCash,
          difference: t.difference,
        };
      }),
    };
  }

  async buildDayEndPdf(report: {
    business: { name: string };
    branch: { name: string; code?: string | null } | null;
    periodFrom: Date;
    periodTo: Date;
    reportId?: string;
    preparedBy?: string | null;
    checkedBy?: string | null;
    approvedBy?: string | null;
    totals: Record<string, unknown>;
    supplierPayments: { total: number; cash: number; nonCash: number };
    voids: { count: number; amount: number };
    pendingApprovals: { count: number; variance: number };
    returns?: { count: number; amount: number; cash: number; nonCash: number };
    netSales?: number;
    savedChangeWallet: number;
    safeDrops: number;
    qrReconciliation?: { gross: number; fees: number; net: number; unsettled: number; failedOrCancelled: number };
    wallet?: { openingBalance: number; credits: number; redemptions: number; refunds: number; closingBalance: number };
    cashierWallet?: { clearingTotal: number };
    shifts: { cashierName: string; counterName: string | null; status: string; expectedClosingCash: number; actualClosingCash: number | null; difference: number | null }[];
  }): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 42,
        bufferPages: true,
        compress: false,
        info: { Title: 'Day-End Report', Author: report.business.name },
      });
      const stream = new PassThrough();
      const chunks: Buffer[] = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
      doc.pipe(stream);

      const fontCandidates = [
        { path: process.env.DAY_END_SINHALA_FONT_PATH, family: undefined },
        { path: 'C:\\Windows\\Fonts\\Nirmala.ttc', family: 'NirmalaUI' },
        { path: 'C:\\Windows\\Fonts\\Nirmala.ttf', family: undefined },
        { path: '/usr/share/fonts/truetype/noto/NotoSansSinhala-Regular.ttf', family: undefined },
        { path: '/usr/share/fonts/opentype/noto/NotoSansSinhala-Regular.ttf', family: undefined },
      ].filter((candidate): candidate is { path: string; family: string | undefined } => Boolean(candidate.path));
      const sinhalaFont = fontCandidates.find((candidate) => fs.existsSync(candidate.path));
      if (sinhalaFont) {
        if (sinhalaFont.family) doc.font(sinhalaFont.path, sinhalaFont.family);
        else doc.font(sinhalaFont.path);
      }
      const reportFont = () => {
        if (sinhalaFont?.family) doc.font(sinhalaFont.path, sinhalaFont.family);
        else if (sinhalaFont?.path) doc.font(sinhalaFont.path);
        else doc.font('Helvetica');
      };

      const money = (value: unknown) => `LKR ${Number(value ?? 0).toFixed(2)}`;
      const t = report.totals;
      const title = `${report.business.name} - Day-End Report`;
      const navy = '#17324d';
      const blue = '#2c638c';
      const paleBlue = '#eaf2f8';
      const grey = '#64748b';
      const pageWidth = 511;
      const drawPageHeader = () => {
        doc.save();
        doc.rect(42, 42, pageWidth, 74).fill(navy);
        reportFont();
        doc.fillColor('#ffffff').fontSize(18).text(title, 58, 56, {
          width: pageWidth - 32,
          align: 'center',
          lineBreak: false,
        });
        reportFont();
        doc.fillColor('#dbeafe').fontSize(9).text(
          `${report.branch?.name ?? ''}${report.branch?.code ? ` (${report.branch.code})` : ''}`,
          58,
          82,
          { width: pageWidth - 32, align: 'center', lineBreak: false },
        );
        reportFont();
        doc.fillColor('#dbeafe').fontSize(8).text(
          `${report.periodFrom.toISOString()}  -  ${report.periodTo.toISOString()}`,
          58,
          96,
          { width: pageWidth - 32, align: 'center', lineBreak: false },
        );
        doc.restore();
        doc.y = 132;
      };
      drawPageHeader();
      if (report.reportId) {
        reportFont();
        doc.fillColor(grey).fontSize(8).text(`Report ID: ${report.reportId}`, 42, doc.y, {
          width: pageWidth,
          align: 'right',
          lineBreak: false,
        });
        doc.y += 18;
      }

      const section = (name: string) => {
        if (doc.y > 755) doc.addPage();
        doc.moveDown(0.35);
        const y = doc.y;
        doc.roundedRect(42, y, pageWidth, 20, 4).fill(paleBlue);
        reportFont();
        doc.fillColor(blue).fontSize(10).text(name, 52, y + 5, {
          width: pageWidth - 20,
          lineBreak: false,
        });
        doc.y = y + 26;
      };
      const row = (label: string, value: unknown) => {
        if (doc.y > 775) doc.addPage();
        const y = doc.y;
        const displayValue = typeof value === 'number' ? money(value) : String(value ?? '');
        reportFont();
        doc.fillColor('#334155').fontSize(9).text(label, 52, y, {
          width: 285,
          lineBreak: false,
        });
        reportFont();
        doc.fillColor('#0f172a').fontSize(9).text(displayValue, 337, y, {
          width: 206,
          align: 'right',
          lineBreak: false,
        });
        doc.strokeColor('#e2e8f0').lineWidth(0.35).moveTo(52, y + 13).lineTo(543, y + 13).stroke();
        doc.y = y + 17;
      };

      section('Revenue');
      row('Gross revenue', t.grossRevenue);
      row('Item discounts', t.itemDiscounts);
      row('Bill discounts', t.billDiscounts);
      row('Promotion discounts', t.promotionDiscounts);
      row('Coupon discounts', t.couponDiscounts);
      row('Discounts', t.discounts);
      row('Taxable sales', t.taxableSales);
      row('Tax-exempt sales', t.taxExemptSales);
      row('Taxes', t.taxes);
      row('Average bill value', t.averageBillValue);
      row('Net revenue', t.netRevenue);
      row('Transactions', t.transactionCount);
      row('Voided bills', `${report.voids.count} (${money(report.voids.amount)})`);
      if (report.returns) row('Returns / refunds', `${report.returns.count} (${money(report.returns.amount)})`);
      if (report.netSales !== undefined) row('Net sales', report.netSales);

      section('Cash and collections');
      row('Opening cash', t.openingCash);
      row('Opening cashier float', t.openingCashierFloat);
      row('Gross cash received', t.cashReceived);
      row('Change given', t.changeGiven);
      row('Saved-change wallet', report.savedChangeWallet);
      row('Cash refunds', t.cashRefunds);
      row('Expected closing cash', t.expectedClosingCash);
      row('Actual closing cash', t.actualClosingCash === null ? 'Not counted' : t.actualClosingCash);
      row('Cash variance', t.difference === null ? 'Not counted' : t.difference);
      row('Total collections', t.totalCollections);

      section('Supplier payments');
      row('Total supplier payments', report.supplierPayments.total);
      row('Supplier cash', report.supplierPayments.cash);
      row('Supplier non-cash', report.supplierPayments.nonCash);
      row('Safe drops', report.safeDrops);
      row('Pending approvals', `${report.pendingApprovals.count} (${money(report.pendingApprovals.variance)})`);
      if (report.wallet) {
        row('Wallet opening balance', report.wallet.openingBalance);
        row('Wallet credits', report.wallet.credits);
        row('Wallet redemptions', report.wallet.redemptions);
        row('Wallet refunds', report.wallet.refunds);
        row('Wallet closing balance', report.wallet.closingBalance);
      }
      if (report.cashierWallet) row('Cashier wallet clearings', report.cashierWallet.clearingTotal);
      if (report.qrReconciliation) {
        section('QR reconciliation');
        row('QR gross', report.qrReconciliation.gross);
        row('QR fees', report.qrReconciliation.fees);
        row('QR net bank receipt', report.qrReconciliation.net);
        row('QR unsettled', report.qrReconciliation.unsettled);
        row('QR failed/cancelled', report.qrReconciliation.failedOrCancelled);
      }

      section('Cashier / counter breakdown');
      for (const shift of report.shifts) {
        row(`${shift.cashierName}${shift.counterName ? ` / ${shift.counterName}` : ''}`, `${shift.status}, expected ${money(shift.expectedClosingCash)}, actual ${shift.actualClosingCash === null ? '—' : money(shift.actualClosingCash)}`);
      }
      section('Report approval');
      row('Prepared by', report.preparedBy ?? '—');
      row('Checked by', report.checkedBy ?? '—');
      row('Approved by', report.approvedBy ?? '—');
      reportFont();
      doc.moveDown(0.7).fillColor(grey).fontSize(8).text('READ-ONLY REPORT  |  Printing does not close shifts or create transactions.', {
        align: 'center',
      });

      const pageRange = doc.bufferedPageRange();
      for (let pageIndex = 0; pageIndex < pageRange.count; pageIndex += 1) {
        doc.switchToPage(pageRange.start + pageIndex);
        doc.save();
        doc.font('Helvetica');
        doc.fillColor(navy).fontSize(8).text('HEXALYTE  |  DAY-END REPORT', 42, 20, { width: 511, align: 'left', lineBreak: false });
        doc.fillColor(grey).fontSize(8).text(`Page ${pageIndex + 1} of ${pageRange.count}`, 42, 785, { width: 511, align: 'right', lineBreak: false });
        doc.restore();
      }
      doc.end();
    });
  }

  /** A counter's shifts and handovers, newest first (cashier shift and balance history). */
  async getCounterHistory(tenantId: string, branchId: string | undefined, counterId: string, limit = 50) {
    const resolvedBranchId = await this.resolveBranchId(tenantId, branchId);
    const counter = await this.prisma.posCounter.findFirst({
      where: { id: counterId, tenantId, branchId: resolvedBranchId },
      select: { id: true, name: true, code: true },
    });
    if (!counter) throw new NotFoundException('Counter not found');
    const take = Math.min(Math.max(limit, 1), 200);
    const [registers, handovers, inDrawer] = await Promise.all([
      this.prisma.cashRegister.findMany({
        where: { tenantId, counterId },
        orderBy: { openingTime: 'desc' },
        take,
        include: {
          movements: { select: { type: true, amount: true, reference: true } },
          cashier: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.cashHandover.findMany({ where: { tenantId, counterId }, orderBy: { createdAt: 'desc' }, take }),
      this.prisma.cashRegister.findMany({
        where: { tenantId, counterId, clearedAt: null },
        include: { movements: { select: { type: true, amount: true } } },
      }),
    ]);
    const userIds = [
      ...new Set(
        handovers.flatMap((h) => [h.fromCashierId, h.toCashierId, h.performedById, h.authorizedById]).filter(Boolean) as string[],
      ),
    ];
    const users = userIds.length
      ? await this.prisma.user.findMany({ where: { tenantId, id: { in: userIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const nameOf = (id?: string | null) => {
      const u = users.find((x) => x.id === id);
      return u ? `${u.firstName} ${u.lastName}`.trim() : null;
    };
    return {
      counter,
      cashInDrawer: Math.round(inDrawer.reduce((sum, r) => sum + walletDrawerAmount(r).drawerCash, 0) * 100) / 100,
      shifts: registers.map((r) => ({
        id: r.id,
        cashierName: `${r.cashier.firstName} ${r.cashier.lastName}`.trim(),
        status: r.status,
        openingTime: r.openingTime,
        closingTime: r.closingTime,
        openingCash: r.openingCash,
        expectedCash: walletDrawerAmount(r).expectedCash,
        actualCash: r.actualCash,
        variance: r.variance,
        clearedAt: r.clearedAt,
        clearedAmount: r.clearedAmount,
        breakdown: summarizeMovements(r.movements),
      })),
      handovers: handovers.map((h) => ({
        ...h,
        fromCashierName: nameOf(h.fromCashierId),
        toCashierName: nameOf(h.toCashierId),
        performedByName: nameOf(h.performedById),
        authorizedByName: nameOf(h.authorizedById),
      })),
    };
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
    opts: { actingCashierId?: string; roles?: string[] } = {},
  ) {
    const register = await this.getRegisterEntity(registerId, tenantId);
    const isOwner = register.cashierId === userId || register.cashierId === opts.actingCashierId;
    if (!isOwner && !this.canManageCashTransfers(opts.roles ?? [])) {
      throw new ForbiddenException('Only the wallet owner or a manager can close this shift');
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

  /**
   * Manual cash in / out on a drawer (audit H2). In one transaction with the drawer row locked:
   * tenant + branch + owner-or-manager checks, then for cash OUT (withdrawal / expense) the balance is
   * recomputed under the lock and the movement is refused if it exceeds it; above the configured
   * threshold only a manager may do it and is recorded as the authoriser. Concurrent cash outs on the
   * same drawer queue on the lock, so together they can never overdraw it.
   */
  async addMovement(
    registerId: string,
    tenantId: string,
    auth: CashAuth,
    dto: CashMovementDto,
    opts: { branchId?: string | null } = {},
  ) {
    const allowed: CashMovementType[] = [
      CashMovementType.DEPOSIT,
      CashMovementType.WITHDRAWAL,
      CashMovementType.EXPENSE,
      CashMovementType.PAYMENT,
    ];
    if (!allowed.includes(dto.type)) {
      throw new BadRequestException(`Movement type ${dto.type} not allowed manually`);
    }
    const amount = Math.round(dto.amount * 100) / 100;
    if (!(amount > 0)) throw new BadRequestException('Amount must be greater than zero');
    // The acting person (PIN cashier, never the terminal's roles) and an explicit approver, if any.
    const actor = await resolveCashActor(this.prisma, { tenantId, ...auth });
    const isCashOut = dto.type === CashMovementType.WITHDRAWAL || dto.type === CashMovementType.EXPENSE;

    await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "cash_registers" WHERE "id" = ${registerId} AND "tenantId" = ${tenantId} FOR UPDATE`;
      if (!locked.length) throw new NotFoundException('Cash register session not found');
      const register = await tx.cashRegister.findFirst({
        where: { id: registerId, tenantId },
        include: { movements: { select: { type: true, amount: true } } },
      });
      if (!register) throw new NotFoundException('Cash register session not found');
      // A user tied to a branch only works on that branch's drawers (same answer as "not found").
      if (opts.branchId && register.branchId !== opts.branchId) {
        throw new NotFoundException('Cash register session not found');
      }
      if (register.status !== CashRegisterStatus.OPEN || register.clearedAt) {
        throw new BadRequestException('Cannot add movements to a closed shift');
      }
      const isOwner = register.cashierId === actor.actorId;
      if (!isOwner && !actor.authorizerId) {
        throw managerApprovalRequired('Only the cashier who opened this shift, or with a manager\'s approval, can add cash movements');
      }
      if (isCashOut) {
        const available = computeExpectedCashFromMovements(register.openingCash, register.movements);
        const decision = decideCashOut({ amount, available, isManager: !!actor.authorizerId, threshold: cashOutApprovalThreshold() });
        if (!decision.ok) {
          if (decision.code === 'MANAGER_REQUIRED') throw managerApprovalRequired(decision.message);
          throw new BadRequestException(decision.message);
        }
      }
      await tx.cashMovement.create({
        data: {
          tenantId,
          registerId,
          type: dto.type,
          amount,
          description: dto.description,
          reference: dto.reference,
          createdById: actor.actorId,
          // The acting manager, or the manager who approved with their PIN; never the terminal login.
          authorizedById: actor.authorizerId,
        },
      });
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

  /** Counted cash from the cashier's last close on this counter (else on any counter). */
  async getOpeningSuggestion(
    tenantId: string,
    branchId: string | undefined,
    cashierId: string,
    counterId?: string | null,
  ) {
    const resolvedBranchId = await this.resolveBranchId(tenantId, branchId);
    const findLastClosed = (onCounter?: string) =>
      this.prisma.cashRegister.findFirst({
        where: {
          tenantId,
          branchId: resolvedBranchId,
          cashierId,
          status: CashRegisterStatus.CLOSED,
          ...(onCounter ? { counterId: onCounter } : {}),
        },
        orderBy: { closingTime: 'desc' },
        select: {
          actualCash: true,
          closingCash: true,
          clearedAmount: true,
          openingCash: true,
          closingTime: true,
          variance: true,
        },
      });
    const lastClosed = (counterId ? await findLastClosed(counterId) : null) ?? (await findLastClosed());

    const raw = lastClosed?.actualCash ?? lastClosed?.clearedAmount ?? lastClosed?.closingCash ?? null;
    const limit = await this.openingFloatLimit(tenantId, resolvedBranchId);
    const suggested = raw != null ? Math.round(raw * 100) / 100 : null;
    return {
      // never pre-fill a figure the server would refuse (e.g. a mistyped earlier close)
      suggestedOpening: suggested != null && suggested >= 0 && suggested <= limit.max ? suggested : null,
      maxOpeningFloat: limit.max,
      maxOpeningFloatSource: limit.source,
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

  async listOpenShifts(tenantId: string, branchId: string | undefined) {
    const resolvedBranchId = await this.resolveBranchId(tenantId, branchId);
    const registers = await this.prisma.cashRegister.findMany({
      where: {
        tenantId,
        branchId: resolvedBranchId,
        status: CashRegisterStatus.OPEN,
      },
      orderBy: { openingTime: 'asc' },
      include: {
        movements: { orderBy: { createdAt: 'asc' } },
        cashier: { select: { id: true, firstName: true, lastName: true, email: true } },
        branch: { select: { id: true, name: true, code: true } },
        counter: { select: { id: true, name: true, code: true } },
      },
    });
    return registers.map((r) => {
      const view = this.buildRegisterView(r);
      return {
        id: view.id,
        openingCash: view.openingCash,
        openingTime: view.openingTime,
        status: view.status,
        cashierId: view.cashierId,
        cashierName: view.cashierName,
        counterId: r.counterId,
        counterName: r.counter?.name ?? null,
        counterCode: r.counter?.code ?? null,
        expectedCash: view.summary.expectedCash,
        summary: view.summary,
      };
    });
  }

  /**
   * A manager approves a cash action at the terminal by entering THEIR OWN PIN. Returns a short-lived
   * signed token for x-cash-approval-token. 5 wrong PINs lock approvals for this terminal user for 15 min,
   * across all API instances (Redis; see PinLockoutService). The same answer is given whether no manager
   * has the PIN, a cashier has it, or nobody does, so it never reveals which accounts exist.
   */
  async issueManagerApproval(tenantId: string, branchId: string | undefined, terminalUserId: string, pin: string) {
    assertValidPosPin(pin);
    const scope = `${tenantId}:${terminalUserId}`;
    const attempt = await this.pinLockout.begin(scope);
    if (!attempt.allowed) {
      const minutes = Math.max(1, Math.ceil((attempt.lockedUntil - Date.now()) / 60000));
      throw new HttpException(
        { statusCode: 429, error: 'PIN_LOCKED', message: `Too many wrong PINs. Manager approval is locked on this terminal for ${minutes} more minute(s).` },
        429,
      );
    }
    const candidates = await this.prisma.user.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        posPinHash: { not: null },
        ...(branchId ? { OR: [{ branchId }, { branchId: null }] } : {}),
      },
      select: { id: true, firstName: true, lastName: true, posPinHash: true, roles: { select: { role: { select: { type: true } } } } },
      take: 200,
    });
    for (const u of candidates) {
      if (!isCashManagerRole(u.roles.map((r) => r.role.type))) continue;
      if (u.posPinHash && (await verifyPosPinHash(pin, u.posPinHash))) {
        await this.pinLockout.succeed(scope);
        return {
          approvalToken: signCashApprovalToken(tenantId, u.id),
          expiresInSeconds: 300,
          manager: { id: u.id, name: `${u.firstName} ${u.lastName}`.trim() },
        };
      }
    }
    await this.pinLockout.fail(scope);
    throw new ForbiddenException({ statusCode: 403, error: 'PIN_REJECTED', message: 'Manager PIN not accepted' });
  }

  private canManageCashTransfers(roles: string[] = []) {
    return (
      bypassesWorkflowApproval(roles)
      || roles.includes(RoleType.BRANCH_MANAGER)
      || roles.includes(RoleType.ACCOUNTANT)
      || roles.includes(RoleType.INVENTORY_MANAGER)
    );
  }

  async transferFunds(
    tenantId: string,
    branchId: string | undefined,
    auth: CashAuth,
    dto: TransferFundsDto,
  ) {
    const amount = Math.round(dto.amount * 100) / 100;
    if (!(amount > 0)) throw new BadRequestException('Amount must be greater than zero');
    const actor = await resolveCashActor(this.prisma, { tenantId, ...auth });
    const userId = actor.actorId;
    const needsApproval = amount > cashOutApprovalThreshold() + 0.001;

    const from = dto.from ?? CashTransferSource.SAFE;
    const reason = (dto.reason || '').trim() || 'Funds transfer';
    const resolvedBranchId = await this.resolveBranchId(tenantId, branchId);

    const toRegister = await this.getRegisterEntity(dto.toRegisterId, tenantId);
    if (toRegister.branchId !== resolvedBranchId) {
      throw new BadRequestException('Destination shift is on another branch');
    }
    if (toRegister.status !== CashRegisterStatus.OPEN) {
      throw new BadRequestException('Destination shift is not open');
    }

    const destLabel =
      toRegister.counter?.name
      ?? (toRegister.cashier
        ? `${toRegister.cashier.firstName} ${toRegister.cashier.lastName}`.trim()
        : 'cashier');

    if (from === CashTransferSource.SAFE) {
      // Safe → drawer: a cashier may top up only their own drawer, up to the threshold; anything else
      // needs a manager acting or a manager approval token.
      if ((needsApproval || toRegister.cashierId !== actor.actorId) && !actor.authorizerId) {
        throw managerApprovalRequired('A manager must approve this transfer from the safe (manager PIN)');
      }
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "cash_registers" WHERE "id" = ${toRegister.id} FOR UPDATE`;
        const dst = await tx.cashRegister.findFirst({ where: { id: toRegister.id, tenantId }, select: { status: true, clearedAt: true } });
        if (!dst || dst.status !== CashRegisterStatus.OPEN || dst.clearedAt) throw new BadRequestException('Destination shift is not open');
        await tx.cashMovement.create({
          data: {
            tenantId, registerId: toRegister.id, type: CashMovementType.DEPOSIT, amount,
            reference: `XFER-SAFE-${Date.now()}`, description: `Transfer from safe · ${reason}`,
            createdById: userId, authorizedById: actor.authorizerId,
          },
        });
      });

      this.eventEmitter.emit('cash.funds.transferred', {
        tenantId,
        branchId: resolvedBranchId,
        from: 'SAFE',
        toRegisterId: toRegister.id,
        amount,
        userId,
      });

      return {
        amount,
        from: 'SAFE',
        to: await this.getRegisterById(toRegister.id, tenantId),
        message: `Transferred LKR ${amount.toFixed(2)} to ${destLabel}`,
      };
    }

    // REGISTER → REGISTER
    if (!dto.fromRegisterId) {
      throw new BadRequestException('fromRegisterId is required when transferring from a till');
    }
    if (dto.fromRegisterId === dto.toRegisterId) {
      throw new BadRequestException('Cannot transfer to the same shift');
    }

    const fromRegister = await this.getRegisterEntity(dto.fromRegisterId, tenantId);
    if (fromRegister.branchId !== resolvedBranchId) {
      throw new BadRequestException('Source shift is on another branch');
    }
    if (fromRegister.status !== CashRegisterStatus.OPEN) {
      throw new BadRequestException('Source shift is not open');
    }

    // The acting person (PIN cashier, never the terminal login) must own the source drawer, or a manager
    // must act / approve. Above the threshold a manager approval is always needed.
    const isSourceCashier = fromRegister.cashierId === actor.actorId;
    if (!isSourceCashier && !actor.authorizerId) {
      throw managerApprovalRequired('Only the till cashier or a manager can transfer from this shift');
    }
    if (needsApproval && !actor.authorizerId) {
      throw managerApprovalRequired('A manager must approve transfers above the cash-out limit (manager PIN)');
    }

    const expected = computeExpectedCashFromMovements(
      fromRegister.openingCash,
      fromRegister.movements,
    );
    if (amount > expected + 0.001) {
      throw new BadRequestException(
        `Insufficient cash in source till (expected LKR ${expected.toFixed(2)})`,
      );
    }

    const fromLabel =
      fromRegister.counter?.name
      ?? (fromRegister.cashier
        ? `${fromRegister.cashier.firstName} ${fromRegister.cashier.lastName}`.trim()
        : 'till');

    const ref = `XFER-${Date.now()}`;
    const authorizedById = actor.authorizerId;
    await this.prisma.$transaction(async (tx) => {
      // Lock both wallets (fixed order: no deadlock between opposite transfers) and re-check the
      // source balance inside the transaction, so two concurrent transfers cannot overdraw it.
      const lockIds = [fromRegister.id, toRegister.id].sort();
      await tx.$queryRaw`SELECT "id" FROM "cash_registers" WHERE "id" IN (${Prisma.join(lockIds)}) ORDER BY "id" FOR UPDATE`;
      const [src, dst] = await Promise.all([
        tx.cashRegister.findFirst({ where: { id: fromRegister.id, tenantId }, include: { movements: { select: { type: true, amount: true } } } }),
        tx.cashRegister.findFirst({ where: { id: toRegister.id, tenantId }, select: { status: true, clearedAt: true } }),
      ]);
      if (!src || src.status !== CashRegisterStatus.OPEN || src.clearedAt) throw new BadRequestException('Source shift is not open');
      if (!dst || dst.status !== CashRegisterStatus.OPEN || dst.clearedAt) throw new BadRequestException('Destination shift is not open');
      const available = computeExpectedCashFromMovements(src.openingCash, src.movements);
      if (amount > available + 0.001) {
        throw new BadRequestException(`Insufficient cash in source till (expected LKR ${available.toFixed(2)})`);
      }
      await tx.cashMovement.create({
        data: {
          tenantId, registerId: fromRegister.id, type: CashMovementType.WITHDRAWAL, amount,
          reference: ref, description: `Transfer to ${destLabel} · ${reason}`, createdById: userId, authorizedById,
        },
      });
      await tx.cashMovement.create({
        data: {
          tenantId, registerId: toRegister.id, type: CashMovementType.DEPOSIT, amount,
          reference: ref, description: `Transfer from ${fromLabel} · ${reason}`, createdById: userId, authorizedById,
        },
      });
    });

    this.eventEmitter.emit('cash.funds.transferred', {
      tenantId,
      branchId: resolvedBranchId,
      from: 'REGISTER',
      fromRegisterId: fromRegister.id,
      toRegisterId: toRegister.id,
      amount,
      userId,
    });

    return {
      amount,
      from: 'REGISTER',
      fromRegister: await this.getRegisterById(fromRegister.id, tenantId),
      to: await this.getRegisterById(toRegister.id, tenantId),
      message: `Transferred LKR ${amount.toFixed(2)} from ${fromLabel} to ${destLabel}`,
    };
  }

  // ── Cashier wallets → main cash (day end) ────────────────────────────────

  private async resolveMainCashAccount(tenantId: string, branchId: string) {
    const candidates = await this.prisma.bankAccount.findMany({
      where: { tenantId, type: BankAccountType.CASH_IN_HAND, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    const existing =
      candidates.find((a) => a.branchId === branchId)
      ?? candidates.find((a) => !a.branchId)
      ?? candidates[0];
    if (existing) return existing;

    const gl = await this.prisma.account.findFirst({
      where: { tenantId, code: { in: ['1100', '1000'] } },
      orderBy: { code: 'desc' },
      select: { id: true },
    });
    const codeTaken = await this.prisma.bankAccount.findFirst({ where: { tenantId, code: 'CASH-01' } });
    return this.prisma.bankAccount.create({
      data: {
        tenantId,
        code: codeTaken ? `CASH-${Date.now().toString().slice(-6)}` : 'CASH-01',
        name: 'Main Cash',
        type: BankAccountType.CASH_IN_HAND,
        glAccountId: gl?.id,
      },
    });
  }

  private walletAmountToClear(register: {
    status: CashRegisterStatus;
    actualCash: number | null;
    openingCash: number;
    movements: { type: CashMovementType; amount: number }[];
  }) {
    const expected = computeExpectedCashFromMovements(register.openingCash, register.movements);
    const amount = register.status === CashRegisterStatus.OPEN ? expected : (register.actualCash ?? expected);
    return { expectedCash: expected, amountToClear: Math.round(amount * 100) / 100 };
  }

  async listCashierWallets(tenantId: string, branchId: string | undefined) {
    const resolvedBranchId = await this.resolveBranchId(tenantId, branchId);
    const [registers, mainCash] = await Promise.all([
      this.prisma.cashRegister.findMany({
        where: { tenantId, branchId: resolvedBranchId, clearedAt: null },
        orderBy: [{ status: 'asc' }, { openingTime: 'asc' }],
        include: {
          movements: { orderBy: { createdAt: 'asc' } },
          cashier: { select: { id: true, firstName: true, lastName: true, email: true } },
          counter: { select: { id: true, name: true, code: true } },
        },
      }),
      this.resolveMainCashAccount(tenantId, resolvedBranchId),
    ]);

    const wallets = registers.map((r) => {
      const { expectedCash, amountToClear } = this.walletAmountToClear(r);
      return {
        id: r.id,
        status: r.status,
        cashierId: r.cashierId,
        cashierName: `${r.cashier.firstName} ${r.cashier.lastName}`.trim(),
        cashierEmail: r.cashier.email,
        counterName: r.counter?.name ?? null,
        openingTime: r.openingTime,
        closingTime: r.closingTime,
        openingCash: r.openingCash,
        actualCash: r.actualCash,
        variance: r.variance,
        expectedCash,
        amountToClear,
        summary: summarizeMovements(r.movements),
      };
    });

    return {
      mainCash: { id: mainCash.id, name: mainCash.name, code: mainCash.code, balance: mainCash.currentBalance },
      wallets,
      totalToClear: Math.round(wallets.reduce((s, w) => s + w.amountToClear, 0) * 100) / 100,
    };
  }

  async clearCashierWallet(
    tenantId: string,
    branchId: string | undefined,
    registerId: string,
    adminId: string,
    roles: string[],
    dto: ClearWalletDto = {},
  ) {
    if (!this.canManageCashTransfers(roles)) {
      throw new ForbiddenException('Only an admin or manager can clear cashier wallets');
    }
    const register = await this.getRegisterEntity(registerId, tenantId);
    if (register.clearedAt) throw new BadRequestException('This wallet is already cleared');

    const { expectedCash, amountToClear } = this.walletAmountToClear(register);
    const counted = dto.countedCash != null ? Math.round(dto.countedCash * 100) / 100 : amountToClear;
    if (counted < 0) throw new BadRequestException('Counted cash cannot be negative');
    const countError = dto.countedCash != null ? countedCashError(counted, expectedCash) : null;
    if (countError) throw new BadRequestException(countError);

    if (register.status === CashRegisterStatus.PENDING_APPROVAL) {
      await this.approveRegister(registerId, tenantId, adminId, roles);
    }

    const mainCash = await this.resolveMainCashAccount(tenantId, register.branchId);
    const cashierName = register.cashier
      ? `${register.cashier.firstName} ${register.cashier.lastName}`.trim()
      : 'cashier';
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await this.clearWalletInTx(tx, {
        tenantId, register, counted, expectedCash, actorId: adminId, mainCashId: mainCash.id, now, notes: dto.notes,
      });
    });

    this.eventEmitter.emit('cash.wallet.cleared', {
      tenantId,
      branchId: register.branchId,
      registerId,
      cashierId: register.cashierId,
      amount: counted,
      expectedCash,
      mainCashAccountId: mainCash.id,
      clearedById: adminId,
    });

    return {
      registerId,
      cashierName,
      amount: counted,
      expectedCash,
      variance: Math.round((counted - expectedCash) * 100) / 100,
      mainCash: { id: mainCash.id, name: mainCash.name },
    };
  }

  async clearAllCashierWallets(
    tenantId: string,
    branchId: string | undefined,
    adminId: string,
    roles: string[],
  ) {
    if (!this.canManageCashTransfers(roles)) {
      throw new ForbiddenException('Only an admin or manager can clear cashier wallets');
    }
    const { wallets } = await this.listCashierWallets(tenantId, branchId);
    const results = [];
    for (const w of wallets) {
      results.push(await this.clearCashierWallet(tenantId, branchId, w.id, adminId, roles));
    }
    return {
      cleared: results.length,
      total: Math.round(results.reduce((s, r) => s + r.amount, 0) * 100) / 100,
      results,
    };
  }

  /**
   * Clears one wallet into main cash inside the caller's transaction (day-end clear and counter
   * handover share it). Float and safe cash-in already belonged to main cash; only the rest is new
   * money. The GL entry is posted afterwards from the 'cash.wallet.cleared' event.
   */
  private async clearWalletInTx(
    tx: Prisma.TransactionClient,
    opts: {
      tenantId: string;
      register: {
        id: string; status: CashRegisterStatus; notes: string | null; openingCash: number;
        movements: { type: CashMovementType; amount: number }[];
        cashier?: { firstName: string; lastName: string } | null;
      };
      counted: number;
      expectedCash: number;
      actorId: string;
      mainCashId: string;
      now: Date;
      notes?: string;
      descriptionPrefix?: string;
    },
  ) {
    const { tenantId, register, counted, expectedCash, actorId, mainCashId, now } = opts;
    const cashierName = register.cashier
      ? `${register.cashier.firstName} ${register.cashier.lastName}`.trim()
      : 'cashier';
    const floatIssued = walletFloatIssued(register.openingCash, register.movements);
    const netToMain = Math.round((counted - floatIssued) * 100) / 100;
    const closeData =
      register.status === CashRegisterStatus.OPEN
        ? {
            closingCash: counted,
            closingTime: now,
            expectedCash,
            actualCash: counted,
            variance: Math.round((counted - expectedCash) * 100) / 100,
            status: CashRegisterStatus.CLOSED,
            approvedById: actorId,
            approvedAt: now,
          }
        : {};
    await tx.cashRegister.update({
      where: { id: register.id },
      data: {
        ...closeData,
        clearedAt: now,
        clearedById: actorId,
        clearedAmount: counted,
        clearedToAccountId: mainCashId,
        ...(opts.notes ? { notes: [register.notes, opts.notes].filter(Boolean).join(' · ') } : {}),
      },
    });
    if (Math.abs(netToMain) > 0.009) {
      const prefix = opts.descriptionPrefix ?? 'Cashier wallet cleared';
      await tx.bankTransaction.create({
        data: {
          tenantId,
          bankAccountId: mainCashId,
          type: netToMain > 0 ? BankTxnType.DEPOSIT : BankTxnType.WITHDRAWAL,
          amount: Math.abs(netToMain),
          reference: `WALLET-${register.id.slice(-8).toUpperCase()}`,
          description:
            floatIssued > 0.009
              ? `${prefix} · ${cashierName} (counted ${counted.toFixed(2)} less float ${floatIssued.toFixed(2)})`
              : `${prefix} · ${cashierName}`,
          createdBy: actorId,
        },
      });
      await tx.bankAccount.update({
        where: { id: mainCashId },
        data: { currentBalance: { increment: netToMain } },
      });
    }
    return { netToMain, floatIssued };
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
        counter: { select: { id: true, name: true, code: true } },
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

  @Get('counters')
  @RequireAnyPermissions('cash:read', 'sales:read', 'sales:create', 'cash:create')
  @ApiOperation({ summary: 'List POS cashier counters for branch' })
  listCounters(
    @CurrentUser() user: IAuthUser,
    @Query('all') all?: string,
  ) {
    return this.cashService.listCounters(user.tenantId, user.branchId, {
      includeInactive: all === '1' || all === 'true',
    });
  }

  @Get('counters/cash')
  @RequireAnyPermissions('cash:read', 'sales:read', 'sales:create')
  @ApiOperation({ summary: 'Cash currently held at each counter (all cashiers, not yet cleared)' })
  getCounterCash(@CurrentUser() user: IAuthUser) {
    return this.cashService.getCounterCash(user.tenantId, user.branchId);
  }

  @Post('counters')
  @RequireAnyPermissions('cash:create', 'cash:update')
  @ApiOperation({ summary: 'Create a cashier counter' })
  createCounter(@CurrentUser() user: IAuthUser, @Body() dto: CreatePosCounterDto) {
    return this.cashService.createCounter(user.tenantId, user.branchId, dto);
  }

  @Put('counters/:id')
  @RequireAnyPermissions('cash:create', 'cash:update')
  @ApiOperation({ summary: 'Update a cashier counter' })
  updateCounter(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdatePosCounterDto,
  ) {
    return this.cashService.updateCounter(user.tenantId, user.branchId, id, dto);
  }

  @Delete('counters/:id')
  @RequireAnyPermissions('cash:create', 'cash:update')
  @ApiOperation({ summary: 'Deactivate a cashier counter' })
  deactivateCounter(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.cashService.deactivateCounter(user.tenantId, user.branchId, id);
  }

  @Get('active')
  @RequireAnyPermissions('cash:read', 'sales:read')
  @ApiOperation({ summary: 'Get current open cash shift for cashier' })
  getActive(
    @CurrentUser() user: IAuthUser,
    @Headers('x-pos-cashier-token') unlockToken?: string,
    @Headers('x-pos-counter-id') counterHeader?: string,
    @Query('counterId') counterId?: string,
  ) {
    const cashierId = resolveActingCashierId(user.tenantId, user.id, unlockToken);
    return this.cashService.getActiveRegister(
      user.tenantId,
      user.branchId,
      cashierId,
      counterId || counterHeader || undefined,
    );
  }

  @Get('open-shifts')
  @RequireAnyPermissions('cash:read', 'sales:read', 'sales:create')
  @ApiOperation({ summary: 'List all open cash shifts on the branch (for funds transfer)' })
  listOpenShifts(@CurrentUser() user: IAuthUser) {
    return this.cashService.listOpenShifts(user.tenantId, user.branchId);
  }

  @Post('transfer')
  @RequireAnyPermissions('cash:create', 'sales:create', 'cash:update')
  @ApiOperation({ summary: 'Transfer funds to a cashier till (from safe or another till)' })
  transferFunds(
    @CurrentUser() user: IAuthUser,
    @Body() dto: TransferFundsDto,
    @Headers('x-pos-cashier-token') unlockToken?: string,
    @Headers('x-cash-approval-token') approvalToken?: string,
  ) {
    return this.cashService.transferFunds(
      user.tenantId,
      user.branchId,
      { user: { id: user.id, roles: user.roles ?? [] }, unlockToken, approvalToken },
      dto,
    );
  }

  @Post('open')
  @RequireAnyPermissions('cash:create', 'sales:create')
  @ApiOperation({ summary: 'Open cash shift with opening float' })
  openShift(
    @CurrentUser() user: IAuthUser,
    @Body() dto: OpenCashRegisterDto,
    @Headers('x-pos-cashier-token') unlockToken?: string,
    @Headers('x-cash-approval-token') approvalToken?: string,
  ) {
    const cashierId = resolveActingCashierId(user.tenantId, user.id, unlockToken);
    return this.cashService.openRegister(user.tenantId, user.branchId, cashierId, dto, {
      user: { id: user.id, roles: user.roles ?? [] },
      unlockToken,
      approvalToken,
    });
  }

  @Post('manager-approval')
  @RequireAnyPermissions('cash:create', 'sales:create', 'cash:update')
  @ApiOperation({ summary: 'Manager approves a cash action with their own PIN (short-lived approval token)' })
  managerApproval(@CurrentUser() user: IAuthUser, @Body() dto: ManagerApprovalDto) {
    return this.cashService.issueManagerApproval(user.tenantId, user.branchId, user.id, dto.pin);
  }

  @Get('handover-preview')
  @RequireAnyPermissions('cash:create', 'sales:create', 'cash:read')
  @ApiOperation({ summary: 'Cash the incoming cashier would take over on a counter' })
  handoverPreview(
    @CurrentUser() user: IAuthUser,
    @Query('counterId') counterId: string,
    @Headers('x-pos-cashier-token') unlockToken?: string,
  ) {
    if (!counterId) throw new BadRequestException('counterId is required');
    const cashierId = resolveActingCashierId(user.tenantId, user.id, unlockToken);
    return this.cashService.getHandoverPreview(user.tenantId, user.branchId, cashierId, counterId);
  }

  @Get('day-end-report')
  @RequirePermissions('cash:read')
  @ApiOperation({ summary: 'Day-end report for a branch (or one counter) on a date — thermal print data' })
  dayEndReport(
    @CurrentUser() user: IAuthUser,
    @Query('date') date?: string,
    @Query('counterId') counterId?: string,
  ) {
    return this.cashService.getDayEndReport(user.tenantId, user.branchId, { date, counterId: counterId || undefined, requesterId: user.id });
  }

  @Get('day-end-report/pdf')
  @RequirePermissions('cash:read')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'attachment; filename="day-end-report.pdf"')
  @ApiOperation({ summary: 'Download the read-only day-end report as an A4 PDF' })
  async dayEndReportPdf(
    @CurrentUser() user: IAuthUser,
    @Query('date') date?: string,
    @Query('counterId') counterId?: string,
  ) {
    const report = await this.cashService.getDayEndReport(user.tenantId, user.branchId, { date, counterId: counterId || undefined, requesterId: user.id });
    return new StreamableFile(await this.cashService.buildDayEndPdf(report));
  }

  @Get(':id/day-end-report')
  @RequireAnyPermissions('cash:read', 'sales:create')
  @ApiOperation({ summary: 'Day-end report for one cashier shift (cashiers: own shift only)' })
  shiftDayEndReport(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Headers('x-pos-cashier-token') unlockToken?: string,
  ) {
    const canReadAll = (user.permissions ?? []).includes('cash:read') || bypassesWorkflowApproval(user.roles ?? []);
    const acting = resolveActingCashierId(user.tenantId, user.id, unlockToken);
    return this.cashService.getDayEndReport(user.tenantId, user.branchId, {
      registerId: id,
      requesterId: user.id,
      ownOnlyCashierIds: canReadAll ? undefined : [...new Set([user.id, acting])],
    });
  }

  @Get('counters/:id/history')
  @RequirePermissions('cash:read')
  @ApiOperation({ summary: 'Shift, balance and handover history of a counter' })
  counterHistory(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Query('limit') limit?: string) {
    return this.cashService.getCounterHistory(user.tenantId, user.branchId, id, limit ? Number(limit) || 50 : 50);
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
  getOpeningSuggestion(
    @CurrentUser() user: IAuthUser,
    @Headers('x-pos-cashier-token') unlockToken?: string,
    @Headers('x-pos-counter-id') counterHeader?: string,
    @Query('counterId') counterId?: string,
  ) {
    const cashierId = resolveActingCashierId(user.tenantId, user.id, unlockToken);
    return this.cashService.getOpeningSuggestion(
      user.tenantId,
      user.branchId,
      cashierId,
      counterId || counterHeader || undefined,
    );
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

  @Get('wallets')
  @RequireAnyPermissions('cash:read', 'accounting:read')
  @ApiOperation({ summary: 'Cashier wallets not yet cleared into main cash' })
  listWallets(@CurrentUser() user: IAuthUser) {
    return this.cashService.listCashierWallets(user.tenantId, user.branchId);
  }

  @Post('wallets/clear-all')
  @RequireAnyPermissions('cash:update', 'accounting:create')
  @ApiOperation({ summary: 'Day end: clear every cashier wallet into main cash' })
  clearAllWallets(@CurrentUser() user: IAuthUser) {
    return this.cashService.clearAllCashierWallets(user.tenantId, user.branchId, user.id, user.roles ?? []);
  }

  @Post('wallets/:id/clear')
  @RequireAnyPermissions('cash:update', 'accounting:create')
  @ApiOperation({ summary: 'Clear one cashier wallet into main cash' })
  clearWallet(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: ClearWalletDto) {
    return this.cashService.clearCashierWallet(user.tenantId, user.branchId, id, user.id, user.roles ?? [], dto);
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
  closeShift(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body() dto: CloseCashRegisterDto,
    @Headers('x-pos-cashier-token') unlockToken?: string,
  ) {
    const actingCashierId = resolveActingCashierId(user.tenantId, user.id, unlockToken);
    return this.cashService.closeRegister(id, user.tenantId, user.id, dto, {
      actingCashierId,
      roles: user.roles ?? [],
    });
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
  addMovement(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body() dto: CashMovementDto,
    @Headers('x-pos-cashier-token') unlockToken?: string,
    @Headers('x-cash-approval-token') approvalToken?: string,
  ) {
    return this.cashService.addMovement(
      id,
      user.tenantId,
      { user: { id: user.id, roles: user.roles ?? [] }, unlockToken, approvalToken },
      dto,
      { branchId: user.branchId },
    );
  }
}

@Module({
  imports: [WorkflowModule],
  controllers: [CashManagementController],
  providers: [CashManagementService, PinLockoutService],
  exports: [CashManagementService],
})
export class CashManagementModule {}
