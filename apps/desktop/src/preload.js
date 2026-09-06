const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('hexaDesktop', {
  getConfig: () => ipcRenderer.invoke('desktop:get-config'),
  setAppUrl: (appUrl) => ipcRenderer.invoke('desktop:set-app-url', appUrl),
  checkForUpdates: () => ipcRenderer.invoke('desktop:check-updates'),
  getUpdateBannerState: () => ipcRenderer.invoke('desktop:get-update-banner-state'),
  dismissUpdate: () => ipcRenderer.invoke('desktop:dismiss-update'),
  startUpdateDownload: () => ipcRenderer.invoke('desktop:start-update-download'),
  installUpdateNow: () => ipcRenderer.invoke('desktop:install-update-now'),
  onUpdateBannerState: (callback) => {
    const listener = (_event, state) => callback(state)
    ipcRenderer.on('desktop:update-banner-state', listener)
    return () => ipcRenderer.removeListener('desktop:update-banner-state', listener)
  },
})
