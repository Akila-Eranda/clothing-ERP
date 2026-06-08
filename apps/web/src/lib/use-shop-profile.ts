'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getShopProfile, getStoredShopType, ShopType, type ShopProfile, variantColumnLabels } from '@/lib/shop-profiles';

export function useShopProfile(): ShopProfile {
  const [profile, setProfile] = useState<ShopProfile>(() => getShopProfile(getStoredShopType()));

  useEffect(() => {
    const stored = getStoredShopType();
    setProfile(getShopProfile(stored));
    api.get<{ shopType?: ShopType }>('/tenants/me')
      .then((r) => {
        if (r.data?.shopType) {
          localStorage.setItem('fe_shop_type', r.data.shopType);
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
