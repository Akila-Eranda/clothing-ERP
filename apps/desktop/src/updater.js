const { app, dialog } = require('electron')
const { autoUpdater } = require('electron-updater')

/**
 * @param {{
 *   getMainWindow: () => import('electron').BrowserWindow | null
 *   getAppUrl: () => string
 *   readConfig: () => Record<string, unknown>
 * }} opts
 */
function resolveUpdateFeedUrl({ getAppUrl, readConfig }) {
  if (process.env.DESKTOP_UPDATE_URL) {
    return String(process.env.DESKTOP_UPDATE_URL).replace(/\/$/, '')
  }
  const cfg = readConfig()
  if (cfg.updateUrl && String(cfg.updateUrl).trim()) {
    return String(cfg.updateUrl).trim().replace(/\/$/, '')
  }
  try {
    return `${new URL(getAppUrl()).origin}/downloads`
  } catch {
    return null
  }
}

/**
 * @param {{
 *   getMainWindow: () => import('electron').BrowserWindow | null
 *   getAppUrl: () => string
 *   readConfig: () => Record<string, unknown>
 * }} opts
 */
function setupAutoUpdater(opts) {
  const checkForUpdates = async ({ silent = false } = {}) => {
    if (!app.isPackaged) {
      if (!silent) {
        await dialog.showMessageBox(opts.getMainWindow() ?? undefined, {
          type: 'info',
          title: 'Updates',
          message: 'Auto-update works only in the installed desktop app.',
          detail: 'Build with `pnpm desktop:dist`, install the .exe, then check again.',
        })
      }
      return { ok: false, reason: 'dev' }
    }

    const feed = resolveUpdateFeedUrl(opts)
    if (!feed) {
      if (!silent) {
        await dialog.showMessageBox(opts.getMainWindow() ?? undefined, {
          type: 'warning',
          title: 'Updates',
          message: 'Update server URL is not configured.',
        })
      }
      return { ok: false, reason: 'no-feed' }
    }

    autoUpdater.setFeedURL({ provider: 'generic', url: feed })
    const result = await autoUpdater.checkForUpdates()
    return { ok: true, feed, updateInfo: result?.updateInfo ?? null }
  }

  if (!app.isPackaged) {
    return { checkForUpdates }
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowDowngrade = false

  autoUpdater.on('checking-for-update', () => {
    // no-op
  })

  autoUpdater.on('update-available', (info) => {
    const win = opts.getMainWindow()
    void dialog.showMessageBox(win ?? undefined, {
      type: 'info',
      title: 'Update available',
      message: `HexaOne ${info.version} is available`,
      detail: 'Downloading in the background. You can keep working.',
      buttons: ['OK'],
    })
  })

  autoUpdater.on('update-not-available', (info) => {
    // Only show when user manually checked (tracked via flag)
    if (!manualCheckPending) return
    manualCheckPending = false
    const win = opts.getMainWindow()
    void dialog.showMessageBox(win ?? undefined, {
      type: 'info',
      title: 'Up to date',
      message: 'You are on the latest version.',
      detail: `Current version: ${app.getVersion()}\nChecked: ${info.version}`,
    })
  })

  autoUpdater.on('error', (err) => {
    if (!manualCheckPending && silentStartup) return
    manualCheckPending = false
    const win = opts.getMainWindow()
    void dialog.showMessageBox(win ?? undefined, {
      type: 'error',
      title: 'Update failed',
      message: 'Could not check or download updates.',
      detail: err?.message || String(err),
    })
  })

  autoUpdater.on('download-progress', (progress) => {
    const win = opts.getMainWindow()
    if (!win || win.isDestroyed()) return
    const pct = Math.max(0, Math.min(100, Math.round(progress.percent || 0)))
    win.setProgressBar(pct / 100)
    win.setTitle(`HexaOne — downloading update ${pct}%`)
  })

  autoUpdater.on('update-downloaded', async (info) => {
    const win = opts.getMainWindow()
    if (win && !win.isDestroyed()) {
      win.setProgressBar(-1)
      win.setTitle('HexaOne')
    }
    const { response } = await dialog.showMessageBox(win ?? undefined, {
      type: 'info',
      title: 'Update ready',
      message: `Version ${info.version} is ready to install`,
      detail: 'Restart now to apply the update, or choose Later and it will install when you quit.',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    })
    if (response === 0) {
      autoUpdater.quitAndInstall(false, true)
    }
  })

  let manualCheckPending = false
  let silentStartup = true

  const wrappedCheck = async ({ silent = false } = {}) => {
    if (!silent) manualCheckPending = true
    try {
      return await checkForUpdates({ silent })
    } catch (err) {
      if (!silent) {
        manualCheckPending = false
        const win = opts.getMainWindow()
        await dialog.showMessageBox(win ?? undefined, {
          type: 'error',
          title: 'Update failed',
          message: 'Could not check for updates.',
          detail: err?.message || String(err),
        })
      }
      return { ok: false, reason: 'error', error: err?.message || String(err) }
    }
  }

  // Startup check after UI is up
  setTimeout(() => {
    void wrappedCheck({ silent: true }).finally(() => {
      silentStartup = false
    })
  }, 8000)

  // Recheck every 6 hours
  setInterval(() => {
    void wrappedCheck({ silent: true })
  }, 6 * 60 * 60 * 1000)

  return { checkForUpdates: wrappedCheck }
}

module.exports = { setupAutoUpdater, resolveUpdateFeedUrl }
