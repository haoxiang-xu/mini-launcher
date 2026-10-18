const fs=require('node:fs'),path=require('node:path');
const {checkJava}=require('./server-manager.cjs');

async function findServerJava(env=process.env) {
  const binary=process.platform==='win32'?'java.exe':'java';
  const candidates=new Set();
  if(env.JAVA_HOME)candidates.add(path.join(env.JAVA_HOME,'bin',binary));
  for(const folder of (env.PATH||'').split(path.delimiter))if(path.isAbsolute(folder))candidates.add(path.join(folder,binary));
  const home=env.USERPROFILE||env.HOME||'';
  const roots=[path.join(home,'.jdks'),path.join(home,'.gradle','jdks'),path.join(home,'Library','Application Support','minecraft','runtime'),'/Library/Java/JavaVirtualMachines','/usr/lib/jvm'];
  if(env.APPDATA)roots.push(path.join(env.APPDATA,'.minecraft','runtime'),path.join(env.APPDATA,'PrismLauncher','java'));
  if(env.LOCALAPPDATA){
    roots.push(path.join(env.LOCALAPPDATA,'Programs','Eclipse Adoptium'));
    const packages=path.join(env.LOCALAPPDATA,'Packages');
    try{for(const entry of fs.readdirSync(packages))if(entry.startsWith('Microsoft.4297127D64EC6_'))roots.push(path.join(packages,entry,'LocalCache','Local','runtime'));}catch{}
  }
  let visited=0;
  function walk(folder,depth=0){
    if(depth>8||visited++>800)return;
    let entries;try{entries=fs.readdirSync(folder,{withFileTypes:true});}catch{return;}
    for(const entry of entries){if(entry.isSymbolicLink())continue;const file=path.join(folder,entry.name);if(entry.isFile()&&entry.name===binary)candidates.add(file);else if(entry.isDirectory()&&!['lib','legal','jmods','include'].includes(entry.name))walk(file,depth+1);}
  }
  for(const folder of roots)walk(folder);
  for(const file of candidates){if(!fs.existsSync(file))continue;try{await checkJava(file);return file;}catch{}}
  return '';
}
module.exports={findServerJava};
