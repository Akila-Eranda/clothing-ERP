import { textSearch } from '@/shared/search.helper';
import { Module } from '@nestjs/common';
import { Controller, Get, Post, Put, Delete, Body, Param, Query, HttpCode, HttpStatus, Headers } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Type } from 'class-transformer';
import { CashAuth, managerApprovalRequired, resolveCashActor } from '@/shared/security/cash-actor';
import { resolveOpenDrawerForCashier } from '@/shared/cash-register.helper';
import { CARD_LAST4_REQUIRED_MESSAGE, maskCardLast4, parseCardLast4 } from '@/shared/card-payment.helper';
import { NoCardNumber } from '@/shared/security/card-number.validator';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { IsString, IsOptional, IsEmail, IsEnum, IsNumber, IsDateString, IsArray, Min, IsInt, IsBoolean, Max, MaxLength, IsIn, NotEquals, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CustomerTier, Gender, NotificationChannel, CreditReminderStatus, PaymentMethod, RoleType, Prisma } from '@prisma/client';
import { validateCustomerBank } from '@/shared/customer-bank.helper';
import { Roles } from '@/common/decorators/roles.decorator';
import {
  assertFinancialAuthority,
  MAX_MANUAL_LOYALTY_ADJUST,
  MAX_MANUAL_WALLET_TOPUP,
} from '@/shared/security/financial-authority';
import { PrismaService } from '@/prisma/prisma.service';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { paginate, getPaginationArgs } from '@/shared/pagination.helper';
import * as dayjs from 'dayjs';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { assertShopModule } from '@/shared/shop-module.helper';
import { CustomerCreditService } from './customer-credit.service';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { withWhatsappConsent } from '@/modules/whatsapp/customer-payment-notification.helper';

export class CreateCustomerDto {
  @ApiProperty() @IsString() firstName: string;
  @ApiPropertyOptional() @IsOptional() @IsString() lastName?: string;
  @ApiProperty() @IsString() phone: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional({ enum: Gender }) @IsOptional() @IsEnum(Gender) gender?: Gender;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateOfBirth?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() anniversary?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(1_000_000_000) creditLimit?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(3650) creditDays?: number;
  @ApiPropertyOptional({ description: 'True only when the customer explicitly opted in to WhatsApp payment notifications' })
  @IsOptional() @IsBoolean() whatsappConsent?: boolean;
}

/** Profile edits only. Balances (wallet, loyalty, credit, totals), tier and tenant are never writable here. */
export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {}

/** Plain profile columns copied as-is on update (dates and credit limit are handled separately). */
const CUSTOMER_PROFILE_FIELDS = [
  'firstName', 'lastName', 'phone', 'email', 'gender', 'address', 'city', 'notes', 'tags', 'creditDays',
] as const;

export class CustomerCreditNoteDto {
  @ApiProperty() @IsNumber() @Min(0.01) @Max(MAX_MANUAL_WALLET_TOPUP) amount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) referenceId?: string;
}

/** FUNDED: the customer paid money into the wallet. GOODWILL: a non-cash credit given by the shop. */
export const WALLET_TOPUP_KINDS = ['FUNDED', 'GOODWILL'] as const;
export const WALLET_TOPUP_METHODS: string[] = [PaymentMethod.CASH, PaymentMethod.CARD, PaymentMethod.QR, PaymentMethod.BANK_TRANSFER];

export class WalletTopUpDto {
  @ApiProperty() @IsNumber() @Min(0.01) @Max(MAX_MANUAL_WALLET_TOPUP) amount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) @NoCardNumber() description?: string;
  /** FUNDED (default) needs the real payment method; GOODWILL is never cash received. */
  @ApiPropertyOptional({ enum: WALLET_TOPUP_KINDS }) @IsOptional() @IsIn([...WALLET_TOPUP_KINDS]) kind?: 'FUNDED' | 'GOODWILL';
  @ApiPropertyOptional({ enum: WALLET_TOPUP_METHODS }) @IsOptional() @IsIn(WALLET_TOPUP_METHODS) paymentMethod?: PaymentMethod;
  /** CARD: exactly the last 4 digits (only those are kept). */
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(4) cardLast4?: string;
  /** QR / BANK_TRANSFER: the shop bank account the money went into. */
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) bankAccountId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) @NoCardNumber() reference?: string;
}

