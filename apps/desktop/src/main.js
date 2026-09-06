const { app, BrowserWindow, shell, Menu, dialog, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const { setupAutoUpdater } = require('./updater')

const DEFAULT_URL = process.env.DESKTOP_APP_URL || 'http://localhost:3000'
const isDev = !app.isPackaged
const APP_ICON = path.join(__dirname, '..', 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png')

/** @type {BrowserWindow | null} */
let mainWindow = null
/** @type {BrowserWindow | null} */
let settingsWindow = null
/** @type {{ checkForUpdates: (opts?: { silent?: boolean }) => Promise<unknown> } | null} */
let updaterApi = null

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

function getAppUrl() {
  const arg = process.argv.find((a) => a.startsWith('--url='))
  if (arg) return arg.slice('--url='.length).trim()
  const cfg = readConfig()
  if (cfg.appUrl && String(cfg.appUrl).trim()) return String(cfg.appUrl).trim()
  return DEFAULT_URL
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
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  const url = getAppUrl()
  mainWindow.loadURL(url)

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    if (isDev) mainWindow?.webContents.openDevTools({ mode: 'detach' })
  })

  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, target) => {
    try {
      const current = new URL(mainWindow.webContents.getURL())
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

  buildMenu()
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

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow?.webContents.reload(),
        },
        {
          label: 'Server URL…',
          click: () => openSettings(),
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4',
          click: () => app.quit(),
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'togglefullscreen' },
        { type: 'separator' },
        {
          label: 'Toggle DevTools',
          accelerator: process.platform === 'darwin' ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
          click: () => mainWindow?.webContents.toggleDevTools(),
        },
        {
          label: 'Actual Size',
          role: 'resetZoom',
        },
        {
          label: 'Zoom In',
          role: 'zoomIn',
        },
        {
          label: 'Zoom Out',
          role: 'zoomOut',
        },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates…',
          click: () => {
            void updaterApi?.checkForUpdates({ silent: false })
          },
        },
        { type: 'separator' },
        {
          label: 'About HexaOne Desktop',
          click: () => {
            dialog.showMessageBox(mainWindow ?? undefined, {
              type: 'info',
              title: 'About',
              message: 'HexaOne Desktop',
              detail: `Version ${app.getVersion()}\nLoading: ${getAppUrl()}`,
            })
          },
        },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

ipcMain.handle('desktop:get-config', () => ({
  appUrl: getAppUrl(),
  version: app.getVersion(),
  packaged: app.isPackaged,
}))

ipcMain.handle('desktop:set-app-url', (_event, appUrl) => {
  const url = String(appUrl || '').trim()
  if (!url) throw new Error('URL is required')
  try {
    new URL(url)
  } catch {
    throw new Error('Invalid URL')
  }
  writeConfig({ appUrl: url })
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadURL(url)
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
    createMainWindow()
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
