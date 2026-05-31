import { SubscriptionPlan, TenantStatus } from '@prisma/client';

export const PLATFORM_CONFIG_SUBDOMAIN = '__platform_config__';
/** STARTER plan includes a free trial (days). */
export const STARTER_TRIAL_DAYS = 14;

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
    description: `14-day free trial · then Rs.1,199/mo · 3 users, 1 branch`,
    features: ['14-day free trial', '3 Users', '1 Branch', 'Basic POS', 'Inventory'],
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

export function addTrialDays(from: Date = new Date(), days = STARTER_TRIAL_DAYS): Date {
  const end = new Date(from);
  end.setDate(end.getDate() + days);
  return end;
}

/** New tenant: STARTER → TRIAL + 14 days; paid plans → ACTIVE immediately. */
export function subscriptionFieldsForNewTenant(plan: SubscriptionPlan): {
  status: TenantStatus;
  trialEndsAt: Date | null;
} {
  if (plan === SubscriptionPlan.STARTER) {
    return { status: TenantStatus.TRIAL, trialEndsAt: addTrialDays() };
  }
  return { status: TenantStatus.ACTIVE, trialEndsAt: null };
}

/** Plan change from admin: upgrade clears trial; downgrade to STARTER starts a new trial window. */
export function subscriptionFieldsForPlanChange(plan: SubscriptionPlan): {
  status: TenantStatus;
  trialEndsAt: Date | null;
} {
  if (plan === SubscriptionPlan.STARTER) {
    return { status: TenantStatus.TRIAL, trialEndsAt: addTrialDays() };
  }
  return { status: TenantStatus.ACTIVE, trialEndsAt: null };
}

export function isStarterTrialExpired(trialEndsAt: Date | null | undefined): boolean {
  if (!trialEndsAt) return false;
  return trialEndsAt.getTime() < Date.now();
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
