'use client'

import { useState, useEffect } from 'react'
import { Menu, LogOut, Search, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import AdminCommandPalette from '@/components/admin/AdminCommandPalette'
import AdminAlertsPanel from '@/components/admin/AdminAlertsPanel'
import { cn } from '@/lib/utils'

interface Props {
  title: string
  onMenuClick: () => void
  onLogout: () => void
}

export default function AdminHeader({ title, onMenuClick, onLogout }: Props) {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

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
      <header className="h-14 bg-card border-b border-border flex items-center px-4 gap-3 flex-shrink-0">
        <button
          type="button"
          onClick={onMenuClick}
          className="lg:hidden p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg"
        >
          <Menu size={18} />
        </button>

        <h1 className="flex-1 text-sm font-semibold text-foreground truncate">{title}</h1>

        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground bg-muted/60 border border-border rounded-lg hover:bg-muted hover:text-foreground"
        >
          <Search size={13} />
          <span>Search…</span>
          <kbd className="text-[10px] text-muted-foreground bg-card px-1 rounded border border-border">⌘K</kbd>
        </button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg"
            title={isDark ? 'Light mode' : 'Dark mode'}
          >
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <AdminAlertsPanel />
          <button
            type="button"
            onClick={onLogout}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors",
              "text-muted-foreground hover:text-red-600 hover:bg-red-500/10 dark:hover:text-red-400",
            )}
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
