"use client";

import Link from "next/link";
import { type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useShopWorkspace } from "@/lib/use-shop-profile";

export type AccountingLinkCard = {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
};

export function AccountingMenuHub({
  title,
  description,
  links,
}: {
  title: string;
  description: string;
  links: AccountingLinkCard[];
}) {
  const { profile } = useShopWorkspace();

  return (
    <div className="page-shell w-full">
      <div>
        <h1 className="text-[26px] md:text-3xl font-bold tracking-tight leading-tight">{title}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {profile.label} · {description}
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="group">
            <Card className="h-full rounded-[18px] transition-all hover:border-primary/40 hover:-translate-y-0.5 hover:shadow-[0_4px_14px_rgba(15,23,42,0.07)]">
              <CardContent className="p-5 flex gap-3 items-start">
                <div className="p-2.5 rounded-xl bg-primary/10 text-primary shrink-0">
                  <link.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm group-hover:text-primary transition-colors">
                    {link.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {link.description}
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
