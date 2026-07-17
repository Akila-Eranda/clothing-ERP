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
    <div className="p-6 space-y-6 max-w-[1200px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-sm text-muted-foreground">
          {profile.label} · {description}
        </p>
      </div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="group">
            <Card className="h-full transition-colors hover:border-primary/40">
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
