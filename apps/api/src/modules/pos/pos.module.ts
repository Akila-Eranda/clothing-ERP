import { Module } from '@nestjs/common';
import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { IsString, IsOptional, IsNumber, IsEnum, IsArray, IsInt, Min, ValidateNested, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PaymentMethod, SaleStatus, StockMovementType, PaymentStatus } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { InventoryService } from '@/modules/inventory/inventory.module';
import { InventoryModule } from '@/modules/inventory/inventory.module';
import { assertShopModule } from '@/shared/shop-module.helper';
import { tierDiscountAmount, computePromotionDiscount, buildPaymentsSummary } from './pos-sale.helpers';
import { assertCreditAvailable } from '@/modules/customers/customer-credit.helper';
import { nanoid } from 'nanoid';
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
}

export class HoldBillDto {
  @ApiPropertyOptional() @IsOptional() @IsString() label?: string;
  @ApiProperty() data: object;
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
    let customerRecord: { id: string; loyaltyPoints: number; walletBalance: number; creditLimit: number; creditBalance: number; tier: import('@prisma/client').CustomerTier } | null = null;
    if (dto.customerId) {
      customerRecord = await this.prisma.customer.findFirst({
        where: { id: dto.customerId, tenantId },
        select: { id: true, loyaltyPoints: true, walletBalance: true, creditLimit: true, creditBalance: true, tier: true },
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
            totalSpent: { increment: totalPaid },
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

  async getSales(tenantId: string, branchId: string, query: { page?: number; limit?: number; search?: string; date?: string }) {
    const resolvedBranchId = await this.resolveBranchId(tenantId, branchId);
    const page  = parseInt(String(query.page  ?? 1),  10);
    const limit = parseInt(String(query.limit ?? 20), 10);
    const skip = (page - 1) * limit;
    const where = {
      tenantId,
      branchId: resolvedBranchId,
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
        include: { customer: true, cashier: true, _count: { select: { items: true } } },
        orderBy: { invoiceDate: 'desc' },
      }),
      this.prisma.sale.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getSaleById(id: string, tenantId: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id, tenantId },
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

  async getHeldBills(tenantId: string, branchId: string) {
    const resolvedBranchId = await this.resolveBranchId(tenantId, branchId);
    return this.prisma.heldBill.findMany({
      where: { tenantId, branchId: resolvedBranchId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteHeldBill(id: string, tenantId: string) {
    const bill = await this.prisma.heldBill.findFirst({ where: { id, tenantId } });
    if (!bill) throw new NotFoundException('Held bill not found');
    await this.inventoryService.releaseReservations(tenantId, 'HELD_BILL', id);
    return this.prisma.heldBill.delete({ where: { id } });
  }

  async getDailySummary(tenantId: string, branchId: string, date?: string) {
    const resolvedBranchId = await this.resolveBranchId(tenantId, branchId);
    const targetDate = date ? dayjs(date) : dayjs();
    const where = {
      tenantId,
      branchId: resolvedBranchId,
      status: SaleStatus.COMPLETED,
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

    return {
      date: targetDate.format('YYYY-MM-DD'),
      totalSales: totals._count.id,
      totalRevenue: totals._sum.total ?? 0,
      totalTax: totals._sum.taxAmount ?? 0,
      totalDiscount: totals._sum.discountAmount ?? 0,
      byPaymentMethod,
    };
  }

  async lookupBarcode(tenantId: string, branchId: string, code: string) {
    const variant = await this.prisma.productVariant.findFirst({
      where: {
        isActive: true,
        product: { tenantId, status: 'ACTIVE' },
        OR: [{ barcode: code }, { sku: code }],
      },
      include: {
        product: { include: { category: true } },
        inventory: { where: branchId ? { branchId } : {}, select: { quantity: true, reservedQty: true }, take: 1 },
      },
    });
    if (!variant) throw new NotFoundException(`No product found for barcode/SKU: ${code}`);
    return {
      variantId: variant.id, productName: variant.product.name, variantName: variant.name,
      sku: variant.sku, barcode: variant.barcode, unitPrice: variant.sellingPrice,
      costPrice: variant.costPrice, color: variant.color, size: variant.size,
      stock: Math.max(0, (variant.inventory[0]?.quantity ?? 0) - (variant.inventory[0]?.reservedQty ?? 0)),
    };
  }

  async processReturn(tenantId: string, branchId: string, userId: string, dto: ReturnSaleDto) {
    await assertShopModule(this.prisma, tenantId, 'returns');
    const refundNumber = `RET-${dayjs().format('YYYYMMDD')}-${nanoid(4).toUpperCase()}`;
    const total = dto.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

    for (const item of dto.items) {
      await this.inventoryService.adjustStock(tenantId, branchId, userId, {
        variantId: item.variantId,
        quantity: item.quantity,
        movementType: StockMovementType.RETURN,
        referenceId: refundNumber,
        notes: dto.reason ?? 'Customer return',
      });
    }
    return { refundNumber, total, itemCount: dto.items.length, reason: dto.reason };
  }

  async getProducts(tenantId: string, branchId: string) {
    const variants = await this.prisma.productVariant.findMany({
      where: {
        isActive: true,
        product: { tenantId, status: 'ACTIVE' },
      },
      include: {
        product: { include: { category: true } },
        inventory: {
          where: branchId ? { branchId } : {},
          select: { quantity: true, reservedQty: true },
          take: 1,
        },
      },
      orderBy: [{ product: { name: 'asc' } }, { name: 'asc' }],
    });

    return variants.map((v) => ({
      variantId:   v.id,
      productName: v.product.name,
      variantName: v.name,
      sku:         v.sku,
      unitPrice:   v.sellingPrice,
      costPrice:   v.costPrice,
      category:    (v.product.category as { name?: string } | null)?.name ?? 'Other',
      color:       v.color ?? undefined,
      size:        v.size  ?? undefined,
      material:    v.material ?? undefined,
      style:       v.style ?? undefined,
      stock:       Math.max(0, (v.inventory[0]?.quantity ?? 0) - (v.inventory[0]?.reservedQty ?? 0)),
      imageUrl:    v.images?.[0] ?? v.product.images?.[0] ?? null,
      barcode:     v.barcode ?? undefined,
      warrantyMonths: v.product.warrantyMonths ?? null,
    }));
  }

  async closeDaySession(tenantId: string, branchId: string, cashierId: string, notes?: string) {
    const resolvedBranchId = await this.resolveBranchId(tenantId, branchId);
    const now = dayjs();
    const where = {
      tenantId,
      branchId: resolvedBranchId,
      status: SaleStatus.COMPLETED,
      invoiceDate: { gte: now.startOf('day').toDate(), lte: now.endOf('day').toDate() },
    };
    const [totals, byMethod] = await this.prisma.$transaction([
      this.prisma.sale.aggregate({ where, _sum: { total: true, taxAmount: true, discountAmount: true }, _count: { id: true } }),
      this.prisma.salePayment.groupBy({ by: ['method'], where: { sale: { ...where } }, _sum: { amount: true }, orderBy: { method: 'asc' } }),
    ]);
    const summary = {
      date: now.format('YYYY-MM-DD'),
      closedAt: now.toISOString(),
      closedBy: cashierId,
      notes: notes ?? '',
      totalSales: totals._count.id,
      totalRevenue: totals._sum.total ?? 0,
      totalTax: totals._sum.taxAmount ?? 0,
      totalDiscount: totals._sum.discountAmount ?? 0,
      byPaymentMethod: Object.fromEntries(byMethod.map(m => [m.method, m._sum?.amount ?? 0])),
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
  @ApiOperation({ summary: 'List sales for branch' })
  getSales(@CurrentUser() user: IAuthUser, @Query() query: { page?: number; limit?: number; search?: string; date?: string }) {
    return this.posService.getSales(user.tenantId, user.branchId ?? '', query);
  }

  @Get('sales/:id')
  @RequirePermissions('sales:read')
  @ApiOperation({ summary: 'Get sale details' })
  getSaleById(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.posService.getSaleById(id, user.tenantId);
  }

  @Post('hold')
  @ApiOperation({ summary: 'Hold a bill for later' })
  holdBill(@CurrentUser() user: IAuthUser, @Body() dto: HoldBillDto) {
    return this.posService.holdBill(user.tenantId, user.branchId ?? '', user.id, dto);
  }

  @Get('hold')
  @ApiOperation({ summary: 'Get held bills' })
  getHeldBills(@CurrentUser() user: IAuthUser) {
    return this.posService.getHeldBills(user.tenantId, user.branchId ?? '');
  }

  @Delete('hold/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete held bill' })
  deleteHeldBill(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.posService.deleteHeldBill(id, user.tenantId);
  }

  @Get('summary')
  @RequirePermissions('sales:read')
  @ApiOperation({ summary: 'Get daily sales summary' })
  getDailySummary(@CurrentUser() user: IAuthUser, @Query('date') date?: string) {
    return this.posService.getDailySummary(user.tenantId, user.branchId ?? '', date);
  }

  @Get('products')
  @ApiOperation({ summary: 'Get all active products/variants for POS with current stock' })
  getProducts(@CurrentUser() user: IAuthUser) {
    return this.posService.getProducts(user.tenantId, user.branchId ?? '');
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
}

@Module({
  imports: [InventoryModule],
  controllers: [PosController],
  providers: [PosService],
  exports: [PosService],
})
export class PosModule {}
