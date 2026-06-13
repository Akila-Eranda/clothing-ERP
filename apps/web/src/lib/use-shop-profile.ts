'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getShopProfile, getStoredShopType, ShopType, type ShopProfile, variantColumnLabels } from '@/lib/shop-profiles';
import { getWorkspace, type WorkspaceConfig } from '@/lib/shop-workspace';
import { hasShopModule } from '@/lib/shop-vertical';

const TENANT_CACHE_KEY = 'fe_tenant_profile';
const TENANT_CACHE_TTL_MS = 10 * 60 * 1000;

function readCachedShopType(): ShopType | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(TENANT_CACHE_KEY);
    if (!raw) return null;
    const { shopType, fetchedAt } = JSON.parse(raw) as { shopType: ShopType; fetchedAt: number };
    if (Date.now() - fetchedAt > TENANT_CACHE_TTL_MS) return null;
    return shopType;
  } catch {
    return null;
  }
}

function writeCachedShopType(shopType: ShopType) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(TENANT_CACHE_KEY, JSON.stringify({ shopType, fetchedAt: Date.now() }));
}

export function useShopProfile(): ShopProfile {
  const cached = readCachedShopType();
  const [profile, setProfile] = useState<ShopProfile>(() =>
    getShopProfile(cached ?? getStoredShopType()),
  );

  useEffect(() => {
    const stored = getStoredShopType();
    const fromCache = readCachedShopType();
    if (fromCache) {
      setProfile(getShopProfile(fromCache));
    } else {
      setProfile(getShopProfile(stored));
    }

    if (fromCache) return;

    api.get<{ shopType?: ShopType }>('/tenants/me')
      .then((r) => {
        if (r.data?.shopType) {
          localStorage.setItem('fe_shop_type', r.data.shopType);
          writeCachedShopType(r.data.shopType);
          setProfile(getShopProfile(r.data.shopType));
        }
      })
      .catch(() => {});
  }, []);

  return profile;
}

export function isGroceryShop(profile?: ShopProfile): boolean {
  return (profile?.type ?? getStoredShopType()) === ShopType.GROCERY;
}

export function hasMultiUnit(profile?: ShopProfile): boolean {
  const p = profile ?? getShopProfile(getStoredShopType());
  return p.units.length > 1;
}

export function hasExpiryTracking(profile?: ShopProfile): boolean {
  return (profile ?? getShopProfile(getStoredShopType())).modules.expiry;
}

export function hasBatchTracking(profile?: ShopProfile): boolean {
  return (profile ?? getShopProfile(getStoredShopType())).modules.batch;
}

export function variantColumnLabelsFromProfile(profile?: ShopProfile): [string, string] {
  return variantColumnLabels(profile?.type ?? getStoredShopType());
}

export function useShopWorkspace(): { profile: ShopProfile; workspace: WorkspaceConfig } {
  const profile = useShopProfile();
  const workspace = getWorkspace(profile.type);
  return { profile, workspace };
}

export { hasShopModule };
