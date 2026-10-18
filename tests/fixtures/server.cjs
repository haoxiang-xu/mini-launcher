const fs=require('node:fs'),net=require('node:net'),readline=require('node:readline');
const props=Object.fromEntries(fs.readFileSync('server.properties','utf8').split('\n').map(l=>l.split('=')));
const server=net.createServer(s=>s.end());
server.listen(Number(props['server-port']),props['server-ip'],()=>console.log('[Server thread/INFO]: Done (0.1s)! For help, type "help"'));
readline.createInterface({input:process.stdin}).on('line',line=>{
  if(line==='stop') {fs.mkdirSync('world',{recursive:true});fs.writeFileSync('world/level.dat','saved'); console.log('Saving chunks'); server.close(()=>process.exit(0));}
  else console.log('Command: '+line);
});
