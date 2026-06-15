'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Building2, Users, CreditCard, Activity,
  BarChart3, ScrollText, Settings, Shield, X, Tag,
} from 'lucide-react'
import { AppLogo } from "@/components/brand/app-logo";

const NAV = [
  { href: '/admin/dashboard',      label: 'Dashboard',       icon: LayoutDashboard },
  { href: '/admin/tenants',        label: 'Tenants',          icon: Building2       },
  { href: '/admin/users',          label: 'Users',            icon: Users           },
  { href: '/admin/subscriptions',  label: 'Subscriptions',    icon: CreditCard      },
  { href: '/admin/plans',          label: 'Plans',            icon: Tag             },
  { href: '/admin/system-health',  label: 'System Health',    icon: Activity        },
  { href: '/admin/analytics',      label: 'Analytics',        icon: BarChart3       },
  { href: '/admin/activity-logs',  label: 'Activity Logs',    icon: ScrollText      },
  { href: '/admin/settings',       label: 'Settings',         icon: Settings        },
]

interface Props { onClose?: () => void }

export default function AdminSidebar({ onClose }: Props) {
  const path = usePathname()

  return (
    <aside className="flex flex-col h-full bg-white border-r border-gray-200 w-[220px] flex-shrink-0">
      {/* Logo */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <AppLogo variant="sidebar" className="shrink-0" />
          <p className="text-[10px] text-gray-400 leading-tight truncate">Platform Admin</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="lg:hidden p-1 text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        <div className="space-y-0.5">
          {NAV.map(item => {
            const active = path === item.href || path.startsWith(item.href + '/')
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                  active
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <Icon size={15} className="flex-shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="flex-shrink-0 border-t border-gray-100 p-3">
        <div className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-gray-50 cursor-pointer group">
          <div className="w-7 h-7 bg-gray-900 rounded-full flex items-center justify-center flex-shrink-0">
            <Shield size={12} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-800 truncate">Platform Admin</p>
            <p className="text-[10px] text-gray-400 truncate">Super Admin</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
