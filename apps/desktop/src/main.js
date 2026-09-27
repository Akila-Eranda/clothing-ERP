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

/** Operator top-up sites the POS may open in-app so the reload form can be auto-filled. */
const QUICK_PAY_HOSTS = new Set(['quick-pay.mobitel.lk'])

function isQuickPayUrl(raw) {
  try {
    return QUICK_PAY_HOSTS.has(new URL(raw).hostname)
  } catch {
    return false
  }
}

/** POS appends `#hexa-reload=<msisdn>:<amount>` to the Quick Pay link. */
function parseQuickPayHint(raw) {
  try {
    const m = /hexa-reload=(\d{0,15}):(\d+(?:\.\d+)?)/.exec(new URL(raw).hash)
    if (!m) return null
    return { msisdn: m[1] || '', amount: m[2] || '' }
  } catch {
    return null
  }
}

/**
 * Runs inside the Mobitel page: Prepaid Reload → number → arrow → OTHER → amount.
 * Stops before PROCEED so the cashier confirms the payment.
 */
function quickPayAutofillScript(hint) {
  return `(() => {
  if (window.__hexaQuickPay) return;
  window.__hexaQuickPay = true;
  const d = ${JSON.stringify(hint)};
  const setVal = (el, v) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  let stage = 0;
  const started = Date.now();
  const timer = setInterval(() => {
    if (Date.now() - started > 45000) return clearInterval(timer);
    const onReload = /prepaid-reload/.test(location.pathname);
    if (stage === 0) {
      if (onReload) { stage = 1; return; }
      const link = document.querySelector('a[href*="prepaid-reload"]');
      if (link) { link.click(); stage = 1; }
      return;
    }
    if (stage === 1) {
      const input = document.querySelector('input[name="mobileNumber"]');
      if (!input) return;
      if (!d.msisdn) return clearInterval(timer);
      setVal(input, d.msisdn);
      stage = 2;
      setTimeout(() => {
        const btn = input.closest('form') && input.closest('form').querySelector('button');
        if (btn) btn.click();
      }, 350);
      return;
    }
    if (stage === 2) {
      if (!d.amount) return clearInterval(timer);
      const other = document.querySelector('button[role="radio"][value="OTHER"]');
      if (!other) return;
      other.click();
      stage = 3;
      return;
    }
    if (stage === 3) {
      const amt = document.querySelector('input[name="amount"]');
      if (!amt) return;
      setVal(amt, String(d.amount));
      amt.focus();
      clearInterval(timer);
    }
  }, 400);
})();`
}

function wireQuickPayWindow(child, openedUrl) {
  const hint = parseQuickPayHint(openedUrl)
  child.setTitle('Mobitel Quick Pay')
  if (!hint) return
  let injected = false
  child.webContents.on('did-finish-load', () => {
    if (injected) return
    const current = child.webContents.getURL()
    if (!isQuickPayUrl(current)) return
    injected = true
    child.webContents.executeJavaScript(quickPayAutofillScript(hint)).catch(() => {})
  })
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
    try {
      const currentRaw = mainWindow?.webContents.getURL() || getAppUrl()
      const currentOrigin = new URL(currentRaw).origin
      const next = new URL(target, currentRaw)
      if (isQuickPayUrl(next.toString())) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 480,
            height: 820,
            minWidth: 380,
            minHeight: 600,
            title: 'Mobitel Quick Pay',
            icon: APP_ICON,
            autoHideMenuBar: true,
            webPreferences: {
              contextIsolation: true,
              nodeIntegration: false,
              sandbox: true,
            },
          },
        }
      }
      // Keep same-origin popups (Customer Display, etc.) inside Electron so
      // BroadcastChannel / localStorage stay connected to the POS window.
      if (next.origin === currentOrigin) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 1280,
            height: 800,
            minWidth: 800,
            minHeight: 500,
            title: 'HexaOne Customer Display',
            icon: APP_ICON,
            autoHideMenuBar: true,
            webPreferences: {
              preload: path.join(__dirname, 'preload.js'),
              contextIsolation: true,
              nodeIntegration: false,
              sandbox: true,
            },
          },
        }
      }
      shell.openExternal(next.toString())
    } catch {
      try {
        shell.openExternal(target)
      } catch {
        // ignore
      }
    }
    return { action: 'deny' }
  })

  mainWindow.webContents.on('did-create-window', (child, details) => {
    child.setMenuBarVisibility(false)
    child.setAutoHideMenuBar(true)
    if (details && isQuickPayUrl(details.url)) wireQuickPayWindow(child, details.url)
    child.webContents.setWindowOpenHandler(({ url: target }) => {
      shell.openExternal(target)
      return { action: 'deny' }
    })
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
    if (process.platform === 'win32') {
      app.setAppUserModelId('com.hexalyte.hexaone')
    }
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
