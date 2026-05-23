'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import AdminSidebar from '@/components/admin/AdminSidebar'
import AdminHeader from '@/components/admin/AdminHeader'
import { adminAuth } from '@/lib/admin-api'

const PAGE_TITLES: Record<string, string> = {
  '/admin/dashboard':     'Dashboard',
  '/admin/tenants':       'Tenants',
  '/admin/users':         'Users',
  '/admin/subscriptions': 'Subscriptions',
  '/admin/system-health': 'System Health',
  '/admin/analytics':     'Analytics',
  '/admin/activity-logs': 'Activity Logs',
  '/admin/settings':      'Settings',
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [ready, setReady] = useState(false)
  const path = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (path === '/admin/login') { setReady(true); return }
    const token = adminAuth.getToken()
    if (!token) {
      router.replace('/admin/login')
    } else {
      setReady(true)
    }
  }, [router, path])

  function handleLogout() {
    adminAuth.clear()
    router.replace('/admin/login')
  }

  const isLogin = path === '/admin/login'

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f8fafc]">
        <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (isLogin) return <>{children}</>

  const baseRoute = '/' + path.split('/').slice(1, 3).join('/')
  const title = PAGE_TITLES[baseRoute] ?? 'Admin'

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8fafc]">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <div className={`fixed lg:static inset-y-0 left-0 z-50 transition-transform duration-200 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <AdminSidebar onClose={() => setSidebarOpen(false)} />
      </div>
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <AdminHeader title={title} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
