import { escapeLike, normalizeSearch, textSearch } from '@/shared/search.helper';
import { Module } from '@nestjs/common';
import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, HttpCode, HttpStatus, Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException, HttpException, Logger } from '@nestjs/common';
import { PinLockoutService } from '@/shared/security/pin-lockout.service';
import { IsString, IsOptional, IsNumber, IsEnum, IsArray, IsInt, Min, ValidateNested, IsBoolean, IsObject, IsDateString, Matches, MaxLength, ArrayMaxSize, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PaymentMethod, SaleStatus, StockMovementType, PaymentStatus, CashRegisterStatus, GiftVoucherStatus, ChequeDirection, ChequeStatus, BankTxnType, BankTxnStatus, ReloadCardStatus, ReloadSaleType, ReturnReason, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { NoCardNumber } from '@/shared/security/card-number.validator';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { OptionalNotesDto } from '@/common/dto/notes.dto';
import { InventoryService } from '@/modules/inventory/inventory.module';
import { InventoryModule } from '@/modules/inventory/inventory.module';
import { DocumentNumberingModule } from '@/modules/document-numbering/document-numbering.module';
import { DocumentNumberingService } from '@/modules/document-numbering/document-numbering.service';
import { PricingModule } from '@/modules/pricing/pricing.module';
import { PricingService } from '@/modules/pricing/pricing.service';
import {
  breakdownCartLine,
  resolveUnitPrice,
} from '@/modules/pricing/pricing.helper';
import {
  canOverridePosPrice,
  describePosPriceViolation,
  findPosPriceViolation,
  PosCatalogPriceContext,
} from '@/modules/pricing/pos-price-guard.helper';
import {
  CLIENT_REQUEST_ID_PATTERN,
  decideSaleReplay,
  isClientRequestIdConflict,
  normalizeClientRequestId,
  saleRequestFingerprint,
} from './pos-idempotency.helper';
import {
  catalogCustomLineRejection,
  catalogReloadLineRejection,
  customLineNeedsManager,
} from './pos-reload-guard.helper';
import {
  parseScaleBarcode as parseScaleBarcodeValue,
  sameScalePrice,
  sameScaleQuantity,
  scaleBarcodeMatchesKnownKeys,
  scaleBarcodeQuantity,
  resolveScaleBarcodeMode,
  ScaleBarcodeMode,
} from './pos-scale-barcode.helper';
import { billDiscountRejection } from './pos-bill-discount.helper';
import { heldBillScopeWhere, holdBillDataRejection } from './pos-hold.helper';
import { assertShopModule } from '@/shared/shop-module.helper';
import { paymentLineReferences, preparePaymentLines } from './pos-payment-lines.helper';
import { assertQrCodesForPayments } from '@/modules/payment-qr/payment-qr.helper';
import { enqueueOutboxInTx } from '@/modules/accounting/accounting-outbox.tx';
import { resolveQrFeeSettings, type QrFeeResult } from '@/shared/qr-fee.helper';
import { computeQrFeeCents } from '@/shared/qr-fee-cents.helper';
import { formatShelfLocationLabel } from '@/modules/clothing/clothing.helpers';
import { buildPaymentsSummary } from './pos-sale.helpers';
import { applyGiftVoucherRedeem, computeHelperCommission, computeReloadCommission, generateGiftVoucherCode, maskReloadPin, round2 } from './pos-phase6.helper';
import { decideSaveChange, resolveSaveChangeSettings, walletDebitFloor } from './pos-save-change.helper';
import { assertCreditAvailable } from '@/modules/customers/customer-credit.helper';
import { computeChargeDueDate } from '@/modules/customers/customer-credit.helper';
import { splitCustomerAccountTender } from './pos-customer-account.helper';
import { chequeSourceNotes } from '@/modules/accounting/finance.helper';
import { nanoid } from 'nanoid';
import { isWholeReloadQuantity } from './pos-reload-guard.helper';
import { fractionalQuantityRejection } from './pos-quantity.helper';
import { PRICE_OVERRIDE_REASON_MAX, annotateOverrides, buildMrpOverrideAudit, priceOverrideReasonError } from './pos-price-override.helper';
import { recordSaleCashMovement, findOpenRegister, ensureCashierWallet, summarizeMovements, computeExpectedCashFromMovements, netCashFromSalePayments } from '@/shared/cash-register.helper';
import { canViewAllPosSales } from '@/shared/pos-sales-scope.helper';
import { shopDateString, shopDayBounds } from '@/shared/day-end-report.helper';
import { ReturnsModule, ReturnsService } from '@/modules/returns/returns.module';
import { bypassesWorkflowApproval } from '@/shared/workflow-bypass.helper';
import { exactStockOfRow } from '@/shared/exact-stock.helper';
import {
  assertValidPosPin,
  hashPosPin,
  resolveActingCashierId,
  signPosUnlockToken,
  verifyPosPinHash,
} from './pos-pin.helper';
import * as dayjs from 'dayjs';

export class ReturnItemDto {
  @ApiProperty() @IsString() variantId: string;
  @ApiProperty() @IsNumber() @Min(0.001) quantity: number;
  @ApiProperty() @IsNumber() unitPrice: number;
  @ApiProperty() @IsString() productName: string;
  @ApiProperty() @IsString() variantName: string;
  @ApiProperty() @IsString() sku: string;
}

export class ReturnSaleDto {
  @ApiProperty({ description: 'Stable key reused when retrying the same return attempt' })
  @IsString() @Matches(CLIENT_REQUEST_ID_PATTERN, { message: 'clientRequestId must be 8–64 chars of A-Z a-z 0-9 _ -' })
  clientRequestId: string;
  @ApiProperty() @IsString() originalSaleId: string;
  @ApiProperty({ type: [ReturnItemDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => ReturnItemDto) items: ReturnItemDto[];
  @ApiPropertyOptional({ enum: ReturnReason }) @IsOptional() @IsEnum(ReturnReason) reason?: ReturnReason;
  @ApiPropertyOptional() @IsOptional() @IsString() refundMethod?: string;
}

/** Interactive-transaction limits for createSale (see QA-005 note at the call site). */
export const SALE_TX_MAX_WAIT_MS = 10_000;
export const SALE_TX_TIMEOUT_MS = 30_000;

export class SaleItemDto {
  @ApiPropertyOptional() @IsOptional() @IsString() variantId?: string;
  @ApiPropertyOptional({ type: [String], maxItems: 50 }) @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) scaleBarcodes?: string[];
  /** When true (or variantId omitted), line is bill-only — no catalog / stock. */
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isCustom?: boolean;
  @ApiProperty() @IsNumber() @Min(0.001) quantity: number;
  @ApiProperty() @IsNumber() @Min(0) unitPrice: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) discount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() discountType?: string;
  @ApiProperty() @IsNumber() @Min(0) costPrice: number;
  @ApiProperty() @IsString() productName: string;
  @ApiProperty() @IsString() variantName: string;
  @ApiProperty() @IsString() sku: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() taxRate?: number;
  /** DIGITAL | PHYSICAL — when set, creates ReloadSale ledger rows. */
  @ApiPropertyOptional() @IsOptional() @IsEnum(ReloadSaleType) reloadType?: ReloadSaleType;
  @ApiPropertyOptional() @IsOptional() @IsString() reloadOperatorId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reloadDenominationId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reloadMsisdn?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) reloadFaceValue?: number;
}

export class UpsertReloadOperatorDto {
  @ApiPropertyOptional() @IsOptional() @IsString() code?: string;
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) digitalCommissionPct?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) physicalCommissionPct?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
}

export class UpdateReloadOperatorDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) digitalCommissionPct?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) physicalCommissionPct?: number;
  /** Empty string clears the link. */
  @ApiPropertyOptional() @IsOptional() @IsString() quickPayUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
}

export class ImportReloadCardsDto {
  @ApiProperty() @IsString() operatorId: string;
  @ApiProperty() @IsString() denominationId: string;
  /** One PIN per line, or comma/space separated. */
  @ApiProperty() @IsString() pins: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) purchaseCost?: number;
}

export class SalePaymentDto {
  @ApiProperty({ enum: PaymentMethod }) @IsEnum(PaymentMethod) method: PaymentMethod;
  @ApiProperty() @IsNumber() @Min(0) amount: number;
  @ApiPropertyOptional({ maxLength: 64 }) @IsOptional() @IsString() @MaxLength(64) @NoCardNumber() reference?: string;
  /** Required for BANK_TRANSFER and QR — Accounting bank account that receives the funds. */
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) bankAccountId?: string;
  /** QR payments: the configured QR code shown to the customer (must belong to bankAccountId). */
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) qrCodeId?: string;
  /** QR payments: the fee (LKR) shown to the customer. The server computes the fee itself and refuses the sale (409) if it differs. */
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) expectedQrFee?: number;
  /** CARD payments: exactly the last 4 digits. Never the full card number or CVV. */
  @ApiPropertyOptional({ example: '1234' }) @IsOptional() @IsString() @MaxLength(4) cardLast4?: string;
}

export class CreateSaleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() customerId?: string;
  // A sale needs at least one line: an empty cart used to create a real invoice number and a total-0 sale.
  @ApiProperty({ type: [SaleItemDto] }) @IsArray() @ArrayMinSize(1, { message: 'A sale needs at least one item' }) @ValidateNested({ each: true }) @Type(() => SaleItemDto) items: SaleItemDto[];
  @ApiProperty({ type: [SalePaymentDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => SalePaymentDto) payments: SalePaymentDto[];
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) discountAmount?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) loyaltyPointsToRedeem?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() couponCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() heldBillId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowPartialPayment?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() applyTierDiscount?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() helperEmployeeId?: string;
  /** Required when an authorised user sells ABOVE the maximum (MRP) price: why. Stored on the sale and audited. */
  @ApiPropertyOptional({ description: 'Reason for selling above the maximum price (required for that override)' })
  @IsOptional() @IsString() @MaxLength(PRICE_OVERRIDE_REASON_MAX) @NoCardNumber() priceOverrideReason?: string;
  /** Idempotency key — one per checkout attempt, re-sent unchanged on retry. */
  @ApiPropertyOptional({ description: 'Idempotency key (8–64 chars A-Z a-z 0-9 _ -), reused on retry' })
  @IsOptional() @IsString() @Matches(CLIENT_REQUEST_ID_PATTERN, { message: 'clientRequestId must be 8–64 chars of A-Z a-z 0-9 _ -' })
  clientRequestId?: string;
  /** Amount of change to save to the customer's wallet (store credit). */
  @ApiPropertyOptional({ description: 'Amount of change to save to the customer wallet' })
  @IsOptional() @IsNumber() @Min(0) saveChangeAmount?: number;
  /** Customer explicitly consented to saving change to their wallet. Must be true. */
  @ApiPropertyOptional({ description: 'Customer consent to save change to wallet' })
  @IsOptional() @IsBoolean() saveChangeConsent?: boolean;
  /** Credit / Wallet tender with cash above the bill: the extra goes to the customer's wallet (no shop setting / consent step). */
  @IsOptional() @IsBoolean() overpayToWallet?: boolean;
}

export class IssueGiftVoucherDto {
  @ApiProperty() @IsNumber() @Min(1) amount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() code?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() issuedToName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() issuedToCustomerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() expiresAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class SetPosPinDto {
  @ApiProperty({ example: '1234' }) @IsString() pin: string;
}

export class UnlockPosPinDto {
  @ApiProperty({ example: '1234' }) @IsString() pin: string;
}

export class HoldBillDto {
  @ApiPropertyOptional() @IsOptional() @IsString() label?: string;
  @ApiProperty() @IsObject() data: Record<string, unknown>;
}

@Injectable()
export class PosService {
  private readonly logger = new Logger(PosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly numbering: DocumentNumberingService,
    private readonly pricing: PricingService,
    private readonly eventEmitter: EventEmitter2,
    private readonly pinLockout: PinLockoutService,
    private readonly returnsService: ReturnsService,
  ) {}

  /** Wrong-PIN limits per terminal login (Redis, shared by all API instances): see PinLockoutService. */
  static readonly UNLOCK_MAX_FAILS = 10;
  static readonly PIN_SET_MAX_FAILS = 5;

  private async reservePinAttempt(scope: string, max: number) {
    const attempt = await this.pinLockout.begin(scope, Date.now(), max);
    if (!attempt.allowed) {
      const minutes = Math.max(1, Math.ceil((attempt.lockedUntil - Date.now()) / 60000));
      throw new HttpException(
        { statusCode: 429, error: 'PIN_LOCKED', message: `Too many wrong PINs on this terminal. Try again in ${minutes} minute(s) or sign in with a password.` },
        429,
      );
    }
  }

  async resolveBranchId(tenantId: string, branchId: string): Promise<string> {
    if (branchId) return branchId;
    const branch = await this.prisma.branch.findFirst({ where: { tenantId }, select: { id: true } });
    if (!branch) throw new NotFoundException('No branch found for this tenant');
    return branch.id;
  }

  /**
   * Existing sale for an idempotency key, in the same shape createSale returns.
   * Null when the key is unused; ConflictException when it belongs to another cart / cashier / branch.
   */
  private async findSaleReplay(
    tenantId: string,
    branchId: string,
    cashierId: string,
    clientRequestId: string,
    fingerprint: string,
  ) {
    const existing = await this.prisma.sale.findFirst({
      where: { tenantId, clientRequestId },
      include: { items: true, payments: true, customer: true },
    });
    if (!existing) return null;
    const decision = decideSaleReplay(existing, { branchId, cashierId, fingerprint });
    if (decision.kind === 'CONFLICT') throw new ConflictException(decision.reason);
    return Object.assign(existing, { idempotentReplay: true as const });
  }

  /** Bank accounts and QR codes named by any payment line must be this shop's (active) ones. */
  private async assertPaymentReferences(
    tenantId: string,
    branchId: string,
    refs: { bankAccountIds: string[]; qr: { qrCodeId: string; bankAccountId?: string }[] },
  ) {
    if (refs.bankAccountIds.length) {
      const found = await this.prisma.bankAccount.count({ where: { tenantId, id: { in: refs.bankAccountIds }, isActive: true } });
      if (found !== refs.bankAccountIds.length) {
        throw new BadRequestException('One or more bank accounts are invalid or inactive');
      }
    }
    await assertQrCodesForPayments(
      this.prisma,
      tenantId,
      branchId,
      refs.qr.map((q) => ({ method: PaymentMethod.QR, qrCodeId: q.qrCodeId, bankAccountId: q.bankAccountId })),
    );
  }

