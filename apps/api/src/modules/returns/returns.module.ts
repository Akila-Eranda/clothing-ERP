import { Module } from '@nestjs/common';
import { Controller, Get, Post, Put, Body, Param, Query, Headers } from '@nestjs/common';
import { resolveActingCashierId } from '@/modules/pos/pos-pin.helper';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { areSaleLinesFullyReturned, fractionalReturnQuantityRejection, priceReturn, refundApprovalLimit, ReturnPricingError, canChangeReturnStatus } from './returns-pricing.helper';
import { fractionalQuantityRejection } from '@/modules/pos/pos-quantity.helper';
import { hasFinancialAuthority } from '@/shared/security/financial-authority';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IsString, IsEnum, IsArray, IsBoolean, IsOptional, IsNumber, Min, ValidateNested, IsIn, MaxLength, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReturnReason, ReturnStatus, StockMovementType, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { InventoryService, InventoryModule } from '@/modules/inventory/inventory.module';
import { paginate, getPaginationArgs } from '@/shared/pagination.helper';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { assertShopModule } from '@/shared/shop-module.helper';
import { ensureCashierWallet, takeRefundCashFromWallet } from '@/shared/cash-register.helper';
import { EXCHANGE_PAYMENT_METHODS, ExchangeSettlement, ExchangeSettlementError, loyaltyAdjustmentForRefund, settleExchange } from './exchange-loyalty.helper';
import { CARD_LAST4_REQUIRED_MESSAGE, parseCardLast4 } from '@/shared/card-payment.helper';
import { NoCardNumber } from '@/shared/security/card-number.validator';
import { CashAuth, managerApprovalRequired, resolveCashActor } from '@/shared/security/cash-actor';
import { allocateRefundByTender, cashRefundPart, refundTenders, RefundPart, splitProportional } from '@/shared/refund-allocation.helper';
import { GiftVoucherStatus, PaymentMethod } from '@prisma/client';
import { CustomersModule } from '@/modules/customers/customers.module';
import { CustomerCreditService } from '@/modules/customers/customer-credit.service';
import { DocumentNumberingModule } from '@/modules/document-numbering/document-numbering.module';
import { DocumentNumberingService } from '@/modules/document-numbering/document-numbering.service';
import { CLIENT_REQUEST_ID_PATTERN, isClientRequestIdConflict, normalizeClientRequestId } from '@/modules/pos/pos-idempotency.helper';
import { isReturnRequestConflict, returnRequestFingerprint } from './return-idempotency.helper';

export class ReturnStatusDto {
  @ApiProperty({ enum: ReturnStatus }) @IsEnum(ReturnStatus) status: ReturnStatus;
}

export class ReturnItemDto {
  @ApiProperty() @IsString() variantId: string;
  @ApiProperty() @IsNumber() @Min(0.001) quantity: number;
  /** Ignored: the refund is priced from the original sale (F-02). Kept optional for older clients. */
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) unitPrice?: number;
}

export class ExchangeItemDto {
  @ApiProperty() @IsString() variantId: string;
  @ApiProperty() @IsNumber() @Min(0.001) quantity: number;
  /** Ignored: exchange items are priced from the catalogue (F-02). Kept optional for older clients. */
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) unitPrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() productName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() variantName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sku?: string;
}

/** Exchange: how the customer pays a difference they owe (normal tenders only). */
export class ExchangePaymentDto {
  @ApiProperty({ enum: EXCHANGE_PAYMENT_METHODS }) @IsIn([...EXCHANGE_PAYMENT_METHODS]) method: (typeof EXCHANGE_PAYMENT_METHODS)[number];
  @ApiProperty() @IsNumber() @Min(0.01) amount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(4) cardLast4?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) bankAccountId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) @NoCardNumber() reference?: string;
}

