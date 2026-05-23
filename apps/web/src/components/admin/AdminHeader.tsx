'use client'

import { Menu, LogOut, Bell } from 'lucide-react'

interface Props {
  title: string
  onMenuClick: () => void
  onLogout: () => void
}

export default function AdminHeader({ title, onMenuClick, onLogout }: Props) {
  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center px-4 gap-3 flex-shrink-0">
      <button
        onClick={onMenuClick}
        className="lg:hidden p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
      >
        <Menu size={18} />
      </button>

      <h1 className="flex-1 text-sm font-semibold text-gray-900">{title}</h1>

      <div className="flex items-center gap-1">
        <button className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
          <Bell size={16} />
        </button>
        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        >
          <LogOut size={13} />
          Logout
        </button>
      </div>
    </header>
  )
}
