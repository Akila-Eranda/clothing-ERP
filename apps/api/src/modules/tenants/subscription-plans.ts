import { SubscriptionPlan } from '@prisma/client';

export const PLATFORM_CONFIG_SUBDOMAIN = '__platform_config__';

export interface SubscriptionPlanDef {
  id: string;
  key: SubscriptionPlan;
  name: string;
  price: number;
  currency: string;
  interval: string;
  description: string;
  features: string[];
  maxUsers: number;
  maxBranches: number;
  maxProducts: number;
}

export const DEFAULT_SUBSCRIPTION_PLANS: SubscriptionPlanDef[] = [
  {
    id: 'starter',
    key: SubscriptionPlan.STARTER,
    name: 'Starter',
    price: 1199,
    currency: 'Rs.',
    interval: 'mo',
    description: '3 users, 1 branch, basic POS',
    features: ['3 Users', '1 Branch', 'Basic POS', 'Inventory'],
    maxUsers: 3,
    maxBranches: 1,
    maxProducts: 500,
  },
  {
    id: 'professional',
    key: SubscriptionPlan.PROFESSIONAL,
    name: 'Professional',
    price: 4799,
    currency: 'Rs.',
    interval: 'mo',
    description: '10 users, 3 branches, analytics & HR',
    features: ['10 Users', '3 Branches', 'Analytics', 'HR module'],
    maxUsers: 10,
    maxBranches: 3,
    maxProducts: 5000,
  },
  {
    id: 'enterprise',
    key: SubscriptionPlan.ENTERPRISE,
    name: 'Enterprise',
    price: 14399,
    currency: 'Rs.',
    interval: 'mo',
    description: 'High limits, API access, white-label',
    features: ['Unlimited Users', 'Unlimited Branches', 'API Access', 'White-label'],
    maxUsers: -1,
    maxBranches: -1,
    maxProducts: -1,
  },
  {
    id: 'custom',
    key: SubscriptionPlan.CUSTOM,
    name: 'Custom',
    price: 0,
    currency: 'Rs.',
    interval: 'mo',
    description: 'Negotiated limits per tenant',
    features: ['Custom limits', 'Dedicated support'],
    maxUsers: -1,
    maxBranches: -1,
    maxProducts: -1,
  },
];

export function toDbLimit(value: number): number {
  return value < 0 ? 999_999 : value;
}

export function resolvePlanLimits(
  plan: SubscriptionPlan,
  catalog?: SubscriptionPlanDef[],
): { maxUsers: number; maxBranches: number; maxProducts: number } {
  const defs = catalog ?? DEFAULT_SUBSCRIPTION_PLANS;
  const def = defs.find((p) => p.key === plan);
  if (!def) {
    const fallback = DEFAULT_SUBSCRIPTION_PLANS.find((p) => p.key === SubscriptionPlan.STARTER)!;
    return {
      maxUsers: toDbLimit(fallback.maxUsers),
      maxBranches: toDbLimit(fallback.maxBranches),
      maxProducts: toDbLimit(fallback.maxProducts),
    };
  }
  return {
    maxUsers: toDbLimit(def.maxUsers),
    maxBranches: toDbLimit(def.maxBranches),
    maxProducts: toDbLimit(def.maxProducts),
  };
}
