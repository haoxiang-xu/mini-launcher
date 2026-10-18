const { app, BrowserWindow, dialog, ipcMain, shell, clipboard } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { isPrismExecutable, readInstances, verifyPack, prismArgs } = require("./core.cjs");
const { createPrismDetector } = require("./prism-discovery.cjs");
const { windowChromeOptions, registerWindowControls, observeWindowState } = require("./window-controls.cjs");

const root = path.resolve(__dirname, "..");
const catalog = require("../pack/catalog.json");
const detectPrism = createPrismDetector();
const { editionFor } = require("./edition.cjs");
const edition = editionFor({packaged:app.isPackaged,metadata:require('../package.json'),argv:process.argv});
let mainWindow, serverController, quitting = false, quitPending = false;
if (edition === 'server') app.setPath('userData', path.join(app.getPath('appData'), 'minecraft-mini-launcher-server'));
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

async function status(refreshPrism = false) {
  const settings = readSettings();
  const prism = await detectPrism(settings.prismPath, { refresh: refreshPrism });
  const folder = packFolder();
  const manifestPath = path.join(folder, "manifest.json");
  let manifest = null;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch { /* No private pack generated yet. */ }
  return {
    appName: "Minecraft Mini Launcher",
    edition,
    catalog,
    prismPath: prism.path,
    prismDetection: prism.source,
    instanceRoot: instanceRoot(settings),
    instances: readInstances(instanceRoot(settings)),
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

function startPrism(binary, args) {
  return new Promise((resolve,reject)=>{
    const child = spawn(binary, args, { detached: true, stdio: "ignore", windowsHide: false });
    child.once('error',reject);
    child.once('spawn',()=>{child.unref();resolve({ok:true,message:'Sent to Prism Launcher.'});});
  });
}

async function launchClient(instanceId, serverAddress) {
  const current=await status();
  if(!current.prismPath)throw new Error('Choose Prism Launcher in Settings first.');
  if(!current.instances.some(i=>i.id===instanceId))throw new Error('No installed game instance found.');
  return startPrism(current.prismPath,prismArgs(current.instanceRoot,'launch',instanceId,serverAddress));
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
    minWidth: 1000,
    minHeight: 680,
    backgroundColor: "#ece9df",
    icon: path.join(root, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    title: edition === 'server' ? 'Minecraft Mini Launcher — Server' : 'Minecraft Mini Launcher',
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
  window.on('page-title-updated',event=>{event.preventDefault();window.setTitle(edition==='server'?'Minecraft Mini Launcher — Server':'Minecraft Mini Launcher');});
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
  if(process.platform==='darwin')app.dock.setIcon(path.join(root,'build','icon.png'));
  registerWindowControls(ipcMain, BrowserWindow);
  ipcMain.handle("launcher:status", () => status());
  ipcMain.handle("launcher:detect-prism", () => status(true));
  ipcMain.handle("launcher:verify", () => {
    const folder = packFolder();
    const manifestPath = path.join(folder, "manifest.json");
    let name;
    try { name = JSON.parse(fs.readFileSync(manifestPath, "utf8")).pack; }
    catch { return { ok: false, message: "Local modpack not found." }; }
    return verifyPack(path.join(folder, name), manifestPath);
  });
  ipcMain.handle("launcher:select-prism", async () => {
    const result = await dialog.showOpenDialog({ title: "Select Prism Launcher", properties: ["openFile"] });
    if (result.canceled) return status();
    const selected = result.filePaths[0];
    if (!isPrismExecutable(selected)) throw new Error("Select the Prism Launcher executable.");
    writeSettings({ ...readSettings(), prismPath: selected });
    return status();
  });
  ipcMain.handle("launcher:select-root", async () => {
    const result = await dialog.showOpenDialog({ title: "Select game folder", properties: ["openDirectory", "createDirectory"] });
    if (result.canceled) return status();
    writeSettings({ ...readSettings(), instanceRoot: result.filePaths[0] });
    return status();
  });
  ipcMain.handle("launcher:install", async () => {
    const current = await status();
    if (!current.prismPath) throw new Error("Prism Launcher was not found. Install it or choose its location in Settings.");
    const folder = packFolder();
    const manifestPath = path.join(folder, "manifest.json");
    if (!current.pack.filename) throw new Error("The local modpack is not ready yet.");
    const pack = path.join(folder, current.pack.filename);
    const verification = verifyPack(pack, manifestPath);
    if (!verification.ok) throw new Error(verification.message);
    fs.mkdirSync(current.instanceRoot, { recursive: true });
    return startPrism(current.prismPath, prismArgs(current.instanceRoot, "import", pack));
  });
  ipcMain.handle("launcher:play", (_, instanceId) => launchClient(instanceId));
  ipcMain.handle("launcher:download-prism", () => shell.openExternal("https://prismlauncher.org/download/"));
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
