'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Building2, Users, CreditCard, Activity,
  BarChart3, ScrollText, Settings, Shield, X, Tag, ScanSearch,
  Megaphone, Rocket, Lightbulb, LifeBuoy, UserCog,
} from 'lucide-react'
import { AppLogo } from "@/components/brand/app-logo"
import { cn } from "@/lib/utils"
import { useSidebarLogoOnDark } from "@/hooks/use-sidebar-logo-theme"
import { adminAuth } from "@/lib/admin-api"

const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
      { href: '/admin/activity-logs', label: 'Activity Logs', icon: ScrollText },
    ],
  },
  {
    label: 'Tenants',
    items: [
      { href: '/admin/tenants', label: 'Tenants', icon: Building2 },
      { href: '/admin/users', label: 'Users', icon: Users },
      { href: '/admin/support', label: 'Support', icon: LifeBuoy },
    ],
  },
  {
    label: 'Billing',
    items: [
      { href: '/admin/subscriptions', label: 'Subscriptions', icon: CreditCard },
      { href: '/admin/plans', label: 'Plans', icon: Tag },
    ],
  },
  {
    label: 'Comms',
    items: [
      { href: '/admin/announcements', label: 'Announcements', icon: Megaphone },
      { href: '/admin/releases', label: 'Releases', icon: Rocket },
      { href: '/admin/suggestions', label: 'Suggestions', icon: Lightbulb },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/admin/system-health', label: 'System Health', icon: Activity },
      { href: '/admin/security-scan', label: 'Security Scan', icon: ScanSearch },
      { href: '/admin/admins', label: 'Admins', icon: UserCog },
      { href: '/admin/settings', label: 'Settings', icon: Settings },
    ],
  },
]

interface Props { onClose?: () => void }

export default function AdminSidebar({ onClose }: Props) {
  const path = usePathname()
  const logoOnDark = useSidebarLogoOnDark()
  const roles = adminAuth.getRoles()

  return (
    <aside className="flex flex-col h-full bg-card border-r border-border w-[220px] flex-shrink-0">
      <div className="flex items-center justify-between h-14 px-4 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <AppLogo
            variant="compact"
            theme={logoOnDark ? "dark" : "light"}
            className="shrink-0 max-w-[140px]"
          />
          <p className="text-[10px] text-muted-foreground leading-tight truncate">Platform Admin</p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="lg:hidden p-1 text-muted-foreground hover:text-foreground"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = path === item.href || path.startsWith(item.href + '/')
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={cn(
                      "flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors",
                      active
                        ? "bg-primary/12 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon size={15} className="flex-shrink-0" />
                    <span className="flex-1 truncate">{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="flex-shrink-0 border-t border-border p-3">
        <div className="flex items-center gap-2.5 p-2 rounded-lg">
          <div className="w-7 h-7 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
            <Shield size={12} className="text-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-foreground truncate">Platform Admin</p>
            <p className="text-[10px] text-muted-foreground truncate">
              {roles.includes('SUPER_ADMIN') ? 'Super Admin' : roles[0] || 'Admin'}
            </p>
          </div>
        </div>
      </div>
    </aside>
  )
}
