'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ShopFeature } from '@/lib/shop-features';

interface Props {
  features: ShopFeature[];
  compact?: boolean;
  showComingSoon?: boolean;
  className?: string;
  variant?: 'default' | 'on-dark';
}

export function ShopFeatureList({ features, compact, showComingSoon = true, className, variant = 'default' }: Props) {
  const visible = showComingSoon ? features : features.filter((f) => f.live);
  const onDark = variant === 'on-dark';

  return (
    <ul className={cn('space-y-2', className)}>
      {visible.map((f) => (
        <li key={f.label} className="flex items-start gap-2.5">
          <div
            className={cn(
              'flex h-5 w-5 shrink-0 items-center justify-center rounded-full mt-0.5',
              f.live
                ? onDark ? 'bg-white/20 text-white' : 'bg-emerald-500/15 text-emerald-600'
                : onDark ? 'bg-white/10 text-white/50' : 'bg-muted text-muted-foreground',
            )}
          >
            <Check className={cn(compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
          </div>
          <span className={cn(
            'leading-snug',
            compact ? 'text-xs' : 'text-sm',
            onDark ? (f.live ? 'text-white/90' : 'text-white/50') : (!f.live && 'text-muted-foreground'),
          )}>
            {f.label}
            {!f.live && showComingSoon && (
              <span className={cn(
                'ml-1.5 text-[10px] font-medium uppercase tracking-wide',
                onDark ? 'text-amber-300/90' : 'text-amber-600/90',
              )}>Soon</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
