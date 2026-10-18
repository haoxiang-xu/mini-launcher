const path = require('node:path');
const { verifyPrismBundle, prismBundleFolder } = require('../desktop/prism-bundle.cjs');

function verifyPrismResources(platform, root = path.resolve(__dirname, '..')) {
  return verifyPrismBundle(prismBundleFolder(root, platform, platform === 'win32' ? 'x64' : process.arch), platform);
}
module.exports = { verifyPrismResources };
