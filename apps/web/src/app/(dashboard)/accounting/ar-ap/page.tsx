"use client";

import {
  Users, Scale, Wallet, CalendarClock, Bell, FileBarChart, Truck, Banknote, FileText,
} from "lucide-react";
import { AccountingMenuHub } from "@/components/accounting/accounting-menu-hub";

export default function ArApPage() {
  return (
    <AccountingMenuHub
      title="AR / AP"
      description="Accounts receivable, payable, and credit collections"
      links={[
        {
          title: "Receivable (AR)",
          description: "Dashboard, statements, and collections",
          href: "/accounting/finance/receivable",
          icon: Wallet,
        },
        {
          title: "Customer Statement",
          description: "Printable AR ledger by customer",
          href: "/accounting/ar/statement",
          icon: FileBarChart,
        },
        {
          title: "Receive Payment (AR)",
          description: "Settle credit and issue credit notes",
          href: "/accounting/ar/payment",
          icon: Users,
        },
        {
          title: "Payable (AP)",
          description: "Dashboard, bills, and aging",
          href: "/accounting/finance/payable",
          icon: Scale,
        },
        {
          title: "Supplier Statement",
          description: "Printable AP ledger by supplier",
          href: "/accounting/ap/statement",
          icon: FileText,
        },
        {
          title: "Pay Supplier",
          description: "AP payments and debit notes",
          href: "/accounting/ap/payment",
          icon: Banknote,
        },
        {
          title: "Credit Customers",
          description: "Limits, balances, settle and advances",
          href: "/accounting/credit",
          icon: Users,
        },
        {
          title: "Payment Schedules",
          description: "Installment plans for credit customers",
          href: "/accounting/credit/schedules",
          icon: CalendarClock,
        },
        {
          title: "Reminders",
          description: "Overdue credit payment reminders",
          href: "/accounting/credit/reminders",
          icon: Bell,
        },
        {
          title: "Collections",
          description: "Recovery rates and collection reports",
          href: "/accounting/credit/collections",
          icon: FileBarChart,
        },
        {
          title: "Suppliers",
          description: "Supplier master and outstanding balances",
          href: "/suppliers",
          icon: Truck,
        },
      ]}
    />
  );
}