export class LoyaltyAdjustDto {
  /** Positive to add, negative to deduct. */
  @ApiProperty() @IsInt() @Min(-MAX_MANUAL_LOYALTY_ADJUST) @Max(MAX_MANUAL_LOYALTY_ADJUST) @NotEquals(0) points: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;
}

export const CREDIT_PAYMENT_METHODS = [
  PaymentMethod.CASH,
  PaymentMethod.CARD,
  PaymentMethod.UPI,
  PaymentMethod.QR,
  PaymentMethod.BANK_TRANSFER,
  PaymentMethod.CHEQUE,
] as const;

export class CreditPaymentDto {
  @ApiProperty() @IsNumber() @Min(0.01) amount: number;
  @ApiProperty({ description: 'Stable idempotency key reused when retrying the same payment' })
  @IsString() @Matches(/^[A-Za-z0-9_-]{8,64}$/) clientRequestId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;
  @ApiPropertyOptional({ enum: [...CREDIT_PAYMENT_METHODS, PaymentMethod.WALLET] })
  @IsOptional() @IsIn([...CREDIT_PAYMENT_METHODS, PaymentMethod.WALLET]) paymentMethod?: PaymentMethod;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) @NoCardNumber() reference?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() applyFromWallet?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) chequeNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) chequeBankName?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() chequeDueDate?: string;
  /** CARD settlements: exactly the last 4 digits (never the full card number or CVV). */
  @ApiPropertyOptional({ example: '1234' }) @IsOptional() @IsString() @MaxLength(4) cardLast4?: string;
}

export class CreditLimitDto {
  @ApiProperty() @IsNumber() @Min(0) @Max(1_000_000_000) creditLimit: number;
}

export class CustomerHistoryQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 50;
  @ApiPropertyOptional({ maxLength: 256 })
  @IsOptional() @IsString() @MaxLength(256) cursor?: string;
  @ApiPropertyOptional({ enum: ['true'] })
  @IsOptional() @IsIn(['true']) recent?: 'true';
}

export class CreditDaysDto {
  @ApiProperty() @IsInt() @Min(0) @Max(3650) creditDays: number;
}

export class CreateCreditScheduleDto {
  @ApiProperty() @IsString() customerId: string;
  @ApiProperty() @IsNumber() @Min(0.01) totalAmount: number;
  @ApiProperty() @IsInt() @Min(1) installmentCount: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) intervalDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() chargeTxnId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CreateCreditReminderDto {
  @ApiProperty() @IsString() customerId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() message?: string;
  @ApiPropertyOptional({ enum: NotificationChannel }) @IsOptional() @IsEnum(NotificationChannel) channel?: NotificationChannel;
  @ApiPropertyOptional() @IsOptional() @IsString() chargeTxnId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() sendNow?: boolean;
}

