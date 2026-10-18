const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const patch = path.join(root, 'patches', 'mini-ui-background-frame.patch');

function applyMiniUiPatch(directory = path.join(root, 'vendor', 'mini-ui')) {
  if (!fs.existsSync(path.join(directory, 'src'))) {
    throw new Error('Mini UI is missing. Run git submodule update --init --recursive, then npm ci.');
  }
  const git = args => {
    const result = spawnSync('git', ['-C', directory, 'apply', ...args, patch], { encoding: 'utf8', windowsHide: true });
    if (result.error) throw result.error;
    return result;
  };
  if (git(['--reverse', '--check']).status === 0) return 'Mini UI patch already applied.';
  const check = git(['--check']);
  if (check.status !== 0) throw new Error(`Mini UI patch does not match this checkout; local changes were preserved.\n${check.stderr}`);
  const result = git([]);
  if (result.status !== 0) throw new Error(result.stderr || 'Could not apply Mini UI patch.');
  return 'Mini UI background patch applied.';
}

if (require.main === module) {
  try { console.log(applyMiniUiPatch()); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { applyMiniUiPatch };
