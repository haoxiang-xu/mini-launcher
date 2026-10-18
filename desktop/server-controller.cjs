const fs=require('node:fs'),path=require('node:path');
const {ServerManager,checkJava}=require('./server-manager.cjs');
const {PlayitManager}=require('./playit-manager.cjs');
const {findServerJava}=require('./server-java.cjs');
const {assertServerAccess}=require('./edition.cjs');

async function createServerController({app,ipcMain,dialog,shell,clipboard,getWindow,root,status,launchClient}) {
  const bundleDir=app.isPackaged?path.join(process.resourcesPath,'server-pack'):path.join(root,'pack/server-local');
  const javaPath=await findServerJava();
  const manager=new ServerManager({baseDir:path.join(app.getPath('userData'),'Servers'),bundleDir,javaPath});
  const playit=new PlayitManager({directory:path.join(app.getPath('userData'),'Playit')});
  const snapshot=()=>({profiles:manager.list(),playit:playit.snapshot(),bundleReady:fs.existsSync(path.join(bundleDir,'manifest.json')),minecraft:'26.3',javaMajor:25});
  const handle=(name,fn)=>ipcMain.handle(`server:${name}`,async(event,...args)=>{assertServerAccess('server',getWindow(),event);return fn(...args);});
  handle('status',snapshot);
  handle('prepare',id=>manager.prepare(id));
  handle('configure',(id,settings)=>manager.configure(id,settings));
  handle('select-java',async id=>{
    manager.get(id);
    const result=await dialog.showOpenDialog(getWindow(),{title:'Choose Java 25 or newer',properties:['openFile']});
    if(!result.canceled){await checkJava(result.filePaths[0]);await manager.configure(id,{javaPath:result.filePaths[0]});}
    return snapshot();
  });
  handle('start',async(id,accepted)=>{if(accepted===true)manager.acceptEula(id);return manager.start(id);});
  handle('stop',async id=>{if(id==='live')await playit.stop();return manager.stop(id);});
  handle('restart',async id=>{if(id==='live')await playit.stop();await manager.stop(id);return manager.start(id);});
  handle('command',(id,line)=>manager.command(id,line));
  handle('backup',async id=>({path:await manager.backup(id)}));
  handle('open-folder',id=>shell.openPath(manager.get(id).directory));
  handle('copy-address',id=>{clipboard.writeText(manager.get(id).address);return true;});
  handle('join',async(id,instanceId)=>{
    const server=manager.get(id);if(server.status!=='running')throw new Error('Wait for the server to be ready.');
    const client=await status();
    if(!client.instances.some(i=>i.id===instanceId))throw new Error('Select an installed client instance.');
    const metadata=JSON.parse(fs.readFileSync(path.join(client.instanceRoot,'instances',instanceId,'mmc-pack.json'),'utf8'));
    if(!metadata.components?.some(c=>c.uid==='net.minecraft'&&c.version==='26.3'))throw new Error('Select a Minecraft 26.3 client instance with the matching mini modpack.');
    return launchClient(instanceId,server.address);
  });
  handle('eula',()=>shell.openExternal('https://www.minecraft.net/eula'));
  handle('playit-select',async()=>{
    const result=await dialog.showOpenDialog(getWindow(),{title:'Choose standalone playit 0.17.1',properties:['openFile']});
    if(!result.canceled)playit.configure({binary:result.filePaths[0]});return snapshot();
  });
  handle('playit-configure',input=>playit.configure({publicAddress:input.publicAddress}));
  handle('playit-start',()=>playit.start(manager.get('live')));
  handle('playit-stop',()=>playit.stop());
  handle('playit-download',()=>shell.openExternal('https://github.com/playit-cloud/playit-agent/releases/tag/v0.17.1'));
  handle('playit-link',()=>{
    const url=playit.snapshot().claimUrl;
    if(!url||!/^https:\/\/playit\.gg\/claim\/[a-zA-Z0-9-]+$/.test(url))throw new Error('Start playit to receive an account link.');return shell.openExternal(url);
  });
  handle('playit-dashboard',()=>shell.openExternal('https://playit.gg/account/tunnels'));
  handle('playit-copy',()=>{const address=playit.snapshot().publicAddress;if(!address)throw new Error('Save the public address from your playit dashboard first.');clipboard.writeText(address);return true;});
  return {manager,playit,hasActive:()=>manager.hasActive()||Boolean(playit.child)||playit.status==='starting',shutdown:async()=>{await playit.stop();await manager.shutdown();}};
}
module.exports={createServerController};
