const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("xhsApp", {
  getDefaults: () => ipcRenderer.invoke("get-defaults"),
  chooseOutputDir: () => ipcRenderer.invoke("choose-output-dir"),
  startRun: (config) => ipcRenderer.invoke("start-run", config),
  cancelRun: () => ipcRenderer.invoke("cancel-run"),
  openPath: (targetPath) => ipcRenderer.invoke("open-path", targetPath),
  onLog: (handler) => ipcRenderer.on("run-log", (_event, payload) => handler(payload)),
  onState: (handler) => ipcRenderer.on("run-state", (_event, payload) => handler(payload)),
});
