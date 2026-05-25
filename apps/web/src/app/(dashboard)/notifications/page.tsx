"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Bell, AlertTriangle, CheckCircle, Info, Zap, Package, ShoppingCart, Users, Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const DUMMY_NOTIFICATIONS = [
  { id: 1, type: "warning", title: "Low Stock Alert", message: "Men's Slim Fit Jeans (32x32) has only 3 units remaining", time: "5 min ago", read: false },
  { id: 2, type: "success", title: "Sale Completed", message: "Invoice #INV-2024-1891 worth LKR 8,450 processed successfully", time: "12 min ago", read: false },
  { id: 3, type: "info", title: "New Customer", message: "Priya Sharma registered as a Gold tier customer", time: "1 hour ago", read: false },
  { id: 4, type: "warning", title: "Purchase Order Due", message: "PO-2024-045 from TextileCo India is due for delivery today", time: "2 hours ago", read: true },
  { id: 5, type: "success", title: "Stock Transfer Complete", message: "Transfer of 50 units from Main Store to Andheri Branch completed", time: "3 hours ago", read: true },
  { id: 6, type: "info", title: "Daily Summary Ready", message: "Your December 17 sales summary is now available in Reports", time: "Yesterday", read: true },
  { id: 7, type: "warning", title: "Low Stock Alert", message: "Women's Floral Kurta (M, Blue) has only 2 units remaining", time: "Yesterday", read: true },
  { id: 8, type: "success", title: "Return Processed", message: "Return RET-2024-003 for Anjali Mehta has been approved", time: "2 days ago", read: true },
];

const TYPE_CONFIG = {
  warning: { icon: AlertTriangle, color: "text-amber-500", bg: "bg-amber-500/10" },
  success: { icon: CheckCircle, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  info: { icon: Info, color: "text-blue-500", bg: "bg-blue-500/10" },
  error: { icon: Zap, color: "text-red-500", bg: "bg-red-500/10" },
} as const;

export default function NotificationsPage() {
  const [notifications, setNotifications] = React.useState(DUMMY_NOTIFICATIONS);
  const [filter, setFilter] = React.useState<"all" | "unread">("all");

  const displayed = filter === "unread" ? notifications.filter((n) => !n.read) : notifications;
  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = () => setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  const markRead = (id: number) => setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
  const dismiss = (id: number) => setNotifications((prev) => prev.filter((n) => n.id !== id));

  return (
    <div className="space-y-6 p-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            Notifications
            {unreadCount > 0 && (
              <span className="h-6 min-w-6 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Stay updated with your store activity</p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={markAllRead}>
            <Check className="h-3.5 w-3.5" /> Mark all read
          </Button>
        )}
      </div>

      <div className="flex gap-2">
        {(["all", "unread"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium capitalize transition-colors ${filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
          >
            {f} {f === "unread" && unreadCount > 0 ? `(${unreadCount})` : ""}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground rounded-xl border bg-card">
            <Bell className="h-10 w-10 mb-3 opacity-20" />
            <p className="font-medium">All caught up!</p>
            <p className="text-sm mt-1">No {filter === "unread" ? "unread " : ""}notifications</p>
          </div>
        ) : (
          displayed.map((notif, i) => {
            const cfg = TYPE_CONFIG[notif.type as keyof typeof TYPE_CONFIG];
            const Icon = cfg.icon;
            return (
              <motion.div
                key={notif.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className={`flex items-start gap-3 p-4 rounded-xl border transition-all ${!notif.read ? "bg-primary/5 border-primary/20" : "bg-card border-border"}`}
              >
                <div className={`h-8 w-8 rounded-lg ${cfg.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                  <Icon className={`h-4 w-4 ${cfg.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-semibold ${!notif.read ? "" : "text-muted-foreground"}`}>{notif.title}</p>
                    {!notif.read && <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{notif.message}</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">{notif.time}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!notif.read && (
                    <Button variant="ghost" size="icon-sm" onClick={() => markRead(notif.id)}>
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={() => dismiss(notif.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}
