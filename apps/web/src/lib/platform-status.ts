const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1'

export interface PlatformMaintenanceStatus {
  enabled: boolean
  message: string
  platformName: string
}

let cache: { data: PlatformMaintenanceStatus; at: number } | null = null
const CACHE_MS = 30_000

export async function fetchPlatformMaintenanceStatus(
  force = false,
): Promise<PlatformMaintenanceStatus> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) {
    return cache.data
  }
  const res = await fetch(`${API_BASE}/tenants/platform-status`, { cache: 'no-store' })
  const json = await res.json().catch(() => ({}))
  const data = (json.data ?? json) as PlatformMaintenanceStatus
  const normalized: PlatformMaintenanceStatus = {
    enabled: !!data.enabled,
    message: data.message || 'The system is currently under maintenance.',
    platformName: data.platformName || 'Hexalyte',
  }
  cache = { data: normalized, at: Date.now() }
  return normalized
}

export function clearMaintenanceCache() {
  cache = null
}
