const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jfpDesktop', {
  startupFile: () => ipcRenderer.invoke('startup-file'),
  open: () => ipcRenderer.invoke('open'),
  save: (data) => ipcRenderer.invoke('save', data),
  setDirty: (flag) => ipcRenderer.send('dirty', flag),
  setTitle: (text) => ipcRenderer.send('title', text),
  printPdf: (data) => ipcRenderer.invoke('print-pdf', data),
  spellStatus: () => ipcRenderer.invoke('spell-status'),
  spellCheck: (words) => ipcRenderer.invoke('spell-check', words),
  exportFile: (data) => ipcRenderer.invoke('export-file', data),
  closeNow: () => ipcRenderer.send('close-now'),
  onSaveAndClose: (callback) => ipcRenderer.on('save-and-close', () => callback())
});
