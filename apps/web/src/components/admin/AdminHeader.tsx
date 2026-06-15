'use client'

import { useState, useEffect } from 'react'
import { Menu, LogOut, Search } from 'lucide-react'
import AdminCommandPalette from '@/components/admin/AdminCommandPalette'
import AdminAlertsPanel from '@/components/admin/AdminAlertsPanel'

interface Props {
  title: string
  onMenuClick: () => void
  onLogout: () => void
}

export default function AdminHeader({ title, onMenuClick, onLogout }: Props) {
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <header className="h-14 bg-white border-b border-gray-200 flex items-center px-4 gap-3 flex-shrink-0">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
        >
          <Menu size={18} />
        </button>

        <h1 className="flex-1 text-sm font-semibold text-gray-900 truncate">{title}</h1>

        <button
          onClick={() => setPaletteOpen(true)}
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 hover:text-gray-700"
        >
          <Search size={13} />
          <span>Search…</span>
          <kbd className="text-[10px] text-gray-400 bg-white px-1 rounded border border-gray-200">⌘K</kbd>
        </button>

        <div className="flex items-center gap-1">
          <AdminAlertsPanel />
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut size={13} />
            Logout
          </button>
        </div>
      </header>

      <AdminCommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  )
}
