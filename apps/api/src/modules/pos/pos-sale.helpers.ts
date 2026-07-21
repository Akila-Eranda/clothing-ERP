/** @deprecated Prefer `@/modules/pricing` — re-exports for backward compatibility. */

export {
  TIER_DISCOUNT_PERCENT,
  tierDiscountAmount,
  computePromotionDiscount,
} from '@/modules/pricing/pricing.helper';

import { PaymentMethod } from '@prisma/client';

export function buildPaymentsSummary(methods: PaymentMethod[]): string {
  if (methods.length <= 1) return methods[0] ?? PaymentMethod.CASH;
  return methods.join('+');
}