export class CreateReturnDto {
  @ApiProperty({ description: 'Stable key reused when retrying the same return attempt' })
  @IsString() @Matches(CLIENT_REQUEST_ID_PATTERN, { message: 'clientRequestId must be 8–64 chars of A-Z a-z 0-9 _ -' })
  clientRequestId: string;
  @ApiProperty() @IsString() originalSaleId: string;
  @ApiProperty({ enum: ReturnReason }) @IsEnum(ReturnReason) reason: ReturnReason;
  @ApiPropertyOptional() @IsOptional() @IsString() returnType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() restockItems?: boolean;
  @ApiProperty({ type: [ReturnItemDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => ReturnItemDto) items: ReturnItemDto[];
  @ApiPropertyOptional({ type: [ExchangeItemDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ExchangeItemDto) exchangeItems?: ExchangeItemDto[];
  /** Exchange where the new goods cost more: how the difference is paid now. */
  @ApiPropertyOptional({ type: [ExchangePaymentDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ExchangePaymentDto) exchangePayments?: ExchangePaymentDto[];
  /** Exchange where the returned goods are worth more: refund the excess (default) or give store credit. */
  @ApiPropertyOptional({ enum: ['REFUND', 'STORE_CREDIT'] }) @IsOptional() @IsIn(['REFUND', 'STORE_CREDIT']) exchangeExcessAs?: 'REFUND' | 'STORE_CREDIT';
}

@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly creditService: CustomerCreditService,
    private readonly numbering: DocumentNumberingService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(
    tenantId: string,
    branchId: string,
    auth: CashAuth,
    dto: CreateReturnDto,
    till?: { counterId?: string },
  ) {
    await assertShopModule(this.prisma, tenantId, 'returns');
    const clientRequestId = normalizeClientRequestId(dto.clientRequestId);
    if (!clientRequestId) throw new BadRequestException('clientRequestId is required for return idempotency');
    const requestFingerprint = returnRequestFingerprint({ tenantId, branchId, ...dto });
    const replay = await this.prisma.return.findFirst({
      where: { tenantId, clientRequestId },
      include: { items: true },
    });
    if (replay) {
      if (isReturnRequestConflict(replay.requestFingerprint, requestFingerprint)) {
        throw new BadRequestException('clientRequestId was already used for a different return');
      }
      return replay;
    }
    // The person really at the till (PIN cashier — never the terminal login's roles); a manager acting
    // or approving with their PIN lifts the refund limit.
    const actor = await resolveCashActor(this.prisma, { tenantId, branchId, ...auth });
    const userId = actor.actorId;
    const sale = await this.prisma.sale.findFirst({
      where: { id: dto.originalSaleId, tenantId },
      include: { payments: true },
    });
    if (!sale) throw new NotFoundException('Original sale not found');
    if (sale.status === 'REFUNDED') {
      throw new BadRequestException('This invoice was already fully refunded');
    }
    if (sale.status !== 'COMPLETED' && sale.status !== 'PARTIALLY_REFUNDED') {
      throw new BadRequestException('Returns are only allowed for completed sales');
    }

    const returnType = dto.returnType ?? 'RETURN';
    if (returnType === 'EXCHANGE' && !(dto.exchangeItems ?? []).length) {
      throw new BadRequestException('Select the items given in exchange');
    }
    if (returnType !== 'EXCHANGE' && ((dto.exchangePayments ?? []).length || dto.exchangeExcessAs)) {
      throw new BadRequestException('Exchange payments are only for exchanges');
    }
    // Card / QR / bank details of an exchange payment (validated before anything is written).
    for (const p of dto.exchangePayments ?? []) {
      if (p.method === 'CARD' && !parseCardLast4(p.cardLast4)) throw new BadRequestException(CARD_LAST4_REQUIRED_MESSAGE);
      if (p.method === 'QR' || p.method === 'BANK_TRANSFER') {
        const bank = p.bankAccountId
          ? await this.prisma.bankAccount.findFirst({ where: { id: p.bankAccountId, tenantId, isActive: true }, select: { id: true } })
          : null;
        if (!bank) throw new BadRequestException('Select the bank account the exchange payment was paid into');
      }
    }
    const returnNumber = this.numbering.isEngineEnabled()
      ? await this.numbering.allocateStandalone(
          tenantId,
          returnType === 'EXCHANGE' ? 'EXCHANGE' : 'RETURN',
        )
      : `${returnType === 'EXCHANGE' ? 'EXC' : 'RET'}-${Date.now().toString(36).toUpperCase()}`;
    // Exchange items: catalogue price of the shop's own variants (never a client-sent price).
    const exchangeItems = dto.exchangeItems ?? [];
    let exchangeAmount = 0;
    let exchangeData: unknown = null;
    if (exchangeItems.length) {
      const variants = await this.prisma.productVariant.findMany({
        where: { id: { in: exchangeItems.map((i) => i.variantId) }, product: { tenantId } },
        select: {
          id: true,
          sellingPrice: true,
          product: { select: { name: true, productKind: true, unit: true, allowDecimalSelling: true } },
        },
      });
      const variantById = new Map(variants.map((v) => [v.id, v]));
      const pricedExchangeItems = exchangeItems.map((i) => {
        const variant = variantById.get(i.variantId);
        if (!variant) throw new BadRequestException('Exchange item not found');
        const rejection = fractionalQuantityRejection(variant.product.name, i.quantity, variant.product);
        if (rejection) throw new BadRequestException(rejection);
        return { ...i, unitPrice: variant.sellingPrice };
      });
      exchangeData = pricedExchangeItems;
      exchangeAmount = Math.round(pricedExchangeItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0) * 100) / 100;
    }
    let totalAmount = 0;
    let refundAmount = 0;

    let ret;
    try {
      ret = await this.prisma.$transaction(async (tx) => {
      // Serialise returns of the same sale, then price and check cumulatively (F-02).
      await tx.$queryRaw`SELECT id FROM sales WHERE id = ${dto.originalSaleId} AND "tenantId" = ${tenantId} FOR UPDATE`;
      const saleLines = await tx.saleItem.findMany({
        where: { saleId: dto.originalSaleId },
        select: { variantId: true, quantity: true, total: true, productName: true },
      });
      const earlier = await tx.returnItem.findMany({
        where: { return: { originalSaleId: dto.originalSaleId, tenantId, status: { not: ReturnStatus.REJECTED } } },
        select: { variantId: true, quantity: true },
      });
      const alreadyReturned = new Map<string, number>();
      for (const e of earlier) alreadyReturned.set(e.variantId, (alreadyReturned.get(e.variantId) ?? 0) + e.quantity);
      let priced: ReturnType<typeof priceReturn>;
      try {
        priced = priceReturn(saleLines, sale.total, dto.items, alreadyReturned);
      } catch (e) {
        if (e instanceof ReturnPricingError) throw new BadRequestException(e.message);
        throw e;
      }
      const returnVariants = await tx.productVariant.findMany({
        where: {
          id: { in: [...new Set(dto.items.map((item) => item.variantId))] },
          product: { tenantId },
        },
        select: {
          id: true,
          product: { select: { name: true, productKind: true, unit: true, allowDecimalSelling: true } },
        },
      });
      const returnVariantById = new Map(returnVariants.map((variant) => [variant.id, variant]));
      for (const item of dto.items) {
        const saleLine = saleLines.find((line) => line.variantId === item.variantId);
        if (!saleLine) throw new BadRequestException('Return item was not on the original invoice');
        const product = returnVariantById.get(item.variantId)?.product;
        if (!product) throw new BadRequestException('Return item product is unavailable');
        const rejection = fractionalReturnQuantityRejection(
          saleLine.productName,
          item.variantId,
          item.quantity,
          product,
          saleLines,
        );
        if (rejection) throw new BadRequestException(rejection);
      }
      totalAmount = priced.totalAmount;
      // Exchange = a return plus a new sale: the difference is collected by normal tenders, or the excess
      // is refunded / given as store credit. An equal exchange moves no money.
      let settlement: ExchangeSettlement | null = null;
      if (returnType === 'EXCHANGE') {
        try {
          settlement = settleExchange(totalAmount, exchangeAmount, (dto.exchangePayments ?? []).map((p) => ({
            method: p.method, amount: p.amount, reference: p.reference,
            ...(p.method === 'CARD' ? { cardLast4: parseCardLast4(p.cardLast4) ?? undefined } : {}),
            ...(p.method === 'QR' || p.method === 'BANK_TRANSFER' ? { bankAccountId: p.bankAccountId } : {}),
          })), dto.exchangeExcessAs ?? 'REFUND');
        } catch (e) {
          if (e instanceof ExchangeSettlementError) throw new BadRequestException(e.message);
          throw e;
        }
        if (settlement.excessAs === 'STORE_CREDIT' && !sale.customerId) {
          throw new BadRequestException('Store credit needs a customer on the original sale');
        }
      }
      refundAmount = settlement ? settlement.excess : totalAmount;

      const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
      const limit = refundApprovalLimit(tenant?.settings);
      if (refundAmount > limit && !hasFinancialAuthority(actor.actorRoles) && !actor.authorizerId) {
        throw managerApprovalRequired(`Refunds above LKR ${limit.toLocaleString('en-LK')} need a manager`);
      }
      // Refund back to the tenders of the original sale (a split card + cash sale never refunds the card
      // part from the drawer). The unpaid part of a partial-pay sale was customer credit.
      const storeCredit = settlement?.excessAs === 'STORE_CREDIT' ? settlement.excess : 0;
      const parts = storeCredit > 0 ? [] : allocateRefundByTender(refundTenders(sale), sale.changeDue ?? 0, refundAmount);
      const cashPart = cashRefundPart(parts);

      const createData: any = {
        tenantId, branchId,
        originalSaleId: dto.originalSaleId,
        returnNumber, clientRequestId, requestFingerprint, reason: dto.reason, notes: dto.notes,
        returnType, exchangeAmount, exchangeData: exchangeData ?? null,
        exchangeSettlement: settlement ?? undefined,
        restockItems: dto.restockItems ?? true,
        totalAmount, refundAmount,
        processedBy: userId,
        items: { create: priced.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, unitPrice: l.unitPrice, totalAmount: l.totalAmount })) },
      };
      const created = await tx.return.create({ data: createData, include: { items: true } });

      await this.applyStockEffects(tenantId, created, userId, tx);
      // Cash part leaves the till cashier's drawer here, locked and balance-checked: not enough cash
      // in the drawer rolls the whole return back.
      if (cashPart > 0) {
        await takeRefundCashFromWallet(tx, {
          tenantId, branchId, cashierId: userId, counterId: till?.counterId,
          amount: cashPart, returnId: created.id, returnNumber: created.returnNumber,
          authorizedById: actor.authorizerId,
        });
      }
      // Customer-held tenders go back to the customer in the same transaction: credit charge reversed,
      // wallet and gift-voucher balances restored. Card / QR / bank shares are refunded outside the till.
      await this.settleCustomerRefundShares(tx, tenantId, sale, parts, created);
      if (settlement) await this.settleExchangeMoney(tx, tenantId, branchId, userId, actor.authorizerId, till?.counterId, sale, created, settlement);
      // Loyalty: earned points reversed / redeemed points restored, in proportion to what was refunded
      // (for an exchange: only the excess paid back — the new goods take the place of the old ones).
      await this.adjustLoyaltyForRefund(tx, tenantId, sale, created);
      const updated = await tx.return.update({
        where: { id: created.id },
        data: { status: ReturnStatus.APPROVED, approvedBy: userId },
        include: { items: true },
        });
      return updated;
      });
    } catch (error) {
      if (!isClientRequestIdConflict(error)) throw error;
      const replay = await this.prisma.return.findFirst({
        where: { tenantId, clientRequestId },
        include: { items: true },
      });
      if (!replay) throw error;
      if (isReturnRequestConflict(replay.requestFingerprint, requestFingerprint)) {
        throw new BadRequestException('clientRequestId was already used for a different return');
      }
      ret = replay;
    }

    this.eventEmitter.emit('accounting.return.completed', {
      returnId: ret.id,
      tenantId,
      userId,
    });

    return ret;
  }

  /**
   * Gives the customer-held shares of a refund back, inside the return transaction (so a failure rolls the
   * whole return back and a retry cannot reverse twice):
   * - CUSTOMER_CREDIT: reverses the open credit charge of the sale. Whatever the customer already paid
   *   off cannot be "reversed" any more, so that part becomes store credit in their wallet
   *   (RETURN_CREDIT, referenced to the return; the ledger posts it to the wallet liability).
   * - WALLET: restored to the customer's wallet (RETURN_REFUND).
   * - GIFT_VOUCHER: restored to the voucher(s) used, in proportion to what each paid.
   */
  private async settleCustomerRefundShares(
    tx: Prisma.TransactionClient,
    tenantId: string,
    sale: { id: string; customerId: string | null; payments: { method: PaymentMethod; amount: number; reference: string | null }[] },
    parts: RefundPart[],
    ret: { id: string; returnNumber: string },
  ) {
    const share = (m: PaymentMethod) => Math.round(parts.filter((p) => p.method === m).reduce((s, p) => s + p.amount, 0) * 100) / 100;
    const toWallet = async (customerId: string | null | undefined, amount: number, type: string, label: string) => {
      if (!(amount > 0.009)) return;
      if (!customerId) throw new BadRequestException(`This sale has no customer to return the ${label} share to`);
      await tx.customer.update({ where: { id: customerId }, data: { walletBalance: { increment: amount } } });
      await tx.walletTransaction.create({
        data: { customerId, tenantId, amount, type, description: `Return ${ret.returnNumber} (${label})`, referenceId: ret.id },
      });
    };

    const credit = share(PaymentMethod.CUSTOMER_CREDIT);
    if (credit > 0.009) {
      const r = await this.creditService.reverseCreditForSaleReturn(tenantId, sale.id, credit, `Return ${ret.returnNumber} credit reversal`, tx);
      const rest = Math.round((credit - r.reversed) * 100) / 100;
      await toWallet(sale.customerId ?? ('customerId' in r ? r.customerId : undefined), rest, 'RETURN_CREDIT', 'paid-off credit');
    }

    await toWallet(sale.customerId, share(PaymentMethod.WALLET), 'RETURN_REFUND', 'wallet');

    const gift = share(PaymentMethod.GIFT_VOUCHER);
    if (gift > 0.009) {
      const used = sale.payments
        .filter((p) => p.method === PaymentMethod.GIFT_VOUCHER && p.amount > 0)
        .map((p) => ({ key: (p.reference ?? '').trim().toUpperCase(), weight: p.amount }));
      const split = splitProportional(gift, used);
      if (!split.length || split.some((x) => !x.key)) throw new BadRequestException('The gift voucher used on this sale is not recorded; refund it manually');
      for (const x of split) {
        const [v] = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "gift_vouchers" WHERE "tenantId" = ${tenantId} AND "code" = ${x.key} FOR UPDATE`;
        const voucher = v && await tx.giftVoucher.findUnique({ where: { id: v.id }, select: { id: true, balance: true, initialAmount: true } });
        if (!voucher) throw new BadRequestException(`Gift voucher ${x.key} not found; refund it manually`);
        const balance = Math.round((voucher.balance + x.amount) * 100) / 100;
        await tx.giftVoucher.update({
          where: { id: voucher.id },
          data: { balance, status: balance + 0.009 >= voucher.initialAmount ? GiftVoucherStatus.ACTIVE : GiftVoucherStatus.PARTIALLY_USED },
        });
      }
    }
  }

  /**
   * Exchange money, inside the return transaction:
   * - cash collected for a difference goes into the till cashier's drawer (a SALE movement for the return);
   *   card / QR / bank are recorded on the settlement for the ledger;
   * - an excess given as store credit goes to the customer's wallet (EXCHANGE_CREDIT, posted Cr 2400).
   * Refunds of an excess to the original tenders go through the normal refund path.
   */
  private async settleExchangeMoney(
    tx: Prisma.TransactionClient,
    tenantId: string,
    branchId: string,
    cashierId: string,
    authorizedById: string | null,
    counterId: string | undefined,
    sale: { customerId: string | null },
    ret: { id: string; returnNumber: string },
    settlement: ExchangeSettlement,
  ) {
    const cash = settlement.collected.filter((c) => c.method === 'CASH').reduce((s, c) => s + c.amount, 0);
    if (cash > 0.004) {
      const wallet = await ensureCashierWallet(tx, tenantId, branchId, cashierId, counterId);
      await tx.cashMovement.create({
        data: {
          tenantId, registerId: wallet.id, type: 'SALE', amount: Math.round(cash * 100) / 100, reference: ret.id,
          description: `Exchange ${ret.returnNumber} · difference`, createdById: cashierId, authorizedById,
        },
      });
    }
    if (settlement.excessAs === 'STORE_CREDIT' && settlement.excess > 0.004 && sale.customerId) {
      await tx.customer.update({ where: { id: sale.customerId }, data: { walletBalance: { increment: settlement.excess } } });
      await tx.walletTransaction.create({
        data: {
          customerId: sale.customerId, tenantId, amount: settlement.excess, type: 'EXCHANGE_CREDIT',
          description: `Exchange ${ret.returnNumber} (store credit)`, referenceId: ret.id,
        },
      });
    }
  }

  /**
   * Loyalty points for a refund: proportional and cumulative over all refunds of the sale (see
   * loyaltyAdjustmentForRefund), applied once per return inside its transaction with the customer row
   * locked. Never takes the balance below zero; an unrecoverable part is recorded on the ledger row.
   */
  private async adjustLoyaltyForRefund(
    tx: Prisma.TransactionClient,
    tenantId: string,
    sale: { id: string; customerId: string | null; total: number; pointsEarned: number; pointsRedeemed: number },
    ret: { id: string; returnNumber: string },
  ) {
    if (!sale.customerId) return null;
    // Older sales never stored pointsEarned: fall back to the sale's own EARNED / REDEEMED ledger rows.
    let pointsEarned = sale.pointsEarned;
    let pointsRedeemed = sale.pointsRedeemed;
    if (!(pointsEarned > 0) || !(pointsRedeemed > 0)) {
      const rows = await tx.loyaltyTransaction.findMany({
        where: { tenantId, customerId: sale.customerId, referenceId: sale.id, type: { in: ['EARNED', 'REDEEMED'] } },
        select: { type: true, points: true },
      });
      if (!(pointsEarned > 0)) pointsEarned = rows.filter((r) => r.type === 'EARNED').reduce((s, r) => s + r.points, 0);
      if (!(pointsRedeemed > 0)) pointsRedeemed = -rows.filter((r) => r.type === 'REDEEMED').reduce((s, r) => s + r.points, 0);
    }
    if (!(pointsEarned > 0) && !(pointsRedeemed > 0)) return null;
    const refunds = await tx.return.findMany({
      where: { tenantId, originalSaleId: sale.id, status: { not: ReturnStatus.REJECTED } },
      select: { id: true, returnType: true, totalAmount: true, refundAmount: true },
    });
    const refundedSoFar = refunds.reduce((s, r) => s + (r.returnType === 'EXCHANGE' ? r.refundAmount : r.totalAmount), 0);
    const ids = refunds.map((r) => r.id);
    const applied = await tx.loyaltyTransaction.findMany({
      where: { tenantId, referenceId: { in: ids }, type: { in: ['RETURN_REVERSAL', 'RETURN_RESTORE'] } },
      select: { type: true, points: true },
    });
    const alreadyReversed = -applied.filter((a) => a.type === 'RETURN_REVERSAL').reduce((s, a) => s + a.points, 0);
    const alreadyRestored = applied.filter((a) => a.type === 'RETURN_RESTORE').reduce((s, a) => s + a.points, 0);
    await tx.$queryRaw`SELECT "id" FROM "customers" WHERE "id" = ${sale.customerId} AND "tenantId" = ${tenantId} FOR UPDATE`;
    const customer = await tx.customer.findFirst({ where: { id: sale.customerId, tenantId }, select: { loyaltyPoints: true } });
    if (!customer) return null;
    const adj = loyaltyAdjustmentForRefund({
      pointsEarned, pointsRedeemed, saleTotal: sale.total,
      refundedSoFar, alreadyReversed, alreadyRestored, balance: customer.loyaltyPoints,
    });
    if (adj.restore > 0) {
      await tx.loyaltyTransaction.create({
        data: { customerId: sale.customerId, tenantId, points: adj.restore, type: 'RETURN_RESTORE', description: `Return ${ret.returnNumber}: redeemed points restored`, referenceId: ret.id },
      });
    }
    if (adj.reverse > 0 || adj.shortfall > 0) {
      await tx.loyaltyTransaction.create({
        data: {
          customerId: sale.customerId, tenantId, points: -adj.reverse, type: 'RETURN_REVERSAL', referenceId: ret.id,
          description: `Return ${ret.returnNumber}: earned points reversed${adj.shortfall > 0 ? ` (${adj.shortfall} could not be recovered: balance too low)` : ''}`,
        },
      });
    }
    const delta = adj.restore - adj.reverse;
    if (delta !== 0) await tx.customer.update({ where: { id: sale.customerId }, data: { loyaltyPoints: { increment: delta } } });
    return adj;
  }

  private async applyStockEffects(
    tenantId: string,
    ret: {
      id: string;
      branchId: string;
      originalSaleId: string;
      restockItems: boolean;
      returnType: string;
      exchangeData: unknown;
      items: { variantId: string; quantity: number }[];
    },
    userId: string,
    tx?: Prisma.TransactionClient,
  ) {
    if (ret.restockItems) {
      for (const item of ret.items) {
        await this.inventoryService.adjustStock(tenantId, ret.branchId, userId, {
          variantId: item.variantId,
          quantity: item.quantity,
          movementType: StockMovementType.RETURN,
          referenceId: ret.id,
          referenceType: 'Return',
        }, tx);
      }
    }
    if (ret.returnType === 'EXCHANGE') {
      const exchangeData = (ret.exchangeData as { variantId?: string; quantity?: number }[]) ?? [];
      for (const item of exchangeData) {
        if (item?.variantId && item.quantity) {
          await this.inventoryService.adjustStock(tenantId, ret.branchId, userId, {
            variantId: item.variantId,
            quantity: item.quantity,
            movementType: StockMovementType.SALE,
            referenceId: ret.id,
            referenceType: 'ReturnExchange',
          }, tx);
        }
      }
    }

    const client = tx ?? this.prisma;
    const sale = await client.sale.findFirst({
      where: { id: ret.originalSaleId, tenantId },
      include: { items: true },
    });
    if (!sale) return;

    const approvedReturns = await client.return.findMany({
      where: {
        tenantId,
        originalSaleId: ret.originalSaleId,
        status: ReturnStatus.APPROVED,
        id: { not: ret.id },
      },
      include: { items: true },
    });

    const returnedByVariant = new Map<string, number>();
    for (const r of approvedReturns) {
      for (const item of r.items) {
        returnedByVariant.set(item.variantId, (returnedByVariant.get(item.variantId) ?? 0) + item.quantity);
      }
    }
    for (const item of ret.items) {
      returnedByVariant.set(item.variantId, (returnedByVariant.get(item.variantId) ?? 0) + item.quantity);
    }

    const fullyReturned = areSaleLinesFullyReturned(sale.items, returnedByVariant);

    await client.sale.update({
      where: { id: ret.originalSaleId },
      data: { status: fullyReturned ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
    });
  }

  async findAll(tenantId: string, query: PaginationDto) {
    await assertShopModule(this.prisma, tenantId, 'returns');
    const { skip, take } = getPaginationArgs(query.page, query.limit);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.return.findMany({
        where: { tenantId }, skip, take,
        include: {
          items: { include: { variant: { include: { product: { select: { name: true } } } } } },
          originalSale: { select: { invoiceNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.return.count({ where: { tenantId } }),
    ]);
    return paginate(data, total, query.page ?? 1, query.limit ?? 20);
  }

  async findOne(id: string, tenantId: string) {
    await assertShopModule(this.prisma, tenantId, 'returns');
    const ret = await this.prisma.return.findFirst({
      where: { id, tenantId },
      include: {
        items: { include: { variant: { include: { product: { select: { name: true } } } } } },
        originalSale: { select: { invoiceNumber: true, total: true, customer: { select: { firstName: true, lastName: true } } } },
      },
    });
    if (!ret) throw new NotFoundException('Return not found');
    return ret;
  }

  async updateStatus(id: string, tenantId: string, status: ReturnStatus, userId: string) {
    await assertShopModule(this.prisma, tenantId, 'returns');
    const ret = await this.findOne(id, tenantId);
    const r = ret as any;
    if (!canChangeReturnStatus(r.status, status)) {
      throw new BadRequestException(`A ${String(r.status).toLowerCase()} return cannot be changed to ${String(status).toLowerCase()}`);
    }

    if (status === ReturnStatus.APPROVED && r.status === ReturnStatus.INITIATED) {
      await this.applyStockEffects(tenantId, {
        id: r.id,
        branchId: r.branchId,
        originalSaleId: r.originalSaleId,
        restockItems: r.restockItems,
        returnType: r.returnType,
        exchangeData: r.exchangeData,
        items: r.items,
      }, userId);
    }

    return this.prisma.return.update({
      where: { id },
      data: { status, ...(status === ReturnStatus.APPROVED && { approvedBy: userId }) },
    });
  }
}

@ApiTags('Returns')
@ApiBearerAuth('access-token')
@Controller({ path: 'returns', version: '1' })
export class ReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Post()
  @RequirePermissions('sales:create')
  @ApiOperation({ summary: 'Create a return or exchange' })
  create(
    @CurrentUser() user: IAuthUser,
    @Body() dto: CreateReturnDto,
    @Headers('x-pos-cashier-token') unlockToken?: string,
    @Headers('x-pos-counter-id') counterId?: string,
    @Headers('x-cash-approval-token') approvalToken?: string,
  ) {
    return this.returnsService.create(
      user.tenantId,
      user.branchId ?? '',
      { user: { id: user.id, roles: user.roles ?? [] }, unlockToken, approvalToken },
      dto,
      { counterId: counterId || undefined },
    );
  }

  @Get()
  @RequirePermissions('sales:read')
  findAll(@CurrentUser() user: IAuthUser, @Query() query: PaginationDto) {
    return this.returnsService.findAll(user.tenantId, query);
  }

  @Get(':id')
  @RequirePermissions('sales:read')
  findOne(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.returnsService.findOne(id, user.tenantId);
  }

  @Put(':id/status')
  @RequirePermissions('sales:update')
  updateStatus(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() body: ReturnStatusDto) {
    return this.returnsService.updateStatus(id, user.tenantId, body.status, user.id);
  }
}

@Module({
  imports: [InventoryModule, CustomersModule, DocumentNumberingModule],
  controllers: [ReturnsController],
  providers: [ReturnsService],
  exports: [ReturnsService],
})
export class ReturnsModule {}
