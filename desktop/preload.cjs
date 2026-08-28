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
});
