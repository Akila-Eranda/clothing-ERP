"use client";

import { ModuleGate } from "@/components/shop/module-gate";
import { PromotionsHub } from "@/components/promotions/promotions-hub";

export default function PromotionsPage() {
  return (
    <ModuleGate module="promotions">
      <PromotionsHub />
    </ModuleGate>
  );
}
