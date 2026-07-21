import { Module } from '@nestjs/common';
import { PricingService } from './pricing.service';

/**
 * Pricing Engine — sole checkout pricing / discount / loyalty math boundary.
 *
 * Public API:
 * - PricingService.validateCoupon()
 * - PricingService.calculateCheckout()
 * - PricingService.recordCouponUsage()
 * - helpers: calculateCartTotals, tierDiscountAmount, computePromotionDiscount, …
 *
 * Consumers: POS, Promotions, (future: Quotations / Workshop).
 */
@Module({
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}

export { PricingService } from './pricing.service';
export {
  calculateCartTotals,
  computePromotionDiscount,
  tierDiscountAmount,
  breakdownCartLine,
  lineDiscountAmount,
  lineTaxAmount,
  loyaltyDiscountFromPoints,
  loyaltyPointsEarned,
  resolveUnitPrice,
  round2,
  TIER_DISCOUNT_PERCENT,
  LOYALTY_POINT_VALUE,
  LOYALTY_EARN_PER_AMOUNT,
} from './pricing.helper';
