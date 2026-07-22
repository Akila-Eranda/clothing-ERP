'use client'

import { useState, useEffect } from 'react'
import { Settings, Shield, Database, Bell, Globe, Save, CheckCircle, Loader2, CreditCard } from 'lucide-react'
import { toast } from 'sonner'
import { fetchPlatformConfig, updatePlatformConfig, fetchHealth, fetchBillingSettings, updateBillingSettings, type PlatformConfig, type PlatformBillingSettings } from '@/lib/admin-api'
import MaintenanceModeCard from '@/components/admin/MaintenanceModeCard'
import { Button } from '@/components/ui/button'

interface Section { id: string; label: string; icon: React.ElementType }

const SECTIONS: Section[] = [
  { id: 'general',       label: 'General',       icon: Settings  },
  { id: 'security',      label: 'Security',      icon: Shield    },
  { id: 'database',      label: 'Database',      icon: Database  },
  { id: 'notifications', label: 'Notifications', icon: Bell      },
  { id: 'platform',      label: 'Platform',      icon: Globe     },
  { id: 'billing',       label: 'Invoicing',     icon: CreditCard },
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

  useEffect(() => {
    Promise.all([
      fetchPlatformConfig().catch(() => null),
      fetchBillingSettings().catch(() => null),
      fetchHealth().catch(() => null),
    ]).then(([cfg, bill, health]) => {
      if (cfg) setConfig(cfg)
      if (bill) setBilling(bill)
      if (health?.environment) setHealthEnv(health.environment)
    }).finally(() => setLoading(false))
  }, [])

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
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-300" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-gray-900">Settings</h1>
          <p className="text-xs text-gray-500 mt-0.5">Platform-wide configuration — persisted to database</p>
        </div>
        <Button
          variant="default"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : saved ? <CheckCircle size={13} /> : <Save size={13} />}
          {saved ? 'Saved!' : saving ? 'Saving…' : 'Save Changes'}
        </Button>
      </div>

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

        <div className="flex-1 bg-white rounded-xl border border-gray-200 p-6">
          {active === 'general' && (
            <div className="space-y-5">
              <h2 className="text-sm font-bold text-gray-900 pb-3 border-b border-gray-100">General Settings</h2>
              <div className="grid grid-cols-2 gap-4">
                {([
                  { label: 'Platform Name', key: 'platformName' as const },
                  { label: 'Support Email', key: 'supportEmail' as const },
                  { label: 'Default Currency', key: 'defaultCurrency' as const },
                  { label: 'Default Timezone', key: 'defaultTimezone' as const },
                ]).map(f => (
                  <div key={f.key}>
                    <label className="block text-xs font-medium text-gray-700 mb-1">{f.label}</label>
                    <input
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-gray-900/10"
                      value={config[f.key]}
                      onChange={e => setConfig(c => ({ ...c, [f.key]: e.target.value }))}
                    />
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Default Language</label>
                  <select
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none"
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
              <h2 className="text-sm font-bold text-gray-900 pb-3 border-b border-gray-100">Security Settings</h2>
              <div className="grid grid-cols-2 gap-4">
                {([
                  { label: 'Session Timeout (minutes)', key: 'sessionTimeoutMins' as const },
                  { label: 'Max Login Attempts', key: 'maxLoginAttempts' as const },
                  { label: 'Min Password Length', key: 'passwordMinLength' as const },
                ]).map(f => (
                  <div key={f.key}>
                    <label className="block text-xs font-medium text-gray-700 mb-1">{f.label}</label>
                    <input
                      type="number"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-gray-900/10"
                      value={config[f.key]}
                      onChange={e => setConfig(c => ({ ...c, [f.key]: parseInt(e.target.value, 10) || 0 }))}
                    />
                  </div>
                ))}
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Allowed Origins (CORS)</label>
                  <textarea
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none font-mono"
                    rows={2}
                    value={config.allowedOrigins}
                    onChange={e => setConfig(c => ({ ...c, allowedOrigins: e.target.value }))}
                  />
                </div>
                <div className="col-span-2">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <div
                      onClick={() => setConfig(c => ({ ...c, requireMFA: !c.requireMFA }))}
                      className={`w-10 h-5 rounded-full transition-colors relative ${config.requireMFA ? 'bg-gray-900' : 'bg-gray-200'}`}
                    >
                      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${config.requireMFA ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </div>
                    <span className="text-sm text-gray-700 font-medium">Require MFA for admin users</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {active === 'database' && (
            <div className="space-y-5">
              <h2 className="text-sm font-bold text-gray-900 pb-3 border-b border-gray-100">Database Info</h2>
              <div className="space-y-3">
                {[
                  { label: 'Environment', value: healthEnv || 'production' },
                  { label: 'ORM', value: 'Prisma' },
                  { label: 'Database', value: 'PostgreSQL (fashionerp)' },
                  { label: 'Cache', value: 'Redis' },
                ].map(r => (
                  <div key={r.label} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                    <span className="text-xs text-gray-500">{r.label}</span>
                    <span className="text-xs font-mono font-medium text-gray-800">{r.value}</span>
                  </div>
                ))}
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs text-amber-700 font-medium">Database connection is managed via environment variables on the server.</p>
              </div>
            </div>
          )}

          {active === 'notifications' && (
            <div className="space-y-5">
              <h2 className="text-sm font-bold text-gray-900 pb-3 border-b border-gray-100">Notification Settings</h2>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Admin Notification Email</label>
                <input
                  type="email"
                  className="w-full max-w-md px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none"
                  placeholder="admin@hexalyte.com"
                  value={config.notificationEmail}
                  onChange={e => setConfig(c => ({ ...c, notificationEmail: e.target.value }))}
                />
                <p className="text-[10px] text-gray-400 mt-1">Receives alerts for new tenants, trials expiring, and system issues</p>
              </div>
            </div>
          )}

          {active === 'platform' && (
            <div className="space-y-5">
              <h2 className="text-sm font-bold text-gray-900 pb-3 border-b border-gray-100">Platform Configuration</h2>
              <p className="text-xs text-gray-500">Maintenance Mode is controlled in the card above.</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Trial Period (days)</label>
                  <input type="number" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none"
                    value={config.trialDays}
                    onChange={e => setConfig(c => ({ ...c, trialDays: parseInt(e.target.value, 10) || 7 }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">API Rate Limit/min</label>
                  <input type="number" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none"
                    value={config.apiRateLimitPerMin}
                    onChange={e => setConfig(c => ({ ...c, apiRateLimitPerMin: parseInt(e.target.value, 10) || 100 }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Default Plan</label>
                  <select className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none"
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
              <h2 className="text-sm font-bold text-gray-900 pb-3 border-b border-gray-100">Subscription Invoice Settings</h2>
              <p className="text-xs text-gray-500">Used when generating invoices from Admin → Subscriptions or Tenant detail.</p>
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
                    <label className="block text-xs font-medium text-gray-700 mb-1">{f.label}</label>
                    <input
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none"
                      value={billing[f.key]}
                      onChange={e => setBilling(b => ({ ...b, [f.key]: e.target.value }))}
                    />
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Payment due (days)</label>
                  <input type="number" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none"
                    value={billing.invoiceDueDays}
                    onChange={e => setBilling(b => ({ ...b, invoiceDueDays: parseInt(e.target.value, 10) || 20 }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Tax rate (%)</label>
                  <input type="number" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none"
                    value={billing.taxRate}
                    onChange={e => setBilling(b => ({ ...b, taxRate: parseFloat(e.target.value) || 0 }))} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
