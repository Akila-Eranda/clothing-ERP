const { app, dialog, BrowserWindow, Notification, ipcMain, screen } = require('electron')
const path = require('path')
const { autoUpdater } = require('electron-updater')

/** Always use the central download feed (not tenant host). */
const DEFAULT_UPDATE_FEED = 'https://shop.hexalyte.com/downloads'

/**
 * @param {{
 *   getMainWindow: () => import('electron').BrowserWindow | null
 *   getAppUrl: () => string
 *   readConfig: () => Record<string, unknown>
 * }} opts
 */
function resolveUpdateFeedUrl({ readConfig }) {
  if (process.env.DESKTOP_UPDATE_URL) {
    return String(process.env.DESKTOP_UPDATE_URL).replace(/\/$/, '')
  }
  const cfg = readConfig()
  if (cfg.updateUrl && String(cfg.updateUrl).trim()) {
    return String(cfg.updateUrl).trim().replace(/\/$/, '')
  }
  return DEFAULT_UPDATE_FEED
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
  let promptingUpdate = false

  function sendBannerState() {
    if (!bannerWindow || bannerWindow.isDestroyed() || !bannerState) return
    bannerWindow.webContents.send('desktop:update-banner-state', bannerState)
  }

  function positionBanner(win) {
    if (!bannerWindow || bannerWindow.isDestroyed()) return
    const width = 380
    const height = 160
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
        width: 380,
        height: 160,
        frame: false,
        transparent: true,
        resizable: false,
        maximizable: false,
        minimizable: false,
        skipTaskbar: false,
        alwaysOnTop: true,
        focusable: true,
        show: false,
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
        bannerWindow?.show()
        bannerWindow?.focus()
        sendBannerState()
      })
      bannerWindow.on('closed', () => {
        bannerWindow = null
      })
    } else {
      positionBanner(parent)
      bannerWindow.show()
      bannerWindow.focus()
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
      if (!Notification.isSupported()) return
      const n = new Notification({
        title,
        body,
        silent: false,
        urgency: 'critical',
      })
      n.on('click', () => {
        if (bannerState?.mode === 'available') {
          void startDownload()
        } else if (bannerState?.mode === 'ready') {
          autoUpdater.quitAndInstall(false, true)
        } else {
          showBanner(bannerState || { mode: 'available', version: pendingInfo?.version })
        }
      })
      n.show()
    } catch {
      // ignore
    }
  }

  async function startDownload() {
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
  }

  async function promptUpdateAvailable(info) {
    if (promptingUpdate) return
    promptingUpdate = true
    try {
      showBanner({ mode: 'available', version: info.version })
      notifyOs('Update available', `HexaOne ${info.version} is available. Click to update.`)

      const win = opts.getMainWindow()
      const { response } = await dialog.showMessageBox(win ?? undefined, {
        type: 'info',
        title: 'Update available',
        message: `HexaOne ${info.version} is available`,
        detail: `You are on ${app.getVersion()}.\n\nClick Update to download and install now.`,
        buttons: ['Update', 'Later'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      })
      if (response === 0) {
        await startDownload()
      }
    } finally {
      promptingUpdate = false
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
    autoUpdater.setFeedURL({ provider: 'generic', url: feed })
    try {
      const result = await autoUpdater.checkForUpdates()
      return { ok: true, feed, updateInfo: result?.updateInfo ?? null }
    } catch (err) {
      if (!silent) throw err
      return { ok: false, reason: 'error', error: err?.message || String(err), feed }
    }
  }

  if (!app.isPackaged) {
    return { checkForUpdates }
  }

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowDowngrade = false

  autoUpdater.on('update-available', (info) => {
    pendingInfo = info
    manualCheckPending = false
    void promptUpdateAvailable(info)
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

  autoUpdater.on('update-downloaded', async (info) => {
    pendingInfo = info
    const win = opts.getMainWindow()
    if (win && !win.isDestroyed()) {
      win.setProgressBar(-1)
      win.setTitle('HexaOne')
    }
    showBanner({ mode: 'ready', version: info.version, percent: 100 })
    notifyOs('Update ready', `HexaOne ${info.version} is ready. Restart to finish.`)

    const { response } = await dialog.showMessageBox(win ?? undefined, {
      type: 'info',
      title: 'Update ready',
      message: `HexaOne ${info.version} is ready to install`,
      detail: 'Restart now to apply the update.',
      buttons: ['Restart & Update', 'Later'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    })
    if (response === 0) {
      autoUpdater.quitAndInstall(false, true)
    }
  })

  ipcMain.removeHandler('desktop:get-update-banner-state')
  ipcMain.removeHandler('desktop:dismiss-update')
  ipcMain.removeHandler('desktop:start-update-download')
  ipcMain.removeHandler('desktop:install-update-now')

  ipcMain.handle('desktop:get-update-banner-state', () => bannerState)
  ipcMain.handle('desktop:dismiss-update', () => {
    hideBanner()
    return { ok: true }
  })
  ipcMain.handle('desktop:start-update-download', async () => startDownload())
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

  // First check soon after launch, then periodically
  setTimeout(() => {
    void wrappedCheck({ silent: true }).finally(() => {
      silentStartup = false
    })
  }, 4000)

  setInterval(() => {
    void wrappedCheck({ silent: true })
  }, 30 * 60 * 1000)

  return { checkForUpdates: wrappedCheck }
}

module.exports = { setupAutoUpdater, resolveUpdateFeedUrl, DEFAULT_UPDATE_FEED }
