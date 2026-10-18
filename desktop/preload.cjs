const { contextBridge, ipcRenderer } = require("electron");

const call = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
contextBridge.exposeInMainWorld("miniLauncher", {
  status: () => call("launcher:status"),
  verify: () => call("launcher:verify"),
  selectPrism: () => call("launcher:select-prism"),
  selectRoot: () => call("launcher:select-root"),
  install: () => call("launcher:install"),
  play: (instanceId) => call("launcher:play", instanceId),
  downloadPrism: () => call("launcher:download-prism"),
  openPackFolder: () => call("launcher:open-pack-folder"),
});
