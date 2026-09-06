const { app, dialog, BrowserWindow, Notification, ipcMain, screen } = require('electron')
const path = require('path')
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
  /** @type {BrowserWindow | null} */
  let bannerWindow = null
  /** @type {{ mode: 'available' | 'downloading' | 'ready', version?: string, percent?: number } | null} */
  let bannerState = null
  let pendingInfo = null
  let manualCheckPending = false
  let silentStartup = true

  function sendBannerState() {
    if (!bannerWindow || bannerWindow.isDestroyed() || !bannerState) return
    bannerWindow.webContents.send('desktop:update-banner-state', bannerState)
  }

  function positionBanner(win) {
    if (!bannerWindow || bannerWindow.isDestroyed()) return
    const width = 360
    const height = 150
    let x = 40
    let y = 40
    const parent = win && !win.isDestroyed() ? win : opts.getMainWindow()
    if (parent && !parent.isDestroyed()) {
      const b = parent.getBounds()
      x = Math.round(b.x + b.width - width - 24)
      y = Math.round(b.y + b.height - height - 24)
    } else {
      const display = screen.getPrimaryDisplay().workArea
      x = Math.round(display.x + display.width - width - 24)
      y = Math.round(display.y + display.height - height - 24)
    }
    bannerWindow.setBounds({ x, y, width, height })
  }

  function showBanner(state) {
    bannerState = state
    const parent = opts.getMainWindow()
    if (!bannerWindow || bannerWindow.isDestroyed()) {
      bannerWindow = new BrowserWindow({
        width: 360,
        height: 150,
        frame: false,
        transparent: true,
        resizable: false,
        maximizable: false,
        minimizable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        show: false,
        parent: parent && !parent.isDestroyed() ? parent : undefined,
        webPreferences: {
          preload: path.join(__dirname, 'preload.js'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      })
      bannerWindow.setMenuBarVisibility(false)
      bannerWindow.loadFile(path.join(__dirname, 'update-banner.html'))
      bannerWindow.once('ready-to-show', () => {
        positionBanner(parent)
        bannerWindow?.showInactive()
        sendBannerState()
      })
      bannerWindow.on('closed', () => {
        bannerWindow = null
      })
    } else {
      positionBanner(parent)
      if (!bannerWindow.isVisible()) bannerWindow.showInactive()
      sendBannerState()
    }
  }

  function hideBanner() {
    bannerState = null
    if (bannerWindow && !bannerWindow.isDestroyed()) {
      bannerWindow.close()
    }
    bannerWindow = null
  }

  function notifyOs(title, body) {
    try {
      if (Notification.isSupported()) {
        const n = new Notification({ title, body, silent: false })
        n.show()
      }
    } catch {
      // ignore
    }
  }

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

  // Wait for user to click Update before downloading
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowDowngrade = false

  autoUpdater.on('update-available', (info) => {
    pendingInfo = info
    manualCheckPending = false
    showBanner({ mode: 'available', version: info.version })
    notifyOs('Update available', `HexaOne ${info.version} is available. Click Update to install.`)
  })

  autoUpdater.on('update-not-available', (info) => {
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
    const pct = Math.max(0, Math.min(100, Math.round(progress.percent || 0)))
    if (win && !win.isDestroyed()) {
      win.setProgressBar(pct / 100)
      win.setTitle(`HexaOne — downloading update ${pct}%`)
    }
    showBanner({
      mode: 'downloading',
      version: pendingInfo?.version,
      percent: pct,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    pendingInfo = info
    const win = opts.getMainWindow()
    if (win && !win.isDestroyed()) {
      win.setProgressBar(-1)
      win.setTitle('HexaOne')
    }
    showBanner({ mode: 'ready', version: info.version, percent: 100 })
    notifyOs('Update ready', `HexaOne ${info.version} is ready. Click Restart & Update.`)
  })

  ipcMain.handle('desktop:get-update-banner-state', () => bannerState)
  ipcMain.handle('desktop:dismiss-update', () => {
    hideBanner()
    return { ok: true }
  })
  ipcMain.handle('desktop:start-update-download', async () => {
    showBanner({
      mode: 'downloading',
      version: pendingInfo?.version,
      percent: 0,
    })
    try {
      await autoUpdater.downloadUpdate()
      return { ok: true }
    } catch (err) {
      hideBanner()
      await dialog.showMessageBox(opts.getMainWindow() ?? undefined, {
        type: 'error',
        title: 'Download failed',
        message: 'Could not download the update.',
        detail: err?.message || String(err),
      })
      return { ok: false, error: err?.message || String(err) }
    }
  })
  ipcMain.handle('desktop:install-update-now', () => {
    autoUpdater.quitAndInstall(false, true)
    return { ok: true }
  })

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

  setTimeout(() => {
    void wrappedCheck({ silent: true }).finally(() => {
      silentStartup = false
    })
  }, 8000)

  setInterval(() => {
    void wrappedCheck({ silent: true })
  }, 6 * 60 * 60 * 1000)

  return { checkForUpdates: wrappedCheck }
}

module.exports = { setupAutoUpdater, resolveUpdateFeedUrl }