export class CustomerBankDetailsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) bankName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) accountNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) accountHolderName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) branchName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) branchCode?: string;
}

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credit: CustomerCreditService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private async assertCustomer(id: string, tenantId: string) {
    const c = await this.prisma.customer.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!c) throw new NotFoundException('Customer not found');
  }

  /** Bank details of a customer (null when none were entered). Admin screens only. */
  async getBankDetails(id: string, tenantId: string) {
    await this.assertCustomer(id, tenantId);
    const row = await this.prisma.customerBankDetail.findFirst({ where: { customerId: id, tenantId } });
    return row
      ? { bankName: row.bankName, accountNumber: row.accountNumber, accountHolderName: row.accountHolderName, branchName: row.branchName, branchCode: row.branchCode, updatedAt: row.updatedAt }
      : null;
  }

  /**
   * Saves (or, when every field is empty, removes) the customer's bank details. The audit interceptor logs the
   * request with the account number redacted (accountNumber is a sensitive audit key).
   */
  async saveBankDetails(id: string, tenantId: string, userId: string, dto: CustomerBankDetailsDto) {
    await this.assertCustomer(id, tenantId);
    const empty = [dto.bankName, dto.accountNumber, dto.accountHolderName, dto.branchName, dto.branchCode].every((v) => !(v ?? '').trim());
    if (empty) {
      await this.prisma.customerBankDetail.deleteMany({ where: { customerId: id, tenantId } });
      return null;
    }
    const checked = validateCustomerBank(dto);
    if (!checked.ok) throw new BadRequestException(checked.error);
    const v = checked.value;
    const row = await this.prisma.customerBankDetail.upsert({
      where: { customerId: id },
      create: { tenantId, customerId: id, ...v, updatedById: userId },
      update: { ...v, updatedById: userId },
    });
    return { bankName: row.bankName, accountNumber: row.accountNumber, accountHolderName: row.accountHolderName, branchName: row.branchName, branchCode: row.branchCode, updatedAt: row.updatedAt };
  }

  async create(tenantId: string, dto: CreateCustomerDto, actorRoles: string[] = []) {
    // Opening a customer with credit is the same decision as raising a limit later.
    if ((dto.creditLimit ?? 0) > 0) assertFinancialAuthority(actorRoles, 'Setting a credit limit');
    const existing = await this.prisma.customer.findFirst({ where: { tenantId, phone: dto.phone } });
    if (existing) return existing;

    const code = `CUST-${Date.now().toString(36).toUpperCase()}`;
    const referralCode = `REF${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    return this.prisma.customer.create({
      data: {
        tenantId, code, referralCode,
        firstName: dto.firstName, lastName: dto.lastName,
        phone: dto.phone, email: dto.email,
        gender: dto.gender,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        anniversary: dto.anniversary ? new Date(dto.anniversary) : undefined,
        address: dto.address, city: dto.city,
        notes: dto.notes, tags: dto.tags ?? [],
        creditLimit: dto.creditLimit ?? 0,
        creditDays: dto.creditDays ?? 30,
        ...(dto.whatsappConsent !== undefined
          ? { metadata: withWhatsappConsent({}, dto.whatsappConsent) }
          : {}),
      },
    });
  }

  async findAll(tenantId: string, query: PaginationDto & { tier?: CustomerTier }) {
    const { skip, take } = getPaginationArgs(query.page, query.limit);
    const where = {
      tenantId,
      ...(query.tier && { tier: query.tier }),
      ...textSearch(query.search, ['firstName', 'lastName', 'phone', 'email', 'code']),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({ where, skip, take, orderBy: { totalSpent: 'desc' } }),
      this.prisma.customer.count({ where }),
    ]);

    return paginate(data, total, query.page ?? 1, query.limit ?? 20);
  }

  async findOne(id: string, tenantId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, tenantId },
      include: {
        loyaltyTxns: { orderBy: { createdAt: 'desc' }, take: 10 },
        walletTxns: { orderBy: { createdAt: 'desc' }, take: 10 },
        creditTxns: { orderBy: { createdAt: 'desc' }, take: 20 },
        sales: {
          where: { isReturn: false },
          orderBy: { invoiceDate: 'desc' },
          select: {
            id: true,
            invoiceNumber: true,
            invoiceDate: true,
            total: true,
            amountPaid: true,
            paymentStatus: true,
            status: true,
            payments: { select: { method: true, amount: true } },
            _count: { select: { items: true } },
            items: {
              select: {
                productName: true,
                variantName: true,
                quantity: true,
                total: true,
                variantId: true,
              },
            },
          },
        },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const productMap = new Map<string, { productName: string; qty: number; spent: number; variantId: string }>();
    for (const sale of customer.sales) {
      for (const item of sale.items) {
        const key = item.variantId || item.productName;
        const prev = productMap.get(key);
        if (prev) {
          prev.qty += item.quantity;
          prev.spent += item.total;
        } else {
          productMap.set(key, {
            productName: item.productName,
            qty: item.quantity,
            spent: item.total,
            variantId: item.variantId ?? '',
          });
        }
      }
    }
    const topProducts = [...productMap.values()]
      .sort((a, b) => b.qty - a.qty || b.spent - a.spent)
      .slice(0, 8);

    const outstandingSales = customer.sales
      .filter((s) => s.paymentStatus === 'PENDING')
      .map((s) => ({
        ...s,
        balanceDue: Math.max(0, Math.round((s.total - (s.amountPaid ?? 0)) * 100) / 100),
      }));

    return {
      ...customer,
      topProducts,
      outstandingSales,
      creditAvailable: Math.max(0, customer.creditLimit - customer.creditBalance),
    };
  }

  async findByPhone(phone: string, tenantId: string) {
    return this.prisma.customer.findFirst({ where: { phone, tenantId } });
  }

  async update(id: string, tenantId: string, dto: UpdateCustomerDto, actorRoles: string[] = []) {
    const customer = await this.findOne(id, tenantId);
    const data: Record<string, unknown> = {};
    for (const key of CUSTOMER_PROFILE_FIELDS) {
      if (dto[key] !== undefined) data[key] = dto[key];
    }
    if (dto.dateOfBirth !== undefined) data.dateOfBirth = dto.dateOfBirth ? new Date(dto.dateOfBirth) : null;
    if (dto.anniversary !== undefined) data.anniversary = dto.anniversary ? new Date(dto.anniversary) : null;
    if (dto.whatsappConsent !== undefined) {
      data.metadata = withWhatsappConsent(customer.metadata, dto.whatsappConsent);
    }
    if (dto.creditLimit !== undefined && Math.abs(dto.creditLimit - customer.creditLimit) > 0.001) {
      assertFinancialAuthority(actorRoles, 'Changing a credit limit');
      if (dto.creditLimit < customer.creditBalance) {
        throw new BadRequestException('Credit limit cannot be less than outstanding balance');
      }
      data.creditLimit = dto.creditLimit;
    }
    return this.prisma.customer.update({ where: { id: customer.id }, data });
  }

  async receiveCreditPayment(
    id: string,
    tenantId: string,
    amount: number,
    description: string,
    opts?: {
      paymentMethod?: string;
      branchId?: string;
      userId?: string;
      clientRequestId?: string;
      reference?: string;
      applyFromWallet?: boolean;
      chequeNumber?: string;
      chequeBankName?: string;
      chequeDueDate?: string;
      cardLast4?: string;
    },
  ) {
    return this.credit.receiveCreditPayment(id, tenantId, amount, description, opts);
  }

  async setCreditLimit(id: string, tenantId: string, creditLimit: number) {
    if (creditLimit < 0) throw new BadRequestException('Credit limit cannot be negative');
    const customer = await this.findOne(id, tenantId);
    if (creditLimit < customer.creditBalance) {
      throw new BadRequestException('Credit limit cannot be less than outstanding balance');
    }
    return this.prisma.customer.update({ where: { id }, data: { creditLimit } });
  }

  async setCreditDays(id: string, tenantId: string, creditDays: number) {
    if (creditDays < 0) throw new BadRequestException('creditDays cannot be negative');
    await this.findOne(id, tenantId);
    return this.prisma.customer.update({
      where: { id },
      data: { creditDays: Math.floor(creditDays) },
    });
  }

  /**
   * Manual wallet top-up, always with manager authority (a manager acting, or a manager PIN approval):
   * - FUNDED: the customer paid. The real payment method is recorded; cash goes into the acting cashier's
   *   open drawer (or main cash when none is open), and the ledger posts Dr tender / Cr 2400.
   * - GOODWILL: a non-cash credit from the shop. Posted Dr Customer Goodwill Credits / Cr 2400 — never as
   *   cash received, never into a drawer.
   */
  async topUpWallet(
    id: string,
    tenantId: string,
    dto: WalletTopUpDto,
    auth: CashAuth,
    opts: { branchId?: string | null; counterId?: string | null } = {},
  ) {
    const customer = await this.findOne(id, tenantId);
    const actor = await resolveCashActor(this.prisma, { tenantId, ...auth });
    const kind = dto.kind ?? 'FUNDED';
    const amount = Math.round(dto.amount * 100) / 100;
    if (!actor.authorizerId) {
      throw managerApprovalRequired(
        kind === 'GOODWILL' ? 'A goodwill wallet credit needs a manager PIN approval' : 'A manual wallet top-up needs a manager PIN approval',
      );
    }
    let method: PaymentMethod | null = null;
    let cardNote = '';
    let bankAccountId: string | null = null;
    if (kind === 'FUNDED') {
      if (!dto.paymentMethod) throw new BadRequestException('Select how the customer paid (cash, card, QR or bank transfer)');
      method = dto.paymentMethod;
      if (method === PaymentMethod.CARD) {
        const last4 = parseCardLast4(dto.cardLast4);
        if (!last4) throw new BadRequestException(CARD_LAST4_REQUIRED_MESSAGE);
        cardNote = ` · Card ${maskCardLast4(last4)}`;
      }
      if (method === PaymentMethod.QR || method === PaymentMethod.BANK_TRANSFER) {
        const bank = dto.bankAccountId
          ? await this.prisma.bankAccount.findFirst({ where: { id: dto.bankAccountId, tenantId, isActive: true }, select: { id: true } })
          : null;
        if (!bank) throw new BadRequestException('Select the bank account the money was paid into');
        bankAccountId = bank.id;
      }
    } else if (dto.paymentMethod || dto.cardLast4 || dto.bankAccountId) {
      throw new BadRequestException('A goodwill credit is not a payment: do not enter a payment method');
    }

    const label = kind === 'GOODWILL' ? 'Goodwill wallet credit' : `Wallet top-up · ${method}${cardNote}`;
    const description = [label, dto.description?.trim(), dto.reference?.trim() ? `Ref ${dto.reference.trim()}` : '']
      .filter(Boolean)
      .join(' · ');

    const txn = await this.prisma.$transaction(async (tx) => {
      await tx.customer.update({ where: { id }, data: { walletBalance: { increment: amount } } });
      const created = await tx.walletTransaction.create({
        data: {
          customerId: id,
          tenantId,
          amount,
          type: kind === 'GOODWILL' ? 'GOODWILL_CREDIT' : 'TOPUP',
          paymentMethod: method,
          authorizedById: actor.authorizerId,
          // QR / bank top-ups keep the shop bank account here (for the ledger); nothing else is stored
          referenceId: bankAccountId,
          description,
        },
      });
      // Cash physically received at the till goes into that cashier's open drawer (like a cash sale).
      if (method === PaymentMethod.CASH && opts.branchId) {
        const drawer = await resolveOpenDrawerForCashier(tx, tenantId, opts.branchId, actor.actorId);
        if (drawer) {
          await tx.cashMovement.create({
            data: {
              tenantId,
              registerId: drawer.id,
              type: 'SALE',
              amount,
              reference: created.id,
              description: `Wallet top-up · ${customer.firstName}`,
              createdById: actor.actorId,
              authorizedById: actor.authorizerId,
            },
          });
        }
      }
      return created;
    });

    this.eventEmitter.emit('accounting.wallet.topup', {
      tenantId,
      walletTxnId: txn.id,
      branchId: opts.branchId ?? undefined,
      userId: actor.actorId,
    });
    return {
      walletBalance: Math.round((customer.walletBalance + amount) * 100) / 100,
      transactionId: txn.id,
      kind,
      paymentMethod: method,
      authorizedById: actor.authorizerId,
    };
  }

  async addLoyaltyPoints(id: string, tenantId: string, points: number, description: string) {
    await assertShopModule(this.prisma, tenantId, 'loyalty');
    const customer = await this.findOne(id, tenantId);
    if (customer.loyaltyPoints + points < 0) {
      throw new BadRequestException(`Customer has only ${customer.loyaltyPoints} points`);
    }
    return this.prisma.$transaction([
      this.prisma.customer.update({ where: { id: customer.id }, data: { loyaltyPoints: { increment: points } } }),
      this.prisma.loyaltyTransaction.create({
        data: { customerId: id, tenantId, points, type: 'MANUAL', description },
      }),
    ]);
  }

  async updateTier(tenantId: string) {
    const customers = await this.prisma.customer.findMany({ where: { tenantId } });
    for (const customer of customers) {
      let tier: CustomerTier = CustomerTier.BRONZE;
      if (customer.totalSpent >= 500000) tier = CustomerTier.DIAMOND;
      else if (customer.totalSpent >= 200000) tier = CustomerTier.PLATINUM;
      else if (customer.totalSpent >= 100000) tier = CustomerTier.GOLD;
      else if (customer.totalSpent >= 25000) tier = CustomerTier.SILVER;
      if (customer.tier !== tier) {
        await this.prisma.customer.update({ where: { id: customer.id }, data: { tier } });
      }
    }
  }

  async getSegments(tenantId: string) {
    const thirtyDaysAgo = dayjs().subtract(30, 'day').toDate();
    const ninetyDaysAgo = dayjs().subtract(90, 'day').toDate();

    const [tiers, highValue, dormant, newCustomers, creditOwing, totalCustomers] = await Promise.all([
      this.prisma.customer.groupBy({
        by: ['tier'],
        where: { tenantId },
        _count: { id: true },
        _sum: { totalSpent: true, loyaltyPoints: true },
      }),
      this.prisma.customer.count({ where: { tenantId, totalSpent: { gte: 100000 } } }),
      this.prisma.customer.count({
        where: {
          tenantId,
          OR: [
            { lastPurchaseAt: { lt: ninetyDaysAgo } },
            { lastPurchaseAt: null, createdAt: { lt: ninetyDaysAgo } },
          ],
        },
      }),
      this.prisma.customer.count({ where: { tenantId, createdAt: { gte: thirtyDaysAgo } } }),
      this.prisma.customer.count({ where: { tenantId, creditBalance: { gt: 0 } } }),
      this.prisma.customer.count({ where: { tenantId } }),
    ]);

    const activeRecent = totalCustomers - dormant;

    return {
      tiers,
      segments: [
        { key: 'HIGH_VALUE', label: 'High Value (100k+)', count: highValue },
        { key: 'ACTIVE', label: 'Active (90d)', count: activeRecent },
        { key: 'DORMANT', label: 'Dormant (90d+)', count: dormant },
        { key: 'NEW', label: 'New (30d)', count: newCustomers },
        { key: 'CREDIT', label: 'Credit Outstanding', count: creditOwing },
      ],
      totalCustomers,
    };
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    return this.prisma.customer.delete({ where: { id } });
  }
}

@ApiTags('Customers')
@ApiBearerAuth('access-token')
@Controller({ path: 'customers', version: '1' })
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly creditService: CustomerCreditService,
  ) {}

  @Post()
  @RequirePermissions('customers:create')
  create(@CurrentUser() user: IAuthUser, @Body() dto: CreateCustomerDto) {
    return this.customersService.create(user.tenantId, dto, user.roles);
  }

  @Get()
  @RequirePermissions('customers:read')
  findAll(@CurrentUser() user: IAuthUser, @Query() query: PaginationDto & { tier?: CustomerTier }) {
    return this.customersService.findAll(user.tenantId, query);
  }

  @Get('segments')
  @RequirePermissions('customers:read')
  getSegments(@CurrentUser() user: IAuthUser) {
    return this.customersService.getSegments(user.tenantId);
  }

  @Get('credit/customers')
  @RequirePermissions('customers:read')
  @ApiOperation({ summary: 'List credit customers with due dates' })
  listCreditCustomers(@CurrentUser() user: IAuthUser) {
    return this.creditService.listCreditCustomers(user.tenantId);
  }

  @Get('credit/schedules')
  @RequirePermissions('customers:read')
  @ApiOperation({ summary: 'List payment schedules' })
  listSchedules(@CurrentUser() user: IAuthUser, @Query('customerId') customerId?: string) {
    return this.creditService.listSchedules(user.tenantId, customerId);
  }

  @Post('credit/schedules')
  @RequirePermissions('customers:update')
  @ApiOperation({ summary: 'Create installment payment schedule' })
  createSchedule(@CurrentUser() user: IAuthUser, @Body() dto: CreateCreditScheduleDto) {
    return this.creditService.createPaymentSchedule(user.tenantId, user.id, dto);
  }

  @Post('credit/schedules/:id/cancel')
  @RequirePermissions('customers:update')
  @ApiOperation({ summary: 'Cancel an active installment schedule' })
  cancelSchedule(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.creditService.cancelSchedule(id, user.tenantId);
  }

  @Get('credit/reminders')
  @RequirePermissions('customers:read')
  @ApiOperation({ summary: 'List credit payment reminders' })
  listReminders(@CurrentUser() user: IAuthUser, @Query('status') status?: CreditReminderStatus) {
    return this.creditService.listReminders(user.tenantId, status);
  }

  @Post('credit/reminders')
  @RequirePermissions('customers:update')
  @ApiOperation({ summary: 'Create / send credit reminder' })
  createReminder(@CurrentUser() user: IAuthUser, @Body() dto: CreateCreditReminderDto) {
    return this.creditService.createReminder(user.tenantId, user.id, dto);
  }

  @Post('credit/reminders/queue-overdue')
  @RequirePermissions('customers:update')
  @ApiOperation({ summary: 'Queue reminders for all overdue credit customers' })
  queueOverdue(@CurrentUser() user: IAuthUser) {
    return this.creditService.queueOverdueReminders(user.tenantId, user.id);
  }

  @Post('credit/reminders/:id/send')
  @RequirePermissions('customers:update')
  @ApiOperation({ summary: 'Send a pending credit reminder' })
  sendReminder(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.creditService.sendReminder(id, user.tenantId, user.id);
  }

  @Get('credit/collection-report')
  @RequirePermissions('customers:read')
  @ApiOperation({ summary: 'Collection report for date range' })
  collectionReport(
    @CurrentUser() user: IAuthUser,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    const start = startDate ?? dayjs().startOf('month').format('YYYY-MM-DD');
    const end = endDate ?? dayjs().format('YYYY-MM-DD');
    return this.creditService.collectionReport(user.tenantId, start, end);
  }

  @Get('credit/ar-dashboard')
  @RequirePermissions('customers:read')
  @ApiOperation({ summary: 'AR receivable dashboard KPIs + aging' })
  arDashboard(@CurrentUser() user: IAuthUser, @Query('asOfDate') asOfDate?: string) {
    return this.creditService.getArDashboard(user.tenantId, asOfDate);
  }

  @Get('credit/payments')
  @RequirePermissions('customers:read')
  @ApiOperation({ summary: 'List customer credit payments in date range' })
  listCreditPayments(
    @CurrentUser() user: IAuthUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('customerId') customerId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.creditService.listPayments(user.tenantId, {
      startDate,
      endDate,
      customerId,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('phone/:phone')
  @ApiOperation({ summary: 'Find customer by phone (POS lookup)' })
  findByPhone(@CurrentUser() user: IAuthUser, @Param('phone') phone: string) {
    return this.customersService.findByPhone(phone, user.tenantId);
  }

  @Get(':id/credit/ledger')
  @RequirePermissions('customers:read')
  @ApiOperation({ summary: 'Customer AR ledger with running balance' })
  customerLedger(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.creditService.getCustomerLedger(id, user.tenantId, startDate, endDate);
  }

  @Get(':id/transaction-history')
  @RequirePermissions('customers:read')
  @ApiOperation({ summary: 'Paginated customer transaction history' })
  customerTransactionHistory(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Query() query: CustomerHistoryQueryDto,
  ) {
    return this.creditService.getCustomerTransactionHistory(
      id,
      user.tenantId,
      user.branchId,
      query.limit,
      query.cursor,
      query.recent === 'true',
    );
  }

  @Get(':id/credit/statement')
  @RequirePermissions('customers:read')
  @ApiOperation({ summary: 'Customer statement (printable AR statement)' })
  customerStatement(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.creditService.getCustomerStatement(id, user.tenantId, startDate, endDate);
  }

  @Get(':id/credit/transactions')
  @RequirePermissions('customers:read')
  @ApiOperation({ summary: 'List customer credit transactions (charges/payments/notes)' })
  customerCreditTxns(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Query('type') type?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.creditService.listCustomerCreditTransactions(id, user.tenantId, {
      type,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Post(':id/credit/credit-notes')
  @RequirePermissions('customers:update')
  @ApiOperation({ summary: 'Issue manual credit note against AR' })
  createCreditNote(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body() body: CustomerCreditNoteDto,
  ) {
    assertFinancialAuthority(user.roles, 'Issuing a credit note');
    return this.creditService.createCreditNote(id, user.tenantId, body);
  }

  @Get(':id/bank-details')
  @Roles(RoleType.TENANT_ADMIN, RoleType.SUPER_ADMIN)
  @RequirePermissions('customers:read')
  @ApiOperation({ summary: 'Customer bank account details (admins only)' })
  getBankDetails(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.customersService.getBankDetails(id, user.tenantId);
  }

  @Put(':id/bank-details')
  @Roles(RoleType.TENANT_ADMIN, RoleType.SUPER_ADMIN)
  @RequirePermissions('customers:update')
  @ApiOperation({ summary: 'Save customer bank account details (admins only; all fields empty removes them)' })
  saveBankDetails(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: CustomerBankDetailsDto) {
    return this.customersService.saveBankDetails(id, user.tenantId, user.id, dto);
  }

  @Get(':id')
  @RequirePermissions('customers:read')
  findOne(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.customersService.findOne(id, user.tenantId);
  }

  @Put(':id')
  @RequirePermissions('customers:update')
  update(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customersService.update(id, user.tenantId, dto, user.roles);
  }

  @Post(':id/wallet/topup')
  @RequirePermissions('customers:update')
  topUpWallet(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body() body: WalletTopUpDto,
    @Headers('x-pos-cashier-token') unlockToken?: string,
    @Headers('x-cash-approval-token') approvalToken?: string,
    @Headers('x-pos-counter-id') counterId?: string,
  ) {
    // Manager authority comes from the person acting or a manager PIN approval, never the terminal login.
    return this.customersService.topUpWallet(
      id,
      user.tenantId,
      body,
      { user: { id: user.id, roles: user.roles ?? [] }, unlockToken, approvalToken },
      { branchId: user.branchId, counterId },
    );
  }

  @Post(':id/loyalty/add')
  @RequirePermissions('customers:update')
  addLoyaltyPoints(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() body: LoyaltyAdjustDto) {
    assertFinancialAuthority(user.roles, 'Manual loyalty adjustment');
    return this.customersService.addLoyaltyPoints(
      id,
      user.tenantId,
      body.points,
      `${body.description ?? 'Manual adjustment'} (by ${user.email})`,
    );
  }

  @Post(':id/credit/payment')
  @RequirePermissions('customers:update')
  @ApiOperation({ summary: 'Receive payment against customer credit (overpay → wallet advance)' })
  receiveCreditPayment(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body() body: CreditPaymentDto,
  ) {
    return this.customersService.receiveCreditPayment(
      id,
      user.tenantId,
      body.amount,
      body.description ?? 'Credit payment received',
      {
        paymentMethod: body.paymentMethod,
        applyFromWallet: body.applyFromWallet,
        clientRequestId: body.clientRequestId,
        reference: body.reference,
        branchId: user.branchId,
        userId: user.id,
        chequeNumber: body.chequeNumber,
        chequeBankName: body.chequeBankName,
        cardLast4: body.cardLast4,
        chequeDueDate: body.chequeDueDate,
      },
    );
  }

  @Put(':id/credit/limit')
  @RequirePermissions('customers:update')
  @ApiOperation({ summary: 'Set customer credit limit' })
  setCreditLimit(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() body: CreditLimitDto) {
    assertFinancialAuthority(user.roles, 'Changing a credit limit');
    return this.customersService.setCreditLimit(id, user.tenantId, body.creditLimit);
  }

  @Put(':id/credit/days')
  @RequirePermissions('customers:update')
  @ApiOperation({ summary: 'Set customer credit payment terms (days)' })
  setCreditDays(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() body: CreditDaysDto) {
    return this.customersService.setCreditDays(id, user.tenantId, body.creditDays);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('customers:delete')
  remove(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.customersService.remove(id, user.tenantId);
  }
}

@Module({
  imports: [NotificationsModule],
  controllers: [CustomersController],
  providers: [CustomersService, CustomerCreditService],
  exports: [CustomersService, CustomerCreditService],
})
export class CustomersModule {}
