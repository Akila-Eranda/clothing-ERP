'use client'

import { useState, useEffect } from 'react'
import { Eye, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  updatePlatformConfig,
  type PlatformConfig,
} from '@/lib/admin-api'
import { clearMaintenanceCache } from '@/lib/platform-status'

interface Props {
  config: PlatformConfig
  onUpdate: (cfg: PlatformConfig) => void
}

export default function MaintenanceModeCard({ config, onUpdate }: Props) {
  const [message, setMessage] = useState(config.maintenanceMessage ?? '')
  const [toggling, setToggling] = useState(false)
  const [savingMsg, setSavingMsg] = useState(false)

  useEffect(() => {
    setMessage(config.maintenanceMessage ?? '')
  }, [config.maintenanceMessage, config.maintenanceMode])

  async function toggleMaintenance() {
    setToggling(true)
    try {
      const updated = await updatePlatformConfig({
        maintenanceMode: !config.maintenanceMode,
        maintenanceMessage: message.trim() || config.maintenanceMessage,
      })
      onUpdate(updated)
      clearMaintenanceCache()
      toast.success(updated.maintenanceMode ? 'Maintenance mode enabled' : 'Maintenance mode disabled')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to update maintenance mode')
    } finally {
      setToggling(false)
    }
  }

  async function saveMessage() {
    setSavingMsg(true)
    try {
      const updated = await updatePlatformConfig({ maintenanceMessage: message.trim() })
      onUpdate(updated)
      clearMaintenanceCache()
      toast.success('Maintenance message saved')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save message')
    } finally {
      setSavingMsg(false)
    }
  }

  const isOn = config.maintenanceMode

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-gray-900">Maintenance Mode</h2>
          <p className="text-xs text-gray-500 mt-1">
            {isOn
              ? 'On — new logins and registrations are disabled'
              : 'Off — shops can log in normally'}
          </p>
        </div>
        <button
          onClick={toggleMaintenance}
          disabled={toggling}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border transition-colors disabled:opacity-50 ${
            isOn
              ? 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              : 'border-gray-900 bg-gray-900 text-white hover:bg-gray-800'
          }`}
        >
          {toggling ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Eye size={14} />
          )}
          {isOn ? 'Turn Off' : 'Turn On'}
        </button>
      </div>

      {isOn && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
          <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-xs font-semibold text-red-700">Maintenance Mode ACTIVE — visible to all users</span>
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">User notification message</label>
        <textarea
          className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-gray-900/10 min-h-[88px] resize-y"
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Hexalyte is currently in maintenance mode. New logins are disabled and some features may be unavailable."
        />
        <p className="text-[10px] text-gray-400 mt-1.5">
          Shown on login page, dashboard banner, and bell notifications when maintenance is ON.
        </p>
        <button
          onClick={saveMessage}
          disabled={savingMsg}
          className="mt-2 text-xs font-medium text-gray-600 hover:text-gray-900 underline disabled:opacity-50"
        >
          {savingMsg ? 'Saving…' : 'Save message only'}
        </button>
      </div>
    </div>
  )
}
