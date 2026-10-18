const base = require('../package.json').build;

module.exports = {
  ...base,
  extraMetadata: { miniEdition: 'player' },
  beforePack: context => {
    require('./verify-resources.cjs').verifyResources('player');
    require('./verify-engine.cjs').verifyEngineResources(context.electronPlatformName, context.arch);
  },
  files: [...base.files, '!desktop/server-*.cjs', '!desktop/playit-manager.cjs'],
};
