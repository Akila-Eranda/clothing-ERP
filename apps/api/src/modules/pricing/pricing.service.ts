/** Pricing Engine — coupon validation + checkout pricing orchestration. */

import { Injectable } from '@nestjs/common';
import { DiscountType, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { assertShopModule } from '@/shared/shop-module.helper';
import {
  calculateCartTotals,
  CartLineInput,
  CartTotalsResult,
  computePromotionDiscount,
  tierDiscountAmount,
} from './pricing.helper';
import { CustomerTier } from '@prisma/client';

export type CouponValidationResult =
  | {
      valid: true;
      discountAmount: number;
      promotionId: string;
      name: string;
      promo?: {
        id: string;
        name: string;
        discountType: DiscountType;
        discountValue: number;
        maxDiscount: number | null;
      };
    }
  | { valid: false; reason: string };

export type CheckoutPricingInput = {
  items: CartLineInput[];
  manualDiscount?: number;
  couponCode?: string | null;
  customerTier?: CustomerTier | null;
  applyTierDiscount?: boolean;
  loyaltyPointsToRedeem?: number;
  availableLoyaltyPoints?: number;
};

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validate an active coupon for a tenant order amount.
   * Soft-fails when promotions module is disabled (valid: false).
   */
  async validateCoupon(
    tenantId: string,
    couponCode: string,
    orderAmount: number,
    options?: { requireModule?: boolean },
  ): Promise<CouponValidationResult> {
    const code = couponCode.trim().toUpperCase();
    if (!code) return { valid: false, reason: 'Coupon code required' };

    try {
      await assertShopModule(this.prisma, tenantId, 'promotions');
    } catch (e) {
      if (options?.requireModule) throw e;
      return { valid: false, reason: 'Promotions module not enabled' };
    }

    const now = new Date();
    const promo = await this.prisma.promotion.findFirst({
      where: {
        tenantId,
        couponCode: code,
        isActive: true,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gte: now } }],
      },
    });

    if (!promo) {
      return { valid: false, reason: 'Coupon or gift voucher not found or expired' };
    }
    if (promo.minOrderAmount > 0 && orderAmount < promo.minOrderAmount) {
      return { valid: false, reason: `Minimum order LKR ${promo.minOrderAmount} required` };
    }
    if (promo.usageLimit && promo.usageCount >= promo.usageLimit) {
      return { valid: false, reason: 'Coupon usage limit reached' };
    }

    const discountAmount = computePromotionDiscount(
      promo.discountType,
      promo.discountValue,
      orderAmount,
      promo.maxDiscount,
    );

    return {
      valid: true,
      discountAmount,
      promotionId: promo.id,
      name: promo.name,
      promo: {
        id: promo.id,
        name: promo.name,
        discountType: promo.discountType,
        discountValue: promo.discountValue,
        maxDiscount: promo.maxDiscount,
      },
    };
  }

  /**
   * Resolve full checkout totals including optional coupon + tier + loyalty.
   * Does not mutate promotions usage — caller increments on successful sale.
   */
  async calculateCheckout(
    tenantId: string,
    input: CheckoutPricingInput,
  ): Promise<CartTotalsResult & { promotionId: string | null; couponName: string | null }> {
    // Preliminary subtotal for coupon min-order checks (line discounts applied)
    const preliminary = calculateCartTotals({
      items: input.items,
      manualDiscount: 0,
      couponDiscount: 0,
      tierDiscount: 0,
    });

    let couponDiscount = 0;
    let promotionId: string | null = null;
    let couponName: string | null = null;

    if (input.couponCode?.trim()) {
      const coupon = await this.validateCoupon(tenantId, input.couponCode, preliminary.subtotal);
      if (!coupon.valid) {
        throw new Error(coupon.reason);
      }
      couponDiscount = coupon.discountAmount;
      promotionId = coupon.promotionId;
      couponName = coupon.name;
    }

    const tierDiscount =
      input.applyTierDiscount !== false && input.customerTier
        ? tierDiscountAmount(preliminary.subtotal, input.customerTier)
        : 0;

    const totals = calculateCartTotals({
      items: input.items,
      manualDiscount: input.manualDiscount,
      couponDiscount,
      tierDiscount,
      loyaltyPointsToRedeem: input.loyaltyPointsToRedeem,
      availableLoyaltyPoints: input.availableLoyaltyPoints,
    });

    return { ...totals, promotionId, couponName };
  }

  /** Mark coupon usage after a successful sale (inside caller's transaction). */
  async recordCouponUsage(
    tx: Prisma.TransactionClient,
    promotionId: string,
  ): Promise<void> {
    await tx.promotion.update({
      where: { id: promotionId },
      data: { usageCount: { increment: 1 } },
    });
  }
}
