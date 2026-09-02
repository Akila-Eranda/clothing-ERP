'use client'

import { useState, useEffect } from 'react'
import { Eye, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  updatePlatformConfig,
  type PlatformConfig,
} from '@/lib/admin-api'
import { clearMaintenanceCache } from '@/lib/platform-status'
import { ADMIN_CARD, ADMIN_INPUT } from '@/lib/admin-ui'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

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
    <div className={cn(ADMIN_CARD, 'p-5 space-y-4')}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-foreground">Maintenance Mode</h2>
          <p className="text-xs text-muted-foreground mt-1">
            {isOn
              ? 'On — new logins and registrations are disabled'
              : 'Off — shops can log in normally'}
          </p>
        </div>
        <Button
          type="button"
          variant={isOn ? 'outline' : 'default'}
          onClick={toggleMaintenance}
          disabled={toggling}
          className="gap-1.5"
        >
          {toggling ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Eye size={14} />
          )}
          {isOn ? 'Turn Off' : 'Turn On'}
        </Button>
      </div>

      {isOn && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
          <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-xs font-semibold text-red-600 dark:text-red-400">Maintenance Mode ACTIVE — visible to all users</span>
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-foreground mb-1.5">User notification message</label>
        <textarea
          className={cn(ADMIN_INPUT, 'min-h-[88px] resize-y')}
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Hexalyte is currently in maintenance mode. New logins are disabled and some features may be unavailable."
        />
        <p className="text-[10px] text-muted-foreground mt-1.5">
          Shown on login page, dashboard banner, and bell notifications when maintenance is ON.
        </p>
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={saveMessage}
          disabled={savingMsg}
          className="mt-2 h-auto px-0 text-xs"
        >
          {savingMsg ? 'Saving…' : 'Save message only'}
        </Button>
      </div>
    </div>
  )
}
