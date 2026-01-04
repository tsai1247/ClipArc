const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("visualizer", {
  onShowAnimation: (callback) => {
    ipcRenderer.on("show-animation", (_event, payload) => callback(payload));
  },
  hide: () => ipcRenderer.send("request-hide"),
});
