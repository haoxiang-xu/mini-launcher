const base = require('../package.json').build;

// Local UI/runtime verification can run before the private game pack exists.
// Production player/server builds retain their complete game-resource checks.
module.exports = {
  ...base,
  directories: { output: 'out/mac-preview' },
  extraMetadata: { miniEdition: 'player', miniLocalPreview: true },
  extraResources: [],
  files: [...base.files, '!desktop/server-*.cjs', '!desktop/playit-manager.cjs'],
  beforePack: context => require('./verify-engine.cjs').verifyEngineResources(context.electronPlatformName, context.arch),
  mac: { ...base.mac, identity: null, target: ['dir'] },
};
