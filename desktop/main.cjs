const { app, BrowserWindow, dialog, ipcMain, shell, clipboard } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { engineExecutable } = require('./engine-bundle.cjs');
const { verifyPack } = require("./core.cjs");
const { createEngineController, registerEngineIpc, assertEngineSender } = require("./engine-controller.cjs");
const { windowChromeOptions, registerWindowControls, observeWindowState } = require("./window-controls.cjs");

const root = path.resolve(__dirname, "..");
const runtimeIcon = path.join(root, 'build', process.platform === 'darwin' ? 'icon-mac.png' : process.platform === 'win32' ? 'icon.ico' : 'icon.png');
const catalog = require("../pack/catalog.json");
const { editionFor } = require("./edition.cjs");
const edition = editionFor({packaged:app.isPackaged,metadata:require('../package.json'),argv:process.argv});
let mainWindow, serverController, quitting = false, quitPending = false;
// Preserve existing settings and accounts across the product rename.
app.setPath('userData', path.join(app.getPath('appData'), edition === 'server' ? 'minecraft-mini-launcher-server' : 'Minecraft Mini Launcher'));
const ownsInstance = app.requestSingleInstanceLock();
if (!ownsInstance) app.quit();
app.on('second-instance',()=>{if(mainWindow){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.focus();}});

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

let engine, engineRoot;
function getEngine() {
  const folder = instanceRoot();
  if (!engine || engineRoot !== folder) {
    engine?.close();
    fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
    const config = require('../build/engine-config.json');
    const resources = app.isPackaged ? path.join(process.resourcesPath, 'backend') : path.join(root, 'runtime', 'backend', process.platform);
    const binary = engineExecutable(resources);
    engine = createEngineController({ file: binary, dataRoot: folder, clientId: process.env.MINI_MICROSOFT_CLIENT_ID || config.microsoftClientId || '' });
    engineRoot = folder;
    engine.on('state', state => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('engine:state', state); });
  }
  return engine;
}

async function status() {
  const engineState = await getEngine().status();
  const folder = packFolder();
  const manifestPath = path.join(folder, "manifest.json");
  let manifest = null;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch { /* No private pack generated yet. */ }
  return {
    appName: "Mini Launcher",
    edition,
    catalog,
    engine: engineState,
    instanceRoot: instanceRoot(),
    instances: engineState.instances,
    pack: {
      present: Boolean(manifest && fs.existsSync(path.join(folder, manifest.pack))),
      filename: manifest?.pack || null,
      officialDownloads: manifest?.officialDownloads || 0,
      localMods: manifest?.localMods?.length || 0,
      contents: manifest?.contents || null,
      knownGaps: manifest?.knownGaps || [],
      private: manifest?.distribution === "private-local-test-only",
    },
  };
}

async function launchClient(instanceId, serverAddress) {
  const current = await status();
  if (!current.engine.available) throw new Error('游戏组件暂时不可用。');
  if (!current.instances.some(item => item.id === instanceId)) throw new Error('游戏尚未安装。');
  return getEngine().launch(instanceId, serverAddress);
}

async function requestQuit() {
  if(quitPending)return;quitPending=true;
  try{
    const result=await dialog.showMessageBox(mainWindow,{type:'question',title:'Stop servers before quitting?',message:'The server must finish saving before mini closes.',buttons:['Keep open','Save, stop and quit'],defaultId:0,cancelId:0});
    if(result.response===1){await serverController.shutdown();quitting=true;app.quit();}
  }catch(error){dialog.showErrorBox('Server is still active',error.message);}finally{quitPending=false;}
}

function createWindow() {
  const window = new BrowserWindow({
    ...windowChromeOptions(process.platform),
    width: 1300,
    height: 840,
    minWidth: 1280,
    minHeight: 680,
    backgroundColor: "#ece9df",
    icon: runtimeIcon,
    title: edition === 'server' ? 'Mini Launcher — Server' : 'Mini Launcher',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: [`--mini-edition=${edition}`],
    },
  });
  mainWindow=window;
  window.on('page-title-updated',event=>{event.preventDefault();window.setTitle(edition==='server'?'Mini Launcher — Server':'Mini Launcher');});
  window.on('close',event=>{if(!quitting&&serverController?.hasActive()){event.preventDefault();requestQuit();}});
  window.on('closed',()=>{mainWindow=null;});
  if (process.platform !== "darwin") window.setMenu(null);
  observeWindowState(window);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  if (process.env.MINI_LAUNCHER_DEV_URL) window.loadURL(process.env.MINI_LAUNCHER_DEV_URL);
  else window.loadFile(path.join(root, "dist", "index.html"));
}

app.whenReady().then(async () => {
  if(!ownsInstance)return;
  // Packaged Mac apps use their original multi-resolution ICNS through Launch
  // Services. Replacing it with a PNG loses the native small-icon artwork.
  if(process.platform==='darwin' && !app.isPackaged)app.dock.setIcon(runtimeIcon);
  registerWindowControls(ipcMain, BrowserWindow);
  ipcMain.handle("launcher:status", () => status());
  ipcMain.handle("launcher:verify", () => {
    const folder = packFolder();
    const manifestPath = path.join(folder, "manifest.json");
    let name;
    try { name = JSON.parse(fs.readFileSync(manifestPath, "utf8")).pack; }
    catch { return { ok: false, message: "Local modpack not found." }; }
    return verifyPack(path.join(folder, name), manifestPath);
  });
  ipcMain.handle("launcher:select-root", async event => {
    assertEngineSender(mainWindow, event);
    if (["login", "install", "launch", "playing"].includes(getEngine().state().phase)) throw new Error("请等待当前操作完成。");
    const result = await dialog.showOpenDialog({ title: "Select game folder", properties: ["openDirectory", "createDirectory"] });
    if (result.canceled) return status();
    writeSettings({ ...readSettings(), instanceRoot: result.filePaths[0] });
    return status();
  });
  ipcMain.handle("launcher:install", async event => {
    assertEngineSender(mainWindow, event);
    const current = await status();
    if (!current.engine.available) throw new Error("游戏组件暂时不可用。");
    const folder = packFolder();
    const manifestPath = path.join(folder, "manifest.json");
    if (!current.pack.filename) throw new Error("The local modpack is not ready yet.");
    const pack = path.join(folder, current.pack.filename);
    const verification = verifyPack(pack, manifestPath);
    if (!verification.ok) throw new Error(verification.message);
    fs.mkdirSync(current.instanceRoot, { recursive: true });
    return getEngine().install(pack);
  });
  ipcMain.handle("launcher:play", (event, instanceId) => { assertEngineSender(mainWindow, event); return launchClient(instanceId); });
  registerEngineIpc(ipcMain, () => mainWindow, getEngine, shell);
  ipcMain.handle("launcher:open-pack-folder", () => shell.openPath(packFolder()));
  if(edition==='server'){
    const {createServerController}=require('./server-controller.cjs');
    serverController=await createServerController({app,ipcMain,dialog,shell,clipboard,getWindow:()=>mainWindow,root,status,launchClient});
  }
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}).catch(error=>{dialog.showErrorBox('mini could not start',error.message);quitting=true;app.quit();});

app.on('before-quit',event=>{if(!quitting&&serverController?.hasActive()){event.preventDefault();requestQuit();}});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

app.on("will-quit", () => engine?.close());
