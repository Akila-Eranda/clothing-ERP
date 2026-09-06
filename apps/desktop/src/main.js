const { app, BrowserWindow, shell, Menu, dialog, ipcMain, globalShortcut } = require('electron')
const path = require('path')
const fs = require('fs')
const { setupAutoUpdater } = require('./updater')

const isDev = !app.isPackaged
const APP_ICON = path.join(__dirname, '..', 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png')
const SETUP_PAGE = path.join(__dirname, 'setup.html')
const DEFAULT_PROD_URL = process.env.DESKTOP_APP_URL || 'https://shop.hexalyte.com/login'
const DEFAULT_DEV_URL = process.env.DESKTOP_APP_URL || 'http://localhost:3000/login'

/** @type {BrowserWindow | null} */
let mainWindow = null
/** @type {BrowserWindow | null} */
let settingsWindow = null
/** @type {{ checkForUpdates: (opts?: { silent?: boolean }) => Promise<unknown> } | null} */
let updaterApi = null
let lastLoadError = ''

function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json')
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'))
  } catch {
    return {}
  }
}

function writeConfig(patch) {
  const next = { ...readConfig(), ...patch }
  fs.mkdirSync(path.dirname(getConfigPath()), { recursive: true })
  fs.writeFileSync(getConfigPath(), JSON.stringify(next, null, 2))
  return next
}

function isLocalhostUrl(url) {
  try {
    const host = new URL(url).hostname
    return host === 'localhost' || host === '127.0.0.1'
  } catch {
    return false
  }
}

/** Always land on login unless a deeper path was already chosen. */
function withLoginPath(url) {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname.replace(/\/+$/, '') || '/'
    if (path === '/' || path === '') {
      parsed.pathname = '/login'
      parsed.search = ''
      parsed.hash = ''
      return parsed.toString()
    }
    return parsed.toString()
  } catch {
    return url
  }
}

function getAppUrl() {
  const arg = process.argv.find((a) => a.startsWith('--url='))
  if (arg) return withLoginPath(arg.slice('--url='.length).trim())
  const cfg = readConfig()
  const saved = cfg.appUrl && String(cfg.appUrl).trim() ? String(cfg.appUrl).trim() : ''
  // Ignore stale localhost config in packaged installs (causes blank window).
  if (saved && !( !isDev && isLocalhostUrl(saved) )) {
    return withLoginPath(saved)
  }
  return withLoginPath(isDev ? DEFAULT_DEV_URL : DEFAULT_PROD_URL)
}

function showSetupPage(errorMessage = '') {
  lastLoadError = errorMessage || lastLoadError
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.loadFile(SETUP_PAGE)
}

function loadAppOrSetup() {
  const url = getAppUrl()
  lastLoadError = ''
  mainWindow?.loadURL(url)
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    title: 'HexaOne',
    icon: APP_ICON,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  loadAppOrSetup()

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    if (isDev) mainWindow?.webContents.openDevTools({ mode: 'detach' })
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return
    // Ignore aborted loads (user navigated away / we replaced URL)
    if (errorCode === -3) return
    const detail = `${errorDescription || 'Load failed'} (${errorCode})`
    const target = validatedURL || getAppUrl() || 'unknown'
    lastLoadError = `Could not open ${target}\n${detail}`
    showSetupPage(lastLoadError)
  })

  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, target) => {
    try {
      const currentRaw = mainWindow.webContents.getURL()
      // Allow leaving local setup/settings pages
      if (!currentRaw || currentRaw === 'about:blank' || currentRaw.startsWith('file://')) {
        return
      }
      const current = new URL(currentRaw)
      const next = new URL(target)
      if (current.origin !== next.origin) {
        event.preventDefault()
        shell.openExternal(target)
      }
    } catch {
      // ignore invalid URLs
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function openSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus()
    return
  }

  settingsWindow = new BrowserWindow({
    width: 480,
    height: 280,
    resizable: false,
    minimizable: false,
    maximizable: false,
    parent: mainWindow ?? undefined,
    modal: Boolean(mainWindow),
    title: 'Server URL',
    icon: APP_ICON,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  settingsWindow.loadFile(path.join(__dirname, 'settings.html'))
  settingsWindow.on('closed', () => {
    settingsWindow = null
  })
}

function registerShortcuts() {
  globalShortcut.register('CommandOrControl+R', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL(getAppUrl())
  })
  globalShortcut.register('F5', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.reload()
  })
  if (isDev) {
    globalShortcut.register('CommandOrControl+Shift+I', () => {
      mainWindow?.webContents.toggleDevTools()
    })
  }
}

ipcMain.handle('desktop:get-config', () => ({
  appUrl: getAppUrl(),
  version: app.getVersion(),
  packaged: app.isPackaged,
  loadError: lastLoadError,
}))

ipcMain.handle('desktop:set-app-url', (_event, appUrl) => {
  const url = String(appUrl || '').trim()
  if (!url) throw new Error('URL is required')
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('Invalid URL')
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('URL must start with https:// or http://')
  }
  if (!isDev && isLocalhostUrl(url)) {
    throw new Error('Use your live shop URL (not localhost) in the installed app.')
  }
  writeConfig({ appUrl: url })
  lastLoadError = ''
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadURL(withLoginPath(url))
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.close()
  }
  return { ok: true, appUrl: url }
})

ipcMain.handle('desktop:check-updates', async () => {
  return updaterApi?.checkForUpdates({ silent: false })
})

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null)
    createMainWindow()
    registerShortcuts()
    updaterApi = setupAutoUpdater({
      getMainWindow: () => mainWindow,
      getAppUrl,
      readConfig,
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })
}

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
