"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Bell, AlertTriangle, CheckCircle, Info, Zap, Check, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { api } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Notification {
  id: string;
  title: string;
  message: string;
  type: "INFO" | "LOW_STOCK" | "NEW_SALE" | "WARNING" | "ERROR" | string;
  link?: string | null;
  createdAt: string;
}
interface UserNotification {
  id: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  notification: Notification;
}
interface PaginatedResponse<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const TYPE_CFG: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  LOW_STOCK: { icon: AlertTriangle, color: "text-amber-500",  bg: "bg-amber-500/10"  },
  NEW_SALE:  { icon: CheckCircle,   color: "text-emerald-500",bg: "bg-emerald-500/10"},
  INFO:      { icon: Info,          color: "text-blue-500",   bg: "bg-blue-500/10"   },
  WARNING:   { icon: AlertTriangle, color: "text-amber-500",  bg: "bg-amber-500/10"  },
  ERROR:     { icon: Zap,           color: "text-red-500",    bg: "bg-red-500/10"    },
};
const DEFAULT_CFG = { icon: Bell, color: "text-muted-foreground", bg: "bg-muted/50" };

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "Just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h > 1 ? "s" : ""} ago`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d} day${d > 1 ? "s" : ""} ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function NotificationsPage() {
  const [items, setItems]         = useState<UserNotification[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState<"all" | "unread">("all");
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<PaginatedResponse<UserNotification>>("/notifications?limit=50");
      setItems(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch { toast.error("Failed to load notifications"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const markRead = async (un: UserNotification) => {
    if (un.isRead) return;
    try {
      await api.patch(`/notifications/${un.notification.id}/read`, {});
      setItems((prev) => prev.map((x) => x.id === un.id ? { ...x, isRead: true } : x));
    } catch { toast.error("Failed to mark as read"); }
  };

  const markAllRead = async () => {
    setMarkingAll(true);
    try {
      await api.patch("/notifications/read-all", {});
      setItems((prev) => prev.map((x) => ({ ...x, isRead: true })));
      toast.success("All marked as read");
    } catch { toast.error("Failed"); }
    finally { setMarkingAll(false); }
  };

  const displayed = filter === "unread" ? items.filter((n) => !n.isRead) : items;
  const unreadCount = items.filter((n) => !n.isRead).length;

  return (
    <div className="space-y-6 p-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
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
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={markAllRead} disabled={markingAll}>
              <Check className="h-3.5 w-3.5" /> Mark all read
            </Button>
          )}
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex gap-2">
        {(["all", "unread"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium capitalize transition-colors ${filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
            {f}{f === "unread" && unreadCount > 0 ? ` (${unreadCount})` : ""}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-2">
        {loading ? (
          [...Array(5)].map((_, i) => <div key={i} className="h-16 rounded-xl border bg-card animate-pulse" />)
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground rounded-xl border bg-card">
            <Bell className="h-10 w-10 mb-3 opacity-20" />
            <p className="font-medium">All caught up!</p>
            <p className="text-sm mt-1">No {filter === "unread" ? "unread " : ""}notifications</p>
          </div>
        ) : (
          displayed.map((un) => {
            const notif = un.notification;
            const cfg = TYPE_CFG[notif.type] ?? DEFAULT_CFG;
            const Icon = cfg.icon;
            return (
              <div key={un.id}
                className={`flex items-start gap-3 p-4 rounded-xl border transition-all cursor-pointer hover:shadow-sm ${!un.isRead ? "bg-primary/5 border-primary/20" : "bg-card border-border"}`}
                onClick={() => markRead(un)}>
                <div className={`h-8 w-8 rounded-lg ${cfg.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                  <Icon className={`h-4 w-4 ${cfg.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-semibold ${!un.isRead ? "text-foreground" : "text-muted-foreground"}`}>{notif.title}</p>
                    {!un.isRead && <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{notif.message}</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">{timeAgo(un.createdAt)}</p>
                </div>
                {!un.isRead && (
                  <Button variant="ghost" size="icon-sm" className="shrink-0" onClick={(e) => { e.stopPropagation(); markRead(un); }}>
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
