import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  selectRoot: () => ipcRenderer.invoke('dialog:selectRoot'),
  rescan: (root: string) => ipcRenderer.invoke('scan:root', root),
  loadConfig: (imgPath: string) => ipcRenderer.invoke('config:load', imgPath),
  saveConfig: (imgPath: string, cfg: unknown) => ipcRenderer.invoke('config:save', imgPath, cfg),
  imageUrl: (p: string) => 'mapimg://local/?p=' + encodeURIComponent(p),
})
