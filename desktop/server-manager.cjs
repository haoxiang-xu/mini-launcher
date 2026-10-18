const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const readline = require('node:readline');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);
const PROFILES = { 'local-test': {name:'Local test',port:25565}, live:{name:'Live server',port:25566} };
const ACTIVE = new Set(['preparing','starting','running','stopping','backing-up']);

async function checkJava(binary, minimum=25) {
  if (!binary || !path.isAbsolute(binary) || !fs.existsSync(binary)) throw new Error('Choose a Java executable first.');
  const {stdout,stderr}=await exec(binary,['-version'],{windowsHide:true,timeout:10000});
  const major=Number((stderr+'\n'+stdout).match(/version\s+"?(\d+)/)?.[1]);
  if (!major || major<minimum) throw new Error(`Java ${minimum} or newer is required.`);
  return major;
}
async function assertPortAvailable(port) {
  await new Promise((resolve,reject)=>{
    const probe=net.createServer();
    probe.once('error',()=>reject(new Error(`Port ${port} is in use or unavailable. Choose another port.`)));
    probe.listen({port,host:'127.0.0.1',exclusive:true},()=>probe.close(resolve));
  });
}
function safeChild(root, relative) {
  if(typeof relative!=='string'||!relative||relative.includes('\\')||relative.split('/').some(s=>!s||s==='.'||s==='..')||path.isAbsolute(relative))throw new Error('Unsafe bundle path.');
  const target=path.resolve(root,relative);
  if(!target.startsWith(path.resolve(root)+path.sep))throw new Error('Unsafe bundle path.');
  return target;
}
async function noLinks(folder) {
  const stat=await fsp.lstat(folder);
  if(stat.isSymbolicLink())throw new Error('Linked files are not supported in server profiles.');
  if(stat.isDirectory())for(const entry of await fsp.readdir(folder))await noLinks(path.join(folder,entry));
}

class ServerManager {
  constructor({baseDir,bundleDir,javaPath='',spawnServer=spawn,checkJava:javaCheck=checkJava,stopTimeout=60000}) {
    this.baseDir=path.resolve(baseDir);this.bundleDir=bundleDir;this.spawnServer=spawnServer;this.checkJava=javaCheck;this.stopTimeout=stopTimeout;this.profiles=new Map();
    fs.mkdirSync(this.baseDir,{recursive:true});
    for(const [id,defaults] of Object.entries(PROFILES)) {
      const directory=path.join(this.baseDir,id);fs.mkdirSync(directory,{recursive:true});
      if(fs.lstatSync(directory).isSymbolicLink())throw new Error('Linked server profile directories are not supported.');
      let saved={};try{saved=JSON.parse(fs.readFileSync(path.join(directory,'mini-server.json'),'utf8'));}catch{}
      this.profiles.set(id,{id,name:defaults.name,directory,port:defaults.port,memoryMb:4096,javaPath,...this.validSettings(saved),status:'stopped',logs:[],child:null,exit:null,error:null});
    }
  }
  validSettings(input) {
    const out={};
    if(input.port!==undefined){if(!Number.isInteger(input.port)||input.port<1024||input.port>65535)throw new Error('Port must be between 1024 and 65535.');out.port=input.port;}
    if(input.memoryMb!==undefined){if(!Number.isInteger(input.memoryMb)||input.memoryMb<1024||input.memoryMb>65536)throw new Error('Memory must be between 1024 and 65536 MB.');out.memoryMb=input.memoryMb;}
    if(input.javaPath!==undefined){if(typeof input.javaPath!=='string'||(input.javaPath&&!path.isAbsolute(input.javaPath)))throw new Error('Invalid Java path.');out.javaPath=input.javaPath;}
    return out;
  }
  profile(id){const p=this.profiles.get(id);if(!p)throw new Error('Unknown server profile.');return p;}
  eula(p){try{return /^eula=true\s*$/m.test(fs.readFileSync(path.join(p.directory,'eula.txt'),'utf8'));}catch{return false;}}
  get(id){const p=this.profile(id);return {id:p.id,name:p.name,directory:p.directory,port:p.port,memoryMb:p.memoryMb,javaPath:p.javaPath,status:p.status,address:`127.0.0.1:${p.port}`,prepared:fs.existsSync(path.join(p.directory,'mini-install.json')),eulaAccepted:this.eula(p),logs:p.logs.slice(),error:p.error};}
  list(){return [...this.profiles.keys()].map(id=>this.get(id));}
  hasActive(){return [...this.profiles.values()].some(p=>ACTIVE.has(p.status)||p.child);}
  log(p,message){p.logs.push({time:new Date().toISOString(),message:String(message).replace(/\x1b\[[0-9;]*[a-zA-Z]/g,'').slice(0,3000)});if(p.logs.length>400)p.logs.splice(0,p.logs.length-400);}
  async configure(id,input){const p=this.profile(id);if(ACTIVE.has(p.status)||p.child)throw new Error('Stop the running server before changing its settings.');Object.assign(p,this.validSettings(input));fs.writeFileSync(path.join(p.directory,'mini-server.json'),JSON.stringify({port:p.port,memoryMb:p.memoryMb,javaPath:p.javaPath},null,2));return this.get(id);}
  acceptEula(id){const p=this.profile(id);if(ACTIVE.has(p.status))throw new Error('Server is busy.');fs.writeFileSync(path.join(p.directory,'eula.txt'),'# Accepted by the host through Mini Launcher\neula=true\n');return this.get(id);}
  async prepare(id){
    const p=this.profile(id);if(ACTIVE.has(p.status)||p.child)throw new Error('Server is already busy.');p.status='preparing';p.error=null;
    try{
      const manifest=JSON.parse(await fsp.readFile(path.join(this.bundleDir,'manifest.json'),'utf8'));
      if(!Array.isArray(manifest.files)||!manifest.files.some(f=>f.path==='server-launch.jar'))throw new Error('Server bundle is incomplete.');
      for(const item of manifest.files){
        const src=safeChild(this.bundleDir,item.path);await noLinks(src);
        const bytes=await fsp.readFile(src);
        if(!/^[a-f0-9]{64}$/i.test(item.sha256)||crypto.createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw new Error(`Bundle verification failed: ${item.path}`);
      }
      await noLinks(p.directory);
      for(const item of manifest.files){
        const dest=safeChild(p.directory,item.path);
        if(fs.existsSync(dest)){
          const hash=crypto.createHash('sha256').update(await fsp.readFile(dest)).digest('hex');
          if(hash!==item.sha256)throw new Error(`Existing file differs: ${item.path}. Keep a backup and review it before updating.`);
        }else{await fsp.mkdir(path.dirname(dest),{recursive:true});await fsp.copyFile(safeChild(this.bundleDir,item.path),dest);}
      }
      await fsp.writeFile(path.join(p.directory,'mini-install.json'),JSON.stringify(manifest,null,2));
      this.log(p,`Prepared Minecraft ${manifest.minecraft}. World files preserved.`);p.status='stopped';return this.get(id);
    }catch(error){p.status='error';p.error=error.message;throw error;}
  }
  writeProperties(p){
    const file=path.join(p.directory,'server.properties');let existing='';try{existing=fs.readFileSync(file,'utf8');}catch{}
    const managed={'server-ip':'127.0.0.1','server-port':p.port,'online-mode':'true','enable-rcon':'false','enable-query':'false','level-name':'world'};
    const lines=existing.split(/\r?\n/).filter(line=>!Object.hasOwn(managed,line.split('=')[0].trim()));
    if(!existing)lines.push('motd=mini server','view-distance=10','simulation-distance=6','max-players=20','spawn-protection=0');
    lines.push(...Object.entries(managed).map(([k,v])=>`${k}=${v}`));fs.writeFileSync(file,lines.join('\n')+'\n');
  }
  async start(id){
    const p=this.profile(id);if(ACTIVE.has(p.status)||p.child)throw new Error('Server is already starting or running.');
    if(!this.eula(p))throw new Error('Read and accept the Minecraft EULA before starting.');
    if(!this.get(id).prepared)throw new Error('Prepare this server first.');p.status='starting';p.error=null;
    try{
      await this.checkJava(p.javaPath,25);await assertPortAvailable(p.port);this.writeProperties(p);
      const child=this.spawnServer(p.javaPath,['-Xms512M',`-Xmx${p.memoryMb}M`,'-jar','server-launch.jar','nogui'],{cwd:p.directory,windowsHide:true,stdio:['pipe','pipe','pipe'],shell:false});p.child=child;
      this.log(p,`Starting ${p.name} at 127.0.0.1:${p.port}`);
      p.exit=new Promise(resolve=>{
        child.once('error',error=>{p.error=error.message;this.log(p,error.message);});
        child.once('close',(code)=>{const clean=p.status==='stopping'&&code===0;p.child=null;p.status=clean||code===0?'stopped':'error';if(p.status==='error')p.error=p.error||`Server exited (${code}). Check the console.`;this.log(p,clean?'Server saved and stopped.':`Server exited (${code}).`);resolve();});
      });
      child.stdin.on('error',error=>this.log(p,error.message));
      for(const stream of [child.stdout,child.stderr]){
        const reader=readline.createInterface({input:stream});
        reader.on('line',line=>{this.log(p,line);if(p.status==='starting'&&/Done \([^)]*\)!/.test(line))p.status='running';});
        child.once('close',()=>reader.close());
      }
      return this.get(id);
    }catch(error){p.status='error';p.error=error.message;this.log(p,error.message);throw error;}
  }
  async command(id,line){
    if(typeof line!=='string'||!line.trim()||/[\r\n\0]/.test(line)||line.length>500)throw new Error('Enter a single line command (up to 500 characters).');
    if(line.trim().replace(/^\//,'')==='stop')return this.stop(id);
    const p=this.profile(id);if(p.status!=='running'||!p.child)throw new Error('Server is not ready.');
    p.child.stdin.write(line.trim().replace(/^\//,'')+'\n');return this.get(id);
  }
  async stop(id){
    const p=this.profile(id);if(!p.child){if(ACTIVE.has(p.status))throw new Error('Wait for the current operation to finish.');return this.get(id);}
    if(p.status!=='stopping'){p.status='stopping';p.child.stdin.write('stop\n');this.log(p,'Saving and stopping…');}
    let timer;try{await Promise.race([p.exit,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Still saving. The process was not force-killed; wait and retry.')),this.stopTimeout);})]);}finally{clearTimeout(timer);}
    return this.get(id);
  }
  async backup(id){
    const p=this.profile(id);if(ACTIVE.has(p.status)||p.child)throw new Error('Stop the server before making a consistent backup.');
    const world=path.join(p.directory,'world');if(!fs.existsSync(world))throw new Error('No world has been generated yet.');p.status='backing-up';
    try{await noLinks(world);const target=path.join(this.baseDir,'backups',id,new Date().toISOString().replace(/[:.]/g,'-'));await fsp.mkdir(target,{recursive:true});await fsp.cp(world,path.join(target,'world'),{recursive:true,errorOnExist:true,force:false});await fsp.copyFile(path.join(p.directory,'server.properties'),path.join(target,'server.properties'));this.log(p,`Backup saved: ${target}`);return target;}finally{p.status='stopped';}
  }
  async shutdown(){for(const p of this.profiles.values())if(p.child)await this.stop(p.id);if(this.hasActive())throw new Error('A server operation is still in progress.');}
}
module.exports={ServerManager,checkJava,assertPortAvailable,safeChild};
