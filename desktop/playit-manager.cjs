const fs=require('node:fs'),path=require('node:path'),readline=require('node:readline');
const {spawn,execFile}=require('node:child_process');const {promisify}=require('node:util');
const exec=promisify(execFile);
async function checkVersion(binary){
  if(!binary||!path.isAbsolute(binary)||!fs.existsSync(binary))throw new Error('Choose the official standalone playit 0.17.1 agent.');
  const {stdout}=await exec(binary,['version'],{windowsHide:true,timeout:10000});
  if(!/^0\.17\.1\s*$/m.test(stdout))throw new Error('This integration uses standalone playit 0.17.1. playit 1.x service management is not supported yet.');
}
class PlayitManager{
  constructor({directory,spawnAgent=spawn,checkVersion:versionCheck=checkVersion}){
    this.directory=directory;this.spawn=spawnAgent;this.checkVersion=versionCheck;this.child=null;this.status='stopped';this.logs=[];this.claimUrl=null;this.error=null;
    fs.mkdirSync(directory,{recursive:true,mode:0o700});try{this.config=JSON.parse(fs.readFileSync(path.join(directory,'settings.json'),'utf8'));}catch{this.config={binary:'',publicAddress:''};}
  }
  configure(input){
    if(this.child||this.status==='starting')throw new Error('Stop playit before changing its settings.');
    const next={...this.config};
    if(input.binary!==undefined){if(typeof input.binary!=='string'||!path.isAbsolute(input.binary))throw new Error('Invalid agent path.');next.binary=input.binary;}
    if(input.publicAddress!==undefined){if(typeof input.publicAddress!=='string'||(input.publicAddress&&!/^[a-zA-Z0-9.-]+(?::[0-9]{1,5})?$/.test(input.publicAddress)))throw new Error('Enter a server hostname with an optional port.');next.publicAddress=input.publicAddress;}
    this.config=next;fs.writeFileSync(path.join(this.directory,'settings.json'),JSON.stringify(next,null,2));return this.snapshot();
  }
  snapshot(){return {...this.config,status:this.status,logs:this.logs.slice(),claimUrl:this.claimUrl,error:this.error};}
  log(line){
    const claim=line.match(/https:\/\/playit\.gg\/claim\/[a-zA-Z0-9-]+/);if(claim)this.claimUrl=claim[0];
    if(/secret|token|authorization|login\/guest-account|playit\.gg\/claim\//i.test(line))line='Account setup information received. Use Link account to continue.';
    this.logs.push({time:new Date().toISOString(),message:line.replace(/\x1b\[[0-9;]*[a-zA-Z]/g,'').slice(0,1500)});if(this.logs.length>100)this.logs.shift();
  }
  async start(server){
    if(server.id!=='live'||server.status!=='running')throw new Error('The live server must be running before enabling public access.');
    if(this.child||this.status==='starting')throw new Error('playit is already running.');this.status='starting';this.error=null;this.claimUrl=null;
    try{
      await this.checkVersion(this.config.binary);
      const child=this.spawn(this.config.binary,['--secret_path',path.join(this.directory,'agent.toml'),'--stdout','start'],{cwd:this.directory,windowsHide:true,stdio:['ignore','pipe','pipe'],shell:false});this.child=child;this.status='running';
      this.exit=new Promise(resolve=>{child.once('error',e=>{this.error=e.message;});child.once('close',code=>{const stopped=this.status==='stopping';this.child=null;this.status=stopped?'stopped':'error';if(!stopped)this.error=this.error||`Agent exited (${code}).`;resolve();});});
      for(const stream of [child.stdout,child.stderr]){const reader=readline.createInterface({input:stream});reader.on('line',line=>this.log(line));child.once('close',()=>reader.close());}
      return this.snapshot();
    }catch(error){this.status='error';this.error=error.message;throw error;}
  }
  async stop(){
    if(this.status==='starting'&&!this.child)throw new Error('Wait for playit to finish starting.');
    if(this.child){this.status='stopping';this.child.kill();let timer;try{await Promise.race([this.exit,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('playit has not stopped yet.')),10000);})]);}finally{clearTimeout(timer);}}
    return this.snapshot();
  }
}
module.exports={PlayitManager};
