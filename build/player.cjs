const base = require('../package.json').build;

module.exports = {
  ...base,
  extraMetadata: { miniEdition: 'player' },
  beforePack: () => require('./verify-resources.cjs').verifyResources('player'),
  files: [...base.files, '!desktop/server-*.cjs', '!desktop/playit-manager.cjs'],
};
