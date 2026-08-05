const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (s) => ipcRenderer.invoke('set-settings', s),
  selectDir: () => ipcRenderer.invoke('select-dir'),
  scanMaps: (root) => ipcRenderer.invoke('scan-maps', root),
  readConfig: (imageAbsPath) => ipcRenderer.invoke('read-config', imageAbsPath),
  writeConfig: (imageAbsPath, data) => ipcRenderer.invoke('write-config', imageAbsPath, data)
});
