const { EventEmitter } = require('node:events');
const { createEngineClient, engineError } = require('./engine-client.cjs');

function assertEngineSender(window, event) {
  if (!window || window.isDestroyed() || event.sender !== window.webContents || event.senderFrame !== event.sender.mainFrame)
    throw new Error('Game controls are unavailable to this window.');
}
function allowedAuthorizationUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      ['www.microsoft.com', 'microsoft.com', 'login.microsoftonline.com', 'login.live.com'].includes(url.hostname);
  } catch { return false; }
}

function createEngineController({ file, dataRoot, clientId = '', clientFactory = createEngineClient }) {
  const events = new EventEmitter();
  const client = clientFactory({ file, args: ['--mini-backend', '--dir', dataRoot], env: {
    ...process.env, QT_QPA_PLATFORM: 'offscreen', MINI_MICROSOFT_CLIENT_ID: clientId,
  } });
  let current = { available: false, phase: 'connecting', accounts: [], instances: [], loginConfigured: !!clientId, authorization: null, progress: null, error: '' };
  const publish = update => { current = { ...current, ...update }; events.emit('state', events.state()); };
  function acceptStatus(status) {
    publish({ available: true, loginConfigured: !!status.loginConfigured,
      accounts: (status.accounts || []).map(account => ({ id: account.id, name: account.name, ownsMinecraft: !!account.ownsMinecraft })),
      instances: (status.instances || []).map(instance => ({ id: instance.id, name: instance.name })),
      ...(current.phase === 'connecting' ? { phase: 'idle' } : {}),
    });
  }
  client.on('event', event => {
    if (event.event === 'authorize' && allowedAuthorizationUrl(event.url) && typeof event.code === 'string')
      publish({ authorization: { url: event.url, code: event.code, expiresIn: event.expiresIn } });
    else if (event.event === 'progress') publish({ progress: { current: event.current, total: event.total } });
    else if (event.event === 'running') publish({ phase: 'playing', progress: null });
    else if (event.event === 'interaction-required') publish({ error: '准备游戏时需要额外设置，请取消后重试。' });
  });
  client.on('stopped', () => publish({ available: false, phase: 'error', authorization: null, error: '游戏组件已停止，请重新打开 Mini。' }));
  events.state = () => structuredClone(current);
  events.status = async () => {
    try { acceptStatus(await client.request('status')); }
    catch { publish({ available: false, phase: 'error', error: '游戏组件暂时无法启动，请重新打开 Mini。' }); }
    return events.state();
  };
  async function run(phase, method, params) {
    if (['login', 'install', 'launch', 'playing'].includes(current.phase)) throw engineError('BUSY', '请等待当前操作完成。');
    publish({ phase, error: '', authorization: null, progress: null });
    try {
      const result = await client.request(method, params, { timeout: method === 'instance.launch' ? 7 * 24 * 60 * 60_000 : method === 'auth.login' ? 15 * 60_000 : 60 * 60_000 });
      acceptStatus(result);
      publish({ phase: 'idle', authorization: null, progress: null });
      return { ok: true };
    } catch (error) {
      const message = error.code === 'CANCELLED' ? '' : error.code === 'CLIENT_ID_REQUIRED' ? '微软登录尚未配置。' : error.code === 'LOGIN_REQUIRED' ? '请先登录微软账号。' : error.code === 'OWNERSHIP_REQUIRED' ? '此账号需要拥有 Minecraft Java 版。' : '操作未完成，请检查网络和游戏文件后重试。';
      publish({ phase: 'idle', authorization: null, progress: null, error: message });
      throw engineError(error.code, message || '操作已取消。');
    }
  }
  events.login = () => current.loginConfigured ? run('login', 'auth.login', {}) : Promise.reject(engineError('CLIENT_ID_REQUIRED', '微软登录尚未配置。'));
  events.logout = async accountId => {
    if (['login', 'install', 'launch', 'playing'].includes(current.phase)) throw engineError('BUSY', '请等待当前操作完成。');
    acceptStatus(await client.request('auth.logout', { accountId }));
    publish({ error: '' });
    return { ok: true };
  };
  events.install = packPath => run('install', 'instance.import', { path: packPath });
  events.launch = (instanceId, serverAddress) => run('launch', 'instance.launch', { instanceId, serverAddress, accountId: current.accounts.find(account => account.ownsMinecraft)?.id || current.accounts[0]?.id || '' });
  events.cancel = () => current.phase === 'playing' ? Promise.reject(new Error('请在游戏中正常退出。')) : client.request('cancel');
  events.authorizationUrl = () => current.authorization && allowedAuthorizationUrl(current.authorization.url) ? current.authorization.url : null;
  events.close = () => current.phase === 'playing' ? client.detach() : client.close();
  return events;
}

function registerEngineIpc(ipcMain, getWindow, getEngine, shell) {
  const handle = (name, operation) => ipcMain.handle(`engine:${name}`, (event, ...args) => {
    assertEngineSender(getWindow(), event); return operation(...args);
  });
  handle('login', () => getEngine().login());
  handle('logout', accountId => getEngine().logout(accountId));
  handle('cancel', () => getEngine().cancel());
  handle('open-authorization', () => { const url = getEngine().authorizationUrl(); if (!url) throw new Error('登录链接已失效。'); return shell.openExternal(url); });
}
module.exports = { createEngineController, registerEngineIpc, allowedAuthorizationUrl, assertEngineSender };
