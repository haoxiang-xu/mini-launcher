const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {verifyPack}=require('../desktop/core.cjs');
const {safeChild}=require('../desktop/server-manager.cjs');

function verifyResources(edition,root=path.resolve(__dirname,'..')){
  const client=path.join(root,'pack/local');
  const result=verifyPack(path.join(client,'Mini-Local-26.3.mrpack'),path.join(client,'manifest.json'));
  if(!result.ok)throw new Error(result.message);
  if(edition!=='server')return;
  const folder=path.join(root,'pack/server-local');
  if(!fs.existsSync(path.join(folder,'manifest.json')))throw new Error('Generate the server bundle before packaging.');
  const manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json')));
  if(!Array.isArray(manifest.files)||!manifest.files.some(f=>f.path==='server-launch.jar'))throw new Error('Incomplete server bundle.');
  const listed=new Set();
  for(const file of manifest.files){
    if(file.path!=='server-launch.jar'&&!/^mods\/[^/\\]+\.jar$/.test(file.path))throw new Error('Unexpected server bundle file.');
    const target=safeChild(folder,file.path);
    if(fs.lstatSync(target).isSymbolicLink())throw new Error('Linked server resources are not supported.');
    if(crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')!==file.sha256)throw new Error(`Server resource verification failed: ${file.path}`);
    listed.add(file.path);
  }
  const mods=path.join(folder,'mods');
  if(fs.existsSync(mods))for(const name of fs.readdirSync(mods))if(name.endsWith('.jar')&&!listed.has(`mods/${name}`))throw new Error(`Unlisted server resource: ${name}`);
}
module.exports={verifyResources};
