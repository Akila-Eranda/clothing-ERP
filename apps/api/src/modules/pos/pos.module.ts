import { Module } from '@nestjs/common';
import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { IsString, IsOptional, IsNumber, IsEnum, IsArray, IsInt, Min, ValidateNested, IsBoolean, IsObject, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PaymentMethod, SaleStatus, StockMovementType, PaymentStatus, CashRegisterStatus, GiftVoucherStatus } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { InventoryService } from '@/modules/inventory/inventory.module';
import { InventoryModule } from '@/modules/inventory/inventory.module';
import { assertShopModule } from '@/shared/shop-module.helper';
import { tierDiscountAmount, computePromotionDiscount, buildPaymentsSummary } from './pos-sale.helpers';
import { applyGiftVoucherRedeem, computeHelperCommission, generateGiftVoucherCode } from './pos-phase6.helper';
import { assertCreditAvailable } from '@/modules/customers/customer-credit.helper';
import { computeChargeDueDate } from '@/modules/customers/customer-credit.helper';
import { nanoid } from 'nanoid';
import { recordSaleCashMovement, findOpenRegister, summarizeMovements, computeExpectedCashFromMovements, netCashFromSalePayments } from '@/shared/cash-register.helper';
import { canViewAllPosSales } from '@/shared/pos-sales-scope.helper';
import * as dayjs from 'dayjs';

export class ReturnItemDto {
  @ApiProperty() @IsString() variantId: string;
  @ApiProperty() @IsInt() @Min(1) quantity: number;
  @ApiProperty() @IsNumber() unitPrice: number;
  @ApiProperty() @IsString() productName: string;
  @ApiProperty() @IsString() variantName: string;
  @ApiProperty() @IsString() sku: string;
}

export class ReturnSaleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() originalSaleId?: string;
  @ApiProperty({ type: [ReturnItemDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => ReturnItemDto) items: ReturnItemDto[];
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() refundMethod?: string;
}

export class SaleItemDto {
  @ApiProperty() @IsString() variantId: string;
  @ApiProperty() @IsInt() @Min(1) quantity: number;
  @ApiProperty() @IsNumber() @Min(0) unitPrice: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) discount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() discountType?: string;
  @ApiProperty() @IsNumber() @Min(0) costPrice: number;
  @ApiProperty() @IsString() productName: string;
  @ApiProperty() @IsString() variantName: string;
  @ApiProperty() @IsString() sku: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() taxRate?: number;
}

export class SalePaymentDto {
  @ApiProperty({ enum: PaymentMethod }) @IsEnum(PaymentMethod) method: PaymentMethod;
  @ApiProperty() @IsNumber() @Min(0) amount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() reference?: string;
}