  async createSale(
    tenantId: string,
    branchId: string,
    cashierId: string,
    dto: CreateSaleDto,
    counterId?: string | null,
    /** Held-bill scope of the caller (managers / admins may resume any hold of the branch, like GET /pos/hold). */
    holdScope?: { scopeAll?: boolean },
  ) {
    const resolvedBranchId = await this.resolveBranchId(tenantId, branchId);
    branchId = resolvedBranchId;

    // Idempotency: a retry with the same key returns the original sale with no new side effects.
    const clientRequestId = normalizeClientRequestId(dto.clientRequestId);
    const requestFingerprint = clientRequestId ? saleRequestFingerprint(dto) : null;
    if (clientRequestId) {
      const replay = await this.findSaleReplay(tenantId, branchId, cashierId, clientRequestId, requestFingerprint!);
      if (replay) return replay;
    }

    // Every payment line is validated (whatever its amount) and every bank account / QR code it names is
    // checked against this shop BEFORE anything is written; zero-amount lines are then not saved.
    // (The idempotency fingerprint above is taken from the request as sent, so retries are unaffected.)
    const paymentRefs = paymentLineReferences(dto.payments);
    dto.payments = preparePaymentLines(dto.payments) as SalePaymentDto[];
    await this.assertPaymentReferences(tenantId, branchId, paymentRefs);

    // Invoice number allocated inside the sale transaction (engine) or just before (legacy)
    let invoiceNumber: string | null = null;
    if (!this.numbering.isEngineEnabled()) {
      invoiceNumber = await this.generateInvoiceNumberLegacy(tenantId);
    }

    for (const item of dto.items) {
      const customCatalogRejection = catalogCustomLineRejection(item);
      if (customCatalogRejection) throw new BadRequestException(customCatalogRejection);
      const isCustom = item.isCustom || !item.variantId?.trim() || item.variantId.startsWith('custom-');
      if (isCustom && item.scaleBarcodes?.length) {
        throw new BadRequestException('Scale barcode evidence can only be used with a catalog product.');
      }
      if (isCustom && item.reloadType && !item.reloadOperatorId) {
        throw new BadRequestException('Reload lines require a provider.');
      }
      // P-F21: every unit of a reload / recharge-card line is its own ReloadSale (a physical card has its own PIN), so
      // the quantity is a whole number of units. A fraction would be charged in full but recorded as fewer units.
      if (item.reloadType && !isWholeReloadQuantity(item.quantity)) {
        throw new BadRequestException('Reload and recharge-card quantity must be a whole number of units.');
      }
      if (isCustom && !item.productName?.trim()) {
        throw new BadRequestException('Custom bill items require a product name');
      }
    }
    if (dto.items.some(customLineNeedsManager)) {
      const roles = await this.prisma.userRole.findMany({
        where: { userId: cashierId, user: { tenantId } },
        select: { role: { select: { type: true } } },
      });
      const roleTypes = roles.map((row) => row.role.type);
      // Cashiers may sell Demo / bill-only lines too (owner decision), alongside the price-override roles.
      if (!canOverridePosPrice(roleTypes) && !roleTypes.includes('CASHIER')) {
        throw new ForbiddenException('Custom bill-only items require cashier or manager authorization.');
      }
    }

    const disguisedCatalogIds = dto.items.flatMap((item) => {
      const id = item.variantId?.trim() ?? '';
      return id.startsWith('custom-') && id.length > 'custom-'.length ? [id.slice('custom-'.length)] : [];
    });
    if (disguisedCatalogIds.length) {
      const disguisedCatalogItems = await this.prisma.productVariant.findMany({
        where: { id: { in: disguisedCatalogIds }, product: { tenantId } },
        select: { id: true },
      });
      if (disguisedCatalogItems.length) {
        throw new BadRequestException('A catalog variant cannot be submitted as a custom bill item.');
      }
    }

    // Stale cart / wiped catalog: fail early with a clear message instead of opaque FK 400
    const catalogVariantIds = [
      ...new Set(
        dto.items
          .filter((i) => !(i.isCustom || !i.variantId?.trim() || i.variantId.startsWith('custom-')))
          .map((i) => i.variantId!.trim()),
      ),
    ];
    const hasManualDiscount =
      (dto.discountAmount ?? 0) > 0 ||
      dto.items.some((item) => (item.discount ?? 0) > 0);
    // Owner decision: no manager approval for POS discounts. The cashier who applies it is recorded on the sale.
    const manualDiscountApprovedBy: string | null = hasManualDiscount ? cashierId : null;
    const priceOverrides: Array<{ variantId: string; unitPrice: number; limit: number; kind: string }> = [];
    if (catalogVariantIds.length > 0) {
      const found = await this.prisma.productVariant.findMany({
        where: { id: { in: catalogVariantIds }, product: { tenantId } },
        select: {
          id: true,
          sku: true,
          barcode: true,
          sellingPrice: true,
          costPrice: true,
          mrp: true,
          product: {
            select: {
              sellingPrice: true,
              wholesalePrice: true,
              costPrice: true,
              mrp: true,
              productKind: true,
              unit: true,
              allowDecimalSelling: true,
              barcode: true,
            },
          },
        },
      });
      const foundIds = new Set(found.map((v) => v.id));
      const missing = dto.items.filter(
        (i) =>
          !(i.isCustom || !i.variantId?.trim() || i.variantId.startsWith('custom-')) &&
          !foundIds.has(i.variantId!.trim()),
      );
      if (missing.length > 0) {
        const labels = missing
          .slice(0, 3)
          .map((i) => i.productName?.trim() || i.sku || i.variantId)
          .join(', ');
        const more = missing.length > 3 ? ` (+${missing.length - 3} more)` : '';
        throw new BadRequestException(
          `Cart has products no longer in catalog (${labels}${more}). Clear the cart and re-add items.`,
        );
      }

      // Server is the price authority: cost comes from the catalog, and cashier-entered prices
      // must stay between cost and the highest known price (MRP / selling / PO) unless a
      // manager or admin is the acting cashier.
      const purchasePrices = await this.attachPurchasePriceOptions(tenantId, catalogVariantIds, Number.POSITIVE_INFINITY);
      const priceCtx = new Map<string, PosCatalogPriceContext>();
      for (const v of found) {
        const po = purchasePrices.get(v.id) ?? [];
        const unit = (v.product.unit ?? '').trim().toLowerCase();
        priceCtx.set(v.id, {
          knownPrices: [
            v.sellingPrice,
            v.product.sellingPrice,
            v.product.wholesalePrice,
            ...po.map((p) => p.sellingPrice),
          ],
          mrp: Math.max(v.mrp ?? 0, v.product.mrp ?? 0, ...po.map((p) => p.mrp ?? 0)),
          costPrice: v.costPrice > 0 ? v.costPrice : v.product.costPrice,
          isWeighted:
            v.product.productKind === 'WEIGHTED' ||
            ['kg', 'g', 'gram', 'grams', 'kilogram', 'kilograms'].includes(unit),
        });
      }

      const cashierRoles = await this.prisma.userRole.findMany({
        where: { userId: cashierId, user: { tenantId } },
        select: { role: { select: { type: true } } },
      });
      // Owner decision: no manager approval for POS prices. Above-MRP / below-cost lines are still recorded as audited overrides.
      void canOverridePosPrice(cashierRoles.map((r) => r.role.type));
      const canOverride = true;
      let scaleMode: ScaleBarcodeMode | null = null;

      for (const item of dto.items) {
        if (item.isCustom || !item.variantId?.trim() || item.variantId.startsWith('custom-')) continue;
        const ctx = priceCtx.get(item.variantId.trim());
        if (!ctx) continue;
        const variant = found.find((row) => row.id === item.variantId!.trim());
        if (!variant) continue;
        // P-F16: a piece good is sold in whole units (same rule the POS screen applies); scale-label lines are weighed goods.
        const fractionRejection = fractionalQuantityRejection(item.productName?.trim() || item.sku || 'Item', item.quantity, variant.product);
        if (fractionRejection) throw new BadRequestException(fractionRejection);
        if (item.scaleBarcodes?.length) {
          if (!ctx.isWeighted) {
            throw new BadRequestException('Scale barcode evidence is only valid for a weighed catalog product.');
          }
          const parsed = item.scaleBarcodes.map((code) => this.parseScaleBarcode(code));
          if (parsed.some((scale) => !scale)) {
            throw new BadRequestException('A scale barcode is invalid or has an incorrect check digit.');
          }
          const knownKeys = [
            variant.sku,
            variant.barcode,
            variant.product.barcode,
          ].flatMap((key) => this.barcodeLookupKeys(key ?? ''));
          if (parsed.some((scale) => !scale || !scaleBarcodeMatchesKnownKeys(scale, knownKeys))) {
            throw new BadRequestException('Scale barcode does not identify the selected catalog product.');
          }
          // The shop's label-scale encoding (Settings -> POS); unset keeps the original price-or-weight behaviour.
          scaleMode ??= resolveScaleBarcodeMode(
            (await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } }))?.settings,
          );
          const mode = scaleMode;
          const expectedQuantity = parsed.reduce((sum, scale) => {
            if (!scale) return Number.NaN;
            const quantity = scaleBarcodeQuantity(scale, variant.sellingPrice, mode);
            return quantity === null ? Number.NaN : sum + quantity;
          }, 0);
          const roundedQuantity = Math.round((expectedQuantity + Number.EPSILON) * 1000) / 1000;
          if (!Number.isFinite(roundedQuantity) || !sameScaleQuantity(item.quantity, roundedQuantity)) {
            throw new BadRequestException('Scale barcode quantity does not match the weighed quantity.');
          }
          if (!sameScalePrice(item.unitPrice, variant.sellingPrice)) {
            throw new BadRequestException('Scale barcode price must use the catalog selling price.');
          }
          item.quantity = roundedQuantity;
          item.unitPrice = round2(variant.sellingPrice);
        }
        item.costPrice = ctx.costPrice;
        // Reload lines are bill-only (custom) lines; a catalog line flagged as a reload would skip the guard (P-F1).
        const reloadRejection = catalogReloadLineRejection(item);
        if (reloadRejection) throw new BadRequestException(reloadRejection);
        const violation = findPosPriceViolation(item, ctx);
        if (!violation) continue;
        if (!canOverride) {
          throw new BadRequestException(
            describePosPriceViolation(item.productName?.trim() || item.sku, violation),
          );
        }
        priceOverrides.push({ variantId: item.variantId.trim(), ...violation });
      }
      // Above-MRP overrides are audited: the authorised user must say why (checked before anything is written).
      const reasonError = priceOverrideReasonError(priceOverrides, dto.priceOverrideReason);
      if (reasonError) throw new BadRequestException(reasonError);
    }

    let customerRecord: { id: string; firstName: string; lastName: string | null; loyaltyPoints: number; walletBalance: number; creditLimit: number; creditBalance: number; creditDays: number; tier: import('@prisma/client').CustomerTier } | null = null;
    if (dto.customerId) {
      customerRecord = await this.prisma.customer.findFirst({
        where: { id: dto.customerId, tenantId },
        select: { id: true, firstName: true, lastName: true, loyaltyPoints: true, walletBalance: true, creditLimit: true, creditBalance: true, creditDays: true, tier: true },
      });
      if (!customerRecord) throw new BadRequestException('Customer not found');
    }

    if (dto.customerId && dto.loyaltyPointsToRedeem) {
      await assertShopModule(this.prisma, tenantId, 'loyalty');
    }

    let priced;
    try {
      priced = await this.pricing.calculateCheckout(tenantId, {
        items: dto.items.map((item) => ({
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          discount: item.discount,
          discountType: item.discountType,
          taxRate: item.taxRate,
        })),
        manualDiscount: dto.discountAmount ?? 0,
        couponCode: dto.couponCode,
        customerTier: customerRecord?.tier,
        applyTierDiscount: dto.applyTierDiscount !== false && !!customerRecord,
        loyaltyPointsToRedeem: dto.loyaltyPointsToRedeem,
        availableLoyaltyPoints: customerRecord?.loyaltyPoints ?? 0,
      });
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }

    // P-F2 (cap only): the bill discount can never exceed what is being sold (no LKR 0 sale from one field).
    const discountRejection = billDiscountRejection({
      manualDiscount: dto.discountAmount,
      subtotal: priced.subtotal,
      taxAmount: priced.taxAmount,
      couponDiscount: priced.couponDiscount,
      tierDiscount: priced.tierDiscount,
    });
    if (discountRejection) throw new BadRequestException(discountRejection);

    const subtotal = priced.subtotal;
    const taxAmount = priced.taxAmount;
    const couponDiscount = priced.couponDiscount;
    const tierDiscount = priced.tierDiscount;
    const totalDiscount = priced.orderDiscountTotal;
    const roundOff = priced.roundOff;
    const finalTotal = priced.finalTotal;
    const loyaltyDiscount = priced.loyaltyDiscount;
    const pointsRedeemed = priced.pointsRedeemed;
    let pointsEarned = priced.pointsEarned;
    const amountDue = priced.amountDue;
    const promotionId = priced.promotionId;
    let totalPaid = dto.payments.reduce((s, p) => s + p.amount, 0);
    const walletPayments = dto.payments.filter((p) => p.method === PaymentMethod.WALLET);
    let walletTotal = walletPayments.reduce((s, p) => s + p.amount, 0);
    const creditPayments = dto.payments.filter((p) => p.method === PaymentMethod.CUSTOMER_CREDIT);
    let creditPayTotal = creditPayments.reduce((s, p) => s + p.amount, 0);
    const unifiedAccountSelected = creditPayTotal > 0;

    if (walletTotal > 0) {
      if (!dto.customerId) throw new BadRequestException('Customer required for wallet payment');
      if (!customerRecord || customerRecord.walletBalance < walletDebitFloor(walletTotal)) {
        throw new BadRequestException('Insufficient wallet balance');
      }
    }

    if (creditPayTotal > 0 && !dto.customerId) {
      throw new BadRequestException('Customer required for credit payment');
    }

    let isPartial = totalPaid + 0.01 < amountDue;
    let partialCredit = isPartial ? amountDue - totalPaid : 0;
    if (isPartial && creditPayTotal <= 0.01) {
      throw new BadRequestException(
        'Payment is short. Cash, card, bank, QR, and cheque payments cannot be moved to customer credit or wallet; select Customer Credit for the unpaid amount.',
      );
    }

    if (isPartial) {
      if (!dto.customerId || !customerRecord) {
        throw new BadRequestException(
          'Customer required for partial payment — unpaid balance is charged to customer credit',
        );
      }
      if (!unifiedAccountSelected && customerRecord.creditLimit <= 0) {
        throw new BadRequestException(
          'Customer has no credit limit — set a limit or collect the full amount',
        );
      }
    }

    if (isPartial && !dto.allowPartialPayment) {
      throw new BadRequestException(`Payment short by LKR ${(amountDue - totalPaid).toFixed(2)}. Enable partial payment or add more.`);
    }

    let changeDue = Math.max(0, totalPaid - amountDue);
    const cashPaidTotal = dto.payments
      .filter((p) => p.method === PaymentMethod.CASH)
      .reduce((s, p) => s + p.amount, 0);
    if (changeDue > 0.01 && cashPaidTotal + 0.01 < changeDue) {
      throw new BadRequestException(
        'Overpayment must include enough cash to give the customer change; reduce the non-cash payment.',
      );
    }
    let paymentStatus = isPartial ? PaymentStatus.PENDING : PaymentStatus.COMPLETED;
    let paymentMethods = dto.payments.map((p) => p.method);

    // ── Save change to customer wallet ──────────────────────────────────
    // Resolve settings eagerly (also used by QR fees below).
    const tenantRowForSettings = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
    const saveChangeSettings = resolveSaveChangeSettings(tenantRowForSettings?.settings);
    const overpayToWallet = dto.overpayToWallet === true && !!dto.customerId;
    if (round2(dto.saveChangeAmount ?? 0) > 0 && !unifiedAccountSelected && !overpayToWallet) {
      throw new BadRequestException('Customer wallet changes require the Credit / Wallet payment method.');
    }
    const saveChangeDecision = decideSaveChange({
      requested: dto.saveChangeAmount,
      consent: dto.saveChangeConsent || overpayToWallet,
      customerId: dto.customerId,
      changeDue,
      cashPaid: cashPaidTotal,
      isPartial,
      creditPayTotal,
      // Owner decision: paying more than the bill on Credit / Wallet puts the extra on the wallet, whatever the shop's save-change settings.
      settings: overpayToWallet ? { enabled: true, min: 0, max: null } : saveChangeSettings,
    });
    if (!saveChangeDecision.ok) {
      // A positive request that was refused → reject the sale so the cashier knows.
      const requestedAmt = round2(dto.saveChangeAmount ?? 0);
      if (requestedAmt > 0) {
        throw new BadRequestException(saveChangeDecision.reason);
      }
    }
    const changeSavedToWallet = saveChangeDecision.ok ? saveChangeDecision.amount : 0;

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

    // Validate references before opening the transaction; balances are re-read under a
    // row lock inside the transaction so concurrent checkouts cannot overspend a voucher.
    const giftPays = dto.payments.filter((p) => p.method === PaymentMethod.GIFT_VOUCHER);
    const giftAmounts = new Map<string, number>();
    for (const gp of giftPays) {
      const code = (gp.reference ?? '').trim().toUpperCase();
      if (!code) throw new BadRequestException('Gift voucher code required in payment reference');
      giftAmounts.set(code, (giftAmounts.get(code) ?? 0) + gp.amount);
    }

    const chequePays = dto.payments.filter((p) => p.method === PaymentMethod.CHEQUE && p.amount > 0);
    for (const cp of chequePays) {
      if (!(cp.reference ?? '').trim()) {
        throw new BadRequestException('Cheque number required in payment reference for CHEQUE payments');
      }
    }

    // Card digits (exactly 4) and stray card / bank / QR fields were handled by preparePaymentLines.

    const bankTenderPays = dto.payments.filter(
      (p) =>
        (p.method === PaymentMethod.BANK_TRANSFER || p.method === PaymentMethod.QR) &&
        p.amount > 0,
    );
    for (const bp of bankTenderPays) {
      if (!(bp.bankAccountId ?? '').trim()) {
        throw new BadRequestException(
          `${bp.method === PaymentMethod.QR ? 'QR' : 'Bank transfer'} requires selecting a bank account`,
        );
      }
    }
    const bankAccountIds = [...new Set(bankTenderPays.map((p) => p.bankAccountId!.trim()))];
    const bankAccounts =
      bankAccountIds.length > 0
        ? await this.prisma.bankAccount.findMany({
            where: { tenantId, id: { in: bankAccountIds }, isActive: true },
            select: { id: true, name: true, code: true },
          })
        : [];
    if (bankAccounts.length !== bankAccountIds.length) {
      throw new BadRequestException('One or more bank accounts are invalid or inactive');
    }
    await assertQrCodesForPayments(this.prisma, tenantId, branchId, bankTenderPays);

    // QR fee (deducted by the bank from each QR tender; the invoice total and the amount the customer pays are
    // unchanged): worked out here from the shop settings of this moment and stored with the payment (gross,
    // percentage, fee, net). It is never recomputed later (settings changes do not touch past sales) and a retry
    // of this sale returns the stored sale before reaching this point, so the fee can only be applied once.
    const qrFees = new Map<SalePaymentDto, QrFeeResult>();
    const qrLines = dto.payments.filter((p) => p.method === PaymentMethod.QR && p.amount > 0);
    if (qrLines.length > 0) {
      const feeSettings = resolveQrFeeSettings(tenantRowForSettings?.settings);
      for (const p of qrLines) {
        const fee = computeQrFeeCents(p.amount, feeSettings);
        if (p.expectedQrFee != null && Math.round(p.expectedQrFee * 100) !== Math.round(fee.feeAmount * 100)) {
          throw new ConflictException(
            `The QR fee changed: the screen showed LKR ${p.expectedQrFee.toFixed(2)}, it is now LKR ${fee.feeAmount.toFixed(2)}. Review the QR payment and confirm again.`,
          );
        }
        qrFees.set(p, fee);
      }
    }

    // P-F10: the held bill being checked out must be one this cashier may use (tenant + branch, own hold
    // unless manager / admin). Checked before any write; a foreign or unknown id is refused, so it can never
    // release another hold's stock reservation or delete another shop's / branch's held bill.
    const heldBillWhere = dto.heldBillId
      ? heldBillScopeWhere(dto.heldBillId, tenantId, branchId, { cashierId, scopeAll: holdScope?.scopeAll })
      : null;
    if (heldBillWhere) {
      const held = await this.prisma.heldBill.findFirst({ where: heldBillWhere, select: { id: true } });
      if (!held) {
        throw new NotFoundException('Held bill not found (it was removed, or belongs to another cashier or branch).');
      }
    }

    const outcome = await this.prisma.$transaction(async (tx) => {
      await this.inventoryService.assertSaleStockAvailable(
        tenantId,
        branchId,
        dto.items
          .filter((i) => !(i.isCustom || !i.variantId?.trim() || i.variantId.startsWith('custom-')))
          .map((i) => ({ variantId: i.variantId!, quantity: i.quantity })),
        dto.heldBillId,
        tx,
      );

      if (dto.customerId) {
        await tx.$queryRaw`
          SELECT "id" FROM "customers"
          WHERE "id" = ${dto.customerId} AND "tenantId" = ${tenantId}
          FOR UPDATE
        `;
        const lockedCustomer = await tx.customer.findFirst({
          where: { id: dto.customerId, tenantId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            loyaltyPoints: true,
            walletBalance: true,
            creditLimit: true,
            creditBalance: true,
            creditDays: true,
            tier: true,
          },
        });
        if (!lockedCustomer) throw new BadRequestException('Customer not found');
        customerRecord = lockedCustomer;

        if (unifiedAccountSelected) {
          if (lockedCustomer.walletBalance + 0.001 < walletTotal) {
            throw new ConflictException('Customer wallet changed during checkout. Refresh the customer account and retry.');
          }
          const otherTenderTotal = dto.payments
            .filter((p) => p.method !== PaymentMethod.CUSTOMER_CREDIT && p.method !== PaymentMethod.WALLET)
            .reduce((sum, p) => sum + p.amount, 0);
          const accountAmount = round2(amountDue - otherTenderTotal - walletTotal);
          if (accountAmount <= 0.009) {
            throw new BadRequestException('Credit / Wallet cannot be combined with an overpayment.');
          }
          if (creditPayTotal > accountAmount + 0.01) {
            throw new BadRequestException('Credit / Wallet amount exceeds the remaining bill amount.');
          }

          const allocation = splitCustomerAccountTender(
            accountAmount,
            lockedCustomer.walletBalance - walletTotal,
          );
          assertCreditAvailable(
            lockedCustomer.creditLimit,
            lockedCustomer.creditBalance,
            allocation.creditAmount,
          );

          dto.payments = dto.payments.filter((p) => p.method !== PaymentMethod.CUSTOMER_CREDIT);
          if (allocation.walletAmount > 0.009) {
            dto.payments.push({ method: PaymentMethod.WALLET, amount: allocation.walletAmount });
          }
          if (allocation.creditAmount > 0.009) {
            dto.payments.push({ method: PaymentMethod.CUSTOMER_CREDIT, amount: allocation.creditAmount });
          }
          walletTotal = round2(walletTotal + allocation.walletAmount);
          creditPayTotal = allocation.creditAmount;
          partialCredit = 0;
          isPartial = false;
          totalPaid = round2(dto.payments.reduce((sum, payment) => sum + payment.amount, 0));
          changeDue = Math.max(0, totalPaid - amountDue);
          paymentStatus = PaymentStatus.COMPLETED;
          paymentMethods = dto.payments.map((payment) => payment.method);
        }

        if (walletTotal > 0 && lockedCustomer.walletBalance < walletDebitFloor(walletTotal)) {
          throw new ConflictException('Customer wallet changed during checkout. Refresh the customer account and retry.');
        }
        const creditCharge = round2(creditPayTotal + partialCredit);
        if (creditCharge > 0.009) {
          assertCreditAvailable(lockedCustomer.creditLimit, lockedCustomer.creditBalance, creditCharge);
        }
      }

      // The wallet (shift) this sale is taken on — created only here, inside the sale transaction, after
      // every check: a refused checkout (bad payment, item, customer credit, voucher, stock…) rolls it back,
      // so it never leaves an empty cashier wallet behind. Stored on the sale for exact day-end collections.
      const wallet = await ensureCashierWallet(tx, tenantId, branchId, cashierId, counterId);

      for (const [code, requested] of giftAmounts) {
        const locked = await tx.$queryRaw<Array<{
          id: string;
          balance: number;
          status: GiftVoucherStatus;
          expiresAt: Date | null;
        }>>`
          SELECT "id", "balance", "status", "expiresAt"
          FROM "gift_vouchers"
          WHERE "tenantId" = ${tenantId}
            AND "code" = ${code}
            AND ("branchId" IS NULL OR "branchId" = ${branchId})
            AND "status" IN ('ACTIVE', 'PARTIALLY_USED')
          FOR UPDATE
        `;
        const voucher = locked[0];
        if (!voucher) throw new BadRequestException(`Gift voucher not found: ${code}`);
        if (voucher.expiresAt && voucher.expiresAt < new Date()) {
          throw new BadRequestException(`Gift voucher expired: ${code}`);
        }
        const redeem = applyGiftVoucherRedeem(voucher.balance, requested, requested);
        if (!redeem.ok) throw new BadRequestException(redeem.reason);
        if (Math.abs(redeem.applied - requested) > 0.02) {
          throw new BadRequestException(`Gift voucher ${code} can only apply LKR ${redeem.applied.toFixed(2)}`);
        }
        const updated = await tx.giftVoucher.updateMany({
          where: {
            id: voucher.id,
            tenantId,
            status: { in: [GiftVoucherStatus.ACTIVE, GiftVoucherStatus.PARTIALLY_USED] },
            balance: { gte: requested },
          },
          data: { balance: redeem.remainingBalance, status: redeem.status as GiftVoucherStatus },
        });
        if (updated.count !== 1) {
          throw new ConflictException(`Gift voucher ${code} was redeemed by another checkout. Please retry.`);
        }
      }

      const resolvedInvoice =
        invoiceNumber ??
        (await this.numbering.allocate(tx, tenantId, 'INVOICE', new Date()));

      const created = await tx.sale.create({
        data: {
          tenantId,
          branchId,
          customerId: dto.customerId,
          cashierId,
          helperEmployeeId,
          helperName,
          helperCommission,
          invoiceNumber: resolvedInvoice,
          clientRequestId,
          cashRegisterId: wallet.id,
          status: SaleStatus.COMPLETED,
          subtotal,
          discountAmount: totalDiscount,
          taxAmount,
          roundOff,
          loyaltyDiscount,
          total: amountDue,
          amountPaid: totalPaid,
          changeDue,
          changeSavedToWallet,
          paymentMethod: dto.payments[0]?.method ?? PaymentMethod.CASH,
          paymentStatus,
          pointsRedeemed,
          // Points are credited only to a customer (below); the sale records what it earned so a refund
          // can reverse it (was never stored: always 0).
          pointsEarned: dto.customerId ? pointsEarned : 0,
          notes: dto.notes,
          couponCode: dto.couponCode?.trim().toUpperCase() || null,
          couponDiscount,
          metadata: {
            tierDiscount,
            ...(manualDiscountApprovedBy ? { manualDiscountApprovedBy } : {}),
            paymentSummary: buildPaymentsSummary(paymentMethods),
            partialBalance: isPartial ? amountDue - totalPaid : 0,
            helperCommission,
            ...(priceOverrides.length ? { priceOverrides: annotateOverrides(priceOverrides, cashierId, dto.priceOverrideReason) } : {}),
            ...(requestFingerprint ? { requestFingerprint } : {}),
          },
          items: {
            create: dto.items.map((item) => {
              const line = breakdownCartLine({
                unitPrice: item.unitPrice,
                quantity: item.quantity,
                discount: item.discount,
                discountType: item.discountType,
                taxRate: item.taxRate,
              });
              const isCustom = item.isCustom || !item.variantId?.trim() || item.variantId.startsWith('custom-');
              return {
                variantId: isCustom ? null : item.variantId,
                productName: item.productName,
                variantName: isCustom ? (item.variantName || '') : item.variantName,
                sku: isCustom ? (item.sku || 'CUSTOM') : item.sku,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                costPrice: item.costPrice,
                discount: item.discount ?? 0,
                discountType: item.discountType ?? 'FIXED',
                taxRate: item.taxRate ?? 0,
                taxAmount: line.taxAmount,
                total: line.net,
              };
            }),
          },
          payments: {
            create: dto.payments.map((p) => ({
              method: p.method,
              amount: p.amount,
              reference: p.reference,
              bankAccountId:
                p.method === PaymentMethod.BANK_TRANSFER || p.method === PaymentMethod.QR
                  ? p.bankAccountId?.trim() || null
                  : null,
              qrCodeId: p.method === PaymentMethod.QR ? p.qrCodeId?.trim() || null : null,
              cardLast4: p.method === PaymentMethod.CARD ? p.cardLast4 ?? null : null,
              ...(qrFees.has(p)
                ? { feePercent: qrFees.get(p)!.feePercent, feeAmount: qrFees.get(p)!.feeAmount, netAmount: qrFees.get(p)!.netAmount }
                : {}),
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
        await this.pricing.recordCouponUsage(tx, promotionId);
      }

      if (dto.heldBillId) {
        await this.inventoryService.releaseReservations(tenantId, 'HELD_BILL', dto.heldBillId, true, tx);
      }

      for (const item of dto.items) {
        const isCustom = item.isCustom || !item.variantId?.trim() || item.variantId.startsWith('custom-');
        if (isCustom) continue;
        const stockLines = await this.inventoryService.expandSaleStockItems(
          tenantId,
          [{ variantId: item.variantId!, quantity: item.quantity }],
          tx,
        );
        for (const line of stockLines) {
          await this.inventoryService.adjustStock(tenantId, branchId, cashierId, {
            variantId: line.variantId,
            quantity: line.quantity,
            movementType: StockMovementType.SALE,
            referenceId: created.id,
            referenceType: 'Sale',
          }, tx);
        }
      }

      await this.recordReloadSalesFromItems(tx, tenantId, branchId, created.id, dto.items);

      if (dto.customerId && customerRecord) {
        const creditIncrement = creditPayTotal + partialCredit;
        const walletBalanceWhere = walletTotal > 0
          ? { walletBalance: { gte: walletDebitFloor(walletTotal) } }
          : {};
        const customerUpdate = await tx.customer.updateMany({
          where: { id: dto.customerId, tenantId, ...walletBalanceWhere },
          data: {
            totalSpent: { increment: amountDue },
            totalOrders: { increment: 1 },
            loyaltyPoints: { increment: pointsEarned - pointsRedeemed },
            lastPurchaseAt: new Date(),
            ...((walletTotal > 0 || changeSavedToWallet > 0)
              ? { walletBalance: { increment: round2(changeSavedToWallet - walletTotal) } }
              : {}),
            ...(creditIncrement > 0 ? { creditBalance: { increment: creditIncrement } } : {}),
          },
        });
        if (customerUpdate.count !== 1) {
          throw new BadRequestException('Insufficient wallet balance');
        }

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
              description: `POS sale ${created.invoiceNumber}`,
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
              description: `POS sale ${created.invoiceNumber}`,
              referenceId: created.id,
            },
          });
        }
        if (changeSavedToWallet > 0) {
          await tx.walletTransaction.create({
            data: {
              customerId: dto.customerId,
              tenantId,
              amount: changeSavedToWallet,
              type: 'CHANGE_SAVED',
              description: `Change saved from POS sale ${created.invoiceNumber}`,
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
              description: `Sale ${created.invoiceNumber}`,
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
              description: `Sale ${created.invoiceNumber}`,
              referenceId: created.id,
            },
          });
        }
      }

      if (heldBillWhere) {
        // Scoped delete (never by id alone); 0 rows if another request removed it meanwhile.
        await tx.heldBill.deleteMany({ where: heldBillWhere });
      }

      for (const cp of chequePays) {
        const partyName = customerRecord
          ? `${customerRecord.firstName} ${customerRecord.lastName ?? ''}`.trim()
          : 'Walk-in';
        await tx.cheque.create({
          data: {
            tenantId,
            direction: ChequeDirection.RECEIVED,
            status: ChequeStatus.RECEIVED,
            chequeNumber: cp.reference!.trim(),
            amount: cp.amount,
            partyType: dto.customerId ? 'CUSTOMER' : 'WALK_IN',
            partyId: dto.customerId || undefined,
            partyName,
            notes: chequeSourceNotes('Sale', created.id, `POS sale ${created.invoiceNumber}`),
            createdBy: cashierId,
          },
        });
      }

      for (const bp of bankTenderPays) {
        const label = bp.method === PaymentMethod.QR ? 'QR pay' : 'Bank transfer';
        await tx.bankTransaction.create({
          data: {
            tenantId,
            bankAccountId: bp.bankAccountId!.trim(),
            type: BankTxnType.DEPOSIT,
            status: BankTxnStatus.CLEARED,
            amount: bp.amount,
            txnDate: new Date(),
            reference: created.invoiceNumber,
            description: `POS ${label} · ${created.invoiceNumber}${bp.reference ? ` · ${bp.reference}` : ''}`,
            createdBy: cashierId,
          },
        });
        await tx.bankAccount.update({
          where: { id: bp.bankAccountId!.trim() },
          data: { currentBalance: { increment: bp.amount } },
        });
      }

      // Audit record for an above-MRP override, in the SAME transaction: no override sale exists without its record.
      if (priceOverrides.some((o) => o.kind === 'ABOVE_MAX_PRICE')) {
        const names: Record<string, string> = {};
        for (const it of dto.items) if (it.variantId) names[it.variantId.trim()] = it.productName?.trim() || it.sku;
        await tx.auditLog.create({
          data: buildMrpOverrideAudit({
            tenantId, userId: cashierId, saleId: created.id, invoiceNumber: created.invoiceNumber, branchId,
            total: amountDue, reason: dto.priceOverrideReason ?? '', lines: priceOverrides, productNames: names,
          }),
        });
      }

      // P-F17: the drawer movement of a cash sale is part of THIS transaction. If it cannot be written the whole
      // sale (stock, payments, invoice number, loyalty, vouchers …) rolls back — a committed cash sale always has
      // the cash it brought into the drawer.
      const movementRegisterId = await recordSaleCashMovement(
        tx,
        tenantId,
        branchId,
        cashierId,
        created.id,
        created.invoiceNumber,
        dto.payments,
        changeDue,
        changeSavedToWallet,
        counterId,
        wallet.id,
      );
      if (movementRegisterId && movementRegisterId !== wallet.id) {
        // the wallet was cleared by a handover a moment ago: keep the sale pointing at the register that holds its cash
        await tx.sale.update({ where: { id: created.id }, data: { cashRegisterId: movementRegisterId } });
      }

      // Transactional outbox: the "post this sale to the ledger" intent commits (or rolls back) with the sale itself.
      await enqueueOutboxInTx(tx, tenantId, 'SALE', created.id, { branchId });

      return created;
    }, {
      // QA-005: Prisma's default interactive-transaction timeout is 5 s. A sale does stock checks, FEFO lots, payments,
      // loyalty / wallet / credit and cash-drawer writes in one transaction; a big basket or a busy database must not
      // abort it half-way with "Transaction already closed". Longer limits only - nothing else changes.
      maxWait: SALE_TX_MAX_WAIT_MS,
      timeout: SALE_TX_TIMEOUT_MS,
    })
      .then((created) => ({ created, replay: null }))
      .catch(async (e: unknown) => {
        // Concurrent retry lost the race on the unique key: the whole transaction rolled back
        // (no stock / payments written), so return the sale the other request created.
        if (clientRequestId && isClientRequestIdConflict(e)) {
          const replay = await this.findSaleReplay(tenantId, branchId, cashierId, clientRequestId, requestFingerprint!);
          if (replay) return { created: null, replay };
        }
        throw e;
      });
    if (outcome.replay) return outcome.replay;
    const sale = outcome.created!;

    this.eventEmitter.emit('pos.sale.completed', { saleId: sale.id, tenantId, branchId, total: amountDue });
    return sale;
  }

  async validateCoupon(tenantId: string, code: string, amount: number) {
    return this.pricing.validateCoupon(tenantId, code, amount);
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
    const shopDay = await this.getShopDayBounds(tenantId, query.date);
    const register = await this.resolveCashShiftRegister(
      tenantId,
      resolvedBranchId,
      shopDay.from,
      shopDay.to,
      opts,
    );
    const { start: rangeStart, end: rangeEnd } = this.shiftDateRange(register, shopDay.from, shopDay.to);

    const where = {
      tenantId,
      branchId: resolvedBranchId,
      ...(!opts?.scopeAll && opts?.cashierId ? { cashierId: opts.cashierId } : {}),
      ...textSearch(query.search, ['invoiceNumber', 'customer.phone', 'customer.firstName', 'customer.lastName']),
      ...(query.date || register
        ? { invoiceDate: { gte: rangeStart, lte: rangeEnd } }
        : {}),
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
        payments: { include: { bankAccount: { select: { name: true, bankName: true } }, qrCode: { select: { label: true } } } },
        customer: true,
        cashier: true,
      },
    });
    if (!sale) throw new NotFoundException('Sale not found');
    return sale;
  }

  async holdBill(tenantId: string, branchId: string, cashierId: string, dto: HoldBillDto) {
    const holdRejection = holdBillDataRejection(dto.data);
    if (holdRejection) throw new BadRequestException(holdRejection);
    const resolvedBranchId = await this.resolveBranchId(tenantId, branchId);
    const data = dto.data as { items?: { variantId: string; quantity: number }[] };

    return this.prisma.$transaction(async (tx) => {
      const bill = await tx.heldBill.create({
        data: { tenantId, branchId: resolvedBranchId, cashierId, label: dto.label, data: dto.data as object },
      });
      for (const item of data.items ?? []) {
        if (!item.variantId || item.variantId.startsWith('custom-')) continue;
        try {
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
        } catch (e) {
          // The shop sells stock it has not booked in yet (negative on-hand), so a hold must never be refused for lack of
          // stock: the line is held without a reservation (the check happens before any write, so the transaction is intact).
          if (e instanceof BadRequestException && /Insufficient available stock/.test(e.message)) continue;
          throw e;
        }
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

  async deleteHeldBill(
    id: string,
    tenantId: string,
    branchId: string,
    opts?: { cashierId?: string; scopeAll?: boolean },
  ) {
    const resolvedBranchId = await this.resolveBranchId(tenantId, branchId);
    return this.prisma.$transaction(async (tx) => {
      const bill = await tx.heldBill.findFirst({
        where: {
          id,
          tenantId,
          branchId: resolvedBranchId,
          ...(!opts?.scopeAll && opts?.cashierId ? { cashierId: opts.cashierId } : {}),
        },
      });
      if (!bill) throw new NotFoundException('Held bill not found');
      await this.inventoryService.releaseReservations(tenantId, 'HELD_BILL', id, false, tx);
      return tx.heldBill.delete({
        where: { id: bill.id },
      });
    });
  }

  /** Cash shift for cashier (open first, else latest closed on that calendar day). */
  private async resolveCashShiftRegister(
    tenantId: string,
    branchId: string,
    dayStart: Date,
    dayEnd: Date,
    opts?: { cashierId?: string; scopeAll?: boolean },
  ) {
    const include = { movements: { orderBy: { createdAt: 'asc' as const } } };

    if (opts?.cashierId && !opts?.scopeAll) {
      const open = await findOpenRegister(this.prisma, tenantId, branchId, opts.cashierId);
      if (open && open.openingTime >= dayStart && open.openingTime <= dayEnd) return open;
      return this.prisma.cashRegister.findFirst({
        where: {
          tenantId,
          branchId,
          cashierId: opts.cashierId,
          openingTime: { gte: dayStart, lte: dayEnd },
        },
        orderBy: { openingTime: 'desc' },
        include,
      });
    }

    const openAny = await this.prisma.cashRegister.findFirst({
      where: {
        tenantId,
        branchId,
        status: CashRegisterStatus.OPEN,
        openingTime: { gte: dayStart, lte: dayEnd },
      },
      orderBy: { openingTime: 'desc' },
      include,
    });
    if (openAny) return openAny;

    return this.prisma.cashRegister.findFirst({
      where: {
        tenantId,
        branchId,
        openingTime: { gte: dayStart, lte: dayEnd },
      },
      orderBy: { openingTime: 'desc' },
      include,
    });
  }

  private async getShopDayBounds(tenantId: string, date?: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { timezone: true },
    });
    const summaryDate = date ?? shopDateString(new Date(), tenant?.timezone);
    try {
      return { date: summaryDate, ...shopDayBounds(summaryDate, tenant?.timezone) };
    } catch {
      throw new BadRequestException('Invalid date (use YYYY-MM-DD)');
    }
  }

  private shiftDateRange(
    register: { openingTime: Date; closingTime: Date | null; status: CashRegisterStatus } | null,
    dayStart: Date,
    dayEnd: Date,
  ) {
    if (!register) return { start: dayStart, end: dayEnd, scoped: false as const };
    return {
      start: register.openingTime,
      end:
        register.closingTime
        ?? (register.status === CashRegisterStatus.OPEN ? new Date() : dayEnd),
      scoped: true as const,
    };
  }

  async getDailySummary(
    tenantId: string,
    branchId: string,
    date?: string,
    opts?: { cashierId?: string; scopeAll?: boolean },
  ) {
    const resolvedBranchId = await this.resolveBranchId(tenantId, branchId);
    const dayBounds = await this.getShopDayBounds(tenantId, date);
    const register = await this.resolveCashShiftRegister(
      tenantId,
      resolvedBranchId,
      dayBounds.from,
      dayBounds.to,
      opts,
    );
    const { start: rangeStart, end: rangeEnd, scoped: shiftScoped } = this.shiftDateRange(
      register,
      dayBounds.from,
      dayBounds.to,
    );

    const where = {
      tenantId,
      branchId: resolvedBranchId,
      status: SaleStatus.COMPLETED,
      ...(!opts?.scopeAll && opts?.cashierId ? { cashierId: opts.cashierId } : {}),
      invoiceDate: { gte: rangeStart, lte: rangeEnd },
    };

    const [sales, totals, itemTotals, expenseRows, supplierPays] = await Promise.all([
      this.prisma.sale.findMany({ where, include: { payments: true } }),
      this.prisma.sale.aggregate({
        where,
        _sum: { total: true, taxAmount: true, discountAmount: true },
        _count: { id: true },
      }),
      this.prisma.saleItem.aggregate({
        where: {
          sale: {
            tenantId,
            branchId: resolvedBranchId,
            status: SaleStatus.COMPLETED,
            ...(!opts?.scopeAll && opts?.cashierId ? { cashierId: opts.cashierId } : {}),
            invoiceDate: { gte: rangeStart, lte: rangeEnd },
          },
        },
        _sum: { quantity: true },
      }),
      this.prisma.expense.findMany({
        where: {
          tenantId,
          date: { gte: rangeStart, lte: rangeEnd },
          OR: [{ branchId: resolvedBranchId }, { branchId: null }],
        },
        select: { amount: true, paymentMethod: true },
      }),
      this.prisma.supplierPayment.findMany({
        where: {
          tenantId,
          paidAt: { gte: rangeStart, lte: rangeEnd },
        },
        select: { amount: true, method: true },
      }),
    ]);
    const registerIds = [...new Set(sales.map((sale) => sale.cashRegisterId).filter((id): id is string => Boolean(id)))];
    const registers = registerIds.length
      ? await this.prisma.cashRegister.findMany({
          where: { id: { in: registerIds }, tenantId, branchId: resolvedBranchId },
          select: { id: true, counter: { select: { id: true, name: true, code: true } } },
        })
      : [];
    const registerById = new Map(registers.map((register) => [register.id, register.counter]));
    const byCounter = sales.reduce(
      (acc: Record<string, { name: string; code: string; orders: number; amount: number }>, sale) => {
        const counter = sale.cashRegisterId ? registerById.get(sale.cashRegisterId) : null;
        const key = counter?.id ?? 'unassigned';
        const row = acc[key] ?? {
          name: counter?.name ?? 'Unassigned',
          code: counter?.code ?? '-',
          orders: 0,
          amount: 0,
        };
        row.orders += 1;
        row.amount += sale.total;
        acc[key] = row;
        return acc;
      },
      {},
    );

    // Managers / admins also get the whole shop day across EVERY counter and cashier (the figures above stay
    // scoped to the open shift so the drawer / cash numbers remain exact).
    let allCounters: {
      totalSales: number;
      totalRevenue: number;
      totalItems: number;
      byCounter: { name: string; code: string; orders: number; amount: number }[];
    } | null = null;
    if (opts?.scopeAll) {
      const dayWhere = {
        tenantId,
        branchId: resolvedBranchId,
        status: SaleStatus.COMPLETED,
        invoiceDate: { gte: dayBounds.from, lte: dayBounds.to },
      };
      const [daySales, dayItems] = await Promise.all([
        this.prisma.sale.findMany({ where: dayWhere, select: { total: true, cashRegisterId: true } }),
        this.prisma.saleItem.aggregate({ where: { sale: dayWhere }, _sum: { quantity: true } }),
      ]);
      const dayRegisterIds = [
        ...new Set(daySales.map((s) => s.cashRegisterId).filter((id): id is string => Boolean(id))),
      ];
      const dayRegisters = dayRegisterIds.length
        ? await this.prisma.cashRegister.findMany({
            where: { id: { in: dayRegisterIds }, tenantId, branchId: resolvedBranchId },
            select: { id: true, counter: { select: { id: true, name: true, code: true } } },
          })
        : [];
      const dayCounterByRegister = new Map(dayRegisters.map((r) => [r.id, r.counter]));
      const dayByCounter: Record<string, { name: string; code: string; orders: number; amount: number }> = {};
      let dayRevenue = 0;
      for (const sale of daySales) {
        const counter = sale.cashRegisterId ? dayCounterByRegister.get(sale.cashRegisterId) : null;
        const key = counter?.id ?? 'unassigned';
        const row = (dayByCounter[key] ??= {
          name: counter?.name ?? 'Unassigned',
          code: counter?.code ?? '-',
          orders: 0,
          amount: 0,
        });
        row.orders += 1;
        row.amount += sale.total;
        dayRevenue += sale.total;
      }
      allCounters = {
        totalSales: daySales.length,
        totalRevenue: Math.round(dayRevenue * 100) / 100,
        totalItems: dayItems._sum.quantity ?? 0,
        byCounter: Object.values(dayByCounter).map((c) => ({ ...c, amount: Math.round(c.amount * 100) / 100 })),
      };
    }

    const byPaymentMethod = sales.reduce((acc: Record<string, number>, sale) => {
      for (const payment of sale.payments) {
        acc[payment.method] = (acc[payment.method] ?? 0) + payment.amount;
      }
      return acc;
    }, {} as Record<string, number>);

    let cashSalesNet = 0;
    for (const sale of sales) {
      cashSalesNet += netCashFromSalePayments(sale.payments, sale.changeDue, sale.changeSavedToWallet);
    }
    cashSalesNet = Math.round(cashSalesNet * 100) / 100;

    const income = Math.round((totals._sum.total ?? 0) * 100) / 100;
    const expenses = Math.round(expenseRows.reduce((s, e) => s + e.amount, 0) * 100) / 100;
    const cashExpensesFromDb = Math.round(
      expenseRows.filter((e) => e.paymentMethod === PaymentMethod.CASH).reduce((s, e) => s + e.amount, 0) * 100,
    ) / 100;
    const supplierPayments = Math.round(
      supplierPays.reduce((s, p) => s + p.amount, 0) * 100,
    ) / 100;
    const cashSupplierPaymentsFromDb = Math.round(
      supplierPays.filter((p) => p.method === PaymentMethod.CASH).reduce((s, p) => s + p.amount, 0) * 100,
    ) / 100;

    const movementSummary = register ? summarizeMovements(register.movements) : null;
    const openingBalance = register?.openingCash ?? 0;
    const registerCashSales = movementSummary?.cashSales ?? cashSalesNet;
    const registerCashOut = movementSummary?.cashExpenses ?? 0;
    const refunds = movementSummary?.cashRefunds ?? 0;

    // Drawer truth = register movements (includes supplier cash via recordSupplierCashOutflow).
    const cashExpenses = register ? Math.round(registerCashOut * 100) / 100 : cashExpensesFromDb;
    const cashSupplierPayments = register
      ? Math.max(0, Math.round((registerCashOut - cashExpensesFromDb) * 100) / 100)
      : cashSupplierPaymentsFromDb;
    const cashOutTotal = register
      ? Math.round(registerCashOut * 100) / 100
      : Math.round((cashExpensesFromDb + cashSupplierPaymentsFromDb) * 100) / 100;
    const expectedInDrawer = register
      ? Math.round(computeExpectedCashFromMovements(register.openingCash, register.movements) * 100) / 100
      : Math.round((openingBalance + cashSalesNet - cashExpensesFromDb - cashSupplierPaymentsFromDb - refunds) * 100) / 100;

    return {
      date: dayBounds.date,
      totalSales: totals._count.id,
      totalRevenue: income,
      totalTax: totals._sum.taxAmount ?? 0,
      totalDiscount: totals._sum.discountAmount ?? 0,
      totalItems: itemTotals._sum.quantity ?? 0,
      byCounter: Object.values(byCounter).map((counter) => ({
        ...counter,
        amount: Math.round(counter.amount * 100) / 100,
      })),
      allCounters,
      byPaymentMethod,
      openingBalance,
      income,
      expenses,
      cashExpenses,
      supplierPayments,
      cashSupplierPayments,
      netIncome: Math.round((income - expenses) * 100) / 100,
      shift: register
        ? {
            id: register.id,
            scoped: shiftScoped,
            status: register.status,
            openingTime: register.openingTime,
            closingTime: register.closingTime,
            shiftOpen: register.status === CashRegisterStatus.OPEN,
          }
        : null,
      cash: {
        openingFloat: openingBalance,
        cashSalesNet: register ? registerCashSales : cashSalesNet,
        cashExpenses,
        cashSupplierPayments,
        cashOut: cashOutTotal,
        refunds,
        expectedInDrawer,
      },
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
    code: string;
    pluKeys: string[];
    embeddedValue: number;
    asPrice: number;
    asWeightKg: number;
  } | null {
    return parseScaleBarcodeValue(code);
  }

  async lookupBarcode(tenantId: string, branchId: string, code: string, supplierId?: string) {
    const resolvedBranchId = await this.resolveBranchId(tenantId, branchId);
    const scale = this.parseScaleBarcode(code.trim());
    // The shop's label-scale encoding decides the quantity returned for the scan; the sale re-checks it with the same mode.
    const scaleMode: ScaleBarcodeMode = scale
      ? resolveScaleBarcodeMode((await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } }))?.settings)
      : 'AUTO';
    const keys = this.barcodeLookupKeys(code);

    type VariantRow = Awaited<ReturnType<typeof this.prisma.productVariant.findMany>>[number] & {
      product: {
        name: string;
        barcode: string | null;
        taxRate: number | null;
        images: string[];
        productKind?: string;
        unit?: string | null;
        allowDecimalSelling?: boolean;
        weightScaleReady?: boolean;
        category: { name?: string } | null;
        brand: { name?: string } | null;
      };
      inventory: { quantity: number; reservedQty: number }[];
      supplierAssignments?: Array<{
        supplierId: string;
        supplierProductCode: string | null;
        leadTimeDays: number | null;
        lastBuyingPrice: number | null;
      }>;
    };

    const mapVariant = (variant: VariantRow) => {
      const onHand = variant.inventory[0]?.quantity ?? 0;
      const reserved = variant.inventory[0]?.reservedQty ?? 0;
      const available = Math.max(0, onHand - reserved);
      const effectiveBarcode = variant.barcode ?? variant.product.barcode ?? null;
      const weighted =
        variant.product.productKind === 'WEIGHTED' ||
        ['kg', 'g', 'gram', 'grams', 'kilogram', 'kilograms'].includes((variant.product.unit ?? '').trim().toLowerCase());
      const scaleQty = scale
        ? weighted
          ? scaleBarcodeQuantity(scale, variant.sellingPrice, scaleMode) ?? undefined
          : scale.asPrice < 1 && scale.asWeightKg > 0
            ? scale.asWeightKg
            : undefined
        : undefined;
      const unitPrice = scale && weighted
        ? round2(variant.sellingPrice)
        : resolveUnitPrice(variant.sellingPrice, scale?.asPrice);
      const assignment = Array.isArray(variant.supplierAssignments) ? variant.supplierAssignments[0] : undefined;
      const shelfLocations = (variant as VariantRow & {
        shelfLocations?: Parameters<typeof formatShelfLocationLabel>[0][];
      }).shelfLocations;
      const locRow = Array.isArray(shelfLocations) ? shelfLocations[0] : undefined;
      return {
        variantId: variant.id,
        productId: variant.productId,
        productName: variant.product.name,
        variantName: variant.name,
        sku: variant.sku,
        barcode: effectiveBarcode,
        unitPrice,
        sellingPrice: variant.sellingPrice,
        costPrice: variant.costPrice,
        mrp: variant.mrp,
        taxRate: variant.product.taxRate ?? 0,
        color: variant.color,
        size: variant.size,
        material: variant.material ?? undefined,
        style: variant.style ?? undefined,
        category: variant.product.category?.name ?? 'Other',
        brand: variant.product.brand?.name ?? null,
        productKind: variant.product.productKind,
        unit: variant.product.unit ?? null,
        allowDecimalSelling: variant.product.allowDecimalSelling ?? variant.product.productKind === 'WEIGHTED',
        weightScaleReady: variant.product.weightScaleReady ?? false,
        stock: available,
        currentStock: onHand,
        reservedStock: reserved,
        availableStock: available,
        imageUrl: variant.images?.[0] ?? variant.product.images?.[0] ?? null,
        locationLabel: formatShelfLocationLabel(locRow),
        supplierId: assignment?.supplierId ?? null,
        supplierProductCode: assignment?.supplierProductCode ?? null,
        leadTimeDays: assignment?.leadTimeDays ?? null,
        lastBuyingPrice: assignment?.lastBuyingPrice ?? null,
        ...(scale ? { isScaleBarcode: true, scaleBarcode: scale.code, scaleQty, embeddedValue: scale.embeddedValue } : {}),
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
          product: { include: { category: true, brand: true } },
          inventory: { where: { branchId: resolvedBranchId }, select: { quantity: true, reservedQty: true }, take: 1 },
          shelfLocations: {
            where: { branchId: resolvedBranchId },
            take: 1,
            select: {
              shelf: {
                select: {
                  name: true,
                  code: true,
                  rack: {
                    select: {
                      name: true,
                      code: true,
                      section: {
                        select: {
                          name: true,
                          code: true,
                          floor: { select: { name: true, code: true } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }) as VariantRow[];
      if (variants.length === 0) continue;

      const keyLower = key.toLowerCase();
      const pickMulti = async (rows: VariantRow[]) => {
        const options = rows.map(mapVariant).sort((a, b) => b.stock - a.stock);
        const primary = options.find((o) => o.stock > 0) ?? options[0];
        return this.withPurchasePrices(tenantId, {
          ...primary,
          requiresVariantPick: true,
          variants: options,
        });
      };

      const exactSku = variants.filter((v) => v.sku.toLowerCase() === keyLower);
      if (exactSku.length === 1) {
        return this.enrichBarcodeResult(tenantId, resolvedBranchId, mapVariant(exactSku[0]), supplierId);
      }
      if (exactSku.length > 1) {
        return pickMulti(exactSku);
      }

      // Same barcode on multiple variants / products — cashier must pick.
      const exactBarcodeHits = variants.filter(
        (v) =>
          (v.barcode ?? '').toLowerCase() === keyLower ||
          (v.product.barcode ?? '').toLowerCase() === keyLower,
      );
      if (exactBarcodeHits.length > 1) {
        const productIds = new Set(exactBarcodeHits.map((v) => v.productId));
        // One product, shared barcode: offer all active siblings for that product.
        if (productIds.size === 1) {
          const siblings = await this.prisma.productVariant.findMany({
            where: {
              productId: exactBarcodeHits[0].productId,
              isActive: true,
              product: { tenantId, status: 'ACTIVE' },
            },
            include: {
              product: { include: { category: true, brand: true } },
              inventory: {
                where: { branchId: resolvedBranchId },
                select: { quantity: true, reservedQty: true },
                take: 1,
              },
            },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          }) as VariantRow[];
          // Shared product barcode: auto-pick best stocked sibling (POS scan must stay instant)
          if (siblings.length >= 1) {
            const ranked = siblings
              .map((v) => ({ v, stock: Math.max(0, (v.inventory[0]?.quantity ?? 0) - (v.inventory[0]?.reservedQty ?? 0)) }))
              .sort((a, b) => b.stock - a.stock);
            return this.enrichBarcodeResult(
              tenantId,
              resolvedBranchId,
              mapVariant(ranked[0].v),
              supplierId,
            );
          }
        }
        return pickMulti(exactBarcodeHits);
      }
      if (exactBarcodeHits.length === 1) {
        const only = exactBarcodeHits[0];
        const matchedViaSharedBarcode =
          (only.product.barcode ?? '').toLowerCase() === keyLower ||
          (only.barcode ?? '').toLowerCase() === keyLower;
        if (matchedViaSharedBarcode) {
          const siblings = await this.prisma.productVariant.findMany({
            where: {
              productId: only.productId,
              isActive: true,
              product: { tenantId, status: 'ACTIVE' },
            },
            include: {
              product: { include: { category: true, brand: true } },
              inventory: {
                where: { branchId: resolvedBranchId },
                select: { quantity: true, reservedQty: true },
                take: 1,
              },
            },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          }) as VariantRow[];
          if (siblings.length > 1) {
            const rankedSiblings = siblings
              .map((v) => ({
                v,
                stock: Math.max(0, (v.inventory[0]?.quantity ?? 0) - (v.inventory[0]?.reservedQty ?? 0)),
              }))
              .sort((a, b) => b.stock - a.stock);
            return this.enrichBarcodeResult(
              tenantId,
              resolvedBranchId,
              mapVariant(rankedSiblings[0].v),
              supplierId,
            );
          }
        }
        return this.enrichBarcodeResult(tenantId, resolvedBranchId, mapVariant(only), supplierId);
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

      if (ranked.length > 1) {
        return pickMulti(ranked.map((r) => r.variant));
      }

      const picked = mapVariant((ranked.find((row) => row.stock > 0) ?? ranked[0]).variant);
      return this.enrichBarcodeResult(tenantId, resolvedBranchId, picked, supplierId);
    }
    throw new NotFoundException(`No product found for barcode/SKU: ${code}`);
  }

  private async enrichBarcodeResult(
    tenantId: string,
    branchId: string,
    result: Record<string, unknown> & { variantId: string; stock: number; requiresVariantPick?: boolean },
    supplierId?: string,
  ) {
    let enriched: Record<string, unknown> & { variantId: string; stock: number; requiresVariantPick?: boolean } = result;

    if (!supplierId || result.requiresVariantPick) {
      enriched = {
        ...result,
        supplierAssigned: supplierId ? Boolean(result.supplierId) : undefined,
      };
    } else {
      const assignment = await this.prisma.supplierProductAssignment.findFirst({
        where: { tenantId, supplierId, variantId: result.variantId },
        select: {
          supplierId: true,
          supplierProductCode: true,
          leadTimeDays: true,
          lastBuyingPrice: true,
          minOrderQty: true,
          isPreferred: true,
          isActive: true,
        },
      });

      if (!assignment || assignment.isActive === false) {
        enriched = {
          ...result,
          supplierAssigned: false,
          supplierId,
          lastBuyingPrice: result.lastBuyingPrice ?? null,
        };
      } else {
        const insights = await this.attachSupplierPurchaseInsights(
          tenantId,
          branchId,
          supplierId,
          // purchase insights use exact stock (−2 counts as 2 more sold), not the clamped selling figure
          [{ variantId: result.variantId, stock: exactStockOfRow(result) }],
        );
        const insight = insights.get(result.variantId);

        enriched = {
          ...result,
          supplierAssigned: true,
          supplierId: assignment.supplierId,
          supplierProductCode: assignment.supplierProductCode ?? null,
          leadTimeDays: assignment.leadTimeDays ?? null,
          lastBuyingPrice: assignment.lastBuyingPrice ?? result.lastBuyingPrice ?? null,
          minOrderQty: assignment.minOrderQty ?? null,
          lastPurchaseDate: insight?.lastPurchaseDate ?? null,
          lastPurchaseQty: insight?.lastPurchaseQty ?? null,
          soldAfterLastPurchase: insight?.soldAfterLastPurchase ?? null,
          stockAtLastPurchase: insight?.stockAtLastPurchase ?? null,
        };
      }
    }

    return this.withPurchasePrices(tenantId, enriched);
  }

  async processReturn(
    tenantId: string,
    branchId: string,
    user: { id: string; roles?: string[] },
    dto: ReturnSaleDto,
    unlockToken?: string,
  ) {
    return this.returnsService.create(
      tenantId,
      branchId,
      { user: user, unlockToken },
      {
        clientRequestId: dto.clientRequestId,
        originalSaleId: dto.originalSaleId,
        reason: dto.reason ?? ReturnReason.OTHER,
        items: dto.items.map((item) => ({
          variantId: item.variantId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
        notes: dto.reason,
      },
    );
  }

  /**
   * Purchase-order selling-price options per variant, newest first.
   * `perVariant` caps what the POS screen offers (default 6). The price guard passes `Infinity`: every selling
   * price a purchase order ever set is a legitimate price, whatever the screen happened to list.
   * Distinct (variant, cost, price) rows are read without a shared row cap, so one busy variant in the cart can no
   * longer push another variant's PO prices out of the result (the screen and the checkout used to disagree).
   */
  async attachPurchasePriceOptions(
    tenantId: string,
    variantIds: string[],
    perVariant = 6,
  ) {
    type PriceOpt = {
      unitCost: number;
      sellingPrice: number;
      mrp: number | null;
      poNumber: string;
      orderDate: string;
    };
    const out = new Map<string, PriceOpt[]>();
    const unique = [...new Set(variantIds.filter(Boolean))];
    if (!unique.length) return out;

    const items = await this.prisma.purchaseOrderItem.findMany({
      where: {
        variantId: { in: unique },
        sellingPrice: { gt: 0 },
        purchase: {
          tenantId,
          status: { notIn: ['DRAFT', 'PENDING_APPROVAL', 'CANCELLED'] },
        },
      },
      select: {
        variantId: true,
        unitCost: true,
        sellingPrice: true,
        mrp: true,
        purchase: { select: { poNumber: true, orderDate: true } },
      },
      orderBy: { purchase: { orderDate: 'desc' } },
      distinct: ['variantId', 'unitCost', 'sellingPrice'],
      take: Math.min(unique.length * 200, 5000),
    });

    for (const i of items) {
      const selling = Number(i.sellingPrice);
      if (!(selling > 0)) continue;
      const list = out.get(i.variantId) ?? [];
      const key = `${Number(i.unitCost).toFixed(2)}:${selling.toFixed(2)}`;
      if (list.some((x) => `${x.unitCost.toFixed(2)}:${x.sellingPrice.toFixed(2)}` === key)) continue;
      if (list.length >= perVariant) continue;
      list.push({
        unitCost: Number(i.unitCost),
        sellingPrice: selling,
        mrp: i.mrp != null && i.mrp > 0 ? i.mrp : null,
        poNumber: i.purchase.poNumber,
        orderDate: i.purchase.orderDate.toISOString(),
      });
      out.set(i.variantId, list);
    }
    return out;
  }

  private async withPurchasePrices<
    T extends {
      variantId: string;
      variants?: Array<{ variantId: string } & Record<string, unknown>>;
    },
  >(tenantId: string, result: T) {
    const ids = [
      result.variantId,
      ...(Array.isArray(result.variants) ? result.variants.map((v) => v.variantId) : []),
    ];
    const map = await this.attachPurchasePriceOptions(tenantId, ids);
    const variants = Array.isArray(result.variants)
      ? result.variants.map((v) => ({
          ...v,
          purchasePrices: map.get(v.variantId) ?? [],
        }))
      : undefined;
    return {
      ...result,
      purchasePrices: map.get(result.variantId) ?? [],
      ...(variants ? { variants } : {}),
    };
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

    // Fallback: last purchase order line when no GRN exists for this supplier/variant
    const missing = rows.filter((r) => !insights.get(r.variantId)?.lastPurchaseDate).map((r) => r.variantId);
    if (missing.length) {
      const poItems = await this.prisma.purchaseOrderItem.findMany({
        where: {
          variantId: { in: missing },
          orderedQty: { gt: 0 },
          purchase: {
            tenantId,
            supplierId,
            status: { notIn: ['CANCELLED'] },
          },
        },
        include: {
          purchase: { select: { orderDate: true, createdAt: true } },
        },
        orderBy: [{ purchase: { orderDate: 'desc' } }, { purchase: { createdAt: 'desc' } }],
      });
      const lastPoByVariant = new Map<string, (typeof poItems)[number]>();
      for (const item of poItems) {
        if (!lastPoByVariant.has(item.variantId)) lastPoByVariant.set(item.variantId, item);
      }
      for (const variantId of missing) {
        const lastPo = lastPoByVariant.get(variantId);
        if (!lastPo) continue;
        const date = lastPo.purchase.orderDate ?? lastPo.purchase.createdAt;
        insights.set(variantId, {
          lastPurchaseDate: date.toISOString(),
          lastPurchaseQty: lastPo.orderedQty,
          stockAtLastPurchase: null,
          soldAfterLastPurchase: null,
          stockDecreased: false,
        });
      }
    }

    return insights;
  }

  async getProducts(
    tenantId: string,
    branchId: string,
    opts?: {
      search?: string;
      limit?: number;
      page?: number;
      category?: string;
      supplierId?: string;
      includeImages?: boolean;
    },
  ) {
    const resolvedBranchId = await this.resolveBranchId(tenantId, branchId);
    const paginated = opts?.page != null && opts.page > 0;
    const take = paginated
      ? Math.min(Math.max(opts?.limit ?? 20, 1), 100)
      : Math.min(Math.max(opts?.limit ?? 1500, 1), 15000);
    const page = paginated ? Math.max(1, opts!.page!) : 1;
    const skip = paginated ? (page - 1) * take : 0;
    const search = escapeLike(normalizeSearch(opts?.search)); // trimmed; %, _ match literally
    const category = opts?.category?.trim();
    const where = {
      isActive: true,
      product: {
        tenantId,
        status: 'ACTIVE' as const,
        ...(category && category !== 'All'
          ? { category: { name: { equals: category, mode: 'insensitive' as const } } }
          : {}),
      },
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
              { sku: { contains: search, mode: 'insensitive' as const } },
              { barcode: { contains: search, mode: 'insensitive' as const } },
              { name: { contains: search, mode: 'insensitive' as const } },
              { product: { name: { contains: search, mode: 'insensitive' as const } } },
              { product: { barcode: { contains: search, mode: 'insensitive' as const } } },
              {
                shelfLocations: {
                  some: {
                    branchId: resolvedBranchId,
                    OR: [
                      { shelf: { code: { contains: search, mode: 'insensitive' as const } } },
                      { shelf: { name: { contains: search, mode: 'insensitive' as const } } },
                      {
                        shelf: {
                          rack: { code: { contains: search, mode: 'insensitive' as const } },
                        },
                      },
                      {
                        shelf: {
                          rack: { name: { contains: search, mode: 'insensitive' as const } },
                        },
                      },
                    ],
                  },
                },
              },
              ...(opts?.supplierId
                ? [{
                    supplierAssignments: {
                      some: {
                        tenantId,
                        supplierId: opts.supplierId,
                        supplierProductCode: { contains: search, mode: 'insensitive' as const },
                      },
                    },
                  }]
                : [{
                    supplierAssignments: {
                      some: {
                        tenantId,
                        supplierProductCode: { contains: search, mode: 'insensitive' as const },
                      },
                    },
                  }]),
            ],
          }
        : {}),
    };

    // Default: only for small pages (POS grid). Purchase flows can force images on.
    const includeImages = opts?.includeImages === true || take <= 100;
    const [total, variants, categoryRows] = await Promise.all([
      paginated
        ? this.prisma.productVariant.count({ where })
        : Promise.resolve(0),
      this.prisma.productVariant.findMany({
        where,
        select: {
          id: true,
          productId: true,
          name: true,
          sku: true,
          barcode: true,
          sellingPrice: true,
          costPrice: true,
          mrp: true,
          color: true,
          size: true,
          material: true,
          style: true,
          sortOrder: true,
          ...(includeImages ? { images: true } : {}),
          product: {
            select: {
              name: true,
              barcode: true,
              taxRate: true,
              productKind: true,
              unit: true,
              allowDecimalSelling: true,
              weightScaleReady: true,
              warrantyMonths: true,
              ...(includeImages ? { images: true } : {}),
              category: { select: { name: true } },
            },
          },
          supplierAssignments: opts?.supplierId
            ? {
                where: { tenantId, supplierId: opts.supplierId },
                select: {
                  supplierId: true,
                  supplierProductCode: true,
                  leadTimeDays: true,
                  lastBuyingPrice: true,
                  isPreferred: true,
                  minOrderQty: true,
                  isActive: true,
                },
                take: 1,
              }
            : false,
          inventory: {
            where: { branchId: resolvedBranchId },
            select: { quantity: true, reservedQty: true },
            take: 1,
          },
          shelfLocations: {
            where: { branchId: resolvedBranchId },
            take: 1,
            select: {
              shelf: {
                select: {
                  name: true,
                  code: true,
                  rack: {
                    select: {
                      name: true,
                      code: true,
                      section: {
                        select: {
                          name: true,
                          code: true,
                          floor: { select: { name: true, code: true } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: [{ product: { name: 'asc' } }, { name: 'asc' }],
        ...(paginated ? { skip, take } : { take }),
      }),
      paginated && page === 1
        ? this.prisma.category.findMany({
            where: { tenantId, products: { some: { status: 'ACTIVE', variants: { some: { isActive: true } } } } },
            select: { name: true },
            orderBy: { name: 'asc' },
            take: 200,
          })
        : Promise.resolve([] as { name: string }[]),
    ]);

    const mapped = variants.map((v) => {
      const onHand = v.inventory[0]?.quantity ?? 0;
      const reserved = v.inventory[0]?.reservedQty ?? 0;
      const available = Math.max(0, onHand - reserved);
      const assignment = Array.isArray(v.supplierAssignments) ? v.supplierAssignments[0] : undefined;
      if (opts?.supplierId && assignment && assignment.isActive === false) {
        return null;
      }
      const vImages = includeImages && 'images' in v ? (v as { images?: string[] }).images : undefined;
      const pImages = includeImages && v.product && 'images' in v.product
        ? (v.product as { images?: string[] }).images
        : undefined;
      const locRow = Array.isArray(v.shelfLocations) ? v.shelfLocations[0] : undefined;
      const locationLabel = formatShelfLocationLabel(locRow);
      return {
        assignment,
        variantId:   v.id,
        productId:   v.productId,
        productName: v.product.name,
        variantName: v.name,
        sku:         v.sku,
        unitPrice:   v.sellingPrice,
        sellingPrice: v.sellingPrice,
        costPrice:   v.costPrice,
        mrp:         v.mrp,
        taxRate:     v.product.taxRate ?? 0,
        category:    v.product.category?.name ?? 'Other',
        brand:       null as string | null,
        color:       v.color ?? undefined,
        size:        v.size  ?? undefined,
        material:    v.material ?? undefined,
        style:       v.style ?? undefined,
        productKind: v.product.productKind,
        unit:        v.product.unit ?? null,
        allowDecimalSelling: v.product.allowDecimalSelling ?? v.product.productKind === 'WEIGHTED',
        weightScaleReady: v.product.weightScaleReady ?? false,
        stock: available,
        currentStock: onHand,
        reservedStock: reserved,
        availableStock: available,
        imageUrl:    vImages?.[0] ?? pImages?.[0] ?? null,
        barcode:     v.barcode ?? v.product.barcode ?? undefined,
        warrantyMonths: v.product.warrantyMonths ?? null,
        locationLabel,
        supplierId: assignment?.supplierId ?? opts?.supplierId ?? null,
        supplierProductCode: assignment?.supplierProductCode ?? null,
        leadTimeDays: assignment?.leadTimeDays ?? null,
        lastBuyingPrice: assignment?.lastBuyingPrice ?? null,
        minOrderQty: assignment?.minOrderQty ?? null,
        isPreferredSupplier: assignment?.isPreferred ?? null,
      };
    }).filter((row): row is NonNullable<typeof row> => row != null);

    // Outfit bundles: available stock = min component sets (not phantom SKU qty).
    const bundleProductIds = [
      ...new Set(
        mapped
          .filter((m) => m.productKind === 'BUNDLE' && m.productId)
          .map((m) => m.productId as string),
      ),
    ];
    if (bundleProductIds.length) {
      const components = await this.prisma.productBundleComponent.findMany({
        where: { tenantId, bundleProductId: { in: bundleProductIds } },
      });
      const componentVariantIds = [
        ...new Set(components.map((c) => c.componentVariantId)),
      ];
      const invRows = componentVariantIds.length
        ? await this.prisma.inventory.findMany({
            where: {
              tenantId,
              branchId: resolvedBranchId,
              variantId: { in: componentVariantIds },
            },
            select: { variantId: true, quantity: true, reservedQty: true },
          })
        : [];
      const stockByVariant = new Map(
        invRows.map((r) => [
          r.variantId,
          Math.max(0, r.quantity - r.reservedQty),
        ]),
      );
      const availByProduct = new Map<string, number>();
      for (const pid of bundleProductIds) {
        const comps = components.filter((c) => c.bundleProductId === pid);
        let sets: number | null = null;
        for (const c of comps) {
          const stock = stockByVariant.get(c.componentVariantId) ?? 0;
          const need = Math.max(1, c.quantity);
          const s = Math.floor(stock / need);
          sets = sets == null ? s : Math.min(sets, s);
        }
        availByProduct.set(pid, sets ?? 0);
      }
      for (const m of mapped) {
        if (m.productKind === 'BUNDLE' && m.productId) {
          const a = availByProduct.get(m.productId) ?? 0;
          m.stock = a;
          m.availableStock = a;
          m.currentStock = a;
        }
      }
    }

    let items = mapped.map(({ assignment: _a, ...rest }) => rest);
    if (opts?.supplierId) {
      const insights = await this.attachSupplierPurchaseInsights(
        tenantId,
        resolvedBranchId,
        opts.supplierId,
        mapped.map((m) => ({ variantId: m.variantId, stock: exactStockOfRow(m) })),
      );
      items = mapped.map(({ assignment: _a, ...m }) => {
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

    const priceMap = await this.attachPurchasePriceOptions(
      tenantId,
      items.map((i) => i.variantId),
    );
    items = items.map((m) => ({
      ...m,
      purchasePrices: priceMap.get(m.variantId) ?? [],
    }));

    if (!paginated) return items;

    return {
      items,
      page,
      limit: take,
      total,
      totalPages: Math.max(1, Math.ceil(total / take)),
      categories: categoryRows.map((c) => c.name).filter(Boolean),
    };
  }

  async closeDaySession(tenantId: string, branchId: string, cashierId: string, notes?: string) {
    const resolvedBranchId = await this.resolveBranchId(tenantId, branchId);
    const now = dayjs();
    const todayStart = now.startOf('day').toDate();
    const todayEnd = now.endOf('day').toDate();

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
          counter: { select: { id: true, name: true, code: true } },
        },
      });
    }

    const shiftStart = register?.openingTime ?? todayStart;
    const shiftEnd = now.toDate();

    const where = {
      tenantId,
      branchId: resolvedBranchId,
      cashierId,
      status: SaleStatus.COMPLETED,
      invoiceDate: { gte: shiftStart, lte: shiftEnd },
    };

    const [sales, totals, supplierPays, expenseRows] = await Promise.all([
      this.prisma.sale.findMany({ where, include: { payments: true } }),
      this.prisma.sale.aggregate({
        where,
        _sum: { total: true, taxAmount: true, discountAmount: true },
        _count: { id: true },
      }),
      this.prisma.supplierPayment.findMany({
        where: {
          tenantId,
          paidAt: { gte: shiftStart, lte: shiftEnd },
        },
        select: { amount: true, method: true },
      }),
      this.prisma.expense.findMany({
        where: {
          tenantId,
          date: { gte: shiftStart, lte: shiftEnd },
          OR: [{ branchId: resolvedBranchId }, { branchId: null }],
        },
        select: { amount: true, paymentMethod: true },
      }),
    ]);

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
      const net = netCashFromSalePayments(sale.payments, sale.changeDue, sale.changeSavedToWallet);
      cashSalesNet += net;
      const tendered = sale.payments
        .filter((p) => p.method === PaymentMethod.CASH)
        .reduce((s, p) => s + p.amount, 0);
      if (tendered > 0) {
        cashTendered += tendered;
        changeGiven += Math.max(0, (sale.changeDue ?? 0) - (sale.changeSavedToWallet ?? 0));
      }
    }
    cashSalesNet = Math.round(cashSalesNet * 100) / 100;
    cashTendered = Math.round(cashTendered * 100) / 100;
    changeGiven = Math.round(changeGiven * 100) / 100;

    const movementSummary = register ? summarizeMovements(register.movements) : null;
    const registerCashSales = movementSummary?.cashSales ?? cashSalesNet;

    const supplierPaymentsTotal = Math.round(
      supplierPays.reduce((s, p) => s + p.amount, 0) * 100,
    ) / 100;
    const cashSupplierPaymentsFromDb = Math.round(
      supplierPays.filter((p) => p.method === PaymentMethod.CASH).reduce((s, p) => s + p.amount, 0) * 100,
    ) / 100;
    const expensesTotal = Math.round(expenseRows.reduce((s, e) => s + e.amount, 0) * 100) / 100;
    const cashExpensesFromDb = Math.round(
      expenseRows.filter((e) => e.paymentMethod === PaymentMethod.CASH).reduce((s, e) => s + e.amount, 0) * 100,
    ) / 100;
    const registerCashOut = movementSummary?.cashExpenses ?? 0;
    const income = Math.round((totals._sum.total ?? 0) * 100) / 100;

    const cash = {
      shiftOpen: register?.status === CashRegisterStatus.OPEN,
      openingFloat: register?.openingCash ?? null,
      cashSalesNet: register ? registerCashSales : cashSalesNet,
      cashTendered,
      changeGiven,
      cashIn: movementSummary?.cashReceived ?? 0,
      cashOut: register
        ? Math.round(registerCashOut * 100) / 100
        : Math.round((cashExpensesFromDb + cashSupplierPaymentsFromDb) * 100) / 100,
      cashExpenses: register ? Math.round(registerCashOut * 100) / 100 : cashExpensesFromDb,
      cashSupplierPayments: register
        ? Math.max(0, Math.round((registerCashOut - cashExpensesFromDb) * 100) / 100)
        : cashSupplierPaymentsFromDb,
      refunds: movementSummary?.cashRefunds ?? 0,
      expectedInDrawer: register
        ? Math.round(computeExpectedCashFromMovements(register.openingCash, register.movements) * 100) / 100
        : null,
    };

    const summary = {
      date: now.format('YYYY-MM-DD'),
      closedAt: now.toISOString(),
      closedBy: cashierId,
      notes: notes ?? '',
      totalSales: totals._count.id,
      totalRevenue: income,
      totalTax: totals._sum.taxAmount ?? 0,
      totalDiscount: totals._sum.discountAmount ?? 0,
      byPaymentMethod,
      cash,
      shift: register
        ? {
            id: register.id,
            openingTime: register.openingTime,
            closingTime: register.closingTime,
            shiftOpen: register.status === CashRegisterStatus.OPEN,
          }
        : null,
      openingBalance: register?.openingCash ?? 0,
      income,
      expenses: expensesTotal,
      netIncome: Math.round((income - expensesTotal) * 100) / 100,
      supplierPayments: supplierPaymentsTotal,
      cashSupplierPayments: cash.cashSupplierPayments,
    };
    this.eventEmitter.emit('pos.day.closed', { tenantId, branchId: resolvedBranchId, ...summary });
    return summary;
  }

  private async generateInvoiceNumberLegacy(tenantId: string): Promise<string> {
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

  private static readonly DEFAULT_RELOAD_PROVIDERS = [
    { code: 'DIALOG', name: 'Dialog', digitalCommissionPct: 2, physicalCommissionPct: 3, sortOrder: 1 },
    { code: 'MOBITEL', name: 'Mobitel', digitalCommissionPct: 2, physicalCommissionPct: 3, sortOrder: 2 },
    { code: 'HUTCH', name: 'Hutch', digitalCommissionPct: 2, physicalCommissionPct: 3, sortOrder: 3 },
    { code: 'AIRTEL', name: 'Airtel', digitalCommissionPct: 2, physicalCommissionPct: 3, sortOrder: 4 },
  ];
  private static readonly DEFAULT_RELOAD_DENOMS = [50, 100, 200, 500, 1000];

  async ensureReloadProviders(tenantId: string) {
    const count = await this.prisma.reloadOperator.count({ where: { tenantId } });
    if (count > 0) return;
    for (const p of PosService.DEFAULT_RELOAD_PROVIDERS) {
      const op = await this.prisma.reloadOperator.create({
        data: {
          tenantId,
          code: p.code,
          name: p.name,
          digitalCommissionPct: p.digitalCommissionPct,
          physicalCommissionPct: p.physicalCommissionPct,
          sortOrder: p.sortOrder,
        },
      });
      await this.prisma.reloadDenomination.createMany({
        data: PosService.DEFAULT_RELOAD_DENOMS.map((faceValue) => ({
          tenantId,
          operatorId: op.id,
          faceValue,
        })),
      });
    }
  }

  async listReloadOperators(tenantId: string) {
    await this.ensureReloadProviders(tenantId);
    const operators = await this.prisma.reloadOperator.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        denominations: { orderBy: { faceValue: 'asc' } },
      },
    });
    const availableCounts = await this.prisma.reloadCardStock.groupBy({
      by: ['operatorId', 'denominationId'],
      where: { tenantId, status: ReloadCardStatus.AVAILABLE },
      _count: { _all: true },
    });
    const countMap = new Map(
      availableCounts.map((r) => [`${r.operatorId}:${r.denominationId}`, r._count._all]),
    );
    return operators.map((op) => ({
      ...op,
      denominations: op.denominations.map((d) => ({
        ...d,
        availableCards: countMap.get(`${op.id}:${d.id}`) ?? 0,
      })),
    }));
  }

  async createReloadOperator(tenantId: string, dto: UpsertReloadOperatorDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Provider name required');
    const code = (dto.code?.trim() || name).toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 24) || 'PROVIDER';
    const existing = await this.prisma.reloadOperator.findFirst({ where: { tenantId, code } });
    if (existing) throw new BadRequestException('Provider code already exists');
    const op = await this.prisma.reloadOperator.create({
      data: {
        tenantId,
        code,
        name,
        digitalCommissionPct: dto.digitalCommissionPct ?? 2,
        physicalCommissionPct: dto.physicalCommissionPct ?? 3,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 100,
      },
    });
    await this.prisma.reloadDenomination.createMany({
      data: PosService.DEFAULT_RELOAD_DENOMS.map((faceValue) => ({
        tenantId,
        operatorId: op.id,
        faceValue,
      })),
    });
    return this.prisma.reloadOperator.findUnique({
      where: { id: op.id },
      include: { denominations: { orderBy: { faceValue: 'asc' } } },
    });
  }

  async updateReloadOperator(tenantId: string, id: string, dto: UpdateReloadOperatorDto) {
    const op = await this.prisma.reloadOperator.findFirst({ where: { id, tenantId } });
    if (!op) throw new NotFoundException('Provider not found');
    let quickPayUrl: string | null | undefined;
    if (dto.quickPayUrl !== undefined) {
      const raw = dto.quickPayUrl.trim();
      if (!raw) {
        quickPayUrl = null;
      } else {
        let parsed: URL;
        try {
          parsed = new URL(raw);
        } catch {
          throw new BadRequestException('Quick Pay link must be a valid URL');
        }
        if (parsed.protocol !== 'https:') {
          throw new BadRequestException('Quick Pay link must start with https://');
        }
        quickPayUrl = parsed.toString();
      }
    }
    return this.prisma.reloadOperator.update({
      where: { id },
      data: {
        ...(quickPayUrl !== undefined ? { quickPayUrl } : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.digitalCommissionPct !== undefined ? { digitalCommissionPct: dto.digitalCommissionPct } : {}),
        ...(dto.physicalCommissionPct !== undefined ? { physicalCommissionPct: dto.physicalCommissionPct } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
      include: { denominations: { orderBy: { faceValue: 'asc' } } },
    });
  }

  async importReloadCards(tenantId: string, branchId: string, dto: ImportReloadCardsDto) {
    const operator = await this.prisma.reloadOperator.findFirst({ where: { id: dto.operatorId, tenantId } });
    if (!operator) throw new NotFoundException('Provider not found');
    const denom = await this.prisma.reloadDenomination.findFirst({
      where: { id: dto.denominationId, tenantId, operatorId: dto.operatorId },
    });
    if (!denom) throw new NotFoundException('Denomination not found');
    const pins = dto.pins
      .split(/[\s,;]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (!pins.length) throw new BadRequestException('No PIN codes provided');
    let imported = 0;
    let skipped = 0;
    for (const pin of pins) {
      const pinCode = pin.replace(/\s+/g, '');
      try {
        await this.prisma.reloadCardStock.create({
          data: {
            tenantId,
            branchId: branchId || undefined,
            operatorId: dto.operatorId,
            denominationId: dto.denominationId,
            pinCode,
            pinMasked: maskReloadPin(pinCode),
            purchaseCost: dto.purchaseCost,
            status: ReloadCardStatus.AVAILABLE,
          },
        });
        imported += 1;
      } catch {
        skipped += 1;
      }
    }
    return { imported, skipped, total: pins.length };
  }

  private async recordReloadSalesFromItems(
    tx: Prisma.TransactionClient,
    tenantId: string,
    branchId: string,
    saleId: string,
    items: SaleItemDto[],
  ) {
    for (const item of items) {
      if (!item.reloadType || !item.reloadOperatorId) continue;
      // Charged quantity and recorded units must never diverge (validated up front; this is the last line of defence).
      if (!isWholeReloadQuantity(item.quantity)) {
        throw new BadRequestException('Reload and recharge-card quantity must be a whole number of units.');
      }
      const qty = Math.round(item.quantity);
      const operator = await tx.reloadOperator.findFirst({
        where: { id: item.reloadOperatorId, tenantId, isActive: true },
      });
      if (!operator) throw new BadRequestException(`Reload provider not found: ${item.reloadOperatorId}`);
      const faceValue = item.reloadFaceValue ?? item.unitPrice;
      const commission = computeReloadCommission(
        {
          digitalCommissionPct: operator.digitalCommissionPct,
          physicalCommissionPct: operator.physicalCommissionPct,
        },
        item.reloadType,
        faceValue,
      );

      if (item.reloadType === ReloadSaleType.DIGITAL) {
        const msisdn = (item.reloadMsisdn || '').replace(/\D/g, '');
        if (msisdn.length > 0 && msisdn.length < 9) {
          throw new BadRequestException('Reload phone number looks incomplete');
        }
        for (let i = 0; i < qty; i += 1) {
          await tx.reloadSale.create({
            data: {
              tenantId,
              branchId,
              saleId,
              type: ReloadSaleType.DIGITAL,
              operatorId: operator.id,
              denominationId: item.reloadDenominationId || null,
              msisdn: msisdn || null,
              faceValue,
              unitPrice: item.unitPrice,
              costPrice: commission.costPrice,
              commissionPct: commission.commissionPct,
              commissionEarned: commission.commissionEarned,
            },
          });
        }
        continue;
      }

      // PHYSICAL — allocate available PIN cards
      if (!item.reloadDenominationId) {
        throw new BadRequestException('Recharge card sale requires a denomination');
      }
      const cards = await tx.reloadCardStock.findMany({
        where: {
          tenantId,
          operatorId: operator.id,
          denominationId: item.reloadDenominationId,
          status: ReloadCardStatus.AVAILABLE,
        },
        orderBy: { createdAt: 'asc' },
        take: qty,
      });
      if (cards.length < qty) {
        throw new BadRequestException(
          `Not enough ${operator.name} LKR ${faceValue} recharge cards in stock (need ${qty}, have ${cards.length})`,
        );
      }
      for (const card of cards) {
        const costPrice = card.purchaseCost != null && card.purchaseCost >= 0
          ? card.purchaseCost
          : commission.costPrice;
        const commissionEarned = round2(Math.max(0, faceValue - costPrice));
        await tx.reloadCardStock.update({
          where: { id: card.id },
          data: {
            status: ReloadCardStatus.SOLD,
            soldSaleId: saleId,
            soldAt: new Date(),
          },
        });
        await tx.reloadSale.create({
          data: {
            tenantId,
            branchId,
            saleId,
            type: ReloadSaleType.PHYSICAL,
            operatorId: operator.id,
            denominationId: item.reloadDenominationId,
            cardStockId: card.id,
            faceValue,
            unitPrice: item.unitPrice,
            costPrice,
            commissionPct: commission.commissionPct,
            commissionEarned,
          },
        });
      }
    }
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

  // ── POS cashier PIN (switch without re-login) ─────────────────────────

  async getPosPinStatus(tenantId: string, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { id: true, posPinHash: true, firstName: true, lastName: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return {
      hasPin: !!user.posPinHash,
      userId: user.id,
      name: `${user.firstName} ${user.lastName}`.trim(),
    };
  }

  async setPosPin(tenantId: string, userId: string, pin: string) {
    assertValidPosPin(pin);
    // PINs identify the user at unlock, so they must be unique — which makes "is this PIN taken?" an
    // oracle. It is rate-limited like any PIN check and never says WHOSE PIN it is (it used to name the
    // user, letting anyone discover a manager's PIN by trying to set it).
    const scope = `pinset:${tenantId}:${userId}`;
    await this.reservePinAttempt(scope, PosService.PIN_SET_MAX_FAILS);
    const users = await this.prisma.user.findMany({
      where: { tenantId, posPinHash: { not: null }, NOT: { id: userId } },
      select: { id: true, posPinHash: true },
    });
    for (const u of users) {
      if (u.posPinHash && (await verifyPosPinHash(pin, u.posPinHash))) {
        await this.pinLockout.fail(scope, Date.now(), PosService.PIN_SET_MAX_FAILS);
        throw new BadRequestException('This PIN cannot be used. Choose a different 4-digit PIN.');
      }
    }
    await this.pinLockout.succeed(scope);
    const posPinHash = await hashPosPin(pin);
    await this.prisma.user.update({
      where: { id: userId },
      data: { posPinHash },
    });
    return { ok: true, hasPin: true };
  }

  async clearPosPin(tenantId: string, userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, tenantId }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');
    await this.prisma.user.update({ where: { id: userId }, data: { posPinHash: null } });
    return { ok: true, hasPin: false };
  }

  async unlockWithPosPin(tenantId: string, branchId: string, pin: string, _counterId?: string | null, terminalUserId?: string) {
    assertValidPosPin(pin);
    // Brute-force limit per terminal login: without it every PIN (incl. a manager's) could be found in
    // ~17 minutes, and a PIN-switched manager authorises cash actions.
    const scope = `unlock:${tenantId}:${terminalUserId ?? 'unknown'}`;
    await this.reservePinAttempt(scope, PosService.UNLOCK_MAX_FAILS);
    const candidates = await this.prisma.user.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        posPinHash: { not: null },
        ...(branchId
          ? { OR: [{ branchId }, { branchId: null }] }
          : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        posPinHash: true,
        branchId: true,
        roles: { include: { role: { select: { name: true, type: true } } } },
      },
      take: 200,
    });

    let matched: (typeof candidates)[number] | null = null;
    for (const u of candidates) {
      if (u.posPinHash && (await verifyPosPinHash(pin, u.posPinHash))) {
        matched = u;
        break;
      }
    }
    if (!matched) {
      await this.pinLockout.fail(scope, Date.now(), PosService.UNLOCK_MAX_FAILS);
      throw new BadRequestException('Incorrect PIN');
    }
    await this.pinLockout.succeed(scope);

    const resolvedBranchId = await this.resolveBranchId(tenantId, branchId);
    const ownRegister = await findOpenRegister(this.prisma, tenantId, resolvedBranchId, matched.id);
    const sharedRegister = ownRegister?.status === CashRegisterStatus.OPEN ? ownRegister : null;

    const unlockToken = signPosUnlockToken(tenantId, matched.id, resolvedBranchId, terminalUserId);
    const name = `${matched.firstName} ${matched.lastName}`.trim();
    return {
      unlockToken,
      cashier: {
        id: matched.id,
        name,
        firstName: matched.firstName,
        lastName: matched.lastName,
        email: matched.email,
        role: matched.roles[0]?.role?.name ?? matched.roles[0]?.role?.type ?? null,
      },
      shift: sharedRegister
        ? {
            id: sharedRegister.id,
            status: sharedRegister.status,
            openingCash: sharedRegister.openingCash,
            openingTime: sharedRegister.openingTime,
            ownerId: sharedRegister.cashierId,
            ownerName: sharedRegister.cashier
              ? `${sharedRegister.cashier.firstName} ${sharedRegister.cashier.lastName}`.trim()
              : null,
            isOwn: sharedRegister.cashierId === matched.id,
          }
        : null,
      shiftReady: !!sharedRegister && sharedRegister.status === CashRegisterStatus.OPEN,
    };
  }
}

@ApiTags('POS')
@ApiBearerAuth('access-token')
@Controller({ path: 'pos', version: '1' })
export class PosController {
  constructor(private readonly posService: PosService) {}

  private actingCashier(user: IAuthUser, unlockToken?: string) {
    return resolveActingCashierId(user.tenantId, user.id, unlockToken, user.branchId ?? undefined);
  }

  @Post('sale')
  @RequirePermissions('sales:create')
  @ApiOperation({ summary: 'Process a POS sale transaction' })
  createSale(
    @CurrentUser() user: IAuthUser,
    @Body() dto: CreateSaleDto,
    @Headers('x-pos-cashier-token') unlockToken?: string,
    @Headers('x-pos-counter-id') counterId?: string,
  ) {
    return this.posService.createSale(
      user.tenantId,
      user.branchId ?? '',
      this.actingCashier(user, unlockToken),
      dto,
      counterId || undefined,
      { scopeAll: canViewAllPosSales(user.roles ?? []) },
    );
  }

  @Get('sales')
  @RequirePermissions('sales:read')
  @ApiOperation({ summary: 'List sales for branch (cashiers see own bills only)' })
  getSales(
    @CurrentUser() user: IAuthUser,
    @Query() query: { page?: number; limit?: number; search?: string; date?: string },
    @Headers('x-pos-cashier-token') unlockToken?: string,
  ) {
    const scopeAll = canViewAllPosSales(user.roles ?? []);
    return this.posService.getSales(user.tenantId, user.branchId ?? '', query, {
      cashierId: this.actingCashier(user, unlockToken),
      scopeAll,
    });
  }

  @Get('sales/:id')
  @RequirePermissions('sales:read')
  @ApiOperation({ summary: 'Get sale details (cashiers: own sales only)' })
  getSaleById(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Headers('x-pos-cashier-token') unlockToken?: string,
  ) {
    const scopeAll = canViewAllPosSales(user.roles ?? []);
    return this.posService.getSaleById(id, user.tenantId, {
      cashierId: this.actingCashier(user, unlockToken),
      scopeAll,
    });
  }

  @Post('hold')
  @RequirePermissions('sales:create')
  @ApiOperation({ summary: 'Hold a bill for later' })
  holdBill(
    @CurrentUser() user: IAuthUser,
    @Body() dto: HoldBillDto,
    @Headers('x-pos-cashier-token') unlockToken?: string,
  ) {
    return this.posService.holdBill(
      user.tenantId,
      user.branchId ?? '',
      this.actingCashier(user, unlockToken),
      dto,
    );
  }

  @Get('hold')
  @RequirePermissions('sales:read')
  @ApiOperation({ summary: 'Get held bills (cashiers: own holds only)' })
  getHeldBills(
    @CurrentUser() user: IAuthUser,
    @Headers('x-pos-cashier-token') unlockToken?: string,
  ) {
    const scopeAll = canViewAllPosSales(user.roles ?? []);
    return this.posService.getHeldBills(user.tenantId, user.branchId ?? '', {
      cashierId: this.actingCashier(user, unlockToken),
      scopeAll,
    });
  }

  @Delete('hold/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('sales:create')
  @ApiOperation({ summary: 'Delete held bill (cashiers: own holds only)' })
  deleteHeldBill(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Headers('x-pos-cashier-token') unlockToken?: string,
  ) {
    const scopeAll = canViewAllPosSales(user.roles ?? []);
    return this.posService.deleteHeldBill(id, user.tenantId, user.branchId ?? '', {
      cashierId: this.actingCashier(user, unlockToken),
      scopeAll,
    });
  }

  @Get('summary')
  @RequirePermissions('sales:read')
  @ApiOperation({ summary: 'Get daily sales summary (cashiers: own sales only)' })
  getDailySummary(
    @CurrentUser() user: IAuthUser,
    @Query('date') date?: string,
    @Headers('x-pos-cashier-token') unlockToken?: string,
  ) {
    const scopeAll = canViewAllPosSales(user.roles ?? []);
    return this.posService.getDailySummary(user.tenantId, user.branchId ?? '', date, {
      cashierId: this.actingCashier(user, unlockToken),
      scopeAll,
    });
  }

  @Get('products')
  @RequirePermissions('products:read')
  @ApiOperation({ summary: 'Get POS products/variants with stock (pass page= for 20/page pagination)' })
  getProducts(
    @CurrentUser() user: IAuthUser,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
    @Query('category') category?: string,
    @Query('supplierId') supplierId?: string,
    @Query('includeImages') includeImages?: string,
  ) {
    const imagesFlag = includeImages === '1' || includeImages === 'true';
    return this.posService.getProducts(user.tenantId, user.branchId ?? '', {
      search,
      limit: limit ? parseInt(limit, 10) : undefined,
      page: page ? parseInt(page, 10) : undefined,
      category,
      supplierId,
      includeImages: imagesFlag,
    });
  }

  @Post('day-end')
  @RequirePermissions('sales:read')
  @ApiOperation({ summary: 'Close day session and get end-of-day summary' })
  closeDaySession(
    @CurrentUser() user: IAuthUser,
    @Body() body: OptionalNotesDto,
    @Headers('x-pos-cashier-token') unlockToken?: string,
  ) {
    const notes = body.notes;
    return this.posService.closeDaySession(
      user.tenantId,
      user.branchId ?? '',
      this.actingCashier(user, unlockToken),
      notes,
    );
  }

  @Get('barcode/:code')
  @RequirePermissions('products:read')
  @ApiOperation({ summary: 'Lookup variant by barcode or SKU' })
  lookupBarcode(
    @CurrentUser() user: IAuthUser,
    @Param('code') code: string,
    @Query('supplierId') supplierId?: string,
  ) {
    return this.posService.lookupBarcode(user.tenantId, user.branchId ?? '', code, supplierId);
  }

  @Post('returns')
  @RequirePermissions('sales:create')
  @ApiOperation({ summary: 'Process a return/exchange' })
  processReturn(
    @CurrentUser() user: IAuthUser,
    @Body() dto: ReturnSaleDto,
    @Headers('x-pos-cashier-token') unlockToken?: string,
  ) {
    return this.posService.processReturn(
      user.tenantId,
      user.branchId ?? '',
      { id: user.id, roles: user.roles ?? [] },
      dto,
      unlockToken,
    );
  }

  @Get('coupons/validate/:code')
  @RequirePermissions('sales:create')
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
  shiftSummary(
    @CurrentUser() user: IAuthUser,
    @Query('date') date?: string,
    @Headers('x-pos-cashier-token') unlockToken?: string,
  ) {
    return this.posService.cashierShiftSummary(
      user.tenantId,
      user.branchId ?? '',
      this.actingCashier(user, unlockToken),
      date,
    );
  }

  @Get('pin/status')
  @RequirePermissions('sales:read')
  @ApiOperation({ summary: 'Whether current user has a POS PIN set' })
  posPinStatus(@CurrentUser() user: IAuthUser) {
    return this.posService.getPosPinStatus(user.tenantId, user.id);
  }

  @Post('pin/set')
  @RequirePermissions('sales:create')
  @ApiOperation({ summary: 'Set or update your 4-digit POS unlock PIN' })
  setPosPin(@CurrentUser() user: IAuthUser, @Body() dto: SetPosPinDto) {
    return this.posService.setPosPin(user.tenantId, user.id, dto.pin);
  }

  @Delete('pin')
  @RequirePermissions('sales:create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove your POS unlock PIN' })
  clearPosPin(@CurrentUser() user: IAuthUser) {
    return this.posService.clearPosPin(user.tenantId, user.id);
  }

  @Post('pin/unlock')
  @RequirePermissions('sales:create')
  @ApiOperation({ summary: 'Unlock POS / switch cashier with 4-digit PIN (no re-login)' })
  unlockPosPin(
    @CurrentUser() user: IAuthUser,
    @Body() dto: UnlockPosPinDto,
    @Headers('x-pos-counter-id') counterId?: string,
  ) {
    return this.posService.unlockWithPosPin(
      user.tenantId,
      user.branchId ?? '',
      dto.pin,
      counterId || undefined,
      user.id,
    );
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

  @Get('reload/operators')
  @RequirePermissions('sales:read')
  @ApiOperation({ summary: 'List reload / recharge providers with commissions and card stock' })
  listReloadOperators(@CurrentUser() user: IAuthUser) {
    return this.posService.listReloadOperators(user.tenantId);
  }

  @Post('reload/operators')
  @RequirePermissions('sales:create')
  @ApiOperation({ summary: 'Create reload provider' })
  createReloadOperator(@CurrentUser() user: IAuthUser, @Body() dto: UpsertReloadOperatorDto) {
    return this.posService.createReloadOperator(user.tenantId, dto);
  }

  @Put('reload/operators/:id')
  @RequirePermissions('sales:create')
  @ApiOperation({ summary: 'Update reload provider commissions' })
  updateReloadOperator(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateReloadOperatorDto,
  ) {
    return this.posService.updateReloadOperator(user.tenantId, id, dto);
  }

  @Post('reload/cards/import')
  @RequirePermissions('sales:create')
  @ApiOperation({ summary: 'Bulk import physical recharge card PINs' })
  importReloadCards(@CurrentUser() user: IAuthUser, @Body() dto: ImportReloadCardsDto) {
    return this.posService.importReloadCards(user.tenantId, user.branchId ?? '', dto);
  }
}

@Module({
  imports: [InventoryModule, DocumentNumberingModule, PricingModule, ReturnsModule],
  controllers: [PosController],
  providers: [PosService, PinLockoutService],
  exports: [PosService],
})
export class PosModule {}
