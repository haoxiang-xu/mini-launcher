const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { windowChromeOptions, registerWindowControls, observeWindowState } = require("../desktop/window-controls.cjs");

function setup() {
  const handlers = new Map();
  const window = new EventEmitter();
  let maximized = false;
  let destroyed = false;
  const actions = [];
  const messages = [];
  const sender = { mainFrame: {}, isDestroyed: () => destroyed, send: (...args) => messages.push(args) };
  Object.assign(window, {
    webContents: sender,
    isDestroyed: () => destroyed,
    isMaximized: () => maximized,
    isFullScreen: () => false,
    minimize: () => { actions.push("minimize"); },
    maximize: () => { maximized = true; window.emit("maximize"); },
    unmaximize: () => { maximized = false; window.emit("unmaximize"); },
    close: () => { actions.push("close"); destroyed = true; window.emit("closed"); },
  });
  registerWindowControls({ handle: (channel, handler) => handlers.set(channel, handler) }, {
    fromWebContents: (contents) => contents === sender ? window : null,
  });
  observeWindowState(window);
  const event = { sender, senderFrame: sender.mainFrame };
  return { window, event, actions, messages, handlers,
    call: (suffix, source = event) => handlers.get(`launcher:window-${suffix}`)(source) };
}

test("hidden title bar retains resizing and uses native traffic lights only on macOS", () => {
  const windows = windowChromeOptions("win32");
  assert.equal(windows.titleBarStyle, "hidden");
  assert.equal(windows.resizable, true);
  assert.equal(windows.frame, true);
  assert.equal(windows.trafficLightPosition, undefined);
  // The 14px close button shares the native 16px window corner's center.
  assert.deepEqual(windowChromeOptions("darwin").trafficLightPosition, { x: 9, y: 9 });
});

test("window controls toggle maximize/restore and publish native window state changes", () => {
  const s = setup();
  assert.deepEqual(s.call("state"), { isMaximized: false, isFullScreen: false });
  s.call("toggle-maximize");
  assert.equal(s.call("state").isMaximized, true);
  s.call("toggle-maximize");
  assert.equal(s.call("state").isMaximized, false);
  s.window.maximize();
  assert.deepEqual(s.messages.map(([, state]) => state.isMaximized), [true, false, true]);
  assert.ok(s.messages.every(([channel]) => channel === "launcher:window-state-changed"));
  s.call("minimize");
  s.call("close");
  assert.deepEqual(s.actions, ["minimize", "close"]);
  assert.equal(s.window.listenerCount("maximize"), 0);
  assert.throws(() => s.call("state"), /unavailable/);
});

test("window controls reject unknown senders and subframes", () => {
  const s = setup();
  for (const suffix of ["state", "minimize", "toggle-maximize", "close"]) {
    assert.throws(() => s.call(suffix, { sender: {}, senderFrame: {} }), /unavailable/);
    assert.throws(() => s.call(suffix, { ...s.event, senderFrame: {} }), /unavailable/);
  }
  assert.deepEqual(s.actions, []);
  assert.equal(s.call("state").isMaximized, false);
});
