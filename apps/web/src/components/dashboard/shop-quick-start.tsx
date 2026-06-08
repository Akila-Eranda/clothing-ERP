'use client';

import Link from 'next/link';
import {
  ShoppingCart, Package, ShoppingBag, Warehouse, Users, FileBarChart, Tag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { QuickAction } from '@/lib/shop-workspace';
import { useUIStore } from '@/stores/ui-store';

const ICONS = {
  pos: ShoppingCart,
  product: Package,
  purchase: ShoppingBag,
  inventory: Warehouse,
  customer: Users,
  report: FileBarChart,
  barcode: Tag,
};

interface Props {
  actions: QuickAction[];
  tips: string[];
  shopEmoji: string;
  shopLabel: string;
}

export function ShopQuickStart({ actions, tips, shopEmoji, shopLabel }: Props) {
  const { openPos } = useUIStore();

  return (
    <Card className="border-primary/20 bg-gradient-to-r from-primary/5 via-background to-violet-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <span>{shopEmoji}</span>
          {shopLabel} — Quick Start
        </CardTitle>
        <CardDescription>Common tasks — one click away</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {actions.map((action) => {
            const Icon = ICONS[action.icon];
            if (action.pos) {
              return (
                <Button key={action.label} onClick={openPos} className="gap-2">
                  <Icon className="h-4 w-4" />
                  {action.label}
                </Button>
              );
            }
            return (
              <Button key={action.label} variant="outline" asChild className="gap-2">
                <Link href={action.href ?? '/dashboard'}>
                  <Icon className="h-4 w-4" />
                  {action.label}
                </Link>
              </Button>
            );
          })}
        </div>
        <ul className="space-y-1.5 text-xs text-muted-foreground">
          {tips.map((tip) => (
            <li key={tip} className="flex gap-2">
              <span className="text-primary shrink-0">•</span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
