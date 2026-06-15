import type { Metadata } from "next";
import { PosCustomerDisplayScreen } from "@/components/pos/pos-customer-display-screen";

export const metadata: Metadata = {
  title: "Customer Display",
  description: "Customer-facing POS display — shows cart items and totals in real time.",
};

export default function CustomerDisplayPage() {
  return <PosCustomerDisplayScreen />;
}
