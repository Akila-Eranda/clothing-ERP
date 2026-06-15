'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { AppLogo } from '@/components/brand/app-logo';
import { Button } from '@/components/ui/button';
import { SHOP_TYPE_LIST, ShopType } from '@/lib/shop-profiles';
import { COMMON_FEATURES, getVerticalFeatures } from '@/lib/shop-features';
import { ShopFeatureList } from '@/components/shop/shop-feature-list';

const VERTICAL_ICONS: Record<ShopType, string> = {
  [ShopType.CLOTHING]: '🛍️',
  [ShopType.GROCERY]: '🛒',
  [ShopType.HARDWARE]: '🔨',
  [ShopType.AGRICULTURE]: '🌾',
  [ShopType.SPARE_PARTS]: '🚗',
};

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/login">
            <AppLogo variant="compact" />
          </Link>
          <div className="flex gap-2">
            <Button variant="ghost" asChild><Link href="/login">Login</Link></Button>
            <Button asChild><Link href="/register">Start Free Trial</Link></Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-12 space-y-14">
        <section className="text-center max-w-2xl mx-auto space-y-4">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            One platform. Five business types.
          </h1>
          <p className="text-muted-foreground text-lg">
            Clothing, grocery, hardware, agriculture, or spare parts — each shop gets the tools built for that industry, plus shared ERP features every business needs.
          </p>
        </section>

        <section className="grid md:grid-cols-2 gap-6">
          {SHOP_TYPE_LIST.map((profile) => (
            <article key={profile.type} className="rounded-2xl border bg-card p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">{VERTICAL_ICONS[profile.type]}</span>
                <div>
                  <h2 className="text-lg font-bold">{profile.label} Management System</h2>
                  <p className="text-sm text-muted-foreground">{profile.labelSi}</p>
                </div>
              </div>
              <ShopFeatureList features={getVerticalFeatures(profile.type)} compact />
              <Button variant="outline" size="sm" className="mt-5 w-full" asChild>
                <Link href="/register">
                  Start as {profile.label.replace(' Shop', '')}
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
            </article>
          ))}
        </section>

        <section className="rounded-2xl border bg-muted/30 p-8">
          <div className="flex items-center gap-2 mb-6">
            <span className="text-2xl">🚀</span>
            <h2 className="text-xl font-bold">Common Features (All Businesses)</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8">
            <ShopFeatureList features={COMMON_FEATURES} compact />
          </div>
          <p className="text-xs text-muted-foreground mt-6">
            Features marked &quot;Soon&quot; are on the roadmap (SMS, WhatsApp, mobile app, quotations, delivery notes).
          </p>
        </section>
      </main>
    </div>
  );
}