export class CreateSaleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() customerId?: string;
  @ApiProperty({ type: [SaleItemDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => SaleItemDto) items: SaleItemDto[];
  @ApiProperty({ type: [SalePaymentDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => SalePaymentDto) payments: SalePaymentDto[];
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) discountAmount?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) loyaltyPointsToRedeem?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() couponCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() heldBillId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowPartialPayment?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() applyTierDiscount?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() helperEmployeeId?: string;
}

export class IssueGiftVoucherDto {
  @ApiProperty() @IsNumber() @Min(1) amount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() code?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() issuedToName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() issuedToCustomerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() expiresAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class HoldBillDto {
  @ApiPropertyOptional() @IsOptional() @IsString() label?: string;
  @ApiProperty() @IsObject() data: Record<string, unknown>;
}

@Injectable()
export class PosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async resolveBranchId(tenantId: string, branchId: string): Promise<string> {
    if (branchId) return branchId;
    const branch = await this.prisma.branch.findFirst({ where: { tenantId }, select: { id: true } });
    if (!branch) throw new NotFoundException('No branch found for this tenant');
    return branch.id;
  }

  async createSale(tenantId: string, branchId: string, cashierId: string, dto: CreateSaleDto) {
    const resolvedBranchId = await this.resolveBranchId(tenantId, branchId);
    branchId = resolvedBranchId;
    const invoiceNumber = await this.generateInvoiceNumber(tenantId);

    const subtotal = dto.items.reduce((sum, item) => {
      const lineTotal = item.unitPrice * item.quantity;
      const discount = item.discountType === 'PERCENTAGE'
        ? (lineTotal * (item.discount ?? 0)) / 100
        : (item.discount ?? 0);
      return sum + lineTotal - discount;
    }, 0);

    const taxAmount = dto.items.reduce((sum, item) => {
      const lineTotal = item.unitPrice * item.quantity;
      const discount = item.discountType === 'PERCENTAGE'
        ? (lineTotal * (item.discount ?? 0)) / 100
        : (item.discount ?? 0);
      const taxable = lineTotal - discount;
      return sum + (taxable * (item.taxRate ?? 0)) / 100;
    }, 0);

    let couponDiscount = 0;
    let promotionId: string | null = null;
    if (dto.couponCode?.trim()) {
      const promoResult = await this.resolveCouponDiscount(tenantId, dto.couponCode.trim(), subtotal);
      if (!promoResult.valid) throw new BadRequestException(promoResult.reason ?? 'Invalid coupon');
      couponDiscount = promoResult.discountAmount ?? 0;
      promotionId = promoResult.promotionId ?? null;
    }

    let tierDiscount = 0;
    let customerRecord: { id: string; loyaltyPoints: number; walletBalance: number; creditLimit: number; creditBalance: number; creditDays: number; tier: import('@prisma/client').CustomerTier } | null = null;
    if (dto.customerId) {
      customerRecord = await this.prisma.customer.findFirst({
        where: { id: dto.customerId, tenantId },
        select: { id: true, loyaltyPoints: true, walletBalance: true, creditLimit: true, creditBalance: true, creditDays: true, tier: true },
      });
      if (!customerRecord) throw new BadRequestException('Customer not found');
      if (dto.applyTierDiscount !== false) {
        tierDiscount = tierDiscountAmount(subtotal, customerRecord.tier);
      }
    }

    const manualDiscount = dto.discountAmount ?? 0;
    const totalDiscount = manualDiscount + couponDiscount + tierDiscount;
    const total = subtotal + taxAmount - totalDiscount;
    const roundOff = Math.round(total) - total;
    const finalTotal = total + roundOff;

    let loyaltyDiscount = 0;
    let pointsRedeemed = 0;
    let pointsEarned = 0;

    if (dto.customerId && dto.loyaltyPointsToRedeem) {
      await assertShopModule(this.prisma, tenantId, 'loyalty');
      if (customerRecord && customerRecord.loyaltyPoints >= dto.loyaltyPointsToRedeem) {
        loyaltyDiscount = dto.loyaltyPointsToRedeem * 0.1;
        pointsRedeemed = dto.loyaltyPointsToRedeem;
      }
    }

    const amountDue = Math.max(0, finalTotal - loyaltyDiscount);
    const totalPaid = dto.payments.reduce((s, p) => s + p.amount, 0);
    const walletPayments = dto.payments.filter((p) => p.method === PaymentMethod.WALLET);
    const walletTotal = walletPayments.reduce((s, p) => s + p.amount, 0);
    const creditPayments = dto.payments.filter((p) => p.method === PaymentMethod.CUSTOMER_CREDIT);
    const creditPayTotal = creditPayments.reduce((s, p) => s + p.amount, 0);

    if (walletTotal > 0) {
      if (!dto.customerId) throw new BadRequestException('Customer required for wallet payment');
      if (!customerRecord || customerRecord.walletBalance < walletTotal) {
        throw new BadRequestException('Insufficient wallet balance');
      }
    }

    if (creditPayTotal > 0 && !dto.customerId) {
      throw new BadRequestException('Customer required for credit payment');
    }

    const isPartial = totalPaid + 0.01 < amountDue;
    const partialCredit = isPartial ? amountDue - totalPaid : 0;
    const totalCreditCharge = creditPayTotal + partialCredit;

    if (totalCreditCharge > 0 && customerRecord) {
      assertCreditAvailable(customerRecord.creditLimit, customerRecord.creditBalance, totalCreditCharge);
    }

    if (isPartial && !dto.allowPartialPayment) {
      throw new BadRequestException(`Payment short by LKR ${(amountDue - totalPaid).toFixed(2)}. Enable partial payment or add more.`);
    }

    const changeDue = Math.max(0, totalPaid - amountDue);
    const paymentStatus = isPartial ? PaymentStatus.PENDING : PaymentStatus.COMPLETED;
    const paymentMethods = dto.payments.map((p) => p.method);

    let helperEmployeeId: string | undefined;
    let helperName: string | undefined;
    let helperCommission = 0;
    if (dto.helperEmployeeId) {
      const helper = await this.prisma.employee.findFirst({
        where: { id: dto.helperEmployeeId, tenantId, isActive: true },
        select: { id: true, firstName: true, lastName: true, commissionRate: true },
      });
      if (!helper) throw new BadRequestException('Helper employee not found');
      helperEmployeeId = helper.id;
      helperName = `${helper.firstName} ${helper.lastName}`.trim();
      helperCommission = computeHelperCommission(amountDue, helper.commissionRate ?? 0);
    }

    // Pre-validate gift voucher payments
    const giftPays = dto.payments.filter((p) => p.method === PaymentMethod.GIFT_VOUCHER);
    const giftUpdates: { id: string; applied: number; remainingBalance: number; status: GiftVoucherStatus }[] = [];
    for (const gp of giftPays) {
      const code = (gp.reference ?? '').trim().toUpperCase();
      if (!code) throw new BadRequestException('Gift voucher code required in payment reference');
      const voucher = await this.prisma.giftVoucher.findFirst({
        where: { tenantId, code, status: { in: [GiftVoucherStatus.ACTIVE, GiftVoucherStatus.PARTIALLY_USED] } },
      });
      if (!voucher) throw new BadRequestException(`Gift voucher not found: ${code}`);
      if (voucher.expiresAt && voucher.expiresAt < new Date()) {
        throw new BadRequestException(`Gift voucher expired: ${code}`);
      }
      const redeem = applyGiftVoucherRedeem(voucher.balance, gp.amount, gp.amount);
      if (!redeem.ok) throw new BadRequestException(redeem.reason);
      if (Math.abs(redeem.applied - gp.amount) > 0.02) {
        throw new BadRequestException(`Gift voucher ${code} can only apply LKR ${redeem.applied.toFixed(2)}`);
      }
      giftUpdates.push({
        id: voucher.id,
        applied: redeem.applied,
        remainingBalance: redeem.remainingBalance,
        status: redeem.status as GiftVoucherStatus,
      });
    }

    const sale = await this.prisma.$transaction(async (tx) => {
      await this.inventoryService.assertSaleStockAvailable(
        tenantId,
        branchId,
        dto.items,
        dto.heldBillId,
        tx,
      );

      const created = await tx.sale.create({
        data: {
          tenantId,
          branchId,
          customerId: dto.customerId,
          cashierId,
          helperEmployeeId,
          helperName,
          helperCommission,
          invoiceNumber,
          status: SaleStatus.COMPLETED,
          subtotal,
          discountAmount: totalDiscount,
          taxAmount,
          roundOff,
          loyaltyDiscount,
          total: amountDue,
          amountPaid: totalPaid,
          changeDue,
          paymentMethod: dto.payments[0]?.method ?? PaymentMethod.CASH,
          paymentStatus,
          pointsRedeemed,
          notes: dto.notes,
          couponCode: dto.couponCode?.trim().toUpperCase() || null,
          couponDiscount,
          metadata: {
            tierDiscount,
            paymentSummary: buildPaymentsSummary(paymentMethods),
            partialBalance: isPartial ? amountDue - totalPaid : 0,
            helperCommission,
          },
          items: {
            create: dto.items.map((item) => {
              const lineTotal = item.unitPrice * item.quantity;
              const discount = item.discountType === 'PERCENTAGE'
                ? (lineTotal * (item.discount ?? 0)) / 100
                : (item.discount ?? 0);
              const taxAmt = ((lineTotal - discount) * (item.taxRate ?? 0)) / 100;
              return {
                variantId: item.variantId,
                productName: item.productName,
                variantName: item.variantName,
                sku: item.sku,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                costPrice: item.costPrice,
                discount: item.discount ?? 0,
                discountType: item.discountType ?? 'FIXED',
                taxRate: item.taxRate ?? 0,
                taxAmount: taxAmt,
                total: lineTotal - discount + taxAmt,
              };
            }),
          },
          payments: {
            create: dto.payments.map((p) => ({
              method: p.method,
              amount: p.amount,
              reference: p.reference,
              status: paymentStatus,
            })),
          },
        },
        include: {
          items: true,
          payments: true,
          customer: true,
        },
      });

      for (const gu of giftUpdates) {
        await tx.giftVoucher.update({
          where: { id: gu.id },
          data: {
            balance: gu.remainingBalance,
            status: gu.status,
          },
        });
      }

      if (promotionId) {
        await tx.promotion.update({
          where: { id: promotionId },
          data: { usageCount: { increment: 1 } },
        });
      }

      if (dto.heldBillId) {
        await this.inventoryService.releaseReservations(tenantId, 'HELD_BILL', dto.heldBillId, true, tx);
      }

      for (const item of dto.items) {
        await this.inventoryService.adjustStock(tenantId, branchId, cashierId, {
          variantId: item.variantId,
          quantity: item.quantity,
          movementType: StockMovementType.SALE,
          referenceId: created.id,
          referenceType: 'Sale',
        }, tx);
      }

      if (dto.customerId && customerRecord) {
        pointsEarned = Math.floor(amountDue / 100);
        const creditIncrement = creditPayTotal + partialCredit;
        await tx.customer.update({
          where: { id: dto.customerId },
          data: {
            totalSpent: { increment: amountDue },
            totalOrders: { increment: 1 },
            loyaltyPoints: { increment: pointsEarned - pointsRedeemed },
            lastPurchaseAt: new Date(),
            ...(walletTotal > 0 ? { walletBalance: { decrement: walletTotal } } : {}),
            ...(creditIncrement > 0 ? { creditBalance: { increment: creditIncrement } } : {}),
          },
        });

        if (creditIncrement > 0) {
          await tx.customerCreditTransaction.create({
            data: {
              customerId: dto.customerId,
              tenantId,
              amount: creditIncrement,
              type: 'CHARGE',
              status: 'OPEN',
              paidAmount: 0,
              dueDate: computeChargeDueDate(new Date(), customerRecord.creditDays ?? 30),
              description: `POS sale ${invoiceNumber}`,
              referenceId: created.id,
            },
          });
        }

        if (walletTotal > 0) {
          await tx.walletTransaction.create({
            data: {
              customerId: dto.customerId,
              tenantId,
              amount: -walletTotal,
              type: 'SALE_DEBIT',
              description: `POS sale ${invoiceNumber}`,
              referenceId: created.id,
            },
          });
        }

        if (pointsEarned > 0) {
          await tx.loyaltyTransaction.create({
            data: {
              customerId: dto.customerId,
              tenantId,
              points: pointsEarned,
              type: 'EARNED',
              description: `Sale ${invoiceNumber}`,
              referenceId: created.id,
            },
          });
        }
        if (pointsRedeemed > 0) {
          await tx.loyaltyTransaction.create({
            data: {
              customerId: dto.customerId,
              tenantId,
              points: -pointsRedeemed,
              type: 'REDEEMED',
              description: `Sale ${invoiceNumber}`,
              referenceId: created.id,
            },
          });
        }
      }

      if (dto.heldBillId) {
        await tx.heldBill.delete({ where: { id: dto.heldBillId } }).catch(() => undefined);
      }

      return created;
    });

    this.eventEmitter.emit('pos.sale.completed', { saleId: sale.id, tenantId, branchId, total: amountDue });
    void recordSaleCashMovement(
      this.prisma,
      tenantId,
      branchId,
      cashierId,
      sale.id,
      invoiceNumber,
      dto.payments,
      changeDue,
    );
    return sale;
  }

  private async resolveCouponDiscount(tenantId: string, couponCode: string, orderAmount: number) {
    try {
      await assertShopModule(this.prisma, tenantId, 'promotions');
    } catch {
      return { valid: false as const, reason: 'Promotions module not enabled' };
    }
    const now = new Date();
    const promo = await this.prisma.promotion.findFirst({
      where: {
        tenantId,
        couponCode: couponCode.toUpperCase(),
        isActive: true,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gte: now } }],
      },
    });
    if (!promo) return { valid: false as const, reason: 'Coupon or gift voucher not found or expired' };
    if (promo.minOrderAmount > 0 && orderAmount < promo.minOrderAmount) {
      return { valid: false as const, reason: `Minimum order LKR ${promo.minOrderAmount} required` };
    }
    if (promo.usageLimit && promo.usageCount >= promo.usageLimit) {
      return { valid: false as const, reason: 'Voucher usage limit reached' };
    }
    const discountAmount = computePromotionDiscount(
      promo.discountType,
      promo.discountValue,
      orderAmount,
      promo.maxDiscount,
    );
    return { valid: true as const, discountAmount, promotionId: promo.id, name: promo.name };
  }

  async validateCoupon(tenantId: string, code: string, amount: number) {
    return this.resolveCouponDiscount(tenantId, code, amount);
  }

  async searchCustomers(tenantId: string, search?: string, limit = 20) {
    const take = Math.min(50, Math.max(1, limit));
    const q = search?.trim();
    return this.prisma.customer.findMany({
      where: {
        tenantId,
        isActive: true,
        ...(q && {
          OR: [
            { firstName: { contains: q, mode: 'insensitive' as const } },
            { lastName: { contains: q, mode: 'insensitive' as const } },
            { phone: { contains: q } },
            { email: { contains: q, mode: 'insensitive' as const } },
            { code: { contains: q, mode: 'insensitive' as const } },
          ],
        }),
      },
      take,
      orderBy: [{ lastPurchaseAt: 'desc' }, { updatedAt: 'desc' }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        tier: true,
        loyaltyPoints: true,
        walletBalance: true,
        creditLimit: true,
        creditBalance: true,
      },
    });
  }

  async getSales(
    tenantId: string,
    branchId: string,
    query: { page?: number; limit?: number; search?: string; date?: string },
    opts?: { cashierId?: string; scopeAll?: boolean },
  ) {
    const resolvedBranchId = await this.resolveBranchId(tenantId, branchId);
    const page  = parseInt(String(query.page  ?? 1),  10);
    const limit = parseInt(String(query.limit ?? 20), 10);
    const skip = (page - 1) * limit;
    const where = {
      tenantId,
      branchId: resolvedBranchId,
      ...(!opts?.scopeAll && opts?.cashierId ? { cashierId: opts.cashierId } : {}),
      ...(query.search && {
        OR: [
          { invoiceNumber: { contains: query.search, mode: 'insensitive' as const } },
          { customer: { phone: { contains: query.search } } },
        ],
      }),
      ...(query.date && {
        invoiceDate: {
          gte: dayjs(query.date).startOf('day').toDate(),
          lte: dayjs(query.date).endOf('day').toDate(),
        },
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.sale.findMany({
        where,
        skip,
        take: limit,
        include: { customer: true, cashier: true, payments: true, _count: { select: { items: true } } },
        orderBy: { invoiceDate: 'desc' },
      }),
      this.prisma.sale.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getSaleById(id: string, tenantId: string, opts?: { cashierId?: string; scopeAll?: boolean }) {
    const sale = await this.prisma.sale.findFirst({
      where: {
        id,
        tenantId,
        ...(!opts?.scopeAll && opts?.cashierId ? { cashierId: opts.cashierId } : {}),
      },
      include: {
        items: { include: { variant: { include: { product: true } } } },
        payments: true,
        customer: true,
        cashier: true,
      },
    });
    if (!sale) throw new NotFoundException('Sale not found');
    return sale;
  }

  async holdBill(tenantId: string, branchId: string, cashierId: string, dto: HoldBillDto) {
    const resolvedBranchId = await this.resolveBranchId(tenantId, branchId);
    const data = dto.data as { items?: { variantId: string; quantity: number }[] };

    return this.prisma.$transaction(async (tx) => {
      const bill = await tx.heldBill.create({
        data: { tenantId, branchId: resolvedBranchId, cashierId, label: dto.label, data: dto.data as object },
      });
      for (const item of data.items ?? []) {
        await this.inventoryService.reserveStock(
          tenantId,
          resolvedBranchId,
          item.variantId,
          item.quantity,
          'HELD_BILL',
          bill.id,
          cashierId,
          tx,
        );
      }
      return bill;
    });
  }

  async getHeldBills(tenantId: string, branchId: string, opts?: { cashierId?: string; scopeAll?: boolean }) {
    const resolvedBranchId = await this.resolveBranchId(tenantId, branchId);
    return this.prisma.heldBill.findMany({
      where: {
        tenantId,
        branchId: resolvedBranchId,
        ...(!opts?.scopeAll && opts?.cashierId ? { cashierId: opts.cashierId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteHeldBill(id: string, tenantId: string, opts?: { cashierId?: string; scopeAll?: boolean }) {
    const bill = await this.prisma.heldBill.findFirst({
      where: {
        id,
        tenantId,
        ...(!opts?.scopeAll && opts?.cashierId ? { cashierId: opts.cashierId } : {}),
      },
    });
    if (!bill) throw new NotFoundException('Held bill not found');
    await this.inventoryService.releaseReservations(tenantId, 'HELD_BILL', id);
    return this.prisma.heldBill.delete({ where: { id } });
  }

  async getDailySummary(
    tenantId: string,
    branchId: string,
    date?: string,
    opts?: { cashierId?: string; scopeAll?: boolean },
  ) {
    const resolvedBranchId = await this.resolveBranchId(tenantId, branchId);
    const targetDate = date ? dayjs(date) : dayjs();
    const where = {
      tenantId,
      branchId: resolvedBranchId,
      status: SaleStatus.COMPLETED,
      ...(!opts?.scopeAll && opts?.cashierId ? { cashierId: opts.cashierId } : {}),
      invoiceDate: {
        gte: targetDate.startOf('day').toDate(),
        lte: targetDate.endOf('day').toDate(),
      },
    };

    const [sales, totals] = await this.prisma.$transaction([
      this.prisma.sale.findMany({ where, include: { payments: true } }),
      this.prisma.sale.aggregate({
        where,
        _sum: { total: true, taxAmount: true, discountAmount: true },
        _count: { id: true },
      }),
    ]);

    const byPaymentMethod = sales.reduce((acc: Record<string, number>, sale) => {
      for (const payment of sale.payments) {
        acc[payment.method] = (acc[payment.method] ?? 0) + payment.amount;
      }
      return acc;
    }, {});

    const itemTotals = await this.prisma.saleItem.aggregate({
      where: {
        sale: {
          tenantId,
          branchId: resolvedBranchId,
          status: SaleStatus.COMPLETED,
          ...(!opts?.scopeAll && opts?.cashierId ? { cashierId: opts.cashierId } : {}),
          invoiceDate: {
            gte: targetDate.startOf('day').toDate(),
            lte: targetDate.endOf('day').toDate(),
          },
        },
      },
      _sum: { quantity: true },
    });

    return {
      date: targetDate.format('YYYY-MM-DD'),
      totalSales: totals._count.id,
      totalRevenue: totals._sum.total ?? 0,
      totalTax: totals._sum.taxAmount ?? 0,
      totalDiscount: totals._sum.discountAmount ?? 0,
      totalItems: itemTotals._sum.quantity ?? 0,
      byPaymentMethod,
    };
  }

  private barcodeLookupKeys(code: string): string[] {
    const raw = code.trim();
    if (!raw) return [];
    const keys = new Set<string>([raw]);
    // Printed tags: {variantBarcode|sku}{001} — strip trailing 3-digit serial.
    if (raw.length > 3 && /\d{3}$/.test(raw)) {
      keys.add(raw.slice(0, -3));
    }
    // Scale / embedded-price EAN-13 (prefix 2): extract PLU article codes
    const scale = this.parseScaleBarcode(raw);
    if (scale) {
      for (const k of scale.pluKeys) keys.add(k);
    }
    return [...keys];
  }

  /**
   * Supermarket scale barcodes (EAN-13 starting with 2):
   * digits 2–6 = PLU/article, 7–11 = price (cents) or weight×1000.
   */
  private parseScaleBarcode(code: string): {
    pluKeys: string[];
    embeddedValue: number;
    asPrice: number;
    asWeightKg: number;
  } | null {
    const raw = code.trim();
    if (!/^2\d{12}$/.test(raw)) return null;
    const embeddedValue = parseInt(raw.slice(7, 12), 10);
    if (Number.isNaN(embeddedValue)) return null;
    return {
      pluKeys: [raw.slice(2, 7), raw.slice(1, 7), raw.slice(0, 7)],
      embeddedValue,
      asPrice: embeddedValue / 100,
      asWeightKg: embeddedValue / 1000,
    };
  }

  async lookupBarcode(tenantId: string, branchId: string, code: string) {
    const resolvedBranchId = await this.resolveBranchId(tenantId, branchId);
    const scale = this.parseScaleBarcode(code.trim());
    const keys = this.barcodeLookupKeys(code);

    type VariantRow = Awaited<ReturnType<typeof this.prisma.productVariant.findMany>>[number] & {
      product: {
        name: string;
        barcode: string | null;
        taxRate: number | null;
        images: string[];
        category: { name?: string } | null;
      };
      inventory: { quantity: number; reservedQty: number }[];
    };

    const mapVariant = (variant: VariantRow) => {
      const stock = Math.max(
        0,
        (variant.inventory[0]?.quantity ?? 0) - (variant.inventory[0]?.reservedQty ?? 0),
      );
      const effectiveBarcode = variant.barcode ?? variant.product.barcode ?? null;
      const unitPrice = scale && scale.asPrice >= 1 ? scale.asPrice : variant.sellingPrice;
      const scaleQty = scale && scale.asPrice < 1 && scale.asWeightKg > 0
        ? scale.asWeightKg
        : undefined;
      return {
        variantId: variant.id,
        productId: variant.productId,
        productName: variant.product.name,
        variantName: variant.name,
        sku: variant.sku,
        barcode: effectiveBarcode,
        unitPrice,
        costPrice: variant.costPrice,
        mrp: variant.mrp,
        taxRate: variant.product.taxRate ?? 0,
        color: variant.color,
        size: variant.size,
        material: variant.material ?? undefined,
        style: variant.style ?? undefined,
        category: variant.product.category?.name ?? 'Other',
        stock,
        imageUrl: variant.images?.[0] ?? variant.product.images?.[0] ?? null,
        ...(scale ? { isScaleBarcode: true, scaleQty, embeddedValue: scale.embeddedValue } : {}),
      };
    };

    for (const key of keys) {
      const variants = await this.prisma.productVariant.findMany({
        where: {
          isActive: true,
          product: { tenantId, status: 'ACTIVE' },
          OR: [
            { barcode: key },
            { barcode: { equals: key, mode: 'insensitive' } },
            { product: { barcode: key } },
            { product: { barcode: { equals: key, mode: 'insensitive' } } },
            { sku: key },
            { sku: { equals: key, mode: 'insensitive' } },
          ],
        },
        include: {
          product: { include: { category: true } },
          inventory: { where: { branchId: resolvedBranchId }, select: { quantity: true, reservedQty: true }, take: 1 },
        },
      }) as VariantRow[];
      if (variants.length === 0) continue;

      const keyLower = key.toLowerCase();
      const exactSku = variants.filter((v) => v.sku.toLowerCase() === keyLower);
      if (exactSku.length === 1) return mapVariant(exactSku[0]);

      const exactVariantBarcode = variants.filter(
        (v) => (v.barcode ?? '').toLowerCase() === keyLower,
      );
      if (exactVariantBarcode.length === 1) return mapVariant(exactVariantBarcode[0]);

      const byProduct = new Map<string, VariantRow[]>();
      for (const v of variants) {
        const list = byProduct.get(v.productId) ?? [];
        list.push(v);
        byProduct.set(v.productId, list);
      }

      let multiGroup = [...byProduct.values()].find((list) => list.length > 1);

      // Shared product barcode: one hit, but product has other variants — open picker.
      if (!multiGroup && byProduct.size === 1) {
        const only = [...byProduct.values()][0];
        if (only.length === 1) {
          const matchedViaSharedBarcode =
            (only[0].product.barcode ?? '').toLowerCase() === keyLower ||
            (only[0].barcode ?? '').toLowerCase() === keyLower;
          if (matchedViaSharedBarcode) {
            const siblings = await this.prisma.productVariant.findMany({
              where: {
                productId: only[0].productId,
                isActive: true,
                product: { tenantId, status: 'ACTIVE' },
              },
              include: {
                product: { include: { category: true } },
                inventory: {
                  where: { branchId: resolvedBranchId },
                  select: { quantity: true, reservedQty: true },
                  take: 1,
                },
              },
              orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
            }) as VariantRow[];
            if (siblings.length > 1) multiGroup = siblings;
          }
        }
      }

      if (multiGroup && multiGroup.length > 1) {
        const options = multiGroup.map(mapVariant).sort((a, b) => b.stock - a.stock);
        const primary = options.find((o) => o.stock > 0) ?? options[0];
        return {
          ...primary,
          requiresVariantPick: true,
          variants: options,
        };
      }

      const ranked = variants
        .map((variant) => ({
          variant,
          stock: Math.max(
            0,
            (variant.inventory[0]?.quantity ?? 0) - (variant.inventory[0]?.reservedQty ?? 0),
          ),
        }))
        .sort((a, b) => b.stock - a.stock);

      return mapVariant((ranked.find((row) => row.stock > 0) ?? ranked[0]).variant);
    }
    throw new NotFoundException(`No product found for barcode/SKU: ${code}`);
  }

  async processReturn(tenantId: string, branchId: string, userId: string, dto: ReturnSaleDto) {
    await assertShopModule(this.prisma, tenantId, 'returns');
    const refundNumber = `RET-${dayjs().format('YYYYMMDD')}-${nanoid(4).toUpperCase()}`;
    const total = dto.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

    await this.prisma.$transaction(async (tx) => {
      for (const item of dto.items) {
        await this.inventoryService.adjustStock(tenantId, branchId, userId, {
          variantId: item.variantId,
          quantity: item.quantity,
          movementType: StockMovementType.RETURN,
          referenceId: refundNumber,
          notes: dto.reason ?? 'Customer return',
        }, tx);
      }
    });
    return { refundNumber, total, itemCount: dto.items.length, reason: dto.reason };
  }

  private async attachSupplierPurchaseInsights(
    tenantId: string,
    branchId: string,
    supplierId: string,
    rows: Array<{ variantId: string; stock: number }>,
  ) {
    const variantIds = rows.map((r) => r.variantId);
    if (!variantIds.length) return new Map<string, {
      lastPurchaseDate: string | null;
      lastPurchaseQty: number | null;
      stockAtLastPurchase: number | null;
      soldAfterLastPurchase: number | null;
      stockDecreased: boolean;
    }>();

    const grnItems = await this.prisma.goodsReceiptItem.findMany({
      where: {
        variantId: { in: variantIds },
        receivedQty: { gt: 0 },
        grn: { tenantId, supplierId, branchId },
      },
      include: {
        grn: { select: { id: true, receivedAt: true } },
      },
      orderBy: { grn: { receivedAt: 'desc' } },
    });

    const lastByVariant = new Map<string, typeof grnItems[number]>();
    for (const item of grnItems) {
      if (!lastByVariant.has(item.variantId)) lastByVariant.set(item.variantId, item);
    }

    const grnIds = [...new Set([...lastByVariant.values()].map((i) => i.grn.id))];
    const purchaseLogs = grnIds.length
      ? await this.prisma.inventoryLog.findMany({
          where: {
            tenantId,
            branchId,
            variantId: { in: variantIds },
            movementType: StockMovementType.PURCHASE,
            referenceType: 'GoodsReceipt',
            referenceId: { in: grnIds },
          },
          select: {
            variantId: true,
            referenceId: true,
            quantityAfter: true,
          },
        })
      : [];
    const stockAfterByVariantGrn = new Map<string, number>();
    for (const log of purchaseLogs) {
      const key = `${log.variantId}:${log.referenceId}`;
      if (!stockAfterByVariantGrn.has(key)) {
        stockAfterByVariantGrn.set(key, log.quantityAfter);
      }
    }

    const insights = new Map<string, {
      lastPurchaseDate: string | null;
      lastPurchaseQty: number | null;
      stockAtLastPurchase: number | null;
      soldAfterLastPurchase: number | null;
      stockDecreased: boolean;
    }>();

    for (const row of rows) {
      const last = lastByVariant.get(row.variantId);
      if (!last) {
        insights.set(row.variantId, {
          lastPurchaseDate: null,
          lastPurchaseQty: null,
          stockAtLastPurchase: null,
          soldAfterLastPurchase: null,
          stockDecreased: false,
        });
        continue;
      }

      const stockAtLastPurchase = stockAfterByVariantGrn.get(`${row.variantId}:${last.grn.id}`) ?? null;
      const soldAfterLastPurchase = stockAtLastPurchase != null
        ? Math.max(0, stockAtLastPurchase - row.stock)
        : null;

      insights.set(row.variantId, {
        lastPurchaseDate: last.grn.receivedAt.toISOString(),
        lastPurchaseQty: last.receivedQty,
        stockAtLastPurchase,
        soldAfterLastPurchase,
        stockDecreased: stockAtLastPurchase != null && row.stock < stockAtLastPurchase,
      });
    }

    return insights;
  }

  async getProducts(tenantId: string, branchId: string, opts?: { search?: string; limit?: number; supplierId?: string }) {
    const resolvedBranchId = await this.resolveBranchId(tenantId, branchId);
    const take = Math.min(Math.max(opts?.limit ?? 1500, 1), 2000);
    const search = opts?.search?.trim();
    const variants = await this.prisma.productVariant.findMany({
      where: {
        isActive: true,
        product: { tenantId, status: 'ACTIVE' },
        ...(opts?.supplierId
          ? {
              supplierAssignments: {
                some: { tenantId, supplierId: opts.supplierId },
              },
            }
          : {}),
        ...(search
          ? {
              OR: [
                { sku: { contains: search, mode: 'insensitive' } },
                { barcode: { contains: search, mode: 'insensitive' } },
                { name: { contains: search, mode: 'insensitive' } },
                { product: { name: { contains: search, mode: 'insensitive' } } },
                { product: { barcode: { contains: search, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      include: {
        product: { include: { category: true } },
        supplierAssignments: opts?.supplierId
          ? {
              where: { tenantId, supplierId: opts.supplierId },
              select: {
                supplierId: true,
                supplierProductCode: true,
                leadTimeDays: true,
                lastBuyingPrice: true,
                isPreferred: true,
              },
              take: 1,
            }
          : false,
        inventory: {
          where: { branchId: resolvedBranchId },
          select: { quantity: true, reservedQty: true },
          take: 1,
        },
      },
      orderBy: [{ product: { name: 'asc' } }, { name: 'asc' }],
      take,
    });

    const mapped = variants.map((v) => {
      const stock = Math.max(0, (v.inventory[0]?.quantity ?? 0) - (v.inventory[0]?.reservedQty ?? 0));
      return {
        assignment: Array.isArray(v.supplierAssignments) ? v.supplierAssignments[0] : undefined,
        variantId:   v.id,
        productId:   v.productId,
        productName: v.product.name,
        variantName: v.name,
        sku:         v.sku,
        unitPrice:   v.sellingPrice,
        costPrice:   v.costPrice,
        mrp:         v.mrp,
        taxRate:     v.product.taxRate ?? 0,
        category:    (v.product.category as { name?: string } | null)?.name ?? 'Other',
        color:       v.color ?? undefined,
        size:        v.size  ?? undefined,
        material:    v.material ?? undefined,
        style:       v.style ?? undefined,
        stock,
        imageUrl:    v.images?.[0] ?? v.product.images?.[0] ?? null,
        barcode:     v.barcode ?? v.product.barcode ?? undefined,
        warrantyMonths: v.product.warrantyMonths ?? null,
        supplierId: Array.isArray(v.supplierAssignments) ? v.supplierAssignments[0]?.supplierId ?? null : null,
        supplierProductCode: Array.isArray(v.supplierAssignments) ? v.supplierAssignments[0]?.supplierProductCode ?? null : null,
        leadTimeDays: Array.isArray(v.supplierAssignments) ? v.supplierAssignments[0]?.leadTimeDays ?? null : null,
        lastBuyingPrice: Array.isArray(v.supplierAssignments) ? v.supplierAssignments[0]?.lastBuyingPrice ?? null : null,
        isPreferredSupplier: Array.isArray(v.supplierAssignments) ? v.supplierAssignments[0]?.isPreferred ?? null : null,
      };
    });

    if (!opts?.supplierId) return mapped;

    const insights = await this.attachSupplierPurchaseInsights(
      tenantId,
      resolvedBranchId,
      opts.supplierId,
      mapped.map((m) => ({ variantId: m.variantId, stock: m.stock })),
    );

    return mapped.map((m) => {
      const insight = insights.get(m.variantId);
      return {
        ...m,
        lastPurchaseDate: insight?.lastPurchaseDate ?? null,
        lastPurchaseQty: insight?.lastPurchaseQty ?? null,
        stockAtLastPurchase: insight?.stockAtLastPurchase ?? null,
        soldAfterLastPurchase: insight?.soldAfterLastPurchase ?? null,
        stockDecreased: insight?.stockDecreased ?? false,
      };
    });
  }

  async closeDaySession(tenantId: string, branchId: string, cashierId: string, notes?: string) {
    const resolvedBranchId = await this.resolveBranchId(tenantId, branchId);
    const now = dayjs();
    const todayStart = now.startOf('day').toDate();
    const todayEnd = now.endOf('day').toDate();
    const where = {
      tenantId,
      branchId: resolvedBranchId,
      cashierId,
      status: SaleStatus.COMPLETED,
      invoiceDate: { gte: todayStart, lte: todayEnd },
    };

    const [sales, totals] = await Promise.all([
      this.prisma.sale.findMany({ where, include: { payments: true } }),
      this.prisma.sale.aggregate({
        where,
        _sum: { total: true, taxAmount: true, discountAmount: true },
        _count: { id: true },
      }),
    ]);

    let register = await findOpenRegister(this.prisma, tenantId, resolvedBranchId, cashierId);
    if (!register) {
      register = await this.prisma.cashRegister.findFirst({
        where: {
          tenantId,
          branchId: resolvedBranchId,
          cashierId,
          openingTime: { gte: todayStart, lte: todayEnd },
        },
        orderBy: { openingTime: 'desc' },
        include: {
          movements: { orderBy: { createdAt: 'asc' } },
          cashier: { select: { id: true, firstName: true, lastName: true, email: true } },
          branch: { select: { id: true, name: true, code: true } },
        },
      });
    }

    const byPaymentMethod = sales.reduce((acc: Record<string, number>, sale) => {
      for (const payment of sale.payments) {
        acc[payment.method] = (acc[payment.method] ?? 0) + payment.amount;
      }
      return acc;
    }, {} as Record<string, number>);

    let cashSalesNet = 0;
    let cashTendered = 0;
    let changeGiven = 0;
    for (const sale of sales) {
      const net = netCashFromSalePayments(sale.payments, sale.changeDue);
      cashSalesNet += net;
      const tendered = sale.payments
        .filter((p) => p.method === PaymentMethod.CASH)
        .reduce((s, p) => s + p.amount, 0);
      if (tendered > 0) {
        cashTendered += tendered;
        changeGiven += sale.changeDue ?? 0;
      }
    }
    cashSalesNet = Math.round(cashSalesNet * 100) / 100;
    cashTendered = Math.round(cashTendered * 100) / 100;
    changeGiven = Math.round(changeGiven * 100) / 100;

    // Align drawer cash sales with register movements when shift exists
    const movementSummary = register ? summarizeMovements(register.movements) : null;
    const registerCashSales = movementSummary?.cashSales ?? cashSalesNet;

    const cash = {
      shiftOpen: register?.status === CashRegisterStatus.OPEN,
      openingFloat: register?.openingCash ?? null,
      cashSalesNet: register ? registerCashSales : cashSalesNet,
      cashTendered,
      changeGiven,
      cashIn: movementSummary?.cashReceived ?? 0,
      cashOut: movementSummary?.cashExpenses ?? 0,
      refunds: movementSummary?.cashRefunds ?? 0,
      expectedInDrawer: register
        ? computeExpectedCashFromMovements(register.openingCash, register.movements)
        : null,
    };

    const summary = {
      date: now.format('YYYY-MM-DD'),
      closedAt: now.toISOString(),
      closedBy: cashierId,
      notes: notes ?? '',
      totalSales: totals._count.id,
      totalRevenue: totals._sum.total ?? 0,
      totalTax: totals._sum.taxAmount ?? 0,
      totalDiscount: totals._sum.discountAmount ?? 0,
      byPaymentMethod,
      cash,
    };
    this.eventEmitter.emit('pos.day.closed', { tenantId, branchId: resolvedBranchId, ...summary });
    return summary;
  }

  private async generateInvoiceNumber(tenantId: string): Promise<string> {
    const prefix = 'INV';
    const date = dayjs().format('YYYYMMDD');
    const count = await this.prisma.sale.count({
      where: { tenantId, invoiceDate: { gte: dayjs().startOf('day').toDate() } },
    });
    return `${prefix}-${date}-${String(count + 1).padStart(4, '0')}`;
  }

  async listHelpers(tenantId: string, branchId?: string) {
    return this.prisma.employee.findMany({
      where: {
        tenantId,
        isActive: true,
        ...(branchId ? { OR: [{ branchId }, { branchId: null }] } : {}),
      },
      select: {
        id: true,
        code: true,
        firstName: true,
        lastName: true,
        commissionRate: true,
        designation: true,
      },
      orderBy: { firstName: 'asc' },
      take: 100,
    });
  }

  async issueGiftVoucher(
    tenantId: string,
    branchId: string,
    userId: string,
    dto: IssueGiftVoucherDto,
  ) {
    const code = (dto.code?.trim() || generateGiftVoucherCode()).toUpperCase();
    const existing = await this.prisma.giftVoucher.findFirst({ where: { tenantId, code } });
    if (existing) throw new BadRequestException('Voucher code already exists');
    return this.prisma.giftVoucher.create({
      data: {
        tenantId,
        branchId: branchId || undefined,
        code,
        initialAmount: dto.amount,
        balance: dto.amount,
        status: GiftVoucherStatus.ACTIVE,
        issuedToName: dto.issuedToName,
        issuedToCustomerId: dto.issuedToCustomerId,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        notes: dto.notes,
        createdBy: userId,
      },
    });
  }

  async validateGiftVoucher(tenantId: string, code: string, amountDue = 0) {
    const voucher = await this.prisma.giftVoucher.findFirst({
      where: { tenantId, code: code.trim().toUpperCase() },
    });
    if (!voucher) return { valid: false, reason: 'Voucher not found' };
    if (voucher.status === GiftVoucherStatus.CANCELLED || voucher.status === GiftVoucherStatus.REDEEMED) {
      return { valid: false, reason: `Voucher is ${voucher.status}` };
    }
    if (voucher.expiresAt && voucher.expiresAt < new Date()) {
      return { valid: false, reason: 'Voucher expired' };
    }
    if (voucher.balance <= 0) return { valid: false, reason: 'No balance remaining' };
    const redeem = applyGiftVoucherRedeem(voucher.balance, amountDue > 0 ? amountDue : voucher.balance);
    return {
      valid: true,
      code: voucher.code,
      balance: voucher.balance,
      initialAmount: voucher.initialAmount,
      expiresAt: voucher.expiresAt,
      maxApplicable: redeem.ok ? redeem.applied : voucher.balance,
      status: voucher.status,
    };
  }

  async listGiftVouchers(tenantId: string, query: { page?: number; limit?: number; status?: string }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 30;
    const where = {
      tenantId,
      ...(query.status && { status: query.status as GiftVoucherStatus }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.giftVoucher.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.giftVoucher.count({ where }),
    ]);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async cashierShiftSummary(tenantId: string, branchId: string, cashierId: string, date?: string) {
    const day = date ? dayjs(date) : dayjs();
    const range = { gte: day.startOf('day').toDate(), lte: day.endOf('day').toDate() };
    const resolvedBranchId = await this.resolveBranchId(tenantId, branchId);
    const sales = await this.prisma.sale.findMany({
      where: {
        tenantId,
        branchId: resolvedBranchId,
        cashierId,
        invoiceDate: range,
        status: { not: SaleStatus.CANCELLED },
      },
      include: { payments: true, _count: { select: { items: true } } },
      orderBy: { invoiceDate: 'asc' },
    });
    const revenue = sales.reduce((s, x) => s + x.total, 0);
    const commission = sales.reduce((s, x) => s + (x.helperCommission || 0), 0);
    const byMethod: Record<string, number> = {};
    for (const sale of sales) {
      for (const p of sale.payments) {
        byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amount;
      }
    }
    const register = await findOpenRegister(this.prisma, tenantId, resolvedBranchId, cashierId);
    return {
      date: day.format('YYYY-MM-DD'),
      cashierId,
      salesCount: sales.length,
      itemsSold: sales.reduce((s, x) => s + x._count.items, 0),
      revenue,
      helperCommissionTotal: commission,
      byPaymentMethod: byMethod,
      sales: sales.map((s) => ({
        id: s.id,
        invoiceNumber: s.invoiceNumber,
        total: s.total,
        helperName: s.helperName,
        helperCommission: s.helperCommission,
        invoiceDate: s.invoiceDate,
      })),
      cashRegisterId: register?.id ?? null,
    };
  }
}

@ApiTags('POS')
@ApiBearerAuth('access-token')
@Controller({ path: 'pos', version: '1' })
export class PosController {
  constructor(private readonly posService: PosService) {}

  @Post('sale')
  @RequirePermissions('sales:create')
  @ApiOperation({ summary: 'Process a POS sale transaction' })
  createSale(@CurrentUser() user: IAuthUser, @Body() dto: CreateSaleDto) {
    return this.posService.createSale(user.tenantId, user.branchId ?? '', user.id, dto);
  }

  @Get('sales')
  @RequirePermissions('sales:read')
  @ApiOperation({ summary: 'List sales for branch (cashiers see own bills only)' })
  getSales(@CurrentUser() user: IAuthUser, @Query() query: { page?: number; limit?: number; search?: string; date?: string }) {
    const scopeAll = canViewAllPosSales(user.roles ?? []);
    return this.posService.getSales(user.tenantId, user.branchId ?? '', query, {
      cashierId: user.id,
      scopeAll,
    });
  }

  @Get('sales/:id')
  @RequirePermissions('sales:read')
  @ApiOperation({ summary: 'Get sale details (cashiers: own sales only)' })
  getSaleById(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    const scopeAll = canViewAllPosSales(user.roles ?? []);
    return this.posService.getSaleById(id, user.tenantId, {
      cashierId: user.id,
      scopeAll,
    });
  }

  @Post('hold')
  @ApiOperation({ summary: 'Hold a bill for later' })
  holdBill(@CurrentUser() user: IAuthUser, @Body() dto: HoldBillDto) {
    return this.posService.holdBill(user.tenantId, user.branchId ?? '', user.id, dto);
  }

  @Get('hold')
  @ApiOperation({ summary: 'Get held bills (cashiers: own holds only)' })
  getHeldBills(@CurrentUser() user: IAuthUser) {
    const scopeAll = canViewAllPosSales(user.roles ?? []);
    return this.posService.getHeldBills(user.tenantId, user.branchId ?? '', {
      cashierId: user.id,
      scopeAll,
    });
  }

  @Delete('hold/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete held bill (cashiers: own holds only)' })
  deleteHeldBill(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    const scopeAll = canViewAllPosSales(user.roles ?? []);
    return this.posService.deleteHeldBill(id, user.tenantId, {
      cashierId: user.id,
      scopeAll,
    });
  }

  @Get('summary')
  @RequirePermissions('sales:read')
  @ApiOperation({ summary: 'Get daily sales summary (cashiers: own sales only)' })
  getDailySummary(@CurrentUser() user: IAuthUser, @Query('date') date?: string) {
    const scopeAll = canViewAllPosSales(user.roles ?? []);
    return this.posService.getDailySummary(user.tenantId, user.branchId ?? '', date, {
      cashierId: user.id,
      scopeAll,
    });
  }

  @Get('products')
  @ApiOperation({ summary: 'Get all active products/variants for POS with current stock' })
  getProducts(
    @CurrentUser() user: IAuthUser,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('supplierId') supplierId?: string,
  ) {
    return this.posService.getProducts(user.tenantId, user.branchId ?? '', {
      search,
      limit: limit ? parseInt(limit, 10) : undefined,
      supplierId,
    });
  }

  @Post('day-end')
  @RequirePermissions('sales:read')
  @ApiOperation({ summary: 'Close day session and get end-of-day summary' })
  closeDaySession(@CurrentUser() user: IAuthUser, @Body('notes') notes?: string) {
    return this.posService.closeDaySession(user.tenantId, user.branchId ?? '', user.id, notes);
  }

  @Get('barcode/:code')
  @ApiOperation({ summary: 'Lookup variant by barcode or SKU' })
  lookupBarcode(@CurrentUser() user: IAuthUser, @Param('code') code: string) {
    return this.posService.lookupBarcode(user.tenantId, user.branchId ?? '', code);
  }

  @Post('returns')
  @RequirePermissions('sales:create')
  @ApiOperation({ summary: 'Process a return/exchange' })
  processReturn(@CurrentUser() user: IAuthUser, @Body() dto: ReturnSaleDto) {
    return this.posService.processReturn(user.tenantId, user.branchId ?? '', user.id, dto);
  }

  @Get('coupons/validate/:code')
  @ApiOperation({ summary: 'Validate coupon or gift voucher for POS checkout' })
  validateCoupon(
    @CurrentUser() user: IAuthUser,
    @Param('code') code: string,
    @Query('amount') amount?: string,
  ) {
    return this.posService.validateCoupon(user.tenantId, code, parseFloat(amount ?? '0') || 0);
  }

  @Get('customers')
  @RequirePermissions('sales:create')
  @ApiOperation({ summary: 'Search customers for POS (name, phone, email)' })
  searchCustomers(
    @CurrentUser() user: IAuthUser,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
  ) {
    return this.posService.searchCustomers(user.tenantId, search, parseInt(limit ?? '20', 10) || 20);
  }

  @Get('helpers')
  @RequirePermissions('sales:create')
  @ApiOperation({ summary: 'List active employees for helper commission attribution' })
  listHelpers(@CurrentUser() user: IAuthUser) {
    return this.posService.listHelpers(user.tenantId, user.branchId ?? '');
  }

  @Get('shift-summary')
  @RequirePermissions('sales:read')
  @ApiOperation({ summary: 'Cashier shift / current sales summary' })
  shiftSummary(@CurrentUser() user: IAuthUser, @Query('date') date?: string) {
    return this.posService.cashierShiftSummary(user.tenantId, user.branchId ?? '', user.id, date);
  }

  @Post('gift-vouchers')
  @RequirePermissions('sales:create')
  @ApiOperation({ summary: 'Issue a gift voucher' })
  issueGiftVoucher(@CurrentUser() user: IAuthUser, @Body() dto: IssueGiftVoucherDto) {
    return this.posService.issueGiftVoucher(user.tenantId, user.branchId ?? '', user.id, dto);
  }

  @Get('gift-vouchers')
  @RequirePermissions('sales:read')
  @ApiOperation({ summary: 'List gift vouchers' })
  listGiftVouchers(
    @CurrentUser() user: IAuthUser,
    @Query() query: { page?: number; limit?: number; status?: string },
  ) {
    return this.posService.listGiftVouchers(user.tenantId, query);
  }

  @Get('gift-vouchers/validate/:code')
  @ApiOperation({ summary: 'Validate gift voucher balance for redeem' })
  validateGiftVoucher(
    @CurrentUser() user: IAuthUser,
    @Param('code') code: string,
    @Query('amount') amount?: string,
  ) {
    return this.posService.validateGiftVoucher(user.tenantId, code, parseFloat(amount ?? '0') || 0);
  }
}

@Module({
  imports: [InventoryModule],
  controllers: [PosController],
  providers: [PosService],
  exports: [PosService],
})
export class PosModule {}
