'use client'

import { LoadingCenter } from "@/components/ui/loading";
import { useState, useEffect, useCallback } from 'react'
import { Settings, Shield, Database, Bell, Globe, Save, CheckCircle, Loader2, CreditCard, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import {
  fetchPlatformConfig, updatePlatformConfig, fetchHealth, fetchBillingSettings, updateBillingSettings,
  fetchBillingWhatsAppStatus, connectBillingWhatsApp, disconnectBillingWhatsApp,
  sendBillingWhatsAppTest, setBillingWhatsAppTenant,
  type PlatformConfig, type PlatformBillingSettings, type BillingWhatsAppStatus,
} from '@/lib/admin-api'
import MaintenanceModeCard from '@/components/admin/MaintenanceModeCard'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-kpi'
import { ADMIN_CARD, ADMIN_INPUT, ADMIN_SELECT } from '@/lib/admin-ui'
import { cn } from '@/lib/utils'

interface Section { id: string; label: string; icon: React.ElementType }

const SECTIONS: Section[] = [
  { id: 'general',       label: 'General',         icon: Settings      },
  { id: 'security',      label: 'Security',        icon: Shield        },
  { id: 'database',      label: 'Database',        icon: Database      },
  { id: 'notifications', label: 'Notifications',   icon: Bell          },
  { id: 'platform',      label: 'Platform',        icon: Globe         },
  { id: 'billing',       label: 'Invoicing',       icon: CreditCard    },
  { id: 'whatsapp',      label: 'WhatsApp Billing', icon: MessageCircle },
]

export default function SettingsPage() {
  const [active, setActive]   = useState('general')
  const [saved, setSaved]     = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [healthEnv, setHealthEnv] = useState('')

  const [billing, setBilling] = useState<PlatformBillingSettings>({
    companyLegalName: '',
    companyBrandName: '',
    companyWebsite: '',
    companyEmail: '',
    companyPhone: '',
    bankName: '',
    bankAccountName: '',
    bankAccountNumber: '',
    bankSwift: '',
    invoiceDueDays: 20,
    taxRate: 0,
  })
  const [waStatus, setWaStatus] = useState<BillingWhatsAppStatus | null>(null)
  const [waLoading, setWaLoading] = useState(false)
  const [waBusy, setWaBusy] = useState<string | null>(null)
  const [waTestPhone, setWaTestPhone] = useState('')
  const [waTestMessage, setWaTestMessage] = useState('Hexalyte billing WhatsApp test')
  const [waTenantId, setWaTenantId] = useState('')

  const [config, setConfig] = useState<PlatformConfig>({
    platformName: 'HexaOne',
    supportEmail: 'support@hexalyte.com',
    defaultCurrency: 'LKR',
    defaultTimezone: 'Asia/Colombo',
    defaultLanguage: 'en',
    trialDays: 7,
    defaultPlan: 'STARTER',
    maintenanceMode: false,
    maintenanceMessage: 'Hexalyte is currently in maintenance mode. New logins are disabled and some features may be unavailable.',
    sessionTimeoutMins: 480,
    maxLoginAttempts: 5,
    requireMFA: false,
    passwordMinLength: 8,
    allowedOrigins: '',
    apiRateLimitPerMin: 100,
    notificationEmail: '',
  })

  const loadWhatsApp = useCallback(async () => {
    setWaLoading(true)
    try {
      const status = await fetchBillingWhatsAppStatus()
      setWaStatus(status)
      if (status.tenantId) setWaTenantId(status.tenantId)
    } catch {
      setWaStatus(null)
    } finally {
      setWaLoading(false)
    }
  }, [])

  useEffect(() => {
    Promise.all([
      fetchPlatformConfig().catch(() => null),
      fetchBillingSettings().catch(() => null),
      fetchHealth().catch(() => null),
      fetchBillingWhatsAppStatus().catch(() => null),
    ]).then(([cfg, bill, health, wa]) => {
      if (cfg) setConfig(cfg)
      if (bill) setBilling(bill)
      if (health?.environment) setHealthEnv(health.environment)
      if (wa) {
        setWaStatus(wa)
        if (wa.tenantId) setWaTenantId(wa.tenantId)
      }
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (active === 'whatsapp') void loadWhatsApp()
  }, [active, loadWhatsApp])

  async function handleSave() {
    setSaving(true)
    try {
      const [updated, bill] = await Promise.all([
        updatePlatformConfig(config),
        updateBillingSettings(billing),
      ])
      setConfig(updated)
      setBilling(bill)
      setSaved(true)
      toast.success('Platform settings saved')
      setTimeout(() => setSaved(false), 2500)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <LoadingCenter className="h-64 py-0" size={88} />
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settings"
        description="Platform-wide configuration — persisted to database"
        actions={
          <Button variant="default" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : saved ? <CheckCircle size={13} /> : <Save size={13} />}
            {saved ? 'Saved!' : saving ? 'Saving…' : 'Save Changes'}
          </Button>
        }
      />

      <MaintenanceModeCard config={config} onUpdate={setConfig} />

      <div className="flex gap-5">
        <div className="w-48 flex-shrink-0 space-y-0.5">
          {SECTIONS.map(s => {
            const Icon = s.icon
            return (
              <Button
                key={s.id}
                size="sm"
                variant={active === s.id ? 'default' : 'ghost'}
                onClick={() => setActive(s.id)}
                className="w-full justify-start"
              >
                <Icon size={14} className="flex-shrink-0" />
                {s.label}
              </Button>
            )
          })}
        </div>

        <div className={cn(ADMIN_CARD, 'flex-1 p-6')}>
          {active === 'general' && (
            <div className="space-y-5">
              <h2 className="text-sm font-bold text-foreground pb-3 border-b border-border">General Settings</h2>
              <div className="grid grid-cols-2 gap-4">
                {([
                  { label: 'Platform Name', key: 'platformName' as const },
                  { label: 'Support Email', key: 'supportEmail' as const },
                  { label: 'Default Currency', key: 'defaultCurrency' as const },
                  { label: 'Default Timezone', key: 'defaultTimezone' as const },
                ]).map(f => (
                  <div key={f.key}>
                    <label className="block text-xs font-medium text-foreground mb-1">{f.label}</label>
                    <input
                      className={ADMIN_INPUT}
                      value={config[f.key]}
                      onChange={e => setConfig(c => ({ ...c, [f.key]: e.target.value }))}
                    />
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Default Language</label>
                  <select
                    className={ADMIN_SELECT}
                    value={config.defaultLanguage}
                    onChange={e => setConfig(c => ({ ...c, defaultLanguage: e.target.value }))}
                  >
                    <option value="en">English</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {active === 'security' && (
            <div className="space-y-5">
              <h2 className="text-sm font-bold text-foreground pb-3 border-b border-border">Security Settings</h2>
              <div className="grid grid-cols-2 gap-4">
                {([
                  { label: 'Session Timeout (minutes)', key: 'sessionTimeoutMins' as const },
                  { label: 'Max Login Attempts', key: 'maxLoginAttempts' as const },
                  { label: 'Min Password Length', key: 'passwordMinLength' as const },
                ]).map(f => (
                  <div key={f.key}>
                    <label className="block text-xs font-medium text-foreground mb-1">{f.label}</label>
                    <input
                      type="number"
                      className={ADMIN_INPUT}
                      value={config[f.key]}
                      onChange={e => setConfig(c => ({ ...c, [f.key]: parseInt(e.target.value, 10) || 0 }))}
                    />
                  </div>
                ))}
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-foreground mb-1">Allowed Origins (CORS)</label>
                  <textarea
                    className={cn(ADMIN_INPUT, 'font-mono')}
                    rows={2}
                    value={config.allowedOrigins}
                    onChange={e => setConfig(c => ({ ...c, allowedOrigins: e.target.value }))}
                  />
                </div>
                <div className="col-span-2">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <div
                      onClick={() => setConfig(c => ({ ...c, requireMFA: !c.requireMFA }))}
                      className={cn('w-10 h-5 rounded-full transition-colors relative', config.requireMFA ? 'bg-foreground' : 'bg-muted')}
                    >
                      <div className={cn('absolute top-0.5 w-4 h-4 bg-card rounded-full shadow transition-transform', config.requireMFA ? 'translate-x-5' : 'translate-x-0.5')} />
                    </div>
                    <span className="text-sm text-foreground font-medium">Require MFA for admin users</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {active === 'database' && (
            <div className="space-y-5">
              <h2 className="text-sm font-bold text-foreground pb-3 border-b border-border">Database Info</h2>
              <div className="space-y-3">
                {[
                  { label: 'Environment', value: healthEnv || 'production' },
                  { label: 'ORM', value: 'Prisma' },
                  { label: 'Database', value: 'PostgreSQL (fashionerp)' },
                  { label: 'Cache', value: 'Redis' },
                ].map(r => (
                  <div key={r.label} className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
                    <span className="text-xs text-muted-foreground">{r.label}</span>
                    <span className="text-xs font-mono font-medium text-foreground">{r.value}</span>
                  </div>
                ))}
              </div>
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">Database connection is managed via environment variables on the server.</p>
              </div>
            </div>
          )}

          {active === 'notifications' && (
            <div className="space-y-5">
              <h2 className="text-sm font-bold text-foreground pb-3 border-b border-border">Notification Settings</h2>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Admin Notification Email</label>
                <input
                  type="email"
                  className={cn(ADMIN_INPUT, 'max-w-md')}
                  placeholder="admin@hexalyte.com"
                  value={config.notificationEmail}
                  onChange={e => setConfig(c => ({ ...c, notificationEmail: e.target.value }))}
                />
                <p className="text-[10px] text-muted-foreground mt-1">Receives alerts for new tenants, trials expiring, and system issues</p>
              </div>
            </div>
          )}

          {active === 'platform' && (
            <div className="space-y-5">
              <h2 className="text-sm font-bold text-foreground pb-3 border-b border-border">Platform Configuration</h2>
              <p className="text-xs text-muted-foreground">Maintenance Mode is controlled in the card above.</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Trial Period (days)</label>
                  <input type="number" className={ADMIN_INPUT}
                    value={config.trialDays}
                    onChange={e => setConfig(c => ({ ...c, trialDays: parseInt(e.target.value, 10) || 7 }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">API Rate Limit/min</label>
                  <input type="number" className={ADMIN_INPUT}
                    value={config.apiRateLimitPerMin}
                    onChange={e => setConfig(c => ({ ...c, apiRateLimitPerMin: parseInt(e.target.value, 10) || 100 }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Default Plan</label>
                  <select className={ADMIN_SELECT}
                    value={config.defaultPlan}
                    onChange={e => setConfig(c => ({ ...c, defaultPlan: e.target.value }))}>
                    <option value="STARTER">Starter</option>
                    <option value="PROFESSIONAL">Professional</option>
                    <option value="ENTERPRISE">Enterprise</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {active === 'billing' && (
            <div className="space-y-5">
              <h2 className="text-sm font-bold text-foreground pb-3 border-b border-border">Subscription Invoice Settings</h2>
              <p className="text-xs text-muted-foreground">Used when generating invoices from Admin → Subscriptions or Tenant detail.</p>
              <div className="grid grid-cols-2 gap-4">
                {([
                  { label: 'Brand Name', key: 'companyBrandName' as const },
                  { label: 'Legal Company Name', key: 'companyLegalName' as const },
                  { label: 'Website', key: 'companyWebsite' as const },
                  { label: 'Company Email', key: 'companyEmail' as const },
                  { label: 'Phone', key: 'companyPhone' as const },
                  { label: 'Bank Name', key: 'bankName' as const },
                  { label: 'Account Name', key: 'bankAccountName' as const },
                  { label: 'Account Number', key: 'bankAccountNumber' as const },
                  { label: 'SWIFT Code', key: 'bankSwift' as const },
                ]).map(f => (
                  <div key={f.key}>
                    <label className="block text-xs font-medium text-foreground mb-1">{f.label}</label>
                    <input
                      className={ADMIN_INPUT}
                      value={billing[f.key]}
                      onChange={e => setBilling(b => ({ ...b, [f.key]: e.target.value }))}
                    />
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Payment due (days)</label>
                  <input type="number" className={ADMIN_INPUT}
                    value={billing.invoiceDueDays}
                    onChange={e => setBilling(b => ({ ...b, invoiceDueDays: parseInt(e.target.value, 10) || 20 }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Tax rate (%)</label>
                  <input type="number" className={ADMIN_INPUT}
                    value={billing.taxRate}
                    onChange={e => setBilling(b => ({ ...b, taxRate: parseFloat(e.target.value) || 0 }))} />
                </div>
              </div>
            </div>
          )}

          {active === 'whatsapp' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-border">
                <h2 className="text-sm font-bold text-foreground">WhatsApp Billing</h2>
                <Button type="button" variant="outline" size="sm" onClick={() => void loadWhatsApp()} disabled={waLoading}>
                  {waLoading ? <Loader2 size={13} className="animate-spin" /> : null}
                  Refresh
                </Button>
              </div>
              <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Status</span>
                  <span className={cn('font-semibold', waStatus?.connected ? 'text-green-600' : 'text-foreground')}>
                    {waLoading ? 'Loading…' : waStatus?.connected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Billing tenant</span>
                  <span className="font-mono text-xs text-foreground">{waStatus?.tenantId || '—'}</span>
                </div>
                {waStatus?.phone && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Phone</span>
                    <span className="font-mono text-xs text-foreground">{waStatus.phone}</span>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={waBusy === 'connect' || !!waStatus?.connected}
                  onClick={async () => {
                    setWaBusy('connect')
                    try {
                      const s = await connectBillingWhatsApp()
                      setWaStatus(s)
                      toast.success('WhatsApp connected')
                    } catch (e: unknown) {
                      toast.error(e instanceof Error ? e.message : 'Connect failed')
                    } finally {
                      setWaBusy(null)
                    }
                  }}
                >
                  {waBusy === 'connect' ? <Loader2 size={13} className="animate-spin" /> : <MessageCircle size={13} />}
                  Connect
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={waBusy === 'disconnect' || !waStatus?.connected}
                  onClick={async () => {
                    setWaBusy('disconnect')
                    try {
                      const s = await disconnectBillingWhatsApp()
                      setWaStatus(s)
                      toast.success('WhatsApp disconnected')
                    } catch (e: unknown) {
                      toast.error(e instanceof Error ? e.message : 'Disconnect failed')
                    } finally {
                      setWaBusy(null)
                    }
                  }}
                >
                  Disconnect
                </Button>
              </div>
              <div className="space-y-3 pt-2 border-t border-border">
                <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide">Test message</h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">Phone</label>
                    <input
                      className={ADMIN_INPUT}
                      placeholder="+94771234567"
                      value={waTestPhone}
                      onChange={e => setWaTestPhone(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">Message</label>
                    <input
                      className={ADMIN_INPUT}
                      value={waTestMessage}
                      onChange={e => setWaTestMessage(e.target.value)}
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={waBusy === 'test' || !waTestPhone.trim()}
                  onClick={async () => {
                    setWaBusy('test')
                    try {
                      await sendBillingWhatsAppTest(waTestPhone.trim(), waTestMessage.trim() || undefined)
                      toast.success('Test message sent')
                    } catch (e: unknown) {
                      toast.error(e instanceof Error ? e.message : 'Test failed')
                    } finally {
                      setWaBusy(null)
                    }
                  }}
                >
                  {waBusy === 'test' ? <Loader2 size={13} className="animate-spin" /> : null}
                  Send test message
                </Button>
              </div>
              <div className="space-y-3 pt-2 border-t border-border">
                <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide">Set billing tenant</h3>
                <div className="flex flex-col sm:flex-row gap-2 max-w-lg">
                  <input
                    className={cn(ADMIN_INPUT, 'flex-1 font-mono')}
                    placeholder="Tenant ID"
                    value={waTenantId}
                    onChange={e => setWaTenantId(e.target.value)}
                  />
                  <Button
                    type="button"
                    disabled={waBusy === 'tenant' || !waTenantId.trim()}
                    onClick={async () => {
                      setWaBusy('tenant')
                      try {
                        await setBillingWhatsAppTenant(waTenantId.trim())
                        toast.success('Billing tenant updated')
                        await loadWhatsApp()
                      } catch (e: unknown) {
                        toast.error(e instanceof Error ? e.message : 'Update failed')
                      } finally {
                        setWaBusy(null)
                      }
                    }}
                  >
                    {waBusy === 'tenant' ? <Loader2 size={13} className="animate-spin" /> : null}
                    Save tenant
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
