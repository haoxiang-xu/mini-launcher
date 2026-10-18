const base = require('../package.json').build;

module.exports = {
  ...base,
  appId: 'studio.mini.minecraftlauncher.server',
  productName: 'mini Server',
  directories: { output: 'release/server' },
  extraMetadata: { miniEdition: 'server' },
  beforePack: () => require('./verify-resources.cjs').verifyResources('server'),
  extraResources: [
    ...base.extraResources,
    { from: 'pack/server-local', to: 'server-pack', filter: ['manifest.json', 'server-launch.jar', 'mods/*.jar'] },
  ],
  win: { ...base.win, artifactName: 'Minecraft-Mini-Server-${version}-Setup.${ext}' },
  mac: { ...base.mac, artifactName: 'Minecraft-Mini-Server-${version}-${arch}.${ext}' },
};
