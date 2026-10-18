function editionFor({packaged,metadata,argv}) {
  return (packaged ? metadata.miniEdition==='server' : argv.includes('--server')) ? 'server' : 'player';
}
function assertServerAccess(edition,window,event) {
  if(edition!=='server')throw new Error('This action requires the server edition.');
  if(!window||window.isDestroyed()||event.sender!==window.webContents||event.senderFrame!==event.sender.mainFrame)throw new Error('Server controls are unavailable to this window.');
}
module.exports={editionFor,assertServerAccess};
