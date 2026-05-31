'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShoppingBag, Eye, EyeOff } from 'lucide-react'
import { adminLogin } from '@/lib/admin-api'

export default function AdminLoginPage() {
  const router = useRouter()
  const [form, setForm] = useState({ email: '', password: '', tenantSlug: 'demo' })
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await adminLogin(form.email, form.password, form.tenantSlug)
      router.replace('/admin/dashboard')
    } catch (err: any) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-gray-900 rounded-2xl flex items-center justify-center mb-3">
            <ShoppingBag size={22} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">FashionERP Admin</h1>
          <p className="text-sm text-gray-500 mt-1">Super Admin only — not for shop staff</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Your admin tenant slug</label>
              <input
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 bg-gray-50"
                placeholder="demo"
                value={form.tenantSlug}
                onChange={e => setForm({ ...form, tenantSlug: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400"
                placeholder="admin@demo.fashionerp.com"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  className="w-full px-3 py-2 pr-10 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(p => !p)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-[11px] text-gray-400 mt-4 leading-relaxed">
            Tenant owners, managers, and cashiers must sign in at<br />
            <strong className="text-gray-600">https://your-shop.shop.hexalyte.com/login</strong><br />
            <span className="mt-2 block">Platform console: <strong className="text-gray-600">Super Admin</strong> only.</span>
          </p>
        </div>
      </div>
    </div>
  )
}
