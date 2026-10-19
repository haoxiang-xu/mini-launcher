function windowChromeOptions(platform) {
  return {
    frame: true,
    titleBarStyle: "hidden",
    hasShadow: true,
    resizable: true,
    maximizable: true,
    // A 14px button centered at (16, 16) follows the native window corner.
    ...(platform === "darwin" ? { trafficLightPosition: { x: 9, y: 9 } } : {}),
  };
}

function readWindowState(window) {
  return { isMaximized: window.isMaximized(), isFullScreen: window.isFullScreen() };
}

function registerWindowControls(ipcMain, BrowserWindow) {
  function senderWindow(event) {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || window.isDestroyed() || event.senderFrame !== event.sender.mainFrame) {
      throw new Error("Window controls are unavailable.");
    }
    return window;
  }

  ipcMain.handle("launcher:window-state", (event) => readWindowState(senderWindow(event)));
  ipcMain.handle("launcher:window-minimize", (event) => senderWindow(event).minimize());
  ipcMain.handle("launcher:window-toggle-maximize", (event) => {
    const window = senderWindow(event);
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  });
  ipcMain.handle("launcher:window-close", (event) => senderWindow(event).close());
}

function observeWindowState(window) {
  const publish = () => {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send("launcher:window-state-changed", readWindowState(window));
    }
  };
  const events = ["maximize", "unmaximize", "enter-full-screen", "leave-full-screen"];
  for (const event of events) window.on(event, publish);
  window.once("closed", () => {
    for (const event of events) window.removeListener(event, publish);
  });
}

module.exports = { windowChromeOptions, registerWindowControls, observeWindowState };
