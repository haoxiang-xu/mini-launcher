const { contextBridge, ipcRenderer } = require("electron");

const call = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
contextBridge.exposeInMainWorld("miniLauncher", {
  edition: process.argv.includes('--mini-edition=server') ? 'server' : 'player',
  server: {
    status:()=>call('server:status'), prepare:id=>call('server:prepare',id),
    configure:(id,settings)=>call('server:configure',id,settings), selectJava:id=>call('server:select-java',id),
    start:(id,accepted)=>call('server:start',id,accepted), stop:id=>call('server:stop',id), restart:id=>call('server:restart',id),
    command:(id,line)=>call('server:command',id,line), backup:id=>call('server:backup',id),
    openFolder:id=>call('server:open-folder',id), copyAddress:id=>call('server:copy-address',id),
    join:(id,instanceId)=>call('server:join',id,instanceId), openEula:()=>call('server:eula'),
    selectPlayit:()=>call('server:playit-select'), configurePlayit:input=>call('server:playit-configure',input),
    startPlayit:()=>call('server:playit-start'), stopPlayit:()=>call('server:playit-stop'),
    downloadPlayit:()=>call('server:playit-download'), linkPlayit:()=>call('server:playit-link'),
    playitDashboard:()=>call('server:playit-dashboard'), copyPublicAddress:()=>call('server:playit-copy'),
  },
  windowControls: {
    platform: process.platform,
    getState: () => call("launcher:window-state"),
    minimize: () => call("launcher:window-minimize"),
    toggleMaximize: () => call("launcher:window-toggle-maximize"),
    close: () => call("launcher:window-close"),
    onStateChange: (callback) => {
      const listener = (_event, state) => callback(state);
      ipcRenderer.on("launcher:window-state-changed", listener);
      return () => ipcRenderer.removeListener("launcher:window-state-changed", listener);
    },
  },
  status: () => call("launcher:status"),
  detectPrism: () => call("launcher:detect-prism"),
  verify: () => call("launcher:verify"),
  selectPrism: () => call("launcher:select-prism"),
  selectRoot: () => call("launcher:select-root"),
  install: () => call("launcher:install"),
  play: (instanceId) => call("launcher:play", instanceId),
  downloadPrism: () => call("launcher:download-prism"),
  openPackFolder: () => call("launcher:open-pack-folder"),
});
