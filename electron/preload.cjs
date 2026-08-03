const { contextBridge, ipcRenderer } = require('electron');

// Keep the renderer on a deliberately tiny, typed bridge. No Node or Electron
// primitive is exposed to the page itself.
contextBridge.exposeInMainWorld('odakDesktop', Object.freeze({
  getSettings: () => ipcRenderer.invoke('desktop:settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('desktop:settings:save', settings),
  restart: () => ipcRenderer.invoke('desktop:restart'),
  beginGoogleOAuth: (emailHint) => ipcRenderer.invoke('desktop:google-oauth', emailHint)
}));
