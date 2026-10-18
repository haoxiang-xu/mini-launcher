const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { findPrism, isPrismExecutable, readInstances, verifyPack, prismArgs } = require("./core.cjs");

const root = path.resolve(__dirname, "..");
const catalog = require("../pack/catalog.json");

function packFolder() {
  return app.isPackaged ? path.join(process.resourcesPath, "pack") : path.join(root, "pack", "local");
}

function configPath() { return path.join(app.getPath("userData"), "settings.json"); }

function readSettings() {
  try { return JSON.parse(fs.readFileSync(configPath(), "utf8")); }
  catch { return {}; }
}

function writeSettings(next) {
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(next, null, 2), "utf8");
}

function instanceRoot(settings = readSettings()) {
  return settings.instanceRoot || path.join(app.getPath("userData"), "PrismData");
}

function status() {
  const settings = readSettings();
  const folder = packFolder();
  const manifestPath = path.join(folder, "manifest.json");
  let manifest = null;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch { /* No private pack generated yet. */ }
  return {
    appName: "Minecraft Mini Launcher",
    catalog,
    prismPath: findPrism(settings.prismPath),
    instanceRoot: instanceRoot(settings),
    instances: readInstances(instanceRoot(settings)),
    pack: {
      present: Boolean(manifest && fs.existsSync(path.join(folder, manifest.pack))),
      filename: manifest?.pack || null,
      officialDownloads: manifest?.officialDownloads || 0,
      localMods: manifest?.localMods?.length || 0,
      knownGaps: manifest?.knownGaps || [],
      private: manifest?.distribution === "private-local-test-only",
    },
  };
}

function startPrism(binary, args) {
  const child = spawn(binary, args, { detached: true, stdio: "ignore", windowsHide: false });
  child.unref();
  return { ok: true, message: "已交给游戏启动核心处理" };
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1300,
    height: 840,
    minWidth: 1000,
    minHeight: 680,
    backgroundColor: "#111210",
    title: "Minecraft Mini Launcher",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  if (process.env.MINI_LAUNCHER_DEV_URL) window.loadURL(process.env.MINI_LAUNCHER_DEV_URL);
  else window.loadFile(path.join(root, "dist", "index.html"));
}

app.whenReady().then(() => {
  ipcMain.handle("launcher:status", status);
  ipcMain.handle("launcher:verify", () => {
    const folder = packFolder();
    const manifestPath = path.join(folder, "manifest.json");
    let name;
    try { name = JSON.parse(fs.readFileSync(manifestPath, "utf8")).pack; }
    catch { return { ok: false, message: "缺少本地整合包" }; }
    return verifyPack(path.join(folder, name), manifestPath);
  });
  ipcMain.handle("launcher:select-prism", async () => {
    const result = await dialog.showOpenDialog({ title: "选择 Prism Launcher", properties: ["openFile"] });
    if (result.canceled) return status();
    const selected = result.filePaths[0];
    if (!isPrismExecutable(selected)) throw new Error("请选择 Prism Launcher 程序文件");
    writeSettings({ ...readSettings(), prismPath: selected });
    return status();
  });
  ipcMain.handle("launcher:select-root", async () => {
    const result = await dialog.showOpenDialog({ title: "选择游戏实例目录", properties: ["openDirectory", "createDirectory"] });
    if (result.canceled) return status();
    writeSettings({ ...readSettings(), instanceRoot: result.filePaths[0] });
    return status();
  });
  ipcMain.handle("launcher:install", () => {
    const current = status();
    if (!current.prismPath) throw new Error("请先选择 Prism Launcher");
    const folder = packFolder();
    const manifestPath = path.join(folder, "manifest.json");
    if (!current.pack.filename) throw new Error("本地整合包尚未生成");
    const pack = path.join(folder, current.pack.filename);
    const verification = verifyPack(pack, manifestPath);
    if (!verification.ok) throw new Error(verification.message);
    fs.mkdirSync(current.instanceRoot, { recursive: true });
    return startPrism(current.prismPath, prismArgs(current.instanceRoot, "import", pack));
  });
  ipcMain.handle("launcher:play", (_, instanceId) => {
    const current = status();
    if (!current.prismPath) throw new Error("请先选择 Prism Launcher");
    if (!current.instances.some((instance) => instance.id === instanceId)) throw new Error("未找到已安装的游戏实例");
    return startPrism(current.prismPath, prismArgs(current.instanceRoot, "launch", instanceId));
  });
  ipcMain.handle("launcher:download-prism", () => shell.openExternal("https://prismlauncher.org/download/"));
  ipcMain.handle("launcher:open-pack-folder", () => shell.openPath(packFolder()));
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
