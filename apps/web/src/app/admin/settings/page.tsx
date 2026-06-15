'use client'

import { useState } from 'react'
import { Settings, Shield, Database, Bell, Globe, Save, CheckCircle, Eye, EyeOff } from 'lucide-react'

interface Section { id: string; label: string; icon: React.ElementType }

const SECTIONS: Section[] = [
  { id: 'general',    label: 'General',          icon: Settings  },
  { id: 'security',   label: 'Security',          icon: Shield    },
  { id: 'database',   label: 'Database',          icon: Database  },
  { id: 'notifications', label: 'Notifications',  icon: Bell      },
  { id: 'platform',   label: 'Platform',          icon: Globe     },
]

export default function SettingsPage() {
  const [active, setActive]   = useState('general')
  const [saved, setSaved]     = useState(false)
  const [showKey, setShowKey] = useState(false)

  const [general, setGeneral] = useState({
    platformName: 'HexaOne',
    supportEmail: 'support@fashionerp.com',
    defaultCurrency: 'LKR',
    defaultTimezone: 'Asia/Colombo',
    defaultLanguage: 'en',
  })

  const [security, setSecurity] = useState({
    sessionTimeoutMins: '480',
    maxLoginAttempts: '5',
    requireMFA: false,
    passwordMinLength: '8',
    allowedOrigins: 'http://localhost:3002',
  })

  const [platform, setPlatform] = useState({
    maxTenantsPerPlan: '100',
    trialDays: '7',
    defaultPlan: 'STARTER',
    maintenanceMode: false,
    apiRateLimitPerMin: '100',
  })

  function handleSave() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-bold text-gray-900">Settings</h1>
        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
        >
          {saved ? <CheckCircle size={13} /> : <Save size={13} />}
          {saved ? 'Saved!' : 'Save Changes'}
        </button>
      </div>

      <div className="flex gap-5">
        {/* Sidebar nav */}
        <div className="w-48 flex-shrink-0 space-y-0.5">
          {SECTIONS.map(s => {
            const Icon = s.icon
            return (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                  active === s.id ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <Icon size={14} className="flex-shrink-0" />
                {s.label}
              </button>
            )
          })}
        </div>

        {/* Content */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 p-6">

          {active === 'general' && (
            <div className="space-y-5">
              <h2 className="text-sm font-bold text-gray-900 pb-3 border-b border-gray-100">General Settings</h2>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Platform Name',    key: 'platformName',    placeholder: 'HexaOne'              },
                  { label: 'Support Email',    key: 'supportEmail',    placeholder: 'support@fashionerp.com'  },
                  { label: 'Default Currency', key: 'defaultCurrency', placeholder: 'LKR'                     },
                  { label: 'Default Timezone', key: 'defaultTimezone', placeholder: 'Asia/Colombo'            },
                ].map(f => (
                  <div key={f.key}>
                    <label className="block text-xs font-medium text-gray-700 mb-1">{f.label}</label>
                    <input
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400"
                      placeholder={f.placeholder}
                      value={(general as any)[f.key]}
                      onChange={e => setGeneral({ ...general, [f.key]: e.target.value })}
                    />
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Default Language</label>
                  <select
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none"
                    value={general.defaultLanguage}
                    onChange={e => setGeneral({ ...general, defaultLanguage: e.target.value })}
                  >
                    <option value="en">English</option>
                    <option value="si">Sinhala</option>
                    <option value="ta">Tamil</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {active === 'security' && (
            <div className="space-y-5">
              <h2 className="text-sm font-bold text-gray-900 pb-3 border-b border-gray-100">Security Settings</h2>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Session Timeout (minutes)', key: 'sessionTimeoutMins', placeholder: '480'  },
                  { label: 'Max Login Attempts',        key: 'maxLoginAttempts',   placeholder: '5'    },
                  { label: 'Min Password Length',       key: 'passwordMinLength',  placeholder: '8'    },
                ].map(f => (
                  <div key={f.key}>
                    <label className="block text-xs font-medium text-gray-700 mb-1">{f.label}</label>
                    <input
                      type="number"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-gray-900/10"
                      placeholder={f.placeholder}
                      value={(security as any)[f.key]}
                      onChange={e => setSecurity({ ...security, [f.key]: e.target.value })}
                    />
                  </div>
                ))}
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Allowed Origins (CORS)</label>
                  <textarea
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-gray-900/10 font-mono"
                    rows={2}
                    value={security.allowedOrigins}
                    onChange={e => setSecurity({ ...security, allowedOrigins: e.target.value })}
                  />
                  <p className="text-[10px] text-gray-400 mt-1">One origin per line</p>
                </div>
                <div className="col-span-2">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <div
                      onClick={() => setSecurity(s => ({ ...s, requireMFA: !s.requireMFA }))}
                      className={`w-10 h-5 rounded-full transition-colors relative ${security.requireMFA ? 'bg-gray-900' : 'bg-gray-200'}`}
                    >
                      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${security.requireMFA ? 'translate-x-5' : 'translate-x-0.5'}`} />
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
                  { label: 'Host',     value: 'localhost:5433' },
                  { label: 'Database', value: 'fashionerp'     },
                  { label: 'User',     value: 'fashionerp'     },
                  { label: 'ORM',      value: 'Prisma v5.22'   },
                  { label: 'Pool',     value: '5 connections'  },
                ].map(r => (
                  <div key={r.label} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                    <span className="text-xs text-gray-500">{r.label}</span>
                    <span className="text-xs font-mono font-medium text-gray-800">{r.value}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-xs text-gray-500">Password</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-medium text-gray-800">
                      {showKey ? 'fashionerp_secret' : '••••••••••••••••'}
                    </span>
                    <button onClick={() => setShowKey(p => !p)} className="p-1 text-gray-400 hover:text-gray-600">
                      {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs text-amber-700 font-medium">⚠ Database config is managed via environment variables.</p>
                <p className="text-[11px] text-amber-600 mt-0.5">Edit <code className="font-mono">apps/api/.env</code> to change connection settings.</p>
              </div>
            </div>
          )}

          {active === 'notifications' && (
            <div className="space-y-5">
              <h2 className="text-sm font-bold text-gray-900 pb-3 border-b border-gray-100">Notification Settings</h2>
              <div className="space-y-3">
                {[
                  { label: 'New tenant registration',  desc: 'Alert when a new tenant signs up'        },
                  { label: 'Tenant suspended',         desc: 'Alert when a tenant is suspended'        },
                  { label: 'System health degraded',   desc: 'Alert when health check fails'           },
                  { label: 'High error rate',          desc: 'Alert when error rate exceeds threshold' },
                  { label: 'Weekly digest',            desc: 'Weekly platform summary email'           },
                ].map((n, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{n.label}</p>
                      <p className="text-xs text-gray-400">{n.desc}</p>
                    </div>
                    <div className="w-10 h-5 rounded-full bg-gray-900 relative cursor-pointer flex-shrink-0">
                      <div className="absolute top-0.5 right-0.5 w-4 h-4 bg-white rounded-full shadow" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {active === 'platform' && (
            <div className="space-y-5">
              <h2 className="text-sm font-bold text-gray-900 pb-3 border-b border-gray-100">Platform Configuration</h2>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Max Tenants per Plan', key: 'maxTenantsPerPlan', placeholder: '100' },
                  { label: 'Trial Period (days)',  key: 'trialDays',         placeholder: '7'  },
                  { label: 'API Rate Limit/min',   key: 'apiRateLimitPerMin',placeholder: '100' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="block text-xs font-medium text-gray-700 mb-1">{f.label}</label>
                    <input
                      type="number"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-gray-900/10"
                      placeholder={f.placeholder}
                      value={(platform as any)[f.key]}
                      onChange={e => setPlatform({ ...platform, [f.key]: e.target.value })}
                    />
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Default Plan</label>
                  <select
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none"
                    value={platform.defaultPlan}
                    onChange={e => setPlatform({ ...platform, defaultPlan: e.target.value })}
                  >
                    <option value="STARTER">Starter</option>
                    <option value="PROFESSIONAL">Professional</option>
                    <option value="ENTERPRISE">Enterprise</option>
                  </select>
                </div>
              </div>
              <div className="pt-3 border-t border-gray-100">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <div
                    onClick={() => setPlatform(p => ({ ...p, maintenanceMode: !p.maintenanceMode }))}
                    className={`w-10 h-5 rounded-full transition-colors relative ${platform.maintenanceMode ? 'bg-red-500' : 'bg-gray-200'}`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${platform.maintenanceMode ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </div>
                  <div>
                    <span className="text-sm text-gray-700 font-medium">Maintenance Mode</span>
                    <p className="text-xs text-gray-400">Prevents all tenant logins</p>
                  </div>
                  {platform.maintenanceMode && (
                    <span className="ml-2 text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-semibold">ACTIVE</span>
                  )}
                </label>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
