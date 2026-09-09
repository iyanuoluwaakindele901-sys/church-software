const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('solaDesktop', {
  isDesktop: true,
  project: (output) => ipcRenderer.invoke('sola:project-output', output),
  closeOutput: (outputId) => ipcRenderer.invoke('sola:close-output', outputId),
  sendProjectorMessage: (message) => ipcRenderer.send('sola:projector-message', message),
  onProjectorMessage: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on('sola:projector-message', listener);
    return () => ipcRenderer.removeListener('sola:projector-message', listener);
  },
  importMedia: (destination) => ipcRenderer.invoke('sola:import-media', destination),
  removeMediaFile: (storedPath) => ipcRenderer.invoke('sola:remove-media-file', storedPath),
  obs: {
    connect: (settings) => ipcRenderer.invoke('sola:obs-connect', settings),
    disconnect: () => ipcRenderer.invoke('sola:obs-disconnect'),
    status: () => ipcRenderer.invoke('sola:obs-status'),
    configureStream: (settings) => ipcRenderer.invoke('sola:obs-configure-stream', settings),
    startStream: () => ipcRenderer.invoke('sola:obs-start-stream'),
    stopStream: () => ipcRenderer.invoke('sola:obs-stop-stream'),
    startVirtualCamera: () => ipcRenderer.invoke('sola:obs-start-virtual-camera'),
    stopVirtualCamera: () => ipcRenderer.invoke('sola:obs-stop-virtual-camera'),
    saveSettings: (settings) => ipcRenderer.invoke('sola:save-stream-settings', settings),
    loadSettings: () => ipcRenderer.invoke('sola:load-stream-settings'),
  },
});
