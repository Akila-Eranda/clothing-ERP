const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('hexaDesktop', {
  getConfig: () => ipcRenderer.invoke('desktop:get-config'),
  setAppUrl: (appUrl) => ipcRenderer.invoke('desktop:set-app-url', appUrl),
  checkForUpdates: () => ipcRenderer.invoke('desktop:check-updates'),
})
